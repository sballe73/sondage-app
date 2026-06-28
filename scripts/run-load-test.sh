#!/usr/bin/env bash
# Distributed k6 load test — mock voters against a running poll API.
#
# Usage:
#   ./scripts/run-load-test.sh --poll-id <UUID> --users 200 [options]
#   npm run load-test -- -p <UUID> -n 200 --at 14:30
#
# Prerequisites: k6 installed (https://grafana.com/docs/k6/latest/set-up/install-k6/)
# or use --docker. Target API must have mock platform enabled and worker running.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
K6_SCRIPT="${ROOT}/tests/load/poll-votes.k6.js"

POLL_ID=""
USERS=""
TOTAL_USERS=""
AT_TIME=""
TIMEZONE="${TIMEZONE:-}"
VOTER_OFFSET=""
AUTO_OFFSET=1
MACHINE_ID="0"
SEGMENT_INDEX=""
SEGMENTS_TOTAL="1"
RAMP_SECONDS="0"
CONCURRENCY=""
CLI_API_BASE=""
API_BASE="${API_BASE:-}"
DATA_REGION="${DATA_REGION:-EU}"
PREFIX="perf-voter"
DRY_RUN=0
USE_DOCKER=0
K6_BINARY="${K6_BINARY:-k6}"
REPORT_PATH=""

usage() {
  cat <<'EOF'
Distributed performance load test (k6, mock mode)

Usage:
  ./scripts/run-load-test.sh --poll-id <UUID> --users <N> [options]

Required:
  -p, --poll-id <UUID>       Target poll UUID
  -n, --users <N>            Virtual users on this machine

Scheduling:
  --at, --launch-at <HH:MM>  Launch at this time today (local or --timezone)
  --timezone <IANA>          Timezone for --at (e.g. Europe/Paris)

Multi-machine:
  --segment-index <i>        k6 execution segment index (0-based)
  --segments-total <n>       Total machines (default: 1)
  --total-users <N>          Split N users across segments (overrides --users)
  -o, --voter-offset <N>     First perf-voter-N index (default: auto from ballots)
  --machine-id <id>          Label in k6 tags (default: 0)

Traffic shape:
  -c, --concurrency <N>      Max parallel voters (default: same as --users)
  --burst                    One vote per VU as fast as concurrency allows (default)
  --ramp-seconds <N>         Ramp VUs over N seconds (overrides burst)

Target:
  -u, --url <url>            API base URL (overrides .env and API_BASE env)
  --api-base <url>           Alias for --url
  --region <EU|US|GLOBAL>    X-Data-Region header (default: EU)
  --prefix <name>            Voter subject prefix (default: perf-voter)

Output:
  --report <path>            k6 JSON summary output path
  --dry-run                  Pre-flight + print k6 command, do not run
  --docker                   Run k6 via grafana/k6 Docker image
  --k6-binary <path>         k6 executable (default: k6)

Examples:
  # Single machine, 50 voters, custom URL (overrides .env)
  ./scripts/run-load-test.sh -p <UUID> -n 50 --url http://staging.example.com:3000

  # 20000 votes, 50 parallel (avoids saturating the API)
  ./scripts/run-load-test.sh -p <UUID> -n 20000 -c 50

  # 3 machines, 600 total users, launch at 14:30
  ./scripts/run-load-test.sh -p <UUID> --total-users 600 --segment-index 0 --segments-total 3 --at 14:30
  ./scripts/run-load-test.sh -p <UUID> --total-users 600 --segment-index 1 --segments-total 3 --at 14:30
  ./scripts/run-load-test.sh -p <UUID> --total-users 600 --segment-index 2 --segments-total 3 --at 14:30 --ramp-seconds 15
EOF
}

die() {
  echo "Error: $*" >&2
  exit 1
}

