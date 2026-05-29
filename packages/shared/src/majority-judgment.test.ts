import { describe, it } from "node:test";
import assert from "node:assert";
import { medianFromHistogram } from "./majority-judgment.js";

describe("medianFromHistogram", () => {
  it("returns null for empty", () => {
    const r = medianFromHistogram({});
    assert.strictEqual(r.median, null);
    assert.strictEqual(r.total, 0);
  });

  it("computes median for odd total", () => {
    const r = medianFromHistogram({ 1: 2, 3: 3, 5: 1 });
    assert.strictEqual(r.total, 6);
    assert.strictEqual(r.median, 3);
  });

  it("computes median for even total (lower median)", () => {
    const r = medianFromHistogram({ 1: 1, 2: 1, 3: 1, 4: 1 });
    assert.strictEqual(r.median, 2);
  });
});
