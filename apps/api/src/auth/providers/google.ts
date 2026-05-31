import { config } from "../../config.js";
import { mapGoogleUserInfo, type GoogleUserInfo } from "../google-profile.js";
import type { OAuthProvider } from "./types.js";

const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_USERINFO_URL =
  "https://openidconnect.googleapis.com/v1/userinfo";
const GOOGLE_SCOPES = "openid email profile";

export class GoogleOAuthProvider implements OAuthProvider {
  readonly platform = "google" as const;

  getAuthorizationUrl(state: string, _codeVerifier?: string): string {
    const params = new URLSearchParams({
      client_id: config.oauthGoogleClientId,
      redirect_uri: config.oauthGoogleRedirectUri,
      response_type: "code",
      scope: GOOGLE_SCOPES,
      state,
      access_type: "online",
      prompt: "select_account",
    });
    return `${GOOGLE_AUTH_URL}?${params.toString()}`;
  }

  async exchangeCode(code: string, _codeVerifier?: string): Promise<{ accessToken: string }> {
    const res = await fetch(GOOGLE_TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: config.oauthGoogleClientId,
        client_secret: config.oauthGoogleClientSecret,
        redirect_uri: config.oauthGoogleRedirectUri,
        grant_type: "authorization_code",
      }),
    });
    const body = (await res.json()) as {
      access_token?: string;
      error?: string;
      error_description?: string;
    };
    if (!res.ok || !body.access_token) {
      throw new Error(
        body.error_description || body.error || "Google token exchange failed"
      );
    }
    return { accessToken: body.access_token };
  }

  async fetchProfile(accessToken: string) {
    const res = await fetch(GOOGLE_USERINFO_URL, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) {
      throw new Error("Google userinfo request failed");
    }
    const data = (await res.json()) as GoogleUserInfo;
    if (!data.sub) {
      throw new Error("Google profile missing sub");
    }
    return mapGoogleUserInfo(data);
  }
}
