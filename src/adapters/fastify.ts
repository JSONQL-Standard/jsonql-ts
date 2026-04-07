import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
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

  protected createError(status: number, error: string, details: any): never {
    throw { status, error, details };
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

export const jsonqlFastify = fp(async function (
  fastify: FastifyInstance,
  options: JsonqlFastifyOptions,
) {
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
      reply.status(status).send({
        error: err.error || 'Internal Server Error',
        details: err.details || err.message,
      });
    }
  };

  fastify.all('/', handler);
  fastify.all('/:table', handler);
});
