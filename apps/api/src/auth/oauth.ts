import type { Platform, VoterJwtPayload } from "@sondage/shared";
import { SignJWT, jwtVerify } from "jose";
import { config } from "../config.js";

const encoder = new TextEncoder();
const secret = () => encoder.encode(config.jwtSecret);

export interface OAuthProfile {
  platform: Platform;
  subjectId: string;
  displayName?: string;
}

/** Mock OAuth for development — simulates platform login. */
export async function mockOAuthLogin(
  platform: Platform,
  subjectId: string,
  displayName?: string
): Promise<OAuthProfile> {
  if (!config.mockOAuthEnabled && platform === "mock") {
    throw new Error("Mock OAuth disabled");
  }
  return { platform, subjectId, displayName };
}

export async function issueVoterToken(
  payload: VoterJwtPayload,
  expiresIn = "1h"
): Promise<string> {
  const claims: Record<string, string> = {
    sub: payload.subjectId,
    platform: payload.platform,
  };
  if (payload.pollId) claims.pollId = payload.pollId;
  if (payload.displayName) claims.displayName = payload.displayName;

  return new SignJWT(claims)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setIssuer(config.jwtIssuer)
    .setAudience(config.jwtAudience)
    .setExpirationTime(expiresIn)
    .sign(secret());
}

export async function verifyVoterToken(
  token: string
): Promise<VoterJwtPayload> {
  const { payload } = await jwtVerify(token, secret(), {
    issuer: config.jwtIssuer,
    audience: config.jwtAudience,
  });
  const pollId = payload.pollId as string | undefined;
  const platform = payload.platform as Platform;
  const subjectId = payload.sub as string;
  const displayName = payload.displayName as string | undefined;
  if (!platform || !subjectId) {
    throw new Error("Invalid token payload");
  }
  return { pollId, platform, subjectId, displayName };
}

export function assertTokenMatchesPoll(
  token: VoterJwtPayload,
  _pollId: string,
  pollPlatform: Platform
): void {
  if (token.platform !== pollPlatform) {
    throw new Error(
      `OAuth provider mismatch: poll requires ${pollPlatform}`
    );
  }
}

/** Stub: verify group membership via platform API (cached in production). */
export async function verifyGroupMembership(
  platform: Platform,
  groupId: string,
  subjectId: string
): Promise<boolean> {
  if (platform === "mock") {
    return subjectId.startsWith("member-");
  }
  // Real integrations would call Facebook Graph API, X API, etc.
  return false;
}
