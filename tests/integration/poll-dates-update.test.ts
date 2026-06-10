/**
 * PATCH /polls/:pollId/dates — créateur OAuth, validation des dates.
 */
import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { closeDb } from "../../packages/db/dist/index.js";
import { closeRedis as closeApiRedis } from "../../apps/api/dist/redis.js";
import { issueVoterToken } from "../../apps/api/dist/auth/oauth.js";
import { buildApiApp } from "./build-api-app.js";

const hasEnv = !!process.env.DATABASE_URL && !!process.env.REDIS_URL;

async function mockToken(
  app: Awaited<ReturnType<typeof buildApiApp>>,
  subjectId: string
) {
  const res = await app.inject({
    method: "POST",
    url: "/auth/mock/login",
    headers: { "Content-Type": "application/json" },
    payload: {
      platform: "mock",
      subjectId,
      displayName: subjectId,
    },
  });
  assert.equal(res.statusCode, 200, res.body);
  return res.json().accessToken as string;
}

function futureWindow() {
  const now = Date.now();
  return {
    startsAt: new Date(now + 2 * 60 * 60 * 1000).toISOString(),
    endsAt: new Date(now + 7 * 24 * 60 * 60 * 1000).toISOString(),
  };
}

function startedWindow() {
  const now = Date.now();
  return {
    startsAt: new Date(now - 60 * 60 * 1000).toISOString(),
    endsAt: new Date(now + 7 * 24 * 60 * 60 * 1000).toISOString(),
  };
}

describe("PATCH /polls/:pollId/dates", { skip: !hasEnv }, () => {
  let app: Awaited<ReturnType<typeof buildApiApp>>;
  let pollId: string;
  let creatorToken: string;

  before(async () => {
    if (!hasEnv) return;
    process.env.RATE_LIMIT_ENABLED = "false";

    app = await buildApiApp();
    creatorToken = await mockToken(app, "poll-dates-creator");

    const window = futureWindow();
    const createRes = await app.inject({
      method: "POST",
      url: "/polls",
      headers: {
        "Content-Type": "application/json",
        "X-Data-Region": "EU",
      },
      payload: {
        name: "Poll dates update test",
        creatorId: "poll-dates-creator",
        platform: "mock",
        items: [{ label: "A", sortOrder: 0 }],
        visibility: "public",
        voterMode: "public",
        resultPolicy: "end_only",
        dataRegion: "EU",
        startsAt: window.startsAt,
        endsAt: window.endsAt,
      },
    });
    assert.equal(createRes.statusCode, 201, createRes.body);
    pollId = createRes.json().id;
  });

  after(async () => {
    if (!hasEnv) return;
    await app.close();
    await closeApiRedis();
    await closeDb();
  });

  it("allows creator to update future startsAt", async () => {
    const newStart = new Date(Date.now() + 4 * 60 * 60 * 1000).toISOString();
    const res = await app.inject({
      method: "PATCH",
      url: `/polls/${pollId}/dates`,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${creatorToken}`,
        "X-Data-Region": "EU",
      },
      payload: { startsAt: newStart },
    });
    assert.equal(res.statusCode, 200, res.body);
    assert.equal(
      new Date(res.json().startsAt).toISOString(),
      new Date(newStart).toISOString()
    );
  });

  it("allows creator to set endsAt to now when poll has started", async () => {
    const startedToken = await mockToken(app, "poll-dates-started");
    const window = startedWindow();
    const createRes = await app.inject({
      method: "POST",
      url: "/polls",
      headers: {
        "Content-Type": "application/json",
        "X-Data-Region": "EU",
      },
      payload: {
        name: "Started poll dates test",
        creatorId: "poll-dates-started",
        platform: "mock",
        items: [{ label: "A", sortOrder: 0 }],
        visibility: "public",
        voterMode: "public",
        resultPolicy: "end_only",
        dataRegion: "EU",
        startsAt: window.startsAt,
        endsAt: window.endsAt,
      },
    });
    assert.equal(createRes.statusCode, 201, createRes.body);
    const startedPollId = createRes.json().id;

    const res = await app.inject({
      method: "PATCH",
      url: `/polls/${startedPollId}/dates`,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${startedToken}`,
        "X-Data-Region": "EU",
      },
      payload: { endsAt: "now" },
    });
    assert.equal(res.statusCode, 200, res.body);
    assert.ok(new Date(res.json().endsAt).getTime() >= Date.now() - 5000);
  });

  it("rejects non-creator", async () => {
    const otherToken = await mockToken(app, "someone-else");
    const res = await app.inject({
      method: "PATCH",
      url: `/polls/${pollId}/dates`,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${otherToken}`,
        "X-Data-Region": "EU",
      },
      payload: {
        endsAt: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000).toISOString(),
      },
    });
    assert.equal(res.statusCode, 403, res.body);
  });

  it("rejects past startsAt", async () => {
    const res = await app.inject({
      method: "PATCH",
      url: `/polls/${pollId}/dates`,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${creatorToken}`,
        "X-Data-Region": "EU",
      },
      payload: {
        startsAt: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
      },
    });
    assert.equal(res.statusCode, 400, res.body);
    assert.match(res.json().code, /DATE_IN_PAST|POLL_ALREADY_STARTED/);
  });
});

describe("POST /polls creator auth", { skip: !hasEnv }, () => {
  let app: Awaited<ReturnType<typeof buildApiApp>>;

  before(async () => {
    if (!hasEnv) return;
    app = await buildApiApp();
  });

  after(async () => {
    if (!hasEnv) return;
    await app.close();
    await closeApiRedis();
    await closeDb();
  });

  it("mock accepts creatorId without bearer", async () => {
    const window = futureWindow();
    const res = await app.inject({
      method: "POST",
      url: "/polls",
      headers: {
        "Content-Type": "application/json",
        "X-Data-Region": "EU",
      },
      payload: {
        name: "Mock poll",
        creatorId: "local-dev",
        platform: "mock",
        items: [{ label: "A" }],
        visibility: "public",
        voterMode: "public",
        resultPolicy: "end_only",
        startsAt: window.startsAt,
        endsAt: window.endsAt,
      },
    });
    assert.equal(res.statusCode, 201, res.body);
    assert.equal(res.json().creatorId, "local-dev");
  });

  it("facebook requires bearer and sets creatorId from token", async () => {
    const token = await issueVoterToken({
      platform: "facebook",
      subjectId: "fb-creator-99",
    });
    const window = futureWindow();
    const res = await app.inject({
      method: "POST",
      url: "/polls",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
        "X-Data-Region": "EU",
      },
      payload: {
        name: "Facebook poll",
        creatorId: "ignored-id",
        platform: "facebook",
        items: [{ label: "A" }],
        visibility: "public",
        voterMode: "public",
        resultPolicy: "end_only",
        startsAt: window.startsAt,
        endsAt: window.endsAt,
      },
    });
    assert.equal(res.statusCode, 201, res.body);
    assert.equal(res.json().creatorId, "fb-creator-99");
  });

  it("facebook rejects missing bearer", async () => {
    const window = futureWindow();
    const res = await app.inject({
      method: "POST",
      url: "/polls",
      headers: {
        "Content-Type": "application/json",
        "X-Data-Region": "EU",
      },
      payload: {
        name: "Facebook poll",
        creatorId: "ignored",
        platform: "facebook",
        items: [{ label: "A" }],
        visibility: "public",
        voterMode: "public",
        resultPolicy: "end_only",
        startsAt: window.startsAt,
        endsAt: window.endsAt,
      },
    });
    assert.equal(res.statusCode, 401, res.body);
  });
});
