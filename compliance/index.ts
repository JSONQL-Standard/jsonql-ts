import { initDB } from './db';
import { startExpressServer } from './adapters/express';
import { startFastifyServer } from './adapters/fastify';

const PORT = parseInt(process.env.PORT || '8080', 10);
const FRAMEWORK = process.env.JSONQL_FRAMEWORK || 'express';

async function main() {
  try {
    const db = await initDB();

    console.log(`Starting Compliance Server with framework: ${FRAMEWORK}`);

    switch (FRAMEWORK) {
      case 'express':
        await startExpressServer(db, PORT);
        break;
      case 'fastify':
        await startFastifyServer(db, PORT);
        break;
      default:
        console.error(`Unknown framework: ${FRAMEWORK}`);
        process.exit(1);
    }
  } catch (err) {
    console.error('Failed to start server:', err);
    process.exit(1);
  }
}

main();
