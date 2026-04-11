# Vedika Express API

`Express + TypeScript + Prisma + PostgreSQL` backend with mobile-oriented token auth.

## Prerequisites

- Node.js 22 LTS or newer
- Corepack enabled (`corepack enable`)
- PostgreSQL running on `localhost:4444`
- the repo is ESM (`"type": "module"`) and Prisma client code is generated into `src/generated/prisma`

## Setup

1. Enable Corepack so the repo can use the pinned Yarn version:

   ```bash
   corepack enable
   ```

2. Install dependencies:

   ```bash
   yarn install
   ```

3. Copy the runtime config template and adjust values for your machine:

   ```bash
   cp src/config/runtime.example.ts src/config/runtime.ts
   ```

4. Apply the committed Prisma migrations to your local database:

   ```bash
   yarn prisma:migrate:deploy
   ```

5. Generate the Prisma 7 client into `src/generated/prisma`:

   ```bash
   yarn prisma:generate
   ```

## Development

Start the API in watch mode:

```bash
yarn dev
```

Build and run the compiled output:

```bash
yarn build
yarn start
```

Health check:

```bash
curl http://localhost:3000/health
```

Run the integration test suite:

```bash
createdb -p 4444 -U vedika vedika_test
NODE_ENV=test TEST_DATABASE_NAME=vedika_test yarn prisma:migrate:deploy
yarn test
```

Run type checking:

```bash
yarn typecheck
```

## Auth API

The API uses short-lived bearer access tokens and opaque rotating refresh tokens.

- `POST /auth/register` with `{ emailAddress, password, deviceName? }`
- `POST /auth/login` with `{ emailAddress, password, deviceName? }`
- `POST /auth/refresh` with `{ refreshToken, deviceName? }`
- `POST /auth/logout` with `{ refreshToken }`
- `GET /auth/me` with `Authorization: Bearer <accessToken>`

For React Native:

- keep the access token in memory
- keep the refresh token in secure storage only
- call `/auth/refresh` on app boot when a refresh token exists
- retry one failed protected request after a successful refresh

## Prisma workflow

The repository includes `User` and `Session` models plus the committed auth migrations. Add new models or fields in `prisma/schema.prisma`, then create a new migration for your changes.

Runtime configuration lives in your local [`src/config/runtime.ts`](/Users/raokrishnavirinchi/dev/vedika/src/config/runtime.ts:1), which should be created from [`src/config/runtime.example.ts`](/Users/raokrishnavirinchi/dev/vedika/src/config/runtime.example.ts:1). It reads from environment variables first and otherwise defaults to:

- host `localhost`
- port `4444`
- database `vedika`
- schema `public`

When `NODE_ENV=test`, the app intentionally switches to a separate test database by default:

- database `vedika_test`
- override with `TEST_DATABASE_URL` or `TEST_DATABASE_*`
- the integration test suite refuses to run destructive cleanup unless the connected database or schema name contains `test`

`User.passwordHash` stores a versioned scrypt hash. Do not store plaintext passwords in the database.

Prisma CLI reads the same connection settings through [`prisma.config.ts`](/Users/raokrishnavirinchi/dev/vedika/prisma.config.ts:1), while runtime queries use the generated Prisma client in `src/generated/prisma` plus the PostgreSQL adapter.

Create a development migration after schema changes:

```bash
yarn prisma:migrate:dev --name init
```

Regenerate the Prisma client after schema changes and before running `yarn dev`, `yarn typecheck`, `yarn build`, or `yarn test`:

```bash
yarn prisma:generate
```

Apply committed migrations in deployment environments:

```bash
yarn prisma:migrate:deploy
```
