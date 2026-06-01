import { JSONQLParser } from '../core';
import { MongoTranspiler, MongoResult } from '../transpiler';
import { JSONQLValidator } from '../validator';
import { AdapterOptions } from './types';
import { Logger, ConsoleLogger, NoOpLogger } from '../logger';
import { inferMutationFromRequest } from './utils';
import { isMutation, JSONQLMutation, JSONQLQuery, JSONQLSchema, JSONQLStatement } from '../types';

/**
 * Minimal MongoDB collection surface used by the handler.
 * Compatible with the official `mongodb` Node.js driver's `Collection`.
 */
export interface MongoCollection {
  find(filter: Record<string, any>, options?: Record<string, any>): { toArray(): Promise<any[]> };
  aggregate(pipeline: Record<string, any>[]): { toArray(): Promise<any[]> };
  insertOne(doc: Record<string, any>): Promise<any>;
  insertMany(docs: Record<string, any>[]): Promise<any>;
  updateMany(filter: Record<string, any>, update: Record<string, any>): Promise<any>;
  deleteMany(filter: Record<string, any>): Promise<any>;
}

/**
 * Minimal MongoDB database surface used by the handler.
 * Compatible with the official `mongodb` Node.js driver's `Db`.
 */
export interface MongoDatabase {
  collection(name: string): MongoCollection;
}

/**
 * Configuration for a MongoDB JSONQL adapter.
 *
 * Reuses every lifecycle hook, schema, and `tables` option from the SQL
 * {@link AdapterOptions}, but executes against a MongoDB `database` instead
 * of a SQL driver. The `driver`, `dialect`, and `execute` SQL fields are
 * ignored by the MongoDB pipeline.
 */
export interface MongoAdapterOptions<Context = any> extends AdapterOptions<Context> {
  /** A MongoDB database handle (e.g. `client.db(name)` from the `mongodb` package). */
  database?: MongoDatabase;
}

/**
 * Framework-agnostic MongoDB handler implementing the full JSONQL pipeline.
 *
 * Mirrors {@link BaseHandler} (SQL) but transpiles to a {@link MongoResult}
 * and executes against a MongoDB database. Returns the same response envelope
 * (`{ meta: { query }, data }`) so MongoDB adapters are drop-in compatible
 * with the SQL adapters from a client's perspective.
 *
 * Subclasses provide framework-specific input extraction, error creation, and
 * route registration.
 */
export abstract class MongoBaseHandler<Context = any> {
  protected parser: JSONQLParser;
  protected transpiler: MongoTranspiler;
  protected db: MongoDatabase | undefined;
  protected logger: Logger;

  constructor(protected options: MongoAdapterOptions<Context>) {
    this.parser = new JSONQLParser(options.parserOptions);
    this.transpiler = new MongoTranspiler();
    this.db = options.database;

    if (options.logger) {
      this.logger = options.logger;
    } else if (options.debug) {
      this.logger = new ConsoleLogger();
    } else {
      this.logger = new NoOpLogger();
    }
  }

  /**
   * Create a framework-appropriate error to throw.
   * Express/Fastify throw plain objects; NestJS subclasses may override.
   */
  protected abstract createError(
    status: number,
    error: string,
    details: any,
    errorCode?: string,
  ): never;

  /**
   * Core pipeline: parse → validate → transpile → execute.
   *
   * @param rawInput   - The raw JSON input (body or parsed query string)
   * @param context    - Framework-specific request context
   * @param httpMethod - HTTP method (GET, POST, PATCH, DELETE)
   * @param pathName   - Resolved path segment for collection inference (trimmed of slashes)
   */
  async processRequest(
    rawInput: any,
    context: Context,
    httpMethod: string,
    pathName: string,
  ): Promise<any> {
    let rawQuery = rawInput;

    // 1. beforeParse hook
    if (this.options.beforeParse) {
      rawQuery = await this.options.beforeParse(rawQuery, context);
    }

    // 2. Infer mutation op from HTTP method
    rawQuery = inferMutationFromRequest(httpMethod, rawQuery);

    // 3. Parse
    let query: JSONQLStatement;
    try {
      query = this.parser.parse(rawQuery);
    } catch (e: any) {
      this.createError(400, 'Invalid JSONQL Query', e.message, e.code || 'PARSE_ERROR');
    }

    if (this.options.afterParse) {
      query = await this.options.afterParse(query, context);
    }

    // 4. Resolve collection (table) name
    let collectionName = (query as any).from;
    collectionName = this.resolveTableName(query, collectionName, pathName);

    if (collectionName) {
      (query as any).from = collectionName;
    }

    // 5. Lifecycle: beforeQuery
    if (this.options.beforeQuery) {
      query = await this.options.beforeQuery(query, context);
    }

    // 6. Lifecycle: beforeValidate
    if (this.options.beforeValidate) {
      query = await this.options.beforeValidate(query, context);
    }

    // 7. Resolve schema
    const resolvedSchema = await this.resolveSchema(context);

    // 8. Validate (queries only, when schema + collection fields exist)
    if (resolvedSchema && collectionName && !isMutation(query)) {
      const tableSchema = resolvedSchema.tables?.[collectionName];
      const shouldValidate = !!tableSchema?.fields;

      if (shouldValidate) {
        const validator = new JSONQLValidator(resolvedSchema, collectionName);
        const validation = validator.validate(query);

        if (this.options.afterValidate) {
          await this.options.afterValidate(validation, context);
        }

        if (!validation.valid) {
          this.createError(400, 'Validation Error', validation.errors, 'VALIDATION_ERROR');
        }
      }
    }

    // 9. No collection → pass-through
    if (!collectionName) {
      return null;
    }

    let statement = query;
    const isMutationStatement = isMutation(statement);

    // Mutation before-hooks
    if (isMutationStatement) {
      const mutation = statement as JSONQLMutation;
      if (mutation.op === 'create' && this.options.beforeCreate) {
        statement = await this.options.beforeCreate(mutation, context);
      } else if (mutation.op === 'update' && this.options.beforeUpdate) {
        statement = await this.options.beforeUpdate(mutation, context);
      } else if (mutation.op === 'delete' && this.options.beforeDelete) {
        statement = await this.options.beforeDelete(mutation, context);
      }
    }

    // 10. Transpile
    const mongoResult = this.transpiler.transpile(statement, collectionName);
    this.logger.debug(`[JSONQL] Mongo op: ${mongoResult.operation}`);
    this.logger.debug(`[JSONQL] Collection: ${mongoResult.collection}`);

    // 11. Execute
    let rows: any[] = [];
    const start = Date.now();
    try {
      rows = await this.executeMongo(mongoResult);
    } catch (err: any) {
      this.logger.error(`[JSONQL] Execution Error:`, err);
      this.createError(400, 'Execution Error', err.message, err.code || 'EXECUTION_ERROR');
    }
    this.logger.debug(`[JSONQL] Time: ${Date.now() - start}ms | Rows: ${rows.length}`);

    // 12. Mutation after-hooks
    if (isMutationStatement) {
      const mutation = statement as JSONQLMutation;
      let result: any = { meta: { query: statement }, data: rows };
      if (mutation.op === 'create' && this.options.afterCreate) {
        result = await this.options.afterCreate(result, context);
      } else if (mutation.op === 'update' && this.options.afterUpdate) {
        result = await this.options.afterUpdate(result, context);
      } else if (mutation.op === 'delete' && this.options.afterDelete) {
        result = await this.options.afterDelete(result, context);
      }
      if (this.options.afterQuery) {
        result = await this.options.afterQuery(result, context);
      }
      return result;
    }

    // 13. Query result
    let data: any = rows;
    if (this.options.afterQuery) {
      data = await this.options.afterQuery(data, context);
    }
    return { meta: { query }, data };
  }

