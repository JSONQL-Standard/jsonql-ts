/**
 * JSONQL Parser v1.0 - A library to parse and validate JSONQL queries against schemas
 */

export * from './types';
export * from './parser';
export * from './validator';
export * from './builder';

import { JSONQLParser } from './parser';
import { JSONQLValidator } from './validator';
import { JSONQLQueryBuilder, JSONQLMutationBuilder } from './builder';
import { JSONQLStatement, JSONQLSchema, JSONQLParserOptions } from './types';

/**
 * Main JSONQL class that combines parser, validator, and builder
 */
export class JSONQL {
  private parser: JSONQLParser;
  private validator: JSONQLValidator | null;

  constructor(schema?: JSONQLSchema, tableName?: string, options?: JSONQLParserOptions) {
    this.parser = new JSONQLParser(options);
    this.validator = schema && tableName ? new JSONQLValidator(schema, tableName) : null;
  }

  /**
   * Parse a JSONQL query
   */
  parse(input: string | object): JSONQLStatement {
    return this.parser.parse(input);
  }

  /**
   * Validate a query against the schema
   */
  validate(query: JSONQLStatement) {
    if (!this.validator) {
      throw new Error('No schema provided for validation');
    }
    return this.validator.validate(query);
  }

  /**
   * Parse and validate a query
   */
  parseAndValidate(input: string | object) {
    const query = this.parse(input);
    const validation = this.validate(query);
    return { query, validation };
  }

  /**
   * Create a new query builder
   */
  createBuilder(): JSONQLQueryBuilder {
    return new JSONQLQueryBuilder();
  }

  /**
   * Create a new mutation builder
   */
  createMutationBuilder(): JSONQLMutationBuilder {
    return new JSONQLMutationBuilder();
  }

  /**
   * Set the schema for validation
   */
  setSchema(schema: JSONQLSchema, tableName: string) {
    if (this.validator) {
      this.validator.setSchema(schema, tableName);
    } else {
      this.validator = new JSONQLValidator(schema, tableName);
    }
  }

  /**
   * Get the current schema
   */
  getSchema(): JSONQLSchema | null {
    return this.validator ? this.validator.getSchema() : null;
  }

  /**
   * Get the current table name
   */
  getTableName(): string | null {
    return this.validator ? this.validator.getTableName() : null;
  }
}
