/**
 * Affiche les checkpoints de la fixture pour validation manuelle.
 * Usage: npx tsx scripts/print-integration-checkpoints.ts
 */
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixture = JSON.parse(
  readFileSync(
    join(__dirname, "../tests/fixtures/fourteen-candidates-50-votes.json"),
    "utf8"
  )
);

const labels = fixture.poll.gradeLabels;

for (const cp of fixture.checkpoints) {
  console.log(`\n=== Après ${cp.afterVoteCount} votes ===\n`);
  if (cp.expected.tieBreakMethodDescription) {
    console.log("Départage:", cp.expected.tieBreakMethodDescription);
    console.log("");
  }
  console.log("Classement:");
  for (const r of cp.expected.ranking) {
    const line =
      r.medianDisplay ??
      `${r.median} — ${labels[r.median! - 1] ?? r.median}${
        r.ballotage ? ` (${r.ballotage.display})` : ""
      }`;
    console.log(`  ${r.rank}. ${r.label} — ${line}`);
  }
  console.log("\nHistogrammes (effectifs par note 1–7):");
  for (const it of cp.expected.items) {
    const dist = Object.entries(it.distribution)
      .sort(([a], [b]) => Number(a) - Number(b))
      .map(([g, c]) => `${g}:${c}`)
      .join(" ");
    console.log(`  ${it.label}: médiane=${it.median} | ${dist}`);
  }
}
