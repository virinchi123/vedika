import { PrismaClient } from "@prisma/client";

import { databaseConfig } from "../config/database.js";

declare global {
  // Reuse the Prisma client in dev watch mode to avoid exhausting connections.
  var __prisma__: PrismaClient | undefined;
}

export const prisma =
  globalThis.__prisma__ ??
  new PrismaClient({
    datasources: {
      db: {
        url: databaseConfig.connectionUrl,
      },
    },
    log: process.env.NODE_ENV === "development" ? ["query", "warn", "error"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalThis.__prisma__ = prisma;
}
