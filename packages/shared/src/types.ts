export const PLATFORMS = ["facebook", "x", "linkedin", "mock"] as const;
export type Platform = (typeof PLATFORMS)[number];

export const DATA_REGIONS = ["EU", "US", "GLOBAL"] as const;
export type DataRegion = (typeof DATA_REGIONS)[number];

export const VISIBILITY_SCOPES = ["public", "group"] as const;
export type VisibilityScope = (typeof VISIBILITY_SCOPES)[number];

export const VOTER_MODES = ["anonymous", "public"] as const;
export type VoterMode = (typeof VOTER_MODES)[number];

export const RESULT_POLICIES = [
  "end_only",
  "threshold_10",
  "threshold_100",
  "threshold_1000",
] as const;
export type ResultPolicy = (typeof RESULT_POLICIES)[number];

export const THRESHOLD_BY_POLICY: Record<
  Exclude<ResultPolicy, "end_only">,
  number
> = {
  threshold_10: 10,
  threshold_100: 100,
  threshold_1000: 1000,
};

export interface PollItemInput {
  label: string;
  sortOrder?: number;
}

export interface CreatePollInput {
  name: string;
  creatorId: string;
  platform: Platform;
  items: PollItemInput[];
  gradeMin?: number;
  gradeMax?: number;
  /** Libellés pour les notes gradeMin … gradeMax (défaut : échelle MJ à 7 niveaux). */
  gradeLabels?: string[];
  /** true si la plus petite note est la meilleure (défaut : true, 1 = Excellent). */
  bestGradeIsLowest?: boolean;
  startsAt: string;
  endsAt: string;
  visibility: VisibilityScope;
  groupId?: string | null;
  voterMode: VoterMode;
  resultPolicy: ResultPolicy;
  dataRegion?: DataRegion;
  campaignId?: string | null;
}

export interface VoteGrade {
  itemId: string;
  grade: number;
}

export interface VoteSubmittedEvent {
  eventId: string;
  pollId: string;
  platform: Platform;
  subjectId: string;
  displayName?: string;
  grades: VoteGrade[];
  voterMode: VoterMode;
  submittedAt: string;
  idempotencyKey?: string;
}

export type { TieBreakMethodId, TieBreakBallotage } from "./tie-break.js";
import type { TieBreakMethodId, TieBreakBallotage } from "./tie-break.js";

export interface ItemMedianResult {
  itemId: string;
  label: string;
  median: number | null;
  totalJudgments: number;
  distribution: Record<number, number>;
  /** Rang après départage (1 = meilleur). */
  rank?: number;
  tiedAtMedian?: boolean;
  tieBreakMethod?: TieBreakMethodId;
  ballotage?: TieBreakBallotage;
  /** Médiane + libellé + ballotage si applicable. */
  medianDisplay?: string;
}

export interface MajorityJudgmentRankingEntry {
  rank: number;
  itemId: string;
  label: string;
  median: number | null;
  tiedAtMedian?: boolean;
  tieBreakMethod?: TieBreakMethodId;
  ballotage?: TieBreakBallotage;
  medianDisplay?: string;
}

export interface RankedJudgmentInput {
  itemId: string;
  label: string;
  distribution: Record<number, number>;
  median: number | null;
  totalJudgments: number;
}

export interface PollResultsSnapshot {
  pollId: string;
  version: number;
  voteCount: number;
  computedAt: string;
  gradeMin: number;
  gradeMax: number;
  gradeLabels: string[];
  bestGradeIsLowest: boolean;
  items: ItemMedianResult[];
  /** Classement global (médiane + groupes d'insatisfaits). */
  ranking: MajorityJudgmentRankingEntry[];
  tieBreakMethod?: TieBreakMethodId;
  tieBreakMethodDescription?: string;
  policy: ResultPolicy;
  visible: boolean;
}

export interface VoterJwtPayload {
  pollId: string;
  platform: Platform;
  subjectId: string;
  displayName?: string;
}
