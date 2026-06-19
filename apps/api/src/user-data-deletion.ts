import type { Platform } from "@sondage/shared";
import { deleteUserVoteData } from "@sondage/db";
import { config } from "./config.js";
import { purgeUserParticipationRedis } from "./redis.js";

export async function purgeUserData(platform: Platform, subjectId: string) {
  const result = await deleteUserVoteData(
    platform,
    subjectId,
    config.participationHashSalt
  );
  await purgeUserParticipationRedis(result.pollIds, platform, subjectId);
  return result;
}
