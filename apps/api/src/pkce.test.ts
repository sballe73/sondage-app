import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  generateCodeChallenge,
  generateCodeVerifier,
} from "./auth/pkce.js";

describe("PKCE", () => {
  it("generateCodeVerifier produces url-safe string", () => {
    const v = generateCodeVerifier();
    assert.ok(v.length >= 43);
    assert.match(v, /^[A-Za-z0-9_-]+$/);
  });

  it("generateCodeChallenge is deterministic S256", () => {
    const v = "test-verifier-fixed-value-1234567890abcdef";
    const c1 = generateCodeChallenge(v);
    const c2 = generateCodeChallenge(v);
    assert.equal(c1, c2);
    assert.match(c1, /^[A-Za-z0-9_-]+$/);
  });

  it("different verifiers produce different challenges", () => {
    assert.notEqual(
      generateCodeChallenge(generateCodeVerifier()),
      generateCodeChallenge(generateCodeVerifier())
    );
  });
});
