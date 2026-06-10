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
import {
  createPoll,
  getPollById,
  listPollsByCreator,
  searchPolls,
  createCampaign,
  getVoteCount,
} from "@sondage/db";
import { AppError } from "../errors.js";
import { getLiveVoteCount } from "../redis.js";
import { requirePlatformAuth } from "./auth.js";
import { assertPlatformUsable } from "../platform-gate.js";

const createPollSchema = z.object({
  name: z.string().min(1).max(500),
  creatorId: z.string().min(1).optional(),
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
    assertPlatformUsable(parsed.platform);
    let creatorId = parsed.creatorId;

    if (parsed.platform === "mock") {
      if (!creatorId) {
        throw new AppError(
          400,
          "VALIDATION_ERROR",
          "creatorId is required for mock platform"
        );
      }
    } else {
      const token = await requirePlatformAuth(
        parsed.platform,
        request.headers.authorization
      );
      creatorId = token.subjectId;
    }

    const pollInput = { ...parsed, creatorId: creatorId! };
    try {
      validateCreatePoll(pollInput);
    } catch (e) {
      throw new AppError(400, "INVALID_POLL", (e as Error).message);
    }
    const input = normalizeCreatePoll(pollInput);
    const { poll, items } = await createPoll(input);
    return reply.status(201).send({
      ...poll,
      items,
      platformNote:
        "platform is immutable; all voters must authenticate via this platform only",
    });
  });

  app.get("/polls", async (request) => {
    const query = z
      .object({
        search: z.string().optional(),
        activeOnly: z
          .enum(["true", "false"])
          .optional()
          .transform((v) => v === "true"),
        offset: z.coerce.number().int().min(0).default(0),
        limit: z.coerce.number().int().min(1).max(50).default(10),
      })
      .parse(request.query);

    const result = await searchPolls({
      search: query.search,
      activeOnly: query.activeOnly ?? false,
      offset: query.offset,
      limit: query.limit,
    });

    return {
      polls: result.polls.map((poll) => ({
        id: poll.id,
        name: poll.name,
        platform: poll.platform,
        startsAt: poll.startsAt.toISOString(),
        endsAt: poll.endsAt.toISOString(),
        closedAt: poll.closedAt?.toISOString() ?? null,
        resultPolicy: poll.resultPolicy,
        createdAt: poll.createdAt.toISOString(),
      })),
      total: result.total,
      offset: result.offset,
      limit: result.limit,
    };
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
