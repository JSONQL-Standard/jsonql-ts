# JSONQL Express Reference Server

This is a reference implementation of a JSONQL server using Express and the `@jsonql-standard/jsonql-ts` SDK.
It demonstrates how to integrate the JSONQL middleware into an existing Express application.

## Prerequisites

- Node.js (v18+)
- `jsonql-ts` SDK built locally (since this example links to it)

## Setup

1. Build the SDK first:
   ```bash
   cd ../..
   npm install
   npm run build
   ```

2. Install dependencies for this example:
   ```bash
   cd examples/express-server
   npm install
   ```

## Running the Server

```bash
npm start
```

The server will start on `http://localhost:3000`.

## Running Ecosystem Tests

You can run the standard ecosystem tests against this server using the Python runner in `jsonql-spec`:

```bash
# From the workspace root
python3 jsonql-spec/run_ecosystem_tests.py --target http://localhost:3000
```
