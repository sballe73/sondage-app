/**
 * Suppression des données utilisateur (Meta callback + /auth/me/delete-data).
 */
import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import {
  closeDb,
  getBallotBySubject,
} from "../../packages/db/dist/index.js";
import { closeRedis as closeApiRedis } from "../../apps/api/dist/redis.js";
import { processVoteEvent } from "../../apps/worker/dist/processor.js";
import { closeRedis as closeWorkerRedis } from "../../apps/worker/dist/redis.js";
import { buildApiApp } from "./build-api-app.js";

const hasEnv = !!process.env.DATABASE_URL && !!process.env.REDIS_URL;
const FB_SECRET =
  process.env.OAUTH_FACEBOOK_APP_SECRET ?? "integration-test-fb-secret";

function signPayload(payload: object, secret: string): string {
  const encoded = Buffer.from(JSON.stringify(payload))
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
  const sig = createHmac("sha256", secret)
    .update(encoded)
    .digest("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
  return `${sig}.${encoded}`;
}

describe("Data deletion", { skip: !hasEnv }, () => {
  let app: Awaited<ReturnType<typeof buildApiApp>>;
  let pollId: string;
  let itemId: string;
  const subjectId = "fb-user-deletion-test-001";

  before(async () => {
    if (!hasEnv) return;
    process.env.RATE_LIMIT_ENABLED = "false";

    app = await buildApiApp();

    const now = Date.now();
    const createRes = await app.inject({
      method: "POST",
      url: "/polls",
      headers: {
        "Content-Type": "application/json",
        "X-Data-Region": "EU",
      },
      payload: {
        name: "Deletion test poll",
        creatorId: "deletion-creator",
        platform: "mock",
        items: [{ label: "A", sortOrder: 0 }],
        visibility: "public",
        voterMode: "public",
        resultPolicy: "end_only",
        dataRegion: "EU",
        startsAt: new Date(now - 3600_000).toISOString(),
        endsAt: new Date(now + 7 * 86400_000).toISOString(),
      },
    });
    assert.equal(createRes.statusCode, 201, createRes.body);
    const poll = createRes.json();
    pollId = poll.id as string;
    itemId = poll.items[0].id as string;

    await processVoteEvent({
      eventId: crypto.randomUUID(),
      pollId,
      platform: "mock",
      subjectId,
      displayName: "Deletion Tester",
      grades: [{ itemId, grade: 4 }],
      voterMode: "public",
      submittedAt: new Date().toISOString(),
    });

    const ballotBefore = await getBallotBySubject(pollId, subjectId);
    assert.ok(ballotBefore, "ballot should exist before deletion");
  });

  after(async () => {
    await closeApiRedis().catch(() => {});
    await closeWorkerRedis().catch(() => {});
    await closeDb().catch(() => {});
  });

  it("POST /auth/me/delete-data removes user vote records", async () => {
    const loginRes = await app.inject({
      method: "POST",
      url: "/auth/mock/login",
      payload: { platform: "mock", subjectId, displayName: subjectId },
    });
    assert.equal(loginRes.statusCode, 200, loginRes.body);
    const token = loginRes.json().accessToken as string;

    const delRes = await app.inject({
      method: "POST",
      url: "/auth/me/delete-data",
      headers: { Authorization: `Bearer ${token}` },
    });
    assert.equal(delRes.statusCode, 200, delRes.body);
    assert.equal(delRes.json().status, "deleted");
    assert.ok(delRes.json().pollsAffected >= 1);

    const ballotAfter = await getBallotBySubject(pollId, subjectId);
    assert.equal(ballotAfter, null);
  });

  it("POST /auth/facebook/data-deletion accepts signed_request and returns status URL", async () => {
    const fbUserId = "meta-deletion-user-999";
    const signed = signPayload(
      { algorithm: "HMAC-SHA256", user_id: fbUserId },
      FB_SECRET
    );
    const res = await app.inject({
      method: "POST",
      url: "/auth/facebook/data-deletion",
      headers: { "Content-Type": "application/json" },
      payload: { signed_request: signed },
    });
    assert.equal(res.statusCode, 200, res.body);
    assert.ok(res.json().confirmation_code);
    assert.ok(res.json().url);
  });

  it("POST /polls rejects platform not in ENABLED_PLATFORMS", async () => {
    const now = Date.now();
    const res = await app.inject({
      method: "POST",
      url: "/polls",
      headers: {
        "Content-Type": "application/json",
        "X-Data-Region": "EU",
      },
      payload: {
        name: "LinkedIn poll blocked",
        creatorId: "someone",
        platform: "linkedin",
        items: [{ label: "X", sortOrder: 0 }],
        visibility: "public",
        voterMode: "public",
        resultPolicy: "end_only",
        dataRegion: "EU",
        startsAt: new Date(now - 3600_000).toISOString(),
        endsAt: new Date(now + 86400_000).toISOString(),
      },
    });
    assert.equal(res.statusCode, 403, res.body);
    assert.equal(res.json().code, "PLATFORM_NOT_ENABLED");
  });
});
