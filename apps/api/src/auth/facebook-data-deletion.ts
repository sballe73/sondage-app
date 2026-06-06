import { randomBytes } from "node:crypto";
import { config } from "../config.js";
import { parseFacebookSignedRequest } from "./facebook-signed-request.js";

export function buildFacebookDataDeletionResponse(facebookUserId: string) {
  const confirmationCode = randomBytes(12).toString("hex");
  const statusBase =
    config.metaDataDeletionStatusUrl ??
    "https://sballe73.github.io/sondage-app/legal/data-deletion.html";
  const url = new URL(statusBase);
  url.searchParams.set("confirmation_code", confirmationCode);
  url.searchParams.set("facebook_user_id", facebookUserId);

  return {
    url: url.toString(),
    confirmation_code: confirmationCode,
  };
}

export function handleFacebookDataDeletionCallback(signedRequest: string) {
  if (!config.oauthFacebookAppSecret) {
    throw new Error("Facebook OAuth is not configured");
  }

  const payload = parseFacebookSignedRequest(
    signedRequest,
    config.oauthFacebookAppSecret
  );

  return buildFacebookDataDeletionResponse(payload.user_id!);
}
