import {
  JSONQLQuery,
  JSONQLSchema,
  ValidationResult,
  ValidationError,
  JSONQLWhere,
  JSONQLCondition,
  JSONQLFieldReference,
  JSONQLLogicalOperator,
  JSONQLFieldConditions,
  JSONQLStatement,
  JSONQLMutation,
  JSONQLCreateMutation,
  JSONQLUpdateMutation,
  JSONQLDeleteMutation,
  isMutation,
} from '../types';
import { JsonQLValidationError } from '../errors';

/**
 * Validates JSONQL v1.0 queries against schemas
 */
export class JSONQLValidator {
  private schema: JSONQLSchema;
  private tableName: string;

  constructor(schema: JSONQLSchema, tableName: string) {
    this.schema = schema;
    this.tableName = tableName;
  }

  /**
   * Validate a query against the schema
   */
  validate(statement: JSONQLStatement): ValidationResult {
    if (isMutation(statement)) {
      return this.validateMutation(statement);
    }

    return this.validateQuery(statement);
  }

  /**
   * Validate and throw on the first error (fail-fast).
   * @throws {JsonQLValidationError} if validation fails
   */
  validateOrThrow(statement: JSONQLStatement): void {
    const result = this.validate(statement);
    if (!result.valid && result.errors.length > 0) {
      throw new JsonQLValidationError(result.errors[0].message, result.errors);
    }
  }

