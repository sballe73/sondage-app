import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { PLATFORMS } from "@sondage/shared";
import { getPollById } from "@sondage/db";
import { mockOAuthLogin, issueVoterToken } from "../auth/oauth.js";
import { AppError } from "../errors.js";
import { config } from "../config.js";
import {
  REAL_OAUTH_PLATFORMS,
  getOAuthProvider,
  isOAuthPlatformConfigured,
  isRealOAuthPlatform,
  oauthRequiredEnv,
} from "../auth/providers/index.js";
import { signOAuthState, verifyOAuthState } from "../auth/oauth-state.js";
import { generateCodeVerifier } from "../auth/pkce.js";

const oauthPlatformSchema = z.enum(REAL_OAUTH_PLATFORMS);

function resolveReturnTo(
  returnTo: string | undefined,
  pollId: string
): string {
  const fallback = `${config.publicBaseUrl}/embed/demo.html?pollId=${pollId}`;
  if (!returnTo) return fallback;

  let url: URL;
  try {
    url = new URL(returnTo);
  } catch {
    throw new AppError(400, "VALIDATION_ERROR", "Invalid returnTo URL");
  }

  const base = new URL(config.publicBaseUrl);
  if (url.origin !== base.origin) {
    throw new AppError(400, "VALIDATION_ERROR", "returnTo must match API origin", {
      allowedOrigin: base.origin,
    });
  }
  if (!url.pathname.startsWith("/embed/")) {
    throw new AppError(
      400,
      "VALIDATION_ERROR",
      "returnTo must be an /embed/ page"
    );
  }
  return url.toString();
}

function redirectWithOAuthError(returnTo: string, message: string) {
  const url = new URL(returnTo);
  url.hash = new URLSearchParams({
    oauth_error: message,
  }).toString();
  return url.toString();
}

function redirectWithToken(
  returnTo: string,
  accessToken: string,
  expiresIn: number
) {
  const url = new URL(returnTo);
  url.hash = new URLSearchParams({
    access_token: accessToken,
    token_type: "Bearer",
    expires_in: String(expiresIn),
  }).toString();
  return url.toString();
}

async function assertPollAcceptsPlatform(
  pollId: string,
  platform: (typeof PLATFORMS)[number]
) {
  const data = await getPollById(pollId);
  if (!data) {
    throw new AppError(404, "NOT_FOUND", "Poll not found");
  }
  if (data.poll.platform !== platform) {
    throw new AppError(
      403,
      "PLATFORM_MISMATCH",
      "Platform mismatch",
      {
        requiredPlatform: data.poll.platform,
        message: `This poll only accepts votes via ${data.poll.platform}`,
      }
    );
  }
  return data;
}

