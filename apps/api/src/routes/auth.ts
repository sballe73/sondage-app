import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { PLATFORMS } from "@sondage/shared";
import { isPerfLogEnabled } from "@sondage/shared";
import { getPollByIdCached, type PollData } from "../poll-cache.js";
import {
  mockOAuthLogin,
  issueVoterToken,
  verifyVoterToken,
  assertTokenMatchesPoll,
} from "../auth/oauth.js";
import { AppError } from "../errors.js";
import { config, isMultiPlatformAuthAllowed } from "../config.js";
import {
  REAL_OAUTH_PLATFORMS,
  getOAuthProvider,
  isOAuthPlatformConfigured,
  isRealOAuthPlatform,
  oauthRequiredEnv,
} from "../auth/providers/index.js";
import { signOAuthState, verifyOAuthState } from "../auth/oauth-state.js";
import { generateCodeVerifier } from "../auth/pkce.js";
import { handleFacebookDataDeletionCallback } from "../auth/facebook-data-deletion.js";
import {
  acquireOAuthCodeLock,
  cacheOAuthVoterToken,
  getCachedOAuthVoterToken,
  releaseOAuthCodeLock,
  waitForCachedOAuthVoterToken,
} from "../auth/oauth-callback-cache.js";
import { assertPlatformUsable } from "../platform-gate.js";
import { purgeUserData } from "../user-data-deletion.js";

const oauthPlatformSchema = z.enum(REAL_OAUTH_PLATFORMS);

