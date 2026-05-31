import { createHash, randomBytes } from "node:crypto";

/** Génère un code_verifier PKCE (43–128 caractères, RFC 7636). */
export function generateCodeVerifier(): string {
  return randomBytes(32).toString("base64url");
}

/** code_challenge = BASE64URL(SHA256(code_verifier)), method S256. */
export function generateCodeChallenge(codeVerifier: string): string {
  return createHash("sha256").update(codeVerifier).digest("base64url");
}
