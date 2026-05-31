import type { Platform } from "@sondage/shared";
import type { OAuthProfile } from "../oauth.js";

export interface OAuthProvider {
  readonly platform: Platform;
  /** true pour X (PKCE obligatoire). */
  readonly requiresPkce?: boolean;
  getAuthorizationUrl(state: string, codeVerifier?: string): string;
  exchangeCode(
    code: string,
    codeVerifier?: string
  ): Promise<{ accessToken: string }>;
  fetchProfile(accessToken: string): Promise<OAuthProfile>;
}
