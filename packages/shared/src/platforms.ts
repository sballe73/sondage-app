import type { Platform } from "./types.js";
import { PLATFORMS } from "./types.js";

/** Parse ENABLED_PLATFORMS CSV. Absent → toutes les plateformes connues. */
export function parseEnabledPlatforms(raw: string | undefined): Platform[] {
  const trimmed = raw?.trim();
  if (!trimmed) {
    return [...PLATFORMS];
  }

  const tokens = trimmed
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);

  if (tokens.length === 0) {
    throw new Error("ENABLED_PLATFORMS must not be empty when set");
  }

  const seen = new Set<Platform>();
  for (const token of tokens) {
    if (!PLATFORMS.includes(token as Platform)) {
      throw new Error(
        `Invalid platform in ENABLED_PLATFORMS: ${token} (allowed: ${PLATFORMS.join(", ")})`
      );
    }
    seen.add(token as Platform);
  }

  return [...seen];
}

export function isPlatformInEnabledList(
  platform: Platform,
  enabledPlatforms: readonly Platform[]
): boolean {
  return enabledPlatforms.includes(platform);
}

export function assertPlatformEnabled(
  platform: Platform,
  enabledPlatforms: readonly Platform[]
): void {
  if (!isPlatformInEnabledList(platform, enabledPlatforms)) {
    throw new Error(`Platform not enabled on this instance: ${platform}`);
  }
}

/** Plateformes OAuth réellement implémentées côté API. */
export const REAL_OAUTH_PLATFORMS = ["facebook", "google"] as const;
export type RealOAuthPlatform = (typeof REAL_OAUTH_PLATFORMS)[number];

export function isRealOAuthPlatform(
  platform: Platform
): platform is RealOAuthPlatform {
  return REAL_OAUTH_PLATFORMS.includes(platform as RealOAuthPlatform);
}

export type { Platform } from "./types.js";
