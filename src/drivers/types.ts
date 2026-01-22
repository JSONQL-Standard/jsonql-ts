export interface DatabaseDriver {
  dialect: 'postgres' | 'mysql' | 'sqlite';
  connect(): Promise<void>;
  query(sql: string, params: any[]): Promise<any[]>;
  disconnect(): Promise<void>;
}
