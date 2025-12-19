import { Database } from 'sqlite';
import { JSONQLIntrospector } from './introspector';
import { JSONQLSchema, JSONQLFieldSchema } from '../types';

export class SQLiteIntrospector implements JSONQLIntrospector {
  private db: Database;

  constructor(db: Database) {
    this.db = db;
  }

  async introspect(): Promise<JSONQLSchema> {
    const schema: JSONQLSchema = {};

    // 1. Get all tables
    const tables = await this.db.all(
      `SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'`
    );

    for (const table of tables) {
      const tableName = table.name;
      schema[tableName] = {
        fields: {},
        relations: {} // Relations are harder in SQLite without FK introspection, skipping for basic example
      };

      // 2. Get columns for each table
      const columns = await this.db.all(`PRAGMA table_info("${tableName}")`);

      for (const col of columns) {
        const fieldName = col.name;
        const type = this.mapSQLiteType(col.type);
        
        const fieldSchema: JSONQLFieldSchema = {
          type: type,
          nullable: col.notnull === 0,
          // Default permissions for introspected schema
          allowSelect: true,
          allowFilter: true,
          allowSort: true,
        };

        if (col.pk === 1) {
            // Primary key specific logic if needed
        }

        schema[tableName].fields[fieldName] = fieldSchema;
      }
    }

    return schema;
  }

  private mapSQLiteType(sqliteType: string): 'string' | 'number' | 'boolean' | 'date' | 'object' | 'array' {
    const type = sqliteType.toUpperCase();
    if (type.includes('INT') || type.includes('REAL') || type.includes('FLOAT') || type.includes('DOUBLE')) {
      return 'number';
    }
    if (type.includes('CHAR') || type.includes('TEXT') || type.includes('CLOB')) {
      return 'string';
    }
    if (type.includes('BOOL')) {
      return 'boolean';
    }
    if (type.includes('DATE') || type.includes('TIME')) {
      return 'date'; // Or string, depending on how it's stored
    }
    return 'string'; // Default fallback
  }
}
