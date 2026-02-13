import { DatabaseDriver, JSONQLDialect } from '../driver';

export interface MSSQLConnection {
  request(): any;
  query(sql: string): Promise<any>;
  close(): Promise<void>;
}

export class MSSQLDriver implements DatabaseDriver {
  dialect: JSONQLDialect = 'mssql';

  constructor(private pool: any) {}

  async connect(): Promise<void> {
    // Connection managed externally via mssql pool
  }

  async disconnect(): Promise<void> {
    await this.pool.close();
  }

  async query(sql: string, params: any[]): Promise<any[]> {
    const request = this.pool.request();
    // Bind parameters as @p1, @p2, etc.
    params.forEach((param, index) => {
      request.input(`p${index + 1}`, param);
    });
    const result = await request.query(sql);
    return result.recordset;
  }
}
