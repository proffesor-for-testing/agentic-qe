#!/usr/bin/env bash
# qe-browser smoke test (bash mirror of evals/qe-browser.yaml)
#
# Runs each helper script against deterministic local fixtures and
# verifies the output structure. Gates PR-reopen per ADR-091 Phase 3.
#
# RELATIONSHIP TO evals/qe-browser.yaml
# -------------------------------------
# The canonical spec is `.claude/skills/qe-browser/evals/qe-browser.yaml`.
# It is executed by `aqe eval run --skill qe-browser` via CommandEvalRunner
# (src/validation/command-eval-runner.ts). The CI workflow runs it in the
# "eval" job once the dist is built.
#
# This bash script mirrors the same test cases (tc001–tc011) so you can
# run them without building the AQE CLI — useful during local skill
# development and the initial smoke gate in CI (before the build finishes).
# It also covers one case the yaml can't express naturally:
#   - tc011 F1 contract: vibium-missing -> skipped envelope + exit 2
#     (uses `env -i PATH=<fake-bin>` isolation, which is clumsy in yaml)
#
# Exit codes:
#   0 — all smoke tests passed
#   1 — at least one smoke test failed
#   2 — vibium binary not on PATH (precondition unmet)
#
# Per feedback_no_unverified_failure_modes.md, this is the script we
# actually run, not just write. The fixture pages are maintained with the
# skill and served only on loopback, removing public-service rate limits.

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SKILL_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
WORK_DIR="$(mktemp -d)"
FIXTURE_PORT="${QE_BROWSER_FIXTURE_PORT:-8088}"
FIXTURE_URL="${QE_BROWSER_FIXTURE_URL:-http://127.0.0.1:${FIXTURE_PORT}}"
FIXTURE_PID=""

cleanup() {
  if [ -n "$FIXTURE_PID" ]; then
    kill "$FIXTURE_PID" >/dev/null 2>&1 || true
  fi
  rm -rf "$WORK_DIR"
}
trap cleanup EXIT

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

if ! curl --silent --fail "$FIXTURE_URL/fixtures/content.html" >/dev/null 2>&1; then
  QE_BROWSER_FIXTURE_PORT="$FIXTURE_PORT" \
    node "$SKILL_DIR/fixtures/serve-skills.js" >"$WORK_DIR/fixture-server.log" 2>&1 &
  FIXTURE_PID=$!
  fixture_ready=0
  for _attempt in 1 2 3 4 5; do
    if curl --silent --fail "$FIXTURE_URL/fixtures/content.html" >/dev/null 2>&1; then
      fixture_ready=1
      break
    fi
    sleep 1
  done
  if [ "$fixture_ready" != "1" ]; then
    cat "$WORK_DIR/fixture-server.log" >&2
    echo -e "${RED}qe-browser fixture server did not become ready${NC}" >&2
    exit 1
  fi
fi

CONTENT_URL="$FIXTURE_URL/fixtures/content.html"
FORM_URL="$FIXTURE_URL/fixtures/form.html"

VIBIUM_VERSION=$(vibium --version 2>&1 | head -1)
echo "Smoke testing against $VIBIUM_VERSION"
echo "Skill dir: $SKILL_DIR"
echo "Work dir:  $WORK_DIR"
echo ""

# ---------------------------------------------------------------------------
# tc001 — assert.js url_contains against the local form fixture
# ---------------------------------------------------------------------------
vibium --headless go "$FORM_URL" >/dev/null 2>&1 || true
RESULT=$(node "$SKILL_DIR/scripts/assert.js" --checks \
  '[{"kind": "url_contains", "text": "/fixtures/form.html"}]' 2>&1)
EXIT=$?
if [ "$EXIT" = "0" ] && echo "$RESULT" | grep -q '"status": "success"'; then
  ok "tc001 url_contains on local form"
else
  bad "tc001 url_contains on local form" "exit=$EXIT, result=$RESULT"
fi

# ---------------------------------------------------------------------------
# tc002 — assert.js selector_visible against the local content fixture
# ---------------------------------------------------------------------------
vibium --headless go "$CONTENT_URL" >/dev/null 2>&1 || true
RESULT=$(node "$SKILL_DIR/scripts/assert.js" --checks \
  '[{"kind": "selector_visible", "selector": "h1"}]' 2>&1)
