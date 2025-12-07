export interface SQLDialect {
  name: string;
  getPlaceholder(index: number): string;
  quoteIdentifier(identifier: string): string;
}

export class SQLiteDialect implements SQLDialect {
  name = 'sqlite';
  getPlaceholder(index: number): string {
    return '?';
  }
  quoteIdentifier(identifier: string): string {
    return `"${identifier}"`;
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
}

export class MySQLDialect implements SQLDialect {
  name = 'mysql';
  getPlaceholder(index: number): string {
    return '?';
  }
  quoteIdentifier(identifier: string): string {
    return `\`${identifier}\``;
  }
}
