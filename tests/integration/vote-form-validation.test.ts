/**
 * Validation du vote incomplet : message personnalisé (pas la validation HTML native).
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import vm from "node:vm";

const ROOT = join(import.meta.dirname, "../..");
const VALIDATE_JS = join(ROOT, "embed/vote-form-validate.js");
const WIDGET_JS = join(ROOT, "embed/sondage-widget.js");
const VOTE_HTML = join(ROOT, "embed/vote.html");

type VoteFormValidate = {
  validateVoteGrades: (
    items: Array<{ id: string; label: string }>,
    gradeForItem: (itemId: string) => number | null
  ) => {
    ok: boolean;
    missing: string[];
    grades: Array<{ itemId: string; grade: number }>;
    message: string;
  };
};

function loadVoteFormValidate(): VoteFormValidate {
  const sandbox: Record<string, unknown> = {};
  sandbox.globalThis = sandbox;
  vm.runInNewContext(readFileSync(VALIDATE_JS, "utf8"), sandbox);
  const api = sandbox.SondageVoteFormValidate as VoteFormValidate | undefined;
  assert.ok(api, "vote-form-validate.js must expose SondageVoteFormValidate");
  return api;
}

describe("Vote form validation", () => {
  const items = [
    { id: "11111111-1111-4111-8111-111111111101", label: "Alice" },
    { id: "11111111-1111-4111-8111-111111111102", label: "Bob" },
    { id: "11111111-1111-4111-8111-111111111103", label: "Claire" },
  ];

  it("rejects submit when at least one candidate has no grade", () => {
    const validate = loadVoteFormValidate();
    const result = validate.validateVoteGrades(items, (id) => {
      if (id === items[0].id) return 2;
      if (id === items[1].id) return 4;
      return null;
    });

    assert.equal(result.ok, false);
    assert.equal(result.missing.length, 1);
    assert.equal(result.missing[0], "Claire");
    assert.match(
      result.message,
      /Attribuez une note à « Claire » avant d’envoyer\./
    );
    assert.equal(result.grades.length, 2);
    assert.equal(result.grades[0].itemId, items[0].id);
    assert.equal(result.grades[1].itemId, items[1].id);
  });

  it("accepts submit when every candidate has a grade", () => {
    const validate = loadVoteFormValidate();
    const result = validate.validateVoteGrades(items, (id) => {
      if (id === items[0].id) return 1;
      if (id === items[1].id) return 3;
      if (id === items[2].id) return 5;
      return null;
    });

    assert.equal(result.ok, true);
    assert.equal(result.message, "");
    assert.equal(result.missing.length, 0);
    assert.equal(result.grades.length, 3);
    assert.equal(result.grades[0].grade, 1);
    assert.equal(result.grades[1].grade, 3);
    assert.equal(result.grades[2].grade, 5);
  });

  it("disables native HTML validation so the inline error can appear", () => {
    const widget = readFileSync(WIDGET_JS, "utf8");
    const html = readFileSync(VOTE_HTML, "utf8");

    assert.match(
      widget,
      /<form id="vote-form" novalidate>/,
      "form must use novalidate"
    );
    assert.doesNotMatch(
      widget,
      /type="radio"[^>]*\brequired\b/,
      "required on radios triggers browser tooltip instead of custom message"
    );
    assert.match(
      widget,
      /SondageVoteFormValidate\.validateVoteGrades/,
      "widget must call shared vote validation helper"
    );
    assert.match(html, /vote-form-validate\.js/);
    assert.match(widget, /id="vote-form-error"/);
  });
});
