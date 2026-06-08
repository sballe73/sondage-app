/**
 * Marque noire sur la case radio sélectionnée dans la grille de vote.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(import.meta.dirname, "../..");
const VOTE_HTML = join(ROOT, "embed/vote.html");
const WIDGET_JS = join(ROOT, "embed/sondage-widget.js");

const CHECKED_MARK_RULE =
  /\.sondage-widget\s+\.vote-grid\s+\.grade-cell:has\(input:checked\)\s+\.grade-cell-mark\s*\{([^}]+)\}/;

function readCheckedMarkDeclarations(): string {
  const html = readFileSync(VOTE_HTML, "utf8");
  const match = html.match(CHECKED_MARK_RULE);
  assert.ok(match, "checked grade-cell-mark CSS rule must exist in vote.html");
  return match[1];
}

describe("Vote grid selection mark", () => {
  it("vote.html styles checked radio mark with black fill", () => {
    const declarations = readCheckedMarkDeclarations();
    assert.match(
      declarations,
      /background:\s*#000\b/,
      "selected mark must use black background (#000)"
    );
    assert.doesNotMatch(
      declarations,
      /background:\s*#fff\b/,
      "selected mark must not stay white on colored cell"
    );
  });

  it("vote widget renders grade-cell-mark next to each radio input", () => {
    const js = readFileSync(WIDGET_JS, "utf8");
    assert.match(js, /type="radio"/);
    assert.match(js, /class="grade-cell-mark"/);
    assert.match(
      js,
      /<span class="grade-cell-mark" aria-hidden="true"><\/span>/
    );
  });

});
