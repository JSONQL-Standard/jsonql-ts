import type { Pool, Client, QueryResult } from 'pg';
import { DatabaseDriver, JSONQLDialect } from '../driver';

export type PostgresConnection = Pool | Client;

export class PostgresDriver implements DatabaseDriver {
  dialect: JSONQLDialect = 'postgres';

  constructor(private client: PostgresConnection) {}

  async connect(): Promise<void> {
    // Connection is usually managed externally (Pool) or already connected (Client)
    // If it's a Client and not connected, the user should connect it.
    // We can optionally check if it's a Client and connect, but usually we expect a ready-to-use instance.
    if (
      'connect' in this.client &&
      typeof (this.client as any).connect === 'function' &&
      !(this.client as any)._connected
    ) {
      // It's hard to detect if Client is connected without private props.
      // Best practice: User passes a connected client or a pool.
    }
  }

  async disconnect(): Promise<void> {
    await this.client.end();
  }

  async query(sql: string, params: any[]): Promise<any[]> {
    const res: QueryResult = await this.client.query(sql, params);
    return res.rows;
  }
}
