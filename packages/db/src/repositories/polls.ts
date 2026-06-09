import { eq, and, asc, desc, gt, ilike, isNull, lte, sql } from "drizzle-orm";
import type { CreatePollInput, Platform } from "@sondage/shared";
import { normalizeCreatePoll } from "@sondage/shared";
import { getDb, schema } from "../client.js";

const { polls, pollItems, campaigns } = schema;

export async function createPoll(input: CreatePollInput) {
  const normalized = normalizeCreatePoll(input);
  const db = getDb();
  return db.transaction(async (tx) => {
    let campaignId = normalized.campaignId ?? null;
    if (campaignId) {
      const [c] = await tx
        .select()
        .from(campaigns)
        .where(eq(campaigns.id, campaignId));
      if (!c) throw new Error("Campaign not found");
    }

    const [poll] = await tx
      .insert(polls)
      .values({
        name: normalized.name,
        creatorId: normalized.creatorId,
        platform: normalized.platform,
        startsAt: new Date(normalized.startsAt),
        endsAt: new Date(normalized.endsAt),
        visibility: normalized.visibility,
        groupId: normalized.groupId ?? null,
        voterMode: normalized.voterMode,
        gradeMin: normalized.gradeMin,
        gradeMax: normalized.gradeMax,
        gradeLabels: normalized.gradeLabels,
        bestGradeIsLowest: normalized.bestGradeIsLowest,
        resultPolicy: normalized.resultPolicy,
        mockSnapshotEveryVote: normalized.mockSnapshotEveryVote ?? false,
        dataRegion: normalized.dataRegion ?? "EU",
        campaignId,
        platformLocked: true,
      })
      .returning();

    const items = await tx
      .insert(pollItems)
      .values(
        normalized.items.map((item, i) => ({
          pollId: poll.id,
          label: item.label,
          sortOrder: item.sortOrder ?? i,
        }))
      )
      .returning();

    return { poll, items };
  });
}

export async function getPollById(pollId: string) {
  const db = getDb();
  const [poll] = await db.select().from(polls).where(eq(polls.id, pollId));
  if (!poll) return null;
  const items = await db
    .select()
    .from(pollItems)
    .where(eq(pollItems.pollId, pollId))
    .orderBy(asc(pollItems.sortOrder));
  return { poll, items };
}

export async function listPollsByCreator(creatorId: string) {
  const db = getDb();
  return db.select().from(polls).where(eq(polls.creatorId, creatorId));
}

export type SearchPollsOptions = {
  search?: string;
  activeOnly?: boolean;
  offset?: number;
  limit?: number;
};

export async function searchPolls(options: SearchPollsOptions = {}) {
  const db = getDb();
  const limit = Math.min(Math.max(options.limit ?? 10, 1), 50);
  const offset = Math.max(options.offset ?? 0, 0);
  const now = new Date();

  const conditions = [];
  const term = options.search?.trim();
  if (term) {
    conditions.push(ilike(polls.name, `%${term}%`));
  }
  if (options.activeOnly) {
    conditions.push(isNull(polls.closedAt));
    conditions.push(lte(polls.startsAt, now));
    conditions.push(gt(polls.endsAt, now));
  }

  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const rows = await db
    .select()
    .from(polls)
    .where(where)
    .orderBy(desc(polls.createdAt))
    .limit(limit)
    .offset(offset);

  const [countRow] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(polls)
    .where(where);

  return {
    polls: rows,
    total: countRow?.count ?? 0,
    offset,
    limit,
  };
}

export async function assertPlatformImmutable(
  pollId: string,
  platform: Platform
) {
  const data = await getPollById(pollId);
  if (!data) throw new Error("Poll not found");
  if (data.poll.platform !== platform) {
    throw new Error(
      `Platform mismatch: poll requires ${data.poll.platform}, got ${platform}`
    );
  }
  return data;
}

export async function closePoll(pollId: string) {
  const db = getDb();
  await db
    .update(polls)
    .set({ closedAt: new Date() })
    .where(eq(polls.id, pollId));
}

export async function updatePollDates(
  pollId: string,
  dates: { startsAt: Date; endsAt: Date }
) {
  const db = getDb();
  const [poll] = await db
    .update(polls)
    .set({
      startsAt: dates.startsAt,
      endsAt: dates.endsAt,
    })
    .where(eq(polls.id, pollId))
    .returning();
  if (!poll) throw new Error("Poll not found");
  return poll;
}

export async function createCampaign(name: string, creatorId: string) {
  const db = getDb();
  const [row] = await db
    .insert(campaigns)
    .values({ name, creatorId })
    .returning();
  return row;
}
