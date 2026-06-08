/**
 * Ordre aléatoire des candidats dans la grille de vote.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import vm from "node:vm";

const ROOT = join(import.meta.dirname, "../..");
const ORDER_JS = join(ROOT, "embed/vote-candidate-order.js");
const WIDGET_JS = join(ROOT, "embed/sondage-widget.js");
const VOTE_HTML = join(ROOT, "embed/vote.html");

type VoteCandidateOrder = {
  shuffleItems: <T>(items: T[], randomFn?: () => number) => T[];
};

function loadVoteCandidateOrder(): VoteCandidateOrder {
  const sandbox: Record<string, unknown> = {};
  sandbox.globalThis = sandbox;
  vm.runInNewContext(readFileSync(ORDER_JS, "utf8"), sandbox);
  const api = sandbox.SondageVoteCandidateOrder as VoteCandidateOrder | undefined;
  assert.ok(api, "vote-candidate-order.js must expose SondageVoteCandidateOrder");
  return api;
}

function sequenceRandom(values: number[]): () => number {
  let index = 0;
  return () => values[index++] ?? 0;
}

describe("Vote candidate shuffle", () => {
  const items = [
    { id: "11111111-1111-4111-8111-111111111101", label: "Alice" },
    { id: "11111111-1111-4111-8111-111111111102", label: "Bob" },
    { id: "11111111-1111-4111-8111-111111111103", label: "Claire" },
    { id: "11111111-1111-4111-8111-111111111104", label: "David" },
  ];

  it("shuffleItems permutes display order while preserving every candidate", () => {
    const { shuffleItems } = loadVoteCandidateOrder();
    const shuffled = shuffleItems(items, sequenceRandom([0.99, 0.01, 0.5]));

    assert.notDeepEqual(
      shuffled.map((item) => item.id),
      items.map((item) => item.id),
      "display order must differ from API sortOrder"
    );
    assert.deepEqual(
      shuffled.map((item) => item.id).sort(),
      items.map((item) => item.id).sort(),
      "all candidates must still be present"
    );
  });

  it("shuffleItems leaves singleton lists unchanged", () => {
    const { shuffleItems } = loadVoteCandidateOrder();
    const single = [{ id: "only", label: "Solo" }];
    assert.deepEqual(shuffleItems(single, sequenceRandom([0.5])), single);
  });

  it("vote widget shuffles candidates before rendering the grid", () => {
    const widget = readFileSync(WIDGET_JS, "utf8");
    const html = readFileSync(VOTE_HTML, "utf8");

    assert.match(widget, /SondageVoteCandidateOrder/);
    assert.match(widget, /shuffleItems\(sourceItems\)/);
    assert.match(html, /vote-candidate-order\.js/);
    assert.ok(
      html.indexOf("vote-candidate-order.js") < html.indexOf("sondage-widget.js"),
      "vote-candidate-order.js must load before sondage-widget.js"
    );
  });
});
