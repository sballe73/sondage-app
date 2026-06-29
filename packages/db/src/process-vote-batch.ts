import type { VoteSubmittedEvent, ResultPolicy, Platform } from "@sondage/shared";
import {
  hashSubjectForParticipation,
  isMockLiveSnapshot,
} from "@sondage/shared";
import { getPollById } from "./repositories/polls.js";
import {
  claimVoteEvents,
  bulkIncrementHistograms,
  bulkRecordParticipations,
  bulkRecordBallots,
} from "./repositories/results.js";
import { maybePublishSnapshot } from "./publish-snapshot.js";
import { getDb } from "./client.js";

export type ProcessVoteBatchResult = {
  processed: number;
  duplicate: number;
  processedByPoll: Map<string, number>;
  failed: { eventId: string; error: unknown }[];
};

function groupEventsByPoll(
  events: VoteSubmittedEvent[]
): Map<string, VoteSubmittedEvent[]> {
  const byPoll = new Map<string, VoteSubmittedEvent[]>();
  for (const event of events) {
    const list = byPoll.get(event.pollId) ?? [];
    list.push(event);
    byPoll.set(event.pollId, list);
  }
  return byPoll;
}

function aggregateHistogramDeltas(
  events: VoteSubmittedEvent[]
): { itemId: string; grade: number; delta: number }[] {
  const counts = new Map<string, { itemId: string; grade: number; delta: number }>();
  for (const event of events) {
    for (const { itemId, grade } of event.grades) {
      const key = `${itemId}\0${grade}`;
      const row = counts.get(key);
      if (row) {
        row.delta += 1;
      } else {
        counts.set(key, { itemId, grade, delta: 1 });
      }
    }
  }
  return [...counts.values()];
}

async function processPollVoteBatch(
  pollId: string,
  events: VoteSubmittedEvent[]
): Promise<{ processed: number; duplicate: number }> {
  const db = getDb();
  return db.transaction(async (tx) => {
    const claimed = await claimVoteEvents(
      events.map((e) => ({ eventId: e.eventId, pollId })),
      tx
    );
    const duplicate = events.length - claimed.size;
    const toProcess = events.filter((e) => claimed.has(e.eventId));
    if (toProcess.length === 0) {
      return { processed: 0, duplicate };
    }

    const data = await getPollById(pollId, tx);
    if (!data) {
      throw new Error(`Poll not found: ${pollId}`);
    }

    const allowMulti = process.env.ALLOW_MULTI_PLATFORM_AUTH === "true";
    for (const event of toProcess) {
      if (!allowMulti && data.poll.platform !== event.platform) {
        throw new Error("Event platform does not match poll.platform");
      }
    }

    const salt = process.env.PARTICIPATION_HASH_SALT ?? "dev-salt";
    await bulkIncrementHistograms(pollId, aggregateHistogramDeltas(toProcess), tx);
    await bulkRecordParticipations(
      toProcess.map((event) => ({
        pollId,
        platform: event.platform as Platform,
        subjectId:
          event.voterMode === "anonymous"
            ? hashSubjectForParticipation(event.pollId, event.subjectId, salt)
            : event.subjectId,
        displayName: event.displayName,
      })),
      tx
    );
    await bulkRecordBallots(
      toProcess
        .filter((event) => event.voterMode === "public")
        .map((event) => ({
          pollId,
          platform: event.platform as Platform,
          subjectId: event.subjectId,
          displayName: event.displayName,
          grades: event.grades,
        })),
      tx
    );

    return { processed: toProcess.length, duplicate };
  });
}

async function maybePublishMockLiveSnapshot(
  pollId: string,
  processed: number
): Promise<void> {
  if (processed <= 0) return;
  const data = await getPollById(pollId);
  if (!data) return;
  const snapshotOptions = {
    platform: data.poll.platform as Platform,
    mockSnapshotEveryVote: data.poll.mockSnapshotEveryVote,
  };
  if (!isMockLiveSnapshot(snapshotOptions)) return;
  await maybePublishSnapshot(pollId);
}

/** Agrège un lot d'événements (même sondage ou plusieurs) avec peu de requêtes Postgres. */
export async function processVoteEventBatch(
  events: VoteSubmittedEvent[]
): Promise<ProcessVoteBatchResult> {
  if (events.length === 0) {
    return {
      processed: 0,
      duplicate: 0,
      processedByPoll: new Map(),
      failed: [],
    };
  }

  const processedByPoll = new Map<string, number>();
  let processed = 0;
  let duplicate = 0;
  const failed: { eventId: string; error: unknown }[] = [];

  for (const [pollId, pollEvents] of groupEventsByPoll(events)) {
    try {
      const result = await processPollVoteBatch(pollId, pollEvents);
      processed += result.processed;
      duplicate += result.duplicate;
      if (result.processed > 0) {
        processedByPoll.set(
          pollId,
          (processedByPoll.get(pollId) ?? 0) + result.processed
        );
        await maybePublishMockLiveSnapshot(pollId, result.processed);
      }
    } catch (batchErr) {
      for (const event of pollEvents) {
        try {
          const single = await processPollVoteBatch(pollId, [event]);
          processed += single.processed;
          duplicate += single.duplicate;
          if (single.processed > 0) {
            processedByPoll.set(
              pollId,
              (processedByPoll.get(pollId) ?? 0) + single.processed
            );
            await maybePublishMockLiveSnapshot(pollId, single.processed);
          } else {
            duplicate += 1;
          }
        } catch (err) {
          failed.push({ eventId: event.eventId, error: err });
        }
      }
      if (failed.length > 0 && pollEvents.length === failed.length) {
        console.error(`Poll batch ${pollId} failed:`, batchErr);
      }
    }
  }

  return { processed, duplicate, processedByPoll, failed };
}
