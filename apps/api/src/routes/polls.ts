import type { FastifyInstance } from "fastify";
import { z } from "zod";
import {
  PLATFORMS,
  VISIBILITY_SCOPES,
  VOTER_MODES,
  RESULT_POLICIES,
  DATA_REGIONS,
  DEFAULT_GRADE_LABELS,
  DEFAULT_GRADE_MAX,
  DEFAULT_GRADE_MIN,
  validateCreatePoll,
  normalizeCreatePoll,
} from "@sondage/shared";
import { createPoll, getPollById, listPollsByCreator, createCampaign, getVoteCount } from "@sondage/db";
import { AppError } from "../errors.js";
import { getLiveVoteCount } from "../redis.js";

const createPollSchema = z.object({
  name: z.string().min(1).max(500),
  creatorId: z.string().min(1),
  platform: z.enum(PLATFORMS),
  items: z
    .array(
      z.object({
        label: z.string().min(1),
        sortOrder: z.number().int().optional(),
      })
    )
    .min(1),
  gradeMin: z.number().int().default(DEFAULT_GRADE_MIN),
  gradeMax: z.number().int().default(DEFAULT_GRADE_MAX),
  gradeLabels: z.array(z.string().min(1)).optional(),
  bestGradeIsLowest: z.boolean().default(true),
  startsAt: z.string().datetime(),
  endsAt: z.string().datetime(),
  visibility: z.enum(VISIBILITY_SCOPES),
  groupId: z.string().nullable().optional(),
  voterMode: z.enum(VOTER_MODES),
  resultPolicy: z.enum(RESULT_POLICIES),
  mockSnapshotEveryVote: z.boolean().optional(),
  dataRegion: z.enum(DATA_REGIONS).optional(),
  campaignId: z.string().uuid().nullable().optional(),
});

export async function pollRoutes(app: FastifyInstance) {
  app.post("/campaigns", async (request, reply) => {
    const body = z
      .object({
        name: z.string().min(1),
        creatorId: z.string().min(1),
      })
      .parse(request.body);
    const campaign = await createCampaign(body.name, body.creatorId);
    return reply.status(201).send(campaign);
  });

  app.post("/polls", async (request, reply) => {
    const parsed = createPollSchema.parse(request.body);
    try {
      validateCreatePoll(parsed);
    } catch (e) {
      throw new AppError(400, "INVALID_POLL", (e as Error).message);
    }
    const input = normalizeCreatePoll(parsed);
    const { poll, items } = await createPoll(input);
    return reply.status(201).send({
      ...poll,
      items,
      platformNote:
        "platform is immutable; all voters must authenticate via this platform only",
    });
  });

  app.get("/polls/:pollId", async (request, reply) => {
    const { pollId } = z.object({ pollId: z.string().uuid() }).parse(request.params);
    const data = await getPollById(pollId);
    if (!data) {
      throw new AppError(404, "NOT_FOUND", "Poll not found");
    }
    const dbCount = await getVoteCount(pollId);
    const voteCount = await getLiveVoteCount(pollId, dbCount);
    return {
      ...data.poll,
      items: data.items,
      voteCount,
    };
  });

  app.get("/creators/:creatorId/polls", async (request, reply) => {
    const { creatorId } = z
      .object({ creatorId: z.string() })
      .parse(request.params);
    const list = await listPollsByCreator(creatorId);
    return { polls: list };
  });
}
