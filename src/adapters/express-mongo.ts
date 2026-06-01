import { Request, Response, NextFunction } from 'express';
import { MongoBaseHandler, MongoAdapterOptions } from './mongo-base';
import { FrameworkAdapter } from './types';

export type JsonqlExpressMongoOptions = MongoAdapterOptions<Request>;

/**
 * Express adapter for JSONQL backed by MongoDB.
 *
 * Mirrors {@link ExpressAdapter} but executes against a MongoDB database
 * instead of a SQL driver. Returns the same `{ meta, data }` response envelope.
 *
 * @example
 * ```ts
 * import { MongoClient } from 'mongodb';
 * const client = await new MongoClient(uri).connect();
 * app.use('/', new ExpressMongoAdapter({ database: client.db('mydb'), schema }).middleware());
 * ```
 */
export class ExpressMongoAdapter
  extends MongoBaseHandler<Request>
  implements FrameworkAdapter<Request>
{
  constructor(options: JsonqlExpressMongoOptions) {
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

export function jsonqlExpressMongo(options: JsonqlExpressMongoOptions) {
  return new ExpressMongoAdapter(options).middleware();
}
