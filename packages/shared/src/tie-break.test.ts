import { describe, it } from "node:test";
import assert from "node:assert";
import { formatMedianWithBallotage } from "./tie-break.js";

describe("formatMedianWithBallotage", () => {
  const labels = [
    "Excellent",
    "Très bien",
    "Bien",
    "Assez bien",
    "Passable",
    "Insuffisant",
    "À Rejeter",
  ];

  it("includes ballotage in parentheses when tied", () => {
    const s = formatMedianWithBallotage(3, labels, 1, {
      method: "dissatisfied_groups",
      supportersPercent: 45,
      opponentsPercent: 20,
      display: "partisans 45 %, opposants 20 %",
    }, true);
    assert.ok(s.includes("3 — Bien"));
    assert.ok(s.includes("(partisans 45 %, opposants 20 %)"));
  });

  it("shows ex-aequo without numeric ballotage", () => {
    const s = formatMedianWithBallotage(3, labels, 1, {
      method: "dissatisfied_groups",
      supportersPercent: 50,
      opponentsPercent: 50,
      display: "ex-aequo",
    }, true);
    assert.ok(s.includes("(ex-aequo)"));
  });
});
