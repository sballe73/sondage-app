import type { CreatePollInput, Platform, VoteGrade } from "./types.js";
import { PLATFORMS } from "./types.js";
import {
  DEFAULT_GRADE_MAX,
  DEFAULT_GRADE_MIN,
  defaultGradeLabels,
  validateGradeLabels,
} from "./grade-scale.js";

export function assertPlatform(value: string): asserts value is Platform {
  if (!PLATFORMS.includes(value as Platform)) {
    throw new Error(`Invalid platform: ${value}`);
  }
}

export function validateGrades(
  grades: VoteGrade[],
  itemIds: Set<string>,
  gradeMin: number,
  gradeMax: number
): void {
  if (grades.length !== itemIds.size) {
    throw new Error("Must grade every poll item exactly once");
  }
  const seen = new Set<string>();
  for (const { itemId, grade } of grades) {
    if (!itemIds.has(itemId)) {
      throw new Error(`Unknown item: ${itemId}`);
    }
    if (seen.has(itemId)) {
      throw new Error(`Duplicate grade for item: ${itemId}`);
    }
    seen.add(itemId);
    if (!Number.isInteger(grade) || grade < gradeMin || grade > gradeMax) {
      throw new Error(
        `Grade ${grade} out of range [${gradeMin}, ${gradeMax}]`
      );
    }
  }
}

export function validatePollWindow(startsAt: Date, endsAt: Date): void {
  if (endsAt <= startsAt) {
    throw new Error("endsAt must be after startsAt");
  }
}

export function normalizeCreatePoll(input: CreatePollInput): CreatePollInput & {
  gradeMin: number;
  gradeMax: number;
  gradeLabels: string[];
  bestGradeIsLowest: boolean;
} {
  const gradeMin = input.gradeMin ?? DEFAULT_GRADE_MIN;
  const gradeMax = input.gradeMax ?? DEFAULT_GRADE_MAX;
  const gradeLabels = input.gradeLabels ?? defaultGradeLabels();
  const bestGradeIsLowest = input.bestGradeIsLowest ?? true;
  return {
    ...input,
    gradeMin,
    gradeMax,
    gradeLabels,
    bestGradeIsLowest,
    mockSnapshotEveryVote:
      input.platform === "mock" ? (input.mockSnapshotEveryVote ?? false) : false,
  };
}

export function validateCreatePoll(input: CreatePollInput): void {
  assertPlatform(input.platform);
  const normalized = normalizeCreatePoll(input);
  if (normalized.items.length < 1) {
    throw new Error("At least one item required");
  }
  if (normalized.gradeMax <= normalized.gradeMin) {
    throw new Error("gradeMax must be greater than gradeMin");
  }
  validateGradeLabels(
    normalized.gradeLabels,
    normalized.gradeMin,
    normalized.gradeMax
  );
  validatePollWindow(
    new Date(normalized.startsAt),
    new Date(normalized.endsAt)
  );
  if (normalized.visibility === "group" && !normalized.groupId) {
    throw new Error("groupId required when visibility is group");
  }
  if (input.mockSnapshotEveryVote && input.platform !== "mock") {
    throw new Error("mockSnapshotEveryVote is only valid for mock platform");
  }
  if (normalized.resultPolicy === "threshold_1" && normalized.platform !== "mock") {
    throw new Error("threshold_1 is only valid for mock platform");
  }
}
