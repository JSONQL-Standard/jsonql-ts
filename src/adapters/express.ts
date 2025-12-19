import { Request, Response, NextFunction } from 'express';
import { JSONQLParser } from '../core';
import { SQLTranspiler } from '../transpiler';
import { ResultHydrator } from '../hydrator';
import { JSONQLSchema, JSONQLQuery, ValidationResult } from '../types';
import { JSONQLValidator } from '../validator';
import { DatabaseDriver } from '../driver';

export interface JsonqlExpressOptions {
  schema?: JSONQLSchema;
  driver?: DatabaseDriver;
  execute?: (sql: string, params: any[]) => Promise<any[]>;
  dialect?: 'sqlite' | 'postgres' | 'mysql';

  // Lifecycle Hooks
  beforeParse?: (rawInput: any, context: Request) => Promise<any> | any;
  afterParse?: (query: JSONQLQuery, context: Request) => Promise<JSONQLQuery> | JSONQLQuery;
  beforeQuery?: (query: JSONQLQuery, context: Request) => Promise<JSONQLQuery> | JSONQLQuery;
  beforeValidate?: (query: JSONQLQuery, context: Request) => Promise<JSONQLQuery> | JSONQLQuery;
  afterValidate?: (result: ValidationResult, context: Request) => Promise<void> | void;
  beforeHydrate?: (flatRows: any[], context: Request) => Promise<any[]> | any[];
  afterHydrate?: (result: any, context: Request) => Promise<any> | any;
  afterQuery?: (result: any, context: Request) => Promise<any> | any;
}

export function jsonqlExpress(options: JsonqlExpressOptions = {}) {
  const parser = new JSONQLParser();
  const canExecute = !!(options.execute || options.driver);

  // Infer dialect from driver if not explicitly provided
  const dialect = options.dialect || (options.driver ? options.driver.dialect : 'sqlite');

  const transpiler = canExecute ? new SQLTranspiler(dialect) : null;
  const hydrator = canExecute ? new ResultHydrator() : null;

  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      // 1. Extract Query
      let rawQuery = req.method === 'GET' ? JSON.parse((req.query.q as string) || '{}') : req.body;

      if (options.beforeParse) {
        rawQuery = await options.beforeParse(rawQuery, req);
      }

      // 2. Parse
      let query = parser.parse(rawQuery);

      if (options.afterParse) {
        query = await options.afterParse(query, req);
      }

      // 3. Infer Table Name
      // Priority: 1. Query 'from' | 2. URL Path
      let tableName = query.from;
      if (!tableName) {
        tableName = req.path.replace(/^\/|\/$/g, '');
      }

      if (options.beforeQuery) {
        query = await options.beforeQuery(query, req);
      }

      if (options.beforeValidate) {
        query = await options.beforeValidate(query, req);
      }

      // 4. Validate against Schema (if provided)
      if (options.schema && tableName) {
        const validator = new JSONQLValidator(options.schema, tableName);
        const validation = validator.validate(query);

        if (options.afterValidate) {
          await options.afterValidate(validation, req);
        }

        if (!validation.valid) {
          res.status(400).json({
            error: 'Validation Error',
            details: validation.errors,
          });
          return;
        }
      }

      // 5. Attach to Request
      (req as any).jsonql = query;

      // 6. Auto-Handle if executor is provided
      if (canExecute && transpiler && hydrator) {
        if (!tableName) {
          return next();
        }

        // Transpile
        const { sql, parameters } = transpiler.transpile(query, tableName);

        // Execute
        let flatRows: any[] = [];
        try {
          if (options.driver) {
            flatRows = await options.driver.query(sql, parameters);
          } else if (options.execute) {
            flatRows = await options.execute(sql, parameters);
          }
        } catch (err: any) {
          res.status(400).json({
            error: 'Execution Error',
            details: err.message,
          });
          return;
        }

        if (options.beforeHydrate) {
          flatRows = await options.beforeHydrate(flatRows, req);
        }

        // Hydrate
        let data = hydrator.hydrate(flatRows);

        if (options.afterHydrate) {
          data = await options.afterHydrate(data, req);
        }

        if (options.afterQuery) {
          data = await options.afterQuery(data, req);
        }

        // Respond
        res.json({ meta: { query }, data });
        return;
      }

      next();
    } catch (err: any) {
      res.status(400).json({
        error: 'Invalid JSONQL Query',
        details: err.message,
      });
    }
  };
}
