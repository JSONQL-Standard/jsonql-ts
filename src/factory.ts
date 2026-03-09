import { DatabaseDriver, JSONQLDialect } from './driver';
import { PostgresDriver, PostgresDriverOptions } from './drivers/postgres';
import { MySQLDriver } from './drivers/mysql';
import { MSSQLDriver } from './drivers/mssql';
import { SQLiteDriver } from './drivers/sqlite';

// ============================================================
// Config types for each dialect
// ============================================================

export interface PostgresConfig {
  /** Connection string. Defaults to env DB_DSN or 'postgresql://jsonql:password@localhost:5432/jsonql_test' */
  connectionString?: string;
  /** PostgresDriver options (e.g. fixNumericTypes). */
  driverOptions?: PostgresDriverOptions;
}

export interface MySQLConfig {
  host?: string;
  port?: number;
  user?: string;
  password?: string;
  database?: string;
  /** Parse DECIMAL as numbers (default: true) */
  decimalNumbers?: boolean;
  connectionLimit?: number;
}

export interface MSSQLConfig {
  server?: string;
  port?: number;
  user?: string;
  password?: string;
  database?: string;
  /** Trust self-signed certs (default: true for local dev) */
  trustServerCertificate?: boolean;
  encrypt?: boolean;
}

export interface SQLiteConfig {
  /** File path or ':memory:' (default: env DB_FILENAME or ':memory:') */
  filename?: string;
}

export type DriverConfig = PostgresConfig | MySQLConfig | MSSQLConfig | SQLiteConfig;

// ============================================================
// Factory function
// ============================================================

/**
 * Create a DatabaseDriver for the given dialect with sensible defaults.
 *
 * Automatically reads connection info from environment variables and
 * handles common gotchas (PG numeric types, MySQL decimal parsing, etc.).
 *
 * @example
 * ```ts
 * // Postgres — reads DB_DSN from env, fixes numeric types automatically
 * const driver = await createDriver('postgres');
 *
 * // MySQL with explicit config
 * const driver = await createDriver('mysql', {
 *   host: 'localhost',
 *   user: 'root',
 *   password: 'secret',
 *   database: 'myapp',
 * });
 *
 * // SQLite in-memory
 * const driver = await createDriver('sqlite');
 *
 * // Use with any adapter
 * const adapter = new ExpressAdapter({ driver });
 * ```
 */
export async function createDriver(dialect: 'postgres', config?: PostgresConfig): Promise<PostgresDriver>;
export async function createDriver(dialect: 'mysql', config?: MySQLConfig): Promise<MySQLDriver>;
export async function createDriver(dialect: 'mssql', config?: MSSQLConfig): Promise<MSSQLDriver>;
export async function createDriver(dialect: 'sqlite', config?: SQLiteConfig): Promise<SQLiteDriver>;
export async function createDriver(dialect: JSONQLDialect, config?: DriverConfig): Promise<DatabaseDriver>;
export async function createDriver(dialect: JSONQLDialect, config: DriverConfig = {}): Promise<DatabaseDriver> {
  switch (dialect) {
    case 'postgres':
      return createPostgresDriver(config as PostgresConfig);
    case 'mysql':
      return createMySQLDriver(config as MySQLConfig);
    case 'mssql':
      return createMSSQLDriver(config as MSSQLConfig);
    case 'sqlite':
      return createSQLiteDriver(config as SQLiteConfig);
    default:
      throw new Error(`Unsupported dialect: ${dialect}`);
  }
}

// ============================================================
// Per-dialect factory implementations
// ============================================================

async function createPostgresDriver(config: PostgresConfig): Promise<PostgresDriver> {
  let pg: any;
  try {
    pg = require('pg');
  } catch {
    throw new Error(
      'pg package is required for PostgreSQL. Install it with: npm install pg',
    );
  }

  const connectionString =
    config.connectionString || process.env.DB_DSN || 'postgresql://localhost:5432/jsonql';

  const pool = new pg.Pool({ connectionString });
  return new PostgresDriver(pool, config.driverOptions);
}

async function createMySQLDriver(config: MySQLConfig): Promise<MySQLDriver> {
  let mysql: any;
  try {
    mysql = require('mysql2/promise');
  } catch {
    throw new Error(
      'mysql2 package is required for MySQL. Install it with: npm install mysql2',
    );
  }

  const pool = mysql.createPool({
    host: config.host || process.env.DB_HOST || 'localhost',
    port: config.port || parseInt(process.env.DB_PORT || '3306', 10),
    user: config.user || process.env.DB_USER || 'root',
    password: config.password || process.env.DB_PASSWORD || '',
    database: config.database || process.env.DB_NAME || 'jsonql',
    decimalNumbers: config.decimalNumbers ?? true,
    waitForConnections: true,
    connectionLimit: config.connectionLimit ?? 10,
  });

  return new MySQLDriver(pool);
}

async function createMSSQLDriver(config: MSSQLConfig): Promise<MSSQLDriver> {
  let mssql: any;
  try {
    mssql = require('mssql');
  } catch {
    throw new Error(
      'mssql package is required for MSSQL. Install it with: npm install mssql',
    );
  }

  const pool = await new mssql.ConnectionPool({
    server: config.server || process.env.DB_HOST || 'localhost',
    port: config.port || parseInt(process.env.DB_PORT || '1433', 10),
    user: config.user || process.env.DB_USER || 'sa',
    password: config.password || process.env.DB_PASSWORD || '',
    database: config.database || process.env.DB_NAME || 'jsonql',
    options: {
      encrypt: config.encrypt ?? false,
      trustServerCertificate: config.trustServerCertificate ?? true,
    },
  }).connect();

  return new MSSQLDriver(pool);
}

async function createSQLiteDriver(config: SQLiteConfig): Promise<SQLiteDriver> {
  const filename = config.filename || process.env.DB_FILENAME || ':memory:';
  const driver = new SQLiteDriver(filename);
  await driver.connect();
  return driver;
}
