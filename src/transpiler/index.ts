import { JSONQLQuery, JSONQLWhere, JSONQLSchema } from '../types';
import { SQLDialect, SQLiteDialect } from './dialect';

export interface TranspilationResult {
  sql: string;
  parameters: any[];
}

export class SQLTranspiler {
  private dialect: SQLDialect;

  constructor(dialect?: SQLDialect | 'sqlite' | 'postgres' | 'mysql') {
    if (!dialect) {
      this.dialect = new SQLiteDialect();
    } else if (typeof dialect === 'string') {
      // Factory for backward compatibility and ease of use
      switch (dialect) {
        case 'postgres':
          // Dynamic import or just require if we want to avoid circular deps or heavy loads?
          // But here we just import the class.
          const { PostgresDialect } = require('./dialect');
          this.dialect = new PostgresDialect();
          break;
        case 'mysql':
          const { MySQLDialect } = require('./dialect');
          this.dialect = new MySQLDialect();
          break;
        case 'sqlite':
        default:
          this.dialect = new SQLiteDialect();
          break;
      }
    } else {
      this.dialect = dialect;
    }
  }

  transpile(query: JSONQLQuery, tableName: string, schema?: JSONQLSchema): TranspilationResult {
    // Use dialect quoting
    const quotedTableName = this.dialect.quoteIdentifier(tableName);
    if (!this.isValidIdentifier(tableName)) {
      throw new Error(`Invalid table name: ${tableName}`);
    }

    const parameters: any[] = [];

    // 1. SELECT clause
    let selectParts: string[] = [];

    // Handle fields
    if (query.fields && query.fields.length > 0) {
      for (const field of query.fields) {
        if (!this.isValidIdentifier(field)) {
          throw new Error(`Invalid field name: ${field}`);
        }
        selectParts.push(`${quotedTableName}.${this.dialect.quoteIdentifier(field)}`);
      }
    } else if (!query.aggregate) {
      // Default to all fields of the main table if no fields specified and no aggregate
      selectParts.push(`${quotedTableName}.*`);
    }

    // Handle aggregates
    if (query.aggregate) {
      for (const [alias, agg] of Object.entries(query.aggregate)) {
        if (!this.isValidIdentifier(alias)) {
          throw new Error(`Invalid aggregate alias: ${alias}`);
        }
        // agg is like { sum: "total" }
        const func = Object.keys(agg)[0]; // sum, count, etc.
        const field = (agg as any)[func];

        if (!['sum', 'avg', 'min', 'max', 'count'].includes(func)) {
          throw new Error(`Unknown aggregate function: ${func}`);
        }

        const quotedAlias = this.dialect.quoteIdentifier(alias);

        if (field === '*') {
          selectParts.push(`${func.toUpperCase()}(*) AS ${quotedAlias}`);
        } else {
          if (!this.isValidIdentifier(field)) {
            throw new Error(`Invalid aggregate field: ${field}`);
          }
          selectParts.push(
            `${func.toUpperCase()}(${quotedTableName}.${this.dialect.quoteIdentifier(field)}) AS ${quotedAlias}`,
          );
        }
      }
    }

    // Handle groupBy (implicitly adds to select if not present? usually explicit in JSONQL)
    if ((!query.fields || query.fields.length === 0) && query.groupBy) {
      for (const field of query.groupBy) {
        const quotedField = this.dialect.quoteIdentifier(field);
        // Check if already selected (simple check)
        const fullField = `${quotedTableName}.${quotedField}`;
        if (!selectParts.includes(fullField)) {
          selectParts.push(fullField);
        }
      }
    }

    // 2. FROM clause
    let sql = `SELECT ${selectParts.join(', ')} FROM ${quotedTableName}`;
    let joins: string[] = [];

    // Handle Includes (Joins)
    if (query.include) {
      if (!schema) {
        throw new Error('Schema is required for include operations');
      }
      this.processIncludes(
        query,
        tableName,
        quotedTableName,
        schema,
        selectParts,
        joins,
        '',
        parameters,
      );

      // Rebuild SELECT with included fields
      sql = `SELECT ${selectParts.join(', ')} FROM ${quotedTableName}`;
    }

    if (joins.length > 0) {
      sql += ` ${joins.join(' ')}`;
    }

    // 3. WHERE clause
    if (query.where) {
      const conditions = this.parseWhere(query.where, parameters, quotedTableName);
      if (conditions.length > 0) {
        sql += ` WHERE ${conditions.join(' AND ')}`;
      }
    }

    // 3.5 GROUP BY clause
    if (query.groupBy && query.groupBy.length > 0) {
      const groups: string[] = [];
      for (const field of query.groupBy) {
        if (!this.isValidIdentifier(field)) {
          throw new Error(`Invalid groupBy field: ${field}`);
        }
        groups.push(`${quotedTableName}.${this.dialect.quoteIdentifier(field)}`);
      }
      sql += ` GROUP BY ${groups.join(', ')}`;
    }

    // 4. SORT clause
    if (query.sort) {
      let sortStr = '';
      if (typeof query.sort === 'string') {
        sortStr = query.sort;
      } else if (Array.isArray(query.sort)) {
        sortStr = query.sort[0];
      }

      if (sortStr) {
        let field = sortStr;
        let desc = false;
        if (field.startsWith('-')) {
          desc = true;
          field = field.substring(1);
        }

        if (!this.isValidIdentifier(field)) {
          throw new Error(`Invalid sort field: ${field}`);
        }

        sql += ` ORDER BY ${quotedTableName}.${this.dialect.quoteIdentifier(field)} ${desc ? 'DESC' : 'ASC'}`;
      }
    }

    // 5. LIMIT / SKIP
    if (query.limit !== undefined) {
      sql += ` LIMIT ${query.limit}`;
    }
    if (query.skip !== undefined) {
      sql += ` OFFSET ${query.skip}`;
    }

    return { sql, parameters };
  }

