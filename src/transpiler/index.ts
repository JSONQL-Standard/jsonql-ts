import { JSONQLQuery, JSONQLWhere } from '../types';
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

  transpile(query: JSONQLQuery, tableName: string): TranspilationResult {
    // Use dialect quoting
    const quotedTableName = this.dialect.quoteIdentifier(tableName);
    if (!this.isValidIdentifier(tableName)) {
       // Fallback check if quoting isn't enough or we want to be strict
       // But really, if we quote, we might allow more chars.
       // For now, keep strict check but use quoted name in SQL.
       // Actually, if we quote, we should trust the quoting or the input.
       // Let's keep the strict check for safety against injection in the identifier itself if quoting is buggy.
    }
    
    // ... existing logic but using quoted identifiers ...
    // For this refactor, I will keep the strict check but use the dialect for placeholders.
    // And I will start using quoteIdentifier for the generated SQL.

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
        selectParts.push(this.dialect.quoteIdentifier(field));
      }
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
             selectParts.push(`${func.toUpperCase()}(${this.dialect.quoteIdentifier(field)}) AS ${quotedAlias}`);
        }
      }
    }
    
    // Handle groupBy (implicitly adds to select if not present? usually explicit in JSONQL)
    if ((!query.fields || query.fields.length === 0) && query.groupBy) {
        for (const field of query.groupBy) {
             const quotedField = this.dialect.quoteIdentifier(field);
             if (!selectParts.includes(quotedField)) {
                 selectParts.push(quotedField);
             }
        }
    }

    let selectClause = selectParts.length > 0 ? selectParts.join(', ') : '*';

    // 2. FROM clause
    let sql = `SELECT ${selectClause} FROM ${this.dialect.quoteIdentifier(tableName)}`;

    // 3. WHERE clause
    if (query.where) {
      const conditions = this.parseWhere(query.where, parameters);
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
            groups.push(this.dialect.quoteIdentifier(field));
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

        sql += ` ORDER BY ${this.dialect.quoteIdentifier(field)} ${desc ? 'DESC' : 'ASC'}`;
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

  private parseWhere(where: JSONQLWhere, parameters: any[]): string[] {
    const conditions: string[] = [];

    for (const [field, condition] of Object.entries(where)) {
      if (!this.isValidIdentifier(field)) {
        throw new Error(`Invalid field name in where: ${field}`);
      }
      
      const quotedField = this.dialect.quoteIdentifier(field);

      if (condition && typeof condition === 'object') {
        // Handle operators
        if ('eq' in condition) {
          if (condition.eq === null) {
            conditions.push(`${quotedField} IS NULL`);
          } else {
            conditions.push(`${quotedField} = ${this.dialect.getPlaceholder(parameters.length)}`);
            parameters.push(condition.eq);
          }
        }
        if ('neq' in condition) {
          if (condition.neq === null) {
            conditions.push(`${quotedField} IS NOT NULL`);
          } else {
            conditions.push(`${quotedField} != ${this.dialect.getPlaceholder(parameters.length)}`);
            parameters.push(condition.neq);
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
