import { JSONQLSchema, JSONQLStatement, JSONQLParserOptions, ValidationResult } from '../types';
import { DatabaseDriver } from '../driver';
import { Logger } from '../logger';
import { SchemaManager } from '../schema/manager';

export interface AdapterOptions<Context = any> {
  schema?: JSONQLSchema;

  /**
   * Parser options for controlling query parsing behavior.
   * - maxNestingDepth: Maximum nesting depth for where clauses (default: 5)
   * - maxLimit: Maximum allowed limit value (default: 1000)
   * - allowedFields: Whitelist of field names that can be selected (empty = unrestricted)
   * - allowedIncludes: Whitelist of relation names that can be included (empty = unrestricted)
   */
  parserOptions?: JSONQLParserOptions;
  schemaResolver?: (
    context: Context,
  ) => Promise<JSONQLSchema | undefined> | JSONQLSchema | undefined;

  /**
   * SchemaManager instance for automatic schema loading.
   * The manager's `load()` is called once on first request and the result is cached.
   * Takes effect only if `schema` and `schemaResolver` are not provided.
   *
   * @example
   * ```ts
   * const manager = new SchemaManager({
   *   introspector: new SQLiteIntrospector(driver),
   *   schemaFilePath: './schema.json',
   * });
   * new ExpressAdapter({ driver, schemaManager: manager });
   * ```
   */
  schemaManager?: SchemaManager;

  /**
   * Base directory for per-request schema resolution from JSON files.
   * When a request includes an `X-JSONQL-Schema-Path` header, the adapter
   * loads `<schemaDir>/<headerValue>/schema.json` and uses it for that request.
   * Falls back to the default `schema` if no header is present or file not found.
   * Results are cached in memory.
   */
  schemaDir?: string;

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
