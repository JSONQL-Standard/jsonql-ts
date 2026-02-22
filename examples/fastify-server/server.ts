import Fastify, { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
// @ts-ignore
import { jsonqlFastify, SQLiteDriver } from '@jsonql-standard/jsonql-ts';
import sqlite3 from 'sqlite3';
import { open } from 'sqlite';
import fs from 'fs';
import path from 'path';

const fastify = Fastify({
  logger: true
});

// Start
const start = async () => {
  try {
    // Setup DB
    const db = await open({
      filename: ':memory:',
      driver: sqlite3.Database
    });

    // Load standard dataset
    let dataPath = path.join(__dirname, 'data.json');
    
    // 1. Check Environment Variable (CI/CD)
    if (process.env.JSONQL_DATA_PATH && fs.existsSync(process.env.JSONQL_DATA_PATH)) {
        dataPath = process.env.JSONQL_DATA_PATH;
    }
    // 2. Check Local Relative Path (Monorepo/Dev)
    else if (!fs.existsSync(dataPath)) {
        // Try to find it in the workspace relative path if running locally
        const specPath = path.resolve(__dirname, '../../../../jsonql-spec/tests/suites/standard/data.json');
        if (fs.existsSync(specPath)) {
            dataPath = specPath;
        }
    }

    if (fs.existsSync(dataPath)) {
      const dataset = JSON.parse(fs.readFileSync(dataPath, 'utf-8'));
      
      for (const [tableName, rows] of Object.entries(dataset)) {
        if (!Array.isArray(rows) || rows.length === 0) continue;
        
        // Infer columns from first row
        const firstRow = rows[0] as any;
        const columns = Object.keys(firstRow).map(key => {
            const val = firstRow[key];
            let type = 'TEXT';
            if (typeof val === 'number') type = Number.isInteger(val) ? 'INTEGER' : 'REAL';
            if (typeof val === 'boolean') type = 'INTEGER'; // SQLite uses 0/1
            return `${key} ${type}`;
        });
        
        await db.exec(`DROP TABLE IF EXISTS ${tableName}`);
        await db.exec(`CREATE TABLE ${tableName} (${columns.join(', ')})`);
        
        const placeholders = Object.keys(firstRow).map(() => '?').join(', ');
        const stmt = await db.prepare(`INSERT INTO ${tableName} (${Object.keys(firstRow).join(', ')}) VALUES (${placeholders})`);
        
        for (const row of rows as any[]) {
            await stmt.run(Object.values(row));
        }
        await stmt.finalize();
        fastify.log.info(`Seeded table: ${tableName}`);
      }
    } else {
      // Fallback for basic test
      await db.exec(`
        CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT);
        INSERT INTO users (id, name) VALUES (1, 'Alice'), (2, 'Bob');
      `);
    }

    // Register Plugin with Driver
    fastify.register(jsonqlFastify, {
      driver: new SQLiteDriver(db)
    });

    await fastify.listen({ port: 3000, host: '0.0.0.0' });
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};
start();
