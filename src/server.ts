import { app } from "./app.js";
import { appConfig } from "./config/app.js";
import { prisma } from "./lib/prisma.js";

const server = app.listen(appConfig.port, () => {
  console.log(`Server listening on port ${appConfig.port}`);
});

const shutdown = async (signal: string) => {
  console.log(`Received ${signal}. Shutting down gracefully.`);
  server.close(async () => {
    await prisma.$disconnect();
    process.exit(0);
  });
};

process.on("SIGINT", () => {
  void shutdown("SIGINT");
});

process.on("SIGTERM", () => {
  void shutdown("SIGTERM");
});
