import assert from "node:assert/strict";
import { describe, it } from "node:test";
import Fastify from "fastify";
import rateLimit from "@fastify/rate-limit";
import { parseCorsOrigins } from "./config.js";
import { checkVoteRateLimit, getRedis, closeRedis } from "./redis.js";
import { config } from "./config.js";
import { AppError } from "./errors.js";

describe("config", () => {
  it("parseCorsOrigins allows all when unset or *", () => {
    assert.equal(parseCorsOrigins(undefined), true);
    assert.equal(parseCorsOrigins("*"), true);
    assert.equal(parseCorsOrigins("  *  "), true);
  });

  it("parseCorsOrigins parses comma-separated list", () => {
    assert.deepEqual(parseCorsOrigins("http://a.test,https://b.test"), [
      "http://a.test",
      "https://b.test",
    ]);
  });
});

describe("global rate limit", () => {
  it("returns 429 after max requests", async () => {
    const app = Fastify();
    await app.register(rateLimit, {
      global: true,
      max: 2,
      timeWindow: 60_000,
      errorResponseBuilder: (_req, context) =>
        new AppError(429, "RATE_LIMIT_EXCEEDED", "Too many requests", {
          limit: context.max,
          retryAfter: context.after,
        }),
    });
    app.get("/ping", async () => ({ ok: true }));

    const ok1 = await app.inject({ method: "GET", url: "/ping" });
    const ok2 = await app.inject({ method: "GET", url: "/ping" });
    const blocked = await app.inject({ method: "GET", url: "/ping" });

    assert.equal(ok1.statusCode, 200);
    assert.equal(ok2.statusCode, 200);
    assert.equal(blocked.statusCode, 429);
    const body = blocked.json();
    assert.equal(body.code, "RATE_LIMIT_EXCEEDED");

    await app.close();
  });
});

describe("vote rate limit (Redis)", () => {
  it("blocks after N attempts per subject", async () => {
    if (!process.env.REDIS_URL && !config.redisUrl) {
      return;
    }
    try {
      await getRedis().ping();
    } catch {
      return;
    }

    const pollId = "00000000-0000-4000-8000-rate00000001";
    const subjectId = `rate-test-${Date.now()}`;
    const max = 3;

    try {
      for (let i = 0; i < max; i++) {
        const r = await checkVoteRateLimit(pollId, "mock", subjectId, max);
        assert.equal(r.allowed, true);
      }
      const blocked = await checkVoteRateLimit(pollId, "mock", subjectId, max);
      assert.equal(blocked.allowed, false);
      if (!blocked.allowed) {
        assert.ok(blocked.retryAfterSec >= 1);
      }

      await getRedis().del(`rate:vote:${pollId}:mock:${subjectId}`);
    } finally {
      await closeRedis();
    }
  });
});
