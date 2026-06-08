import { Redis } from "ioredis";
import { getVoteCount, getHistogramRows } from "@sondage/db";

const pollId = process.argv[2] ?? "8db4338c-ba03-414b-b4b7-b7a8c0051624";
const r = new Redis(process.env.REDIS_URL ?? "redis://localhost:6379");
const stream = "vote:events";
const group = "aggregators";

try {
  const len = await r.xlen(stream);
  console.log("XLEN", len);
  try {
    const groups = await r.xinfo("GROUPS", stream);
    console.log("GROUPS", JSON.stringify(groups, null, 2));
    const pending = await r.xpending(stream, group, "-", "+", 10);
    console.log("XPENDING", JSON.stringify(pending));
  } catch (e) {
    console.log("GROUP INFO ERR", e.message);
  }
  const range = await r.xrange(stream, "-", "+", "COUNT", 10);
  for (const [id, fields] of range) {
    const idx = fields.indexOf("payload");
    const payload = JSON.parse(fields[idx + 1] ?? "{}");
    if (payload.pollId === pollId) {
      console.log("EVENT", id, payload.eventId, payload.pollId);
    }
  }
  const vc = await getVoteCount(pollId);
  const hist = await getHistogramRows(pollId);
  console.log("DB voteCount", vc, "histogram rows", hist.length, hist);
} finally {
  await r.quit();
}
