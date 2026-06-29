import type { OAuthProfile } from "./oauth.js";
import {
  STORED_TEXT_LIMITS,
  sanitizeStoredTextOptional,
} from "@sondage/shared";

/** Réponse Graph API `GET /me?fields=id,name,email`. */
export interface FacebookUserInfo {
  id: string;
  name?: string;
  email?: string;
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

export function mapFacebookUserInfo(data: FacebookUserInfo): OAuthProfile {
  return {
    platform: "facebook",
    subjectId: data.id,
    displayName: oauthDisplayName(
      data.name?.trim() || data.email,
      data.id
    ),
  };
}
