import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { PLATFORMS } from "@sondage/shared";
import { getPollById } from "@sondage/db";
import { mockOAuthLogin, issueVoterToken } from "../auth/oauth.js";

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
    if (!data) return reply.status(404).send({ error: "Poll not found" });

    if (body.platform !== data.poll.platform) {
      return reply.status(403).send({
        error: "Platform mismatch",
        message: `This poll only accepts votes via ${data.poll.platform}`,
        requiredPlatform: data.poll.platform,
      });
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
      return reply.status(401).send({ error: "Missing bearer token" });
    }
    const { verifyVoterToken } = await import("../auth/oauth.js");
    try {
      const payload = await verifyVoterToken(auth.slice(7));
      return { session: payload };
    } catch {
      return reply.status(401).send({ error: "Invalid token" });
    }
  });
}

export async function requireVoterAuth(
  pollId: string,
  authorization: string | undefined
) {
  if (!authorization?.startsWith("Bearer ")) {
    throw Object.assign(new Error("Unauthorized"), { statusCode: 401 });
  }
  const { verifyVoterToken, assertTokenMatchesPoll } = await import(
    "../auth/oauth.js"
  );
  const token = await verifyVoterToken(authorization.slice(7));
  const data = await getPollById(pollId);
  if (!data) {
    throw Object.assign(new Error("Poll not found"), { statusCode: 404 });
  }
  assertTokenMatchesPoll(token, pollId, data.poll.platform as typeof token.platform);
  return { token, poll: data.poll, items: data.items };
}
