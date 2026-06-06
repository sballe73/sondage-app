import { createHmac, timingSafeEqual } from "node:crypto";

export type FacebookSignedRequestPayload = {
  algorithm?: string;
  issued_at?: number;
  user_id?: string;
};

function base64UrlDecode(input: string): Buffer {
  const normalized = input.replace(/-/g, "+").replace(/_/g, "/");
  const pad = normalized.length % 4 === 0 ? "" : "=".repeat(4 - (normalized.length % 4));
  return Buffer.from(normalized + pad, "base64");
}

export function parseFacebookSignedRequest(
  signedRequest: string,
  appSecret: string
): FacebookSignedRequestPayload {
  const parts = signedRequest.split(".", 2);
  if (parts.length !== 2) {
    throw new Error("Invalid signed_request format");
  }

  const [encodedSig, payload] = parts;
  const sig = base64UrlDecode(encodedSig);
  const expectedSig = createHmac("sha256", appSecret).update(payload).digest();

  if (sig.length !== expectedSig.length || !timingSafeEqual(sig, expectedSig)) {
    throw new Error("Invalid signed_request signature");
  }

  const data = JSON.parse(
    base64UrlDecode(payload).toString("utf8")
  ) as FacebookSignedRequestPayload;

  if (data.algorithm?.toUpperCase() !== "HMAC-SHA256") {
    throw new Error("Unsupported signed_request algorithm");
  }
  if (!data.user_id) {
    throw new Error("signed_request missing user_id");
  }

  return data;
}
