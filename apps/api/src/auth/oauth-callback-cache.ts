import { createHash } from "node:crypto";
import { getRedis } from "../redis.js";

const RESULT_TTL_SEC = 300;

function resultKey(platform: string, code: string): string {
  const hash = createHash("sha256").update(code).digest("hex").slice(0, 32);
  return `oauth:callback:${platform}:${hash}`;
}

function lockKey(platform: string, code: string): string {
  return `${resultKey(platform, code)}:lock`;
}

export async function getCachedOAuthVoterToken(
  platform: string,
  code: string
): Promise<string | null> {
  return getRedis().get(resultKey(platform, code));
}

export async function cacheOAuthVoterToken(
  platform: string,
  code: string,
  voterToken: string
): Promise<void> {
  await getRedis().set(
    resultKey(platform, code),
    voterToken,
    "EX",
    RESULT_TTL_SEC
  );
}

export async function acquireOAuthCodeLock(
  platform: string,
  code: string
): Promise<boolean> {
  const acquired = await getRedis().set(
    lockKey(platform, code),
    "1",
    "EX",
    60,
    "NX"
  );
  return acquired === "OK";
}

export async function releaseOAuthCodeLock(
  platform: string,
  code: string
): Promise<void> {
  await getRedis().del(lockKey(platform, code));
}

export async function waitForCachedOAuthVoterToken(
  platform: string,
  code: string,
  attempts = 30,
  delayMs = 100
): Promise<string | null> {
  for (let i = 0; i < attempts; i++) {
    const token = await getCachedOAuthVoterToken(platform, code);
    if (token) return token;
    await new Promise((resolve) => setTimeout(resolve, delayMs));
  }
  return null;
}
