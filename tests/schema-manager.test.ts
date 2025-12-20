import { SchemaManager } from '../src/schema/manager';
import { SQLiteIntrospector } from '../src/schema/sqlite-introspector';
import { SQLiteDriver } from '../src/drivers/sqlite';
import { setupSQLiteDB } from './e2e/setup-db';
import { JSONQLSchema } from '../src/types';
import * as fs from 'fs';
import * as path from 'path';

describe('Schema Manager & Introspection', () => {
  let db: any;
  let driver: SQLiteDriver;
  const tempSchemaPath = path.join(__dirname, 'temp_schema.json');

  beforeAll(async () => {
    db = await setupSQLiteDB();
    driver = new SQLiteDriver(db);
  });

  afterAll(() => {
    if (fs.existsSync(tempSchemaPath)) {
      fs.unlinkSync(tempSchemaPath);
    }
  });

  it('should introspect SQLite database', async () => {
    const introspector = new SQLiteIntrospector(driver);
    const schema = await introspector.introspect();

    expect(schema).toHaveProperty('users');
    expect(schema.users.fields).toHaveProperty('email');
    expect(schema.users.fields.email.type).toBe('string');
    expect(schema.users.fields.age.type).toBe('number');
  });

  it('should merge introspection with file config', async () => {
    // 1. Create a patch file that disables selection of 'email'
    const patch: JSONQLSchema = {
      users: {
        fields: {
          email: { type: 'string', allowSelect: false }, // Override
        },
      },
    };
    fs.writeFileSync(tempSchemaPath, JSON.stringify(patch));

    // 2. Load with Manager
    const manager = new SchemaManager({
      introspector: new SQLiteIntrospector(driver),
      schemaFilePath: tempSchemaPath,
    });

    const schema = await manager.load();

    // Check Introspection result (base)
    expect(schema.users.fields.name.allowSelect).toBe(true); // Default from introspector

    // Check Patch result (override)
    expect(schema.users.fields.email.allowSelect).toBe(false); // Overridden by file
  });

  it('should merge runtime override with highest priority', async () => {
    const manager = new SchemaManager({
      introspector: new SQLiteIntrospector(driver),
      runtimeSchema: {
        users: {
          fields: {
            status: { type: 'string', allowSelect: false },
          },
        },
      },
    });

    const schema = await manager.load();

    expect(schema.users.fields.status.allowSelect).toBe(false);
    expect(schema.users.fields.name.allowSelect).toBe(true);
  });

  it('should execute lifecycle hooks', async () => {
    const manager = new SchemaManager({
      introspector: new SQLiteIntrospector(driver),
      beforeIntrospect: async (config) => {
        // Modify config: e.g., add a runtime schema dynamically
        return {
          ...config,
          runtimeSchema: {
            users: {
              fields: {
                dynamic: { type: 'boolean' },
              },
            },
          },
        };
      },
      afterIntrospect: async (schema) => {
        // Modify schema: e.g., add a virtual field
        if (schema.users) {
          schema.users.fields.virtual = { type: 'string' };
        }
        return schema;
      },
    });

    const schema = await manager.load();

    // Check beforeIntrospect effect (runtimeSchema added)
    expect(schema.users.fields.dynamic).toBeDefined();
    expect(schema.users.fields.dynamic.type).toBe('boolean');

    // Check afterIntrospect effect (virtual field added)
    expect(schema.users.fields.virtual).toBeDefined();
    expect(schema.users.fields.virtual.type).toBe('string');
  });
});
