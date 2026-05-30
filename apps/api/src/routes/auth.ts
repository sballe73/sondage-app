import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { PLATFORMS } from "@sondage/shared";
import { getPollById } from "@sondage/db";
import { mockOAuthLogin, issueVoterToken } from "../auth/oauth.js";
import { AppError } from "../errors.js";

export async function authRoutes(app: FastifyInstance) {
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
