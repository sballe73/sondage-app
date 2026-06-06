import { config, isFacebookOAuthConfigured, isGoogleOAuthConfigured } from "./config.js";
import { legalPageUrl } from "./meta-constants.js";

export function buildHealthPayload() {
  return {
    status: "ok" as const,
    region: config.defaultDataRegion,
    publicBaseUrl: config.publicBaseUrl,
    legalUrls: {
      privacy: legalPageUrl(config.publicBaseUrl, "privacy"),
      terms: legalPageUrl(config.publicBaseUrl, "terms"),
      dataDeletion: legalPageUrl(config.publicBaseUrl, "data-deletion"),
    },
    oauth: {
      facebook: {
        configured: isFacebookOAuthConfigured(),
        redirectUri: config.oauthFacebookRedirectUri,
        dataDeletionCallbackUrl: `${config.publicBaseUrl}/auth/facebook/data-deletion`,
      },
      google: {
        configured: isGoogleOAuthConfigured(),
        redirectUri: config.oauthGoogleRedirectUri,
      },
    },
  };
}
