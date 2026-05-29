import Fastify from "fastify";
import cors from "@fastify/cors";
import fastifyStatic from "@fastify/static";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "./config.js";
import { pollRoutes } from "./routes/polls.js";
import { authRoutes } from "./routes/auth.js";
import { voteRoutes } from "./routes/votes.js";
import { resultsRoutes } from "./routes/results.js";
import { adminRoutes } from "./routes/admin.js";
import { closeRedis } from "./redis.js";
import { closeDb } from "@sondage/db";

const app = Fastify({ logger: true });

await app.register(cors, { origin: true });

const __dirname = dirname(fileURLToPath(import.meta.url));
await app.register(fastifyStatic, {
  root: join(__dirname, "../../../embed"),
  prefix: "/embed/",
  decorateReply: false,
});

app.get("/health", async () => ({ status: "ok", region: config.defaultDataRegion }));

await app.register(pollRoutes);
await app.register(authRoutes);
await app.register(voteRoutes);
await app.register(resultsRoutes);
await app.register(adminRoutes);

const shutdown = async () => {
  await app.close();
  await closeRedis();
  await closeDb();
  process.exit(0);
};

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

try {
  await app.listen({ port: config.port, host: config.host });
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
