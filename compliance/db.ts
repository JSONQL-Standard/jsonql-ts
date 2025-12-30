import { Pool } from 'pg';
import mysql from 'mysql2/promise';
import sqlite3 from 'sqlite3';
import { open } from 'sqlite';
import { SQLTranspiler } from '@jsonql-standard/jsonql-ts';

export interface DBAdapter {
  query(sql: string, params: any[]): Promise<any[]>;
  transpiler: SQLTranspiler;
  dialect: 'postgres' | 'mysql' | 'sqlite';
}

export async function initDB(): Promise<DBAdapter> {
  const DB_TYPE = process.env.DB_TYPE || 'sqlite';
  console.log(`Initializing DB connection for ${DB_TYPE}...`);

  if (DB_TYPE === 'postgres') {
    const pool = new Pool({
      connectionString: process.env.DB_DSN || 'postgresql://jsonql:password@localhost:5432/jsonql_test'
    });
    return {
      query: async (sql: string, params: any[]) => {
        const res = await pool.query(sql, params);
        return res.rows;
      },
      transpiler: new SQLTranspiler('postgres'),
      dialect: 'postgres'
    };
  } else if (DB_TYPE === 'mysql') {
    const connection = await mysql.createConnection({
      host: process.env.DB_HOST || 'localhost',
      user: process.env.DB_USER || 'jsonql',
      password: process.env.DB_PASSWORD || 'password',
      database: process.env.DB_NAME || 'jsonql_test'
    });
    return {
      query: async (sql: string, params: any[]) => {
        const [rows] = await connection.execute(sql, params);
        return rows as any[];
      },
      transpiler: new SQLTranspiler('mysql'),
      dialect: 'mysql'
    };
  } else {
    // SQLite
    const conn = await open({
      filename: process.env.DB_FILENAME || ':memory:',
      driver: sqlite3.Database
    });
    return {
      query: async (sql: string, params: any[]) => {
        return await conn.all(sql, params);
      },
      transpiler: new SQLTranspiler('sqlite'),
      dialect: 'sqlite'
    };
  }
}
