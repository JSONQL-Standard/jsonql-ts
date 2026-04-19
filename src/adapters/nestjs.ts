import {
  Injectable,
  Inject,
  Module,
  DynamicModule,
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpStatus,
} from '@nestjs/common';
import { Request } from 'express';
import { BaseHandler } from './base';
import { AdapterOptions } from './types';

export const JSONQL_OPTIONS = 'JSONQL_OPTIONS';

export type JsonqlNestOptions = AdapterOptions<Request>;

export interface JsonqlModuleAsyncOptions {
  imports?: any[];
  useFactory: (...args: any[]) => Promise<JsonqlNestOptions> | JsonqlNestOptions;
  inject?: any[];
}

@Injectable()
export class JsonqlService extends BaseHandler<Request> {
  constructor(@Inject(JSONQL_OPTIONS) options: JsonqlNestOptions) {
    super(options);
  }

  /**
   * Throw plain error objects (not NestJS-specific HttpExceptions).
   *
   * This avoids cross-module `instanceof` issues that arise when the SDK
   * and the consumer app resolve `@nestjs/common` to different copies
   * (common with `file:` links, monorepos, or version mismatches).
   *
   * Errors are caught and normalised by `handleRequest()`.
   */
  protected createError(status: number, error: string, details: any, errorCode?: string): never {
    throw { status, error, details, error_code: errorCode };
  }

  /**
   * Handle a NestJS request through the JSONQL pipeline.
   *
   * **Recommended (with `res`)** — the adapter handles the full HTTP
   * response, including error normalisation.  No exception filter needed:
   *
   * ```ts
   * @All(':resource')
   * async handle(@Req() req: Request, @Res() res: Response) {
   *   return this.jsonql.handleRequest(req, req.path, res);
   * }
   * ```
   *
   * **Without `res`** — returns data on success; throws on error.
   * Pair with `@UseFilters(JsonqlExceptionFilter)` for normalised errors:
   *
   * ```ts
   * @UseFilters(JsonqlExceptionFilter)
   * @Controller()
   * export class AppController {
   *   @All(':resource')
   *   async handle(@Req() req: Request) {
   *     return this.jsonql.handleRequest(req, req.path);
   *   }
   * }
   * ```
   */
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
      const { status, error, details, error_code } = normaliseError(err);

      if (res) {
        const body: any = { error, details };
        if (error_code) {
          body.error_code = error_code;
        }
        return res.status(status).json(body);
      }

      // Without res, throw a plain object for NestJS's exception layer.
      // Use JsonqlExceptionFilter to normalise the response format.
      throw Object.assign(new Error(error), { status, error, details, error_code });
    }
  }
}

@Module({})
export class JsonqlModule {
  static forRoot(options: JsonqlNestOptions): DynamicModule {
    return {
      module: JsonqlModule,
      providers: [{ provide: JSONQL_OPTIONS, useValue: options }, JsonqlService],
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

/* ------------------------------------------------------------------ */
/*  Shared error normalisation                                        */
/* ------------------------------------------------------------------ */

/** Extract { status, error, details, error_code } from any thrown value. */
function normaliseError(err: any): {
  status: number;
  error: string;
  details: any;
  error_code?: string;
} {
  // Duck-type HttpException-like objects (works across module copies)
  if (typeof err?.getStatus === 'function') {
    const status: number = err.getStatus();
    const body = typeof err?.getResponse === 'function' ? err.getResponse() : {};
    const error = typeof body === 'string' ? body : body?.error || body?.message || 'Error';
    const details = typeof body === 'string' ? body : body?.details || error;
    const error_code = body?.error_code;
    return { status, error, details, error_code };
  }

  // Plain error objects: { status, error, details, error_code }
  const status = err?.status || HttpStatus.BAD_REQUEST;
  const error = err?.error || err?.message || 'Internal Server Error';
  const details = err?.details || err?.message || error;
  const error_code = err?.error_code;
  return { status, error, details, error_code };
}

/**
 * Exception filter that normalises **all** errors to `{ error, details }`.
 *
 * Uses duck-typing instead of `instanceof` so it works even when the SDK
 * and the consumer app resolve `@nestjs/common` to different copies.
 *
 * Apply per-controller or globally:
 *
 * ```ts
 * // Per-controller
 * @UseFilters(JsonqlExceptionFilter)
 * @Controller()
 * export class AppController { … }
 *
 * // Globally
 * app.useGlobalFilters(new JsonqlExceptionFilter());
 * ```
 */
@Catch()
export class JsonqlExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const response = host.switchToHttp().getResponse();
    const { status, error, details, error_code } = normaliseError(exception);
    const body: any = { error, details };
    if (error_code) {
      body.error_code = error_code;
    }
    response.status(status).json(body);
  }
}