# Read a single KEY=value from .env (no shell sourcing).
dotenv_get() {
  local key="$1" file="$2" line val
  [ -f "$file" ] || return 1
  line=$(grep -E "^${key}=" "$file" 2>/dev/null | tail -n1 || true)
  [ -n "$line" ] || return 1
  val="${line#*=}"
  val="${val#"${val%%[![:space:]]*}"}"
  val="${val%"${val##*[![:space:]]}"}"
  if [[ "$val" == \"*\" && "$val" == *\" ]]; then
    val="${val:1:${#val}-2}"
  elif [[ "$val" == \'*\' && "$val" == *\' ]]; then
    val="${val:1:${#val}-2}"
  fi
  printf '%s' "$val"
}

normalize_api_base() {
  local url="$1"
  url="${url%/}"
  [ -n "$url" ] || die "API URL is empty"
  printf '%s' "$url"
}

resolve_api_base() {
  if [ -n "$CLI_API_BASE" ]; then
    API_BASE="$(normalize_api_base "$CLI_API_BASE")"
    echo "API URL: $API_BASE (from --url)"
    return
  fi

  if [ -n "$API_BASE" ]; then
    API_BASE="$(normalize_api_base "$API_BASE")"
    echo "API URL: $API_BASE (from API_BASE env)"
    return
  fi

  local env_file="${ROOT}/.env"
  local from_env
  from_env="$(dotenv_get API_BASE "$env_file" 2>/dev/null || true)"
  if [ -z "$from_env" ]; then
    from_env="$(dotenv_get PUBLIC_BASE_URL "$env_file" 2>/dev/null || true)"
  fi
  if [ -n "$from_env" ]; then
    API_BASE="$(normalize_api_base "$from_env")"
    echo "API URL: $API_BASE (from .env)"
    return
  fi

  API_BASE="http://localhost:3000"
  echo "API URL: $API_BASE (default)"
}

while [ $# -gt 0 ]; do
  case "$1" in
    -p|--poll-id) POLL_ID="${2:?}"; shift 2 ;;
    -n|--users) USERS="${2:?}"; shift 2 ;;
    --total-users) TOTAL_USERS="${2:?}"; shift 2 ;;
    --at|--launch-at) AT_TIME="${2:?}"; shift 2 ;;
    --timezone) TIMEZONE="${2:?}"; shift 2 ;;
    -o|--voter-offset) VOTER_OFFSET="${2:?}"; AUTO_OFFSET=0; shift 2 ;;
    --machine-id) MACHINE_ID="${2:?}"; shift 2 ;;
    --segment-index) SEGMENT_INDEX="${2:?}"; shift 2 ;;
    --segments-total) SEGMENTS_TOTAL="${2:?}"; shift 2 ;;
    --burst) RAMP_SECONDS="0"; shift ;;
    --ramp-seconds) RAMP_SECONDS="${2:?}"; shift 2 ;;
    -c|--concurrency) CONCURRENCY="${2:?}"; shift 2 ;;
    -u|--url|--api-base) CLI_API_BASE="${2:?}"; shift 2 ;;
    --region) DATA_REGION="${2:?}"; shift 2 ;;
    --prefix) PREFIX="${2:?}"; shift 2 ;;
    --report) REPORT_PATH="${2:?}"; shift 2 ;;
    --dry-run) DRY_RUN=1; shift ;;
    --docker) USE_DOCKER=1; shift ;;
    --k6-binary) K6_BINARY="${2:?}"; shift 2 ;;
    -h|--help) usage; exit 0 ;;
    *) die "Unknown option: $1 (try --help)" ;;
  esac
done

[ -n "$POLL_ID" ] || die "--poll-id is required"
[ -f "$K6_SCRIPT" ] || die "k6 script not found: $K6_SCRIPT"

resolve_api_base

if [ -n "$TOTAL_USERS" ]; then
  [ -n "$SEGMENT_INDEX" ] || die "--total-users requires --segment-index"
  SEGMENTS_TOTAL_INT="$SEGMENTS_TOTAL"
  SEGMENT_INDEX_INT="$SEGMENT_INDEX"
  if ! [[ "$SEGMENTS_TOTAL_INT" =~ ^[0-9]+$ ]] || [ "$SEGMENTS_TOTAL_INT" -lt 1 ]; then
    die "--segments-total must be a positive integer"
  fi
  if ! [[ "$SEGMENT_INDEX_INT" =~ ^[0-9]+$ ]] || [ "$SEGMENT_INDEX_INT" -ge "$SEGMENTS_TOTAL_INT" ]; then
    die "--segment-index must be 0 .. segments-total-1"
  fi
  USERS=$(( (TOTAL_USERS + SEGMENTS_TOTAL_INT - 1) / SEGMENTS_TOTAL_INT ))
  if [ "$AUTO_OFFSET" -eq 1 ]; then
    VOTER_OFFSET=$(( SEGMENT_INDEX_INT * USERS ))
  fi
fi

[ -n "$USERS" ] || die "--users (or --total-users) is required"
if ! [[ "$USERS" =~ ^[0-9]+$ ]] || [ "$USERS" -lt 1 ]; then
  die "--users must be a positive integer"
fi

CONCURRENCY="${CONCURRENCY:-$USERS}"
if ! [[ "$CONCURRENCY" =~ ^[0-9]+$ ]] || [ "$CONCURRENCY" -lt 1 ]; then
  die "--concurrency must be a positive integer"
fi
if [ "$CONCURRENCY" -gt "$USERS" ]; then
  die "--concurrency cannot exceed --users ($CONCURRENCY > $USERS)"
fi

