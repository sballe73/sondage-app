import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { z } from "zod";
import {
  AppError,
  formatZodDetails,
  isAppError,
  toErrorBody,
} from "./errors.js";

describe("API errors", () => {
  it("toErrorBody omits details when undefined", () => {
    assert.deepEqual(toErrorBody(404, "NOT_FOUND", "Poll not found"), {
      error: "Poll not found",
      code: "NOT_FOUND",
    });
  });

  it("toErrorBody includes details when set", () => {
    const body = toErrorBody(451, "REGION_MISMATCH", "Data region mismatch", {
      requiredRegion: "EU",
    });
    assert.equal(body.code, "REGION_MISMATCH");
    assert.deepEqual(body.details, { requiredRegion: "EU" });
  });

  it("formatZodDetails maps field paths", () => {
    const result = z.object({ pollId: z.string().uuid() }).safeParse({ pollId: "x" });
    assert.equal(result.success, false);
    if (!result.success) {
      const details = formatZodDetails(result.error);
      assert.equal(details[0]?.path, "pollId");
    }
  });

  it("AppError carries status and code", () => {
    const err = new AppError(409, "ALREADY_VOTED", "Already voted");
    assert.equal(isAppError(err), true);
    assert.equal(err.statusCode, 409);
    assert.equal(err.code, "ALREADY_VOTED");
  });
});
