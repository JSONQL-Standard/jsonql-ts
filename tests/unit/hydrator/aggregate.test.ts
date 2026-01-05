import { ResultHydrator } from '../../../src/hydrator';
import { JSONQLSchema } from '../../../src/types';

describe('ResultHydrator - Aggregates', () => {
  const hydrator = new ResultHydrator();

  const schema: JSONQLSchema = {
    tables: {
      users: {
      fields: {},
      relations: {
        posts: { type: 'hasMany', target: 'posts', foreignKey: 'user_id' },
      },
    },
    posts: {
      fields: {},
      relations: {},
    },
    },
  };

  it('should hydrate child aggregates into an object instead of an array', () => {
    // Simulating SQL result:
    // SELECT users.id, users.name, posts.count AS posts__count, posts.total_views AS posts__total_views
    // FROM users LEFT JOIN (SELECT user_id, COUNT(*) as count, SUM(views) as total_views FROM posts GROUP BY user_id) AS posts ...
    const rows = [
      {
        id: 1,
        name: 'Alice',
        posts__count: 5,
        posts__total_views: 1000,
        // Note: posts__id is missing/undefined, which triggers the aggregate logic
      },
      {
        id: 2,
        name: 'Bob',
        posts__count: 2,
        posts__total_views: 50,
      },
    ];

    const result = hydrator.hydrate(rows, schema, 'users');

    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({
      id: 1,
      name: 'Alice',
      posts: {
        count: 5,
        total_views: 1000,
      },
    });
    expect(result[1]).toEqual({
      id: 2,
      name: 'Bob',
      posts: {
        count: 2,
        total_views: 50,
      },
    });
  });

  it('should handle null aggregates (failed join or no data)', () => {
    const rows = [
      {
        id: 3,
        name: 'Charlie',
        posts__count: null, // No posts
        posts__id: null, // Explicit null id usually means no match
      },
    ];

    const result = hydrator.hydrate(rows, schema, 'users');

    expect(result).toHaveLength(1);
    expect(result[0].posts).toEqual([]); // Should be empty array if no match
  });

  it('should mix standard fields and aggregates if both present (though unusual)', () => {
    // If ID is present, it treats it as a standard row, so aggregates might be attached to the child object
    // This depends on how the SQL is constructed. If we select ID, we get one row per child.
    const rows = [
      {
        id: 1,
        name: 'Alice',
        posts__id: 101,
        posts__title: 'Post 1',
        posts__extra_stat: 99,
      },
    ];

    const result = hydrator.hydrate(rows, schema, 'users');

    expect(result[0].posts).toBeInstanceOf(Array);
    expect(result[0].posts[0]).toEqual({
      id: 101,
      title: 'Post 1',
      extra_stat: 99,
    });
  });
});
