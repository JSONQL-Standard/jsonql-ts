import * as fs from 'fs';
import * as path from 'path';
import { Database } from 'sqlite';
import request from 'supertest';
import express from 'express';
import Fastify, { FastifyInstance } from 'fastify';
import { Test } from '@nestjs/testing';
import { Controller, All, Req, Module, Param } from '@nestjs/common';
import { Request } from 'express';

import { jsonqlExpress } from '../../../src/adapters/express';
import { jsonqlFastify } from '../../../src/adapters/fastify';
import { JsonqlModule, JsonqlService } from '../../../src/adapters/nestjs';
import { SQLiteDriver } from '../../../src/drivers/sqlite';
import { setupSQLiteDB } from '../../fixtures/setup-db';

const SUITES_DIR = path.resolve(__dirname, '../../fixtures/suites/standard/tests');
const SCHEMA_PATH = path.resolve(__dirname, '../../fixtures/suites/standard/schema.json');

let globalSchema: any = {};
if (fs.existsSync(SCHEMA_PATH)) {
  globalSchema = JSON.parse(fs.readFileSync(SCHEMA_PATH, 'utf-8'));
  if (!globalSchema.tables) {
    globalSchema = { tables: globalSchema };
  }
}

// --- NestJS Setup Helper ---
@Controller('api')
class TestController {
  constructor(private jsonqlService: JsonqlService) {}

  @All(':table')
  async handle(@Req() req: Request, @Param('table') table: string) {
    return await this.jsonqlService.handleRequest(req, table);
  }
}

async function createNestApp(db: Database) {
  const moduleRef = await Test.createTestingModule({
    imports: [
      JsonqlModule.forRoot({
        driver: new SQLiteDriver(db),
        schema: globalSchema,
      }),
    ],
    controllers: [TestController],
  }).compile();

  const app = moduleRef.createNestApplication();
  await app.init();
  return app;
}

// --- Express Setup Helper ---
function createExpressApp(db: Database) {
  const app = express();
  app.use(express.json());
  // Mount at /api so that /api/users -> req.path = /users
  app.use(
    '/api',
    jsonqlExpress({
      driver: new SQLiteDriver(db),
      schema: globalSchema,
    }),
  );
  return app;
}

// --- Fastify Setup Helper ---
async function createFastifyApp(db: Database) {
  const app = Fastify();
  await app.register(
    async (instance) => {
      await instance.register(jsonqlFastify, {
        driver: new SQLiteDriver(db),
        schema: globalSchema,
      });
    },
    { prefix: '/api' },
  );
  await app.ready();
  return app;
}

