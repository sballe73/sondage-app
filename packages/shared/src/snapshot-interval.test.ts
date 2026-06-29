import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_SNAPSHOT_MIN_INTERVAL_MS,
  parseSnapshotMinIntervalMs,
  snapshotThrottleRemainingMs,
} from "./snapshot-interval.js";

describe("parseSnapshotMinIntervalMs", () => {
  it("defaults to one minute", () => {
    assert.strictEqual(parseSnapshotMinIntervalMs(undefined), 60_000);
    assert.strictEqual(parseSnapshotMinIntervalMs(""), 60_000);
  });

  it("parses valid values and disables throttle at 0", () => {
    assert.strictEqual(parseSnapshotMinIntervalMs("5000"), 5000);
    assert.strictEqual(parseSnapshotMinIntervalMs("0"), 0);
  });

  it("falls back on invalid values", () => {
    assert.strictEqual(parseSnapshotMinIntervalMs("nope"), DEFAULT_SNAPSHOT_MIN_INTERVAL_MS);
    assert.strictEqual(parseSnapshotMinIntervalMs("-1"), DEFAULT_SNAPSHOT_MIN_INTERVAL_MS);
  });
});

describe("snapshotThrottleRemainingMs", () => {
  const now = new Date("2026-06-29T12:00:00.000Z");

  it("returns 0 when interval is disabled or no prior snapshot", () => {
    assert.strictEqual(snapshotThrottleRemainingMs(null, now, 60_000), 0);
    assert.strictEqual(
      snapshotThrottleRemainingMs("2026-06-29T11:59:00.000Z", now, 0),
      0
    );
  });

  it("returns remaining ms when inside the window", () => {
    assert.strictEqual(
      snapshotThrottleRemainingMs("2026-06-29T11:59:30.000Z", now, 60_000),
      30_000
    );
  });

  it("returns 0 when the interval has elapsed", () => {
    assert.strictEqual(
      snapshotThrottleRemainingMs("2026-06-29T11:00:00.000Z", now, 60_000),
      0
    );
  });
});
