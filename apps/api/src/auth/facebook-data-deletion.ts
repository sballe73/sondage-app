import { randomBytes } from "node:crypto";
import type { Platform } from "@sondage/shared";
import { config } from "../config.js";
import { legalPageUrl } from "../meta-constants.js";
import { parseFacebookSignedRequest } from "./facebook-signed-request.js";
import { purgeUserData } from "../user-data-deletion.js";

export function buildFacebookDataDeletionResponse(facebookUserId: string) {
  const confirmationCode = randomBytes(12).toString("hex");
  const statusBase =
    config.metaDataDeletionStatusUrl ??
    legalPageUrl(config.publicBaseUrl, "data-deletion");
  const url = new URL(statusBase);
  url.searchParams.set("confirmation_code", confirmationCode);
  url.searchParams.set("facebook_user_id", facebookUserId);

  return {
    url: url.toString(),
    confirmation_code: confirmationCode,
  };
}

export async function handleFacebookDataDeletionCallback(
  signedRequest: string
) {
  if (!config.oauthFacebookAppSecret) {
    throw new Error("Facebook OAuth is not configured");
  }

  const payload = parseFacebookSignedRequest(
    signedRequest,
    config.oauthFacebookAppSecret
  );

  const userId = payload.user_id!;
  await purgeUserData("facebook" as Platform, userId);

  return buildFacebookDataDeletionResponse(userId);
}
