import {
  JSONQLQuery,
  JSONQLWhere,
  JSONQLCondition,
  JSONQLFieldReference,
  JSONQLLogicalOperator,
} from '../types';

/**
 * Fluent API for building JSONQL v1.0 queries
 */
export class JSONQLQueryBuilder {
  private query: JSONQLQuery;

  constructor() {
    this.query = {
      version: '1.0',
    };
  }

  /**
   * Set the where clause
   */
  where(where: JSONQLWhere): this {
    this.query.where = where;
    return this;
  }

  /**
   * Add an AND condition to the where clause
   */
  andWhere(where: JSONQLWhere): this {
    if (!this.query.where) {
      this.query.where = where;
    } else {
      const currentWhere = this.query.where as JSONQLLogicalOperator;
      if ('and' in currentWhere && currentWhere.and) {
        currentWhere.and.push(where);
      } else {
        this.query.where = {
          and: [this.query.where, where],
        };
      }
    }
    return this;
  }

  /**
   * Add an OR condition to the where clause
   */
  orWhere(where: JSONQLWhere): this {
    if (!this.query.where) {
      this.query.where = where;
    } else {
      const currentWhere = this.query.where as JSONQLLogicalOperator;
      if ('or' in currentWhere && currentWhere.or) {
        currentWhere.or.push(where);
      } else {
        this.query.where = {
          or: [this.query.where, where],
        };
      }
    }
    return this;
  }

  /**
   * Set the sort clause
   */
  sort(...fields: string[]): this {
    if (fields.length === 1) {
      this.query.sort = fields[0];
    } else {
      this.query.sort = fields;
    }
    return this;
  }

  /**
   * Set the limit
   */
  limit(limit: number): this {
    this.query.limit = limit;
    return this;
  }

  /**
   * Set the skip (offset)
   */
  skip(skip: number): this {
    this.query.skip = skip;
    return this;
  }

  /**
   * Set the fields (projection)
   */
  fields(...fields: string[]): this {
    this.query.fields = fields;
    return this;
  }

  /**
   * Set the include (eager loading)
   */
  include(...relations: string[]): this {
    this.query.include = relations;
    return this;
  }

  /**
   * Build the query
   */
  build(): JSONQLQuery {
    return { ...this.query };
  }

  /**
   * Reset the builder
   */
  reset(): this {
    this.query = {
      version: '1.0',
    };
    return this;
  }
}

/**
 * Helper function to create a field condition
 */
export function field(fieldName: string, condition: JSONQLCondition): JSONQLWhere {
  return { [fieldName]: condition };
}

/**
 * Helper function to create an eq condition
 */
export function eq(value: any): JSONQLCondition {
  return { eq: value };
}

/**
 * Helper function to create a ne condition
 */
export function ne(value: any): JSONQLCondition {
  return { ne: value };
}

/**
 * Helper function to create a gt condition
 */
export function gt(value: any): JSONQLCondition {
  return { gt: value };
}

/**
 * Helper function to create a gte condition
 */
export function gte(value: any): JSONQLCondition {
  return { gte: value };
}

/**
 * Helper function to create a lt condition
 */
export function lt(value: any): JSONQLCondition {
  return { lt: value };
}

/**
 * Helper function to create a lte condition
 */
export function lte(value: any): JSONQLCondition {
  return { lte: value };
}

/**
 * Helper function to create an in condition
 */
export function inArray(values: any[]): JSONQLCondition {
  return { in: values };
}

/**
 * Helper function to create a nin condition
 */
export function nin(values: any[]): JSONQLCondition {
  return { nin: values };
}

/**
 * Helper function to create a contains condition
 */
export function contains(value: string): JSONQLCondition {
  return { contains: value };
}

/**
 * Helper function to create a starts condition
 */
export function starts(value: string): JSONQLCondition {
  return { starts: value };
}

/**
 * Helper function to create an ends condition
 */
export function ends(value: string): JSONQLCondition {
  return { ends: value };
}

/**
 * Helper function to create a field reference
 */
export function fieldRef(fieldPath: string): JSONQLFieldReference {
  return { field: fieldPath };
}

/**
 * Helper function to create an AND condition
 */
export function and(...conditions: JSONQLWhere[]): JSONQLWhere {
  return { and: conditions };
}

/**
 * Helper function to create an OR condition
 */
export function or(...conditions: JSONQLWhere[]): JSONQLWhere {
  return { or: conditions };
}

/**
 * Helper function to create a NOT condition
 */
export function not(condition: JSONQLWhere): JSONQLWhere {
  return { not: condition };
}
