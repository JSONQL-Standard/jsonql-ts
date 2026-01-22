import sqlite3 from 'sqlite3';
import { DatabaseDriver } from './types';

export class SQLiteDriver implements DatabaseDriver {
  dialect = 'sqlite' as const;
  private db: sqlite3.Database | null = null;
  private wrapperDb: any | null = null; // 'sqlite' package Database instance

  constructor(private connection: string | sqlite3.Database | any = ':memory:') {
    if (typeof connection !== 'string') {
      if (connection instanceof sqlite3.Database) {
        this.db = connection;
      } else {
        this.wrapperDb = connection;
      }
    }
  }

  async connect() {
    if (typeof this.connection === 'string') {
      return new Promise<void>((resolve, reject) => {
        this.db = new sqlite3.Database(this.connection as string, (err) => {
          if (err) reject(err);
          else resolve();
        });
      });
    } else if (this.connection instanceof sqlite3.Database) {
      this.db = this.connection;
      return Promise.resolve();
    } else {
      // Assume it's the 'sqlite' package Database instance or compatible
      this.wrapperDb = this.connection;
      return Promise.resolve();
    }
  }

  async query(sql: string, params: any[]) {
    if (this.wrapperDb) {
      return this.wrapperDb.all(sql, params);
    }

    if (!this.db) throw new Error('Not connected');
    return new Promise<any[]>((resolve, reject) => {
      this.db!.all(sql, params, (err, rows: any[]) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });
  }

  async disconnect() {
    if (this.wrapperDb) {
      // 'sqlite' package usually manages its own connection,
      // but if we want to close it:
      if (this.wrapperDb.close) {
        await this.wrapperDb.close();
      }
      return;
    }

    if (this.db) {
      return new Promise<void>((resolve) =>
        this.db!.close((err) => {
          if (err) console.error(err);
          resolve();
        }),
      );
    }
  }
}
