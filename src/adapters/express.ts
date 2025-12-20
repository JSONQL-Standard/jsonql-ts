import { Request, Response, NextFunction } from 'express';
import { JSONQLParser } from '../core';
import { SQLTranspiler } from '../transpiler';
import { ResultHydrator } from '../hydrator';
import { JSONQLValidator } from '../validator';
import { AdapterOptions, FrameworkAdapter } from './types';

export type JsonqlExpressOptions = AdapterOptions<Request>;

export class ExpressAdapter implements FrameworkAdapter<Request> {
  private parser: JSONQLParser;
  private transpiler: SQLTranspiler | null;
  private hydrator: ResultHydrator | null;
  private canExecute: boolean;

  constructor(private options: JsonqlExpressOptions) {
    this.parser = new JSONQLParser();
    this.canExecute = !!(options.execute || options.driver);

    // Infer dialect from driver if not explicitly provided
    const dialect = options.dialect || (options.driver ? options.driver.dialect : 'sqlite');

    this.transpiler = this.canExecute ? new SQLTranspiler(dialect) : null;
    this.hydrator = this.canExecute ? new ResultHydrator() : null;
  }

  async handleRequest(rawInput: any, req: Request): Promise<any> {
    let rawQuery = rawInput;

    if (this.options.beforeParse) {
      rawQuery = await this.options.beforeParse(rawQuery, req);
    }

    // 2. Parse
    let query = this.parser.parse(rawQuery);

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
        if (!tableName) {
          // Resolve from URL alias
          tableName = this.options.tables[pathName];
          if (!tableName) {
             // If strict mapping is enabled, we might want to throw 404 here, 
             // but returning null allows Express to continue matching other routes if this wasn't a match.
             // However, if the user sent a JSONQL query body but to a wrong path, maybe we should error?
             // For now, let's assume if we can't resolve a table, we treat it as "not a jsonql request for this table"
             // But if 'from' WAS provided, we check below.
          }
        } else {
          // If 'from' is explicit, ensure it's a valid target in the mapping
          const allowedTables = Object.values(this.options.tables);
          if (!allowedTables.includes(tableName)) {
            throw { status: 403, error: 'Forbidden', details: `Table '${tableName}' is not allowed` };
          }
        }
      }
    } else {
      // Default Mode: Open
      if (!tableName) {
        tableName = pathName;
      }
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
        throw { status: 400, error: 'Validation Error', details: validation.errors };
      }
    }

    // 5. Attach to Request
    (req as any).jsonql = query;

    // 6. Auto-Handle if executor is provided
    if (this.canExecute && this.transpiler && this.hydrator) {
      if (!tableName) {
        return null; // Pass to next()
      }

      // Transpile
      const { sql, parameters } = this.transpiler.transpile(query, tableName);

      // Execute
      let flatRows: any[] = [];
      try {
        if (this.options.driver) {
          flatRows = await this.options.driver.query(sql, parameters);
        } else if (this.options.execute) {
          flatRows = await this.options.execute(sql, parameters);
        }
      } catch (err: any) {
        throw { status: 400, error: 'Execution Error', details: err.message };
      }

      if (this.options.beforeHydrate) {
        flatRows = await this.options.beforeHydrate(flatRows, req);
      }

      // Hydrate
      let data = this.hydrator.hydrate(flatRows);

      if (this.options.afterHydrate) {
        data = await this.options.afterHydrate(data, req);
      }

      if (this.options.afterQuery) {
        data = await this.options.afterQuery(data, req);
      }

      return { meta: { query }, data };
    }

    return null;
  }

  middleware() {
    return async (req: Request, res: Response, next: NextFunction) => {
      try {
        // 1. Extract Query
        const rawQuery = req.method === 'GET' ? JSON.parse((req.query.q as string) || '{}') : req.body;

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