  private processIncludes(
    query: JSONQLQuery,
    parentTable: string,
    parentAlias: string,
    schema: JSONQLSchema,
    selectParts: string[],
    joins: string[],
    aliasPrefix: string = '',
    parameters: any[] = [],
  ) {
    if (!query.include) return;

    const tableSchema = schema[parentTable];
    if (!tableSchema || !tableSchema.relations) {
      throw new Error(`No relations defined for table: ${parentTable}`);
    }

    const includes = Array.isArray(query.include)
      ? query.include.map((i) => ({ name: i, query: {} as JSONQLQuery }))
      : Object.entries(query.include).map(([k, v]) => ({ name: k, query: v }));

    for (const inc of includes) {
      const relation = tableSchema.relations[inc.name];
      if (!relation) {
        throw new Error(`Relation not found: ${inc.name}`);
      }

      const targetTable = relation.target;
      const quotedTargetTable = this.dialect.quoteIdentifier(targetTable);

      // Alias logic: if prefix exists, append. e.g. "items" -> "items__product"
      const alias = aliasPrefix ? `${aliasPrefix}__${inc.name}` : inc.name;
      const quotedAlias = this.dialect.quoteIdentifier(alias);

      // Determine Join Condition
      let joinCondition = '';
      if (relation.type === 'belongsTo') {
        const fk = relation.foreignKey || `${inc.name}_id`; // Use relation name for FK guess
        joinCondition = `${parentAlias}.${this.dialect.quoteIdentifier(fk)} = ${quotedAlias}.id`;
      } else if (relation.type === 'hasMany' || relation.type === 'hasOne') {
        const fk = relation.foreignKey || `${parentTable}_id`; // Use parent table name for FK guess
        joinCondition = `${parentAlias}.id = ${quotedAlias}.${this.dialect.quoteIdentifier(fk)}`;
      }

      // Handle WHERE in include (add to ON clause)
      // Only if NOT aggregating (aggregates handle where internally)
      if (inc.query.where && !inc.query.aggregate) {
        const whereConditions = this.parseWhere(inc.query.where, parameters, quotedAlias);
        if (whereConditions.length > 0) {
          joinCondition += ` AND ${whereConditions.join(' AND ')}`;
        }
      }

      // Handle Aggregate in Include
      if (inc.query.aggregate) {
        if (relation.type !== 'hasMany') {
          throw new Error('Aggregate in include is only supported for hasMany relations');
        }
        const fk = relation.foreignKey || `${parentTable}_id`;
        const quotedFk = this.dialect.quoteIdentifier(fk);

        // Build Aggregate Selects
        const aggSelects: string[] = [quotedFk];
        for (const [aggAlias, func] of Object.entries(inc.query.aggregate)) {
          const funcName = Object.keys(func)[0];
          const field = (func as any)[funcName];
          const quotedField = field === '*' ? '*' : this.dialect.quoteIdentifier(field);
          aggSelects.push(
            `${funcName.toUpperCase()}(${quotedField}) AS ${this.dialect.quoteIdentifier(aggAlias)}`,
          );
        }

        // Build Subquery
        let subQuery = `SELECT ${aggSelects.join(', ')} FROM ${quotedTargetTable}`;

        // Handle Where inside Aggregate Subquery
        if (inc.query.where) {
          // Note: parseWhere usually expects an alias. Here we are selecting from the raw table in subquery.
          // We can pass quotedTargetTable as alias, or empty if we don't want alias prefix in subquery.
          // But wait, parseWhere adds alias prefix.
          // If we use quotedTargetTable as alias, the WHERE clause will be "target"."field" = ?.
          // This is correct for the subquery: SELECT ... FROM "target" WHERE "target"."field" = ?
          const whereConditions = this.parseWhere(inc.query.where, parameters, quotedTargetTable);
          if (whereConditions.length > 0) {
            subQuery += ` WHERE ${whereConditions.join(' AND ')}`;
          }
        }

        subQuery += ` GROUP BY ${quotedFk}`;

        // Join the subquery
        // Note: We don't use the standard joinCondition logic because we are joining on the result of aggregation
        // The standard joinCondition uses `quotedAlias.fk`. Here `quotedAlias` IS the subquery result.
        // So `quotedAlias.fk` is valid.

        // Override joinCondition to ensure it matches the subquery structure
        joinCondition = `${parentAlias}.id = ${quotedAlias}.${quotedFk}`;

        joins.push(`LEFT JOIN (${subQuery}) AS ${quotedAlias} ON ${joinCondition}`);

        // Add aggregated fields to main select
        for (const aggAlias of Object.keys(inc.query.aggregate)) {
          selectParts.push(
            `${quotedAlias}.${this.dialect.quoteIdentifier(aggAlias)} AS "${alias}__${aggAlias}"`,
          );
        }

        // Do NOT recurse or add standard fields if aggregating
        continue;
      }

      // Handle Limit in Include (Pagination) - Requires Window Functions
      if ((inc.query.limit || inc.query.skip) && relation.type === 'hasMany') {
        const fk = relation.foreignKey || `${parentTable}_id`;
        const quotedFk = this.dialect.quoteIdentifier(fk);

        let orderBy = 'id'; // Default sort for pagination

        if (inc.query.sort) {
          const s = Array.isArray(inc.query.sort) ? inc.query.sort[0] : inc.query.sort;
          if (s.startsWith('-')) {
            orderBy = `${this.dialect.quoteIdentifier(s.substring(1))} DESC`;
          } else {
            orderBy = `${this.dialect.quoteIdentifier(s)} ASC`;
          }
        }

        const subQuery = `(SELECT *, ROW_NUMBER() OVER (PARTITION BY ${quotedFk} ORDER BY ${orderBy}) as rn FROM ${quotedTargetTable})`;

        // Calculate Offset
        let offset = inc.query.skip || 0;

        // Add limit/offset condition
        // Row Number is 1-based
        // Skip 0, Limit 5 -> rn > 0 AND rn <= 5 (1,2,3,4,5)
        // Skip 5, Limit 5 -> rn > 5 AND rn <= 10 (6,7,8,9,10)

        joinCondition += ` AND ${quotedAlias}.rn > ${offset}`;

        if (inc.query.limit) {
          joinCondition += ` AND ${quotedAlias}.rn <= ${offset + inc.query.limit}`;
        }

        joins.push(`LEFT JOIN ${subQuery} AS ${quotedAlias} ON ${joinCondition}`);
      } else {
        joins.push(`LEFT JOIN ${quotedTargetTable} AS ${quotedAlias} ON ${joinCondition}`);
      }

      // Add fields from included table
      if (inc.query.fields && inc.query.fields.length > 0) {
        for (const field of inc.query.fields) {
          selectParts.push(
            `${quotedAlias}.${this.dialect.quoteIdentifier(field)} AS "${alias}__${field}"`,
          );
        }
      } else {
        const targetSchema = schema[targetTable];
        if (targetSchema && targetSchema.fields) {
          for (const field of Object.keys(targetSchema.fields)) {
            selectParts.push(
              `${quotedAlias}.${this.dialect.quoteIdentifier(field)} AS "${alias}__${field}"`,
            );
          }
        } else {
          selectParts.push(`${quotedAlias}.*`);
        }
      }

      // Recurse
      if (inc.query.include) {
        this.processIncludes(
          inc.query,
          targetTable,
          quotedAlias,
          schema,
          selectParts,
          joins,
          alias,
          parameters,
        );
      }
    }
  }

