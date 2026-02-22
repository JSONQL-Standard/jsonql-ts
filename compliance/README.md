# JSONQL TypeScript Compliance Server

This directory contains the reference implementation for the JSONQL Compliance Server for TypeScript.
It is designed to run inside a Docker container and support multiple web frameworks (Express, Fastify) and databases (Postgres, MySQL, SQLite).

## Architecture

The compliance server is a thin wrapper around the `jsonql-ts` library. It exposes a standard HTTP interface that the `jsonql-tests` ecosystem runner can target.

It uses `ts-node` to run the server directly from source, but the Docker image builds the parent `jsonql-ts` library to ensure it uses the latest code.

## Building the Docker Image

From the root of the `jsonql-ts` repository:

```bash
docker build -f compliance/Dockerfile -t jsonql-ts-compliance .
```

## Running the Container

The container accepts the following environment variables:

- `PORT`: The port to listen on (default: 8080)
- `JSONQL_FRAMEWORK`: The web framework to use (`express` or `fastify`)
- `DB_TYPE`: The database type (`postgres`, `mysql`, `sqlite`)
- `DB_DSN`: The connection string for the database

### Example: Running with Postgres and Fastify

```bash
docker run -d \
  -p 8080:8080 \
  -e JSONQL_FRAMEWORK=fastify \
  -e DB_TYPE=postgres \
  -e DB_DSN="postgres://user:pass@host.docker.internal:5432/dbname" \
  jsonql-ts-compliance
```

## Local Development

You can also run the server locally without Docker:

```bash
cd compliance
npm install
JSONQL_FRAMEWORK=express DB_TYPE=postgres DB_DSN=... npm start
```
