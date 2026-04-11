import { PrismaPg } from "@prisma/adapter-pg";

import { PrismaClient } from "../generated/prisma/client.js";

import { appConfig } from "../config/app.js";
import { databaseConfig } from "../config/database.js";

declare global {
  // Reuse the Prisma client in dev watch mode to avoid exhausting connections.
  var __prisma__: PrismaClient | undefined;
}

export const prisma =
  globalThis.__prisma__ ??
  new PrismaClient({
    adapter: new PrismaPg({
      connectionString: databaseConfig.connectionUrl,
    }),
    log: appConfig.nodeEnv === "development" ? ["query", "warn", "error"] : ["error"],
  });

if (appConfig.nodeEnv !== "production") {
  globalThis.__prisma__ = prisma;
}
