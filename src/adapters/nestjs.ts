import { Injectable, NestMiddleware, BadRequestException } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { JSONQLParser } from '../core';

@Injectable()
export class JsonqlMiddleware implements NestMiddleware {
  private parser = new JSONQLParser();

  use(req: Request, res: Response, next: NextFunction) {
    try {
      const rawQuery = req.method === 'GET'
        ? JSON.parse(req.query.q as string || '{}')
        : req.body;

      const query = this.parser.parse(rawQuery);
      (req as any).jsonql = query;
      next();
    } catch (err: any) {
      throw new BadRequestException({
        error: 'Invalid JSONQL Query',
        details: err.message
      });
    }
  }
}
