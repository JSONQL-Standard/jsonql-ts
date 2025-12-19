import { JSONQLValidator } from '../src/validator';
import { JSONQLSchema } from '../src/types';

const schema: JSONQLSchema = {
  users: {
    fields: {
      id: { type: 'number', allowSelect: true, allowFilter: true },
      name: { type: 'string', allowSelect: true, allowFilter: true },
      role: { type: 'string', allowSelect: true, allowFilter: true }
    }
  }
};

describe('JSONQLValidator Error Codes', () => {
  const validator = new JSONQLValidator(schema, 'users');

  it('should return INVALID_OPERATOR for unknown operator', () => {
    const result = validator.validate({
      where: {
        name: { unknownOp: 'Alice' } as any
      }
    });
    expect(result.valid).toBe(false);
    expect(result.errors[0].code).toBe('INVALID_OPERATOR');
    expect(result.errors[0].message).toContain('Unknown operator "unknownOp"');
  });

  it('should return INVALID_VALUE for wrong type in operator', () => {
    const result = validator.validate({
      where: {
        name: { in: 'not-an-array' } as any
      }
    });
    expect(result.valid).toBe(false);
    expect(result.errors[0].code).toBe('INVALID_VALUE');
    expect(result.errors[0].message).toContain('requires an array value');
  });

  it('should return FIELD_NOT_FOUND for unknown field', () => {
    const result = validator.validate({
      fields: ['unknownField']
    });
    expect(result.valid).toBe(false);
    expect(result.errors[0].code).toBe('FIELD_NOT_FOUND');
  });
});
