import type { Database } from 'sqlite';
import { DatabaseDriver, JSONQLDialect } from '../driver';

export class SQLiteDriver implements DatabaseDriver {
  dialect: JSONQLDialect = 'sqlite';

  constructor(private db: Database) {}

  async connect(): Promise<void> {
    // Connection is managed externally
  }

  async disconnect(): Promise<void> {
    await this.db.close();
  }

  async query(sql: string, params: any[]): Promise<any[]> {
    return this.db.all(sql, params);
  }
}
