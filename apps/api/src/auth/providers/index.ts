import type { Platform } from "@sondage/shared";
import {
  REAL_OAUTH_PLATFORMS,
  isRealOAuthPlatform,
  type RealOAuthPlatform,
} from "@sondage/shared";
import {
  isFacebookOAuthConfigured,
  isGoogleOAuthConfigured,
} from "../../config.js";
import { FacebookOAuthProvider } from "./facebook.js";
import { GoogleOAuthProvider } from "./google.js";
import type { OAuthProvider } from "./types.js";

export { REAL_OAUTH_PLATFORMS, isRealOAuthPlatform };
export type { RealOAuthPlatform };

export function isOAuthPlatformConfigured(
  platform: RealOAuthPlatform
): boolean {
  if (platform === "facebook") return isFacebookOAuthConfigured();
  if (platform === "google") return isGoogleOAuthConfigured();
  return false;
}

export function oauthRequiredEnv(platform: RealOAuthPlatform): string[] {
  if (platform === "facebook") {
    return ["OAUTH_FACEBOOK_APP_ID", "OAUTH_FACEBOOK_APP_SECRET"];
  }
  if (platform === "google") {
    return ["OAUTH_GOOGLE_CLIENT_ID", "OAUTH_GOOGLE_CLIENT_SECRET"];
  }
  return [];
}

export function getOAuthProvider(platform: RealOAuthPlatform): OAuthProvider {
  if (platform === "facebook") {
    if (!isFacebookOAuthConfigured()) {
      throw new Error("Facebook OAuth is not configured");
    }
    return new FacebookOAuthProvider();
  }
  if (platform === "google") {
    if (!isGoogleOAuthConfigured()) {
      throw new Error("Google OAuth is not configured");
    }
    return new GoogleOAuthProvider();
  }
  throw new Error(`Unsupported OAuth platform: ${platform}`);
}
