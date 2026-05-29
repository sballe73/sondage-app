import type {
  MajorityJudgmentRankingEntry,
  RankedJudgmentInput,
} from "./types.js";
import {
  TIEBREAK_METHOD_ID,
  buildBallotageDisplay,
  type TieBreakBallotage,
  type TieBreakMethodId,
} from "./tie-break.js";

export type {
  RankedJudgmentInput,
  MajorityJudgmentRankingEntry,
  TieBreakMethodId,
  TieBreakBallotage,
};

export interface TieBreakCandidate {
  itemId: string;
  label: string;
  distribution: Record<number, number>;
  total: number;
  median: number;
  bestGradeIsLowest: boolean;
  supporterStep: number;
  opponentStep: number;
}

interface RankedWithBallot {
  candidate: TieBreakCandidate;
  ballotage: TieBreakBallotage | null;
}

function supportersPct(
  c: TieBreakCandidate,
  gradeMin: number,
  gradeMax: number
): number {
  if (c.total === 0) return 0;
  const m = c.median;
  let n = 0;
  if (c.bestGradeIsLowest) {
    const ceiling = m - 1 - c.supporterStep;
    if (ceiling < gradeMin) return 0;
    for (let g = gradeMin; g <= ceiling; g++) n += c.distribution[g] ?? 0;
  } else {
    const floor = m + 1 + c.supporterStep;
    if (floor > gradeMax) return 0;
    for (let g = floor; g <= gradeMax; g++) n += c.distribution[g] ?? 0;
  }
  return n / c.total;
}

function opponentsPct(
  c: TieBreakCandidate,
  gradeMin: number,
  gradeMax: number
): number {
  if (c.total === 0) return 0;
  const m = c.median;
  let n = 0;
  if (c.bestGradeIsLowest) {
    const floor = m + 1 + c.opponentStep;
    if (floor > gradeMax) return 0;
    for (let g = floor; g <= gradeMax; g++) n += c.distribution[g] ?? 0;
  } else {
    const ceiling = m - 1 - c.opponentStep;
    if (ceiling < gradeMin) return 0;
    for (let g = gradeMin; g <= ceiling; g++) n += c.distribution[g] ?? 0;
  }
  return n / c.total;
}

function ballotageFor(
  c: TieBreakCandidate,
  gradeMin: number,
  gradeMax: number,
  exAequo = false
): TieBreakBallotage {
  const supporters = supportersPct(c, gradeMin, gradeMax);
  const opponents = opponentsPct(c, gradeMin, gradeMax);
  return {
    method: TIEBREAK_METHOD_ID,
    supportersPercent: Math.round(supporters * 1000) / 10,
    opponentsPercent: Math.round(opponents * 1000) / 10,
    display: buildBallotageDisplay(supporters, opponents, exAequo),
  };
}

function distributionsIdentical(a: TieBreakCandidate, b: TieBreakCandidate): boolean {
  const keys = new Set([
    ...Object.keys(a.distribution),
    ...Object.keys(b.distribution),
  ]);
  for (const k of keys) {
    const g = Number(k);
    if ((a.distribution[g] ?? 0) !== (b.distribution[g] ?? 0)) return false;
  }
  return true;
}

function allIdentical(items: TieBreakCandidate[]): boolean {
  return items.every((c) => distributionsIdentical(c, items[0]!));
}

function advanceSupporters(
  items: TieBreakCandidate[],
  tiedIds: Set<string>
): TieBreakCandidate[] {
  return items.map((c) =>
    tiedIds.has(c.itemId) ? { ...c, supporterStep: c.supporterStep + 1 } : c
  );
}

function advanceOpponents(
  items: TieBreakCandidate[],
  tiedIds: Set<string>
): TieBreakCandidate[] {
  return items.map((c) =>
    tiedIds.has(c.itemId) ? { ...c, opponentStep: c.opponentStep + 1 } : c
  );
}

function makeTieCandidate(
  item: RankedJudgmentInput,
  median: number,
  bestGradeIsLowest: boolean
): TieBreakCandidate {
  return {
    itemId: item.itemId,
    label: item.label,
    distribution: item.distribution,
    total: item.totalJudgments,
    median,
    bestGradeIsLowest,
    supporterStep: 0,
    opponentStep: 0,
  };
}

