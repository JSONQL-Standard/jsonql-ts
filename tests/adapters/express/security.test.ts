import request from 'supertest';
import express from 'express';
import { jsonqlExpress } from '../../../src/adapters/express';
import { setupSQLiteDB } from '../../fixtures/setup-db';
import { Database } from 'sqlite';
import { SQLiteDriver } from '../../../src/drivers/sqlite';

describe('Express Adapter Security', () => {
  let db: Database;

  beforeAll(async () => {
    db = await setupSQLiteDB();
  });

  describe('Whitelist Mode', () => {
    let app: any;
    beforeAll(() => {
      app = express();
      app.use(express.json());
      app.use(
        '/api',
        jsonqlExpress({
          driver: new SQLiteDriver(db),
          tables: ['users'], // Only users allowed
        }),
      );
    });

    it('should allow whitelisted table', async () => {
      const res = await request(app).get('/api/users');
      expect(res.status).toBe(200);
    });

    it('should block non-whitelisted table', async () => {
      const res = await request(app).get('/api/posts');
      expect(res.status).toBe(403);
      expect(res.body.error).toBe('Forbidden');
    });

    it('should block explicit "from" override to non-whitelisted table', async () => {
      const q = JSON.stringify({ from: 'posts' });
      const res = await request(app).get(`/api/users?q=${encodeURIComponent(q)}`);
      expect(res.status).toBe(403);
    });
  });

  describe('Mapping Mode', () => {
    let app: any;
    beforeAll(() => {
      app = express();
      app.use(express.json());
      app.use(
        '/api',
        jsonqlExpress({
          driver: new SQLiteDriver(db),
          tables: {
            'my-users': 'users', // /api/my-users -> users
          },
        }),
      );
    });

    it('should resolve alias to table', async () => {
      const res = await request(app).get('/api/my-users');
      expect(res.status).toBe(200);
      // Verify it actually queried users
      expect(res.body.data[0]).toHaveProperty('name');
    });

    it('should block direct table access if not mapped', async () => {
      // /api/users is not in the map keys
      // It will fall through to next(), so 404 from Express default
      const res = await request(app).get('/api/users');
      expect(res.status).toBe(404); 
    });

    it('should allow explicit "from" if it matches a mapped value', async () => {
      const q = JSON.stringify({ from: 'users' });
      const res = await request(app).get(`/api/my-users?q=${encodeURIComponent(q)}`);
      expect(res.status).toBe(200);
    });

    it('should block explicit "from" if it does not match any mapped value', async () => {
      const q = JSON.stringify({ from: 'posts' });
      const res = await request(app).get(`/api/my-users?q=${encodeURIComponent(q)}`);
      expect(res.status).toBe(403);
    });
  });
});
