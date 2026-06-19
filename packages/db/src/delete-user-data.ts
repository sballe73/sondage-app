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
  const pollIds = new Set<string>();

  const ballotRows = await db
    .select({ pollId: voteBallots.pollId })
    .from(voteBallots)
    .where(
      and(
        eq(voteBallots.platform, platform),
        eq(voteBallots.subjectId, subjectId)
      )
    );
  for (const row of ballotRows) {
    pollIds.add(row.pollId);
  }

  await db
    .delete(voteBallots)
    .where(
      and(
        eq(voteBallots.platform, platform),
        eq(voteBallots.subjectId, subjectId)
      )
    );

  const directParticipation = await db
    .delete(voteParticipation)
    .where(
      and(
        eq(voteParticipation.platform, platform),
        eq(voteParticipation.subjectId, subjectId)
      )
    )
    .returning({ pollId: voteParticipation.pollId });
  for (const row of directParticipation) {
    pollIds.add(row.pollId);
  }

  const anonymousPolls = await db
    .select({ id: polls.id })
    .from(polls)
    .where(eq(polls.voterMode, "anonymous"));

  for (const poll of anonymousPolls) {
    const hashed = hashSubjectForParticipation(poll.id, subjectId, hashSalt);
    const deleted = await db
      .delete(voteParticipation)
      .where(
        and(
          eq(voteParticipation.pollId, poll.id),
          eq(voteParticipation.platform, platform),
          eq(voteParticipation.subjectId, hashed)
        )
      )
      .returning({ pollId: voteParticipation.pollId });
    for (const row of deleted) {
      pollIds.add(row.pollId);
    }
  }

  const pollIdList = [...pollIds];

  return {
    pollsAffected: pollIdList.length,
    pollIds: pollIdList,
    subjectId,
    platform,
  };
}
