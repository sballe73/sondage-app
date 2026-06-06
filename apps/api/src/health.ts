import { config, isFacebookOAuthConfigured, isGoogleOAuthConfigured } from "./config.js";

export function buildHealthPayload() {
  return {
    status: "ok" as const,
    region: config.defaultDataRegion,
    publicBaseUrl: config.publicBaseUrl,
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
