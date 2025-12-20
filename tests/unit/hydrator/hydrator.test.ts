import { ResultHydrator } from '../../../src/hydrator';

describe('ResultHydrator', () => {
  const hydrator = new ResultHydrator();

  it('should hydrate simple flat rows', () => {
    const rows = [
      { id: 1, name: 'Alice' },
      { id: 2, name: 'Bob' },
    ];
    const result = hydrator.hydrate(rows);
    expect(result).toEqual(rows);
  });

  it('should hydrate nested objects with double underscore', () => {
    const rows = [
      { id: 1, name: 'Post 1', author__name: 'Alice', author__id: 10 },
      { id: 2, name: 'Post 2', author__name: 'Bob', author__id: 11 },
    ];

    const result = hydrator.hydrate(rows);

    expect(result).toEqual([
      {
        id: 1,
        name: 'Post 1',
        author: { name: 'Alice', id: 10 },
      },
      {
        id: 2,
        name: 'Post 2',
        author: { name: 'Bob', id: 11 },
      },
    ]);
  });

  it('should handle deep nesting', () => {
    const rows = [{ id: 1, meta__audit__created_by: 'Admin' }];

    const result = hydrator.hydrate(rows);

    expect(result).toEqual([
      {
        id: 1,
        meta: {
          audit: {
            created_by: 'Admin',
          },
        },
      },
    ]);
  });
});
