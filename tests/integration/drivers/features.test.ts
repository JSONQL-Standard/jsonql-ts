import * as fs from 'fs';
import * as path from 'path';
import sqlite3 from 'sqlite3';
import { open, Database } from 'sqlite';
import { SQLTranspiler } from '../../../src/transpiler';
import { JSONQLParser } from '../../../src/parser';
import { ResultHydrator } from '../../../src/hydrator';
import { JSONQLSchema } from '../../../src/types';

describe('JSONQL Feature Tests (Pagination & Aggregates)', () => {
  let db: Database;
  const parser = new JSONQLParser();
  const transpiler = new SQLTranspiler('sqlite');
  const hydrator = new ResultHydrator();

  const schema: JSONQLSchema = {
    tables: {
      users: {
      fields: {
        id: { type: 'number' },
        name: { type: 'string' },
        email: { type: 'string' },
        status: { type: 'string' },
        age: { type: 'number' },
        deleted_at: { type: 'string', nullable: true },
      },
      relations: {
        posts: { type: 'hasMany', target: 'posts', foreignKey: 'user_id' },
      },
    },
    posts: {
      fields: {
        id: { type: 'number' },
        user_id: { type: 'number' },
        title: { type: 'string' },
        views: { type: 'number' },
        published: { type: 'boolean' },
      },
      relations: {
        comments: { type: 'hasMany', target: 'comments', foreignKey: 'post_id' },
      },
    },
    comments: {
      fields: {
        id: { type: 'number' },
        post_id: { type: 'number' },
        user_id: { type: 'number' },
        content: { type: 'string' },
        approved: { type: 'boolean' },
      },
      relations: {},
    },
    },
  };

  beforeAll(async () => {
    // 1. Load Data
    const dataPath = path.resolve(__dirname, '../../fixtures/data/data.json');
    if (!fs.existsSync(dataPath)) {
      console.warn(`Data file not found at ${dataPath}, skipping feature tests.`);
      return;
    }
    const dataset = JSON.parse(fs.readFileSync(dataPath, 'utf-8'));

    // 2. Setup DB
    db = await open({
      filename: ':memory:',
      driver: sqlite3.Database,
    });

    // 3. Create Tables and Insert Data
    for (const [tableName, rows] of Object.entries(dataset)) {
      if (!Array.isArray(rows) || rows.length === 0) continue;

      const firstRow = rows[0] as any;
      const colDefs: string[] = [];
      const colNames: string[] = [];

      for (const [col, val] of Object.entries(firstRow)) {
        let colType = 'TEXT';
        if (typeof val === 'number') {
          colType = Number.isInteger(val) ? 'INTEGER' : 'REAL';
        } else if (typeof val === 'boolean') {
          colType = 'BOOLEAN';
        }
        colDefs.push(`${col} ${colType}`);
        colNames.push(col);
      }

      await db.exec(`CREATE TABLE ${tableName} (${colDefs.join(', ')})`);

      const placeholders = colNames.map(() => '?').join(', ');
      const stmt = await db.prepare(
        `INSERT INTO ${tableName} (${colNames.join(', ')}) VALUES (${placeholders})`,
      );

      for (const row of rows as any[]) {
        const values = colNames.map((c) => {
          const val = row[c];
          if (typeof val === 'object' && val !== null) return JSON.stringify(val);
          return val;
        });
        await stmt.run(values);
      }
      await stmt.finalize();
    }
  });

  afterAll(async () => {
    if (db) await db.close();
  });

  it('should support pagination in child includes (skip/limit/sort)', async () => {
    // Query: Get users and their top 2 posts sorted by views desc
    const query = {
      from: 'users',
      where: { id: 1 },
      include: {
        posts: {
          sort: '-views',
          limit: 1,
          skip: 0,
        },
      },
    };

    const parsed = parser.parse(query);
    const { sql, parameters } = transpiler.transpile(parsed, 'users', schema);
    const rows = await db.all(sql, parameters);
    const result = hydrator.hydrate(rows, schema, 'users');

    expect(result).toHaveLength(1);
    expect(result[0].id).toBe(1);
    expect(result[0].posts).toHaveLength(1);
    // User 1 has posts 101 (150 views) and 102 (300 views).
    // Sorted by views desc -> 102 should be first.
    expect(result[0].posts[0].id).toBe(102);
  });

  it('should support aggregates in child includes', async () => {
    // Query: Get users and count of their posts + sum of views
    const query = {
      from: 'users',
      where: { id: 1 },
      include: {
        posts: {
          aggregate: {
            count: { count: 'id' },
            total_views: { sum: 'views' },
          },
        },
      },
    };

    const parsed = parser.parse(query);
    const { sql, parameters } = transpiler.transpile(parsed, 'users', schema);
    const rows = await db.all(sql, parameters);
    const result = hydrator.hydrate(rows, schema, 'users');

    expect(result).toHaveLength(1);
    expect(result[0].id).toBe(1);
    // User 1 has 2 posts (150 + 300 = 450 views)
    expect(result[0].posts).toEqual({
      count: 2,
      total_views: 450,
    });
  });

  it('should support aggregates with filter in child includes', async () => {
    // Query: Get users and count of PUBLISHED posts
    const query = {
      from: 'users',
      where: { id: 1 },
      include: {
        posts: {
          where: { published: true },
          aggregate: {
            published_count: { count: 'id' },
          },
        },
      },
    };

    const parsed = parser.parse(query);
    const { sql, parameters } = transpiler.transpile(parsed, 'users', schema);
    const rows = await db.all(sql, parameters);
    const result = hydrator.hydrate(rows, schema, 'users');

    expect(result).toHaveLength(1);
    expect(result[0].posts).toEqual({
      published_count: 2, // Both posts are published
    });
  });
});
