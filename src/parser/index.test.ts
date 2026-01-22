import { JSONQLParser } from '../parser';
import { JSONQLQuery } from '../types';

describe('JSONQLParser', () => {
  let parser: JSONQLParser;

  beforeEach(() => {
    parser = new JSONQLParser();
  });

  const parseQuery = (input: any) => parser.parse(input) as JSONQLQuery;

  describe('parse', () => {
    it('should parse a minimal query with version', () => {
      const input = {
        version: '1.0',
      };

      const result = parseQuery(input);

      expect(result.version).toBe('1.0');
    });

    it('should parse a simple query from object', () => {
      const input = {
        version: '1.0',
        fields: ['id', 'name'],
      };

      const result = parseQuery(input);

      expect(result.version).toBe('1.0');
      expect(result.fields).toEqual(['id', 'name']);
    });

    it('should parse a simple query from JSON string', () => {
      const input = JSON.stringify({
        version: '1.0',
        fields: ['id', 'name'],
      });

      const result = parseQuery(input);

      expect(result.version).toBe('1.0');
      expect(result.fields).toEqual(['id', 'name']);
    });

    it('should parse query with where condition', () => {
      const input = {
        version: '1.0',
        where: {
          age: {
            gt: 18,
          },
        },
      };

      const result = parseQuery(input);

      expect(result.where).toEqual({
        age: {
          gt: 18,
        },
      });
    });

    it('should parse query with multiple field conditions', () => {
      const input = {
        version: '1.0',
        where: {
          age: { gte: 18 },
          status: { eq: 'active' },
        },
      };

      const result = parseQuery(input);

      expect(result.where).toHaveProperty('age');
      expect(result.where).toHaveProperty('status');
    });

    it('should parse query with AND conditions', () => {
      const input = {
        version: '1.0',
        where: {
          and: [{ age: { gt: 18 } }, { status: { eq: 'active' } }],
        },
      };

      const result = parseQuery(input);

      expect((result.where as any).and).toHaveLength(2);
    });

    it('should parse query with OR conditions', () => {
      const input = {
        version: '1.0',
        where: {
          or: [{ role: { eq: 'admin' } }, { role: { eq: 'moderator' } }],
        },
      };

      const result = parseQuery(input);

      expect((result.where as any).or).toHaveLength(2);
    });

    it('should parse query with NOT condition', () => {
      const input = {
        version: '1.0',
        where: {
          not: {
            status: { eq: 'deleted' },
          },
        },
      };

      const result = parseQuery(input);

      expect((result.where as any).not).toBeDefined();
    });

    it('should parse query with sort string', () => {
      const input = {
        version: '1.0',
        sort: 'name',
      };

      const result = parseQuery(input);

      expect(result.sort).toBe('name');
    });

    it('should parse query with sort array', () => {
      const input = {
        version: '1.0',
        sort: ['name', '-created_at'],
      };

      const result = parseQuery(input);

      expect(result.sort).toEqual(['name', '-created_at']);
    });

    it('should parse query with limit and skip', () => {
      const input = {
        version: '1.0',
        limit: 10,
        skip: 20,
      };

      const result = parseQuery(input);

      expect(result.limit).toBe(10);
      expect(result.skip).toBe(20);
    });

    it('should parse query with include', () => {
      const input = {
        version: '1.0',
        include: ['author', 'tags'],
      };

      const result = parseQuery(input);

      expect(result.include).toEqual(['author', 'tags']);
    });

    it('should parse query with all operators', () => {
      const input = {
        version: '1.0',
        where: {
          age: { gt: 18 },
          score: { gte: 50 },
          price: { lt: 100 },
          rating: { lte: 5 },
          status: { eq: 'active' },
          role: { ne: 'guest' },
          id: { in: [1, 2, 3] },
          type: { nin: ['spam', 'deleted'] },
          name: { contains: 'john' },
          email: { ends: '@example.com' },
          username: { starts: 'admin' },
        },
      };

      const result = parseQuery(input);

      expect(result.where).toBeDefined();
    });

    it('should parse complex nested conditions', () => {
      const input = {
        version: '1.0',
        where: {
          and: [
            { age: { gte: 18 } },
            {
              or: [{ role: { eq: 'admin' } }, { email: { ends: '@company.com' } }],
            },
          ],
        },
      };

      const result = parseQuery(input);

      expect((result.where as any).and).toHaveLength(2);
      expect((result.where as any).and[1].or).toHaveLength(2);
    });

    it('should throw error for invalid JSON string', () => {
      expect(() => parser.parse('invalid json')).toThrow('Invalid JSON input');
    });

    it('should throw error for non-object input', () => {
      expect(() => parser.parse(null as any)).toThrow('Query must be an object');
    });

    it('should throw error for unknown properties', () => {
      expect(() => parser.parse({ version: '1.0', unknownProp: 'value' })).toThrow(
        'Unknown property "unknownProp" in query',
      );
    });

    it('should throw error for wrong version', () => {
      expect(() => parser.parse({ version: '2.0' as any })).toThrow(
        'Query version must be "1.0" or "1.1"',
      );
    });

    it('should throw error for invalid sort type', () => {
      expect(() => parser.parse({ version: '1.0', sort: 123 as any })).toThrow(
        'sort must be a string or array of strings',
      );
    });

    it('should throw error for negative limit', () => {
      expect(() => parser.parse({ version: '1.0', limit: -1 })).toThrow(
        'limit must be a non-negative number',
      );
    });

    it('should throw error for negative skip', () => {
      expect(() => parser.parse({ version: '1.0', skip: -1 })).toThrow(
        'skip must be a non-negative number',
      );
    });

    it('should throw error for non-array fields', () => {
      expect(() => parser.parse({ version: '1.0', fields: 'id' as any })).toThrow(
        'fields must be an array of strings',
      );
    });

    it('should throw error for non-array include', () => {
      expect(() => parser.parse({ version: '1.0', include: 'author' as any })).toThrow(
        'include must be an array of strings or an object',
      );
    });

    it('should throw error for empty AND array', () => {
      expect(() => parser.parse({ version: '1.0', where: { and: [] } })).toThrow(
        'and must be a non-empty array',
      );
    });

    it('should throw error for empty OR array', () => {
      expect(() => parser.parse({ version: '1.0', where: { or: [] } })).toThrow(
        'or must be a non-empty array',
      );
    });

    it('should throw error for invalid operator', () => {
      expect(() => parser.parse({ version: '1.0', where: { age: { invalid: 18 } } })).toThrow(
        'Unknown operator "invalid" for field "age"',
      );
    });

    it('should throw error for invalid operator value types', () => {
      expect(() => parser.parse({ version: '1.0', where: { name: { contains: 123 } } })).toThrow(
        'Operator "contains" for field "name" must have a string value',
      );

      expect(() => parser.parse({ version: '1.0', where: { status: { in: 'active' } } })).toThrow(
        'Operator "in" for field "status" must have an array value',
      );

      expect(() =>
        parser.parse({ version: '1.0', where: { age: { gt: { field: 123 } } } }),
      ).toThrow(
        'Field reference for operator "gt" on field "age" must have a string field property',
      );

      expect(() =>
        parser.parse({
          version: '1.0',
          where: { age: { gt: { field: 'min_age', extra: 'prop' } } },
        }),
      ).toThrow(
        'Field reference for operator "gt" on field "age" must only have a "field" property',
      );
    });

    it('should enforce default max limit', () => {
      expect(() => parser.parse({ version: '1.0', limit: 1001 })).toThrow(
        'limit must not exceed 1000',
      );
    });

    it('should enforce max nesting depth', () => {
      const parserWithDepth = new JSONQLParser({ maxNestingDepth: 2 });

      const deepQuery = {
        version: '1.0',
        where: {
          and: [
            {
              or: [
                {
                  and: [{ age: { gt: 18 } }],
                },
              ],
            },
          ],
        },
      };

      expect(() => parserWithDepth.parse(deepQuery)).toThrow('Maximum nesting depth of 2 exceeded');
    });

    it('should parse query with groupBy', () => {
      const query = parseQuery({
        version: '1.1',
        groupBy: ['role'],
      });
      expect(query.groupBy).toEqual(['role']);
    });

    it('should parse query with distinct', () => {
      const query = parseQuery({
        version: '1.1',
        distinct: true,
      });
      expect(query.distinct).toBe(true);
    });

    it('should parse query with aggregate', () => {
      const query = parseQuery({
        version: '1.1',
        aggregate: {
          count: { count: 'id' },
        },
      });
      expect(query.aggregate).toEqual({ count: { count: 'id' } });
    });

    it('should parse query with object include (sub-query)', () => {
      const query = parseQuery({
        version: '1.1',
        include: {
          posts: {
            limit: 5,
            where: { published: { eq: true } },
          },
        },
      });
      expect(query.include).toBeDefined();
      if (query.include && !Array.isArray(query.include)) {
        expect(query.include.posts).toBeDefined();
        expect(query.include.posts.limit).toBe(5);
        expect(query.include.posts.where).toBeDefined();
      } else {
        fail('include should be an object');
      }
    });

    it('should allow missing version (defaults to 1.1)', () => {
      const query = parseQuery({
        fields: ['id'],
      });
      expect(query.fields).toEqual(['id']);
      // We decided not to set version if missing, so it should be undefined
      expect(query.version).toBeUndefined();
    });
  });

  describe('stringify', () => {
    it('should stringify a query to JSON', () => {
      const query: JSONQLQuery = {
        version: '1.0',
        fields: ['id', 'name'],
        where: {
          age: { gt: 18 },
        },
      };

      const result = parser.stringify(query);

      expect(JSON.parse(result)).toEqual(query);
    });
  });
});
