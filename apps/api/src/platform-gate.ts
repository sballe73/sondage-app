import type { Platform } from "@sondage/shared";
import {
  assertPlatformEnabled,
  isRealOAuthPlatform,
} from "@sondage/shared";
import { config } from "./config.js";
import {
  isFacebookOAuthConfigured,
  isGoogleOAuthConfigured,
} from "./config.js";
import { AppError } from "./errors.js";

export function isOAuthConfiguredForPlatform(platform: Platform): boolean {
  if (platform === "facebook") return isFacebookOAuthConfigured();
  if (platform === "google") return isGoogleOAuthConfigured();
  return false;
}

/** Plateforme listée dans ENABLED_PLATFORMS et opérationnelle sur l'instance. */
export function isPlatformUsable(platform: Platform): boolean {
  if (!config.enabledPlatforms.includes(platform)) return false;
  if (platform === "mock") return config.mockOAuthEnabled;
  if (isRealOAuthPlatform(platform)) {
    return isOAuthConfiguredForPlatform(platform);
  }
  return false;
}

export function assertPlatformUsable(platform: Platform): void {
  try {
    assertPlatformEnabled(platform, config.enabledPlatforms);
  } catch {
    throw new AppError(
      403,
      "PLATFORM_NOT_ENABLED",
      `Platform ${platform} is not enabled on this instance`,
      { platform, enabledPlatforms: config.enabledPlatforms }
    );
  }

  if (platform === "mock" && !config.mockOAuthEnabled) {
    throw new AppError(
      403,
      "PLATFORM_NOT_ENABLED",
      "Mock OAuth is disabled on this server",
      { platform: "mock" }
    );
  }

  if (isRealOAuthPlatform(platform) && !isOAuthConfiguredForPlatform(platform)) {
    throw new AppError(
      503,
      "OAUTH_NOT_CONFIGURED",
      `${platform} OAuth is not configured on this server`,
      { platform }
    );
  }
}

export function listUsablePlatforms(): Platform[] {
  return config.enabledPlatforms.filter((p) => isPlatformUsable(p));
}
