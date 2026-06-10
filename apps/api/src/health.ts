import { config, isFacebookOAuthConfigured, isGoogleOAuthConfigured } from "./config.js";
import { legalPageUrl } from "./meta-constants.js";
import {
  isPlatformUsable,
  listUsablePlatforms,
  isOAuthConfiguredForPlatform,
} from "./platform-gate.js";
import { PLATFORMS, type Platform } from "@sondage/shared";

function platformHealthEntry(platform: Platform) {
  const inList = config.enabledPlatforms.includes(platform);
  const configured =
    platform === "mock" ? inList : isOAuthConfiguredForPlatform(platform);
  return {
    enabled: inList && isPlatformUsable(platform),
    configured,
    listed: inList,
  };
}

export function buildHealthPayload() {
  const oauth: Record<
    string,
    {
      configured: boolean;
      enabled: boolean;
      listed: boolean;
      redirectUri?: string;
      dataDeletionCallbackUrl?: string;
    }
  > = {};

  for (const platform of PLATFORMS) {
    oauth[platform] = platformHealthEntry(platform);
  }

  oauth.facebook.redirectUri = config.oauthFacebookRedirectUri;
  oauth.facebook.dataDeletionCallbackUrl = `${config.publicBaseUrl}/auth/facebook/data-deletion`;
  oauth.google.redirectUri = config.oauthGoogleRedirectUri;

  return {
    status: "ok" as const,
    region: config.defaultDataRegion,
    publicBaseUrl: config.publicBaseUrl,
    enabledPlatforms: config.enabledPlatforms,
    usablePlatforms: listUsablePlatforms(),
    legalUrls: {
      privacy: legalPageUrl(config.publicBaseUrl, "privacy"),
      terms: legalPageUrl(config.publicBaseUrl, "terms"),
      dataDeletion: legalPageUrl(config.publicBaseUrl, "data-deletion"),
    },
    oauth: {
      facebook: {
        ...oauth.facebook,
        configured: isFacebookOAuthConfigured(),
      },
      google: {
        ...oauth.google,
        configured: isGoogleOAuthConfigured(),
      },
      mock: oauth.mock,
      apple: oauth.apple,
      linkedin: oauth.linkedin,
      x: oauth.x,
    },
  };
}
