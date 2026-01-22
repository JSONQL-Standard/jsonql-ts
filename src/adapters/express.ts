import { Request, Response, NextFunction } from 'express';
import { JSONQLParser } from '../core';
import { SQLTranspiler } from '../transpiler';
import { ResultHydrator } from '../hydrator';
import { JSONQLValidator } from '../validator';
import { AdapterOptions, FrameworkAdapter } from './types';
import { Logger, ConsoleLogger, NoOpLogger } from '../logger';
import { isMutation, JSONQLMutation } from '../types';
import { inferMutationFromRequest } from './utils';

import { DatabaseDriver } from '../drivers/types';
export interface JsonqlExpressOptions extends AdapterOptions<Request> {
  driver?: DatabaseDriver;
}

export class ExpressAdapter implements FrameworkAdapter<Request> {
  private parser: JSONQLParser;
  private transpiler: SQLTranspiler | null;
  private hydrator: ResultHydrator | null;
  private canExecute: boolean;
  private logger: Logger;

  constructor(private options: JsonqlExpressOptions) {
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

  async handleRequest(rawInput: any, req: Request): Promise<any> {
    let rawQuery = rawInput;

    if (this.options.beforeParse) {
      rawQuery = await this.options.beforeParse(rawQuery, req);
    }

    // 2. Infer op from HTTP method if not provided
    rawQuery = inferMutationFromRequest(req.method, rawQuery);

    // 3. Parse
    let query;
    try {
      query = this.parser.parse(rawQuery);
    } catch (e: any) {
      throw { status: 400, error: 'Invalid JSONQL Query', details: e.message };
    }

    if (this.options.afterParse) {
      query = await this.options.afterParse(query, req);
    }

    // 3. Infer & Validate Table Name
    let tableName = query.from;
    const pathName = req.path.replace(/^\/|\/$/g, '');

    if (this.options.tables) {
      if (Array.isArray(this.options.tables)) {
        // Mode A: Whitelist (Array)
        if (!tableName) {
          tableName = pathName;
        }
        if (!this.options.tables.includes(tableName)) {
          throw { status: 403, error: 'Forbidden', details: `Table '${tableName}' is not allowed` };
        }
      } else {
        // Mode B: Mapping (Object)
        const mappedTable = this.options.tables[pathName];

        if (mappedTable) {
          // Case 1: Path matches a defined mapping (e.g. /sales -> orders)
          if (query.from) {
            throw {
              status: 400,
              error: 'Bad Request',
              details: `Cannot specify 'from' in a table-specific endpoint. This endpoint is hardcoded to '${mappedTable}'.`,
            };
          }
          tableName = mappedTable;
        } else {
          // Case 2: Path does not match a mapping
          // Only allow 'from' if we are at the root of the mount point
          if (pathName === '') {
            if (tableName) {
              const allowedTables = Object.values(this.options.tables);
              if (!allowedTables.includes(tableName)) {
                throw {
                  status: 403,
                  error: 'Forbidden',
                  details: `Table '${tableName}' is not allowed`,
                };
              }
            }
          } else {
            // Path is not empty, and not mapped.
            if (tableName) {
              throw {
                status: 400,
                error: 'Bad Request',
                details: `Cannot specify 'from' on non-root endpoint '${pathName}'`,
              };
            }
          }
        }
      }
    } else {
      // Default Mode: Open
      if (!tableName) {
        tableName = pathName;
      }
    }

    // Ensure query has the resolved table name
    if (tableName && !query.from) {
      query.from = tableName;
    }

    if (this.options.beforeQuery) {
      query = await this.options.beforeQuery(query, req);
    }

    if (this.options.beforeValidate) {
      query = await this.options.beforeValidate(query, req);
    }

    const resolvedSchema = this.options.schemaResolver
      ? await this.options.schemaResolver(req)
      : this.options.schema;

    // 4. Validate against Schema (if provided)
    if (resolvedSchema && tableName) {
      const tableSchema = resolvedSchema.tables?.[tableName];
      const shouldValidate = !!tableSchema?.fields;

      if (shouldValidate) {
        const validator = new JSONQLValidator(resolvedSchema, tableName);
        const validation = validator.validate(query);

        if (this.options.afterValidate) {
          await this.options.afterValidate(validation, req);
        }

        if (!validation.valid) {
          throw { status: 400, error: 'Validation Error', details: validation.errors };
        }
      }
    }

    // 5. Attach to Request
    (req as any).jsonql = query;

    // 6. Auto-Handle if executor is provided
    if (this.canExecute && this.transpiler) {
      if (!tableName) {
        return null; // Pass to next()
      }

      let statement = query;
      const isMutationStatement = isMutation(statement);

      if (isMutationStatement) {
        const mutation = statement as JSONQLMutation;
        if (mutation.op === 'create' && this.options.beforeCreate) {
          statement = await this.options.beforeCreate(mutation, req);
        } else if (mutation.op === 'update' && this.options.beforeUpdate) {
          statement = await this.options.beforeUpdate(mutation, req);
        } else if (mutation.op === 'delete' && this.options.beforeDelete) {
          statement = await this.options.beforeDelete(mutation, req);
        }
      }

      // Transpile
      const { sql, parameters } = this.transpiler.transpile(statement, tableName, resolvedSchema);

      this.logger.debug(
        `[JSONQL] -----------------------------------------------------------------`,
      );
      this.logger.debug(`[JSONQL] Request: ${req.method} ${req.path}`);
      this.logger.debug(`[JSONQL] Table:   ${tableName}`);
      this.logger.debug(`[JSONQL] SQL:     ${sql}`);
      this.logger.debug(`[JSONQL] Params:  ${JSON.stringify(parameters)}`);

      // Execute
      let flatRows: any[] = [];
      const start = Date.now();
      try {
        if (this.options.driver) {
          flatRows = await this.options.driver.query(sql, parameters);
        } else if (this.options.execute) {
          flatRows = await this.options.execute(sql, parameters);
        }
      } catch (err: any) {
        this.logger.error(`[JSONQL] Execution Error:`, err);
        throw { status: 400, error: 'Execution Error', details: err.message };
      }

      const duration = Date.now() - start;
      this.logger.debug(`[JSONQL] Time:    ${duration}ms`);
      this.logger.debug(`[JSONQL] Rows:    ${flatRows.length}`);
      this.logger.debug(
        `[JSONQL] -----------------------------------------------------------------`,
      );

      if (isMutationStatement) {
        const mutation = statement as JSONQLMutation;
        let result: any = { meta: { query: statement }, data: flatRows };
        if (mutation.op === 'create' && this.options.afterCreate) {
          result = await this.options.afterCreate(result, req);
        } else if (mutation.op === 'update' && this.options.afterUpdate) {
          result = await this.options.afterUpdate(result, req);
        } else if (mutation.op === 'delete' && this.options.afterDelete) {
          result = await this.options.afterDelete(result, req);
        }
        if (this.options.afterQuery) {
          result = await this.options.afterQuery(result, req);
        }
        return result;
      }

      if (this.hydrator) {
        if (this.options.beforeHydrate) {
          flatRows = await this.options.beforeHydrate(flatRows, req);
        }

        let data = this.hydrator.hydrate(flatRows, resolvedSchema, tableName);

        if (this.options.afterHydrate) {
          data = await this.options.afterHydrate(data, req);
        }

        if (this.options.afterQuery) {
          data = await this.options.afterQuery(data, req);
        }

        return { meta: { query }, data };
      }
    }

    return null;
  }

  middleware() {
    return async (req: Request, res: Response, next: NextFunction) => {
      try {
        // 1. Extract Query
        const rawQuery =
          req.method === 'GET' ? JSON.parse((req.query.q as string) || '{}') : req.body;

        const result = await this.handleRequest(rawQuery, req);

        if (result) {
          res.json(result);
        } else {
          next();
        }
      } catch (err: any) {
        const status = err.status || 400;
        res.status(status).json({
          error: err.error || 'Invalid JSONQL Query',
          details: err.details || err.message,
        });
      }
    };
  }
}

export function jsonqlExpress(options: JsonqlExpressOptions = {}) {
  return new ExpressAdapter(options).middleware();
}
