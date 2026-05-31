import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { mapFacebookUserInfo } from "./auth/facebook-profile.js";

describe("Facebook OAuth profile", () => {
  it("mapFacebookUserInfo uses id as subjectId", () => {
    const profile = mapFacebookUserInfo({
      id: "102233445566778",
      name: "Alice Dupont",
      email: "alice@example.com",
    });
    assert.equal(profile.platform, "facebook");
    assert.equal(profile.subjectId, "102233445566778");
    assert.equal(profile.displayName, "Alice Dupont");
  });

  it("mapFacebookUserInfo falls back to email then id", () => {
    assert.equal(
      mapFacebookUserInfo({ id: "99", email: "a@b.c" }).displayName,
      "a@b.c"
    );
    assert.equal(mapFacebookUserInfo({ id: "99" }).displayName, "99");
  });
});
