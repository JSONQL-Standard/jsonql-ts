# JSONQL Fastify Reference Server

This is a reference implementation of a JSONQL server using Fastify and the `@jsonql-standard/jsonql-ts` SDK.

## Prerequisites

- Node.js (v18+)
- `jsonql-ts` SDK built locally

## Setup

1. Build the SDK first:
   ```bash
   cd ../..
   npm install
   npm run build
   ```

2. Install dependencies for this example:
   ```bash
   cd examples/fastify-server
   npm install
   ```

## Running the Server

```bash
npm start
```

The server will start on `http://localhost:3000`.

## Running Ecosystem Tests

```bash
# From the workspace root
python3 jsonql-spec/run_ecosystem_tests.py --target http://localhost:3000 --suite-dir jsonql-spec/tests/suites/standard
```
