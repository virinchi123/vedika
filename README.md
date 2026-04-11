# Vedika Express API

Basic `Express + TypeScript + Prisma + PostgreSQL` scaffold using `yarn`.

## Prerequisites

- Node.js 22 LTS or newer
- Corepack enabled (`corepack enable`)
- PostgreSQL running on `localhost:4444`

## Setup

1. Enable Corepack so the repo can use the pinned Yarn version:

   ```bash
   corepack enable
   ```

2. Install dependencies:

   ```bash
   yarn install
   ```

3. Review the project config and update database credentials if needed:

   ```bash
   sed -n '1,200p' src/config/database.ts
   ```

4. Generate the Prisma client:

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

## Prisma workflow

The initial Prisma schema only defines the PostgreSQL datasource and client generator. Add your models to `prisma/schema.prisma` before creating migrations.

Database connection settings live in code, not environment variables:

- App port: `src/config/app.ts`
- Postgres connection: `src/config/database.ts`

By default the project connects to:

- host `localhost`
- port `4444`
- database `vedika`
- schema `public`

Update the username/password in `src/config/database.ts` to match your local Postgres setup before running migrations.

The `User.password` field stores a password hash. Do not store plaintext passwords in the database.

Create a development migration after models are added:

```bash
yarn prisma:migrate:dev --name init
```

Apply committed migrations in deployment environments:

```bash
yarn prisma:migrate:deploy
```
