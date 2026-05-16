import { FastifyRequest, FastifyReply, FastifyPluginAsync } from 'fastify';
import fp from 'fastify-plugin';
import { BaseHandler } from './base';
import { AdapterOptions, FrameworkAdapter } from './types';

export type JsonqlFastifyOptions = AdapterOptions<FastifyRequest>;

export class FastifyAdapter
  extends BaseHandler<FastifyRequest>
  implements FrameworkAdapter<FastifyRequest>
{
  constructor(options: JsonqlFastifyOptions) {
    super(options);
  }

  protected createError(status: number, error: string, details: any, errorCode?: string): never {
    throw { status, error, details, error_code: errorCode };
  }

  async handleRequest(
    rawInput: any,
    req: FastifyRequest,
    routeParams?: { table?: string },
  ): Promise<any> {
    const pathName = routeParams?.table || '';
    return this.processRequest(rawInput, req, req.method, pathName);
  }
}

const plugin: FastifyPluginAsync<JsonqlFastifyOptions> = async function (fastify, options) {
  const adapter = new FastifyAdapter(options);

  const handler = async (req: FastifyRequest, reply: FastifyReply) => {
    try {
      let rawInput;
      if (req.method === 'GET') {
        try {
          rawInput = JSON.parse((req.query as any).q || '{}');
        } catch (e: any) {
          throw { status: 400, error: 'Bad Request', details: e.message };
        }
      } else {
        rawInput = req.body;
      }

      const params = req.params as { table?: string };
      const result = await adapter.handleRequest(rawInput, req, params);
      reply.send(result);
    } catch (err: any) {
      const status = err.status || 500;
      const body: any = {
        error: err.error || 'Internal Server Error',
        details: err.details || err.message,
      };
      if (err.error_code) {
        body.error_code = err.error_code;
      }
      reply.status(status).send(body);
    }
  };

  fastify.all('/', handler);
  fastify.all('/:table', handler);
};

export const jsonqlFastify = fp(plugin);
