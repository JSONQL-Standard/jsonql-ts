import { JSONQLEngine, EngineBuilder } from '../../../src/engine';
import { JsonQLExecutionError, JsonQLValidationError } from '../../../src/errors';
import { JSONQLSchema } from '../../../src/types';

const schema: JSONQLSchema = {
  tables: {
    users: {
      fields: {
        id: { type: 'number' },
        name: { type: 'string' },
        email: { type: 'string' },
        age: { type: 'number' },
      },
    },
  },
};

describe('JSONQLEngine builder', () => {
  it('builds with default sqlite dialect and an executor', () => {
    const engine = JSONQLEngine.builder()
      .executor(async () => [])
      .build();
    expect(engine).toBeInstanceOf(JSONQLEngine);
  });

  it('returns the builder from each fluent method', () => {
    const builder = JSONQLEngine.builder();
    expect(builder).toBeInstanceOf(EngineBuilder);
    expect(builder.postgres()).toBe(builder);
    expect(builder.mysql()).toBe(builder);
    expect(builder.sqlite()).toBe(builder);
    expect(builder.mssql()).toBe(builder);
    expect(builder.dialect('postgres')).toBe(builder);
    expect(builder.schema(schema)).toBe(builder);
    expect(builder.executor(async () => [])).toBe(builder);
    expect(builder.parserOptions({ maxLimit: 10 })).toBe(builder);
    expect(builder.debug(true)).toBe(builder);
  });

  it('infers the dialect from the driver when not set explicitly', async () => {
    let receivedSql = '';
    const driver = {
      dialect: 'postgres' as const,
      connect: async () => {},
      disconnect: async () => {},
      query: async (sql: string) => {
        receivedSql = sql;
        return [];
      },
    };
    const engine = JSONQLEngine.builder().driver(driver).build();
    await engine.execute({}, 'users');
    // Postgres double-quotes identifiers.
    expect(receivedSql).toContain('"users"');
  });

  it('does not override an explicitly set dialect when a driver is provided', async () => {
    let receivedSql = '';
    const driver = {
      dialect: 'postgres' as const,
      connect: async () => {},
      disconnect: async () => {},
      query: async (sql: string) => {
        receivedSql = sql;
        return [];
      },
    };
    // Explicit sqlite must win over the postgres driver's dialect.
    const engine = JSONQLEngine.builder().sqlite().driver(driver).build();
    await engine.execute({ where: { id: { eq: 1 } } }, 'users');
    // SQLite uses '?' placeholders; Postgres would use '$1'.
    expect(receivedSql).toContain('?');
    expect(receivedSql).not.toContain('$1');
  });
});

describe('JSONQLEngine.execute (queries)', () => {
  it('runs parse -> transpile -> execute -> hydrate for a select', async () => {
    const calls: { sql: string; params: any[] }[] = [];
    const engine = JSONQLEngine.builder()
      .sqlite()
      .executor(async (sql, params) => {
        calls.push({ sql, params });
        return [{ id: 1, name: 'Alice', email: 'alice@example.com', age: 30 }];
      })
      .build();

    const result = await engine.execute({ where: { name: 'Alice' } }, 'users');

    expect(result.isMutation).toBe(false);
    expect(result.data).toHaveLength(1);
    expect(result.data[0].name).toBe('Alice');
    expect(calls).toHaveLength(1);
    expect(calls[0].sql.toLowerCase()).toContain('users');
    expect(calls[0].params).toContain('Alice');
  });

  it('passes the where value through as a bound parameter (no inlining)', async () => {
    let params: any[] = [];
    const engine = JSONQLEngine.builder()
      .sqlite()
      .executor(async (_sql, p) => {
        params = p;
        return [];
      })
      .build();

    await engine.execute({ where: { age: { gt: 18 } } }, 'users');
    expect(params).toContain(18);
  });

  it('uses a DatabaseDriver when provided', async () => {
    const driver = {
      dialect: 'sqlite' as const,
      connect: async () => {},
      disconnect: async () => {},
      query: async () => [{ id: 2, name: 'Bob' }],
    };
    const engine = JSONQLEngine.builder().driver(driver).build();
    const result = await engine.execute({}, 'users');
    expect(result.data).toEqual([{ id: 2, name: 'Bob' }]);
  });
});

describe('JSONQLEngine.execute (mutations)', () => {
  it('flags mutations and returns affected rows without hydration', async () => {
    const engine = JSONQLEngine.builder()
      .sqlite()
      .executor(async () => [{ id: 9, name: 'Bob' }])
      .build();

    const result = await engine.execute({ data: { name: 'Bob' } }, 'users');
    expect(result.isMutation).toBe(true);
    expect(result.data).toEqual([{ id: 9, name: 'Bob' }]);
  });
});

describe('JSONQLEngine.execute (validation + errors)', () => {
  it('throws a validation error for an unknown field when a schema is set', async () => {
    const engine = JSONQLEngine.builder()
      .sqlite()
      .schema(schema)
      .executor(async () => [])
      .build();

    await expect(engine.execute({ where: { unknown_field: 1 } }, 'users')).rejects.toBeInstanceOf(
      JsonQLValidationError,
    );
  });

  it('throws an execution error when no driver or executor is configured', async () => {
    const engine = JSONQLEngine.builder().sqlite().build();
    await expect(engine.execute({}, 'users')).rejects.toBeInstanceOf(JsonQLExecutionError);
  });

  it('wraps executor failures in a JsonQLExecutionError', async () => {
    const engine = JSONQLEngine.builder()
      .sqlite()
      .executor(async () => {
        throw new Error('boom');
      })
      .build();

    await expect(engine.execute({}, 'users')).rejects.toBeInstanceOf(JsonQLExecutionError);
  });
});
