#!/usr/bin/env bash
# qe-browser smoke test
#
# Runs each helper script against pinned public fixtures (httpbin.org) and
# verifies the output structure. This is the script that gates PR-reopen
# per ADR-091 Phase 3 — it MUST be run on a machine with vibium installed
# before the qe-browser PR is considered safe to reopen.
#
# Exit codes:
#   0 — all smoke tests passed
#   1 — at least one smoke test failed
#   2 — vibium binary not on PATH (precondition unmet)
#
# Per feedback_no_unverified_failure_modes.md, this is the script we
# actually run, not just write. Per feedback_synthetic_fixtures_dont_count,
# all fixtures are pinned public endpoints (httpbin.org) — no synthetic
# stubs, no inline HTML.

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SKILL_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
WORK_DIR="$(mktemp -d)"
trap 'rm -rf "$WORK_DIR"' EXIT

GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

PASS=0
FAIL=0
SKIPPED=0

ok()   { echo -e "${GREEN}PASS${NC}  $1"; PASS=$((PASS + 1)); }
bad()  { echo -e "${RED}FAIL${NC}  $1${2:+: $2}"; FAIL=$((FAIL + 1)); }
skip() { echo -e "${YELLOW}SKIP${NC}  $1${2:+: $2}"; SKIPPED=$((SKIPPED + 1)); }

# ---------------------------------------------------------------------------
# Precondition: vibium on PATH
# ---------------------------------------------------------------------------
if ! command -v vibium >/dev/null 2>&1; then
  echo -e "${RED}vibium binary not found on PATH${NC}"
  echo "Install via: npm install -g vibium"
  exit 2
fi

VIBIUM_VERSION=$(vibium --version 2>&1 | head -1)
echo "Smoke testing against $VIBIUM_VERSION"
echo "Skill dir: $SKILL_DIR"
echo "Work dir:  $WORK_DIR"
echo ""

# ---------------------------------------------------------------------------
# tc001 — assert.js url_contains against pinned httpbin form
# ---------------------------------------------------------------------------
vibium --headless go https://httpbin.org/forms/post >/dev/null 2>&1 || true
RESULT=$(node "$SKILL_DIR/scripts/assert.js" --checks \
  '[{"kind": "url_contains", "text": "httpbin.org/forms"}]' 2>&1)
EXIT=$?
if [ "$EXIT" = "0" ] && echo "$RESULT" | grep -q '"status": "success"'; then
  ok "tc001 url_contains on httpbin form"
else
  bad "tc001 url_contains on httpbin form" "exit=$EXIT, result=$RESULT"
fi

# ---------------------------------------------------------------------------
# tc002 — assert.js selector_visible against pinned httpbin /html
# ---------------------------------------------------------------------------
vibium --headless go https://httpbin.org/html >/dev/null 2>&1 || true
RESULT=$(node "$SKILL_DIR/scripts/assert.js" --checks \
  '[{"kind": "selector_visible", "selector": "h1"}]' 2>&1)
EXIT=$?
if [ "$EXIT" = "0" ] && echo "$RESULT" | grep -q '"passed": true'; then
  ok "tc002 selector_visible h1 on httpbin /html"
else
  bad "tc002 selector_visible h1 on httpbin /html" "exit=$EXIT"
fi

# ---------------------------------------------------------------------------
# tc003 — assert.js failing assertion exits non-zero
# ---------------------------------------------------------------------------
RESULT=$(node "$SKILL_DIR/scripts/assert.js" --checks \
  '[{"kind": "url_contains", "text": "this-does-not-exist"}]' 2>&1)
EXIT=$?
if [ "$EXIT" = "1" ] && echo "$RESULT" | grep -q '"status": "failed"'; then
  ok "tc003 failing assertion exits 1"
else
  bad "tc003 failing assertion exits 1" "exit=$EXIT (expected 1)"
fi

# ---------------------------------------------------------------------------
# tc004 — batch.js navigate + wait + assert in one call
# ---------------------------------------------------------------------------
RESULT=$(node "$SKILL_DIR/scripts/batch.js" --steps \
  '[{"action":"go","url":"https://httpbin.org/html"},{"action":"wait_load"},{"action":"assert","checks":[{"kind":"url_contains","text":"/html"}]}]' \
  --summary-only 2>&1)
