#!/usr/bin/env bash
# ============================================================================
# Rehearsal harness for the 5-minute qe-browser Agentics Lab live demo.
#
# This is NOT the script you run on stage. For the live demo, paste commands
# from README.md directly into your terminal. This script is for verifying
# the commands still work the morning of the meetup and for practicing
# timing.
#
# Usage:
#   bash demo.sh                 # interactive rehearsal: pauses between acts
#   bash demo.sh --no-pause      # fast smoke: runs all acts back-to-back
#   bash demo.sh --ci            # silent verification (no narration banners)
#
# Exit codes:
#   0   every command produced the expected marker
#   1   at least one command failed or produced unexpected output
#   2   precondition unmet (vibium missing, httpbin unreachable, etc.)
#
# Run this twice before the meetup. Both runs should be green.
# ============================================================================

set -euo pipefail

# ── configuration ──────────────────────────────────────────────────────────
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
SKILL_DIR="$REPO_ROOT/.claude/skills/qe-browser"
SCRIPTS_DIR="$SKILL_DIR/scripts"
FIXTURE_URL="https://httpbin.org/forms/post"

MODE="rehearse"   # rehearse | no-pause | ci
for arg in "$@"; do
  case "$arg" in
    --no-pause) MODE="no-pause" ;;
    --ci)       MODE="ci" ;;
    *)          echo "unknown arg: $arg" >&2; exit 2 ;;
  esac
done

# ── terminal colours ──────────────────────────────────────────────────────
if [ -t 1 ] && [ "$MODE" != "ci" ]; then
  G='\033[0;32m'; R='\033[0;31m'; Y='\033[1;33m'; B='\033[1;34m'; NC='\033[0m'
else
  G=''; R=''; Y=''; B=''; NC=''
fi

PASS=0
FAIL=0

banner() {
  [ "$MODE" = "ci" ] && return 0
  echo
  echo -e "${B}════════════════════════════════════════════════════════════════${NC}"
  echo -e "${B}  $1${NC}"
  echo -e "${B}════════════════════════════════════════════════════════════════${NC}"
}

pause_for_rehearsal() {
  [ "$MODE" != "rehearse" ] && return 0
  echo -e "${Y}→ press Enter for the next act${NC}"
  read -r _
}

ok()  { echo -e "${G}PASS${NC}  $1"; PASS=$((PASS+1)); }
bad() { echo -e "${R}FAIL${NC}  $1${2:+: $2}"; FAIL=$((FAIL+1)); }

# ── preconditions ─────────────────────────────────────────────────────────
banner "Preconditions"

if ! command -v vibium >/dev/null 2>&1; then
  echo -e "${R}vibium not on PATH${NC}"
  echo "  install: npm install -g vibium"
  exit 2
fi
ok "vibium on PATH ($(vibium --version 2>&1 | head -1))"

if ! command -v node >/dev/null 2>&1; then
  echo -e "${R}node not on PATH${NC}"
  exit 2
fi
ok "node on PATH ($(node --version))"

if [ ! -d "$SCRIPTS_DIR" ]; then
  echo -e "${R}$SCRIPTS_DIR does not exist${NC}"
  echo "  are you running this from the agentic-qe repo?"
  exit 2
fi
ok "skill dir present ($SCRIPTS_DIR)"

if ! curl -sf -o /dev/null --max-time 5 "$FIXTURE_URL"; then
  echo -e "${R}$FIXTURE_URL unreachable${NC}"
  echo "  network problem or httpbin.org is down — swap the fixture in README"
  exit 2
fi
ok "fixture reachable ($FIXTURE_URL)"

pause_for_rehearsal

# ── Act 0: what qe-browser ships (0:30–1:00) ──────────────────────────────
banner "Act 0 — 'What qe-browser ships' (15s)"

echo "$ ls .claude/skills/qe-browser/scripts/"
ls "$SCRIPTS_DIR/" | tr '\n' ' '
echo
echo

expected=(assert.js batch.js check-injection.js intent-score.js visual-diff.js)
missing=()
for f in "${expected[@]}"; do
  [ -f "$SCRIPTS_DIR/$f" ] || missing+=("$f")
