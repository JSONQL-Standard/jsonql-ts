import {
  Injectable,
  Inject,
  Module,
  DynamicModule,
  BadRequestException,
  ForbiddenException,
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
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

  protected createError(status: number, error: string, details: any): never {
    if (status === 403) {
      throw new ForbiddenException({ error, details });
    }
    throw new BadRequestException({ error, details });
  }

  async handleRequest(req: Request, path?: string): Promise<any> {
    let rawQuery: any;

    if (req.method === 'GET') {
      const q = req.query.q;
      try {
        rawQuery = JSON.parse((q as string) || '{}');
      } catch (e) {
        throw new BadRequestException({
          error: 'Bad Request',
          details: 'Invalid JSON in query parameter "q"',
        });
      }
    } else {
      rawQuery = req.body;
    }

    const pathName = (path !== undefined ? path : req.path).replace(/^\/|\/$/g, '');
    const result = await this.processRequest(rawQuery, req, req.method, pathName);
    return result ?? { meta: { query: rawQuery } };
  }
}

@Module({})
export class JsonqlModule {
  static forRoot(options: JsonqlNestOptions): DynamicModule {
    return {
      module: JsonqlModule,
      providers: [
        { provide: JSONQL_OPTIONS, useValue: options },
        JsonqlService,
      ],
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

@Catch()
export class JsonqlExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message: any = { statusCode: status, message: 'Internal server error' };

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      message = exception.getResponse();
    } else if (
      exception &&
      typeof exception === 'object' &&
      typeof (exception as any).getStatus === 'function' &&
      typeof (exception as any).getResponse === 'function'
    ) {
      status = (exception as any).getStatus();
      message = (exception as any).getResponse();
    }

    response.status(status).json(message);
  }
}
