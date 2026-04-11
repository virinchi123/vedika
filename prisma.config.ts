import { defineConfig } from "prisma/config";

import { databaseConfig } from "./src/config/database.js";

export default defineConfig({
  schema: "./prisma/schema.prisma",
  datasource: {
    url: databaseConfig.connectionUrl,
  },
});
