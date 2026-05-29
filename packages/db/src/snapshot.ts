import {
  buildDistribution,
  medianFromHistogram,
  isResultsVisible,
  rankByMajorityJudgment,
  formatMedianWithBallotage,
  TIEBREAK_METHOD_ID,
  TIEBREAK_METHOD_DESCRIPTION,
  type PollResultsSnapshot,
  type ResultPolicy,
} from "@sondage/shared";
import { getPollById } from "./repositories/polls.js";
import {
  getHistogramRows,
  getVoteCount,
  saveSnapshot,
} from "./repositories/results.js";

export async function computeAndSaveSnapshot(
  pollId: string,
  version: number,
  forceVisible?: boolean
): Promise<PollResultsSnapshot> {
  const data = await getPollById(pollId);
  if (!data) throw new Error("Poll not found");
  const { poll, items } = data;
  const voteCount = await getVoteCount(pollId);
  const rows = await getHistogramRows(pollId);
  const visible =
    forceVisible ??
    isResultsVisible(
      poll.resultPolicy as ResultPolicy,
      voteCount,
      poll.endsAt
    );

  const itemResults = items.map((item) => {
    const itemRows = rows
      .filter((r) => r.itemId === item.id)
      .map((r) => ({ grade: r.grade, count: r.count }));
    const distribution = buildDistribution(
      itemRows,
      poll.gradeMin,
      poll.gradeMax
    );
    const { median, total } = medianFromHistogram(distribution);
    return {
      itemId: item.id,
      label: item.label,
      median: visible ? median : null,
      totalJudgments: total,
      distribution: visible ? distribution : {},
    };
  });

  const ranking = visible
    ? rankByMajorityJudgment(
        itemResults,
        poll.gradeMin,
        poll.gradeMax,
        poll.bestGradeIsLowest ?? true
      )
    : [];

  const gradeLabels = (poll.gradeLabels as string[]) ?? [];
  const rankingWithDisplay = ranking.map((r) => ({
    ...r,
    medianDisplay: formatMedianWithBallotage(
      r.median,
      gradeLabels,
      poll.gradeMin,
      r.ballotage,
      r.tiedAtMedian
    ),
  }));

  const rankByItemId = new Map(rankingWithDisplay.map((r) => [r.itemId, r]));
  const itemsWithRank = itemResults.map((item) => {
    const r = rankByItemId.get(item.itemId);
    return {
      ...item,
      rank: r?.rank,
      tiedAtMedian: r?.tiedAtMedian,
      tieBreakMethod: r?.tieBreakMethod,
      ballotage: r?.ballotage,
      medianDisplay: r?.medianDisplay,
    };
  });

  const snapshot: PollResultsSnapshot = {
    pollId,
    version,
    voteCount,
    computedAt: new Date().toISOString(),
    gradeMin: poll.gradeMin,
    gradeMax: poll.gradeMax,
    gradeLabels,
    bestGradeIsLowest: poll.bestGradeIsLowest ?? true,
    items: itemsWithRank,
    ranking: rankingWithDisplay,
    tieBreakMethod: visible ? TIEBREAK_METHOD_ID : undefined,
    tieBreakMethodDescription: visible ? TIEBREAK_METHOD_DESCRIPTION : undefined,
    policy: poll.resultPolicy as ResultPolicy,
    visible,
  };

  await saveSnapshot(pollId, version, voteCount, visible, snapshot);
  return snapshot;
}