function resolveReturnTo(
  returnTo: string | undefined,
  pollId?: string
): string {
  const fallback = pollId
    ? `${config.publicBaseUrl}/embed/vote.html?pollId=${pollId}`
    : `${config.publicBaseUrl}/embed/creator.html`;
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
  const data = await getPollByIdCached(pollId);
  if (!data) {
    throw new AppError(404, "NOT_FOUND", "Poll not found");
  }
  if (
    !isMultiPlatformAuthAllowed() &&
    data.poll.platform !== platform
  ) {
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
  if (!app.hasContentTypeParser("application/x-www-form-urlencoded")) {
    app.addContentTypeParser(
      "application/x-www-form-urlencoded",
      { parseAs: "string" },
      (_req, body, done) => {
        try {
          done(
            null,
            Object.fromEntries(new URLSearchParams(body as string).entries())
          );
        } catch (err) {
          done(err as Error, undefined);
        }
      }
    );
  }

  app.get("/auth/:platform/login", async (request, reply) => {
    const platform = oauthPlatformSchema.parse(
      (request.params as { platform: string }).platform
    );

    assertPlatformUsable(platform);

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
        pollId: z.string().uuid().optional(),
        returnTo: z.string().optional(),
      })
      .parse(request.query);

    if (query.pollId) {
      await assertPollAcceptsPlatform(query.pollId, platform);
    }

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

  app.post("/auth/facebook/data-deletion", async (request, reply) => {
    if (!isOAuthPlatformConfigured("facebook")) {
      throw new AppError(
        503,
        "OAUTH_NOT_CONFIGURED",
        "facebook OAuth is not configured on this server",
        { requiredEnv: oauthRequiredEnv("facebook") }
      );
    }

    const body = z
      .object({
        signed_request: z.string().min(1),
      })
      .parse(request.body ?? {});

    try {
      const result = await handleFacebookDataDeletionCallback(
        body.signed_request
      );
      request.log.info(
        { confirmation_code: result.confirmation_code },
        "Meta data deletion callback received and user data purged"
      );
      return result;
    } catch (e) {
      const message =
        e instanceof Error ? e.message : "Invalid data deletion request";
      throw new AppError(400, "VALIDATION_ERROR", message);
    }
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

    assertPlatformUsable(platform);

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

    if (statePayload.pollId) {
      await assertPollAcceptsPlatform(statePayload.pollId, platform);
    }

    const oauthCode = query.code;
    const cachedToken = await getCachedOAuthVoterToken(platform, oauthCode);
    if (cachedToken) {
      return reply.redirect(redirectWithToken(returnTo, cachedToken, 3600));
    }

    const lockAcquired = await acquireOAuthCodeLock(platform, oauthCode);
    if (!lockAcquired) {
      const waitedToken = await waitForCachedOAuthVoterToken(
        platform,
        oauthCode
      );
      if (waitedToken) {
        return reply.redirect(redirectWithToken(returnTo, waitedToken, 3600));
      }
      return reply.redirect(
        redirectWithOAuthError(
          returnTo,
          "Connexion en cours — réessayez dans quelques secondes."
        )
      );
    }

    try {
      const provider = getOAuthProvider(platform);
      const { accessToken } = await provider.exchangeCode(
        oauthCode,
        statePayload.codeVerifier
      );
      const profile = await provider.fetchProfile(accessToken);

      if (profile.platform !== platform) {
        throw new Error("Profile platform mismatch");
      }

      const voterToken = await issueVoterToken({
        platform: profile.platform,
        subjectId: profile.subjectId,
        displayName: profile.displayName,
      });

      await cacheOAuthVoterToken(platform, oauthCode, voterToken);
      return reply.redirect(redirectWithToken(returnTo, voterToken, 3600));
    } catch (e) {
      const message =
        e instanceof Error ? e.message : "OAuth login failed";
      return reply.redirect(redirectWithOAuthError(returnTo, message));
    } finally {
      await releaseOAuthCodeLock(platform, oauthCode);
    }
  });

  app.post("/auth/mock/login", async (request, reply) => {
    const t0 = performance.now();
    const body = z
      .object({
        pollId: z.string().uuid().optional(),
        platform: z.enum(PLATFORMS),
        subjectId: z.string().min(1),
        displayName: z.string().optional(),
      })
      .parse(request.body);

    assertPlatformUsable(body.platform);

    let dbPollMs = 0;
    if (body.pollId) {
      const data = await getPollByIdCached(body.pollId);
      dbPollMs = Math.round(performance.now() - t0);
      if (!data) {
        throw new AppError(404, "NOT_FOUND", "Poll not found");
      }

      if (
        !isMultiPlatformAuthAllowed() &&
        body.platform !== data.poll.platform
      ) {
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
    }

    if (
      isRealOAuthPlatform(body.platform) &&
      !isMultiPlatformAuthAllowed()
    ) {
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
      platform: profile.platform,
      subjectId: profile.subjectId,
      displayName: profile.displayName,
    });

    if (isPerfLogEnabled()) {
      request.log.info({
        event: "perf_mock_login",
        pollId: body.pollId ?? null,
        db_poll_ms: dbPollMs,
        total_ms: Math.round(performance.now() - t0),
      });
    }

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
    try {
      const payload = await verifyVoterToken(auth.slice(7));
      return { session: payload };
    } catch {
      throw new AppError(401, "UNAUTHORIZED", "Invalid token");
    }
  });

  app.post("/auth/me/delete-data", async (request, reply) => {
    const auth = request.headers.authorization;
    if (!auth?.startsWith("Bearer ")) {
      throw new AppError(401, "UNAUTHORIZED", "Missing bearer token");
    }

    let token;
    try {
      token = await verifyVoterToken(auth.slice(7));
    } catch {
      throw new AppError(401, "UNAUTHORIZED", "Invalid token");
    }

    assertPlatformUsable(token.platform);

    const result = await purgeUserData(token.platform, token.subjectId);

    return reply.status(200).send({
      status: "deleted",
      message:
        "Votre droit de vote a été supprimé. Les totaux agrégés anonymes sont conservés.",
      pollsAffected: result.pollsAffected,
      platform: result.platform,
    });
  });
}

export async function requireVoterAuth(
  pollId: string,
  authorization: string | undefined,
  pollData?: PollData | null
) {
  if (!authorization?.startsWith("Bearer ")) {
    throw new AppError(401, "UNAUTHORIZED", "Unauthorized");
  }
  let token;
  try {
    token = await verifyVoterToken(authorization.slice(7));
  } catch {
    throw new AppError(401, "UNAUTHORIZED", "Invalid token");
  }
  const data = pollData ?? (await getPollByIdCached(pollId));
  if (!data) {
    throw new AppError(404, "NOT_FOUND", "Poll not found");
  }
  try {
    assertPlatformUsable(token.platform);
  } catch (e) {
    if (e instanceof AppError) throw e;
    throw new AppError(
      403,
      "PLATFORM_NOT_ENABLED",
      `Platform ${token.platform} is not enabled on this instance`
    );
  }
  if (!isMultiPlatformAuthAllowed()) {
    try {
      assertTokenMatchesPoll(
        token,
        pollId,
        data.poll.platform as typeof token.platform
      );
    } catch (e) {
      const message = (e as Error).message;
      if (message.includes("OAuth provider mismatch")) {
        throw new AppError(403, "PLATFORM_MISMATCH", message, {
          requiredPlatform: data.poll.platform,
        });
      }
      throw new AppError(403, "FORBIDDEN", message);
    }
  }
  return { token, poll: data.poll, items: data.items };
}

export async function requirePlatformAuth(
  platform: (typeof PLATFORMS)[number],
  authorization: string | undefined
) {
  if (!authorization?.startsWith("Bearer ")) {
    throw new AppError(401, "UNAUTHORIZED", "Unauthorized");
  }
  let token;
  try {
    token = await verifyVoterToken(authorization.slice(7));
  } catch {
    throw new AppError(401, "UNAUTHORIZED", "Invalid token");
  }
  if (token.platform !== platform) {
    throw new AppError(403, "PLATFORM_MISMATCH", "Platform mismatch", {
      requiredPlatform: platform,
    });
  }
  return token;
}

export async function requirePollCreatorAuth(
  pollId: string,
  authorization: string | undefined
) {
  if (!authorization?.startsWith("Bearer ")) {
    throw new AppError(401, "UNAUTHORIZED", "Unauthorized");
  }
  let token;
  try {
    token = await verifyVoterToken(authorization.slice(7));
  } catch {
    throw new AppError(401, "UNAUTHORIZED", "Invalid token");
  }
  const data = await getPollByIdCached(pollId);
  if (!data) {
    throw new AppError(404, "NOT_FOUND", "Poll not found");
  }
  const poll = data.poll;
  if (
    !isMultiPlatformAuthAllowed() &&
    token.platform !== poll.platform
  ) {
    throw new AppError(403, "PLATFORM_MISMATCH", "Platform mismatch", {
      requiredPlatform: poll.platform,
    });
  }
  if (token.subjectId !== poll.creatorId) {
    throw new AppError(403, "FORBIDDEN", "Not poll creator");
  }
  return { token, poll, items: data.items };
}
