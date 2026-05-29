import { createHash } from "node:crypto";

/** Stable pseudonym for anonymous participation records (RGPD minimization). */
export function hashSubjectForParticipation(
  pollId: string,
  subjectId: string,
  salt: string
): string {
  return createHash("sha256")
    .update(`${salt}:${pollId}:${subjectId}`)
    .digest("hex");
}
