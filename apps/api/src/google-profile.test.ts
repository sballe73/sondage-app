import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { mapGoogleUserInfo } from "./auth/google-profile.js";

describe("Google OAuth profile", () => {
  it("mapGoogleUserInfo uses sub as subjectId", () => {
    const profile = mapGoogleUserInfo({
      sub: "google-user-123",
      name: "Alice Dupont",
      email: "alice@example.com",
    });
    assert.equal(profile.platform, "google");
    assert.equal(profile.subjectId, "google-user-123");
    assert.equal(profile.displayName, "Alice Dupont");
  });

  it("mapGoogleUserInfo falls back to email then sub", () => {
    assert.equal(
      mapGoogleUserInfo({ sub: "abc", email: "a@b.c" }).displayName,
      "a@b.c"
    );
    assert.equal(mapGoogleUserInfo({ sub: "abc" }).displayName, "abc");
  });

  it("mapGoogleUserInfo trims name", () => {
    assert.equal(
      mapGoogleUserInfo({ sub: "x", name: "  Bob  " }).displayName,
      "Bob"
    );
  });
});
