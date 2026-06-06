import { describe, it } from "node:test";
import assert from "node:assert";
import { createHmac } from "node:crypto";
import { parseFacebookSignedRequest } from "./facebook-signed-request.js";

const secret = "test-app-secret";

function signPayload(payload: object): string {
  const encoded = Buffer.from(JSON.stringify(payload))
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
  const sig = createHmac("sha256", secret)
    .update(encoded)
    .digest("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
  return `${sig}.${encoded}`;
}

describe("parseFacebookSignedRequest", () => {
  it("parses a valid signed_request", () => {
    const signed = signPayload({
      algorithm: "HMAC-SHA256",
      issued_at: 1700000000,
      user_id: "123456789",
    });
    const data = parseFacebookSignedRequest(signed, secret);
    assert.equal(data.user_id, "123456789");
  });

  it("rejects invalid signature", () => {
    const signed = signPayload({ algorithm: "HMAC-SHA256", user_id: "1" });
    assert.throws(
      () => parseFacebookSignedRequest(`${signed}x`, secret),
      /Invalid signed_request signature/
    );
  });
});
