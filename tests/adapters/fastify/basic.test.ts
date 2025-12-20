import Fastify from 'fastify';
import { jsonqlFastify } from '../../../src/adapters/fastify';
import { ResultHydrator } from '../../../src/hydrator';
import { SQLTranspiler } from '../../../src/transpiler';
import { setupSQLiteDB } from '../../fixtures/setup-db';
import { Database } from 'sqlite';

describe('Fastify Adapter E2E (SQLite)', () => {
  let app: any;
  let db: Database;
  const hydrator = new ResultHydrator();
  const transpiler = new SQLTranspiler('sqlite');

  beforeAll(async () => {
    db = await setupSQLiteDB();
    app = Fastify();
    await app.register(jsonqlFastify);

    app.get('/api/posts', async (req: any, reply: any) => {
      const query = req.jsonql;
      const { sql, parameters } = transpiler.transpile(query, 'posts');

      try {
        const flatRows = await db.all(sql, parameters);
        const hydrated = hydrator.hydrate(flatRows);
        return { meta: { query }, data: hydrated };
      } catch (err: any) {
        reply.code(500).send({ error: err.message });
      }
    });

    app.post('/api/users', async (req: any, reply: any) => {
      return { received: req.jsonql };
    });

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
    expect(JSON.parse(res.payload).received).toEqual(q);
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
