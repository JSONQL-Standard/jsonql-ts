import { JSONQLValidator } from './index';
import { JSONQLSchema } from '../types';

const schema: JSONQLSchema = {
  users: {
    fields: {
      id: { type: 'number' },
      name: { type: 'string' },
      email: { type: 'string', allowSelect: false }, // Hidden field
      password: { type: 'string', allowSelect: false, allowFilter: false, allowSort: false }, // Completely restricted
      role: { type: 'string', allowSort: false }, // Can filter but not sort
      metadata: { type: 'object', allowFilter: false }, // Can select but not filter
      salary: { type: 'number', allowSelect: false, allowAggregate: true }, // Can aggregate but not select
      score: { type: 'number', allowGroup: false }, // Cannot group by
      views: { type: 'number', allowSum: false }, // Cannot sum, but can count/avg
      rating: { type: 'number', allowAggregate: false, allowAvg: true }, // Can only avg
    },
    relations: {
      posts: { type: 'hasMany', target: 'posts' },
      secrets: { type: 'hasOne', target: 'secrets', allowInclude: false }, // Restricted relation
    },
  },
  posts: {
    fields: {
      id: { type: 'number' },
      title: { type: 'string' },
    },
  },
  secrets: {
    fields: {
      key: { type: 'string' },
    },
  },
};

describe('JSONQLValidator Permissions', () => {
  const validator = new JSONQLValidator(schema, 'users');

  test('should allow selecting allowed fields', () => {
    const result = validator.validate({
      fields: ['id', 'name'],
    });
    expect(result.valid).toBe(true);
  });

  test('should disallow selecting restricted fields', () => {
    const result = validator.validate({
      fields: ['id', 'email'],
    });
    expect(result.valid).toBe(false);
    expect(result.errors[0].code).toBe('FIELD_NOT_ALLOWED');
    expect(result.errors[0].message).toContain('not allowed to be selected');
  });

  test('should disallow filtering on restricted fields', () => {
    const result = validator.validate({
      where: {
        password: { eq: '123456' },
      },
    });
    expect(result.valid).toBe(false);
    expect(result.errors[0].code).toBe('FIELD_NOT_ALLOWED');
    expect(result.errors[0].message).toContain('not allowed to be used in filter');
  });

  test('should disallow sorting on restricted fields', () => {
    const result = validator.validate({
      sort: ['role'],
    });
    expect(result.valid).toBe(false);
    expect(result.errors[0].code).toBe('FIELD_NOT_ALLOWED');
    expect(result.errors[0].message).toContain('not allowed to be used in sort');
  });

  test('should allow filtering on fields allowed for filter but not sort', () => {
    const result = validator.validate({
      where: {
        role: { eq: 'admin' },
      },
    });
    expect(result.valid).toBe(true);
  });

  test('should disallow filtering on fields restricted for filter', () => {
    const result = validator.validate({
      where: {
        metadata: { eq: {} },
      },
    });
    expect(result.valid).toBe(false);
    expect(result.errors[0].code).toBe('FIELD_NOT_ALLOWED');
  });

  test('should allow aggregation on fields with allowAggregate: true', () => {
    const result = validator.validate({
      aggregate: {
        totalSalary: { sum: 'salary' },
      },
    });
    expect(result.valid).toBe(true);
  });

  test('should disallow selection on fields with allowSelect: false even if allowAggregate: true', () => {
    const result = validator.validate({
      fields: ['salary'],
    });
    expect(result.valid).toBe(false);
    expect(result.errors[0].code).toBe('FIELD_NOT_ALLOWED');
  });

  test('should disallow aggregation on fields with allowAggregate: false (implicit via allowSelect: false)', () => {
    // If allowAggregate is not set, it might default to allowSelect?
    // In our impl, we check allowAggregate explicitly if checkType is 'aggregate'.
    // If allowAggregate is undefined, it passes (default true).
    // Wait, if allowSelect is false, should allowAggregate default to false?
    // Currently implementation treats them independently.
    // Let's test a field that has allowAggregate: false explicitly.

    // We need to update schema for this test or add a new field.
    // But we can't modify const schema easily.
    // Let's create a new validator with custom schema for this test.
    const customSchema: JSONQLSchema = {
      items: {
        fields: {
          price: { type: 'number', allowAggregate: false },
        },
      },
    };
    const v = new JSONQLValidator(customSchema, 'items');
    const result = v.validate({
      aggregate: {
        total: { sum: 'price' },
      },
    });
    expect(result.valid).toBe(false);
    expect(result.errors[0].code).toBe('FIELD_NOT_ALLOWED');
    expect(result.errors[0].message).toContain('not allowed to be aggregated');
  });

  test('should allow including allowed relations', () => {
    const result = validator.validate({
      include: ['posts'],
    });
    expect(result.valid).toBe(true);
  });

  test('should disallow including restricted relations', () => {
    const result = validator.validate({
      include: ['secrets'],
    });
    expect(result.valid).toBe(false);
    expect(result.errors[0].code).toBe('RELATION_NOT_ALLOWED');
    expect(result.errors[0].message).toContain('not allowed to be included');
  });

  test('should disallow grouping on restricted fields', () => {
    const result = validator.validate({
      groupBy: ['score'],
    });
    expect(result.valid).toBe(false);
    expect(result.errors[0].code).toBe('FIELD_NOT_ALLOWED');
    expect(result.errors[0].message).toContain('not allowed to be used in group');
  });

  test('should disallow specific aggregation (sum) on restricted fields', () => {
    const result = validator.validate({
      aggregate: {
        totalViews: { sum: 'views' },
      },
    });
    expect(result.valid).toBe(false);
    expect(result.errors[0].code).toBe('FIELD_NOT_ALLOWED');
    expect(result.errors[0].message).toContain('not allowed to be aggregated with sum');
  });

  test('should allow other aggregations (count) when only specific one is restricted', () => {
    const result = validator.validate({
      aggregate: {
        countViews: { count: 'views' },
      },
    });
    expect(result.valid).toBe(true);
  });

  test('should allow specific aggregation (avg) when general aggregate is false', () => {
    const result = validator.validate({
      aggregate: {
        avgRating: { avg: 'rating' },
      },
    });
    expect(result.valid).toBe(true);
  });

  test('should disallow other aggregations (sum) when general aggregate is false', () => {
    const result = validator.validate({
      aggregate: {
        sumRating: { sum: 'rating' },
      },
    });
    expect(result.valid).toBe(false);
    expect(result.errors[0].code).toBe('FIELD_NOT_ALLOWED');
    expect(result.errors[0].message).toContain('not allowed to be aggregated with sum');
  });
});
