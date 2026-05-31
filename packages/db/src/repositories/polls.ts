import { eq, and, asc } from "drizzle-orm";
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

export async function createCampaign(name: string, creatorId: string) {
  const db = getDb();
  const [row] = await db
    .insert(campaigns)
    .values({ name, creatorId })
    .returning();
  return row;
}