done
if [ ${#missing[@]} -eq 0 ]; then
  ok "all 5 helper scripts present"
else
  bad "missing scripts" "${missing[*]}"
fi

pause_for_rehearsal

# ── Act 1: navigate + typed assertion (1:00–2:00) ─────────────────────────
banner "Act 1 — Navigate + typed assertion (60s)"

echo "$ vibium --headless go $FIXTURE_URL"
vibium --headless go "$FIXTURE_URL" >/dev/null 2>&1
ok "navigated to $FIXTURE_URL"

echo
echo "$ node assert.js --checks '[url_contains, selector_visible]'"
RESULT=$(node "$SCRIPTS_DIR/assert.js" --checks '[
  {"kind": "url_contains", "text": "forms/post"},
  {"kind": "selector_visible", "selector": "form"}
]' 2>&1)
EXIT=$?

echo "$RESULT" | head -30
echo

if [ "$EXIT" = "0" ] \
  && echo "$RESULT" | grep -q '"status": "success"' \
  && echo "$RESULT" | grep -q '"trustTier": 3' \
  && echo "$RESULT" | grep -q 'All 2 assertions passed'; then
  ok "Act 1: 2 assertions passed, envelope has trustTier:3 + status:success"
else
  bad "Act 1" "unexpected output or exit code $EXIT"
fi

pause_for_rehearsal

# ── Act 2: batch with pre-validation (2:00–3:00) ──────────────────────────
banner "Act 2 — Batch with pre-validation catches a typo (60s)"

echo "$ node batch.js --steps '[go, fill, clikc (typo), assert]'"
set +e
RESULT=$(node "$SCRIPTS_DIR/batch.js" --steps '[
  {"action": "go", "url": "https://httpbin.org/forms/post"},
  {"action": "fill", "selector": "input[name=custname]", "text": "Dragan"},
  {"action": "clikc", "selector": "button[type=submit]"},
  {"action": "assert", "checks": [{"kind": "url_contains", "text": "post"}]}
]' 2>&1)
EXIT=$?
set -e

echo "$RESULT" | head -20
echo

if [ "$EXIT" = "1" ] \
  && echo "$RESULT" | grep -q '"status": "failed"' \
  && echo "$RESULT" | grep -q 'pre-validation' \
  && echo "$RESULT" | grep -q 'unknown action'; then
  # The JSON output has `unknown action \"clikc\"` with escaped quotes,
  # so we grep for `unknown action` (distinctive enough) rather than
  # trying to match the escaped form.
  ok "Act 2: batch aborted on typo BEFORE any vibium calls"
else
  bad "Act 2" "pre-validation did NOT catch the typo (exit=$EXIT)"
fi

pause_for_rehearsal

# ── Act 3: honest missing-vibium fallback (3:00–4:00) ─────────────────────
banner "Act 3 — Honest missing-vibium fallback (60s)"

FAKE_BIN="$(mktemp -d)/fake-bin"
mkdir -p "$FAKE_BIN"
ln -sf "$(command -v node)" "$FAKE_BIN/node"
trap "rm -rf '$(dirname "$FAKE_BIN")'" EXIT

echo "$ env -i PATH=$FAKE_BIN node assert.js ..."
set +e
RESULT=$(env -i PATH="$FAKE_BIN" HOME="$HOME" TERM=dumb \
  node "$SCRIPTS_DIR/assert.js" \
  --checks '[{"kind":"url_contains","text":"foo"}]' 2>&1)
EXIT=$?
set -e

echo "$RESULT" | head -30
echo "exit code: $EXIT"
echo

if [ "$EXIT" = "2" ] \
  && echo "$RESULT" | grep -q '"status": "skipped"' \
  && echo "$RESULT" | grep -q '"vibiumUnavailable": true' \
  && echo "$RESULT" | grep -q '"reason": "browser-engine-unavailable"' \
  && echo "$RESULT" | grep -q '"remediation"'; then
  ok "Act 3: skipped envelope + exit code 2 + remediation array"
else
  bad "Act 3" "missing-vibium contract broke (exit=$EXIT)"
fi

# ── Summary ────────────────────────────────────────────────────────────────
banner "Rehearsal summary"
echo "PASS: $PASS"
echo "FAIL: $FAIL"
echo

if [ "$FAIL" -gt 0 ]; then
  echo -e "${R}Demo is NOT ready — fix failures before you go on stage.${NC}"
  exit 1
fi

echo -e "${G}All acts green. You're ready to go live.${NC}"
echo
echo "Recommended: run this rehearsal one more time at the venue"
echo "with your actual presentation machine and network."
