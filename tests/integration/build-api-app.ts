import Fastify from "fastify";
import { errorHandlerPlugin } from "../../apps/api/dist/plugins/error-handler.js";
import { corsPlugin } from "../../apps/api/dist/plugins/cors.js";
import { pollRoutes } from "../../apps/api/dist/routes/polls.js";
import { authRoutes } from "../../apps/api/dist/routes/auth.js";
import { voteRoutes } from "../../apps/api/dist/routes/votes.js";
import { resultsRoutes } from "../../apps/api/dist/routes/results.js";
import { adminRoutes } from "../../apps/api/dist/routes/admin.js";

/** API Fastify pour tests d'intégration (sans écoute réseau). */
export async function buildApiApp() {
  const app = Fastify({ logger: false });
  await app.register(errorHandlerPlugin);
  await app.register(corsPlugin);
  await app.register(pollRoutes);
  await app.register(authRoutes);
  await app.register(voteRoutes);
  await app.register(resultsRoutes);
  await app.register(adminRoutes);
  return app;
}
