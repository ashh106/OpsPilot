import { createApp } from "./app.js";
import { env } from "./config/env.js";
import { prisma } from "./db/client.js";
import { logger } from "./utils/logger.js";

const app = createApp();
const server = app.listen(env.PORT, () => {
  logger.info(`OpsPilot API listening on :${env.PORT} (${env.NODE_ENV})`);
});

async function shutdown(signal: string) {
  logger.info(`${signal} received, shutting down`);
  server.close();
  await prisma.$disconnect();
  process.exit(0);
}
process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));
