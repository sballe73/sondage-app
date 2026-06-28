import type { VoteSubmittedEvent, ResultPolicy, Platform } from "@sondage/shared";
import {
  hashSubjectForParticipation,
  shouldPublishSnapshot,
  isMockLiveSnapshot,
} from "@sondage/shared";
import { getPollById } from "./repositories/polls.js";
import {
  tryClaimVoteEvent,
  incrementHistogram,
  recordParticipation,
  recordBallot,
  getVoteCount,
} from "./repositories/results.js";
import { maybePublishSnapshot } from "./publish-snapshot.js";

export async function processVoteEvent(event: VoteSubmittedEvent): Promise<void> {
  if (!(await tryClaimVoteEvent(event.eventId, event.pollId))) {
    return;
  }

  const data = await getPollById(event.pollId);
  if (!data) {
    throw new Error(`Poll not found: ${event.pollId}`);
  }
  if (
    process.env.ALLOW_MULTI_PLATFORM_AUTH !== "true" &&
    data.poll.platform !== event.platform
  ) {
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
  await recordParticipation(
    event.pollId,
    event.platform,
    participationSubject,
    event.displayName
  );

  if (event.voterMode === "public") {
    await recordBallot(
      event.pollId,
      event.platform,
      event.subjectId,
      event.displayName,
      event.grades
    );
  }

  const newCount = previousCount + 1;
  const policy = data.poll.resultPolicy as ResultPolicy;
  const snapshotOptions = {
    platform: data.poll.platform as Platform,
    mockSnapshotEveryVote: data.poll.mockSnapshotEveryVote,
  };

  // Mock live dev : snapshot à chaque vote. Sinon publication différée (worker / GET results).
  if (isMockLiveSnapshot(snapshotOptions)) {
    const publish = shouldPublishSnapshot(
      policy,
      previousCount,
      newCount,
      data.poll.endsAt,
      new Date(),
      snapshotOptions
    );
    if (publish) {
      await maybePublishSnapshot(event.pollId);
    }
  }
}
