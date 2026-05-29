import { createPoll } from "./repositories/polls.js";
import { closeDb } from "./client.js";

const startsAt = new Date();
startsAt.setHours(startsAt.getHours() - 1);
const endsAt = new Date();
endsAt.setDate(endsAt.getDate() + 7);

const { poll, items } = await createPoll({
  name: "Exemple — Présidentielle MJ",
  creatorId: "demo-organizer",
  platform: "mock",
  items: [
    { label: "Candidat A", sortOrder: 0 },
    { label: "Candidat B", sortOrder: 1 },
    { label: "Candidat C", sortOrder: 2 },
  ],
  gradeMin: 1,
  gradeMax: 7,
  startsAt: startsAt.toISOString(),
  endsAt: endsAt.toISOString(),
  visibility: "public",
  voterMode: "public",
  resultPolicy: "threshold_10",
  dataRegion: "EU",
});

console.log("Seed poll created:", poll.id);
console.log("Items:", items.map((i) => ({ id: i.id, label: i.label })));
console.log("\nTry:");
console.log(
  `  curl -X POST http://localhost:3000/auth/mock/login -H 'Content-Type: application/json' -d '{"pollId":"${poll.id}","platform":"mock","subjectId":"voter-1","displayName":"Alice"}'`
);

await closeDb();
