import { describe, it, before } from "node:test";
import assert from "node:assert/strict";
import {
  assertTokenMatchesPoll,
  issueVoterToken,
  verifyVoterToken,
} from "./oauth.js";

describe("voter token auth", () => {
  before(() => {
    process.env.JWT_SECRET =
      process.env.JWT_SECRET || "test-jwt-secret-at-least-32-chars!!";
  });

  it("issues platform-scoped tokens without pollId", async () => {
    const token = await issueVoterToken({
      platform: "facebook",
      subjectId: "fb-user-1",
      displayName: "Alice",
    });
    const payload = await verifyVoterToken(token);
    assert.equal(payload.platform, "facebook");
    assert.equal(payload.subjectId, "fb-user-1");
    assert.equal(payload.pollId, undefined);
  });

  it("accepts the same token on a different poll when platform matches", () => {
    const token = {
      platform: "facebook" as const,
      subjectId: "fb-user-1",
      pollId: "716ab019-f9c8-45aa-9d61-3a85ee4dc385",
    };
    assert.doesNotThrow(() =>
      assertTokenMatchesPoll(
        token,
        "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
        "facebook"
      )
    );
  });

  it("rejects token when poll requires a different platform", () => {
    const token = {
      platform: "google" as const,
      subjectId: "google-user-1",
    };
    assert.throws(
      () =>
        assertTokenMatchesPoll(
          token,
          "716ab019-f9c8-45aa-9d61-3a85ee4dc385",
          "facebook"
        ),
      /OAuth provider mismatch/
    );
  });
});
