import { sql } from "drizzle-orm";
import type { Platform, ResultPolicy } from "@sondage/shared";
import { isResultsVisible } from "@sondage/shared";
import { getDb } from "./client.js";
import { getPollById } from "./repositories/polls.js";
import {
  getVoteCount,
  getLatestVisibleSnapshot,
  getMaxSnapshotVersion,
} from "./repositories/results.js";
import { computeAndSaveSnapshot } from "./snapshot.js";

export type PublishSnapshotResult = {
  published: boolean;
  version?: number;
  voteCount?: number;
  snapshotMs?: number;
  skipped?: "not_visible" | "up_to_date" | "version_conflict";
};

/**
 * Publie un snapshot sous verrou Postgres (advisory lock par sondage).
 * Sérialise les écrivains concurrents (worker, GET /results, vote-drain).
 */
export async function maybePublishSnapshot(
  pollId: string,
  options?: { forceVisible?: boolean }
): Promise<PublishSnapshotResult> {
  const db = getDb();

  return db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${pollId}))`);

    const data = await getPollById(pollId, tx);
    if (!data) {
      return { published: false };
    }

    const voteCount = await getVoteCount(pollId, tx);
    const policy = data.poll.resultPolicy as ResultPolicy;
    const snapshotOptions = {
      platform: data.poll.platform as Platform,
      mockSnapshotEveryVote: data.poll.mockSnapshotEveryVote,
    };
    const now = new Date();

    const forceVisible =
      options?.forceVisible ??
      isResultsVisible(policy, voteCount, data.poll.endsAt, now, snapshotOptions);

    if (!forceVisible) {
      return { published: false, skipped: "not_visible" as const };
    }

    const existing = await getLatestVisibleSnapshot(pollId, tx);
    const snapshotVoteCount = existing?.voteCount ?? 0;

    if (existing && voteCount <= snapshotVoteCount) {
      return {
        published: false,
        skipped: "up_to_date" as const,
        voteCount,
      };
    }

    const version = (await getMaxSnapshotVersion(pollId, tx)) + 1;
    const computeStart = Date.now();
    const payload = await computeAndSaveSnapshot(
      pollId,
      version,
      forceVisible,
      tx
    );
    const snapshotMs = Date.now() - computeStart;

    if (!payload) {
      return {
        published: false,
        skipped: "version_conflict" as const,
        voteCount,
        snapshotMs,
      };
    }

    return {
      published: true,
      version,
      voteCount: payload.voteCount,
      snapshotMs,
    };
  });
}
