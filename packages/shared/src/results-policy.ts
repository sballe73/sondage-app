import { THRESHOLD_BY_POLICY, type ResultPolicy } from "./types.js";

export function isResultsVisible(
  policy: ResultPolicy,
  voteCount: number,
  endsAt: Date,
  now = new Date()
): boolean {
  if (policy === "end_only") {
    return now >= endsAt;
  }
  const threshold = THRESHOLD_BY_POLICY[policy];
  return voteCount >= threshold;
}

export function shouldPublishSnapshot(
  policy: ResultPolicy,
  previousCount: number,
  newCount: number,
  endsAt: Date,
  now = new Date()
): boolean {
  if (policy === "end_only") {
    return now >= endsAt && previousCount < newCount;
  }
  const threshold = THRESHOLD_BY_POLICY[policy];
  const prevBlock = Math.floor(previousCount / threshold);
  const newBlock = Math.floor(newCount / threshold);
  return newBlock > prevBlock;
}
