/**
 * Core types for JSONQL v1.0 query structure
 */

export interface JSONQLQuery {
  version?: '1.0' | '1.1';
  from?: string;
  where?: JSONQLWhere;
  sort?: string | string[];
  limit?: number;
  skip?: number;
  fields?: string[];
  include?: string[] | JSONQLIncludeMap;
  groupBy?: string[];
  distinct?: boolean | string[];
  aggregate?: JSONQLAggregate;
}

export interface JSONQLIncludeMap {
  [relation: string]: JSONQLQuery;
}

export interface JSONQLAggregate {
  [alias: string]: JSONQLAggregateFunction;
}

export interface JSONQLAggregateFunction {
  count?: string;
  sum?: string;
  avg?: string;
  min?: string;
  max?: string;
}

export type JSONQLWhere = JSONQLLogicalOperator | JSONQLFieldConditions;

export type JSONQLLogicalOperator =
  | { and: JSONQLWhere[] }
  | { or: JSONQLWhere[] }
  | { not: JSONQLWhere };

export interface JSONQLFieldConditions {
  [field: string]: JSONQLCondition;
}

export interface JSONQLCondition {
  eq?: JSONQLValue;
  ne?: JSONQLValue;
  gt?: JSONQLValue;
  gte?: JSONQLValue;
  lt?: JSONQLValue;
  lte?: JSONQLValue;
  in?: any[];
  nin?: any[];
  contains?: string;
  starts?: string;
  ends?: string;
}

export type JSONQLValue = any | JSONQLFieldReference;

export interface JSONQLFieldReference {
  field: string;
}

export interface JSONQLSchema {
  [tableName: string]: JSONQLTableSchema;
}

export interface JSONQLTableSchema {
  fields: {
    [fieldName: string]: JSONQLFieldSchema;
  };
  relations?: {
    [relationName: string]: JSONQLRelation;
  };
}

export interface JSONQLRelation {
  type: 'hasOne' | 'hasMany' | 'belongsTo';
  target: string;
  foreignKey?: string;
  allowInclude?: boolean;
}

export interface JSONQLFieldSchema {
  type: 'string' | 'number' | 'boolean' | 'date' | 'object' | 'array';
  required?: boolean;
  nullable?: boolean;
  allowSelect?: boolean;
  allowFilter?: boolean;
  allowSort?: boolean;
  allowGroup?: boolean;
  allowAggregate?: boolean; // General switch for all aggregations
  allowCount?: boolean;
  allowSum?: boolean;
  allowAvg?: boolean;
  allowMin?: boolean;
  allowMax?: boolean;
  validation?: {
    min?: number;
    max?: number;
    pattern?: string;
    enum?: any[];
  };
}

export interface ValidationError {
  path: string;
  message: string;
  code: string;
}

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
}

export interface JSONQLParserOptions {
  maxNestingDepth?: number;
  maxLimit?: number;
  allowedFields?: string[];
  allowedIncludes?: string[];
}
