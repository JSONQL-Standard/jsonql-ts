import { JSONQLSchema } from './types';

/**
 * ResultHydrator
 *
 * Transforms flat database rows (from SQL JOINs) into nested JSON objects
 * based on column aliases (e.g. "author__name" -> author: { name: "..." })
 * AND groups them based on Schema relations (hasMany -> Array).
 */
export class ResultHydrator {
  /**
   * Hydrate a list of flat database rows into nested objects.
   * @param rows Array of flat objects from the database driver
   * @param schema Optional schema to enable Tree Hydration (grouping)
   * @param rootTable The name of the root table in the schema
   */
  hydrate(rows: any[], schema?: JSONQLSchema, rootTable?: string): any[] {
    if (!rows || rows.length === 0) return [];

    // 1. Basic Hydration (Flat -> Nested Objects)
    // This converts "items__id" to { items: { id: ... } }
    const hydratedRows = rows.map((row) => this.hydrateRow(row));

    // 2. If no schema, return flat list (backward compatibility)
    if (!schema || !rootTable) {
      return hydratedRows;
    }

    // 3. Tree Hydration (Grouping)
    // If rows don't have the PK, we can't group safely. Return flat list.
    // This handles aggregates and queries without ID.
    const pk = 'id'; // TODO: Configurable
    if (hydratedRows[0][pk] === undefined) {
      return hydratedRows;
    }

    return this.groupResults(hydratedRows, schema, rootTable);
  }

  private hydrateRow(row: any): any {
    const result: any = {};

    for (const key of Object.keys(row)) {
      const value = row[key];

      if (key.includes('__')) {
        // Handle nested property: "author__name" -> author: { name: "..." }
        const parts = key.split('__');
        let current = result;

        for (let i = 0; i < parts.length - 1; i++) {
          const part = parts[i];
          if (!current[part]) {
            current[part] = {};
          }
          current = current[part];
        }

        const lastPart = parts[parts.length - 1];
        current[lastPart] = value;
      } else {
        // Simple property
        result[key] = value;
      }
    }

    return result;
  }

  private groupResults(rows: any[], schema: JSONQLSchema, tableName: string): any[] {
    const pk = 'id'; // TODO: Configurable PK
    const map = new Map<string, any>();
    const order: any[] = [];

    for (const row of rows) {
      const id = row[pk];
      if (id === undefined || id === null) continue;

      let parent = map.get(id);
      if (!parent) {
        // Initialize new parent
        parent = this.initObject(row, schema, tableName);
        map.set(id, parent);
        order.push(parent);
      }

      // Merge this row's data into the parent
      this.merge(parent, row, schema, tableName);
    }

    return order;
  }

  private initObject(source: any, schema: JSONQLSchema, tableName: string): any {
    const obj: any = {};
    const tableSchema = schema.tables[tableName];

    // Copy simple fields
    for (const key of Object.keys(source)) {
      if (tableSchema?.relations && tableSchema.relations[key]) continue; // Skip relations for now
      obj[key] = source[key];
    }

    // Initialize relations
    if (tableSchema?.relations) {
      for (const [relName, relDef] of Object.entries(tableSchema.relations)) {
        if (relDef.type === 'hasMany') {
          obj[relName] = [];
        } else {
          obj[relName] = null; // Placeholder
        }
      }
    }
    return obj;
  }

  private merge(target: any, source: any, schema: JSONQLSchema, tableName: string) {
    const tableSchema = schema.tables[tableName];
    if (!tableSchema || !tableSchema.relations) return;

    for (const [relName, relDef] of Object.entries(tableSchema.relations)) {
      const sourceChild = source[relName];

      // If source has no data for this relation (e.g. null join), skip
      // Check if sourceChild is empty object or null
      if (
        !sourceChild ||
        (typeof sourceChild === 'object' && Object.keys(sourceChild).length === 0)
      ) {
        continue;
      }

      if (relDef.type === 'hasMany') {
        // If ID is explicitly null, it's a failed join (empty relation)
        if (sourceChild.id === null) {
          continue;
        }

        // If ID is undefined (not selected), treat as Aggregate/Single Object
        if (sourceChild.id === undefined) {
          if (Object.keys(sourceChild).length > 0) {
            // If target is currently an empty array (default init), replace with object
            if (Array.isArray(target[relName]) && target[relName].length === 0) {
              target[relName] = { ...sourceChild };
            } else if (!Array.isArray(target[relName])) {
              // Already an object, merge
              Object.assign(target[relName], sourceChild);
            }
          }
          continue;
        }

        // Target is array
        if (!Array.isArray(target[relName])) target[relName] = [];

        const childId = sourceChild.id;
        let existing = target[relName].find((c: any) => c.id === childId);

        if (!existing) {
          existing = this.initObject(sourceChild, schema, relDef.target);
          target[relName].push(existing);
        }

        // Recursively merge
        this.merge(existing, sourceChild, schema, relDef.target);
      } else {
        // belongsTo / hasOne
        // Target is object
        // We don't strictly need ID here, just merge properties
        if (!target[relName]) {
          target[relName] = this.initObject(sourceChild, schema, relDef.target);
        }
        this.merge(target[relName], sourceChild, schema, relDef.target);
      }
    }
  }
}
