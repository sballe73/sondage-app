/** Échelle MJ par défaut : 1 = meilleur, 7 = moins bon. */
export const DEFAULT_GRADE_MIN = 1;
export const DEFAULT_GRADE_MAX = 7;

export const DEFAULT_GRADE_LABELS: readonly string[] = [
  "Excellent",
  "Très bien",
  "Bien",
  "Assez bien",
  "Passable",
  "Insuffisant",
  "À Rejeter",
] as const;

export function defaultGradeLabels(): string[] {
  return [...DEFAULT_GRADE_LABELS];
}

export function validateGradeLabels(
  labels: string[],
  gradeMin: number,
  gradeMax: number
): void {
  const expected = gradeMax - gradeMin + 1;
  if (labels.length !== expected) {
    throw new Error(
      `gradeLabels must have ${expected} entries for grades ${gradeMin}–${gradeMax}`
    );
  }
  for (const label of labels) {
    if (!label?.trim()) {
      throw new Error("Each grade label must be non-empty");
    }
  }
}

export function labelForGrade(
  grade: number,
  labels: string[],
  gradeMin: number
): string {
  const index = grade - gradeMin;
  return labels[index] ?? String(grade);
}
