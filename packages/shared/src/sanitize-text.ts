/** Caractères de contrôle interdits en base (dont tab / saut de ligne pour TSV). */
const UNSAFE_TEXT_PATTERN = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;

export const STORED_TEXT_LIMITS = {
  displayName: 200,
  pollName: 500,
  itemLabel: 500,
  gradeLabel: 100,
  campaignName: 500,
} as const;

/**
 * Nettoie une chaîne avant stockage ou export TSV :
 * retire tabulations, retours ligne et autres caractères de contrôle.
 */
export function sanitizeStoredText(
  value: string,
  maxLength: number
): string {
  const cleaned = value
    .replace(UNSAFE_TEXT_PATTERN, " ")
    .replace(/\t/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (cleaned.length === 0) {
    return "";
  }
  return cleaned.length > maxLength ? cleaned.slice(0, maxLength) : cleaned;
}

export function sanitizeStoredTextRequired(
  value: string,
  maxLength: number,
  field = "value"
): string {
  const cleaned = sanitizeStoredText(value, maxLength);
  if (!cleaned) {
    throw new Error(`${field} must not be empty`);
  }
  return cleaned;
}

export function sanitizeStoredTextOptional(
  value: string | undefined | null,
  maxLength: number
): string | undefined {
  if (value == null || value === "") {
    return undefined;
  }
  const cleaned = sanitizeStoredText(value, maxLength);
  return cleaned || undefined;
}

/** Valeur sûre pour une cellule TSV (ré-sanitise par précaution). */
export function tsvCell(value: string | undefined | null): string {
  if (value == null) return "";
  return sanitizeStoredText(String(value), 2000);
}

export function formatTsvRow(cells: (string | undefined | null)[]): string {
  return cells.map((c) => tsvCell(c)).join("\t");
}
