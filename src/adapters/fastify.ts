import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import fp from 'fastify-plugin';
import { JSONQLParser } from '../core';

export interface JsonqlFastifyOptions {
  schema?: any;
}

export const jsonqlFastify = fp(async function (fastify: FastifyInstance, options: JsonqlFastifyOptions) {
  const parser = new JSONQLParser();

  fastify.decorateRequest('jsonql', null);

  fastify.addHook('preHandler', async (req: FastifyRequest, reply: FastifyReply) => {
    try {
      const rawQuery = req.method === 'GET'
        ? JSON.parse((req.query as any).q || '{}')
        : req.body;

      const query = parser.parse(rawQuery);
      (req as any).jsonql = query;
    } catch (err: any) {
      reply.code(400).send({
        error: 'Invalid JSONQL Query',
        details: err.message
      });
    }
  });
});
