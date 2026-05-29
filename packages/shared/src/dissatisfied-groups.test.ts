import { describe, it } from "node:test";
import assert from "node:assert";
import {
  rankTiedByDissatisfiedGroups,
  rankByMajorityJudgment,
  type TieBreakCandidate,
} from "./dissatisfied-groups.js";

/** Exemple Wikipedia E vs F — échelle 1=pire, 6=meilleur (Passable = 3). */
function wikipediaEF(): TieBreakCandidate[] {
  const distE: Record<number, number> = {
    1: 1,
    2: 0,
    3: 2,
    4: 2,
    5: 1,
    6: 0,
  };
  const distF: Record<number, number> = {
    1: 0,
    2: 1,
    3: 2,
    4: 3,
    5: 0,
    6: 0,
  };
  return [
    {
      itemId: "E",
      label: "E",
      distribution: distE,
      total: 6,
      median: 3,
      bestGradeIsLowest: false,
      supporterStep: 0,
      opponentStep: 0,
    },
    {
      itemId: "F",
      label: "F",
      distribution: distF,
      total: 6,
      median: 3,
      bestGradeIsLowest: false,
      supporterStep: 0,
      opponentStep: 0,
    },
  ];
}

describe("rankTiedByDissatisfiedGroups", () => {
  it("ranks F ahead of E (Wikipedia example, high grade = better)", () => {
    const ranked = rankTiedByDissatisfiedGroups(wikipediaEF(), 1, 6);
    assert.strictEqual(ranked[0]!.candidate.itemId, "F");
    assert.strictEqual(ranked[1]!.candidate.itemId, "E");
    assert.ok(ranked[0]!.ballotage?.display.includes("partisans"));
  });
});

describe("rankByMajorityJudgment", () => {
  it("keeps ex-aequo when distributions are identical", () => {
    const dist = { 1: 2, 2: 1, 3: 3, 4: 2, 5: 2, 6: 1, 7: 1 };
    const items = ["A", "B", "C"].map((id) => ({
      itemId: id,
      label: id,
      distribution: { ...dist },
      median: 3,
      totalJudgments: 12,
    }));
    const ranked = rankByMajorityJudgment(items, 1, 7, true);
    assert.strictEqual(ranked.length, 3);
    assert.ok(ranked.every((r) => r.median === 3 && r.rank === 1 && r.tiedAtMedian));
  });

  it("orders by median (1 = best)", () => {
    const ranked = rankByMajorityJudgment(
      [
        {
          itemId: "low",
          label: "low",
          distribution: { 1: 5, 2: 5 },
          median: 1,
          totalJudgments: 10,
        },
        {
          itemId: "high",
          label: "high",
          distribution: { 6: 5, 7: 5 },
          median: 7,
          totalJudgments: 10,
        },
      ],
      1,
      7,
      true
    );
    assert.strictEqual(ranked[0]!.itemId, "low");
    assert.strictEqual(ranked[1]!.itemId, "high");
  });
});
