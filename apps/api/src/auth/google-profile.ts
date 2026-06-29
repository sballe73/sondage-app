import type { OAuthProfile } from "./oauth.js";
import {
  STORED_TEXT_LIMITS,
  sanitizeStoredTextOptional,
} from "@sondage/shared";

/** Réponse OpenID userinfo Google (https://openidconnect.googleapis.com/v1/userinfo). */
export interface GoogleUserInfo {
  sub: string;
  name?: string;
  email?: string;
  picture?: string;
}

function oauthDisplayName(
  primary: string | undefined,
  fallback: string
): string {
  return (
    sanitizeStoredTextOptional(primary, STORED_TEXT_LIMITS.displayName) ??
    sanitizeStoredTextOptional(fallback, STORED_TEXT_LIMITS.displayName) ??
    fallback
  );
}

export function mapGoogleUserInfo(data: GoogleUserInfo): OAuthProfile {
  return {
    platform: "google",
    subjectId: data.sub,
    displayName: oauthDisplayName(
      data.name?.trim() || data.email,
      data.sub
    ),
  };
}
