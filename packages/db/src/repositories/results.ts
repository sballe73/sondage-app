import { eq, and, asc, desc, sql } from "drizzle-orm";
import type { Platform, PollResultsSnapshot } from "@sondage/shared";
import { getDb, schema } from "../client.js";

const {
  gradeHistograms,
  pollItems,
  resultSnapshots,
  voteParticipation,
  voteBallots,
} = schema;

export async function getVoteCount(pollId: string): Promise<number> {
  const db = getDb();
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(voteParticipation)
    .where(eq(voteParticipation.pollId, pollId));
  return row?.count ?? 0;
}

export async function getHistogramRows(pollId: string) {
  const db = getDb();
  return db
    .select({
      itemId: gradeHistograms.itemId,
      grade: gradeHistograms.grade,
      count: gradeHistograms.count,
    })
    .from(gradeHistograms)
    .where(eq(gradeHistograms.pollId, pollId));
}

export async function incrementHistogram(
  pollId: string,
  itemId: string,
  grade: number
) {
  const db = getDb();
  await db
    .insert(gradeHistograms)
    .values({ pollId, itemId, grade, count: 1 })
    .onConflictDoUpdate({
      target: [
        gradeHistograms.pollId,
        gradeHistograms.itemId,
        gradeHistograms.grade,
      ],
      set: {
        count: sql`${gradeHistograms.count} + excluded.count`,
      },
    });
}

export async function saveSnapshot(
  pollId: string,
  version: number,
  voteCount: number,
  visible: boolean,
  payload: PollResultsSnapshot
) {
  const db = getDb();
  await db.insert(resultSnapshots).values({
    pollId,
    version,
    voteCount,
    visible,
    payload,
  });
}

export async function getMaxSnapshotVersion(pollId: string): Promise<number> {
  const db = getDb();
  const [row] = await db
    .select({
      max: sql<number>`coalesce(max(${resultSnapshots.version}), 0)::int`,
    })
    .from(resultSnapshots)
    .where(eq(resultSnapshots.pollId, pollId));
  return row?.max ?? 0;
}

export async function getNextSnapshotVersion(pollId: string): Promise<number> {
  return (await getMaxSnapshotVersion(pollId)) + 1;
}

export async function getLatestVisibleSnapshot(pollId: string) {
  const db = getDb();
  const rows = await db
    .select()
    .from(resultSnapshots)
    .where(
      and(eq(resultSnapshots.pollId, pollId), eq(resultSnapshots.visible, true))
    )
    .orderBy(desc(resultSnapshots.version))
    .limit(1);
  return rows[0] ?? null;
}

export async function getSnapshotByVersion(pollId: string, version: number) {
  const db = getDb();
  const [row] = await db
    .select()
    .from(resultSnapshots)
    .where(
      and(
        eq(resultSnapshots.pollId, pollId),
        eq(resultSnapshots.version, version)
      )
    );
  return row ?? null;
}

export async function listBallots(pollId: string) {
  const db = getDb();
  return db
    .select()
    .from(voteBallots)
    .where(eq(voteBallots.pollId, pollId))
    .orderBy(asc(voteBallots.votedAt));
}

export async function getBallotBySubject(
  pollId: string,
  platform: Platform,
  subjectId: string
) {
  const db = getDb();
  const [row] = await db
    .select()
    .from(voteBallots)
    .where(
      and(
        eq(voteBallots.pollId, pollId),
        eq(voteBallots.platform, platform),
        eq(voteBallots.subjectId, subjectId)
      )
    );
  return row ?? null;
}

export async function listParticipation(pollId: string) {
  const db = getDb();
  return db
    .select({
      displayName: voteParticipation.displayName,
      participatedAt: voteParticipation.participatedAt,
      platform: voteParticipation.platform,
    })
    .from(voteParticipation)
    .where(eq(voteParticipation.pollId, pollId))
    .orderBy(asc(voteParticipation.participatedAt));
}

export async function recordParticipation(
  pollId: string,
  platform: Platform,
  subjectId: string,
  displayName?: string
) {
  const db = getDb();
  await db.insert(voteParticipation).values({
    pollId,
    platform,
    subjectId,
    displayName: displayName ?? null,
  });
}

export async function recordBallot(
  pollId: string,
  platform: Platform,
  subjectId: string,
  displayName: string | undefined,
  grades: { itemId: string; grade: number }[]
) {
  const db = getDb();
  await db.insert(voteBallots).values({
    pollId,
    platform,
    subjectId,
    displayName: displayName ?? null,
    grades,
  });
}

export async function isEventProcessed(eventId: string) {
  const db = getDb();
  const { processedVoteEvents } = schema;
  const [row] = await db
    .select()
    .from(processedVoteEvents)
    .where(eq(processedVoteEvents.eventId, eventId));
  return !!row;
}

export async function markEventProcessed(eventId: string, pollId: string) {
  const db = getDb();
  const { processedVoteEvents } = schema;
  await db.insert(processedVoteEvents).values({ eventId, pollId });
}
