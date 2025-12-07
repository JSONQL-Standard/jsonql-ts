import express from 'express';
// @ts-ignore
import { jsonqlExpress, SQLTranspiler, ResultHydrator } from '@jsonql-standard/jsonql-ts';
import sqlite3 from 'sqlite3';
import { open } from 'sqlite';
import fs from 'fs';
import path from 'path';

const app = express();
app.use(express.json());

// Setup DB
let db: any;
(async () => {
  db = await open({
    filename: ':memory:',
    driver: sqlite3.Database
  });

  // Load standard dataset
  const dataPath = path.join(__dirname, 'data.json');
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
      console.log(`Seeded table: ${tableName}`);
    }
  } else {
    // Fallback for basic test
    await db.exec(`
      CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT);
      INSERT INTO users (id, name) VALUES (1, 'Alice'), (2, 'Bob');
    `);
  }
})();

const transpiler = new SQLTranspiler('sqlite');
const hydrator = new ResultHydrator();

// Middleware
app.use(jsonqlExpress());

// Endpoint
app.all('/:resource', async (req: any, res: any) => {
  try {
    const resource = req.params.resource;
    const query = req.jsonql;
    
    // Handle case where middleware didn't find a query (e.g. simple GET without params)
    // For the purpose of this example, we only respond to valid JSONQL queries
    if (!query) {
        return res.status(400).json({ error: 'No JSONQL query found' });
    }

    const { sql, parameters } = transpiler.transpile(query, resource);
    
    const rows = await db.all(sql, parameters);
    const data = hydrator.hydrate(rows);
    
    res.json({ data });
  } catch (err: any) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

app.listen(3000, () => {
  console.log('Server running on http://localhost:3000');
});