export function rankTiedByDissatisfiedGroups(
  items: TieBreakCandidate[],
  gradeMin: number,
  gradeMax: number,
  depth = 0
): RankedWithBallot[] {
  if (items.length <= 1) {
    return items.map((c) => ({
      candidate: c,
      ballotage: items.length === 1 ? ballotageFor(c, gradeMin, gradeMax) : null,
    }));
  }
  if (depth > gradeMax - gradeMin + 2) {
    return [...items]
      .sort((a, b) => a.label.localeCompare(b.label))
      .map((c) => ({ candidate: c, ballotage: ballotageFor(c, gradeMin, gradeMax) }));
  }
  if (allIdentical(items)) {
    return [...items]
      .sort((a, b) => a.label.localeCompare(b.label))
      .map((c) => ({
        candidate: c,
        ballotage: ballotageFor(c, gradeMin, gradeMax, true),
      }));
  }

  type Entry = {
    value: number;
    kind: "supporters" | "opponents";
    candidate: TieBreakCandidate;
  };

  const entries: Entry[] = [];
  for (const c of items) {
    entries.push({
      value: supportersPct(c, gradeMin, gradeMax),
      kind: "supporters",
      candidate: c,
    });
    entries.push({
      value: opponentsPct(c, gradeMin, gradeMax),
      kind: "opponents",
      candidate: c,
    });
  }

  const maxValue = Math.max(...entries.map((e) => e.value));
  const atMax = entries.filter((e) => e.value === maxValue);
  const supAtMax = atMax.filter((e) => e.kind === "supporters");
  const oppAtMax = atMax.filter((e) => e.kind === "opponents");

  const attachBallot = (list: TieBreakCandidate[]) =>
    list.map((c) => ({ candidate: c, ballotage: ballotageFor(c, gradeMin, gradeMax) }));

  if (supAtMax.length > 0 && oppAtMax.length > 0) {
    const loserIds = new Set(oppAtMax.map((e) => e.candidate.itemId));
    const losers = items.filter((c) => loserIds.has(c.itemId));
    const rest = items.filter((c) => !loserIds.has(c.itemId));
    if (rest.length === 0) {
      const advanced = advanceOpponents(
        items,
        new Set(items.map((c) => c.itemId))
      );
      return rankTiedByDissatisfiedGroups(advanced, gradeMin, gradeMax, depth + 1);
    }
    return [
      ...rankTiedByDissatisfiedGroups(rest, gradeMin, gradeMax, depth + 1),
      ...rankTiedByDissatisfiedGroups(losers, gradeMin, gradeMax, depth + 1),
    ];
  }

  if (supAtMax.length === 1) {
    const winner = supAtMax[0]!.candidate;
    const rest = items.filter((c) => c.itemId !== winner.itemId);
    return [
      { candidate: winner, ballotage: ballotageFor(winner, gradeMin, gradeMax) },
      ...rankTiedByDissatisfiedGroups(rest, gradeMin, gradeMax, depth + 1),
    ];
  }

  if (oppAtMax.length === 1) {
    const loser = oppAtMax[0]!.candidate;
    const rest = items.filter((c) => c.itemId !== loser.itemId);
    return [
      ...rankTiedByDissatisfiedGroups(rest, gradeMin, gradeMax, depth + 1),
      { candidate: loser, ballotage: ballotageFor(loser, gradeMin, gradeMax) },
    ];
  }

  if (supAtMax.length > 1) {
    const tiedIds = new Set(supAtMax.map((e) => e.candidate.itemId));
    return rankTiedByDissatisfiedGroups(
      advanceSupporters(items, tiedIds),
      gradeMin,
      gradeMax,
      depth + 1
    );
  }

  if (oppAtMax.length > 1) {
    const tiedIds = new Set(oppAtMax.map((e) => e.candidate.itemId));
    return rankTiedByDissatisfiedGroups(
      advanceOpponents(items, tiedIds),
      gradeMin,
      gradeMax,
      depth + 1
    );
  }

  return attachBallot([...items].sort((a, b) => a.label.localeCompare(b.label)));
}

/** Classement MJ : meilleure médiane d'abord, départage par groupes d'insatisfaits. */
export function rankByMajorityJudgment(
  items: RankedJudgmentInput[],
  gradeMin: number,
  gradeMax: number,
  bestGradeIsLowest = true
): MajorityJudgmentRankingEntry[] {
  const withMedian = items.filter((i) => i.median !== null);
  const withoutMedian = items.filter((i) => i.median === null);

  const byMedian = new Map<number, RankedJudgmentInput[]>();
  for (const item of withMedian) {
    const m = item.median!;
    const list = byMedian.get(m) ?? [];
    list.push(item);
    byMedian.set(m, list);
  }

  const medians = [...byMedian.keys()].sort((a, b) =>
    bestGradeIsLowest ? a - b : b - a
  );
  const ordered: MajorityJudgmentRankingEntry[] = [];
  let rank = 1;

  for (const m of medians) {
    const group = byMedian.get(m)!;
    const tieCandidates = group.map((item) =>
      makeTieCandidate(item, m, bestGradeIsLowest)
    );

    const sameDistribution =
      group.length > 1 &&
      group.every((item) =>
        distributionsIdentical(
          makeTieCandidate(item, m, bestGradeIsLowest),
          tieCandidates[0]!
        )
      );

    if (sameDistribution) {
      for (const item of group) {
        const ballotage = ballotageFor(
          makeTieCandidate(item, m, bestGradeIsLowest),
          gradeMin,
          gradeMax,
          true
        );
        ordered.push({
          rank,
          itemId: item.itemId,
          label: item.label,
          median: m,
          tiedAtMedian: true,
          tieBreakMethod: TIEBREAK_METHOD_ID,
          ballotage,
        });
      }
      rank += 1;
      continue;
    }

    const sortedRows =
      group.length > 1
        ? rankTiedByDissatisfiedGroups(tieCandidates, gradeMin, gradeMax)
        : tieCandidates.map((c) => ({
            candidate: c,
            ballotage: ballotageFor(c, gradeMin, gradeMax),
          }));

    for (const row of sortedRows) {
      ordered.push({
        rank,
        itemId: row.candidate.itemId,
        label: row.candidate.label,
        median: m,
        tiedAtMedian: group.length > 1,
        tieBreakMethod: group.length > 1 ? TIEBREAK_METHOD_ID : undefined,
        ballotage: group.length > 1 ? row.ballotage ?? undefined : undefined,
      });
      rank++;
    }
  }

  for (const item of withoutMedian) {
    ordered.push({
      rank,
      itemId: item.itemId,
      label: item.label,
      median: null,
    });
    rank++;
  }

  return ordered;
}
