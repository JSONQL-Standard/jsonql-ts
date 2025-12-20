import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import fp from 'fastify-plugin';
import { JSONQLParser } from '../core';
import { SQLTranspiler } from '../transpiler';
import { ResultHydrator } from '../hydrator';
import { JSONQLValidator } from '../validator';
import { AdapterOptions, FrameworkAdapter } from './types';
import { Logger, ConsoleLogger, NoOpLogger } from '../logger';

export type JsonqlFastifyOptions = AdapterOptions<FastifyRequest>;

export class FastifyAdapter implements FrameworkAdapter<FastifyRequest> {
  private parser: JSONQLParser;
  private transpiler: SQLTranspiler | null;
  private hydrator: ResultHydrator | null;
  private canExecute: boolean;
  private logger: Logger;

  constructor(private options: JsonqlFastifyOptions) {
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

  async handleRequest(
    rawInput: any,
    req: FastifyRequest,
    routeParams?: { table?: string },
  ): Promise<any> {
    let rawQuery = rawInput;

    if (this.options.beforeParse) {
      rawQuery = await this.options.beforeParse(rawQuery, req);
    }

    // 2. Parse
    let query;
    try {
      query = this.parser.parse(rawQuery);
    } catch (e: any) {
      throw {
        status: 400,
        error: 'Invalid JSONQL Query',
        details: e.message,
      };
    }

    if (this.options.afterParse) {
      query = await this.options.afterParse(query, req);
    }

    // 3. Infer & Validate Table Name
    let tableName = query.from;
    // In Fastify, we pass the table param explicitly from the route handler
    const pathName = routeParams?.table || '';

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
            // If no table name in query, and path is not mapped, we can't proceed unless we assume path IS the table
            // But strict mode says: if it's not in the map, and we are not at root, is it allowed?
            // If tables map is provided, we usually expect strict adherence.
            // However, if the user wants to allow /users -> users without explicit mapping, they should add it to the map.
            // But for convenience, if the path matches a value in the map (reverse lookup), maybe?
            // For now, let's stick to: if map is present, path MUST be in map OR be root.

            // Actually, let's allow direct table access if it's in the allowed values?
            // No, that defeats the purpose of aliasing.

            // Let's check if the path corresponds to a valid table in the values
            const isDirectTable = Object.values(this.options.tables).includes(pathName);
            if (isDirectTable) {
              // If strict mapping is desired, this might be unwanted.
              // But usually tables: { 'sales': 'orders' } implies 'sales' is the public name.
              // If I access /orders, should it work?
              // Express adapter implementation:
              // if (!mappedTable) { ... if (pathName === '') ... else { throw ... } }
              // So Express adapter strictly forbids unmapped paths if a map is provided.
              throw {
                status: 404,
                error: 'Not Found',
                details: `Endpoint '${pathName}' is not configured`,
              };
            }
            throw {
              status: 404,
              error: 'Not Found',
              details: `Endpoint '${pathName}' is not configured`,
            };
          }
        }
      }
    } else {
      // No tables option provided.
      // If path is present, use it as table.
      if (!tableName && pathName) {
        tableName = pathName;
      }
      // If both present, ensure they match? Or allow override?
      // Express adapter: if (pathName && tableName && pathName !== tableName) -> throw
      if (pathName && tableName && pathName !== tableName) {
        throw {
          status: 400,
          error: 'Bad Request',
          details: `URL path '${pathName}' does not match body 'from' '${tableName}'`,
        };
      }
    }

    // Final check
    if (!tableName) {
      throw { status: 400, error: 'Bad Request', details: 'Table name is required' };
    }

    query.from = tableName;

    // 4. Lifecycle Hooks & Validation
    if (this.options.beforeQuery) {
      query = await this.options.beforeQuery(query, req);
    }

    if (this.options.schema && tableName) {
      const validator = new JSONQLValidator(this.options.schema, tableName);
      if (this.options.beforeValidate) {
        query = await this.options.beforeValidate(query, req);
      }
      const validationResult = validator.validate(query);
      if (this.options.afterValidate) {
        await this.options.afterValidate(validationResult, req);
      }
      if (!validationResult.valid) {
        throw { status: 400, error: 'Validation Error', details: validationResult.errors };
      }
    }

    // 5. Execution
    if (!this.canExecute) {
      return { query }; // Dry run
    }

    const sqlResult = this.transpiler!.transpile(query, tableName, this.options.schema);
    this.logger.debug(`SQL: ${sqlResult.sql}`, sqlResult.parameters);

    const startTime = Date.now();
    let rows = await (this.options.execute
      ? this.options.execute(sqlResult.sql, sqlResult.parameters)
      : this.options.driver!.query(sqlResult.sql, sqlResult.parameters));

    const duration = Date.now() - startTime;
    this.logger.debug(`Execution time: ${duration}ms`);

    if (this.options.beforeHydrate) {
      rows = await this.options.beforeHydrate(rows, req);
    }

    let data = this.hydrator!.hydrate(rows, this.options.schema, tableName);

    if (this.options.afterHydrate) {
      data = await this.options.afterHydrate(data, req);
    }

    if (this.options.afterQuery) {
      data = await this.options.afterQuery(data, req);
    }

    return { meta: { query }, data };
  }
}

export const jsonqlFastify = fp(async function (
  fastify: FastifyInstance,
  options: JsonqlFastifyOptions,
) {
  const adapter = new FastifyAdapter(options);

  const handler = async (req: FastifyRequest, reply: FastifyReply) => {
    try {
      const rawInput = req.method === 'GET' ? JSON.parse((req.query as any).q || '{}') : req.body;
      const params = req.params as { table?: string };

      const result = await adapter.handleRequest(rawInput, req, params);
      reply.send(result);
    } catch (err: any) {
      const status = err.status || 500;
      reply.status(status).send({
        error: err.error || 'Internal Server Error',
        details: err.details || err.message,
      });
    }
  };

  fastify.all('/', handler);
  fastify.all('/:table', handler);
});