  private validateQuery(query: JSONQLQuery): ValidationResult {
    const errors: ValidationError[] = [];

    // Check global settings
    if (this.schema.settings) {
      if (this.schema.settings.allowAggregate === false && (query.aggregate || query.groupBy)) {
        errors.push({
          path: 'aggregate',
          message: 'Aggregations are disabled in this schema',
          code: 'AGGREGATE_DISABLED',
        });
        return { valid: false, errors };
      }

      if (this.schema.settings.maxDepth !== undefined) {
        const depth = this.calculateDepth(query);
        if (depth > this.schema.settings.maxDepth) {
          errors.push({
            path: 'include',
            message: `Query depth ${depth} exceeds maximum allowed depth of ${this.schema.settings.maxDepth}`,
            code: 'QUERY_TOO_DEEP',
          });
          return { valid: false, errors };
        }
      }
    }

    // Validate table exists
    if (!this.schema.tables[this.tableName]) {
      errors.push({
        path: 'table',
        message: `Table "${this.tableName}" not found in schema`,
        code: 'TABLE_NOT_FOUND',
      });
      return { valid: false, errors };
    }

    const tableSchema = this.schema.tables[this.tableName];
    const tableFields = tableSchema.fields as Record<string, any> | undefined;

    if (!tableFields) {
      return {
        valid: errors.length === 0,
        errors,
      };
    }

    // Validate fields
    if (query.fields && tableFields) {
      for (const field of query.fields) {
        const fieldSchema = tableFields[field];
        if (!fieldSchema) {
          errors.push({
            path: `fields.${field}`,
            message: `Field "${field}" not found in table "${this.tableName}"`,
            code: 'FIELD_NOT_FOUND',
          });
        } else if (fieldSchema.allowSelect === false) {
          errors.push({
            path: `fields.${field}`,
            message: `Field "${field}" is not allowed to be selected`,
            code: 'FIELD_NOT_ALLOWED',
          });
        }
      }
    }

    // Normalize includes to string array for checking access
    let includeNames: string[] = [];
    if (query.include) {
      if (Array.isArray(query.include)) {
        includeNames = query.include;
      } else {
        includeNames = Object.keys(query.include);
      }
    }

    // Validate include
    if (query.include) {
      if (Array.isArray(query.include)) {
        for (const relation of query.include) {
          const relationSchema = tableSchema.relations?.[relation];
          if (!relationSchema) {
            errors.push({
              path: `include.${relation}`,
              message: `Relation "${relation}" not found in table "${this.tableName}"`,
              code: 'RELATION_NOT_FOUND',
            });
          } else if (relationSchema.allowInclude === false) {
            errors.push({
              path: `include.${relation}`,
              message: `Relation "${relation}" is not allowed to be included`,
              code: 'RELATION_NOT_ALLOWED',
            });
          }
        }
      } else {
        // Validate include map (sub-queries)
        for (const [relation, subQuery] of Object.entries(query.include)) {
          const relationSchema = tableSchema.relations?.[relation];
          if (!relationSchema) {
            errors.push({
              path: `include.${relation}`,
              message: `Relation "${relation}" not found in table "${this.tableName}"`,
              code: 'RELATION_NOT_FOUND',
            });
            continue;
          } else if (relationSchema.allowInclude === false) {
            errors.push({
              path: `include.${relation}`,
              message: `Relation "${relation}" is not allowed to be included`,
              code: 'RELATION_NOT_ALLOWED',
            });
            continue;
          }

          // Recursive validation for sub-query
          const relatedTableName = relationSchema.target;
          const subValidator = new JSONQLValidator(this.schema, relatedTableName);
          const subResult = subValidator.validate(subQuery);

          if (!subResult.valid) {
            for (const error of subResult.errors) {
              errors.push({
                ...error,
                path: `include.${relation}.${error.path}`,
              });
            }
          }
        }
      }
    }

    // Validate where clause
    if (query.where) {
      this.validateWhere(query.where, tableSchema, includeNames, errors);
    }

    // Validate sort
    if (query.sort) {
      const sortFields = Array.isArray(query.sort) ? query.sort : [query.sort];
      for (const sortField of sortFields) {
        const field = sortField.startsWith('-') ? sortField.slice(1) : sortField;
        this.validateFieldPath(field, tableSchema, includeNames, errors, 'sort', 'sort');
      }
    }

    // Validate groupBy
    if (query.groupBy) {
      for (const field of query.groupBy) {
        this.validateFieldPath(field, tableSchema, includeNames, errors, 'groupBy', 'group');
      }
    }

    // Validate distinct
    if (query.distinct && Array.isArray(query.distinct)) {
      for (const field of query.distinct) {
        this.validateFieldPath(field, tableSchema, includeNames, errors, 'distinct', 'select');
      }
    }

    // Validate aggregate
    if (query.aggregate) {
      for (const [alias, func] of Object.entries(query.aggregate)) {
        for (const [op, field] of Object.entries(func)) {
          if (field) {
            this.validateFieldPath(
              field,
              tableSchema,
              includeNames,
              errors,
              `aggregate.${alias}.${op}`,
              op as any,
            );
          }
        }
      }
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  /**
   * Validate where clause
   */
  private validateWhere(
    where: JSONQLWhere,
    tableSchema: any,
    includes: string[],
    errors: ValidationError[],
  ) {
    // Check if it's a logical operator
    const logicalWhere = where as JSONQLLogicalOperator;
    if ('and' in logicalWhere || 'or' in logicalWhere || 'not' in logicalWhere) {
      if ('and' in logicalWhere) {
        for (const subWhere of logicalWhere.and) {
          this.validateWhere(subWhere, tableSchema, includes, errors);
        }
      }
      if ('or' in logicalWhere) {
        for (const subWhere of logicalWhere.or) {
          this.validateWhere(subWhere, tableSchema, includes, errors);
        }
      }
      if ('not' in logicalWhere) {
        this.validateWhere(logicalWhere.not, tableSchema, includes, errors);
      }
    } else {
      // Field conditions
      const fieldConditions = where as JSONQLFieldConditions;
      for (const [field, condition] of Object.entries(fieldConditions)) {
        this.validateFieldPath(field, tableSchema, includes, errors, 'where', 'filter');
        this.validateCondition(field, condition, tableSchema, includes, errors);
      }
    }
  }

  /**
   * Validate a field path (supports nested fields via includes)
   */
  private validateFieldPath(
    fieldPath: string,
    tableSchema: any,
    includes: string[],
    errors: ValidationError[],
    context: string,
    checkType?: 'select' | 'filter' | 'sort' | 'group' | 'count' | 'sum' | 'avg' | 'min' | 'max',
  ) {
    const checkPermission = (schema: any, type: string) => {
      if (type === 'select' && schema.allowSelect === false) return false;
      if (type === 'filter' && schema.allowFilter === false) return false;
      if (type === 'sort' && schema.allowSort === false) return false;
      if (type === 'group' && schema.allowGroup === false) return false;

      if (['count', 'sum', 'avg', 'min', 'max'].includes(type)) {
        const specificProp = `allow${type.charAt(0).toUpperCase() + type.slice(1)}`;
        if (schema[specificProp] === false) return false;
        if (schema[specificProp] === undefined && schema.allowAggregate === false) return false;
      }
      return true;
    };

    const parts = fieldPath.split('.');

    if (parts.length === 1) {
      // Direct field
      if (!tableSchema.fields) {
        return;
      }
      const fieldSchema = tableSchema.fields[fieldPath];
      if (!fieldSchema) {
        errors.push({
          path: `${context}.${fieldPath}`,
          message: `Field "${fieldPath}" not found in table "${this.tableName}"`,
          code: 'FIELD_NOT_FOUND',
        });
      } else {
        if (checkType && !checkPermission(fieldSchema, checkType)) {
          let msg = `Field "${fieldPath}" is not allowed to be used in ${checkType}`;
          if (['count', 'sum', 'avg', 'min', 'max'].includes(checkType)) {
            msg = `Field "${fieldPath}" is not allowed to be aggregated with ${checkType}`;
          } else if (checkType === 'select') {
            msg = `Field "${fieldPath}" is not allowed to be selected`;
          }

          errors.push({
            path: `${context}.${fieldPath}`,
            message: msg,
            code: 'FIELD_NOT_ALLOWED',
          });
        }
      }
    } else {
      // Nested field (e.g., author.name)
      const [relation, ...nestedPath] = parts;

      if (!includes.includes(relation)) {
        errors.push({
          path: `${context}.${fieldPath}`,
          message: `Relation "${relation}" must be in include array to access nested field`,
          code: 'MISSING_INCLUDE',
        });
        return;
      }

      if (!tableSchema.relations || !tableSchema.relations[relation]) {
        errors.push({
          path: `${context}.${fieldPath}`,
          message: `Relation "${relation}" not found in table "${this.tableName}"`,
          code: 'RELATION_NOT_FOUND',
        });
        return;
      }

      // Validate nested field in related table
      const relatedTableName = tableSchema.relations[relation].target;
      const relatedTable = this.schema.tables[relatedTableName];
      const nestedFieldName = nestedPath.join('.');
      const relatedFieldSchema = relatedTable?.fields?.[nestedFieldName];

      if (relatedTable && relatedTable.fields && !relatedFieldSchema) {
        errors.push({
          path: `${context}.${fieldPath}`,
          message: `Field "${nestedFieldName}" not found in related table "${relatedTableName}"`,
          code: 'FIELD_NOT_FOUND',
        });
      } else if (relatedFieldSchema) {
        if (checkType && !checkPermission(relatedFieldSchema, checkType)) {
          let msg = `Field "${nestedFieldName}" is not allowed to be used in ${checkType}`;
          if (['count', 'sum', 'avg', 'min', 'max'].includes(checkType)) {
            msg = `Field "${nestedFieldName}" is not allowed to be aggregated with ${checkType}`;
          } else if (checkType === 'select') {
            msg = `Field "${nestedFieldName}" is not allowed to be selected`;
          }

          errors.push({
            path: `${context}.${fieldPath}`,
            message: msg,
            code: 'FIELD_NOT_ALLOWED',
          });
        }
      }
    }
  }

  /**
   * Validate a condition
   */
  private validateCondition(
    field: string,
    condition: JSONQLCondition,
    tableSchema: any,
    includes: string[],
    errors: ValidationError[],
  ) {
    const validOperators = [
      'eq',
      'ne',
      'gt',
      'gte',
      'lt',
      'lte',
      'in',
      'nin',
      'contains',
      'starts',
      'ends',
    ];

    for (const operator of Object.keys(condition)) {
      if (!validOperators.includes(operator)) {
        errors.push({
          path: `where.${field}.${operator}`,
          message: `Unknown operator "${operator}"`,
          code: 'INVALID_OPERATOR',
        });
        continue;
      }

      const value = (condition as any)[operator];

      // Validate array operators
      if ((operator === 'in' || operator === 'nin') && !Array.isArray(value)) {
        errors.push({
          path: `where.${field}.${operator}`,
          message: `Operator "${operator}" requires an array value`,
          code: 'INVALID_VALUE',
        });
      }

      // Validate string operators
      if (
        (operator === 'contains' || operator === 'starts' || operator === 'ends') &&
        typeof value !== 'string'
      ) {
        errors.push({
          path: `where.${field}.${operator}`,
          message: `Operator "${operator}" requires a string value`,
          code: 'INVALID_VALUE',
        });
      }

      // Validate field references
      if (this.isFieldReference(value)) {
        this.validateFieldPath(
          value.field,
          tableSchema,
          includes,
          errors,
          `where.${field}.${operator}`,
          'filter',
        );
      }
    }
  }

  /**
   * Check if a value is a field reference
   */
  private isFieldReference(value: any): value is JSONQLFieldReference {
    return (
      value && typeof value === 'object' && 'field' in value && typeof value.field === 'string'
    );
  }

  private validateMutation(mutation: JSONQLMutation): ValidationResult {
    const errors: ValidationError[] = [];

    if (!this.schema.tables[this.tableName]) {
      errors.push({
        path: 'table',
        message: `Table "${this.tableName}" not found in schema`,
        code: 'TABLE_NOT_FOUND',
      });
      return { valid: false, errors };
    }

    const tableSchema = this.schema.tables[this.tableName];
    const tableFields = tableSchema.fields as Record<string, any> | undefined;

    if (mutation.op === 'create') {
      if (tableSchema.allowCreate === false) {
        errors.push({
          path: 'op',
          message: `Create is not allowed on table "${this.tableName}"`,
          code: 'CREATE_NOT_ALLOWED',
        });
      }

      const rows = Array.isArray(mutation.data) ? mutation.data : [mutation.data];
      rows.forEach((row, index) => {
        if (!row || typeof row !== 'object' || Array.isArray(row)) {
          errors.push({
            path: `data.${index}`,
            message: 'Each data row must be an object',
            code: 'INVALID_DATA_ROW',
          });
          return;
        }

        if (tableFields) {
          for (const fieldName of Object.keys(row)) {
            const fieldSchema = tableFields[fieldName];
            if (!fieldSchema) {
              errors.push({
                path: `data.${index}.${fieldName}`,
                message: `Field "${fieldName}" not found in table "${this.tableName}"`,
                code: 'FIELD_NOT_FOUND',
              });
              continue;
            }
            if (fieldSchema.allowCreate === false) {
              errors.push({
                path: `data.${index}.${fieldName}`,
                message: `Field "${fieldName}" is not allowed in create`,
                code: 'FIELD_NOT_ALLOWED',
              });
            }
          }

          for (const [fieldName, fieldSchema] of Object.entries(tableFields)) {
            if (fieldSchema.required && !(fieldName in row) && fieldSchema.nullable !== true) {
              errors.push({
                path: `data.${index}.${fieldName}`,
                message: `Field "${fieldName}" is required`,
                code: 'FIELD_REQUIRED',
              });
            }
          }
        }
      });
    }

    if (mutation.op === 'update') {
      if (tableSchema.allowUpdate === false) {
        errors.push({
          path: 'op',
          message: `Update is not allowed on table "${this.tableName}"`,
          code: 'UPDATE_NOT_ALLOWED',
        });
      }

      if (!mutation.where) {
        errors.push({
          path: 'where',
          message: 'Update requires a where clause',
          code: 'MISSING_WHERE',
        });
      } else {
        this.validateWhere(mutation.where, tableSchema, [], errors);
      }

      if (tableFields) {
        for (const fieldName of Object.keys(mutation.patch)) {
          const fieldSchema = tableFields[fieldName];
          if (!fieldSchema) {
            errors.push({
              path: `patch.${fieldName}`,
              message: `Field "${fieldName}" not found in table "${this.tableName}"`,
              code: 'FIELD_NOT_FOUND',
            });
            continue;
          }
          if (fieldSchema.allowUpdate === false) {
            errors.push({
              path: `patch.${fieldName}`,
              message: `Field "${fieldName}" is not allowed in update`,
              code: 'FIELD_NOT_ALLOWED',
            });
          }
        }
      }
    }

    if (mutation.op === 'delete') {
      if (tableSchema.allowDelete === false) {
        errors.push({
          path: 'op',
          message: `Delete is not allowed on table "${this.tableName}"`,
          code: 'DELETE_NOT_ALLOWED',
        });
      }

      if (!mutation.where) {
        errors.push({
          path: 'where',
          message: 'Delete requires a where clause',
          code: 'MISSING_WHERE',
        });
      } else {
        this.validateWhere(mutation.where, tableSchema, [], errors);
      }
    }

    if (mutation.fields) {
      for (const field of mutation.fields) {
        this.validateFieldPath(field, tableSchema, [], errors, 'fields', 'select');
      }
    }

    return { valid: errors.length === 0, errors };
  }

  /**
   * Update the schema
   */
  setSchema(schema: JSONQLSchema, tableName: string) {
    this.schema = schema;
    this.tableName = tableName;
  }

  /**
   * Get the current schema
   */
  getSchema(): JSONQLSchema {
    return this.schema;
  }

  /**
   * Get the current table name
   */
  getTableName(): string {
    return this.tableName;
  }

  /**
   * Calculate the depth of the query based on includes
   */
  private calculateDepth(query: JSONQLQuery): number {
    if (!query.include) {
      return 0;
    }

    if (Array.isArray(query.include)) {
      return 1;
    }

    let maxChildDepth = 0;
    for (const subQuery of Object.values(query.include)) {
      maxChildDepth = Math.max(maxChildDepth, this.calculateDepth(subQuery));
    }

    return 1 + maxChildDepth;
  }
}
