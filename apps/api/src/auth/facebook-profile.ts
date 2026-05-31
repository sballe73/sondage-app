import type { OAuthProfile } from "./oauth.js";

/** Réponse Graph API `GET /me?fields=id,name,email`. */
export interface FacebookUserInfo {
  id: string;
  name?: string;
  email?: string;
}

export function mapFacebookUserInfo(data: FacebookUserInfo): OAuthProfile {
  return {
    platform: "facebook",
    subjectId: data.id,
    displayName: data.name?.trim() || data.email || data.id,
  };
}
