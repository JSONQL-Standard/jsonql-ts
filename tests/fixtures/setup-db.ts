import sqlite3 from 'sqlite3';
import { open, Database } from 'sqlite';
import * as fs from 'fs';
import * as path from 'path';

// Load standard data from jsonql-spec (assuming it's available or we copy it)
// For this implementation, I'll embed the data or read it if the path is known.
// Since we are in the workspace, I can read it from the absolute path provided in context.

const SPEC_DATA_PATH = path.resolve(__dirname, 'data/data.json');

export async function setupSQLiteDB(): Promise<Database> {
  const db = await open({
    filename: ':memory:', // Use in-memory DB for tests
    driver: sqlite3.Database,
  });

  let data: any;
  try {
    const content = fs.readFileSync(SPEC_DATA_PATH, 'utf-8');
    data = JSON.parse(content);
  } catch (e) {
    console.warn('Could not read spec data, using fallback empty data', e);
    data = {};
  }

  // Create Tables and Seed Data
  for (const [tableName, rows] of Object.entries(data)) {
    if (!Array.isArray(rows) || rows.length === 0) continue;

    // Infer schema from first row
    const firstRow = rows[0] as any;
    const columns = Object.keys(firstRow).map((key) => {
      const val = firstRow[key];
      let type = 'TEXT';
      if (typeof val === 'number') type = Number.isInteger(val) ? 'INTEGER' : 'REAL';
      if (typeof val === 'boolean') type = 'INTEGER'; // SQLite uses 0/1 for boolean
      return `${key} ${type}`;
    });

    await db.exec(`DROP TABLE IF EXISTS ${tableName}`);
    await db.exec(`CREATE TABLE ${tableName} (${columns.join(', ')})`);

    const placeholders = Object.keys(firstRow).map(() => '?').join(', ');
    const stmt = await db.prepare(
      `INSERT INTO ${tableName} (${Object.keys(firstRow).join(', ')}) VALUES (${placeholders})`,
    );

    for (const row of rows as any[]) {
      await stmt.run(Object.values(row));
    }
    await stmt.finalize();
  }

  return db;
}
