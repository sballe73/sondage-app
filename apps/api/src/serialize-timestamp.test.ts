import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { toIsoString } from "./serialize-timestamp.js";

describe("toIsoString", () => {
  it("serializes Date instances", () => {
    const date = new Date("2026-06-08T12:30:00.000Z");
    assert.equal(toIsoString(date), "2026-06-08T12:30:00.000Z");
  });

  it("accepts ISO strings from Postgres", () => {
    assert.equal(
      toIsoString("2026-06-08T12:30:00.000Z"),
      "2026-06-08T12:30:00.000Z"
    );
  });

  it("returns undefined for empty values", () => {
    assert.equal(toIsoString(null), undefined);
    assert.equal(toIsoString(undefined), undefined);
    assert.equal(toIsoString(""), undefined);
  });
});