describe('Ecosystem Compliance Tests (HTTP Adapters)', () => {
  let db: Database;
  let expressApp: express.Express;
  let fastifyApp: FastifyInstance;
  let nestApp: any;

  beforeAll(async () => {
    db = await setupSQLiteDB();
    expressApp = createExpressApp(db);
    fastifyApp = await createFastifyApp(db);
    nestApp = await createNestApp(db);
  });

  afterAll(async () => {
    await nestApp.close();
    await fastifyApp.close();
    await db.close();
  });

  if (!fs.existsSync(SUITES_DIR)) {
    console.warn(`Spec directory not found at ${SUITES_DIR}, skipping ecosystem tests.`);
    return;
  }

  const files = fs.readdirSync(SUITES_DIR).filter((f) => f.endsWith('.json'));

  files.forEach((file) => {
    const content = fs.readFileSync(path.join(SUITES_DIR, file), 'utf-8');
    const testCases = JSON.parse(content);

    describe(`Suite: ${file}`, () => {
      testCases.forEach((tc: any) => {
        // Skip tests that don't have an expected result (e.g. syntax errors checked in unit tests)
        // or if they are purely unit tests for the parser.
        // However, for HTTP, we expect 200 OK and data for valid queries, and 400 for invalid.

        const testName = `${tc.id}: ${tc.description}`;

        // Helper to normalize response body
        const normalize = (body: any) => {
          // Some adapters might wrap differently, but standard is { meta, data }
          return body;
        };

        const runTest = async (adapterName: string, makeRequest: () => Promise<any>) => {
          const response = await makeRequest();

          if (tc.valid === false) {
            if (response.status === 200) {
              throw new Error(
                `[${adapterName}] Expected failure but got 200 OK. Response: ${JSON.stringify(response.body)}`,
              );
            }
            expect(response.status).toBeGreaterThanOrEqual(400);
          } else {
            if (response.status !== 200) {
              throw new Error(
                `[${adapterName}] Expected 200 OK but got ${response.status}. Response: ${JSON.stringify(response.body)}`,
              );
            }

            const body = normalize(response.body);

            // If expectedResult is defined, check data length and content
            if (tc.expectedResult) {
              expect(body.data).toBeDefined();
              expect(body.data).toHaveLength(tc.expectedResult.length);
              // Use toMatchObject to allow extra fields in response (e.g. select * vs partial expected)
              expect(body.data).toMatchObject(tc.expectedResult);
            }
          }
        };

        // Determine endpoint. Most tests imply a table.
        // If tc.query.from is present, we use that as the table in the URL for REST style: /api/:table
        // But wait, if we send 'from' in body, we can hit /api/root?
        // Our setup:
        // Express: /api/:table -> jsonqlExpress
        // Fastify: /api/:table -> jsonqlFastify
        // NestJS: /api/:table -> handleRequest(req, table)

        // If the query has 'from', we can strip it and use it in URL, OR keep it and use a generic endpoint.
        // But our adapters are configured to handle /api/:table.
        // If we send { from: 'users', ... } to /api/users, the adapter might complain "Cannot specify 'from'..."
        // depending on strict mode.
        // The standard suite usually includes 'from' in the query.
        // Let's assume we should strip 'from' from the body if we pass it in URL,
        // OR we use a root endpoint if available.

        // Current adapter setup in this test:
        // Express: /api/:table
        // Fastify: /api/:table
        // NestJS: /api/:table

        // We don't have a "root" endpoint configured in these helpers easily without conflict.
        // Let's modify the query for the test: extract 'from' and use it as URL param, remove from body.

        let tableName = tc.query.from;
        let queryToSend = { ...tc.query };

        if (tableName) {
          delete queryToSend.from;
        } else {
          // If no table, maybe it's an introspection query or invalid?
          // For now, default to 'users' if missing, or skip if it's a test that requires 'from'.
          if (tc.valid !== false) {
            // If valid and no table, it might be a problem for our REST adapters which expect a table in URL.
            // Let's skip if we can't determine table.
            return;
          }
          tableName = 'unknown';
        }

        test(`[Express] ${testName}`, async () => {
          await runTest('Express', () =>
            request(expressApp).post(`/api/${tableName}`).send(queryToSend),
          );
        });

        test(`[Fastify] ${testName}`, async () => {
          await runTest('Fastify', async () => {
            const res = await fastifyApp.inject({
              method: 'POST',
              url: `/api/${tableName}`,
              payload: queryToSend,
            });
            return { status: res.statusCode, body: res.json() };
          });
        });

        test(`[NestJS] ${testName}`, async () => {
          await runTest('NestJS', () =>
            request(nestApp.getHttpServer()).post(`/api/${tableName}`).send(queryToSend),
          );
        });
      });
    });
  });

  describe('HTTP Integration Edge Cases', () => {
    test('[Fastify] GET with malformed JSON in q param should return 400', async () => {
      const res = await fastifyApp.inject({
        method: 'GET',
        url: '/api/users?q=%7Bbroken_json', // {broken_json
      });
      expect(res.statusCode).toBe(400);
      const body = res.json();
      expect(body.error).toBe('Bad Request');
    });

    test('[Express] GET with malformed JSON in q param should return 400', async () => {
      const res = await request(expressApp).get('/api/users?q=%7Bbroken_json');
      expect(res.status).toBe(400);
    });

    // NestJS might handle this differently depending on global pipes, but let's check
    test('[NestJS] GET with malformed JSON in q param should return 400', async () => {
      const res = await request(nestApp.getHttpServer()).get('/api/users?q=%7Bbroken_json');
      // NestJS default body parser might not apply to query params manually parsed.
      // Our NestJS adapter uses `req.query.q` and parses it?
      // Let's check NestJS adapter implementation if this fails.
      // For now, expect 400.
      expect(res.status).toBe(400);
    });
  });
});
