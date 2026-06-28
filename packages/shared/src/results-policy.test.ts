import { describe, it } from "node:test";
import assert from "node:assert";
import {
  shouldPublishSnapshot,
  isResultsVisible,
  isMockLiveSnapshot,
} from "./results-policy.js";

const endsAt = new Date("2027-01-01");
const mockLive = { platform: "mock" as const, mockSnapshotEveryVote: true };

describe("isMockLiveSnapshot", () => {
  it("true only for mock platform with flag enabled", () => {
    assert.strictEqual(isMockLiveSnapshot(mockLive), true);
    assert.strictEqual(
      isMockLiveSnapshot({ platform: "mock", mockSnapshotEveryVote: false }),
      false
    );
    assert.strictEqual(
      isMockLiveSnapshot({ platform: "google", mockSnapshotEveryVote: true }),
      false
    );
    assert.strictEqual(isMockLiveSnapshot(undefined), false);
  });
});

describe("shouldPublishSnapshot", () => {
  it("threshold_1 publie à chaque vote", () => {
    assert.strictEqual(
      shouldPublishSnapshot("threshold_1", 0, 1, endsAt),
      true
    );
    assert.strictEqual(
      shouldPublishSnapshot("threshold_1", 1, 2, endsAt),
      true
    );
    assert.strictEqual(
      shouldPublishSnapshot("threshold_1", 2, 2, endsAt),
      false
    );
  });

  it("threshold_10 : publie dès qu'il y a de nouveaux votes agrégés", () => {
    assert.strictEqual(
      shouldPublishSnapshot("threshold_10", 9, 10, endsAt),
      true
    );
    assert.strictEqual(
      shouldPublishSnapshot("threshold_10", 10, 11, endsAt),
      true
    );
    assert.strictEqual(
      shouldPublishSnapshot("threshold_10", 23910, 23914, endsAt),
      true
    );
    assert.strictEqual(
      shouldPublishSnapshot("threshold_10", 15, 15, endsAt),
      false
    );
  });

  it("mock live: publie à chaque vote", () => {
    assert.strictEqual(
      shouldPublishSnapshot("threshold_10", 0, 1, endsAt, new Date(), mockLive),
      true
    );
    assert.strictEqual(
      shouldPublishSnapshot("threshold_10", 1, 2, endsAt, new Date(), mockLive),
      true
    );
    assert.strictEqual(
      shouldPublishSnapshot("threshold_10", 5, 5, endsAt, new Date(), mockLive),
      false
    );
  });
});

describe("isResultsVisible", () => {
  it("threshold_1 : visible dès 1 vote", () => {
    assert.strictEqual(isResultsVisible("threshold_1", 0, endsAt), false);
    assert.strictEqual(isResultsVisible("threshold_1", 1, endsAt), true);
  });

  it("mock live: visible dès le premier vote", () => {
    assert.strictEqual(
      isResultsVisible("threshold_10", 0, endsAt, new Date(), mockLive),
      false
    );
    assert.strictEqual(
      isResultsVisible("threshold_10", 1, endsAt, new Date(), mockLive),
      true
    );
    assert.strictEqual(
      isResultsVisible("end_only", 1, endsAt, new Date(), mockLive),
      true
    );
  });

  it("sans mock live: seuil inchangé", () => {
    assert.strictEqual(
      isResultsVisible("threshold_10", 9, endsAt),
      false
    );
    assert.strictEqual(
      isResultsVisible("threshold_10", 10, endsAt),
      true
    );
  });
});
