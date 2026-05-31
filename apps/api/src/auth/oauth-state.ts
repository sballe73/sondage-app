import type { Platform } from "@sondage/shared";
import { SignJWT, jwtVerify } from "jose";
import { config } from "../config.js";

const encoder = new TextEncoder();
const secret = () => encoder.encode(config.jwtSecret);

export interface OAuthStatePayload {
  pollId: string;
  returnTo: string;
  platform: Platform;
  /** PKCE — requis pour X, stocké dans le state signé (TTL 10 min). */
  codeVerifier?: string;
}

export async function signOAuthState(
  payload: OAuthStatePayload
): Promise<string> {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("10m")
    .sign(secret());
}

export async function verifyOAuthState(
  token: string
): Promise<OAuthStatePayload> {
  const { payload } = await jwtVerify(token, secret());
  const pollId = payload.pollId as string;
  const returnTo = payload.returnTo as string;
  const platform = payload.platform as Platform;
  const codeVerifier = payload.codeVerifier as string | undefined;
  if (!pollId || !returnTo || !platform) {
    throw new Error("Invalid OAuth state");
  }
  return { pollId, returnTo, platform, codeVerifier };
}
