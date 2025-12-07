import { Request, Response, NextFunction } from 'express';
import { JSONQLParser } from '../core';

export interface JsonqlExpressOptions {
  schema?: any; // Should be JSONQLSchema
}

export function jsonqlExpress(options: JsonqlExpressOptions = {}) {
  const parser = new JSONQLParser();

  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      // 1. Extract Query
      const rawQuery = req.method === 'GET' 
        ? JSON.parse(req.query.q as string || '{}') 
        : req.body;

      // 2. Parse & Validate
      const query = parser.parse(rawQuery);

      // 3. Attach to Request (for downstream handlers to execute)
      (req as any).jsonql = query;

      next();
    } catch (err: any) {
      res.status(400).json({
        error: 'Invalid JSONQL Query',
        details: err.message
      });
    }
  };
}
