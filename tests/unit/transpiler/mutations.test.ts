import { SQLTranspiler } from '../../../src/transpiler';

describe('SQLTranspiler mutations', () => {
  it('transpiles create mutation with fields', () => {
    const transpiler = new SQLTranspiler('postgres');
    const { sql, parameters } = transpiler.transpile(
      {
        op: 'create',
        from: 'users',
        data: { email: 'a@b.com', name: 'Alice' },
        fields: ['id', 'email'],
      },
      'users',
    );

    expect(sql).toBe(
      'INSERT INTO "users" ("email", "name") VALUES ($1, $2) RETURNING "id", "email"',
    );
    expect(parameters).toEqual(['a@b.com', 'Alice']);
  });

  it('transpiles update mutation', () => {
    const transpiler = new SQLTranspiler('postgres');
    const { sql, parameters } = transpiler.transpile(
      {
        op: 'update',
        from: 'users',
        where: { id: { eq: 5 } },
        patch: { name: 'Alice' },
      },
      'users',
    );

    expect(sql).toBe('UPDATE "users" SET "users"."name" = $1 WHERE "users"."id" = $2');
    expect(parameters).toEqual(['Alice', 5]);
  });

  it('transpiles delete mutation with fields', () => {
    const transpiler = new SQLTranspiler('postgres');
    const { sql, parameters } = transpiler.transpile(
      {
        op: 'delete',
        from: 'users',
        where: { id: { eq: 5 } },
        fields: ['id'],
      },
      'users',
    );

    expect(sql).toBe('DELETE FROM "users" WHERE "users"."id" = $1 RETURNING "id"');
    expect(parameters).toEqual([5]);
  });
});
