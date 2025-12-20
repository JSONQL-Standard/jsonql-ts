import request from 'supertest';
import express from 'express';
import { jsonqlExpress } from '../../../src/adapters/express';
import { setupSQLiteDB } from '../../fixtures/setup-db';
import { Database } from 'sqlite';
import { SQLiteDriver } from '../../../src/drivers/sqlite';
import { JSONQLQuery } from '../../../src/types';

describe('Express Adapter Lifecycle Hooks', () => {
  let db: Database;

  beforeAll(async () => {
    db = await setupSQLiteDB();
  });

  it('should modify raw input in beforeParse', async () => {
    const app = express();
    app.use(express.json());
    app.use(
      '/api',
      jsonqlExpress({
        driver: new SQLiteDriver(db),
        beforeParse: (raw, req) => {
          // Force a filter even if not provided
          // Note: raw.where might be undefined, so handle carefully
          const where = raw.where || {};
          return { ...raw, where: { ...where, published: true } };
        },
      }),
    );

    // Query for ALL posts (including drafts)
    // Draft post has published: false
    const q = JSON.stringify({ fields: ['title'] });
    const res = await request(app).get(`/api/posts?q=${encodeURIComponent(q)}`);

    // Should only return published posts (2) instead of all (3)
    expect(res.status).toBe(200);
    expect(res.body.data.length).toBe(2);
  });

  it('should modify query in afterParse', async () => {
    const app = express();
    app.use(express.json());
    app.use(
      '/api',
      jsonqlExpress({
        driver: new SQLiteDriver(db),
        afterParse: (query, req) => {
          // Add a field
          if (query.fields) {
            query.fields.push('views');
          }
          return query;
        },
      }),
    );

    const q = JSON.stringify({ fields: ['title'], where: { views: 150 } });
    const res = await request(app).get(`/api/posts?q=${encodeURIComponent(q)}`);

    expect(res.status).toBe(200);
    expect(res.body.data[0]).toHaveProperty('views');
  });

  it('should modify query in beforeQuery (RLS scenario)', async () => {
    const app = express();
    app.use(express.json());
    app.use(
      '/api',
      jsonqlExpress({
        driver: new SQLiteDriver(db),
        beforeQuery: (query, req) => {
          // Simulate RLS: Force where id = 999 (should return nothing)
          query.where = { id: { eq: 999 } };
          return query;
        },
      }),
    );

    const q = JSON.stringify({ fields: ['title'] });
    const res = await request(app).get(`/api/posts?q=${encodeURIComponent(q)}`);

    expect(res.status).toBe(200);
    expect(res.body.data.length).toBe(0);
  });

  it('should modify rows in beforeHydrate', async () => {
    const app = express();
    app.use(express.json());
    app.use(
      '/api',
      jsonqlExpress({
        driver: new SQLiteDriver(db),
        beforeHydrate: (rows, req) => {
          // Modify raw DB rows
          return rows.map((r) => ({ ...r, title: r.title.toUpperCase() }));
        },
      }),
    );

    const q = JSON.stringify({ fields: ['title'], where: { views: 150 } });
    const res = await request(app).get(`/api/posts?q=${encodeURIComponent(q)}`);

    expect(res.body.data[0].title).toBe('INTRODUCTION TO JSONQL');
  });

  it('should modify result in afterHydrate', async () => {
    const app = express();
    app.use(express.json());
    app.use(
      '/api',
      jsonqlExpress({
        driver: new SQLiteDriver(db),
        afterHydrate: (result, req) => {
          // Wrap result
          return { wrapped: true, items: result };
        },
      }),
    );

    const q = JSON.stringify({ fields: ['title'], where: { views: 150 } });
    const res = await request(app).get(`/api/posts?q=${encodeURIComponent(q)}`);

    expect(res.body.data).toHaveProperty('wrapped', true);
    expect(res.body.data.items.length).toBe(1);
  });

  it('should modify final result in afterQuery', async () => {
    const app = express();
    app.use(express.json());
    app.use(
      '/api',
      jsonqlExpress({
        driver: new SQLiteDriver(db),
        afterQuery: (result, req) => {
          // Add metadata
          // result is the object returned by afterHydrate (or hydrator)
          // If result is an array (default), we can't easily add props unless we wrap it
          // But here we just want to verify it's called.
          // Let's return a new object
          return { data: result, timestamp: 12345 };
        },
      }),
    );

    const q = JSON.stringify({ fields: ['title'], where: { views: 150 } });
    const res = await request(app).get(`/api/posts?q=${encodeURIComponent(q)}`);

    expect(res.body.data).toHaveProperty('timestamp', 12345);
    expect(res.body.data.data.length).toBe(1);
  });
});
