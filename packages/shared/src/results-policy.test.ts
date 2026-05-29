import { describe, it } from "node:test";
import assert from "node:assert";
import { shouldPublishSnapshot } from "./results-policy.js";

const endsAt = new Date("2027-01-01");

describe("shouldPublishSnapshot", () => {
  it("publie à chaque multiple du seuil (10, 20, 30…)", () => {
    assert.strictEqual(
      shouldPublishSnapshot("threshold_10", 9, 10, endsAt),
      true
    );
    assert.strictEqual(
      shouldPublishSnapshot("threshold_10", 10, 11, endsAt),
      false
    );
    assert.strictEqual(
      shouldPublishSnapshot("threshold_10", 19, 20, endsAt),
      true
    );
    assert.strictEqual(
      shouldPublishSnapshot("threshold_10", 29, 30, endsAt),
      true
    );
  });
});
