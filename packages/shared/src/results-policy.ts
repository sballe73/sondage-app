import {
  THRESHOLD_BY_POLICY,
  type Platform,
  type ResultPolicy,
} from "./types.js";

export type PollSnapshotOptions = {
  platform?: Platform;
  mockSnapshotEveryVote?: boolean;
};

export function isMockLiveSnapshot(options?: PollSnapshotOptions): boolean {
  return (
    options?.platform === "mock" && options?.mockSnapshotEveryVote === true
  );
}

export function isResultsVisible(
  policy: ResultPolicy,
  voteCount: number,
  endsAt: Date,
  now = new Date(),
  options?: PollSnapshotOptions
): boolean {
  if (isMockLiveSnapshot(options)) {
    return voteCount >= 1;
  }
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
  now = new Date(),
  options?: PollSnapshotOptions
): boolean {
  if (isMockLiveSnapshot(options)) {
    return newCount > previousCount;
  }
  if (policy === "end_only") {
    return now >= endsAt && previousCount < newCount;
  }
  const threshold = THRESHOLD_BY_POLICY[policy];
  const prevBlock = Math.floor(previousCount / threshold);
  const newBlock = Math.floor(newCount / threshold);
  return newBlock > prevBlock;
}
