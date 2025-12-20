import { JSONQLSchema, JSONQLQuery, ValidationResult } from '../types';
import { DatabaseDriver } from '../driver';

export interface AdapterOptions<Context = any> {
  schema?: JSONQLSchema;
  driver?: DatabaseDriver;
  execute?: (sql: string, params: any[]) => Promise<any[]>;
  dialect?: 'sqlite' | 'postgres' | 'mysql';

  // Lifecycle Hooks
  beforeParse?: (rawInput: any, context: Context) => Promise<any> | any;
  afterParse?: (query: JSONQLQuery, context: Context) => Promise<JSONQLQuery> | JSONQLQuery;
  beforeQuery?: (query: JSONQLQuery, context: Context) => Promise<JSONQLQuery> | JSONQLQuery;
  beforeValidate?: (query: JSONQLQuery, context: Context) => Promise<JSONQLQuery> | JSONQLQuery;
  afterValidate?: (result: ValidationResult, context: Context) => Promise<void> | void;
  beforeHydrate?: (flatRows: any[], context: Context) => Promise<any[]> | any[];
  afterHydrate?: (result: any, context: Context) => Promise<any> | any;
  afterQuery?: (result: any, context: Context) => Promise<any> | any;
}

export interface FrameworkAdapter<Context = any> {
  handleRequest(input: any, context: Context): Promise<any>;
}
