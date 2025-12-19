import { JSONQLSchema } from '../types';
import { JSONQLIntrospector } from './introspector';
import * as fs from 'fs';
import * as path from 'path';

export interface SchemaManagerOptions {
  introspector?: JSONQLIntrospector;
  schemaFilePath?: string;
  runtimeSchema?: JSONQLSchema;
}

export class SchemaManager {
  private introspector?: JSONQLIntrospector;
  private schemaFilePath?: string;
  private runtimeSchema?: JSONQLSchema;

  constructor(options: SchemaManagerOptions) {
    this.introspector = options.introspector;
    this.schemaFilePath = options.schemaFilePath;
    this.runtimeSchema = options.runtimeSchema;
  }

  async load(): Promise<JSONQLSchema> {
    let finalSchema: JSONQLSchema = {};

    // 1. Priority: Introspection (Base Layer)
    if (this.introspector) {
      const introspectedSchema = await this.introspector.introspect();
      finalSchema = this.mergeSchemas(finalSchema, introspectedSchema);
    }

    // 2. Priority: File-Based Config (Patch Layer)
    if (this.schemaFilePath && fs.existsSync(this.schemaFilePath)) {
      try {
        const fileContent = fs.readFileSync(this.schemaFilePath, 'utf-8');
        const fileSchema = JSON.parse(fileContent);
        finalSchema = this.mergeSchemas(finalSchema, fileSchema);
      } catch (error) {
        console.warn(`Failed to load schema from file: ${this.schemaFilePath}`, error);
      }
    }

    // 3. Priority: Runtime Override (Dynamic Layer)
    if (this.runtimeSchema) {
      finalSchema = this.mergeSchemas(finalSchema, this.runtimeSchema);
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
