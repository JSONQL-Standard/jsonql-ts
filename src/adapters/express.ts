import { Request, Response, NextFunction } from 'express';
import { JSONQLParser } from '../core';
import { SQLTranspiler } from '../transpiler';
import { ResultHydrator } from '../hydrator';
import { JSONQLSchema } from '../types';
import { JSONQLValidator } from '../validator';

export interface JsonqlExpressOptions {
  schema?: JSONQLSchema;
  execute?: (sql: string, params: any[]) => Promise<any[]>;
  dialect?: 'sqlite' | 'postgres' | 'mysql';
}

export function jsonqlExpress(options: JsonqlExpressOptions = {}) {
  const parser = new JSONQLParser();
  const transpiler = options.execute ? new SQLTranspiler(options.dialect || 'sqlite') : null;
  const hydrator = options.execute ? new ResultHydrator() : null;

  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      // 1. Extract Query
      const rawQuery = req.method === 'GET' 
        ? JSON.parse(req.query.q as string || '{}') 
        : req.body;

      // 2. Parse
      const query = parser.parse(rawQuery);

      // 3. Infer Table Name
      // Priority: 1. Query 'from' | 2. URL Path
      let tableName = query.from;
      if (!tableName) {
        tableName = req.path.replace(/^\/|\/$/g, '');
      }

      // 4. Validate against Schema (if provided)
      if (options.schema && tableName) {
        const validator = new JSONQLValidator(options.schema, tableName);
        const validation = validator.validate(query);
        
        if (!validation.valid) {
          res.status(400).json({
            error: 'Validation Error',
            details: validation.errors
          });
          return;
        }
      }

      // 5. Attach to Request
      (req as any).jsonql = query;

      // 6. Auto-Handle if executor is provided
      if (options.execute && transpiler && hydrator) {
        if (!tableName) {
          return next();
        }

        // Transpile
        const { sql, parameters } = transpiler.transpile(query, tableName);

        // Execute
        const flatRows = await options.execute(sql, parameters);

        // Hydrate
        const data = hydrator.hydrate(flatRows);

        // Respond
        res.json({ meta: { query }, data });
        return;
      }

      next();
    } catch (err: any) {
      res.status(400).json({
        error: 'Invalid JSONQL Query',
        details: err.message
      });
    }
  };
}
