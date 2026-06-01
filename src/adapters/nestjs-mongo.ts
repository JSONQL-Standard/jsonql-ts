import { Injectable, Inject, HttpStatus } from '@nestjs/common';
import { Request } from 'express';
import { MongoBaseHandler, MongoAdapterOptions } from './mongo-base';

export const JSONQL_MONGO_OPTIONS = 'JSONQL_MONGO_OPTIONS';

export type JsonqlMongoOptions = MongoAdapterOptions<Request>;

/**
 * NestJS service for JSONQL backed by MongoDB.
 *
 * Mirrors {@link JsonqlService} but executes against a MongoDB database.
 * Throws plain error objects (not HttpExceptions) to avoid cross-module
 * `instanceof` issues; pair with `JsonqlExceptionFilter` when not passing `res`.
 *
 * @example
 * ```ts
 * this.jsonql = new JsonqlMongoService({ database: client.db('mydb'), schema });
 * // in controller:
 * return this.jsonql.handleRequest(req, req.path, res);
 * ```
 */
@Injectable()
export class JsonqlMongoService extends MongoBaseHandler<Request> {
  constructor(@Inject(JSONQL_MONGO_OPTIONS) options: JsonqlMongoOptions) {
    super(options);
  }

  protected createError(status: number, error: string, details: any, errorCode?: string): never {
    throw { status, error, details, error_code: errorCode };
  }

  async handleRequest(req: Request, path?: string, res?: any): Promise<any> {
    try {
      let rawQuery: any;

      if (req.method === 'GET') {
        const q = req.query.q;
        try {
          rawQuery = JSON.parse((q as string) || '{}');
        } catch (e) {
          throw {
            status: 400,
            error: 'Bad Request',
            details: 'Invalid JSON in query parameter "q"',
          };
        }
      } else {
        rawQuery = req.body;
      }

      const pathName = (path !== undefined ? path : req.path).replace(/^\/|\/$/g, '');
      const result = await this.processRequest(rawQuery, req, req.method, pathName);
      const body = result ?? { meta: { query: rawQuery } };

      if (res) {
        return res.status(200).json(body);
      }
      return body;
    } catch (err: any) {
      const status = err?.status || HttpStatus.BAD_REQUEST;
      const error = err?.error || err?.message || 'Internal Server Error';
      const details = err?.details || err?.message || error;
      const error_code = err?.error_code;

      if (res) {
        const responseBody: any = { error, details };
        if (error_code) {
          responseBody.error_code = error_code;
        }
        return res.status(status).json(responseBody);
      }

      throw Object.assign(new Error(error), { status, error, details, error_code });
    }
  }
}
