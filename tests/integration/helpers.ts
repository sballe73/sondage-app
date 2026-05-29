/** Snapshot normalisé pour comparaison (sous-ensemble des champs utiles). */
interface ResultsPayloadShape {
  voteCount: number;
  visible: boolean;
  policy: string;
  gradeMin: number;
  gradeMax: number;
  gradeLabels: string[];
  bestGradeIsLowest: boolean;
  items: {
    label: string;
    median: number | null;
    totalJudgments: number;
    distribution: Record<number, number> | Record<string, number>;
    rank?: number;
    tiedAtMedian?: boolean;
    tieBreakMethod?: string;
    ballotage?: {
      method: string;
      supportersPercent: number;
      opponentsPercent: number;
      display: string;
    };
    medianDisplay?: string;
  }[];
  ranking: {
    rank: number;
    label: string;
    median: number | null;
    tiedAtMedian?: boolean;
    tieBreakMethod?: string;
    ballotage?: {
      method: string;
      supportersPercent: number;
      opponentsPercent: number;
      display: string;
    };
    medianDisplay?: string;
  }[];
  tieBreakMethod?: string;
  tieBreakMethodDescription?: string;
}

export interface FixtureCheckpoint {
  afterVoteCount: number;
  expected: {
    voteCount: number;
    visible: boolean;
    policy: string;
    gradeMin: number;
    gradeMax: number;
    gradeLabels: string[];
    bestGradeIsLowest: boolean;
    items: {
      itemIndex: number;
      label: string;
      median: number | null;
      totalJudgments: number;
      distribution: Record<number, number>;
      rank?: number;
      tiedAtMedian?: boolean;
      tieBreakMethod?: string;
      ballotage?: {
        method: string;
        supportersPercent: number;
        opponentsPercent: number;
        display: string;
      };
      medianDisplay?: string;
    }[];
    ranking: {
      rank: number;
      itemIndex: number;
      label: string;
      median: number | null;
      tiedAtMedian: boolean;
      tieBreakMethod?: string;
      ballotage?: {
        method: string;
        supportersPercent: number;
        opponentsPercent: number;
        display: string;
      };
      medianDisplay?: string;
    }[];
    tieBreakMethod?: string;
    tieBreakMethodDescription?: string;
  };
}

export interface VoteFixture {
  subjectId: string;
  displayName: string;
  grades: number[];
}

export interface IntegrationFixture {
  meta: {
    description: string;
    randomSeed: number;
    generatedAt: string;
    validatedAt?: string;
    frozen?: boolean;
    voterCount: number;
    candidateCount: number;
    checkpoints: number[];
  };
  poll: {
    name: string;
    creatorId: string;
    platform: string;
    items: { label: string; sortOrder: number }[];
    gradeMin: number;
    gradeMax: number;
    gradeLabels: string[];
    bestGradeIsLowest: boolean;
    visibility: string;
    voterMode: string;
    resultPolicy: string;
    dataRegion: string;
    startsAt: string;
    endsAt: string;
  };
  votes: VoteFixture[];
  checkpoints: FixtureCheckpoint[];
}


/** Normalise un snapshot pour comparaison (clés numériques, champs stables). */
export function normalizeResultsPayload(
  payload: ResultsPayloadShape | FixtureCheckpoint["expected"]
) {
  const distNorm = (d: Record<number, number> | Record<string, number>) => {
    const out: Record<string, number> = {};
    for (let g = payload.gradeMin; g <= payload.gradeMax; g++) {
      out[String(g)] = Number(d[g] ?? d[String(g)] ?? 0);
    }
    return out;
  };

  const itemsByLabel = new Map(
    payload.items.map((it) => {
      const label = "label" in it ? it.label : "";
      return [
        label,
        {
          label,
          median: it.median,
          totalJudgments: it.totalJudgments,
          distribution: distNorm(it.distribution),
          rank: "rank" in it ? it.rank : undefined,
          tiedAtMedian: "tiedAtMedian" in it ? it.tiedAtMedian : undefined,
          tieBreakMethod:
            "tieBreakMethod" in it ? it.tieBreakMethod : undefined,
          ballotage: "ballotage" in it ? it.ballotage : undefined,
          medianDisplay: "medianDisplay" in it ? it.medianDisplay : undefined,
        },
      ];
    })
  );

  const ranking = [...payload.ranking]
    .map((r) => ({
      rank: r.rank,
      label: r.label,
      median: r.median,
      tiedAtMedian: r.tiedAtMedian ?? false,
      tieBreakMethod: "tieBreakMethod" in r ? r.tieBreakMethod : undefined,
      ballotage: "ballotage" in r ? r.ballotage : undefined,
      medianDisplay: "medianDisplay" in r ? r.medianDisplay : undefined,
    }))
    .sort((a, b) => a.rank - b.rank || a.label.localeCompare(b.label));

  const items = [...itemsByLabel.values()].sort((a, b) =>
    a.label.localeCompare(b.label)
  );

  return {
    voteCount: payload.voteCount,
    visible: payload.visible,
    policy: payload.policy,
    gradeMin: payload.gradeMin,
    gradeMax: payload.gradeMax,
    gradeLabels: payload.gradeLabels,
    bestGradeIsLowest: payload.bestGradeIsLowest,
    tieBreakMethod:
      "tieBreakMethod" in payload ? payload.tieBreakMethod : undefined,
    tieBreakMethodDescription:
      "tieBreakMethodDescription" in payload
        ? payload.tieBreakMethodDescription
        : undefined,
    items,
    ranking,
  };
}
