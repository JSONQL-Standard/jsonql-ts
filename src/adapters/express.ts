import { Request, Response, NextFunction } from 'express';
import { BaseHandler } from './base';
import { AdapterOptions, FrameworkAdapter } from './types';
import { DatabaseDriver } from '../driver';

export interface JsonqlExpressOptions extends AdapterOptions<Request> {
  driver?: DatabaseDriver;
}

export class ExpressAdapter extends BaseHandler<Request> implements FrameworkAdapter<Request> {
  constructor(options: JsonqlExpressOptions) {
    super(options);
  }

  protected createError(status: number, error: string, details: any, errorCode?: string): never {
    throw { status, error, details, error_code: errorCode };
  }

  async handleRequest(rawInput: any, req: Request): Promise<any> {
    const pathName = req.path.replace(/^\/|\/$/g, '');
    return this.processRequest(rawInput, req, req.method, pathName);
  }

  middleware() {
    return async (req: Request, res: Response, next: NextFunction) => {
      try {
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
        const body: any = {
          error: err.error || 'Invalid JSONQL Query',
          details: err.details || err.message,
        };
        if (err.error_code) {
          body.error_code = err.error_code;
        }
        res.status(status).json(body);
      }
    };
  }
}

export function jsonqlExpress(options: JsonqlExpressOptions = {}) {
  return new ExpressAdapter(options).middleware();
}
