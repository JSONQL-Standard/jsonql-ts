import { JSONQLSchema } from '../types';
import { JSONQLIntrospector } from './introspector';
import * as fs from 'fs';
import * as path from 'path';

export interface SchemaManagerOptions {
  introspector?: JSONQLIntrospector;
  schemaFilePath?: string;
  runtimeSchema?: JSONQLSchema;

  // Lifecycle Hooks
  beforeIntrospect?: (config: SchemaManagerOptions) => Promise<SchemaManagerOptions> | SchemaManagerOptions;
  afterIntrospect?: (schema: JSONQLSchema) => Promise<JSONQLSchema> | JSONQLSchema;
}

export class SchemaManager {
  constructor(private options: SchemaManagerOptions) {}

  async load(): Promise<JSONQLSchema> {
    if (this.options.beforeIntrospect) {
      this.options = await this.options.beforeIntrospect(this.options);
    }

    let finalSchema: JSONQLSchema = {};

    // 1. Priority: Introspection (Base Layer)
    if (this.options.introspector) {
      let introspectedSchema = await this.options.introspector.introspect();

      if (this.options.afterIntrospect) {
        introspectedSchema = await this.options.afterIntrospect(introspectedSchema);
      }

      finalSchema = this.mergeSchemas(finalSchema, introspectedSchema);
    }

    // 2. Priority: File-Based Config (Patch Layer)
    if (this.options.schemaFilePath && fs.existsSync(this.options.schemaFilePath)) {
      try {
        const fileContent = fs.readFileSync(this.options.schemaFilePath, 'utf-8');
        const fileSchema = JSON.parse(fileContent);
        finalSchema = this.mergeSchemas(finalSchema, fileSchema);
      } catch (error) {
        console.warn(`Failed to load schema from file: ${this.options.schemaFilePath}`, error);
      }
    }

    // 3. Priority: Runtime Override (Dynamic Layer)
    if (this.options.runtimeSchema) {
      finalSchema = this.mergeSchemas(finalSchema, this.options.runtimeSchema);
    }

    return finalSchema;
  }

  private mergeSchemas(base: JSONQLSchema, override: JSONQLSchema): JSONQLSchema {
    const result: JSONQLSchema = JSON.parse(JSON.stringify(base)); // Deep clone base

    for (const [tableName, tableSchema] of Object.entries(override)) {
      if (!result[tableName]) {
        result[tableName] = tableSchema;
      } else {
        // Merge fields
        if (tableSchema.fields) {
          for (const [fieldName, fieldSchema] of Object.entries(tableSchema.fields)) {
            if (!result[tableName].fields[fieldName]) {
              result[tableName].fields[fieldName] = fieldSchema;
            } else {
              // Merge field properties (override)
              result[tableName].fields[fieldName] = {
                ...result[tableName].fields[fieldName],
                ...fieldSchema,
              };
            }
          }
        }
        // Merge relations
        if (tableSchema.relations) {
          if (!result[tableName].relations) {
            result[tableName].relations = {};
          }
          for (const [relationName, relationSchema] of Object.entries(tableSchema.relations)) {
            result[tableName].relations![relationName] = relationSchema;
          }
        }
      }
    }
    return result;
  }
}
