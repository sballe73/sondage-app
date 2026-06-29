/**
 * Feuille d'émargement, multi-auth, threshold_1.
 */
import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { closeDb } from "../../packages/db/dist/index.js";
import { closeRedis as closeApiRedis } from "../../apps/api/dist/redis.js";
import { processVoteEvent } from "../../apps/worker/dist/processor.js";
import { closeRedis as closeWorkerRedis } from "../../apps/worker/dist/redis.js";
import { buildApiApp } from "./build-api-app.js";

const hasEnv = !!process.env.DATABASE_URL && !!process.env.REDIS_URL;

async function mockToken(
  app: Awaited<ReturnType<typeof buildApiApp>>,
  subjectId: string,
  pollId?: string
) {
  const res = await app.inject({
    method: "POST",
    url: "/auth/mock/login",
    payload: {
      platform: "mock",
      subjectId,
      displayName: subjectId,
      ...(pollId ? { pollId } : {}),
    },
  });
  assert.equal(res.statusCode, 200, res.body);
  return res.json().accessToken as string;
}

describe("Attendance and multi-auth features", { skip: !hasEnv }, () => {
  let app: Awaited<ReturnType<typeof buildApiApp>>;
  const prevMultiAuth = process.env.ALLOW_MULTI_PLATFORM_AUTH;

  before(async () => {
    if (!hasEnv) return;
    process.env.RATE_LIMIT_ENABLED = "false";
    app = await buildApiApp();
  });

  after(async () => {
    if (prevMultiAuth === undefined) {
      delete process.env.ALLOW_MULTI_PLATFORM_AUTH;
    } else {
      process.env.ALLOW_MULTI_PLATFORM_AUTH = prevMultiAuth;
    }
    await closeApiRedis().catch(() => {});
    await closeWorkerRedis().catch(() => {});
    await closeDb().catch(() => {});
  });

  it("GET /polls/:pollId/attendance returns names only for anonymous polls", async () => {
    const now = Date.now();
    const createRes = await app.inject({
      method: "POST",
      url: "/polls",
      headers: { "Content-Type": "application/json", "X-Data-Region": "EU" },
      payload: {
        name: "Anonymous attendance",
        creatorId: "attendance-creator",
        platform: "mock",
        items: [{ label: "A", sortOrder: 0 }],
        visibility: "public",
        voterMode: "anonymous",
        resultPolicy: "end_only",
        dataRegion: "EU",
        startsAt: new Date(now - 3600_000).toISOString(),
        endsAt: new Date(now + 7 * 86400_000).toISOString(),
      },
    });
    assert.equal(createRes.statusCode, 201, createRes.body);
    const poll = createRes.json();
    const pollId = poll.id as string;

    await processVoteEvent({
      eventId: crypto.randomUUID(),
      pollId,
      platform: "mock",
      subjectId: "anon-voter-1",
      displayName: "Alice Anonyme",
      grades: [{ itemId: poll.items[0].id, grade: 3 }],
      voterMode: "anonymous",
      submittedAt: new Date().toISOString(),
    });

    const res = await app.inject({
      method: "GET",
      url: `/polls/${pollId}/attendance`,
      headers: { "X-Data-Region": "EU" },
    });
    assert.equal(res.statusCode, 200, res.body);
    const body = res.json();
    assert.equal(body.voterMode, "anonymous");
    assert.equal(body.total, 1);
    assert.equal(body.offset, 0);
    assert.equal(body.limit, 100);
    assert.equal(body.voters.length, 1);
    assert.equal(body.voters[0].displayName, "Alice Anonyme");
    assert.equal(body.voters[0].platform, "mock");
    assert.equal(body.voters[0].subjectId, undefined);
    assert.equal(body.voters[0].grades, undefined);
  });

  it("GET /polls/:pollId/attendance returns ballots for public polls", async () => {
    const now = Date.now();
    const createRes = await app.inject({
      method: "POST",
      url: "/polls",
      headers: { "Content-Type": "application/json", "X-Data-Region": "EU" },
      payload: {
        name: "Public attendance",
        creatorId: "attendance-creator",
        platform: "mock",
        items: [{ label: "Option A", sortOrder: 0 }],
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
    const pollId = poll.id as string;
    const itemId = poll.items[0].id as string;

    await processVoteEvent({
      eventId: crypto.randomUUID(),
      pollId,
      platform: "mock",
      subjectId: "public-voter-1",
      displayName: "Bob Public",
      grades: [{ itemId, grade: 5 }],
      voterMode: "public",
      submittedAt: new Date().toISOString(),
    });

    const res = await app.inject({
      method: "GET",
      url: `/polls/${pollId}/attendance`,
      headers: { "X-Data-Region": "EU" },
    });
    assert.equal(res.statusCode, 200, res.body);
    const body = res.json();
    assert.equal(body.voterMode, "public");
    assert.equal(body.total, 1);
    assert.equal(body.voters.length, 1);
    assert.equal(body.voters[0].displayName, "Bob Public");
    assert.equal(body.voters[0].grades[0].itemLabel, "Option A");
    assert.equal(body.voters[0].grades[0].grade, 5);
    assert.equal(body.voters[0].grades[0].gradeLabel, "Passable");
    assert.equal(body.voters[0].subjectId, undefined);
  });

  it("sanitizes tabs in poll and voter names before storage", async () => {
    const now = Date.now();
    const createRes = await app.inject({
      method: "POST",
      url: "/polls",
      headers: { "Content-Type": "application/json", "X-Data-Region": "EU" },
      payload: {
        name: "Sondage\tinjecté",
        creatorId: "attendance-creator",
        platform: "mock",
        items: [{ label: "Candidat\tA", sortOrder: 0 }],
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
    assert.equal(poll.name, "Sondage injecté");
    assert.equal(poll.items[0].label, "Candidat A");

    await processVoteEvent({
      eventId: crypto.randomUUID(),
      pollId: poll.id,
      platform: "mock",
      subjectId: "tab-voter",
      displayName: "Jean\tDupont",
      grades: [{ itemId: poll.items[0].id, grade: 4 }],
      voterMode: "public",
      submittedAt: new Date().toISOString(),
    });

    const res = await app.inject({
      method: "GET",
      url: `/polls/${poll.id}/attendance`,
      headers: { "X-Data-Region": "EU" },
    });
    const body = res.json();
    assert.equal(body.voters[0].displayName, "Jean Dupont");
    assert.equal(body.voters[0].grades[0].itemLabel, "Candidat A");

    const tsvRes = await app.inject({
      method: "GET",
      url: `/polls/${poll.id}/attendance?format=tsv`,
      headers: { "X-Data-Region": "EU" },
    });
    assert.equal(tsvRes.statusCode, 200, tsvRes.body);
    assert.match(tsvRes.headers["content-type"] ?? "", /tab-separated-values/);
    assert.ok(!tsvRes.body.includes("\tDupont"));
    assert.match(tsvRes.body, /Jean Dupont/);
  });

  it("allows votes from different platforms when ALLOW_MULTI_PLATFORM_AUTH=true", async () => {
    process.env.ALLOW_MULTI_PLATFORM_AUTH = "true";
    const multiApp = await buildApiApp();

    const now = Date.now();
    const createRes = await multiApp.inject({
      method: "POST",
      url: "/polls",
      headers: { "Content-Type": "application/json", "X-Data-Region": "EU" },
      payload: {
        name: "Multi-auth poll",
        creatorId: "multi-creator",
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
    const pollId = poll.id as string;
    const itemId = poll.items[0].id as string;
    assert.equal(poll.platformLocked, false);

    const health = await multiApp.inject({ method: "GET", url: "/health" });
    assert.equal(health.json().allowMultiPlatformAuth, true);

    const loginGoogle = await multiApp.inject({
      method: "POST",
      url: "/auth/mock/login",
      payload: {
        pollId,
        platform: "google",
        subjectId: "voter-google",
        displayName: "Google Voter",
      },
    });
    assert.equal(loginGoogle.statusCode, 200, loginGoogle.body);
    const tokenGoogle = loginGoogle.json().accessToken as string;

    const voteGoogle = await multiApp.inject({
      method: "POST",
      url: `/polls/${pollId}/votes`,
      headers: {
        Authorization: `Bearer ${tokenGoogle}`,
        "Content-Type": "application/json",
        "X-Data-Region": "EU",
      },
      payload: { grades: [{ itemId, grade: 2 }] },
    });
    assert.equal(voteGoogle.statusCode, 202, voteGoogle.body);

    await processVoteEvent({
      eventId: crypto.randomUUID(),
      pollId,
      platform: "mock",
      subjectId: "voter-mock",
      displayName: "Mock Voter",
      grades: [{ itemId, grade: 4 }],
      voterMode: "public",
      submittedAt: new Date().toISOString(),
    });
    await processVoteEvent({
      eventId: crypto.randomUUID(),
      pollId,
      platform: "google",
      subjectId: "voter-google",
      displayName: "Google Voter",
      grades: [{ itemId, grade: 2 }],
      voterMode: "public",
      submittedAt: new Date().toISOString(),
    });

    const attendance = await multiApp.inject({
      method: "GET",
      url: `/polls/${pollId}/attendance`,
      headers: { "X-Data-Region": "EU" },
    });
    assert.equal(attendance.statusCode, 200, attendance.body);
    assert.equal(attendance.json().total, 2);
    assert.equal(attendance.json().voters.length, 2);
    const platforms = attendance
      .json()
      .voters.map((v: { platform: string }) => v.platform)
      .sort();
    assert.deepEqual(platforms, ["google", "mock"]);

    await multiApp.close();
    process.env.ALLOW_MULTI_PLATFORM_AUTH = prevMultiAuth ?? "false";
  });

  it("respects attendance offset and limit query params", async () => {
    const now = Date.now();
    const createRes = await app.inject({
      method: "POST",
      url: "/polls",
      headers: { "Content-Type": "application/json", "X-Data-Region": "EU" },
      payload: {
        name: "Pagination attendance",
        creatorId: "attendance-creator",
        platform: "mock",
        items: [{ label: "A", sortOrder: 0 }],
        visibility: "public",
        voterMode: "anonymous",
        resultPolicy: "end_only",
        dataRegion: "EU",
        startsAt: new Date(now - 3600_000).toISOString(),
        endsAt: new Date(now + 7 * 86400_000).toISOString(),
      },
    });
    const poll = createRes.json();
    const pollId = poll.id as string;
    const itemId = poll.items[0].id as string;

    for (let i = 0; i < 3; i++) {
      await processVoteEvent({
        eventId: crypto.randomUUID(),
        pollId,
        platform: "mock",
        subjectId: `voter-${i}`,
        displayName: `Voter ${i}`,
        grades: [{ itemId, grade: 3 }],
        voterMode: "anonymous",
        submittedAt: new Date().toISOString(),
      });
    }

    const page1 = await app.inject({
      method: "GET",
      url: `/polls/${pollId}/attendance?offset=0&limit=2`,
      headers: { "X-Data-Region": "EU" },
    });
    const body1 = page1.json();
    assert.equal(body1.total, 3);
    assert.equal(body1.offset, 0);
    assert.equal(body1.limit, 2);
    assert.equal(body1.voters.length, 2);

    const page2 = await app.inject({
      method: "GET",
      url: `/polls/${pollId}/attendance?offset=2&limit=2`,
      headers: { "X-Data-Region": "EU" },
    });
    const body2 = page2.json();
    assert.equal(body2.voters.length, 1);
  });

  it("creates poll without platform field when ALLOW_MULTI_PLATFORM_AUTH=true", async () => {
    process.env.ALLOW_MULTI_PLATFORM_AUTH = "true";
    const multiApp = await buildApiApp();
    const now = Date.now();

    const createRes = await multiApp.inject({
      method: "POST",
      url: "/polls",
      headers: { "Content-Type": "application/json", "X-Data-Region": "EU" },
      payload: {
        name: "No platform in body",
        creatorId: "multi-no-platform",
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
    assert.equal(createRes.json().platform, "mock");
    assert.equal(createRes.json().platformLocked, false);

    await multiApp.close();
  });
});
