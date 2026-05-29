/**
 * Génère tests/fixtures/fourteen-candidates-50-votes.json
 * — 14 candidats, 50 votes aléatoires (seed fixe), checkpoints aux votes 10/20/30/40/50.
 *
 * Usage: npx tsx scripts/generate-integration-fixture.ts
 * Après validation manuelle, commiter le JSON : le test d'intégration sera figé dessus.
 */
import { writeFileSync, mkdirSync, readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildDistribution,
  medianFromHistogram,
} from "../packages/shared/src/majority-judgment.js";
import { rankByMajorityJudgment } from "../packages/shared/src/dissatisfied-groups.js";
import {
  formatMedianWithBallotage,
  TIEBREAK_METHOD_ID,
  TIEBREAK_METHOD_DESCRIPTION,
} from "../packages/shared/src/tie-break.js";
import {
  defaultGradeLabels,
  DEFAULT_GRADE_MIN,
  DEFAULT_GRADE_MAX,
} from "../packages/shared/src/grade-scale.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = join(__dirname, "../tests/fixtures/fourteen-candidates-50-votes.json");
const force = process.argv.includes("--force");

if (existsSync(OUT) && !force) {
  const existing = JSON.parse(readFileSync(OUT, "utf8")) as {
    meta?: { frozen?: boolean };
  };
  if (existing.meta?.frozen) {
    console.error(
      "Fixture figée (meta.frozen). Régénération refusée — utilisez --force si l'algorithme MJ a changé."
    );
    process.exit(1);
  }
}
const RANDOM_SEED = 20260517;
const VOTER_COUNT = 50;
const CANDIDATE_COUNT = 14;
const CHECKPOINTS = [10, 20, 30, 40, 50];

function mulberry32(seed: number) {
  return function () {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const rand = mulberry32(RANDOM_SEED);
const gradeMin = DEFAULT_GRADE_MIN;
const gradeMax = DEFAULT_GRADE_MAX;
const gradeLabels = defaultGradeLabels();
const bestGradeIsLowest = true;

const itemLabels = Array.from(
  { length: CANDIDATE_COUNT },
  (_, i) => `Candidat ${String(i + 1).padStart(2, "0")}`
);

const votes: { subjectId: string; displayName: string; grades: number[] }[] = [];
for (let v = 0; v < VOTER_COUNT; v++) {
  const center = gradeMin + Math.floor(rand() * (gradeMax - gradeMin + 1));
  const grades = itemLabels.map(() => {
    if (rand() < 0.35) {
      return gradeMin + Math.floor(rand() * (gradeMax - gradeMin + 1));
    }
    const jitter = Math.floor(rand() * 5) - 2;
    return Math.min(gradeMax, Math.max(gradeMin, center + jitter));
  });
  votes.push({
    subjectId: `fixture-voter-${String(v + 1).padStart(3, "0")}`,
    displayName: `Votant ${v + 1}`,
    grades,
  });
}

type Hist = Map<number, number>;

function buildCheckpoint(upTo: number) {
  const histograms: Hist[] = itemLabels.map(() => new Map());
  for (let v = 0; v < upTo; v++) {
    const row = votes[v]!.grades;
    for (let i = 0; i < CANDIDATE_COUNT; i++) {
      const g = row[i]!;
      const h = histograms[i]!;
      h.set(g, (h.get(g) ?? 0) + 1);
    }
  }

  const items = itemLabels.map((label, i) => {
    const distMap = histograms[i]!;
    const rows = [...distMap.entries()].map(([grade, count]) => ({
      grade,
      count,
    }));
    const distribution = buildDistribution(rows, gradeMin, gradeMax);
    const { median, total } = medianFromHistogram(distribution);
    return {
      itemIndex: i,
      label,
      median,
      totalJudgments: total,
      distribution,
    };
  });

  const ranking = rankByMajorityJudgment(
    items.map((it) => ({
      itemId: `item-${it.itemIndex}`,
      label: it.label,
      distribution: it.distribution,
      median: it.median,
      totalJudgments: it.totalJudgments,
    })),
    gradeMin,
    gradeMax,
    bestGradeIsLowest
  ).map((r) => ({
    rank: r.rank,
    itemIndex: itemLabels.findIndex((l) => l === r.label),
    label: r.label,
    median: r.median,
    tiedAtMedian: r.tiedAtMedian ?? false,
    tieBreakMethod: r.tieBreakMethod,
    ballotage: r.ballotage,
    medianDisplay: formatMedianWithBallotage(
      r.median,
      gradeLabels,
      gradeMin,
      r.ballotage,
      r.tiedAtMedian
    ),
  }));

  const rankByIndex = new Map(
    ranking.map((r) => [r.itemIndex, r.rank])
  );
  const tiedByIndex = new Map(
    ranking.map((r) => [r.itemIndex, r.tiedAtMedian])
  );

  return {
    afterVoteCount: upTo,
    expected: {
      voteCount: upTo,
      visible: true,
      policy: "threshold_10",
      gradeMin,
      gradeMax,
      gradeLabels,
      bestGradeIsLowest,
      tieBreakMethod: TIEBREAK_METHOD_ID,
      tieBreakMethodDescription: TIEBREAK_METHOD_DESCRIPTION,
      items: items.map((it) => ({
        itemIndex: it.itemIndex,
        label: it.label,
        median: it.median,
        totalJudgments: it.totalJudgments,
        distribution: it.distribution,
        rank: rankByIndex.get(it.itemIndex),
        tiedAtMedian: tiedByIndex.get(it.itemIndex) ?? false,
        tieBreakMethod: ranking.find((x) => x.label === it.label)?.tieBreakMethod,
        ballotage: ranking.find((x) => x.label === it.label)?.ballotage,
        medianDisplay: ranking.find((x) => x.label === it.label)?.medianDisplay,
      })),
      ranking,
    },
  };
}

const fixture = {
  meta: {
    description:
      "Sondage public 14 candidats, échelle 1–7, threshold_10, 50 votants figés",
    randomSeed: RANDOM_SEED,
    generatedAt: new Date().toISOString(),
    voterCount: VOTER_COUNT,
    candidateCount: CANDIDATE_COUNT,
    checkpoints: CHECKPOINTS,
  },
  poll: {
    name: "Intégration — 14 candidats (MJ)",
    creatorId: "integration-test",
    platform: "mock",
    items: itemLabels.map((label, sortOrder) => ({ label, sortOrder })),
    gradeMin,
    gradeMax,
    gradeLabels,
    bestGradeIsLowest,
    visibility: "public",
    voterMode: "public",
    resultPolicy: "threshold_10",
    dataRegion: "EU",
    startsAt: "2026-01-01T00:00:00.000Z",
    endsAt: "2027-01-01T00:00:00.000Z",
  },
  votes,
  checkpoints: CHECKPOINTS.map(buildCheckpoint),
};

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, JSON.stringify(fixture, null, 2), "utf8");
console.log(`Fixture écrite : ${OUT}`);
console.log(`Votes : ${votes.length}, checkpoints : ${CHECKPOINTS.join(", ")}`);