  /**
   * Execute a {@link MongoResult} against the MongoDB database.
   *
   * Returns the affected documents (with `_id` stripped) so the response
   * envelope matches the SQL adapters, which return affected rows.
   */
  private async executeMongo(result: MongoResult): Promise<any[]> {
    if (!this.db) {
      throw new Error('No MongoDB database configured');
    }
    const coll = this.db.collection(result.collection);

    switch (result.operation) {
      case 'find': {
        const options: Record<string, any> = {};
        if (result.projection) options.projection = result.projection;
        if (result.sort) options.sort = result.sort;
        if (result.skip) options.skip = result.skip;
        if (result.limit) options.limit = result.limit;
        const docs = await coll.find(result.filter || {}, options).toArray();
        return docs.map(stripId);
      }

      case 'aggregate': {
        const docs = await coll.aggregate(result.pipeline || []).toArray();
        return docs.map(stripId);
      }

      case 'insertOne': {
        const doc = (result.document as Record<string, any>) || {};
        await coll.insertOne(doc);
        return [stripId(doc)];
      }

      case 'insertMany': {
        const docs = (result.document as Record<string, any>[]) || [];
        await coll.insertMany(docs);
        return docs.map(stripId);
      }

      case 'updateMany': {
        await coll.updateMany(result.filter, result.update || {});
        const updated = await coll.find(result.filter || {}).toArray();
        return updated.map(stripId);
      }

      case 'deleteMany': {
        const matched = await coll.find(result.filter || {}).toArray();
        await coll.deleteMany(result.filter);
        return matched.map(stripId);
      }

      default:
        throw new Error(`Unsupported operation: ${(result as any).operation}`);
    }
  }

  /**
   * Resolve the target collection name from query, path, and the tables option.
   * Mirrors the SQL {@link BaseHandler} resolution (whitelist / mapping / open).
   */
  private resolveTableName(
    query: JSONQLStatement,
    tableName: string | undefined,
    pathName: string,
  ): string | undefined {
    if (this.options.tables) {
      if (Array.isArray(this.options.tables)) {
        if (!tableName) tableName = pathName;
        if (!this.options.tables.includes(tableName!)) {
          this.createError(403, 'Forbidden', `Table '${tableName}' is not allowed`);
        }
      } else {
        const mappedTable = this.options.tables[pathName];
        if (mappedTable) {
          if ((query as any).from) {
            this.createError(
              400,
              'Bad Request',
              `Cannot specify 'from' in a table-specific endpoint. This endpoint is hardcoded to '${mappedTable}'.`,
            );
          }
          tableName = mappedTable;
        } else if (pathName === '') {
          if (tableName) {
            const allowedTables = Object.values(this.options.tables);
            if (!allowedTables.includes(tableName)) {
              this.createError(403, 'Forbidden', `Table '${tableName}' is not allowed`);
            }
          }
        } else if (tableName) {
          this.createError(
            400,
            'Bad Request',
            `Cannot specify 'from' on non-root endpoint '${pathName}'`,
          );
        }
      }
    } else {
      if (!tableName) tableName = pathName;
    }

    return tableName;
  }

  /**
   * Resolve the schema for a request (schemaResolver takes precedence over schema).
   */
  private async resolveSchema(context: Context): Promise<JSONQLSchema | undefined> {
    if (this.options.schemaResolver) {
      return this.options.schemaResolver(context);
    }
    return this.options.schema;
  }
}

/** Return a shallow copy of a document with the Mongo `_id` field removed. */
function stripId(doc: any): any {
  if (doc && typeof doc === 'object' && '_id' in doc) {
    const { _id, ...rest } = doc;
    return rest;
  }
  return doc;
}
