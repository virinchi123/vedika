const encode = (value: string) => encodeURIComponent(value);

const parseNumber = (value: string | undefined, fallback: number): number => {
  if (!value) {
    return fallback;
  }

  const parsedValue = Number(value);

  return Number.isFinite(parsedValue) ? parsedValue : fallback;
};

const nodeEnv = process.env.NODE_ENV ?? "development";
const isTestEnvironment = nodeEnv === "test";

const defaultDatabase = {
  host: "localhost",
  port: 5432,
  user: "admin",
  password: "password",
  database: "vedika",
  schema: "public",
} as const;

const resolveDatabaseConnectionUrl = (): string => {
  if (isTestEnvironment) {
    if (process.env.TEST_DATABASE_URL) {
      return process.env.TEST_DATABASE_URL;
    }

    const host = process.env.TEST_DATABASE_HOST ?? process.env.DATABASE_HOST ?? defaultDatabase.host;
    const port = parseNumber(process.env.TEST_DATABASE_PORT ?? process.env.DATABASE_PORT, defaultDatabase.port);
    const user = process.env.TEST_DATABASE_USER ?? process.env.DATABASE_USER ?? defaultDatabase.user;
    const password = process.env.TEST_DATABASE_PASSWORD ?? process.env.DATABASE_PASSWORD ?? defaultDatabase.password;
    const database = process.env.TEST_DATABASE_NAME ?? "vedika_test";
    const schema = process.env.TEST_DATABASE_SCHEMA ?? process.env.DATABASE_SCHEMA ?? defaultDatabase.schema;

    return `postgresql://${encode(user)}:${encode(password)}@${host}:${port}/${encode(database)}?schema=${encode(schema)}`;
  }

  if (process.env.DATABASE_URL) {
    return process.env.DATABASE_URL;
  }

  const host = process.env.DATABASE_HOST ?? defaultDatabase.host;
  const port = parseNumber(process.env.DATABASE_PORT, defaultDatabase.port);
  const user = process.env.DATABASE_USER ?? defaultDatabase.user;
  const password = process.env.DATABASE_PASSWORD ?? defaultDatabase.password;
  const database = process.env.DATABASE_NAME ?? defaultDatabase.database;
  const schema = process.env.DATABASE_SCHEMA ?? defaultDatabase.schema;

  return `postgresql://${encode(user)}:${encode(password)}@${host}:${port}/${encode(database)}?schema=${encode(schema)}`;
};

const databaseConnectionUrl = resolveDatabaseConnectionUrl();
const parsedDatabaseUrl = new URL(databaseConnectionUrl);

export const runtimeConfig = {
  nodeEnv,
  app: {
    port: parseNumber(process.env.PORT, 3000),
  },
  database: {
    host: parsedDatabaseUrl.hostname,
    port: parseNumber(parsedDatabaseUrl.port, 5432),
    user: decodeURIComponent(parsedDatabaseUrl.username),
    password: decodeURIComponent(parsedDatabaseUrl.password),
    database: decodeURIComponent(parsedDatabaseUrl.pathname.replace(/^\//, "")),
    schema: parsedDatabaseUrl.searchParams.get("schema") ?? "public",
    connectionUrl: databaseConnectionUrl,
  },
  auth: {
    jwtSecret: process.env.JWT_SECRET ?? "change-this-secret",
    accessTokenTtlMinutes: parseNumber(process.env.ACCESS_TOKEN_TTL_MINUTES, 15),
    refreshTokenTtlDays: parseNumber(process.env.REFRESH_TOKEN_TTL_DAYS, 30),
    rateLimitWindowMs: parseNumber(process.env.AUTH_RATE_LIMIT_WINDOW_MS, 60_000),
    rateLimitMaxRequests: parseNumber(process.env.AUTH_RATE_LIMIT_MAX_REQUESTS, 10),
  },
} as const;