if [ -n "$SEGMENT_INDEX" ]; then
  if ! [[ "$SEGMENTS_TOTAL" =~ ^[0-9]+$ ]] || [ "$SEGMENTS_TOTAL" -lt 1 ]; then
    die "--segments-total must be a positive integer"
  fi
  if ! [[ "$SEGMENT_INDEX" =~ ^[0-9]+$ ]] || [ "$SEGMENT_INDEX" -ge "$SEGMENTS_TOTAL" ]; then
    die "--segment-index must be 0 .. segments-total-1"
  fi
fi

preflight_poll() {
  echo "Pre-flight: GET $API_BASE/polls/$POLL_ID"
  local poll_json http_code
  poll_json=$(curl -sS -w "\n%{http_code}" "$API_BASE/polls/$POLL_ID" -H "X-Data-Region: $DATA_REGION")
  http_code=$(echo "$poll_json" | tail -n1)
  poll_json=$(echo "$poll_json" | sed '$d')

  if [ "$http_code" != "200" ]; then
    die "Poll fetch failed (HTTP $http_code): $poll_json"
  fi

  echo "$poll_json" | node -e "
const p = JSON.parse(require('fs').readFileSync(0, 'utf8'));
if (p.error) { console.error(p.error.message || JSON.stringify(p.error)); process.exit(1); }
if (p.platform !== 'mock') { console.error('Poll platform must be mock (got ' + p.platform + ')'); process.exit(1); }
if (!p.items?.length) { console.error('Poll has no items'); process.exit(1); }
const now = Date.now();
if (now < new Date(p.startsAt).getTime()) { console.error('Poll has not started yet'); process.exit(1); }
if (now >= new Date(p.endsAt).getTime() || p.closedAt) { console.error('Poll is closed'); process.exit(1); }
console.log('  platform:', p.platform, '| items:', p.items.length, '| policy:', p.resultPolicy);
"
}

