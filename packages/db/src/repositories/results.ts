import { eq, and, asc, desc, sql } from "drizzle-orm";
import type { Platform, PollResultsSnapshot } from "@sondage/shared";
import {
  STORED_TEXT_LIMITS,
  sanitizeStoredTextOptional,
} from "@sondage/shared";
import { getDb, schema } from "../client.js";
import type { DbTx } from "../db-types.js";

const {
  gradeHistograms,
  pollItems,
  resultSnapshots,
  voteParticipation,
  voteBallots,
} = schema;

function dbOr(tx?: DbTx) {
  return tx ?? getDb();
}

export async function getVoteCount(pollId: string, tx?: DbTx): Promise<number> {
  const db = dbOr(tx);
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(voteParticipation)
    .where(eq(voteParticipation.pollId, pollId));
  return row?.count ?? 0;
}

export async function getHistogramRows(pollId: string, tx?: DbTx) {
  const db = dbOr(tx);
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
  payload: PollResultsSnapshot,
  tx?: DbTx
): Promise<boolean> {
  const db = dbOr(tx);
  const rows = await db
    .insert(resultSnapshots)
    .values({
      pollId,
      version,
      voteCount,
      visible,
      payload,
    })
    .onConflictDoNothing({
      target: [resultSnapshots.pollId, resultSnapshots.version],
    })
    .returning({ id: resultSnapshots.id });
  return rows.length > 0;
}

export async function getMaxSnapshotVersion(
  pollId: string,
  tx?: DbTx
): Promise<number> {
  const db = dbOr(tx);
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

export async function getLatestVisibleSnapshot(pollId: string, tx?: DbTx) {
  const db = dbOr(tx);
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

function sanitizeDisplayName(displayName?: string | null): string | null {
  const cleaned = sanitizeStoredTextOptional(
    displayName,
    STORED_TEXT_LIMITS.displayName
  );
  return cleaned ?? null;
}

export async function countParticipation(pollId: string): Promise<number> {
  const db = getDb();
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(voteParticipation)
    .where(eq(voteParticipation.pollId, pollId));
  return row?.count ?? 0;
}

export async function countBallots(pollId: string): Promise<number> {
  const db = getDb();
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(voteBallots)
    .where(eq(voteBallots.pollId, pollId));
  return row?.count ?? 0;
}

export async function listParticipationPage(
  pollId: string,
  offset: number,
  limit: number
) {
  const db = getDb();
  return db
    .select({
      displayName: voteParticipation.displayName,
      participatedAt: voteParticipation.participatedAt,
      platform: voteParticipation.platform,
    })
    .from(voteParticipation)
    .where(eq(voteParticipation.pollId, pollId))
    .orderBy(asc(voteParticipation.participatedAt))
    .limit(limit)
    .offset(offset);
}

export async function listBallotsPage(
  pollId: string,
  offset: number,
  limit: number
) {
  const db = getDb();
  return db
    .select()
    .from(voteBallots)
    .where(eq(voteBallots.pollId, pollId))
    .orderBy(asc(voteBallots.votedAt))
    .limit(limit)
    .offset(offset);
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
    displayName: sanitizeDisplayName(displayName),
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
    displayName: sanitizeDisplayName(displayName),
    grades,
  });
}

export async function tryClaimVoteEvent(
  eventId: string,
  pollId: string
): Promise<boolean> {
  const claimed = await claimVoteEvents([{ eventId, pollId }]);
  return claimed.has(eventId);
}

/** Réserve les eventId non encore traités (idempotence). */
export async function claimVoteEvents(
  events: { eventId: string; pollId: string }[],
  tx?: DbTx
): Promise<Set<string>> {
  if (events.length === 0) {
    return new Set();
  }
  const db = dbOr(tx);
  const { processedVoteEvents } = schema;
  const rows = await db
    .insert(processedVoteEvents)
    .values(events.map((e) => ({ eventId: e.eventId, pollId: e.pollId })))
    .onConflictDoNothing({ target: processedVoteEvents.eventId })
    .returning({ eventId: processedVoteEvents.eventId });
  return new Set(rows.map((r) => r.eventId));
}

export async function bulkIncrementHistograms(
  pollId: string,
  deltas: { itemId: string; grade: number; delta: number }[],
  tx?: DbTx
) {
  if (deltas.length === 0) return;
  const db = dbOr(tx);
  await db
    .insert(gradeHistograms)
    .values(
      deltas.map((d) => ({
        pollId,
        itemId: d.itemId,
        grade: d.grade,
        count: d.delta,
      }))
    )
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

export async function bulkRecordParticipations(
  rows: {
    pollId: string;
    platform: Platform;
    subjectId: string;
    displayName?: string;
  }[],
  tx?: DbTx
) {
  if (rows.length === 0) return;
  const db = dbOr(tx);
  await db.insert(voteParticipation).values(
    rows.map((row) => ({
      pollId: row.pollId,
      platform: row.platform,
      subjectId: row.subjectId,
      displayName: sanitizeDisplayName(row.displayName),
    }))
  );
}

export async function bulkRecordBallots(
  rows: {
    pollId: string;
    platform: Platform;
    subjectId: string;
    displayName?: string;
    grades: { itemId: string; grade: number }[];
  }[],
  tx?: DbTx
) {
  if (rows.length === 0) return;
  const db = dbOr(tx);
  await db.insert(voteBallots).values(
    rows.map((row) => ({
      pollId: row.pollId,
      platform: row.platform,
      subjectId: row.subjectId,
      displayName: sanitizeDisplayName(row.displayName),
      grades: row.grades,
    }))
  );
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
  await tryClaimVoteEvent(eventId, pollId);
}
