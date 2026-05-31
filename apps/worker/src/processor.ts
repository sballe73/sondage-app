import type { VoteSubmittedEvent, ResultPolicy, Platform } from "@sondage/shared";
import { hashSubjectForParticipation } from "@sondage/shared";
import {
  isEventProcessed,
  markEventProcessed,
  incrementHistogram,
  recordParticipation,
  recordBallot,
  getVoteCount,
  getNextSnapshotVersion,
} from "@sondage/db";
import { getPollById } from "@sondage/db";
import { reconcileVoteCount } from "./redis.js";
import {
  shouldPublishSnapshot,
  isResultsVisible,
} from "@sondage/shared";
import { computeAndSaveSnapshot } from "@sondage/db";

export async function processVoteEvent(event: VoteSubmittedEvent): Promise<void> {
  if (await isEventProcessed(event.eventId)) {
    return;
  }

  const data = await getPollById(event.pollId);
  if (!data) {
    throw new Error(`Poll not found: ${event.pollId}`);
  }
  if (data.poll.platform !== event.platform) {
    throw new Error("Event platform does not match poll.platform");
  }

  const previousCount = await getVoteCount(event.pollId);

  for (const { itemId, grade } of event.grades) {
    await incrementHistogram(event.pollId, itemId, grade);
  }

  const participationSubject =
    event.voterMode === "anonymous"
      ? hashSubjectForParticipation(
          event.pollId,
          event.subjectId,
          process.env.PARTICIPATION_HASH_SALT ?? "dev-salt"
        )
      : event.subjectId;
  await recordParticipation(event.pollId, participationSubject);

  if (event.voterMode === "public") {
    await recordBallot(
      event.pollId,
      event.subjectId,
      event.displayName,
      event.grades
    );
  }

  await markEventProcessed(event.eventId, event.pollId);

  const newCount = previousCount + 1;
  await reconcileVoteCount(event.pollId, newCount);

  const policy = data.poll.resultPolicy as ResultPolicy;
  const snapshotOptions = {
    platform: data.poll.platform as Platform,
    mockSnapshotEveryVote: data.poll.mockSnapshotEveryVote,
  };
  const publishThreshold = shouldPublishSnapshot(
    policy,
    previousCount,
    newCount,
    data.poll.endsAt,
    new Date(),
    snapshotOptions
  );
  const atEnd =
    new Date() >= data.poll.endsAt &&
    isResultsVisible(
      policy,
      newCount,
      data.poll.endsAt,
      new Date(),
      snapshotOptions
    );

  if (publishThreshold || atEnd) {
    const version = await getNextSnapshotVersion(event.pollId);
    const forceVisible = isResultsVisible(
      policy,
      newCount,
      data.poll.endsAt,
      new Date(),
      snapshotOptions
    );
    await computeAndSaveSnapshot(event.pollId, version, forceVisible);
  }
}
