import type { Platform } from "@sondage/shared";
import {
  isFacebookOAuthConfigured,
  isGoogleOAuthConfigured,
} from "../../config.js";
import { FacebookOAuthProvider } from "./facebook.js";
import { GoogleOAuthProvider } from "./google.js";
import type { OAuthProvider } from "./types.js";

/** Plateformes OAuth réellement implémentées. Meta (facebook) en pilote ; Google quand projet GCP disponible. */
export const REAL_OAUTH_PLATFORMS = ["facebook", "google"] as const;
export type RealOAuthPlatform = (typeof REAL_OAUTH_PLATFORMS)[number];

export const PLANNED_OAUTH_PLATFORMS = ["apple"] as const;

export function isRealOAuthPlatform(
  platform: Platform
): platform is RealOAuthPlatform {
  return REAL_OAUTH_PLATFORMS.includes(platform as RealOAuthPlatform);
}

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
