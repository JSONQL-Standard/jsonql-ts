import Fastify from 'fastify';
import { jsonqlFastify, ResultHydrator } from '@jsonql-standard/jsonql-ts';
import { DBAdapter } from '../db';

export async function startFastifyServer(db: DBAdapter, port: number) {
  const fastify = Fastify({ logger: true });
  
  // Register Plugin with execution logic
  fastify.register(jsonqlFastify, {
    // We can pass a custom execute function or a driver object
    // The adapter expects a driver with .query() or an execute() function
    execute: async (sql: string, params: any[]) => {
      console.log(`[Fastify] Executing SQL: ${sql}`);
      return await db.query(sql, params);
    },
    // We need to tell it the dialect so it sets up the transpiler correctly
    dialect: db.dialect
  });

  try {
    await fastify.listen({ port, host: '0.0.0.0' });
    console.log(`Compliance Server (Fastify) running on http://localhost:${port}`);
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
}
