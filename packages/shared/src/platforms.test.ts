import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  parseEnabledPlatforms,
  assertPlatformEnabled,
  isPlatformInEnabledList,
} from "./platforms.js";
import { PLATFORMS } from "./types.js";

describe("parseEnabledPlatforms", () => {
  it("defaults to all platforms when unset", () => {
    assert.deepEqual(parseEnabledPlatforms(undefined), [...PLATFORMS]);
    assert.deepEqual(parseEnabledPlatforms(""), [...PLATFORMS]);
    assert.deepEqual(parseEnabledPlatforms("   "), [...PLATFORMS]);
  });

  it("parses CSV list", () => {
    assert.deepEqual(parseEnabledPlatforms("facebook,mock"), [
      "facebook",
      "mock",
    ]);
    assert.deepEqual(parseEnabledPlatforms(" google , facebook "), [
      "google",
      "facebook",
    ]);
  });

  it("rejects unknown platform", () => {
    assert.throws(
      () => parseEnabledPlatforms("facebook,unknown"),
      /Invalid platform in ENABLED_PLATFORMS/
    );
  });

  it("rejects empty explicit list", () => {
    assert.throws(
      () => parseEnabledPlatforms(","),
      /must not be empty/
    );
  });
});

describe("assertPlatformEnabled", () => {
  it("passes when platform is in list", () => {
    assert.doesNotThrow(() =>
      assertPlatformEnabled("facebook", ["facebook", "mock"])
    );
  });

  it("throws when platform is not enabled", () => {
    assert.throws(
      () => assertPlatformEnabled("google", ["facebook"]),
      /Platform not enabled/
    );
  });

  it("isPlatformInEnabledList works", () => {
    assert.equal(isPlatformInEnabledList("mock", ["mock"]), true);
    assert.equal(isPlatformInEnabledList("x", ["mock"]), false);
  });
});
