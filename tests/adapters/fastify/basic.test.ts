import Fastify from 'fastify';
import { jsonqlFastify } from '../../../src/adapters/fastify';
import { SQLiteDriver } from '../../../src/drivers/sqlite';
import { setupSQLiteDB } from '../../fixtures/setup-db';
import { Database } from 'sqlite';

describe('Fastify Adapter E2E (SQLite)', () => {
  let app: any;
  let db: Database;

  beforeAll(async () => {
    db = await setupSQLiteDB();
    app = Fastify();

    await app.register(
      async (instance: any) => {
        await instance.register(jsonqlFastify, {
          driver: new SQLiteDriver(db),
          tables: ['posts', 'users'],
        });
      },
      { prefix: '/api' },
    );

    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it('should fetch posts with simple fields', async () => {
    const q = JSON.stringify({
      fields: ['title', 'views'],
      where: { published: true },
    });

    const res = await app.inject({
      method: 'GET',
      url: `/api/posts?q=${encodeURIComponent(q)}`,
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);

    expect(body.data.length).toBeGreaterThan(0);
    expect(body.data[0].title).toBe('Introduction to JSONQL');
  });

  it('should parse valid JSONQL query from body', async () => {
    const q = { version: '1.0', fields: ['id', 'email'] };
    const res = await app.inject({
      method: 'POST',
      url: '/api/users',
      payload: q,
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    // The adapter returns { meta: { query }, data: ... }
    // We check if the parsed query matches what we sent (normalized)
    expect(body.meta.query.fields).toEqual(q.fields);
  });

  it('should reject invalid JSONQL', async () => {
    const q = JSON.stringify({ version: '99.0' });
    const res = await app.inject({
      method: 'GET',
      url: `/api/users?q=${encodeURIComponent(q)}`,
    });

    expect(res.statusCode).toBe(400);
    const body = JSON.parse(res.payload);
    expect(body.error).toBe('Invalid JSONQL Query');
  });
});
