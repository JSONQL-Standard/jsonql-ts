import { JSONQLParser } from '../../../src/parser';

describe('JSONQLParser mutations', () => {
  const parser = new JSONQLParser();

  it('parses create mutation', () => {
    const result = parser.parse({
      from: 'users',
      data: { email: 'a@b.com', name: 'Alice' },
      fields: ['id', 'email'],
    });

    expect(result).toEqual(
      expect.objectContaining({
        op: 'create',
        from: 'users',
        fields: ['id', 'email'],
      }),
    );
  });

  it('requires where for update', () => {
    expect(() =>
      parser.parse({
        op: 'update',
        from: 'users',
        patch: { name: 'Alice' },
      }),
    ).toThrow('where');
  });

  it('requires where for delete', () => {
    expect(() =>
      parser.parse({
        op: 'delete',
        from: 'users',
      }),
    ).toThrow('where');
  });
});
