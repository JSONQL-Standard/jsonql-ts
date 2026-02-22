import { JSONQL, JSONQLSchema } from '../../../src/core';

describe('JSONQL Main Class', () => {
  let schema: JSONQLSchema;

  beforeEach(() => {
    schema = {
      tables: {
        users: {
          fields: {
            id: { type: 'number', required: true },
            name: { type: 'string', required: true },
            email: { type: 'string', required: true },
            age: { type: 'number' },
          },
          relations: {
            posts: { type: 'hasMany', target: 'posts' },
          },
        },
      },
    };
  });

  describe('constructor', () => {
    it('should create instance without schema', () => {
      const jsonql = new JSONQL();
      expect(jsonql).toBeDefined();
      expect(jsonql.getSchema()).toBeNull();
    });

    it('should create instance with schema', () => {
      const jsonql = new JSONQL(schema, 'users');
      expect(jsonql.getSchema()).toBe(schema);
      expect(jsonql.getTableName()).toBe('users');
    });
  });

  describe('parse', () => {
    it('should parse a query', () => {
      const jsonql = new JSONQL();
      const query = jsonql.parse({
        version: '1.0',
        fields: ['id', 'name'],
      });

      expect(query.version).toBe('1.0');
      expect(query.fields).toEqual(['id', 'name']);
    });
  });

  describe('validate', () => {
    it('should throw error when no schema provided', () => {
      const jsonql = new JSONQL();
      const query = { version: '1.0' as const };

      expect(() => jsonql.validate(query)).toThrow('No schema provided for validation');
    });

    it('should validate a query', () => {
      const jsonql = new JSONQL(schema, 'users');
      const query = {
        version: '1.0' as const,
        fields: ['id', 'name'],
      };

      const result = jsonql.validate(query);
      expect(result.valid).toBe(true);
    });
  });

  describe('parseAndValidate', () => {
    it('should parse and validate a query', () => {
      const jsonql = new JSONQL(schema, 'users');
      const result = jsonql.parseAndValidate({
        version: '1.0',
        fields: ['id', 'name'],
      });

      expect(result.query.version).toBe('1.0');
      expect(result.validation.valid).toBe(true);
    });
  });

  describe('createBuilder', () => {
    it('should create a query builder', () => {
      const jsonql = new JSONQL();
      const builder = jsonql.createBuilder();

      expect(builder).toBeDefined();
      const query = builder.fields('id', 'name').build();
      expect(query.version).toBe('1.0');
    });
  });

  describe('setSchema', () => {
    it('should set schema when validator exists', () => {
      const jsonql = new JSONQL(schema, 'users');
      const newSchema = { ...schema };

      jsonql.setSchema(newSchema, 'posts');

      expect(jsonql.getTableName()).toBe('posts');
    });

    it('should create validator when setting schema without one', () => {
      const jsonql = new JSONQL();
      expect(jsonql.getSchema()).toBeNull();

      jsonql.setSchema(schema, 'users');

      expect(jsonql.getSchema()).toBe(schema);
      expect(jsonql.getTableName()).toBe('users');
    });
  });
});
