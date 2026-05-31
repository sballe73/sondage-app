import type { OAuthProfile } from "./oauth.js";

/** Réponse OpenID userinfo Google (https://openidconnect.googleapis.com/v1/userinfo). */
export interface GoogleUserInfo {
  sub: string;
  name?: string;
  email?: string;
  picture?: string;
}

export function mapGoogleUserInfo(data: GoogleUserInfo): OAuthProfile {
  return {
    platform: "google",
    subjectId: data.sub,
    displayName: data.name?.trim() || data.email || data.sub,
  };
}
