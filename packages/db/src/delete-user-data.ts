import { eq, and, inArray } from "drizzle-orm";
import type { Platform } from "@sondage/shared";
import { hashSubjectForParticipation } from "@sondage/shared";
import { getDb, schema } from "./client.js";

const { polls, voteParticipation, voteBallots } = schema;

export type DeleteUserVoteDataResult = {
  pollsAffected: number;
  pollIds: string[];
  subjectId: string;
  platform: Platform;
};

/**
 * Supprime participation et bulletins pour un utilisateur sur une plateforme.
 * Les histogrammes agrégés ne sont pas recalculés (totaux anonymes conservés).
 */
export async function deleteUserVoteData(
  platform: Platform,
  subjectId: string,
  hashSalt: string
): Promise<DeleteUserVoteDataResult> {
  const db = getDb();
  const platformPolls = await db
    .select({ id: polls.id, voterMode: polls.voterMode })
    .from(polls)
    .where(eq(polls.platform, platform));

  const pollIds: string[] = [];

  for (const poll of platformPolls) {
    const participationSubjectIds = new Set<string>([subjectId]);
    if (poll.voterMode === "anonymous") {
      participationSubjectIds.add(
        hashSubjectForParticipation(poll.id, subjectId, hashSalt)
      );
    }

    await db
      .delete(voteParticipation)
      .where(
        and(
          eq(voteParticipation.pollId, poll.id),
          inArray(voteParticipation.subjectId, [...participationSubjectIds])
        )
      );

    await db
      .delete(voteBallots)
      .where(
        and(
          eq(voteBallots.pollId, poll.id),
          eq(voteBallots.subjectId, subjectId)
        )
      );

    pollIds.push(poll.id);
  }

  return {
    pollsAffected: pollIds.length,
    pollIds,
    subjectId,
    platform,
  };
}
