import { JSONQLParser } from '../core';
import { SQLTranspiler } from '../transpiler';
import { ResultHydrator } from '../hydrator';
import { JSONQLValidator } from '../validator';
import { AdapterOptions } from './types';
import { Logger, ConsoleLogger, NoOpLogger } from '../logger';
import { isMutation, JSONQLMutation, JSONQLQuery, JSONQLStatement, JSONQLWhere } from '../types';
import { inferMutationFromRequest } from './utils';

/**
 * Framework-agnostic base handler that implements the full JSONQL pipeline.
 *
 * Subclasses only need to provide:
 * - Framework-specific input extraction (request body / query string)
 * - Framework-specific error creation
 * - Framework-specific route registration
 */
export abstract class BaseHandler<Context = any> {
  protected parser: JSONQLParser;
  protected transpiler: SQLTranspiler | null;
  protected hydrator: ResultHydrator | null;
  protected canExecute: boolean;
  protected logger: Logger;

  constructor(protected options: AdapterOptions<Context>) {
    this.parser = new JSONQLParser();
    this.canExecute = !!(options.execute || options.driver);

    // Infer dialect from driver if not explicitly provided
    const dialect = options.dialect || (options.driver ? options.driver.dialect : 'sqlite');

    this.transpiler = this.canExecute ? new SQLTranspiler(dialect) : null;
    this.hydrator = this.canExecute ? new ResultHydrator() : null;

    // Initialize Logger
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
   * Express/Fastify throw plain objects; NestJS throws HttpExceptions.
   */
  protected abstract createError(status: number, error: string, details: any): never;

  /**
   * Core pipeline: parse → validate → transpile → execute → hydrate.
   *
   * @param rawInput  - The raw JSON input (body or parsed query string)
   * @param context   - Framework-specific request context
   * @param httpMethod - HTTP method (GET, POST, PATCH, DELETE)
   * @param pathName  - Resolved path segment for table inference (already trimmed of slashes)
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
      this.createError(400, 'Invalid JSONQL Query', e.message);
    }

    if (this.options.afterParse) {
      query = await this.options.afterParse(query, context);
    }

    // 4. Resolve table name
    let tableName = (query as any).from;
    tableName = this.resolveTableName(query, tableName, pathName);

    // Ensure query carries the resolved table name (for both queries and mutations)
    if (tableName) {
      (query as any).from = tableName;
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
    const resolvedSchema = this.options.schemaResolver
      ? await this.options.schemaResolver(context)
      : this.options.schema;

    // 8. Validate
    if (resolvedSchema && tableName) {
      const tableSchema = resolvedSchema.tables?.[tableName];
      const shouldValidate = !!tableSchema?.fields;

      if (shouldValidate) {
        const validator = new JSONQLValidator(resolvedSchema, tableName);
        const validation = validator.validate(query);

        if (this.options.afterValidate) {
          await this.options.afterValidate(validation, context);
        }

        if (!validation.valid) {
          this.createError(400, 'Validation Error', validation.errors);
        }
      }
    }

    // 9. Execute (if driver/execute provided)
    if (this.canExecute && this.transpiler) {
      if (!tableName) {
        return null; // No table → pass-through
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

      // Transpile
      const { sql, parameters } = this.transpiler.transpile(statement, tableName, resolvedSchema);
      this.logger.debug(`[JSONQL] SQL: ${sql}`);
      this.logger.debug(`[JSONQL] Params: ${JSON.stringify(parameters)}`);

      // Execute
      let flatRows: any[] = [];
      let prefetchedDeleteRows: any[] = [];
      const start = Date.now();
      try {
        if (isMutationStatement && (statement as JSONQLMutation).op === 'delete') {
          prefetchedDeleteRows = await this.fetchMutationResults(statement as JSONQLMutation);
        }

        if (this.options.driver) {
          flatRows = await this.options.driver.query(sql, parameters);
        } else if (this.options.execute) {
          flatRows = await this.options.execute(sql, parameters);
        }

        // For mutations, fetch affected rows if not returned by the query
        if (isMutationStatement && flatRows.length === 0) {
          const mutation = statement as JSONQLMutation;
          if (mutation.op === 'delete' && prefetchedDeleteRows.length > 0) {
            flatRows = prefetchedDeleteRows;
          } else {
            flatRows = await this.fetchMutationResults(mutation);
          }
        }
      } catch (err: any) {
        this.logger.error(`[JSONQL] Execution Error:`, err);
        this.createError(400, 'Execution Error', err.message);
      }

      const duration = Date.now() - start;
      this.logger.debug(`[JSONQL] Time: ${duration}ms | Rows: ${flatRows.length}`);

      // Mutation after-hooks
      if (isMutationStatement) {
        const mutation = statement as JSONQLMutation;
        let result: any = { meta: { query: statement }, data: flatRows };
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

      // Hydrate
      if (this.hydrator) {
        if (this.options.beforeHydrate) {
          flatRows = await this.options.beforeHydrate(flatRows, context);
        }

        let data = this.hydrator.hydrate(flatRows, resolvedSchema, tableName);

        if (this.options.afterHydrate) {
          data = await this.options.afterHydrate(data, context);
        }

        if (this.options.afterQuery) {
          data = await this.options.afterQuery(data, context);
        }

        return { meta: { query }, data };
      }
    }

    return null;
  }

  /**
   * Resolve the target table name from query, path, and the tables option.
   */
  private resolveTableName(
    query: JSONQLStatement,
    tableName: string | undefined,
    pathName: string,
  ): string | undefined {
    if (this.options.tables) {
      if (Array.isArray(this.options.tables)) {
        // Mode A: Whitelist
        if (!tableName) tableName = pathName;
        if (!this.options.tables.includes(tableName!)) {
          this.createError(403, 'Forbidden', `Table '${tableName}' is not allowed`);
        }
      } else {
        // Mode B: Mapping
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
      // Open mode
      if (!tableName) tableName = pathName;
    }

    return tableName;
  }

  /**
   * Fetch mutation results after execution
   * For databases that don't support RETURNING clause (like SQLite),
   * we need to re-query to get the affected rows
   */
  private async fetchMutationResults(
    mutation: JSONQLMutation,
  ): Promise<any[]> {
    const tableName = mutation.from;
    if (!tableName || !this.transpiler) return [];
    const transpiler = this.transpiler;

    const runSelect = async (where: JSONQLWhere, limit?: number) => {
      const selectQuery: JSONQLQuery = {
        from: tableName,
        where,
        fields: ['*'],
      };

      if (limit !== undefined) {
        selectQuery.limit = limit;
      }

      const transpiled = transpiler.transpile(selectQuery, tableName);
      return this.executeQuery(transpiled.sql, transpiled.parameters);
    };

    try {
      if (mutation.op === 'create') {
        const data = Array.isArray(mutation.data) ? mutation.data : [mutation.data];
        if (data.length === 0) return [];

        const rows: any[] = [];
        for (const row of data) {
          if (!row || typeof row !== 'object' || Array.isArray(row)) {
            continue;
          }

          let where: JSONQLWhere | undefined;
          if ((row as any).id !== undefined) {
            where = { id: { eq: (row as any).id } } as JSONQLWhere;
          } else {
            const eqByFields: Record<string, any> = {};
            for (const [key, value] of Object.entries(row)) {
              eqByFields[key] = { eq: value };
            }
            if (Object.keys(eqByFields).length > 0) {
              where = eqByFields as JSONQLWhere;
            }
          }

          if (!where) {
            continue;
          }

          const result = await runSelect(where, 1);
          if (result.length > 0) {
            rows.push(result[0]);
          }
        }

        return rows;
      }

      if (mutation.op === 'update') {
        if (!mutation.where) return [];
        return runSelect(mutation.where, mutation.limit);
      }

      if (mutation.op === 'delete') {
        if (!mutation.where) return [];
        return runSelect(mutation.where, mutation.limit);
      }

      return [];
    } catch (err) {
      this.logger.error('[JSONQL] Error fetching mutation results:', err);
      return [];
    }
  }

  private async executeQuery(sql: string, params: any[]): Promise<any[]> {
    if (this.options.driver) {
      return await this.options.driver.query(sql, params);
    } else if (this.options.execute) {
      return await this.options.execute(sql, params);
    }
    return [];
  }

}
