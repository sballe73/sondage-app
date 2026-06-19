import { describe, it } from "node:test";
import assert from "node:assert";
import {
  DEFAULT_GRADE_LABELS,
  DEFAULT_GRADE_MAX,
  DEFAULT_GRADE_MIN,
  labelForGrade,
} from "./grade-scale.js";
import { normalizeCreatePoll } from "./validation.js";

describe("grade-scale defaults", () => {
  it("uses 7 grades from Excellent to À Rejeter", () => {
    assert.strictEqual(DEFAULT_GRADE_MIN, 1);
    assert.strictEqual(DEFAULT_GRADE_MAX, 7);
    assert.strictEqual(DEFAULT_GRADE_LABELS.length, 7);
    assert.strictEqual(DEFAULT_GRADE_LABELS[0], "Excellent");
    assert.strictEqual(DEFAULT_GRADE_LABELS[6], "À Rejeter");
  });

  it("normalizeCreatePoll applies defaults", () => {
    const n = normalizeCreatePoll({
      name: "t",
      creatorId: "c",
      platform: "mock",
      items: [{ label: "A" }],
      startsAt: new Date().toISOString(),
      endsAt: new Date(Date.now() + 86400000).toISOString(),
      visibility: "public",
      voterMode: "public",
      resultPolicy: "end_only",
    });
    assert.strictEqual(n.gradeMin, 1);
    assert.strictEqual(n.gradeMax, 7);
    assert.strictEqual(n.gradeLabels[0], "Excellent");
    assert.strictEqual(labelForGrade(1, n.gradeLabels, 1), "Excellent");
    assert.strictEqual(labelForGrade(7, n.gradeLabels, 1), "À Rejeter");
  });

  it("accepts threshold_1 for non-mock platforms", () => {
    const n = normalizeCreatePoll({
      name: "t",
      creatorId: "c",
      platform: "facebook",
      items: [{ label: "A" }],
      startsAt: new Date().toISOString(),
      endsAt: new Date(Date.now() + 86400000).toISOString(),
      visibility: "public",
      voterMode: "public",
      resultPolicy: "threshold_1",
    });
    assert.strictEqual(n.resultPolicy, "threshold_1");
    assert.strictEqual(n.platform, "facebook");
  });
});
