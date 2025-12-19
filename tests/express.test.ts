import request from 'supertest';
import express from 'express';
import { jsonqlExpress } from '../src/adapters/express';
import { setupSQLiteDB } from './e2e/setup-db';
import { Database } from 'sqlite';
import { SQLiteDriver } from '../src/drivers/sqlite';

describe('Express Adapter E2E (SQLite)', () => {
  let app: any;
  let db: Database;

  beforeAll(async () => {
    db = await setupSQLiteDB();
    app = express();
    app.use(express.json());

    // Auto-Handle Mode: Provide executor and dialect
    // This middleware will handle requests to /api/:table
    app.use(
      '/api',
      jsonqlExpress({
        driver: new SQLiteDriver(db),
        // dialect is inferred from driver
      }),
    );
  });

  it('should fetch posts with simple fields (Auto Mode)', async () => {
    const q = JSON.stringify({
      fields: ['title', 'views'],
      where: { published: true },
    });

    // Request to /api/posts -> Adapter infers table "posts"
    const res = await request(app).get(`/api/posts?q=${encodeURIComponent(q)}`);

    expect(res.status).toBe(200);
    expect(res.body.data.length).toBeGreaterThan(0);
    expect(res.body.data[0]).toHaveProperty('title');
    expect(res.body.data[0]).toHaveProperty('views');
    expect(res.body.data[0].title).toBe('Introduction to JSONQL');
  });

  it('should filter posts by complex conditions', async () => {
    // posts:
    // 1. Intro (published: true, views: 150)
    // 2. Advanced (published: true, views: 300)
    // 3. Draft (published: false, views: 50)

    const q = JSON.stringify({
      fields: ['title', 'views'],
      where: {
        published: true,
        views: { gt: 150 },
      },
    });

    const res = await request(app).get(`/api/posts?q=${encodeURIComponent(q)}`);

    expect(res.status).toBe(200);
    expect(res.body.data.length).toBe(1);
    expect(res.body.data[0].title).toBe('Advanced Querying');
    expect(res.body.data[0].views).toBe(300);
  });

  it('should sort posts by views descending', async () => {
    const q = JSON.stringify({
      fields: ['title', 'views'],
      where: { published: true },
      sort: '-views',
    });

    const res = await request(app).get(`/api/posts?q=${encodeURIComponent(q)}`);

    expect(res.status).toBe(200);
    expect(res.body.data.length).toBe(2);
    expect(res.body.data[0].title).toBe('Advanced Querying'); // 300 views
    expect(res.body.data[1].title).toBe('Introduction to JSONQL'); // 150 views
  });

  it('should paginate results', async () => {
    // Total 2 published posts.
    // Limit 1, Skip 0 -> First post (sorted by id default? or undefined order)
    // Let's sort to be sure.

    const q1 = JSON.stringify({
      fields: ['title'],
      where: { published: true },
      sort: 'views', // Ascending: Intro (150), Advanced (300)
      limit: 1,
      skip: 0,
    });

    const res1 = await request(app).get(`/api/posts?q=${encodeURIComponent(q1)}`);
    expect(res1.body.data.length).toBe(1);
    expect(res1.body.data[0].title).toBe('Introduction to JSONQL');

    const q2 = JSON.stringify({
      fields: ['title'],
      where: { published: true },
      sort: 'views',
      limit: 1,
      skip: 1,
    });

    const res2 = await request(app).get(`/api/posts?q=${encodeURIComponent(q2)}`);
    expect(res2.body.data.length).toBe(1);
    expect(res2.body.data[0].title).toBe('Advanced Querying');
  });

  it('should aggregate data', async () => {
    const q = JSON.stringify({
      aggregate: {
        totalViews: { sum: 'views' },
        count: { count: '*' },
      },
      where: { published: true },
    });

    const res = await request(app).get(`/api/posts?q=${encodeURIComponent(q)}`);

    expect(res.status).toBe(200);
    // Aggregation usually returns a single row if no groupBy
    expect(res.body.data.length).toBe(1);
    expect(res.body.data[0].totalViews).toBe(450); // 150 + 300
    expect(res.body.data[0].count).toBe(2);
  });

  it('should reject invalid JSONQL', async () => {
    const q = JSON.stringify({ version: '99.0' }); // Invalid version
    const res = await request(app).get(`/api/users?q=${encodeURIComponent(q)}`);

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Invalid JSONQL Query');
  });
});
