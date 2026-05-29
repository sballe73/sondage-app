/**
 * Méthode des groupes d'insatisfaits (départage des ex-aequo au jugement majoritaire).
 * @see https://fr.wikipedia.org/wiki/Jugement_majoritaire#Méthode_des_groupes_d'insatisfaits
 */
export const TIEBREAK_METHOD_ID = "dissatisfied_groups" as const;
export type TieBreakMethodId = typeof TIEBREAK_METHOD_ID;

export const TIEBREAK_METHOD_DESCRIPTION =
  "Méthode des groupes d'insatisfaits (équivalente au siphonnage médian) : " +
  "pour chaque candidat à la même mention majoritaire, on compare le pourcentage de " +
  "partisans (jugements strictement meilleurs que la médiane) et d'opposants " +
  "(strictement moins bons). Le plus grand pourcentage tranche ; en cas d'égalité " +
  "entre partisans et opposants, les opposants l'emportent. Si plusieurs candidats " +
  "restent à égalité, on recommence en élargissant les groupes (successeurs des " +
  "partisans ou des opposants). Profils de vote identiques : ex-aequo conservé.";

export interface TieBreakBallotage {
  method: TieBreakMethodId;
  /** Partisans : jugements strictement meilleurs que la médiane (0–100). */
  supportersPercent: number;
  /** Opposants : jugements strictement moins bons que la médiane (0–100). */
  opponentsPercent: number;
  /** Texte court pour l’affichage après la médiane, ex. « partisans 45 %, opposants 20 % ». */
  display: string;
}

export function pctToDisplay(p: number): number {
  return Math.round(p * 1000) / 10;
}

export function buildBallotageDisplay(
  supportersPct: number,
  opponentsPct: number,
  exAequo = false
): string {
  if (exAequo) return "ex-aequo";
  const s = pctToDisplay(supportersPct);
  const o = pctToDisplay(opponentsPct);
  return `partisans ${s} %, opposants ${o} %`;
}

import { labelForGrade } from "./grade-scale.js";

/** Ex. « 3 — Bien (partisans 45 %, opposants 20 %) » ou « 3 — Bien » si pas de départage. */
export function formatMedianWithBallotage(
  median: number | null,
  gradeLabels: string[],
  gradeMin: number,
  ballotage?: TieBreakBallotage | null,
  tiedAtMedian?: boolean
): string {
  if (median === null) return "—";
  const mention = labelForGrade(median, gradeLabels, gradeMin);
  if (!tiedAtMedian || !ballotage) {
    return `${median} — ${mention}`;
  }
  return `${median} — ${mention} (${ballotage.display})`;
}
