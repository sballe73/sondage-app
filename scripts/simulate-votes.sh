#!/usr/bin/env bash
# Simule N votes mock sur un sondage (défaut: 10 pour threshold_10).
# Chaque votant attribue une note aléatoire (indépendante) à chaque candidat.
# Usage: ./scripts/simulate-votes.sh <POLL_ID> [N] [START_INDEX]
#   START_INDEX — premier sim-voter-N (défaut : auto après le plus grand sim-voter-* existant)
set -euo pipefail

POLL_ID="${1:?Usage: $0 <POLL_ID> [count] [start_index]}"
COUNT="${2:-10}"
API="${API_BASE:-http://localhost:3000}"
REGION="${DATA_REGION:-EU}"
START_INDEX="${3:-}"

echo "Poll: $POLL_ID — $COUNT votes via $API"

POLL_JSON=$(curl -sS "$API/polls/$POLL_ID" -H "X-Data-Region: $REGION")
if ! echo "$POLL_JSON" | node -e "
const p = JSON.parse(require('fs').readFileSync(0, 'utf8'));
if (p.error || !p.items?.length) process.exit(1);
" 2>/dev/null; then
  echo "Impossible de charger le sondage $POLL_ID" >&2
  echo "$POLL_JSON" >&2
  exit 1
fi

if [ -z "$START_INDEX" ]; then
  BALLOTS_JSON=$(curl -sS "$API/polls/$POLL_ID/ballots" -H "X-Data-Region: $REGION" 2>/dev/null || echo '{"ballots":[]}')
  START_INDEX=$(echo "$BALLOTS_JSON" | node -e "
const data = JSON.parse(require('fs').readFileSync(0, 'utf8'));
const ballots = data.ballots || [];
let max = 0;
for (const b of ballots) {
  const m = /^sim-voter-(\d+)$/.exec(b.subjectId || '');
  if (m) max = Math.max(max, Number(m[1]));
}
process.stdout.write(String(max + 1));
")
fi

END_INDEX=$((START_INDEX + COUNT - 1))
echo "Votants : sim-voter-$START_INDEX … sim-voter-$END_INDEX"

export POLL_JSON
ACCEPTED=0
REJECTED=0

grades_json() {
  local voter_index=$1
  VOTER_INDEX="$voter_index" node <<'NODE'
const poll = JSON.parse(process.env.POLL_JSON);
const items = [...poll.items].sort((a, b) => a.sortOrder - b.sortOrder);
const min = poll.gradeMin;
const max = poll.gradeMax;
const span = max - min + 1;
const voterIndex = Number(process.env.VOTER_INDEX);

const center = min + Math.floor(Math.random() * span);
const grades = items.map((item) => {
  const jitter = Math.floor(Math.random() * span) - Math.floor(span / 2);
  let grade = center + jitter + (voterIndex % 3) - 1;
  grade = Math.min(max, Math.max(min, grade));
  if (Math.random() < 0.35) {
    grade = min + Math.floor(Math.random() * span);
  }
  return { itemId: item.id, grade };
});
console.log(JSON.stringify(grades));
NODE
}

for i in $(seq "$START_INDEX" "$END_INDEX"); do
  SUBJECT="sim-voter-$i"
  TOKEN=$(curl -sS -X POST "$API/auth/mock/login" \
    -H "Content-Type: application/json" \
    -H "X-Data-Region: $REGION" \
    -d "{\"pollId\":\"$POLL_ID\",\"platform\":\"mock\",\"subjectId\":\"$SUBJECT\",\"displayName\":\"Votant $i\"}" \
    | node -e "const j=JSON.parse(require('fs').readFileSync(0,'utf8')); if(!j.accessToken) { console.error(j); process.exit(1);} console.log(j.accessToken);")

  GRADES=$(grades_json "$i")
  IDEM_KEY="sim-${POLL_ID}-${SUBJECT}-$(date +%s)-$RANDOM"
  HTTP=$(curl -sS -o /tmp/vote-res.json -w "%{http_code}" -X POST "$API/polls/$POLL_ID/votes" \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer $TOKEN" \
    -H "X-Data-Region: $REGION" \
    -H "Idempotency-Key: $IDEM_KEY" \
    -d "{\"grades\":$GRADES}")

  GRADES_PREVIEW=$(echo "$GRADES" | node -e "
const g=JSON.parse(require('fs').readFileSync(0,'utf8'));
process.stdout.write(g.map(x=>x.grade).join(','));
")

  if [ "$HTTP" = "202" ]; then
    ACCEPTED=$((ACCEPTED + 1))
    echo "  ✓ $SUBJECT: HTTP $HTTP — $GRADES_PREVIEW"
  elif [ "$HTTP" = "409" ]; then
    REJECTED=$((REJECTED + 1))
    echo "  ✗ $SUBJECT: HTTP 409 (déjà voté)" >&2
  else
    echo "  ✗ $SUBJECT: HTTP $HTTP — $GRADES_PREVIEW" >&2
    cat /tmp/vote-res.json >&2
    echo >&2
  fi
  sleep 0.15
done

echo ""
echo "Bilan : $ACCEPTED acceptés, $REJECTED refusés (409), $COUNT demandés"

if [ "$ACCEPTED" -eq 0 ]; then
  echo "Aucun vote enregistré. Les sim-voter-* existent peut-être déjà — le script auto-incrémente le départ ; vérifiez le sondage (mode public pour lister les bulletins)." >&2
  exit 1
fi

echo "Attente agrégation worker (5s)..."
sleep 5

echo "Résultats:"
curl -sS "$API/polls/$POLL_ID/results" -H "X-Data-Region: $REGION" | node -e "
const r=JSON.parse(require('fs').readFileSync(0,'utf8'));
if (r.error) { console.log(JSON.stringify(r,null,2)); process.exit(1); }
const labels = r.results.gradeLabels || [];
const live = r.liveVoteCount != null ? r.liveVoteCount : r.voteCount;
console.log('version:', r.version, '| voteCount (snapshot):', r.voteCount, '| live:', live);
if (r.results.tieBreakMethodDescription) {
  console.log('Départage:', r.results.tieBreakMethodDescription);
  console.log('');
}
if (r.results.ranking?.length) {
  console.log('Classement (MJ + groupes d\\'insatisfaits):');
  for (const row of r.results.ranking) {
    const line = row.medianDisplay || (labels[row.median - 1] || row.median);
    console.log(' ', row.rank + '.', row.label, '—', line);
  }
}
for (const it of r.results.items) {
  const ml = it.medianDisplay || labels[it.median - 1] || it.median;
  const dist = Object.entries(it.distribution || {})
    .sort((a,b)=>Number(a[0])-Number(b[0]))
    .map(([g,c]) => (labels[Number(g)-1] || g) + ':' + c)
    .join(' ');
  console.log(' -', it.label, '| médiane:', ml, '| rang:', it.rank, '|', dist);
}
"
