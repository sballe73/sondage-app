import type { FastifyInstance } from "fastify";
import rateLimit from "@fastify/rate-limit";
import { config } from "../config.js";
import { AppError } from "../errors.js";

export async function rateLimitPlugin(app: FastifyInstance) {
  if (!config.rateLimitEnabled) return;

  await app.register(rateLimit, {
    global: true,
    max: config.rateLimitGlobalMax,
    timeWindow: config.rateLimitGlobalWindowMs,
    allowList: (request) => request.url.split("?")[0] === "/health",
    addHeaders: {
      "x-ratelimit-limit": true,
      "x-ratelimit-remaining": true,
      "x-ratelimit-reset": true,
      "retry-after": true,
    },
    errorResponseBuilder: (_request, context) =>
      new AppError(429, "RATE_LIMIT_EXCEEDED", "Too many requests", {
        limit: context.max,
        retryAfter: context.after,
      }),
  });
}
