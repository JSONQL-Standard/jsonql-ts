import { JSONQLSchema, JSONQLStatement, ValidationResult } from '../types';
import { DatabaseDriver } from '../driver';
import { Logger } from '../logger';

export interface AdapterOptions<Context = any> {
  schema?: JSONQLSchema;
  schemaResolver?: (
    context: Context,
  ) => Promise<JSONQLSchema | undefined> | JSONQLSchema | undefined;
  driver?: DatabaseDriver;
  execute?: (sql: string, params: any[]) => Promise<any[]>;
  dialect?: 'sqlite' | 'postgres' | 'mysql' | 'mssql';

  /**
   * Enable verbose logging for debugging.
   * Logs parsed queries, generated SQL, and execution time.
   */
  debug?: boolean;

  /**
   * Custom logger implementation.
   * If provided, it overrides the default console logger used when debug is true.
   */
  logger?: Logger;

  /**
   * Whitelist of allowed tables or a mapping of URL paths to table names.
   * - If an array is provided: Only these tables can be queried. URL path must match a table name.
   * - If a map is provided: Keys are URL paths (aliases), Values are actual table names.
   */
  tables?: string[] | Record<string, string>;

  // Lifecycle Hooks
  beforeParse?: (rawInput: any, context: Context) => Promise<any> | any;
  afterParse?: (
    query: JSONQLStatement,
    context: Context,
  ) => Promise<JSONQLStatement> | JSONQLStatement;
  beforeQuery?: (
    query: JSONQLStatement,
    context: Context,
  ) => Promise<JSONQLStatement> | JSONQLStatement;
  beforeValidate?: (
    query: JSONQLStatement,
    context: Context,
  ) => Promise<JSONQLStatement> | JSONQLStatement;
  afterValidate?: (result: ValidationResult, context: Context) => Promise<void> | void;
  beforeHydrate?: (flatRows: any[], context: Context) => Promise<any[]> | any[];
  afterHydrate?: (result: any, context: Context) => Promise<any> | any;
  afterQuery?: (result: any, context: Context) => Promise<any> | any;

  // Mutation Hooks
  beforeCreate?: (
    mutation: JSONQLStatement,
    context: Context,
  ) => Promise<JSONQLStatement> | JSONQLStatement;
  afterCreate?: (result: any, context: Context) => Promise<any> | any;
  beforeUpdate?: (
    mutation: JSONQLStatement,
    context: Context,
  ) => Promise<JSONQLStatement> | JSONQLStatement;
  afterUpdate?: (result: any, context: Context) => Promise<any> | any;
  beforeDelete?: (
    mutation: JSONQLStatement,
    context: Context,
  ) => Promise<JSONQLStatement> | JSONQLStatement;
  afterDelete?: (result: any, context: Context) => Promise<any> | any;
}

export interface FrameworkAdapter<Context = any> {
  handleRequest(input: any, context: Context): Promise<any>;
}
