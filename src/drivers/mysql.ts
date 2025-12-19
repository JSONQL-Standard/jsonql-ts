import { DatabaseDriver, JSONQLDialect } from '../driver';
import type { Pool, Connection } from 'mysql2/promise';

export type MySQLConnection = Pool | Connection;

export class MySQLDriver implements DatabaseDriver {
  dialect: JSONQLDialect = 'mysql';

  constructor(private client: MySQLConnection) {}

  async connect(): Promise<void> {
    // Managed externally
  }

  async disconnect(): Promise<void> {
    await this.client.end();
  }

  async query(sql: string, params: any[]): Promise<any[]> {
    // mysql2 execute returns [rows, fields]
    const [rows] = await this.client.execute(sql, params);
    return rows as any[];
  }
}