export async function authRoutes(app: FastifyInstance) {
  app.get("/auth/:platform/login", async (request, reply) => {
    const platform = oauthPlatformSchema.parse(
      (request.params as { platform: string }).platform
    );

    if (!isOAuthPlatformConfigured(platform)) {
      throw new AppError(
        503,
        "OAUTH_NOT_CONFIGURED",
        `${platform} OAuth is not configured on this server`,
        { requiredEnv: oauthRequiredEnv(platform) }
      );
    }

    const query = z
      .object({
        pollId: z.string().uuid(),
        returnTo: z.string().optional(),
      })
      .parse(request.query);

    await assertPollAcceptsPlatform(query.pollId, platform);

    const returnTo = resolveReturnTo(query.returnTo, query.pollId);
    const provider = getOAuthProvider(platform);
    const codeVerifier = provider.requiresPkce
      ? generateCodeVerifier()
      : undefined;
    const state = await signOAuthState({
      pollId: query.pollId,
      returnTo,
      platform,
      codeVerifier,
    });

    return reply.redirect(provider.getAuthorizationUrl(state, codeVerifier));
  });

  app.get("/auth/:platform/callback", async (request, reply) => {
    const platform = oauthPlatformSchema.parse(
      (request.params as { platform: string }).platform
    );

    const query = z
      .object({
        code: z.string().optional(),
        state: z.string().optional(),
        error: z.string().optional(),
        error_description: z.string().optional(),
      })
      .parse(request.query);

    if (!query.state) {
      throw new AppError(400, "VALIDATION_ERROR", "Missing OAuth state");
    }

    let statePayload;
    try {
      statePayload = await verifyOAuthState(query.state);
    } catch {
      throw new AppError(400, "VALIDATION_ERROR", "Invalid or expired OAuth state");
    }

    if (statePayload.platform !== platform) {
      throw new AppError(403, "FORBIDDEN", "OAuth state platform mismatch");
    }

    const returnTo = statePayload.returnTo;

    if (query.error) {
      const message =
        query.error_description || query.error || "OAuth authorization denied";
      return reply.redirect(redirectWithOAuthError(returnTo, message));
    }

    if (!query.code) {
      return reply.redirect(
        redirectWithOAuthError(returnTo, "Missing authorization code")
      );
    }

    await assertPollAcceptsPlatform(statePayload.pollId, platform);

    try {
      const provider = getOAuthProvider(platform);
      const { accessToken } = await provider.exchangeCode(
        query.code,
        statePayload.codeVerifier
      );
      const profile = await provider.fetchProfile(accessToken);

      if (profile.platform !== platform) {
        throw new Error("Profile platform mismatch");
      }

      const voterToken = await issueVoterToken({
        pollId: statePayload.pollId,
        platform: profile.platform,
        subjectId: profile.subjectId,
        displayName: profile.displayName,
      });

      return reply.redirect(redirectWithToken(returnTo, voterToken, 3600));
    } catch (e) {
      const message =
        e instanceof Error ? e.message : "OAuth login failed";
      return reply.redirect(redirectWithOAuthError(returnTo, message));
    }
  });

  app.post("/auth/mock/login", async (request, reply) => {
    const body = z
      .object({
        pollId: z.string().uuid(),
        platform: z.enum(PLATFORMS),
        subjectId: z.string().min(1),
        displayName: z.string().optional(),
      })
      .parse(request.body);

    const data = await getPollById(body.pollId);
    if (!data) {
      throw new AppError(404, "NOT_FOUND", "Poll not found");
    }

    if (body.platform !== data.poll.platform) {
      throw new AppError(
        403,
        "PLATFORM_MISMATCH",
        "Platform mismatch",
        {
          requiredPlatform: data.poll.platform,
          message: `This poll only accepts votes via ${data.poll.platform}`,
        }
      );
    }

    if (isRealOAuthPlatform(body.platform)) {
      throw new AppError(
        400,
        "VALIDATION_ERROR",
        `Use GET /auth/${body.platform}/login for real OAuth`
      );
    }

    const profile = await mockOAuthLogin(
      body.platform,
      body.subjectId,
      body.displayName
    );

    const token = await issueVoterToken({
      pollId: body.pollId,
      platform: profile.platform,
      subjectId: profile.subjectId,
      displayName: profile.displayName,
    });

    return {
      accessToken: token,
      tokenType: "Bearer",
      expiresIn: 3600,
      platform: profile.platform,
    };
  });

  app.get("/auth/session", async (request, reply) => {
    const auth = request.headers.authorization;
    if (!auth?.startsWith("Bearer ")) {
      throw new AppError(401, "UNAUTHORIZED", "Missing bearer token");
    }
    const { verifyVoterToken } = await import("../auth/oauth.js");
    try {
      const payload = await verifyVoterToken(auth.slice(7));
      return { session: payload };
    } catch {
      throw new AppError(401, "UNAUTHORIZED", "Invalid token");
    }
  });
}

export async function requireVoterAuth(
  pollId: string,
  authorization: string | undefined
) {
  if (!authorization?.startsWith("Bearer ")) {
    throw new AppError(401, "UNAUTHORIZED", "Unauthorized");
  }
  const { verifyVoterToken, assertTokenMatchesPoll } = await import(
    "../auth/oauth.js"
  );
  let token;
  try {
    token = await verifyVoterToken(authorization.slice(7));
  } catch {
    throw new AppError(401, "UNAUTHORIZED", "Invalid token");
  }
  const data = await getPollById(pollId);
  if (!data) {
    throw new AppError(404, "NOT_FOUND", "Poll not found");
  }
  try {
    assertTokenMatchesPoll(token, pollId, data.poll.platform as typeof token.platform);
  } catch (e) {
    const message = (e as Error).message;
    if (message.includes("OAuth provider mismatch")) {
      throw new AppError(403, "PLATFORM_MISMATCH", message, {
        requiredPlatform: data.poll.platform,
      });
    }
    throw new AppError(403, "FORBIDDEN", message);
  }
  return { token, poll: data.poll, items: data.items };
}