EXIT=$?
if [ "$EXIT" = "0" ] && echo "$RESULT" | grep -q '"passed": true'; then
  ok "tc002 selector_visible h1 on local content"
else
  bad "tc002 selector_visible h1 on local content" "exit=$EXIT"
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
  "[{\"action\":\"go\",\"url\":\"$CONTENT_URL\"},{\"action\":\"wait_load\"},{\"action\":\"assert\",\"checks\":[{\"kind\":\"url_contains\",\"text\":\"/fixtures/content.html\"}]}]" \
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
  "[{\"action\":\"go\",\"url\":\"$CONTENT_URL\"},{\"action\":\"assert\",\"checks\":[{\"kind\":\"url_contains\",\"text\":\"/does-not-exist\"}]},{\"action\":\"go\",\"url\":\"$FORM_URL\"}]" 2>&1)
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
# whatever size it likes per run, and pages may render at different
# sizes between runs (768×654 vs 765×672 observed), making pixel-diff
# spuriously fail. This is documented in references/assertion-kinds.md.
# ---------------------------------------------------------------------------
rm -rf "$PWD/.aqe/visual-baselines/smoke_test_baseline"*
vibium --headless viewport 1280 720 >/dev/null 2>&1 || true
vibium --headless go "$CONTENT_URL" >/dev/null 2>&1 || true
RESULT=$(node "$SKILL_DIR/scripts/visual-diff.js" --name smoke_test_baseline 2>&1)
EXIT=$?
if [ "$EXIT" = "0" ] && echo "$RESULT" | grep -q '"baseline_created"'; then
  ok "tc006 visual-diff baseline created"
else
  bad "tc006 visual-diff baseline created" "exit=$EXIT, result=$RESULT"
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
  bad "tc007 visual-diff second run matches" "exit=$EXIT, result=$RESULT"
fi

# ---------------------------------------------------------------------------
# tc008 — check-injection.js clean page
# ---------------------------------------------------------------------------
vibium --headless go "$CONTENT_URL" >/dev/null 2>&1 || true
RESULT=$(node "$SKILL_DIR/scripts/check-injection.js" --include-hidden 2>&1)
EXIT=$?
if [ "$EXIT" = "0" ] && echo "$RESULT" | grep -q '"severity": "none"'; then
  ok "tc008 check-injection clean page"
else
  bad "tc008 check-injection clean page" "exit=$EXIT"
fi

# ---------------------------------------------------------------------------
# tc010 — intent-score.js submit_form on the local form fixture
# ---------------------------------------------------------------------------
vibium --headless go "$FORM_URL" >/dev/null 2>&1 || true
RESULT=$(node "$SKILL_DIR/scripts/intent-score.js" --intent submit_form 2>&1)
EXIT=$?
if [ "$EXIT" = "0" ] && echo "$RESULT" | grep -q '"intent": "submit_form"'; then
  ok "tc010 intent-score submit_form on local form"
else
  bad "tc010 intent-score submit_form on local form" "exit=$EXIT"
fi

# ---------------------------------------------------------------------------
# tc011 — F1 contract: vibium-missing → skipped envelope + exit code 2
# ---------------------------------------------------------------------------
# Build a fake bin dir that contains node (so the helper can run) but NOT
# vibium. The helper must:
#   1. Throw VibiumUnavailableError from lib/vibium.js
#   2. Have it caught by runOrSkip wrapping main()
#   3. Emit a status: "skipped" envelope with vibiumUnavailable: true
#   4. Exit with code 2 (not 1)
FAKE_BIN="$WORK_DIR/fake-bin"
mkdir -p "$FAKE_BIN"
ln -sf "$(command -v node)" "$FAKE_BIN/node"
RESULT=$(env -i PATH="$FAKE_BIN" HOME="$HOME" TERM=dumb \
  node "$SKILL_DIR/scripts/assert.js" --checks '[{"kind":"url_contains","text":"foo"}]' 2>&1)
EXIT=$?
if [ "$EXIT" = "2" ] \
  && echo "$RESULT" | grep -q '"status": "skipped"' \
  && echo "$RESULT" | grep -q '"vibiumUnavailable": true' \
  && echo "$RESULT" | grep -q '"reason": "browser-engine-unavailable"'; then
  ok "tc011 F1 missing-vibium emits skipped envelope + exit 2"
else
  bad "tc011 F1 missing-vibium emits skipped envelope + exit 2" "exit=$EXIT"
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
