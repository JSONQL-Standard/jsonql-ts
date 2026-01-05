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
} from '../types';

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
  validate(query: JSONQLQuery): ValidationResult {
    const errors: ValidationError[] = [];

    // Check global settings
    if (this.schema.settings) {
      if (
        this.schema.settings.allowAggregate === false &&
        (query.aggregate || query.groupBy)
      ) {
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

    // Validate fields
    if (query.fields) {
      for (const field of query.fields) {
        const fieldSchema = tableSchema.fields[field];
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
      const relatedFieldSchema = relatedTable?.fields[nestedFieldName];

      if (relatedTable && !relatedFieldSchema) {
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
