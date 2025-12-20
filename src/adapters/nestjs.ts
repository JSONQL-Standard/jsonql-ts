import {
  Injectable,
  Inject,
  Module,
  DynamicModule,
  BadRequestException,
  ForbiddenException,
  Provider,
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { Request } from 'express';
import { JSONQLParser } from '../core';
import { SQLTranspiler } from '../transpiler';
import { ResultHydrator } from '../hydrator';
import { JSONQLValidator } from '../validator';
import { AdapterOptions } from './types';
import { Logger, ConsoleLogger, NoOpLogger } from '../logger';

export const JSONQL_OPTIONS = 'JSONQL_OPTIONS';

export type JsonqlNestOptions = AdapterOptions<Request>;

export interface JsonqlModuleAsyncOptions {
  imports?: any[];
  useFactory: (...args: any[]) => Promise<JsonqlNestOptions> | JsonqlNestOptions;
  inject?: any[];
}

@Injectable()
export class JsonqlService {
  private parser: JSONQLParser;
  private transpiler: SQLTranspiler | null;
  private hydrator: ResultHydrator | null;
  private canExecute: boolean;
  private logger: Logger;

  constructor(@Inject(JSONQL_OPTIONS) private options: JsonqlNestOptions) {
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

  async handleRequest(req: Request, path?: string): Promise<any> {
    let rawQuery: any;

    // 1. Extract Query
    if (req.method === 'GET') {
      const q = req.query.q;
      try {
        rawQuery = JSON.parse((q as string) || '{}');
      } catch (e) {
        throw new BadRequestException({
          error: 'Bad Request',
          details: 'Invalid JSON in query parameter "q"',
        });
      }
    } else {
      rawQuery = req.body;
    }

    if (this.options.beforeParse) {
      rawQuery = await this.options.beforeParse(rawQuery, req);
    }

    // 2. Parse
    let query;
    try {
      query = this.parser.parse(rawQuery);
    } catch (e: any) {
      throw new BadRequestException({
        error: 'Invalid JSONQL Query',
        details: e.message,
      });
    }

    if (this.options.afterParse) {
      query = await this.options.afterParse(query, req);
    }

    // 3. Infer & Validate Table Name
    let tableName = query.from;
    const pathName = (path !== undefined ? path : req.path).replace(/^\/|\/$/g, ''); // Remove leading/trailing slashes

    if (this.options.tables) {
      if (Array.isArray(this.options.tables)) {
        // Mode A: Whitelist (Array)
        if (!tableName) {
          tableName = pathName;
        }
        if (!this.options.tables.includes(tableName)) {
          throw new ForbiddenException({
            error: 'Forbidden',
            details: `Table '${tableName}' is not allowed`,
          });
        }
      } else {
        // Mode B: Mapping (Object)
        const mappedTable = this.options.tables[pathName];

        if (mappedTable) {
          // Case 1: Path matches a defined mapping (e.g. /sales -> orders)
          if (query.from) {
            throw new BadRequestException({
              error: 'Bad Request',
              details: `Cannot specify 'from' in a table-specific endpoint. This endpoint is hardcoded to '${mappedTable}'.`,
            });
          }
          tableName = mappedTable;
        } else {
          // Case 2: Path does not match a mapping
          if (tableName) {
            // Strict Mode: If path is not empty, we cannot override table with 'from'
            // unless we are at root.
            if (pathName !== '') {
              throw new BadRequestException({
                error: 'Bad Request',
                details: `Cannot specify 'from' on non-root endpoint '${pathName}'`,
              });
            }

            const allowedTables = Object.values(this.options.tables);
            if (!allowedTables.includes(tableName)) {
              throw new ForbiddenException({
                error: 'Forbidden',
                details: `Table '${tableName}' is not allowed`,
              });
            }
          } else {
            // If no table name in query and path doesn't map to a table, try to use path as table name if allowed
            // But if we are in strict mapping mode (options.tables is object), usually we only allow mapped paths or explicit from if path is generic.
            // If path is 'unknown' and not in map, and no query.from, we can't infer table.
            // However, if the user intended /api/unknown to be a table 'unknown', we should check if 'unknown' is in values.

            // If pathName is not in keys, and no query.from, we default tableName to pathName?
            // Only if pathName is in allowed values?

            // Let's assume if not mapped, we treat pathName as potential table name if it is in allowed values.
            const allowedTables = Object.values(this.options.tables);
            if (allowedTables.includes(pathName)) {
              tableName = pathName;
            } else {
              // If we can't infer table, and we are in strict mode, maybe we should error or let it fail later?
              // If we return here, tableName is undefined.
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

    // 4. Validate against Schema (if provided)
    if (this.options.schema && tableName) {
      const validator = new JSONQLValidator(this.options.schema, tableName);
      const validation = validator.validate(query);

      if (this.options.afterValidate) {
        await this.options.afterValidate(validation, req);
      }

      if (!validation.valid) {
        throw new BadRequestException({
          error: 'Validation Error',
          details: validation.errors,
        });
      }
    }

    // 5. Attach to Request
    (req as any).jsonql = query;

    // 6. Auto-Handle if executor is provided
    if (this.canExecute && this.transpiler && this.hydrator) {
      if (!tableName) {
        throw new BadRequestException({
          error: 'Bad Request',
          details: 'Table name could not be inferred',
        });
      }

      // Transpile
      let sql: string;
      let parameters: any[];
      try {
        const result = this.transpiler.transpile(query, tableName, this.options.schema);
        sql = result.sql;
        parameters = result.parameters;
      } catch (err: any) {
        throw new BadRequestException({
          error: 'Transpilation Error',
          details: err.message,
        });
      }

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
        throw new BadRequestException({
          error: 'Execution Error',
          details: err.message,
        });
      }

      const duration = Date.now() - start;
      this.logger.debug(`[JSONQL] Time:    ${duration}ms`);
      this.logger.debug(`[JSONQL] Rows:    ${flatRows.length}`);
      this.logger.debug(
        `[JSONQL] -----------------------------------------------------------------`,
      );

      if (this.options.beforeHydrate) {
        flatRows = await this.options.beforeHydrate(flatRows, req);
      }

      // Hydrate
      let data = this.hydrator.hydrate(flatRows, this.options.schema, tableName);

      if (this.options.afterHydrate) {
        data = await this.options.afterHydrate(data, req);
      }

      if (this.options.afterQuery) {
        data = await this.options.afterQuery(data, req);
      }

      return { meta: { query }, data };
    }

    return { meta: { query } };
  }
}

@Module({})
export class JsonqlModule {
  static forRoot(options: JsonqlNestOptions): DynamicModule {
    return {
      module: JsonqlModule,
      providers: [
        {
          provide: JSONQL_OPTIONS,
          useValue: options,
        },
        JsonqlService,
      ],
      exports: [JsonqlService],
    };
  }

  static forRootAsync(options: JsonqlModuleAsyncOptions): DynamicModule {
    return {
      module: JsonqlModule,
      imports: options.imports || [],
      providers: [
        {
          provide: JSONQL_OPTIONS,
          useFactory: options.useFactory,
          inject: options.inject || [],
        },
        JsonqlService,
      ],
      exports: [JsonqlService],
    };
  }
}

@Catch()
export class JsonqlExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message: any = {
      statusCode: status,
      message: 'Internal server error',
    };

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      message = exception.getResponse();
    } else if (
      // Check for "foreign" HttpException (from another node_modules instance)
      exception &&
      typeof exception === 'object' &&
      typeof (exception as any).getStatus === 'function' &&
      typeof (exception as any).getResponse === 'function'
    ) {
      status = (exception as any).getStatus();
      message = (exception as any).getResponse();
    }

    response.status(status).json(message);
  }
}
