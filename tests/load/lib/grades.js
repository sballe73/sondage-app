/**
 * Build random grades for one voter (ported from scripts/simulate-votes.sh).
 * @param {{ id: string, sortOrder: number }[]} items
 * @param {number} gradeMin
 * @param {number} gradeMax
 * @param {number} voterIndex
 * @returns {{ itemId: string, grade: number }[]}
 */
export function buildGrades(items, gradeMin, gradeMax, voterIndex) {
  const sorted = [...items].sort((a, b) => a.sortOrder - b.sortOrder);
  const span = gradeMax - gradeMin + 1;
  const center = gradeMin + Math.floor(Math.random() * span);

  return sorted.map((item) => {
    const jitter = Math.floor(Math.random() * span) - Math.floor(span / 2);
    let grade = center + jitter + (voterIndex % 3) - 1;
    grade = Math.min(gradeMax, Math.max(gradeMin, grade));
    if (Math.random() < 0.35) {
      grade = gradeMin + Math.floor(Math.random() * span);
    }
    return { itemId: item.id, grade };
  });
}
