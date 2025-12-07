import { JSONQLValidator } from './index';
import { JSONQLSchema, JSONQLQuery } from '../types';

const mockSchema: JSONQLSchema = {
  users: {
    fields: {
      id: { type: 'number' },
      name: { type: 'string' },
      role: { type: 'string' },
      age: { type: 'number' },
    },
    relations: {
      posts: { target: 'posts', type: 'hasMany' },
    },
  },
  posts: {
    fields: {
      id: { type: 'number' },
      title: { type: 'string' },
      published: { type: 'boolean' },
      authorId: { type: 'number' },
    },
    relations: {
      author: { target: 'users', type: 'belongsTo' },
    },
  },
};

describe('JSONQLValidator v1.1 Features', () => {
  const validator = new JSONQLValidator(mockSchema, 'users');

  test('should validate groupBy', () => {
    const query: JSONQLQuery = {
      groupBy: ['role'],
    };
    const result = validator.validate(query);
    expect(result.valid).toBe(true);
  });

  test('should validate distinct (boolean)', () => {
    const query: JSONQLQuery = {
      distinct: true,
    };
    const result = validator.validate(query);
    expect(result.valid).toBe(true);
  });

  test('should validate distinct (array)', () => {
    const query: JSONQLQuery = {
      distinct: ['role'],
    };
    const result = validator.validate(query);
    expect(result.valid).toBe(true);
  });

  test('should validate aggregate', () => {
    const query: JSONQLQuery = {
      aggregate: {
        total_users: { count: 'id' },
        avg_age: { avg: 'age' },
      },
    };
    const result = validator.validate(query);
    expect(result.valid).toBe(true);
  });

  test('should validate advanced include (sub-query)', () => {
    const query: JSONQLQuery = {
      include: {
        posts: {
          limit: 5,
          where: {
            published: { eq: true },
          },
        },
      },
    };
    const result = validator.validate(query);
    expect(result.valid).toBe(true);
  });

  test('should fail on invalid field in groupBy', () => {
    const query: JSONQLQuery = {
      groupBy: ['invalid_field'],
    };
    const result = validator.validate(query);
    expect(result.valid).toBe(false);
    expect(result.errors[0].code).toBe('FIELD_NOT_FOUND');
  });

  test('should fail on invalid field in aggregate', () => {
    const query: JSONQLQuery = {
      aggregate: {
        count: { count: 'invalid_field' },
      },
    };
    const result = validator.validate(query);
    expect(result.valid).toBe(false);
    expect(result.errors[0].code).toBe('FIELD_NOT_FOUND');
  });

  test('should fail on invalid relation in advanced include', () => {
    const query: JSONQLQuery = {
      include: {
        invalid_relation: {
          limit: 5,
        },
      },
    };
    const result = validator.validate(query);
    expect(result.valid).toBe(false);
    expect(result.errors[0].code).toBe('RELATION_NOT_FOUND');
  });

  test('should fail on invalid field in sub-query', () => {
    const query: JSONQLQuery = {
      include: {
        posts: {
          where: {
            invalid_field: { eq: true },
          },
        },
      },
    };
    const result = validator.validate(query);
    expect(result.valid).toBe(false);
    // The error path should indicate the nesting
    expect(result.errors[0].path).toContain('include.posts');
    expect(result.errors[0].code).toBe('FIELD_NOT_FOUND');
  });
});
