/**
 * Persistance OAuth embed : jetons par plateforme, pas par sondage.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(import.meta.dirname, "../..");
const AUTH_STORAGE = join(ROOT, "embed/sondage-auth-storage.js");
const WIDGET_JS = join(ROOT, "embed/sondage-widget.js");
const SHELL_JS = join(ROOT, "embed/sondage-shell.js");
const VOTE_HTML = join(ROOT, "embed/vote.html");

describe("Embed auth persistence across polls", () => {
  it("stores tokens per platform in shared auth storage", () => {
    const js = readFileSync(AUTH_STORAGE, "utf8");
    assert.match(js, /readToken\(platform\)/);
    assert.match(js, /writeToken\(platform, token\)/);
    assert.match(js, /migrateLegacyPollToken/);
  });

  it("widget reads and persists platform-scoped tokens", () => {
    const js = readFileSync(WIDGET_JS, "utf8");
    assert.match(js, /SondageAuthStorage/);
    assert.match(js, /persistToken/);
    assert.match(js, /migrateLegacyPollToken/);
    assert.doesNotMatch(js, /sondage_token_\$\{this\.pollId\}/);
  });

  it("shell does not clear auth when changing poll", () => {
    const js = readFileSync(SHELL_JS, "utf8");
    assert.match(js, /goToPollPicker[\s\S]*clearActivePoll/);
    assert.doesNotMatch(
      js.match(/function clearActivePoll[\s\S]*?^  \}/m)?.[0] || "",
      /sondage_token_/
    );
    assert.match(js, /readToken\(platform, pollId\)/);
  });

  it("vote.html loads auth storage before shell and widget", () => {
    const html = readFileSync(VOTE_HTML, "utf8");
    const authIdx = html.indexOf("sondage-auth-storage.js");
    const shellIdx = html.indexOf("sondage-shell.js");
    const widgetIdx = html.indexOf("sondage-widget.js");
    assert.ok(authIdx >= 0);
    assert.ok(authIdx < shellIdx);
    assert.ok(shellIdx < widgetIdx);
  });
});
