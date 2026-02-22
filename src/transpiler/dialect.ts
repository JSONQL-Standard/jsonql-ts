export interface SQLDialect {
  name: string;
  getPlaceholder(index: number): string;
  quoteIdentifier(identifier: string): string;
  supportsReturning(): boolean;
  getLimitOffset(limit: number, offset: number): string;
}

export class SQLiteDialect implements SQLDialect {
  name = 'sqlite';
  getPlaceholder(index: number): string {
    return '?';
  }
  quoteIdentifier(identifier: string): string {
    return `"${identifier}"`;
  }
  supportsReturning(): boolean {
    return false;
  }
  getLimitOffset(limit: number, offset: number): string {
    let clause = '';
    if (limit === 0 && offset === 0) {
      return 'LIMIT 0';
    }
    if (limit > 0) {
      clause += `LIMIT ${limit}`;
    } else if (offset > 0) {
      // SQLite requires LIMIT before OFFSET; use -1 for unlimited
      clause += 'LIMIT -1';
    }
    if (offset > 0) clause += ` OFFSET ${offset}`;
    return clause;
  }
}

export class PostgresDialect implements SQLDialect {
  name = 'postgres';
  getPlaceholder(index: number): string {
    return `$${index + 1}`;
  }
  quoteIdentifier(identifier: string): string {
    return `"${identifier}"`;
  }
  supportsReturning(): boolean {
    return true;
  }
  getLimitOffset(limit: number, offset: number): string {
    let clause = '';
    if (limit === 0 && offset === 0) return 'LIMIT 0';
    if (limit > 0) clause += `LIMIT ${limit}`;
    if (offset > 0) clause += `${clause ? ' ' : ''}OFFSET ${offset}`;
    return clause;
  }
}

export class MySQLDialect implements SQLDialect {
  name = 'mysql';
  getPlaceholder(index: number): string {
    return '?';
  }
  quoteIdentifier(identifier: string): string {
    return `\`${identifier}\``;
  }
  supportsReturning(): boolean {
    return false;
  }
  getLimitOffset(limit: number, offset: number): string {
    let clause = '';
    if (limit === 0 && offset === 0) return 'LIMIT 0';
    if (limit > 0) {
      clause += `LIMIT ${limit}`;
    } else if (offset > 0) {
      // MySQL requires LIMIT before OFFSET; use large number for unlimited
      clause += 'LIMIT 18446744073709551615';
    }
    if (offset > 0) clause += ` OFFSET ${offset}`;
    return clause;
  }
}

export class MSSQLDialect implements SQLDialect {
  name = 'mssql';
  getPlaceholder(index: number): string {
    return `@p${index + 1}`;
  }
  quoteIdentifier(identifier: string): string {
    return `[${identifier}]`;
  }
  supportsReturning(): boolean {
    return false;
  }
  getLimitOffset(limit: number, offset: number): string {
    // MSSQL uses OFFSET/FETCH syntax
    if (limit === 0 && offset === 0) {
      return 'OFFSET 0 ROWS FETCH NEXT 0 ROWS ONLY';
    }
    if (limit > 0) {
      const off = offset > 0 ? offset : 0;
      return `OFFSET ${off} ROWS FETCH NEXT ${limit} ROWS ONLY`;
    }
    if (offset > 0) {
      return `OFFSET ${offset} ROWS`;
    }
    return '';
  }
}
