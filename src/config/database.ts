import { runtimeConfig } from "./runtime.js";

export const databaseConfig = {
  host: runtimeConfig.database.host,
  port: runtimeConfig.database.port,
  user: runtimeConfig.database.user,
  password: runtimeConfig.database.password,
  database: runtimeConfig.database.database,
  schema: runtimeConfig.database.schema,
  connectionUrl: runtimeConfig.database.connectionUrl,
} as const;
