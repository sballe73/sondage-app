/**
 * Affichage lorsque l'utilisateur a déjà voté sur vote.html.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(import.meta.dirname, "../..");
const WIDGET_JS = join(ROOT, "embed/sondage-widget.js");
const VOTE_HTML = join(ROOT, "embed/vote.html");

describe("Vote already submitted UI", () => {
  it("widget loads participation and renders a dedicated already-voted view", () => {
    const js = readFileSync(WIDGET_JS, "utf8");
    assert.match(js, /\/participation/);
    assert.match(js, /renderAlreadyVoted/);
    assert.match(js, /loadParticipation/);
    assert.match(js, /_syncParticipationRecord/);
    assert.match(js, /pendingAggregation/);
    assert.match(
      js,
      /this\.participation\?\.voted[\s\S]*renderAlreadyVoted/
    );
  });

  it("public poll shows readonly grid and vote date without submit button", () => {
    const js = readFileSync(WIDGET_JS, "utf8");
    assert.match(js, /vote-grid--readonly/);
    assert.match(js, /Votre vote en date du/);
    assert.match(js, /readonly:\s*true/);
    assert.doesNotMatch(
      js.match(/renderAlreadyVoted[\s\S]*?renderForm/)?.[0] || "",
      /Envoyer mon jugement/
    );
  });

  it("anonymous poll shows only the already-voted message with date", () => {
    const js = readFileSync(WIDGET_JS, "utf8");
    assert.match(js, /Vous avez déjà voté en date du/);
    assert.match(js, /voterMode === "public"/);
  });

  it("vote.html styles readonly grid and already-voted notice", () => {
    const html = readFileSync(VOTE_HTML, "utf8");
    assert.match(html, /vote-already-notice/);
    assert.match(html, /vote-grid--readonly/);
    assert.match(html, /sondage-widget--already-voted/);
  });
});
