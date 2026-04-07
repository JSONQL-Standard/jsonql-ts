# jsonql-ts

The official Node.js/TypeScript SDK for **JSONQL**.

[![CI](https://github.com/JSONQL-Standard/jsonql-ts/actions/workflows/ci.yml/badge.svg)](https://github.com/JSONQL-Standard/jsonql-ts/actions/workflows/ci.yml)
[![npm version](https://img.shields.io/npm/v/@jsonql-standard/jsonql-ts.svg)](https://www.npmjs.com/package/@jsonql-standard/jsonql-ts)
[![Node.js](https://img.shields.io/badge/node-%3E%3D18-brightgreen)](https://nodejs.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

| | |
|---|---|
| **Package** | `@jsonql-standard/jsonql-ts` |
| **Import** | `import { ... } from '@jsonql-standard/jsonql-ts'` |
| **Version** | 1.0.1 |
| **Node** | ≥ 18 |
| **Docs** | [jsonql.org/sdk/typescript](https://jsonql.org/sdk/typescript/) |

**JSONQL** is a secure, lightweight, and polyglot JSON-based query language for filtering, sorting, pagination, field selection, and mutations in RESTful APIs.

## Features

- **JSONQL v1.0 Parser** — parse and validate incoming JSON queries and mutations
- **Query Builder** — fluent, type-safe API with `JSONQLQueryBuilder`
- **Mutation Builder** — fluent API for create / update / delete with `JSONQLMutationBuilder`
- **SQL Transpiler** — convert parsed queries → parameterized SQL (PostgreSQL, MySQL, SQLite, MSSQL)
- **MongoDB Transpiler** — convert parsed queries → MongoDB aggregation pipelines
- **Schema Validation** — permission checking and field-level validation
- **Result Hydrator** — flatten SQL JOIN rows into nested JSON trees
- **Driver Factory** — `createDriver()` with auto-config for Postgres, MySQL, SQLite, MSSQL
- **JSONQL Core** — combined parser + validator + builder in a single class
- **Condition Helpers** — `eq`, `gt`, `contains`, `and`, `or`, `not`, etc.
- **Express Adapter** — middleware with parse-only or full-lifecycle execution
- **Fastify Adapter** — plugin with parse-only or full-lifecycle execution
- **NestJS Adapter** — module with decorator support and exception filter
- **Provenance** — npm package published with [build provenance](https://docs.npmjs.com/generating-provenance-statements)

## Installation

```bash
npm install @jsonql-standard/jsonql-ts
```

Database drivers are optional peer dependencies — install only what you need:

```bash
# PostgreSQL
npm install pg

# MySQL
npm install mysql2

# SQLite
npm install sqlite3

# MSSQL
npm install mssql
```

Framework adapters are also optional — install the framework you use:

```bash
# Express
npm install express

# Fastify
npm install fastify

# NestJS
npm install @nestjs/common @nestjs/core reflect-metadata rxjs
```

## Quick Start

A working JSONQL API in under 30 lines:

```typescript
// app.ts
import express from 'express';
import { jsonqlExpress, createDriver } from '@jsonql-standard/jsonql-ts';

async function main() {
  const app = express();
  const driver = await createDriver('postgres'); // reads DB_DSN from env

  app.use('/api', jsonqlExpress({
    driver,
    schema: {
      tables: {
        users: {
          columns: {
            id:    { type: 'integer', filterable: true },
            name:  { type: 'text',    filterable: true, sortable: true },
            email: { type: 'text',    filterable: true },
            age:   { type: 'integer', filterable: true, sortable: true },
          },
        },
      },
    },
    tables: ['users'],
  }));

  app.listen(3000, () => console.log('JSONQL API → http://localhost:3000'));
}

main();
```

```bash
export DB_DSN="postgresql://user:pass@localhost:5432/mydb"
npx ts-node app.ts
# JSONQL API → http://localhost:3000
```

```bash
curl -s 'http://localhost:3000/api/users?q={"fields":["id","name"],"where":{"age":{"gt":18}},"sort":{"name":"asc"},"limit":10}'
```

```json
[
  { "id": 1, "name": "Alice" },
  { "id": 2, "name": "Bob" }
]
```

## Builders

### Query Builder

```typescript
import { JSONQLQueryBuilder, field, eq, gt, and } from '@jsonql-standard/jsonql-ts';

const query = new JSONQLQueryBuilder()
  .select('id', 'name', 'email')
  .where(and(
    field('status', eq('active')),
    field('age', gt(18)),
  ))
  .orderBy('name', 'asc')
  .limit(10)
  .build();
```

### Mutation Builder

```typescript
import { JSONQLMutationBuilder } from '@jsonql-standard/jsonql-ts';

// Create
const insert = new JSONQLMutationBuilder()
  .into('users')
  .insert({ email: 'alice@example.com', name: 'Alice' })
  .returning('id', 'email')
  .build();

// Update
const update = new JSONQLMutationBuilder()
  .into('users')
  .update({ name: 'Alice Smith' })
  .where({ id: { eq: 1 } })
  .build();

// Delete
const del = new JSONQLMutationBuilder()
  .into('users')
  .delete()
  .where({ id: { eq: 1 } })
  .build();
```

## Transpilers

### SQL Transpiler

```typescript
import { SQLTranspiler } from '@jsonql-standard/jsonql-ts';

const transpiler = new SQLTranspiler('postgres');
const { sql, parameters } = transpiler.transpile(query, 'users');
// SELECT "id", "name", "email" FROM "users" WHERE "status" = $1 AND "age" > $2 ...
```

### MongoDB Transpiler

```typescript
import { MongoTranspiler } from '@jsonql-standard/jsonql-ts';

const transpiler = new MongoTranspiler();
const result = transpiler.transpile(query, 'users');
// { collection: 'users', operation: 'find', filter: { status: 'active', age: { $gt: 18 } }, ... }
```

## Schema Validation

```typescript
import { JSONQLValidator } from '@jsonql-standard/jsonql-ts';

const schema = {
  tables: {
    users: {
      columns: {
        id: { type: 'integer', filterable: true },
        name: { type: 'text', filterable: true, sortable: true },
        email: { type: 'text', filterable: true },
        password: { type: 'text', filterable: false }, // blocked
      },
    },
  },
};

const validator = new JSONQLValidator(schema, 'users');
const result = validator.validate(query);
// { valid: true } or { valid: false, errors: [...] }
```

## Result Hydrator

```typescript
import { ResultHydrator } from '@jsonql-standard/jsonql-ts';

const hydrator = new ResultHydrator();

// Flatten SQL JOIN rows into nested JSON
const rows = [
  { id: 1, name: 'Alice', posts__id: 10, posts__title: 'Hello' },
  { id: 1, name: 'Alice', posts__id: 11, posts__title: 'World' },
];

const result = hydrator.hydrate(rows, schema, 'users');
// [{ id: 1, name: 'Alice', posts: [{ id: 10, title: 'Hello' }, { id: 11, title: 'World' }] }]
```

## Framework Adapters

### Express

See [Quick Start](#quick-start) for the full lifecycle example. Parse-only mode:

```typescript
import express from 'express';
import { jsonqlExpress } from '@jsonql-standard/jsonql-ts';

const app = express();
app.use('/api', jsonqlExpress()); // attaches req.jsonql

app.get('/api/users', (req, res) => {
  const query = req.jsonql; // Typed JSONQLQuery
  // ... handle manually
});
```

### Fastify

```typescript
import Fastify from 'fastify';
import { jsonqlFastify, createDriver } from '@jsonql-standard/jsonql-ts';

async function main() {
  const fastify = Fastify();
  const driver = await createDriver('postgres');

  await fastify.register(jsonqlFastify, { driver });
  await fastify.listen({ port: 3000 });
}

main();
```

### NestJS

```typescript
import { Module } from '@nestjs/common';
import { JsonqlModule, createDriver } from '@jsonql-standard/jsonql-ts';

// In your bootstrap function:
const driver = await createDriver('postgres');

@Module({
  imports: [
    JsonqlModule.forRoot({ driver }),
  ],
})
export class AppModule {}
```

## Core API

| Export | Purpose |
|--------|---------|
| `JSONQLParser` | Parse & validate incoming JSON |
| `SQLTranspiler` | Convert parsed query → parameterized SQL |
| `MongoTranspiler` | Convert parsed query → MongoDB pipeline |
| `JSONQLValidator` | Schema-based permission checking |
| `JSONQLQueryBuilder` | Fluent query construction |
| `JSONQLMutationBuilder` | Fluent mutation construction |
| `ResultHydrator` | Flatten SQL joins → nested JSON |
| `JSONQL` | Combined parser + validator + builder |
| `createDriver` | Factory for database drivers |
| `DatabaseDriver` | Abstract database driver interface |
| `jsonqlExpress` | Express middleware factory |
| `jsonqlFastify` | Fastify plugin |
| `JsonqlModule` | NestJS module |

## Supported Dialects

| Dialect    | Placeholder | Quoting      | RETURNING |
|------------|-------------|--------------|-----------|
| `postgres` | `$1, $2`    | `"col"`      | ✅        |
| `mysql`    | `?, ?`      | `` `col` ``  | ❌        |
| `sqlite`   | `?, ?`      | `"col"`      | ❌        |
| `mssql`    | `@p1, @p2`  | `[col]`      | ❌        |

## Condition Helpers

```typescript
import {
  eq, ne, gt, gte, lt, lte,
  inArray, nin, contains, starts, ends,
  field, and, or, not, fieldRef,
} from '@jsonql-standard/jsonql-ts';
```

## Error Hierarchy

```
JsonQLError
├── JsonQLValidationError   (code: VALIDATION_ERROR)
├── JsonQLTranspileError    (code: TRANSPILE_ERROR)
└── JsonQLExecutionError    (code: EXECUTION_ERROR)
```

## Compliance

All 6 TypeScript integration adapters pass the full compliance test suite:

| Adapter | Type | PostgreSQL |
|---------|------|:----------:|
| **Express** | simple | ✅ |
| **Express** | lifecycle | ✅ |
| **Fastify** | simple | ✅ |
| **Fastify** | lifecycle | ✅ |
| **NestJS** | simple | ✅ |
| **NestJS** | lifecycle | ✅ |

Tests run via [jsonql-tests](https://github.com/JSONQL-Standard/jsonql-tests).

## Development

```bash
npm install
npm test              # 25 suites, 195 tests
npm run build         # TypeScript → dist/
npx prettier --check "src/**/*.ts" "tests/**/*.ts"
```

## Examples

Check out the `examples/` directory for complete reference implementations:

- [Express Server](examples/express-server)
- [Fastify Server](examples/fastify-server)
- [NestJS Server](examples/nestjs-server)

## Links

- 📖 [Documentation](https://jsonql.org/sdk/typescript/)
- 📋 [JSONQL Spec](https://github.com/JSONQL-Standard/jsonql-spec)
- 🧪 [Compliance Tests](https://github.com/JSONQL-Standard/jsonql-tests)
- 🐛 [Issues](https://github.com/JSONQL-Standard/jsonql-ts/issues)

## License

MIT
