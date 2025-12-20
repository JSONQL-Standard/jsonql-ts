import { JSONQLQuery, JSONQLWhere, JSONQLParserOptions } from '../types';

/**
 * Parses JSONQL v1.0 query strings and objects into structured query objects
 */
export class JSONQLParser {
  private options: Required<JSONQLParserOptions>;

  constructor(options: JSONQLParserOptions = {}) {
    this.options = {
      maxNestingDepth: options.maxNestingDepth ?? 5,
      maxLimit: options.maxLimit ?? 1000,
      allowedFields: options.allowedFields ?? [],
      allowedIncludes: options.allowedIncludes ?? [],
    };
  }

  /**
   * Parse a JSONQL query from a JSON object or string
   */
  parse(input: string | object): JSONQLQuery {
    let queryObject: any;

    if (typeof input === 'string') {
      try {
        queryObject = JSON.parse(input);
      } catch (error) {
        throw new Error(
          `Invalid JSON input: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    } else {
      queryObject = input;
    }

    return this.parseQuery(queryObject);
  }

  /**
   * Parse a query object into a structured JSONQLQuery
   */
  private parseQuery(obj: any, isSubQuery = false): JSONQLQuery {
    if (!obj || typeof obj !== 'object') {
      throw new Error('Query must be an object');
    }

    // Validate version
    if (!isSubQuery) {
      if (obj.version !== undefined && obj.version !== '1.0' && obj.version !== '1.1') {
        throw new Error('Query version must be "1.0" or "1.1"');
      }
      // If version is missing, we default to 1.1 implicitly by not throwing
    }

    // Check for additional properties
    const allowedProperties = new Set([
      'version',
      'from',
      'where',
      'sort',
      'limit',
      'skip',
      'fields',
      'include',
      'groupBy',
      'distinct',
      'aggregate',
    ]);
    for (const key of Object.keys(obj)) {
      if (!allowedProperties.has(key)) {
        throw new Error(`Unknown property "${key}" in query`);
      }
    }

    const query: JSONQLQuery = {};
    if (obj.version) {
      query.version = obj.version;
    } else if (!isSubQuery) {
      // Default to 1.1 for top level queries if not specified?
      // Or just leave it undefined as per type definition.
      // Let's leave it undefined.
    }

    // Parse from
    if (obj.from !== undefined) {
      if (typeof obj.from !== 'string') {
        throw new Error('from must be a string');
      }
      query.from = obj.from;
    }

    // Parse where clause
    if (obj.where !== undefined) {
      query.where = this.parseWhere(obj.where, 0);
    }

    // Parse sort
    if (obj.sort !== undefined) {
      if (typeof obj.sort === 'string') {
        let field = obj.sort;
        if (field.startsWith('-')) {
          field = field.substring(1);
        }
        if (!this.isValidIdentifier(field)) {
          throw new Error(`Invalid sort field: "${obj.sort}"`);
        }
        query.sort = [obj.sort];
      } else if (Array.isArray(obj.sort)) {
        for (const s of obj.sort) {
          if (typeof s !== 'string') {
            throw new Error('sort elements must be strings');
          }
          let field = s;
          if (field.startsWith('-')) {
            field = field.substring(1);
          }
          if (!this.isValidIdentifier(field)) {
            throw new Error(`Invalid sort field: "${s}"`);
          }
        }
        query.sort = obj.sort;
      } else {
        throw new Error('sort must be a string or array of strings');
      }
    }

    // Parse limit
    if (obj.limit !== undefined) {
      if (typeof obj.limit !== 'number' || obj.limit < 0) {
        throw new Error('limit must be a non-negative number');
      }
      if (obj.limit > this.options.maxLimit) {
        throw new Error(`limit must not exceed ${this.options.maxLimit}`);
      }
      query.limit = obj.limit;
    }

    // Parse skip
    if (obj.skip !== undefined) {
      if (typeof obj.skip !== 'number' || obj.skip < 0) {
        throw new Error('skip must be a non-negative number');
      }
      query.skip = obj.skip;
    }

    // Parse fields
    if (obj.fields !== undefined) {
      if (!Array.isArray(obj.fields)) {
        throw new Error('fields must be an array of strings');
      }
      if (obj.fields.length === 0) {
        throw new Error('Fields array cannot be empty');
      }
      for (const field of obj.fields) {
        if (typeof field !== 'string') {
          throw new Error('Each field must be a string');
        }
        if (!this.isValidIdentifier(field)) {
          throw new Error(`Invalid field name: "${field}"`);
        }
      }
      query.fields = obj.fields;
    }

    // Parse include
    if (obj.include !== undefined) {
      if (Array.isArray(obj.include)) {
        for (const i of obj.include) {
          if (typeof i !== 'string') {
            throw new Error('include elements must be strings');
          }
          if (!this.isValidIdentifier(i)) {
            throw new Error(`Invalid relation name: "${i}"`);
          }
        }
        if (
          this.options.allowedIncludes.length > 0 &&
          !obj.include.every((i: string) => this.options.allowedIncludes.includes(i))
        ) {
          throw new Error('include contains disallowed relation names');
        }
        query.include = obj.include;
      } else if (typeof obj.include === 'object') {
        const includeMap: any = {};
        for (const [relation, subQuery] of Object.entries(obj.include)) {
          if (!this.isValidIdentifier(relation)) {
            throw new Error(`Invalid relation name: "${relation}"`);
          }
          if (
            this.options.allowedIncludes.length > 0 &&
            !this.options.allowedIncludes.includes(relation)
          ) {
            throw new Error(`include contains disallowed relation name: ${relation}`);
          }
          includeMap[relation] = this.parseQuery(subQuery, true);
        }
        query.include = includeMap;
      } else {
        throw new Error('include must be an array of strings or an object');
      }
    }

    // Parse groupBy
    if (obj.groupBy !== undefined) {
      if (!Array.isArray(obj.groupBy)) {
        throw new Error('groupBy must be an array of strings');
      }
      for (const field of obj.groupBy) {
        if (typeof field !== 'string') {
          throw new Error('groupBy elements must be strings');
        }
        if (!this.isValidIdentifier(field)) {
          throw new Error(`Invalid field name in groupBy: "${field}"`);
        }
      }
      query.groupBy = obj.groupBy;
    }

    // Parse distinct
    if (obj.distinct !== undefined) {
      if (typeof obj.distinct !== 'boolean' && !Array.isArray(obj.distinct)) {
        throw new Error('distinct must be a boolean or an array of strings');
      }
      query.distinct = obj.distinct;
    }

    // Parse aggregate
    if (obj.aggregate !== undefined) {
      if (typeof obj.aggregate !== 'object' || Array.isArray(obj.aggregate)) {
        throw new Error('aggregate must be an object');
      }
      // Validate aggregate structure
      for (const [alias, func] of Object.entries(obj.aggregate)) {
        if (typeof func !== 'object' || func === null) {
          throw new Error(`aggregate function for alias "${alias}" must be an object`);
        }
        // We could validate allowed functions here (count, sum, avg, min, max)
        const allowedFunctions = new Set(['count', 'sum', 'avg', 'min', 'max']);
        for (const key of Object.keys(func as object)) {
          if (!allowedFunctions.has(key)) {
            throw new Error(`Unknown aggregate function "${key}"`);
          }
        }
      }
      query.aggregate = obj.aggregate;
    }

    return query;
  }

  /**
   * Parse a where clause
   */
  private parseWhere(obj: any, depth: number): JSONQLWhere {
    if (depth > this.options.maxNestingDepth) {
      throw new Error(`Maximum nesting depth of ${this.options.maxNestingDepth} exceeded`);
    }

    if (!obj || typeof obj !== 'object') {
      throw new Error('where clause must be an object');
    }

    // Check if it's a logical operator
    if ('and' in obj || 'or' in obj || 'not' in obj) {
      return this.parseLogicalOperator(obj, depth);
    }

    // Otherwise, it's field conditions
    return this.parseFieldConditions(obj);
  }

  /**
   * Parse logical operators (and, or, not)
   */
  private parseLogicalOperator(obj: any, depth: number): JSONQLWhere {
    const keys = Object.keys(obj);

    if (keys.length !== 1) {
      throw new Error('Logical operator must have exactly one property');
    }

    const key = keys[0];

    if (key === 'and' || key === 'or') {
      if (!Array.isArray(obj[key]) || obj[key].length === 0) {
        throw new Error(`${key} must be a non-empty array`);
      }
      return {
        [key]: obj[key].map((item: any) => this.parseWhere(item, depth + 1)),
      } as JSONQLWhere;
    }

    if (key === 'not') {
      return {
        not: this.parseWhere(obj.not, depth + 1),
      };
    }

    throw new Error(`Unknown logical operator: ${key}`);
  }

  /**
   * Parse field conditions
   */
  private parseFieldConditions(obj: any): JSONQLWhere {
    const conditions: any = {};

    for (const [field, condition] of Object.entries(obj)) {
      if (!this.isValidIdentifier(field)) {
        throw new Error(`Invalid field name in where clause: "${field}"`);
      }

      // Handle implicit equality (syntactic sugar)
      if (condition === null || typeof condition !== 'object') {
        conditions[field] = { eq: condition };
        continue;
      }

      conditions[field] = {};
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
          throw new Error(`Unknown operator "${operator}" for field "${field}"`);
        }

        // Validate operator value types
        const value = (condition as any)[operator];
        if (['contains', 'starts', 'ends'].includes(operator)) {
          if (typeof value !== 'string') {
            throw new Error(`Operator "${operator}" for field "${field}" must have a string value`);
          }
        } else if (['in', 'nin'].includes(operator)) {
          if (!Array.isArray(value)) {
            throw new Error(`Operator "${operator}" for field "${field}" must have an array value`);
          }
        }
        // Validate field reference structure if present
        if (value && typeof value === 'object' && 'field' in value) {
          if (typeof value.field !== 'string') {
            throw new Error(
              `Field reference for operator "${operator}" on field "${field}" must have a string field property`,
            );
          }
          if (Object.keys(value).length !== 1) {
            throw new Error(
              `Field reference for operator "${operator}" on field "${field}" must only have a "field" property`,
            );
          }
        }
        conditions[field][operator] = value;
      }
    }

    return conditions;
  }

  /**
   * Stringify a JSONQLQuery back to JSON
   */
  stringify(query: JSONQLQuery): string {
    return JSON.stringify(query, null, 2);
  }

  private isValidIdentifier(id: string): boolean {
    // Allow dot notation for nested fields (e.g. "author.name")
    return /^[a-zA-Z0-9_]+(\.[a-zA-Z0-9_]+)*$/.test(id);
  }
}
