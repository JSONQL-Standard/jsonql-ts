import { SchemaManager } from '../../../src/schema/manager';
import { SQLiteIntrospector } from '../../../src/schema/sqlite-introspector';
import { SQLiteDriver } from '../../../src/drivers/sqlite';
import { setupSQLiteDB } from '../../fixtures/setup-db';
import { JSONQLSchema } from '../../../src/types';
import * as fs from 'fs';
import * as path from 'path';

describe('Schema Manager & Introspection', () => {
  let db: any;
  let driver: SQLiteDriver;
  const tempSchemaPath = path.join(__dirname, 'temp_schema.json');

  beforeAll(async () => {
    db = await setupSQLiteDB();
    driver = new SQLiteDriver(db);
    await driver.connect();
  });

  afterAll(() => {
    if (fs.existsSync(tempSchemaPath)) {
      fs.unlinkSync(tempSchemaPath);
    }
  });

  it('should introspect SQLite database', async () => {
    const introspector = new SQLiteIntrospector(driver);
    const schema = await introspector.introspect();

    expect(schema.tables).toHaveProperty('users');
    expect(schema.tables.users.fields).toHaveProperty('email');
    expect(schema.tables.users.fields.email.type).toBe('string');
    expect(schema.tables.users.fields.age.type).toBe('number');
  });

  it('should merge introspection with file config', async () => {
    // 1. Create a patch file that disables selection of 'email'
    const patch: JSONQLSchema = {
      tables: {
        users: {
        fields: {
          email: { type: 'string', allowSelect: false }, // Override
        },
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
    expect(schema.tables.users.fields.name.allowSelect).toBe(true); // Default from introspector

    // Check Patch result (override)
    expect(schema.tables.users.fields.email.allowSelect).toBe(false); // Overridden by file
  });

  it('should merge runtime override with highest priority', async () => {
    const manager = new SchemaManager({
      introspector: new SQLiteIntrospector(driver),
      runtimeSchema: {
        tables: {
          users: {
          fields: {
            status: { type: 'string', allowSelect: false },
          },
        },
        },
      },
    });

    const schema = await manager.load();

    expect(schema.tables.users.fields.status.allowSelect).toBe(false);
    expect(schema.tables.users.fields.name.allowSelect).toBe(true);
  });

  it('should execute lifecycle hooks', async () => {
    const manager = new SchemaManager({
      introspector: new SQLiteIntrospector(driver),
      beforeIntrospect: async (config) => {
        // Modify config: e.g., add a runtime schema dynamically
        return {
          ...config,
          runtimeSchema: {
            tables: {
              users: {
              fields: {
                dynamic: { type: 'boolean' },
              },
            },
            },
          },
        };
      },
      afterIntrospect: async (schema) => {
        // Modify schema: e.g., add a virtual field
        if (schema.tables.users) {
          schema.tables.users.fields.virtual = { type: 'string' };
        }
        return schema;
      },
    });

    const schema = await manager.load();

    // Check beforeIntrospect effect (runtimeSchema added)
    expect(schema.tables.users.fields.dynamic).toBeDefined();
    expect(schema.tables.users.fields.dynamic.type).toBe('boolean');

    // Check afterIntrospect effect (virtual field added)
    expect(schema.tables.users.fields.virtual).toBeDefined();
    expect(schema.tables.users.fields.virtual.type).toBe('string');
  });
});
