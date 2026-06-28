import http from "k6/http";
import { check } from "k6";
import exec from "k6/execution";
import { buildGrades } from "./lib/grades.js";

const apiBase = __ENV.API_BASE || "http://localhost:3000";
const pollId = __ENV.POLL_ID;
const region = __ENV.DATA_REGION || "EU";
const prefix = __ENV.PREFIX || "perf-voter";
const voterOffset = Number(__ENV.VOTER_OFFSET || 0);
const iterations = Number(__ENV.VUS || 10);
const concurrency = Number(__ENV.CONCURRENCY || __ENV.VUS || 10);
const rampSeconds = Number(__ENV.RAMP_SECONDS || 0);
const loadProfile = rampSeconds > 0 ? "ramp" : "burst";

if (!pollId) {
  throw new Error("POLL_ID env var is required");
}

const burstScenario = {
  burst: {
    executor: "shared-iterations",
    vus: Math.min(concurrency, iterations),
    iterations,
    maxDuration: `${Math.max(10, Math.ceil(iterations / Math.max(concurrency, 1)) * 2)}m`,
    tags: { profile: "burst" },
  },
};

const rampScenario = {
  ramp: {
    executor: "ramping-vus",
    startVUs: 0,
    stages: [
      { duration: `${rampSeconds}s`, target: Math.min(concurrency, iterations) },
      { duration: "30s", target: 0 },
    ],
    gracefulRampDown: "10s",
    tags: { profile: "ramp" },
  },
};

export const options = {
  scenarios: loadProfile === "burst" ? burstScenario : rampScenario,
  thresholds: {
    http_req_failed: ["rate<0.05"],
    "checks{vote:accepted}": ["rate>0.95"],
    "http_req_duration{name:vote}": ["p(95)<2000"],
  },
  tags: {
    machine_id: __ENV.MACHINE_ID || "0",
    poll_id: pollId,
  },
};

export function setup() {
  const res = http.get(`${apiBase}/polls/${pollId}`, {
    headers: { "X-Data-Region": region },
    tags: { name: "setup" },
  });

  if (res.status !== 200) {
    throw new Error(`Poll fetch failed: HTTP ${res.status} — ${res.body}`);
  }

  const poll = res.json();
  if (poll.error) {
    throw new Error(`Poll error: ${poll.error.message || JSON.stringify(poll.error)}`);
  }
  if (poll.platform !== "mock") {
    throw new Error(`Poll platform must be mock (got ${poll.platform})`);
  }
  if (!poll.items?.length) {
    throw new Error("Poll has no items");
  }

  const now = Date.now();
  const startsAt = new Date(poll.startsAt).getTime();
  const endsAt = new Date(poll.endsAt).getTime();
  if (now < startsAt) {
    throw new Error(`Poll has not started yet (startsAt: ${poll.startsAt})`);
  }
  if (now >= endsAt || poll.closedAt) {
    throw new Error(
      `Poll is closed (endsAt: ${poll.endsAt}, closedAt: ${poll.closedAt || "null"})`
    );
  }

  return {
    items: poll.items,
    gradeMin: poll.gradeMin,
    gradeMax: poll.gradeMax,
  };
}

export default function runVote(poll) {
  if (loadProfile === "ramp" && __ITER > 0) {
    return;
  }

  const voterIndex = voterOffset + exec.scenario.iterationInTest;
  const subjectId = `${prefix}-${voterIndex}`;
  const displayName = `Perf voter ${voterIndex}`;

  const loginRes = http.post(
    `${apiBase}/auth/mock/login`,
    JSON.stringify({
      pollId,
      platform: "mock",
      subjectId,
      displayName,
    }),
    {
      headers: {
        "Content-Type": "application/json",
        "X-Data-Region": region,
      },
      tags: { name: "login" },
    }
  );

  const loginOk = check(loginRes, {
    "login:status 200": (r) => r.status === 200,
  });

  if (!loginOk) {
    return;
  }

  const token = loginRes.json("accessToken");
  if (!token) {
    return;
  }

  const grades = buildGrades(poll.items, poll.gradeMin, poll.gradeMax, voterIndex);
  const idempotencyKey = `load-${pollId}-${subjectId}`;

  const voteRes = http.post(
    `${apiBase}/polls/${pollId}/votes`,
    JSON.stringify({ grades }),
    {
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
        "X-Data-Region": region,
        "Idempotency-Key": idempotencyKey,
      },
      tags: { name: "vote" },
    }
  );

  check(voteRes, {
    "vote:accepted": (r) => r.status === 202,
    "vote:not rate limited": (r) => r.status !== 429,
    "vote:not already voted": (r) => r.status !== 409,
  });
}