  private parseWhere(where: JSONQLWhere, parameters: any[], quotedTableName?: string): string[] {
    const conditions: string[] = [];
    const prefix = quotedTableName ? `${quotedTableName}.` : '';

    for (const [key, value] of Object.entries(where)) {
      // Handle Logical Operators
      if (key === 'or' || key === 'OR') {
        if (Array.isArray(value)) {
          const orConditions: string[] = [];
          for (const subWhere of value) {
            const subConds = this.parseWhere(subWhere, parameters, quotedTableName);
            if (subConds.length > 0) {
              orConditions.push(`(${subConds.join(' AND ')})`);
            }
          }
          if (orConditions.length > 0) {
            conditions.push(`(${orConditions.join(' OR ')})`);
          }
        }
        continue;
      }

      if (key === 'and' || key === 'AND') {
        if (Array.isArray(value)) {
          for (const subWhere of value) {
            const subConds = this.parseWhere(subWhere, parameters, quotedTableName);
            if (subConds.length > 0) {
              conditions.push(`(${subConds.join(' AND ')})`);
            }
          }
        }
        continue;
      }

      if (key === 'not' || key === 'NOT') {
        const subConds = this.parseWhere(value as JSONQLWhere, parameters, quotedTableName);
        if (subConds.length > 0) {
          conditions.push(`NOT (${subConds.join(' AND ')})`);
        }
        continue;
      }

      if (!this.isValidIdentifier(key)) {
        throw new Error(`Invalid field name in where: ${key}`);
      }

      const quotedField = `${prefix}${this.dialect.quoteIdentifier(key)}`;
      const condition = value;

      if (condition && typeof condition === 'object' && !Array.isArray(condition)) {
        // Handle operators
        if ('eq' in condition) {
          if (condition.eq === null) {
            conditions.push(`${quotedField} IS NULL`);
          } else {
            conditions.push(`${quotedField} = ${this.dialect.getPlaceholder(parameters.length)}`);
            parameters.push(condition.eq);
          }
        }
        if ('ne' in condition || 'neq' in condition) {
          const val = condition.ne !== undefined ? condition.ne : (condition as any).neq;
          if (val === null) {
            conditions.push(`${quotedField} IS NOT NULL`);
          } else {
            conditions.push(`${quotedField} != ${this.dialect.getPlaceholder(parameters.length)}`);
            parameters.push(val);
          }
        }
        if ('gt' in condition) {
          conditions.push(`${quotedField} > ${this.dialect.getPlaceholder(parameters.length)}`);
          parameters.push(condition.gt);
        }
        if ('gte' in condition) {
          conditions.push(`${quotedField} >= ${this.dialect.getPlaceholder(parameters.length)}`);
          parameters.push(condition.gte);
        }
        if ('lt' in condition) {
          conditions.push(`${quotedField} < ${this.dialect.getPlaceholder(parameters.length)}`);
          parameters.push(condition.lt);
        }
        if ('lte' in condition) {
          conditions.push(`${quotedField} <= ${this.dialect.getPlaceholder(parameters.length)}`);
          parameters.push(condition.lte);
        }
        if ('in' in condition && Array.isArray(condition.in)) {
          if (condition.in.length === 0) {
            conditions.push('1=0');
          } else {
            const placeholdersArr: string[] = [];
            for (const v of condition.in) {
              placeholdersArr.push(this.dialect.getPlaceholder(parameters.length));
              parameters.push(v);
            }
            conditions.push(`${quotedField} IN (${placeholdersArr.join(', ')})`);
          }
        }
      } else {
        // Implicit eq
        if (condition === null) {
          conditions.push(`${quotedField} IS NULL`);
        } else {
          conditions.push(`${quotedField} = ${this.dialect.getPlaceholder(parameters.length)}`);
          parameters.push(condition);
        }
      }
    }

    return conditions;
  }

  private isValidIdentifier(id: string): boolean {
    return /^[a-zA-Z0-9_]+$/.test(id);
  }
}
