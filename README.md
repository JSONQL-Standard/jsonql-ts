# jsonql-ts

The official Node.js/TypeScript SDK for **JSONQL**.

[![npm version](https://img.shields.io/npm/v/@jsonql-standard/jsonql-ts.svg)](https://www.npmjs.com/package/@jsonql-standard/jsonql-ts)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

**JSONQL** is a secure, lightweight, and polyglot JSON-based query language for filtering, sorting, pagination, and field selection in RESTful APIs.

This SDK provides:
1.  **Core**: Parser, Validator, and Builder for JSONQL v1.0.
2.  **Runtime**: SQL Transpiler and Result Hydrator.
3.  **Adapters**: Middleware for Express, Fastify, and NestJS.

## Installation

```bash
npm install @jsonql-standard/jsonql-ts
```

## Usage

### 1. Core Parser

```typescript
import { JSONQLParser } from '@jsonql-standard/jsonql-ts';

const parser = new JSONQLParser();
const query = parser.parse({
  version: '1.0',
  fields: ['id', 'name'],
  where: { status: { eq: 'active' } }
});
```

### 2. Framework Adapters

#### Express

```typescript
import express from 'express';
import { jsonqlExpress } from '@jsonql-standard/jsonql-ts';

const app = express();

// Middleware parses ?q=... or body
app.use('/api', jsonqlExpress());

app.get('/api/users', (req, res) => {
  const query = req.jsonql; // Typed JSONQLQuery
  // ... execute query
});
```

#### Fastify

```typescript
import Fastify from 'fastify';
import { jsonqlFastify } from '@jsonql-standard/jsonql-ts';

const fastify = Fastify();

fastify.register(jsonqlFastify);

fastify.get('/users', (req, reply) => {
  const query = req.jsonql;
  // ...
});
```

#### NestJS

```typescript
import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { JsonqlMiddleware } from '@jsonql-standard/jsonql-ts';

@Module({ ... })
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer
      .apply(JsonqlMiddleware)
      .forRoutes('*');
  }
}
```

### 3. SQL Transpilation & Execution

```typescript
import { SQLTranspiler, ResultHydrator } from '@jsonql-standard/jsonql-ts';
import { Client } from 'pg';

const transpiler = new SQLTranspiler('postgres');
const hydrator = new ResultHydrator();
const client = new Client();

async function getUsers(jsonqlQuery) {
  // 1. Transpile to SQL
  const { sql, parameters } = transpiler.transpile(jsonqlQuery, 'users');
  
  // 2. Execute
  const result = await client.query(sql, parameters);
  
  // 3. Hydrate (nest joins)
  return hydrator.hydrate(result.rows);
}
```

### 4. Mutations (POC)

```typescript
import { SQLTranspiler } from '@jsonql-standard/jsonql-ts';

const transpiler = new SQLTranspiler('postgres');

const createUser = {
  from: 'users',
  data: { email: 'a@b.com', name: 'Alice' },
  fields: ['id', 'email'],
};

const { sql, parameters } = transpiler.transpile(createUser, 'users');
// INSERT INTO "users" ("email", "name") VALUES ($1, $2) RETURNING "id", "email"
```

## Examples

Check out the `examples/` directory for complete reference implementations:

- [Express Server](examples/express-server)
- [Fastify Server](examples/fastify-server)
- [NestJS Server](examples/nestjs-server)

## License

MIT
