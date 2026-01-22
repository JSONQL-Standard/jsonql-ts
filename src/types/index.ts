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

export type JSONQLOperation = 'query' | 'create' | 'update' | 'delete';

export type JSONQLStatement = JSONQLQuery | JSONQLMutation;

export interface JSONQLMutationBase {
  op: 'create' | 'update' | 'delete'; // Keep this line as is
  version?: '1.0' | '1.1';
  from?: string;
  where?: JSONQLWhere;
  limit?: number;
  fields?: string[];
}

export type JSONQLInsertData = Record<string, any> | Array<Record<string, any>>;
export type JSONQLPatch = Record<string, any>;

export interface JSONQLCreateMutation extends JSONQLMutationBase {
  op: 'create';
  data: JSONQLInsertData;
}

export interface JSONQLUpdateMutation extends JSONQLMutationBase {
  op: 'update';
  patch: JSONQLPatch;
}

export interface JSONQLDeleteMutation extends JSONQLMutationBase {
  op: 'delete';
}

export type JSONQLMutation = JSONQLCreateMutation | JSONQLUpdateMutation | JSONQLDeleteMutation;

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
  tables: {
    [tableName: string]: JSONQLTableSchema;
  };
  settings?: JSONQLSettings;
}

export interface JSONQLSettings {
  allowAggregate?: boolean;
  maxDepth?: number;
}

export interface JSONQLTableSchema {
  fields: {
    [fieldName: string]: JSONQLFieldSchema;
  };
  relations?: {
    [relationName: string]: JSONQLRelation;
  };
  allowCreate?: boolean;
  allowUpdate?: boolean;
  allowDelete?: boolean;
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
  allowCreate?: boolean;
  allowUpdate?: boolean;
  validation?: {
    min?: number;
    max?: number;
    pattern?: string;
    enum?: any[];
  };
}

export function isMutation(statement: JSONQLStatement): statement is JSONQLMutation {
  const op = (statement as JSONQLMutation).op;
  if (op === 'create' || op === 'update' || op === 'delete') {
    return true;
  }
  return 'data' in (statement as any) || 'patch' in (statement as any);
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
