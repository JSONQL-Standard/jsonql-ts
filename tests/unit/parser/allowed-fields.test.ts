import { JSONQLParser } from '../../../src/parser';

describe('JSONQLParser - allowedFields enforcement', () => {
  describe('query fields', () => {
    const parser = new JSONQLParser({ allowedFields: ['id', 'name', 'email'] });

    it('should accept queries with only allowed fields', () => {
      const result = parser.parse({ fields: ['id', 'name'] });
      expect(result.fields).toEqual(['id', 'name']);
    });

    it('should reject queries with disallowed fields', () => {
      expect(() => parser.parse({ fields: ['id', 'password'] })).toThrow(
        'Fields not allowed: password',
      );
    });

    it('should reject all disallowed fields in error message', () => {
      expect(() => parser.parse({ fields: ['secret', 'password'] })).toThrow(
        'Fields not allowed: secret, password',
      );
    });

    it('should not restrict when no fields are specified', () => {
      const result = parser.parse({ limit: 10 });
      expect(result).toBeDefined();
    });
  });

  describe('mutation fields (returning)', () => {
    const parser = new JSONQLParser({ allowedFields: ['id', 'name'] });

    it('should accept mutations with allowed returning fields', () => {
      const result = parser.parse({
        op: 'create',
        data: { name: 'test' },
        fields: ['id', 'name'],
      });
      expect(result.fields).toEqual(['id', 'name']);
    });

    it('should reject mutations with disallowed returning fields', () => {
      expect(() =>
        parser.parse({
          op: 'create',
          data: { name: 'test' },
          fields: ['id', 'email'],
        }),
      ).toThrow('Fields not allowed: email');
    });
  });

  describe('empty allowedFields (unrestricted)', () => {
    const parser = new JSONQLParser({ allowedFields: [] });

    it('should allow any fields when allowedFields is empty', () => {
      const result = parser.parse({ fields: ['anything', 'goes'] });
      expect(result.fields).toEqual(['anything', 'goes']);
    });
  });

  describe('default (no options)', () => {
    const parser = new JSONQLParser();

    it('should allow any fields by default', () => {
      const result = parser.parse({ fields: ['id', 'secret', 'password'] });
      expect(result.fields).toEqual(['id', 'secret', 'password']);
    });
  });
});
