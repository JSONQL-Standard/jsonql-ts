# JSONQL NestJS Reference Server

This is a reference implementation of a JSONQL server using NestJS and the `@jsonql-standard/jsonql-ts` SDK.

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
   cd examples/nestjs-server
   npm install
   ```

## Running the Server

```bash
npm start
```

The server will start on `http://localhost:3000`.

## Running Ecosystem Tests

You can run the standard ecosystem tests against this server using the
`jsonql-tests` integration suite:

```bash
# From the workspace root
cd jsonql-tests && python3 -m pytest tests/test_compliance.py \
  --target http://localhost:3000 --db-type sqlite --test-path tests/unified
```
