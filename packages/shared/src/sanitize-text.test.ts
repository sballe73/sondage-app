import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  formatTsvRow,
  sanitizeStoredText,
  sanitizeStoredTextOptional,
  sanitizeStoredTextRequired,
} from "./sanitize-text.js";

describe("sanitizeStoredText", () => {
  it("removes tabs and newlines", () => {
    assert.equal(sanitizeStoredText("Alice\tDupont\n", 100), "Alice Dupont");
    assert.equal(sanitizeStoredText("A\r\nB", 100), "A B");
  });

  it("collapses whitespace and trims", () => {
    assert.equal(sanitizeStoredText("  Bob   Martin  ", 100), "Bob Martin");
  });

  it("truncates to max length", () => {
    assert.equal(sanitizeStoredText("abcdef", 3), "abc");
  });

  it("required rejects empty after sanitize", () => {
    assert.throws(
      () => sanitizeStoredTextRequired("\t\n", 100, "name"),
      /name must not be empty/
    );
  });

  it("optional returns undefined for blank input", () => {
    assert.equal(sanitizeStoredTextOptional("  \t  ", 100), undefined);
    assert.equal(sanitizeStoredTextOptional("Alice", 100), "Alice");
  });
});

describe("formatTsvRow", () => {
  it("never emits raw tabs inside cells", () => {
    const row = formatTsvRow(["Nom\tinjecté", "Plateforme", "2026"]);
    assert.equal(row.split("\t").length, 3);
    assert.ok(!row.includes("\tinjecté"));
    assert.match(row, /^Nom injecté\t/);
  });
});
