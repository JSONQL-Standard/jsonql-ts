import express from 'express';
import request from 'supertest';
import { jsonqlExpress } from '../../../src/adapters/express';
import { SQLiteDriver } from '../../../src/drivers/sqlite';
import { SchemaManager } from '../../../src/schema/manager';
import { SQLiteIntrospector } from '../../../src/schema/sqlite-introspector';
import { JSONQLSchema } from '../../../src/types';
import { setupSQLiteDB } from '../../fixtures/setup-db';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

describe('SchemaManager + Adapter Integration', () => {
  let db: any;
  let driver: SQLiteDriver;

  beforeAll(async () => {
    db = await setupSQLiteDB();
    driver = new SQLiteDriver(db);
    await driver.connect();
  });

  describe('schemaManager option', () => {
    it('should auto-load schema from SchemaManager on first request', async () => {
      const manager = new SchemaManager({
        introspector: new SQLiteIntrospector(driver),
      });

      const app = express();
      app.use(express.json());
      app.use('/api', jsonqlExpress({ driver, schemaManager: manager }));

      const res = await request(app)
        .post('/api/users')
        .send({ fields: ['id', 'name', 'email'] });

      expect(res.status).toBe(200);
      expect(res.body.data.length).toBeGreaterThan(0);
      expect(res.body.data[0]).toHaveProperty('name');
    });

    it('should validate fields against introspected schema', async () => {
      const manager = new SchemaManager({
        introspector: new SQLiteIntrospector(driver),
      });

      const app = express();
      app.use(express.json());
      app.use('/api', jsonqlExpress({ driver, schemaManager: manager }));

      const res = await request(app)
        .post('/api/users')
        .send({ fields: ['id', 'nonexistent_field'] });

      expect(res.status).toBe(400);
      expect(res.body.error).toBeDefined();
    });

    it('should cache the loaded schema across requests', async () => {
      const introspector = new SQLiteIntrospector(driver);
      const introspectSpy = jest.spyOn(introspector, 'introspect');

      const manager = new SchemaManager({ introspector });

      const app = express();
      app.use(express.json());
      app.use('/api', jsonqlExpress({ driver, schemaManager: manager }));

      // First request triggers load
      await request(app)
        .post('/api/users')
        .send({ fields: ['id', 'name'] });

      // Second request uses cache
      await request(app)
        .post('/api/users')
        .send({ fields: ['id', 'email'] });

      // SchemaManager.load() calls introspect once internally, and
      // the adapter caches the result — so only 1 call total
      expect(introspectSpy.mock.calls.length).toBeLessThanOrEqual(1);
    });

    it('should be overridden by static schema option', async () => {
      const manager = new SchemaManager({
        introspector: new SQLiteIntrospector(driver),
      });

      // Static schema with limited fields — takes priority over manager
      const schema: JSONQLSchema = {
        tables: {
          users: {
            fields: {
              id: { type: 'number' },
              name: { type: 'string' },
            },
          },
        },
      };

      const app = express();
      app.use(express.json());
      app.use('/api', jsonqlExpress({ driver, schema, schemaManager: manager }));

      // 'email' is not in static schema → validation should reject it
      const res = await request(app)
        .post('/api/users')
        .send({ fields: ['id', 'email'] });

      expect(res.status).toBe(400);
    });
  });

  describe('schemaDir option', () => {
    let tmpDir: string;

    beforeEach(() => {
      tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'jsonql-schema-'));
      // Create a schema directory structure
      const testSchemaDir = path.join(tmpDir, 'test-suite');
      fs.mkdirSync(testSchemaDir, { recursive: true });
      fs.writeFileSync(
        path.join(testSchemaDir, 'schema.json'),
        JSON.stringify({
          tables: {
            users: {
              fields: {
                id: { type: 'number' },
                name: { type: 'string' },
                // email intentionally omitted — validates restrictive schema
              },
            },
          },
        } as JSONQLSchema),
      );
    });

    afterEach(() => {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    it('should resolve schema from directory based on header', async () => {
      const app = express();
      app.use(express.json());
      app.use('/api', jsonqlExpress({ driver, schemaDir: tmpDir }));

      // Request with header pointing to our test-suite schema
      const res = await request(app)
        .post('/api/users')
        .set('X-JSONQL-Schema-Path', 'test-suite')
        .send({ fields: ['id', 'email'] });

      // email is not in the file schema → validation error
      expect(res.status).toBe(400);
    });

    it('should allow valid fields from directory schema', async () => {
      const app = express();
      app.use(express.json());
      app.use('/api', jsonqlExpress({ driver, schemaDir: tmpDir }));

      const res = await request(app)
        .post('/api/users')
        .set('X-JSONQL-Schema-Path', 'test-suite')
        .send({ fields: ['id', 'name'] });

      expect(res.status).toBe(200);
      expect(res.body.data.length).toBeGreaterThan(0);
    });

    it('should cache loaded schemas from directory', async () => {
      const app = express();
      app.use(express.json());
      app.use('/api', jsonqlExpress({ driver, schemaDir: tmpDir }));

      // First request loads and caches the schema
      const res1 = await request(app)
        .post('/api/users')
        .set('X-JSONQL-Schema-Path', 'test-suite')
        .send({ fields: ['id', 'name'] });

      expect(res1.status).toBe(200);

      // Second request should use cache (same validation behavior)
      const res2 = await request(app)
        .post('/api/users')
        .set('X-JSONQL-Schema-Path', 'test-suite')
        .send({ fields: ['id', 'email'] });

      // email not in cached schema → still validates
      expect(res2.status).toBe(400);
    });

    it('should sanitize path traversal attempts', async () => {
      const app = express();
      app.use(express.json());
      app.use('/api', jsonqlExpress({ driver, schemaDir: tmpDir }));

      // Attempt path traversal — should not escape schemaDir
      const res = await request(app)
        .post('/api/users')
        .set('X-JSONQL-Schema-Path', '../../etc/passwd')
        .send({ fields: ['id', 'name'] });

      // Should proceed without schema (no validation, open mode)
      expect(res.status).toBe(200);
    });

    it('should fall back when no header is present', async () => {
      const app = express();
      app.use(express.json());
      app.use('/api', jsonqlExpress({ driver, schemaDir: tmpDir }));

      // No header → no schema resolved → open mode
      const res = await request(app)
        .post('/api/users')
        .send({ fields: ['id', 'name', 'email'] });

      expect(res.status).toBe(200);
      expect(res.body.data.length).toBeGreaterThan(0);
    });
  });
});