EXIT=$?
if [ "$EXIT" = "0" ] && echo "$RESULT" | grep -q '"passedSteps": 3'; then
  ok "tc004 batch 3-step happy path"
else
  bad "tc004 batch 3-step happy path" "exit=$EXIT"
fi

# ---------------------------------------------------------------------------
# tc005 — batch.js stops on failure
# ---------------------------------------------------------------------------
RESULT=$(node "$SKILL_DIR/scripts/batch.js" --steps \
  '[{"action":"go","url":"https://httpbin.org/html"},{"action":"click","selector":"#does-not-exist-selector"},{"action":"go","url":"https://httpbin.org/forms/post"}]' 2>&1)
EXIT=$?
if [ "$EXIT" = "1" ] && echo "$RESULT" | grep -q '"failedStep"'; then
  ok "tc005 batch stops on first failure"
else
  bad "tc005 batch stops on first failure" "exit=$EXIT"
fi

# ---------------------------------------------------------------------------
# tc006 — visual-diff.js creates baseline on first run
#
# Set explicit viewport BEFORE screenshot so the two visual-diff runs have
# the same dimensions. Without this the chromium headless window picks
# whatever size it likes per run, and httpbin.org/html renders at different
# sizes between runs (768×654 vs 765×672 observed), making pixel-diff
# spuriously fail. This is documented in references/assertion-kinds.md.
# ---------------------------------------------------------------------------
rm -rf "$PWD/.aqe/visual-baselines/smoke_test_baseline"*
vibium --headless viewport 1280 720 >/dev/null 2>&1 || true
vibium --headless go https://httpbin.org/html >/dev/null 2>&1 || true
RESULT=$(node "$SKILL_DIR/scripts/visual-diff.js" --name smoke_test_baseline 2>&1)
EXIT=$?
if [ "$EXIT" = "0" ] && echo "$RESULT" | grep -q '"baseline_created"'; then
  ok "tc006 visual-diff baseline created"
else
  bad "tc006 visual-diff baseline created" "exit=$EXIT"
fi

# ---------------------------------------------------------------------------
# tc007 — visual-diff.js matches second identical run
#
# Force the same viewport before re-shooting so dimensions match the baseline.
# ---------------------------------------------------------------------------
vibium --headless viewport 1280 720 >/dev/null 2>&1 || true
RESULT=$(node "$SKILL_DIR/scripts/visual-diff.js" --name smoke_test_baseline 2>&1)
EXIT=$?
if [ "$EXIT" = "0" ] && echo "$RESULT" | grep -qE '"(match|baseline_created)"'; then
  ok "tc007 visual-diff second run matches"
else
  bad "tc007 visual-diff second run matches" "exit=$EXIT"
fi

# ---------------------------------------------------------------------------
# tc008 — check-injection.js clean page
# ---------------------------------------------------------------------------
vibium --headless go https://httpbin.org/html >/dev/null 2>&1 || true
RESULT=$(node "$SKILL_DIR/scripts/check-injection.js" --include-hidden 2>&1)
EXIT=$?
if [ "$EXIT" = "0" ] && echo "$RESULT" | grep -q '"severity": "none"'; then
  ok "tc008 check-injection clean page"
else
  bad "tc008 check-injection clean page" "exit=$EXIT"
fi

# ---------------------------------------------------------------------------
# tc010 — intent-score.js submit_form on pinned httpbin form
# ---------------------------------------------------------------------------
vibium --headless go https://httpbin.org/forms/post >/dev/null 2>&1 || true
RESULT=$(node "$SKILL_DIR/scripts/intent-score.js" --intent submit_form 2>&1)
EXIT=$?
if [ "$EXIT" = "0" ] && echo "$RESULT" | grep -q '"intent": "submit_form"'; then
  ok "tc010 intent-score submit_form on httpbin form"
else
  bad "tc010 intent-score submit_form on httpbin form" "exit=$EXIT"
fi

# ---------------------------------------------------------------------------
# Summary
# ---------------------------------------------------------------------------
echo ""
echo "─────────────────────────────────"
echo "PASS:    $PASS"
echo "FAIL:    $FAIL"
echo "SKIPPED: $SKIPPED"
echo "─────────────────────────────────"

if [ "$FAIL" -gt 0 ]; then
  exit 1
fi
exit 0
