import { JSONQLParser } from './parser';
import { SQLTranspiler } from './transpiler';
import { ResultHydrator } from './hydrator';
import { JSONQLValidator } from './validator';
import { DatabaseDriver, JSONQLDialect } from './driver';
import { Logger, ConsoleLogger, NoOpLogger } from './logger';
import { JsonQLExecutionError } from './errors';
import { isMutation, JSONQLParserOptions, JSONQLSchema, JSONQLStatement } from './types';

/**
 * User-supplied raw SQL executor callback (alternative to a {@link DatabaseDriver}).
 */
export type ExecuteFunc = (sql: string, params: any[]) => Promise<any[]>;

/**
 * Result of an {@link JSONQLEngine.execute} call.
 */
export interface EngineResult {
  /** Hydrated rows for queries, or affected rows for mutations. */
  data: any[];
  /** True when the executed statement was a mutation (create/update/delete). */
  isMutation: boolean;
}

/**
 * High-level facade that wires the full JSONQL pipeline
 * (parse → validate → transpile → execute → hydrate) into a single
 * {@link JSONQLEngine.execute} call.
 *
 * Mirrors the `Engine` facade shipped by the Go, Python, and Java SDKs so
 * the high-level API is consistent across the ecosystem.
 *
 * @example
 * ```ts
 * const engine = JSONQLEngine.builder()
 *   .postgres()
 *   .schema(schema)
 *   .driver(driver)
 *   .build();
 *
 * const result = await engine.execute({ where: { age: { gt: 18 } } }, 'users');
 * console.log(result.data);
 * ```
 */
export class JSONQLEngine {
  private readonly parser: JSONQLParser;
  private readonly transpiler: SQLTranspiler;
  private readonly hydrator: ResultHydrator;
  private readonly schema?: JSONQLSchema;
  private readonly driver?: DatabaseDriver;
  private readonly executor?: ExecuteFunc;
  private readonly logger: Logger;

  constructor(deps: {
    parser: JSONQLParser;
    transpiler: SQLTranspiler;
    hydrator: ResultHydrator;
    schema?: JSONQLSchema;
    driver?: DatabaseDriver;
    executor?: ExecuteFunc;
    logger?: Logger;
  }) {
    this.parser = deps.parser;
    this.transpiler = deps.transpiler;
    this.hydrator = deps.hydrator;
    this.schema = deps.schema;
    this.driver = deps.driver;
    this.executor = deps.executor;
    this.logger = deps.logger ?? new NoOpLogger();
  }

  /**
   * Run the full pipeline: parse → validate → transpile → execute → hydrate.
   *
   * @param raw   - The raw JSONQL query or mutation object.
   * @param table - The target table name.
   */
  async execute(raw: object, table: string): Promise<EngineResult> {
    // 1. Parse (the TS parser handles both queries and mutations).
    const statement = this.parser.parse(raw);

    // 2. Validate — only when the table has field definitions in the schema.
    if (this.schema && this.hasTableFields(table)) {
      const validator = new JSONQLValidator(this.schema, table);
      validator.validateOrThrow(statement);
    }

    // 3. Transpile.
    const { sql, parameters } = this.transpiler.transpile(statement, table, this.schema);
    this.logger.debug(`[JSONQL] SQL: ${sql}`);
    this.logger.debug(`[JSONQL] Params: ${JSON.stringify(parameters)}`);

    // 4. Execute.
    const rows = await this.exec(sql, parameters);

    // 5. Hydrate (queries only; mutations return affected rows as-is).
    if (isMutation(statement)) {
      return { data: rows, isMutation: true };
    }

    const data = this.hydrator.hydrate(rows, this.schema, table);
    return { data, isMutation: false };
  }

  private async exec(sql: string, params: any[]): Promise<any[]> {
    try {
      if (this.driver) {
        return await this.driver.query(sql, params);
      }
      if (this.executor) {
        return await this.executor(sql, params);
      }
    } catch (err: any) {
      if (err instanceof JsonQLExecutionError) {
        throw err;
      }
      this.logger.error(`[JSONQL] Execution error:`, err);
      throw new JsonQLExecutionError(err?.message ?? String(err), err);
    }
    throw new JsonQLExecutionError('No driver or executor configured');
  }

  private hasTableFields(table: string): boolean {
    const tableSchema = this.schema?.tables?.[table];
    return !!tableSchema?.fields && Object.keys(tableSchema.fields).length > 0;
  }

  /**
   * Create a new {@link EngineBuilder}.
   */
  static builder(): EngineBuilder {
    return new EngineBuilder();
  }
}

/**
 * Fluent builder for {@link JSONQLEngine}.
 */
export class EngineBuilder {
  private dialectName: JSONQLDialect = 'sqlite';
  private _dialectExplicit = false;
  private _schema?: JSONQLSchema;
  private _driver?: DatabaseDriver;
  private _executor?: ExecuteFunc;
  private _logger?: Logger;
  private _parserOptions?: JSONQLParserOptions;
  private _debug = false;

  /** Set the SQL dialect by name. */
  dialect(name: JSONQLDialect): this {
    this.dialectName = name;
    this._dialectExplicit = true;
    return this;
  }

  /** Use the PostgreSQL dialect. */
  postgres(): this {
    return this.dialect('postgres');
  }

  /** Use the MySQL dialect. */
  mysql(): this {
    return this.dialect('mysql');
  }

  /** Use the SQLite dialect. */
  sqlite(): this {
    return this.dialect('sqlite');
  }

  /** Use the Microsoft SQL Server dialect. */
  mssql(): this {
    return this.dialect('mssql');
  }

  /** Set the JSONQL schema for validation and relationship resolution. */
  schema(schema: JSONQLSchema): this {
    this._schema = schema;
    return this;
  }

  /**
   * Set the database driver for query execution.
   * If the dialect has not been set explicitly, it is inferred from the driver.
   */
  driver(driver: DatabaseDriver): this {
    this._driver = driver;
    if (!this._dialectExplicit) {
      this.dialectName = driver.dialect;
    }
    return this;
  }

  /** Set a raw SQL executor function (alternative to {@link EngineBuilder.driver}). */
  executor(fn: ExecuteFunc): this {
    this._executor = fn;
    return this;
  }

  /** Set the logger. */
  logger(logger: Logger): this {
    this._logger = logger;
    return this;
  }

  /** Set parser security options. */
  parserOptions(options: JSONQLParserOptions): this {
    this._parserOptions = options;
    return this;
  }

  /** Enable debug logging (uses {@link ConsoleLogger} if no logger is set). */
  debug(enabled = true): this {
    this._debug = enabled;
    return this;
  }

  /** Build the {@link JSONQLEngine}. */
  build(): JSONQLEngine {
    let logger: Logger;
    if (this._logger) {
      logger = this._logger;
    } else if (this._debug) {
      logger = new ConsoleLogger();
    } else {
      logger = new NoOpLogger();
    }

    return new JSONQLEngine({
      parser: new JSONQLParser(this._parserOptions),
      transpiler: new SQLTranspiler(this.dialectName),
      hydrator: new ResultHydrator(),
      schema: this._schema,
      driver: this._driver,
      executor: this._executor,
      logger,
    });
  }
}
