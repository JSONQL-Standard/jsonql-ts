import { Controller, All, Req, Res, Param } from '@nestjs/common';
import { Request, Response } from 'express';
// @ts-ignore
import { SQLTranspiler, ResultHydrator } from '@jsonql-standard/jsonql-ts';
import sqlite3 from 'sqlite3';
import { open } from 'sqlite';
import * as fs from 'fs';
import * as path from 'path';

@Controller()
export class AppController {
  private db: any;
  private transpiler: any;
  private hydrator: any;

  constructor() {
    this.transpiler = new SQLTranspiler('sqlite');
    this.hydrator = new ResultHydrator();
    this.initDb();
  }

  async initDb() {
    this.db = await open({
      filename: ':memory:',
      driver: sqlite3.Database
    });

    // Load standard dataset
    let dataPath = path.join(__dirname, '../data.json');

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
        
        await this.db.exec(`DROP TABLE IF EXISTS ${tableName}`);
        await this.db.exec(`CREATE TABLE ${tableName} (${columns.join(', ')})`);
        
        const placeholders = Object.keys(firstRow).map(() => '?').join(', ');
        const stmt = await this.db.prepare(`INSERT INTO ${tableName} (${Object.keys(firstRow).join(', ')}) VALUES (${placeholders})`);
        
        for (const row of rows as any[]) {
            await stmt.run(Object.values(row));
        }
        await stmt.finalize();
        console.log(`Seeded table: ${tableName}`);
      }
    } else {
      // Fallback
      await this.db.exec(`
        CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT);
        INSERT INTO users (id, name) VALUES (1, 'Alice'), (2, 'Bob');
      `);
    }
  }

  @All(':resource')
  async handleRequest(@Param('resource') resource: string, @Req() req: Request, @Res() res: Response) {
    try {
      const query = (req as any).jsonql;
      
      if (!query) {
          return res.status(400).json({ error: 'No JSONQL query found' });
      }

      const { sql, parameters } = this.transpiler.transpile(query, resource);
      
      const rows = await this.db.all(sql, parameters);
      const data = this.hydrator.hydrate(rows);
      
      res.json({ data });
    } catch (err: any) {
      console.error(err);
      res.status(500).json({ error: err.message });
    }
  }
}
