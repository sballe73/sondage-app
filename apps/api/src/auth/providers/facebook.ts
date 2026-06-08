import { config } from "../../config.js";
import { mapFacebookUserInfo, type FacebookUserInfo } from "../facebook-profile.js";
import type { OAuthProvider } from "./types.js";

const FB_GRAPH_VERSION = "v21.0";
const FB_DIALOG_URL = `https://www.facebook.com/${FB_GRAPH_VERSION}/dialog/oauth`;
const FB_GRAPH_URL = `https://graph.facebook.com/${FB_GRAPH_VERSION}`;
/** Pilote Meta : public_profile seul (id + nom). Pas d’email (accès Avancé / Business). */
const FB_SCOPES = "public_profile";

export class FacebookOAuthProvider implements OAuthProvider {
  readonly platform = "facebook" as const;

  getAuthorizationUrl(state: string): string {
    const params = new URLSearchParams({
      client_id: config.oauthFacebookAppId,
      redirect_uri: config.oauthFacebookRedirectUri,
      state,
      scope: FB_SCOPES,
      response_type: "code",
    });
    return `${FB_DIALOG_URL}?${params.toString()}`;
  }

  async exchangeCode(code: string): Promise<{ accessToken: string }> {
    const params = new URLSearchParams({
      client_id: config.oauthFacebookAppId,
      client_secret: config.oauthFacebookAppSecret,
      redirect_uri: config.oauthFacebookRedirectUri,
      code,
    });
    const res = await fetch(`${FB_GRAPH_URL}/oauth/access_token?${params}`);
    const body = (await res.json()) as {
      access_token?: string;
      error?: { message?: string; type?: string; code?: number };
    };
    if (!res.ok || !body.access_token) {
      const msg =
        body.error?.message || "Facebook token exchange failed";
      throw new Error(msg);
    }
    return { accessToken: body.access_token };
  }

  async fetchProfile(accessToken: string) {
    const params = new URLSearchParams({
      fields: "id,name",
      access_token: accessToken,
    });
    const res = await fetch(`${FB_GRAPH_URL}/me?${params}`);
    if (!res.ok) {
      throw new Error("Facebook Graph /me request failed");
    }
    const data = (await res.json()) as FacebookUserInfo & {
      error?: { message?: string };
    };
    if (data.error) {
      throw new Error(data.error.message || "Facebook profile error");
    }
    if (!data.id) {
      throw new Error("Facebook profile missing id");
    }
    return mapFacebookUserInfo(data);
  }
}
