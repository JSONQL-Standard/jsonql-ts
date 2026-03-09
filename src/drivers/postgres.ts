import { Pool, Client, QueryResult, types } from 'pg';
import { DatabaseDriver, JSONQLDialect } from '../driver';

export type PostgresConnection = Pool | Client;

export interface PostgresDriverOptions {
  /**
   * Automatically fix PostgreSQL numeric type parsing.
   * When true (default), DECIMAL/NUMERIC and BIGINT values are returned
   * as JavaScript numbers instead of strings.
   * Set to false if you manage pg type parsers yourself.
   */
  fixNumericTypes?: boolean;
}

// Track whether we've already applied type parsers to avoid duplicate setup
let numericTypesFixed = false;

export class PostgresDriver implements DatabaseDriver {
  dialect: JSONQLDialect = 'postgres';

  constructor(
    private client: PostgresConnection,
    options: PostgresDriverOptions = {},
  ) {
    const { fixNumericTypes = true } = options;

    if (fixNumericTypes && !numericTypesFixed) {
      // PostgreSQL returns DECIMAL/NUMERIC (OID 1700) and BIGINT (OID 20) as strings.
      // This is a common gotcha that breaks aggregate results (COUNT, SUM, AVG).
      // Fix once at driver initialization.
      types.setTypeParser(1700, (val: string) => parseFloat(val));
      types.setTypeParser(20, (val: string) => parseInt(val, 10));
      numericTypesFixed = true;
    }
  }

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
