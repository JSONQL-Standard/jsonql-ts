export type JSONQLDialect = 'sqlite' | 'postgres' | 'mysql' | 'mssql';

export interface DatabaseDriver {
  dialect: JSONQLDialect;
  connect(): Promise<void>;
  query(sql: string, params: any[]): Promise<any[]>;
  disconnect(): Promise<void>;
}
