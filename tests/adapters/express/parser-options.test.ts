import request from 'supertest';
import express from 'express';
import { jsonqlExpress } from '../../../src/adapters/express';
import { setupSQLiteDB } from '../../fixtures/setup-db';
import { Database } from 'sqlite';
import { SQLiteDriver } from '../../../src/drivers/sqlite';

describe('Express Adapter - parserOptions', () => {
  let db: Database;

  beforeAll(async () => {
    db = await setupSQLiteDB();
  });

  describe('maxLimit', () => {
    let app: any;

    beforeAll(() => {
      app = express();
      app.use(express.json());
      app.use(
        '/api',
        jsonqlExpress({
          driver: new SQLiteDriver(db),
          parserOptions: { maxLimit: 5 },
        }),
      );
    });

    it('should accept queries within maxLimit', async () => {
      const q = JSON.stringify({ fields: ['title'], limit: 5 });
      const res = await request(app).get(`/api/posts?q=${encodeURIComponent(q)}`);
      expect(res.status).toBe(200);
    });

    it('should reject queries exceeding maxLimit', async () => {
      const q = JSON.stringify({ fields: ['title'], limit: 10 });
      const res = await request(app).get(`/api/posts?q=${encodeURIComponent(q)}`);
      expect(res.status).toBe(400);
      expect(res.body.details).toContain('limit must not exceed 5');
    });
  });

  describe('allowedIncludes', () => {
    let app: any;

    beforeAll(() => {
      app = express();
      app.use(express.json());
      app.use(
        '/api',
        jsonqlExpress({
          driver: new SQLiteDriver(db),
          parserOptions: { allowedIncludes: ['comments'] },
        }),
      );
    });

    it('should accept allowed includes (parser passes)', async () => {
      const q = JSON.stringify({ include: ['comments'] });
      const res = await request(app).get(`/api/posts?q=${encodeURIComponent(q)}`);
      // The parser allows 'comments' since it's in allowedIncludes.
      // It may still fail downstream (e.g. no schema to resolve relation),
      // but the error should NOT be about disallowed includes.
      if (res.status === 400) {
        expect(res.body.details).not.toContain('disallowed');
      }
    });

    it('should reject disallowed includes at parse time', async () => {
      const q = JSON.stringify({ include: ['forbidden_relation'] });
      const res = await request(app).get(`/api/posts?q=${encodeURIComponent(q)}`);
      expect(res.status).toBe(400);
      expect(res.body.details).toContain('disallowed');
    });
  });

  describe('allowedFields', () => {
    let app: any;

    beforeAll(() => {
      app = express();
      app.use(express.json());
      app.use(
        '/api',
        jsonqlExpress({
          driver: new SQLiteDriver(db),
          parserOptions: { allowedFields: ['title', 'views'] },
        }),
      );
    });

    it('should accept queries with only allowed fields', async () => {
      const q = JSON.stringify({ fields: ['title', 'views'] });
      const res = await request(app).get(`/api/posts?q=${encodeURIComponent(q)}`);
      expect(res.status).toBe(200);
      expect(res.body.data[0]).toHaveProperty('title');
    });

    it('should reject queries with disallowed fields', async () => {
      const q = JSON.stringify({ fields: ['title', 'body'] });
      const res = await request(app).get(`/api/posts?q=${encodeURIComponent(q)}`);
      expect(res.status).toBe(400);
      expect(res.body.details).toContain('Fields not allowed: body');
    });

    it('should allow queries with no fields (select all)', async () => {
      const q = JSON.stringify({ limit: 1 });
      const res = await request(app).get(`/api/posts?q=${encodeURIComponent(q)}`);
      // No fields specified = no restriction applied
      expect(res.status).toBe(200);
    });
  });

  describe('defaults (no parserOptions)', () => {
    let app: any;

    beforeAll(() => {
      app = express();
      app.use(express.json());
      app.use(
        '/api',
        jsonqlExpress({
          driver: new SQLiteDriver(db),
          // no parserOptions — uses default maxLimit=1000
        }),
      );
    });

    it('should use default maxLimit of 1000', async () => {
      const q = JSON.stringify({ fields: ['title'], limit: 999 });
      const res = await request(app).get(`/api/posts?q=${encodeURIComponent(q)}`);
      expect(res.status).toBe(200);
    });

    it('should reject limit exceeding default 1000', async () => {
      const q = JSON.stringify({ fields: ['title'], limit: 1001 });
      const res = await request(app).get(`/api/posts?q=${encodeURIComponent(q)}`);
      expect(res.status).toBe(400);
      expect(res.body.details).toContain('limit must not exceed 1000');
    });
  });
});