detect_voter_offset() {
  local ballots_json
  ballots_json=$(curl -sS "$API_BASE/polls/$POLL_ID/ballots" -H "X-Data-Region: $DATA_REGION" 2>/dev/null || echo '{"ballots":[]}')
  VOTER_OFFSET=$(echo "$ballots_json" | PREFIX="$PREFIX" node -e '
const data = JSON.parse(require("fs").readFileSync(0, "utf8"));
const prefix = process.env.PREFIX;
const re = new RegExp("^" + prefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "-(\\d+)$");
let max = -1;
for (const b of data.ballots || []) {
  const m = re.exec(b.subjectId || "");
  if (m) max = Math.max(max, Number(m[1]));
}
process.stdout.write(String(max + 1));
')
  echo "Auto voter offset: $VOTER_OFFSET (${PREFIX}-$VOTER_OFFSET …)"
}

if [ "$AUTO_OFFSET" -eq 1 ]; then
  if [ -n "$SEGMENT_INDEX" ]; then
    VOTER_OFFSET=$(( SEGMENT_INDEX * USERS ))
    echo "Segment voter offset: $VOTER_OFFSET (${PREFIX}-$VOTER_OFFSET …)"
  else
    detect_voter_offset
  fi
fi

VOTER_OFFSET="${VOTER_OFFSET:-0}"
VOTER_END=$(( VOTER_OFFSET + USERS - 1 ))

preflight_poll

PROFILE="burst"
if [ "$RAMP_SECONDS" -gt 0 ] 2>/dev/null; then
  PROFILE="ramp (${RAMP_SECONDS}s)"
fi

echo ""
echo "Load test plan:"
echo "  Poll:        $POLL_ID"
echo "  API:         $API_BASE"
echo "  Users:       $USERS (this machine)"
echo "  Concurrency: $CONCURRENCY (max parallel)"
echo "  Voters:      ${PREFIX}-$VOTER_OFFSET … ${PREFIX}-$VOTER_END"
echo "  Profile:     $PROFILE"
echo "  Machine id:  $MACHINE_ID"
if [ -n "$SEGMENT_INDEX" ]; then
  echo "  Segment:     $SEGMENT_INDEX / $SEGMENTS_TOTAL"
fi

wait_until_launch() {
  if [ -z "$AT_TIME" ]; then
    echo "  Launch:      immediate"
    return
  fi

  if ! [[ "$AT_TIME" =~ ^([0-9]{1,2}):([0-9]{2})$ ]]; then
    die "--at must be HH:MM (got $AT_TIME)"
  fi

  local tz_arg=()
  if [ -n "$TIMEZONE" ]; then
    tz_arg=(TZ="$TIMEZONE")
  fi

  local launch_epoch now_epoch sleep_sec launch_display
  launch_epoch=$("${tz_arg[@]}" date -d "today $AT_TIME" +%s 2>/dev/null) \
    || die "Could not parse --at $AT_TIME (check --timezone)"
  now_epoch=$(date +%s)
  sleep_sec=$(( launch_epoch - now_epoch ))
  launch_display=$("${tz_arg[@]}" date -d "@$launch_epoch" '+%Y-%m-%d %H:%M:%S %Z')

  if [ "$sleep_sec" -lt 0 ]; then
    die "--at $AT_TIME is in the past today ($launch_display)"
  fi

  echo "  Launch:      $launch_display"
  if [ "$sleep_sec" -gt 0 ]; then
    echo "Waiting ${sleep_sec}s until launch..."
    sleep "$sleep_sec"
    echo "Launch time reached."
  fi
}

SEGMENT_SEQUENCE=""
if [ -n "$SEGMENT_INDEX" ] && [ "$SEGMENTS_TOTAL" -gt 1 ]; then
  for ((i = 0; i < SEGMENTS_TOTAL; i++)); do
    [ -n "$SEGMENT_SEQUENCE" ] && SEGMENT_SEQUENCE+=","
    SEGMENT_SEQUENCE+="$i"
  done
fi

API_BASE_K6="$API_BASE"
if [ "$USE_DOCKER" -eq 1 ]; then
  if [[ "$API_BASE_K6" == *localhost* ]] || [[ "$API_BASE_K6" == *127.0.0.1* ]]; then
    API_BASE_K6="${API_BASE_K6//localhost/host.docker.internal}"
    API_BASE_K6="${API_BASE_K6//127.0.0.1/host.docker.internal}"
  fi
fi

K6_ARGS=()
if [ -n "$SEGMENT_SEQUENCE" ]; then
  K6_ARGS+=(--execution-segment "${SEGMENT_INDEX}:1/${SEGMENTS_TOTAL}:${SEGMENTS_TOTAL}")
  K6_ARGS+=(--execution-segment-sequence "$SEGMENT_SEQUENCE")
fi

K6_ARGS+=(
  -e "POLL_ID=$POLL_ID"
  -e "API_BASE=$API_BASE_K6"
  -e "DATA_REGION=$DATA_REGION"
  -e "VUS=$USERS"
  -e "CONCURRENCY=$CONCURRENCY"
  -e "VOTER_OFFSET=$VOTER_OFFSET"
  -e "PREFIX=$PREFIX"
  -e "MACHINE_ID=$MACHINE_ID"
  -e "RAMP_SECONDS=$RAMP_SECONDS"
)

if [ -n "$REPORT_PATH" ]; then
  mkdir -p "$(dirname "$REPORT_PATH")"
  if [ "$USE_DOCKER" -eq 1 ]; then
    REPORT_OUT="json=/reports/$(basename "$REPORT_PATH")"
  else
    REPORT_OUT="json=$REPORT_PATH"
  fi
  K6_ARGS+=(--out "$REPORT_OUT")
fi

if [ "$USE_DOCKER" -eq 1 ]; then
  DOCKER_ARGS=(run --rm)
  if [[ "$API_BASE" == *localhost* ]] || [[ "$API_BASE" == *127.0.0.1* ]]; then
    DOCKER_ARGS+=(--add-host=host.docker.internal:host-gateway)
  fi
  DOCKER_ARGS+=(-v "${ROOT}/tests/load:/scripts/load:ro")
  if [ -n "$REPORT_PATH" ]; then
    REPORT_DIR="$(cd "$(dirname "$REPORT_PATH")" && pwd)"
    DOCKER_ARGS+=(-v "${REPORT_DIR}:/reports")
  fi
  K6_DISPLAY_CMD=(docker "${DOCKER_ARGS[@]}" grafana/k6 run "${K6_ARGS[@]}" /scripts/load/poll-votes.k6.js)
  K6_RUN_CMD=(docker "${DOCKER_ARGS[@]}" grafana/k6 run "${K6_ARGS[@]}" /scripts/load/poll-votes.k6.js)
else
  if ! command -v "$K6_BINARY" >/dev/null 2>&1; then
    die "k6 not found ($K6_BINARY). Install from https://grafana.com/docs/k6/latest/set-up/install-k6/ or use --docker"
  fi
  K6_ARGS+=("$K6_SCRIPT")
  K6_DISPLAY_CMD=("$K6_BINARY" run "${K6_ARGS[@]}")
  K6_RUN_CMD=("$K6_BINARY" run "${K6_ARGS[@]}")
fi

if [ "$DRY_RUN" -eq 1 ]; then
  echo ""
  echo "Dry run — k6 command:"
  printf '  %q ' "${K6_DISPLAY_CMD[@]}"
  echo ""
  exit 0
fi

wait_until_launch

echo ""
echo "Starting k6..."
"${K6_RUN_CMD[@]}"

echo ""
echo "Done. Voters: ${PREFIX}-$VOTER_OFFSET … ${PREFIX}-$VOTER_END"
if [ -n "$REPORT_PATH" ]; then
  echo "Report: $REPORT_PATH"
fi
