import request from 'supertest';
import express from 'express';
import { jsonqlExpress, createDriver } from '../../../src';

/**
 * Integration test demonstrating the ideal JSONQL DX:
 *   createDriver + adapter = working API in ~10 lines
 */
describe('createDriver + Express Adapter (SQLite)', () => {
  let app: any;

  beforeAll(async () => {
    const driver = await createDriver('sqlite');

    // Seed test data
    await driver.query('CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT, age INTEGER)', []);
    await driver.query("INSERT INTO users VALUES (1, 'Alice', 30)", []);
    await driver.query("INSERT INTO users VALUES (2, 'Bob', 25)", []);

    app = express();
    app.use(express.json());
    app.use(
      '/api',
      jsonqlExpress({
        driver,
        parserOptions: { maxLimit: 50 },
      }),
    );
  });

  it('should query users', async () => {
    const q = JSON.stringify({ fields: ['name', 'age'], sort: 'name' });
    const res = await request(app).get(`/api/users?q=${encodeURIComponent(q)}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([
      { name: 'Alice', age: 30 },
      { name: 'Bob', age: 25 },
    ]);
  });

  it('should enforce maxLimit from parserOptions', async () => {
    const q = JSON.stringify({ fields: ['name'], limit: 100 });
    const res = await request(app).get(`/api/users?q=${encodeURIComponent(q)}`);

    expect(res.status).toBe(400);
    expect(res.body.details).toContain('limit must not exceed 50');
  });

  it('should filter with where', async () => {
    const q = JSON.stringify({ fields: ['name'], where: { age: { gt: 27 } } });
    const res = await request(app).get(`/api/users?q=${encodeURIComponent(q)}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([{ name: 'Alice' }]);
  });
});
