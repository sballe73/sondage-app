/**
 * Majority judgment: median grade from a histogram.
 */
export function medianFromHistogram(
  distribution: Record<number, number>
): { median: number | null; total: number } {
  const grades = Object.keys(distribution)
    .map(Number)
    .sort((a, b) => a - b);
  const total = grades.reduce((sum, g) => sum + (distribution[g] ?? 0), 0);
  if (total === 0) {
    return { median: null, total: 0 };
  }
  const target = Math.ceil(total / 2);
  let cumulative = 0;
  for (const grade of grades) {
    cumulative += distribution[grade] ?? 0;
    if (cumulative >= target) {
      return { median: grade, total };
    }
  }
  return { median: grades[grades.length - 1] ?? null, total };
}

export function buildDistribution(
  rows: { grade: number; count: number }[],
  gradeMin: number,
  gradeMax: number
): Record<number, number> {
  const dist: Record<number, number> = {};
  for (let g = gradeMin; g <= gradeMax; g++) {
    dist[g] = 0;
  }
  for (const row of rows) {
    if (row.grade >= gradeMin && row.grade <= gradeMax) {
      dist[row.grade] = (dist[row.grade] ?? 0) + row.count;
    }
  }
  return dist;
}
