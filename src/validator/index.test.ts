import { JSONQLValidator } from '../validator';
import { JSONQLQuery, JSONQLSchema } from '../types';

describe('JSONQLValidator', () => {
  let schema: JSONQLSchema;
  let validator: JSONQLValidator;

  beforeEach(() => {
    schema = {
      users: {
        fields: {
          id: { type: 'number', required: true },
          name: { type: 'string', required: true },
          email: { type: 'string', required: true },
          age: { type: 'number' },
          status: { type: 'string' },
          created_at: { type: 'date' },
        },
        relations: {
          posts: {
            type: 'hasMany',
            target: 'posts',
          },
          profile: {
            type: 'hasOne',
            target: 'profiles',
          },
        },
      },
      posts: {
        fields: {
          id: { type: 'number', required: true },
          title: { type: 'string', required: true },
          content: { type: 'string' },
          user_id: { type: 'number' },
          created_at: { type: 'date' },
        },
        relations: {
          author: {
            type: 'belongsTo',
            target: 'users',
          },
        },
      },
      profiles: {
        fields: {
          id: { type: 'number', required: true },
          bio: { type: 'string' },
          user_id: { type: 'number' },
        },
      },
    };

    validator = new JSONQLValidator(schema, 'users');
  });

  describe('validate', () => {
    it('should validate a simple query', () => {
      const query: JSONQLQuery = {
        version: '1.0',
        fields: ['id', 'name'],
      };

      const result = validator.validate(query);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should detect invalid field', () => {
      const query: JSONQLQuery = {
        version: '1.0',
        fields: ['id', 'invalid_field'],
      };

      const result = validator.validate(query);

      expect(result.valid).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].code).toBe('FIELD_NOT_FOUND');
    });

    it('should validate where clause with valid fields', () => {
      const query: JSONQLQuery = {
        version: '1.0',
        where: {
          age: { gt: 18 },
          status: { eq: 'active' },
        },
      };

      const result = validator.validate(query);

      expect(result.valid).toBe(true);
    });

    it('should detect invalid field in where clause', () => {
      const query: JSONQLQuery = {
        version: '1.0',
        where: {
          invalid_field: { eq: 'value' },
        },
      };

      const result = validator.validate(query);

      expect(result.valid).toBe(false);
      expect(result.errors[0].code).toBe('FIELD_NOT_FOUND');
    });

    it('should validate sort with valid fields', () => {
      const query: JSONQLQuery = {
        version: '1.0',
        sort: ['name', '-created_at'],
      };

      const result = validator.validate(query);

      expect(result.valid).toBe(true);
    });

    it('should detect invalid field in sort', () => {
      const query: JSONQLQuery = {
        version: '1.0',
        sort: 'invalid_field',
      };

      const result = validator.validate(query);

      expect(result.valid).toBe(false);
      expect(result.errors[0].code).toBe('FIELD_NOT_FOUND');
    });

    it('should validate include with valid relations', () => {
      const query: JSONQLQuery = {
        version: '1.0',
        include: ['posts', 'profile'],
      };

      const result = validator.validate(query);

      expect(result.valid).toBe(true);
    });

    it('should detect invalid relation in include', () => {
      const query: JSONQLQuery = {
        version: '1.0',
        include: ['invalid_relation'],
      };

      const result = validator.validate(query);

      expect(result.valid).toBe(false);
      expect(result.errors[0].code).toBe('RELATION_NOT_FOUND');
    });

    it('should validate nested field access with include', () => {
      const query: JSONQLQuery = {
        version: '1.0',
        where: {
          'posts.title': { contains: 'hello' },
        },
        include: ['posts'],
      };

      const result = validator.validate(query);

      expect(result.valid).toBe(true);
    });

    it('should detect missing include for nested field', () => {
      const query: JSONQLQuery = {
        version: '1.0',
        where: {
          'posts.title': { contains: 'hello' },
        },
      };

      const result = validator.validate(query);

      expect(result.valid).toBe(false);
      expect(result.errors[0].code).toBe('MISSING_INCLUDE');
    });

    it('should validate logical operators', () => {
      const query: JSONQLQuery = {
        version: '1.0',
        where: {
          and: [{ age: { gte: 18 } }, { status: { eq: 'active' } }],
        },
      };

      const result = validator.validate(query);

      expect(result.valid).toBe(true);
    });

    it('should validate array operators', () => {
      const query: JSONQLQuery = {
        version: '1.0',
        where: {
          status: { in: ['active', 'pending'] },
        },
      };

      const result = validator.validate(query);

      expect(result.valid).toBe(true);
    });

    it('should detect invalid value type for in operator', () => {
      const query: JSONQLQuery = {
        version: '1.0',
        where: {
          status: { in: 'active' as any },
        },
      };

      const result = validator.validate(query);

      expect(result.valid).toBe(false);
      expect(result.errors[0].code).toBe('INVALID_OPERATOR_VALUE');
    });

    it('should detect invalid value type for string operators', () => {
      const query: JSONQLQuery = {
        version: '1.0',
        where: {
          name: { contains: 123 as any },
        },
      };

      const result = validator.validate(query);

      expect(result.valid).toBe(false);
      expect(result.errors[0].code).toBe('INVALID_OPERATOR_VALUE');
    });

    it('should validate field references', () => {
      const query: JSONQLQuery = {
        version: '1.0',
        where: {
          age: { gt: { field: 'id' } },
        },
      };

      const result = validator.validate(query);

      expect(result.valid).toBe(true);
    });

    it('should detect invalid field in field reference', () => {
      const query: JSONQLQuery = {
        version: '1.0',
        where: {
          age: { gt: { field: 'invalid_field' } },
        },
      };

      const result = validator.validate(query);

      expect(result.valid).toBe(false);
      expect(result.errors[0].code).toBe('FIELD_NOT_FOUND');
    });
  });

  describe('setSchema', () => {
    it('should update schema and table name', () => {
      validator.setSchema(schema, 'posts');

      expect(validator.getTableName()).toBe('posts');
    });
  });
});
