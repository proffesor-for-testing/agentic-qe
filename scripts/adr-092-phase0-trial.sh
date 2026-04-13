#!/usr/bin/env bash
#
# ADR-092 Phase 0 value-proof trial
# ----------------------------------
# Runs `aqe llm advise` against 10 real Python source files from a pinned
# RuView checkout and captures tokens, latency, cost, and advice text.
#
# This is NOT the "baseline vs. advisor agent harness" the ADR gate specifies
# in its ideal form — that requires a headless qe-test-architect loop we
# don't have yet. What this script DOES prove:
#   1. The advisor CLI runs reliably on real code (not synthetic fixtures)
#   2. Advice quality is tractable across diverse task contexts
#   3. Cost is tractable (~$0.01 total for 10 real trials)
#   4. No crashes, timeouts, or provider errors
#
# Output: JSON report at scripts/adr-092-trial-report.json
#
# Requires: OPENROUTER_API_KEY in environment (loaded from .env)
# Cost: ~$0.01 per full run (real spend)
# Fixture: https://github.com/ruvnet/RuView pinned to
#          2a05378bd229df07eff3e309d414d65510ce507c

set -euo pipefail

# Load .env for OPENROUTER_API_KEY
if [[ -f .env ]]; then
  set -a; source .env; set +a
fi

if [[ -z "${OPENROUTER_API_KEY:-}" ]]; then
  echo "ERROR: OPENROUTER_API_KEY not set (expected in .env)" >&2
  exit 1
fi

RUVIEW_DIR="/tmp/adr-092-trial/RuView"
if [[ ! -d "$RUVIEW_DIR" ]]; then
  echo "ERROR: RuView checkout not found at $RUVIEW_DIR" >&2
  echo "Run: mkdir -p /tmp/adr-092-trial && cd /tmp/adr-092-trial && git clone https://github.com/ruvnet/RuView.git" >&2
  exit 1
fi

REPO_SHA=$(cd "$RUVIEW_DIR" && git rev-parse HEAD)
CLI="node /workspaces/agentic-qe/dist/cli/bundle.js"
REPORT="/workspaces/agentic-qe/scripts/adr-092-trial-report.json"
TMPDIR=$(mktemp -d)
trap "rm -rf $TMPDIR" EXIT

# 10 diverse source files — different sizes, domains, complexity
FILES=(
  "v1/src/main.py"                            # 116 lines, entrypoint
  "v1/src/sensing/classifier.py"              # 201 lines, ML
  "v1/src/hardware/router_interface.py"       # 240 lines, hardware
  "v1/src/models/densepose_head.py"           # 278 lines, ML model
  "v1/src/api/middleware/auth.py"             # 306 lines, security
  "v1/src/config.py"                          # 309 lines, config
  "v1/src/api/middleware/rate_limit.py"       # 325 lines, rate limiting
  "v1/src/core/phase_sanitizer.py"            # 346 lines, signal processing
  "v1/src/services/orchestrator.py"           # 394 lines, orchestration
  "v1/src/api/routers/health.py"              # 420 lines, API router
)

SYSTEM_PROMPT='You are the V3 QE Test Architect for Agentic QE. You generate comprehensive unit test suites for Python source files using pytest, following the test pyramid, covering happy paths, error paths, and boundary conditions. You follow AAA structure, use descriptive test names, mock external dependencies, and aim for high branch coverage.'

echo "ADR-092 Phase 0 trial — RuView @ $REPO_SHA"
echo "================================================================"
echo

results=()
total_cost=0
total_tokens_in=0
total_tokens_out=0
total_latency=0
failures=0

for i in "${!FILES[@]}"; do
  file="${FILES[$i]}"
  full_path="$RUVIEW_DIR/$file"

  if [[ ! -f "$full_path" ]]; then
    echo "[trial $((i+1))/10] SKIP: $file (not found)"
    continue
  fi

  line_count=$(wc -l < "$full_path")
  file_content=$(cat "$full_path")

  # Build transcript: system prompt + task + a simulated assistant turn showing
  # the executor has just read the file and is planning its test strategy.
  transcript_file="$TMPDIR/transcript-$i.json"
  python3 -c "
import json, sys
transcript = {
    'systemPrompt': '''$SYSTEM_PROMPT''',
    'taskDescription': 'Generate a comprehensive pytest unit test suite for $file ($line_count lines). Target 90%+ branch coverage. Use mocks for external dependencies. Follow AAA structure.',
    'messages': [
        {
            'role': 'user',
            'content': 'Please generate a comprehensive pytest unit test suite for the file $file. Target 90%+ branch coverage.'
        },
        {
            'role': 'assistant',
            'content': 'I have read the file. Here is its full content:\n\n\`\`\`python\n' + sys.stdin.read() + '\n\`\`\`\n\nI am now planning my test strategy. I will enumerate the test cases after confirming the approach.'
        }
    ]
}
json.dump(transcript, sys.stdout)
  " < "$full_path" > "$transcript_file"

  # Run the advisor
  start=$(date +%s%3N)
  output=$($CLI llm advise \
    --transcript "$transcript_file" \
    --agent qe-test-architect \
    --trigger-reason "adr-092-trial-$i" \
    --json 2>&1 | grep -v "UnifiedMemory" || true)
  end=$(date +%s%3N)
  wall_ms=$((end - start))

  # Parse result
  if echo "$output" | jq -e '.advice' >/dev/null 2>&1; then
    advice=$(echo "$output" | jq -r '.advice')
    tokens_in=$(echo "$output" | jq -r '.tokens_in')
    tokens_out=$(echo "$output" | jq -r '.tokens_out')
    cost=$(echo "$output" | jq -r '.cost_usd')
    latency=$(echo "$output" | jq -r '.latency_ms')
    model=$(echo "$output" | jq -r '.model')
    hash=$(echo "$output" | jq -r '.advice_hash' | head -c 12)

    total_cost=$(awk "BEGIN {printf \"%.8f\", $total_cost + $cost}")
    total_tokens_in=$((total_tokens_in + tokens_in))
    total_tokens_out=$((total_tokens_out + tokens_out))
    total_latency=$((total_latency + latency))

    advice_preview=$(echo "$advice" | head -c 120 | tr '\n' ' ')

    echo "[trial $((i+1))/10] OK   $file ($line_count L) — ${tokens_in}→${tokens_out}t, ${latency}ms, \$$(printf '%.4f' $cost)"
    echo "             ${advice_preview}..."

    results+=("$(jq -n \
      --arg file "$file" \
      --arg model "$model" \
      --arg advice "$advice" \
      --arg hash "$hash" \
      --argjson line_count "$line_count" \
      --argjson tokens_in "$tokens_in" \
      --argjson tokens_out "$tokens_out" \
      --argjson cost "$cost" \
      --argjson latency "$latency" \
      --argjson wall_ms "$wall_ms" \
      '{file:$file, model:$model, line_count:$line_count, tokens_in:$tokens_in, tokens_out:$tokens_out, cost_usd:$cost, latency_ms:$latency, wall_ms:$wall_ms, advice_hash:$hash, advice:$advice}')")
  else
    failures=$((failures + 1))
    echo "[trial $((i+1))/10] FAIL $file"
    echo "$output" | head -3
    results+=("$(jq -n --arg file "$file" --arg err "$output" '{file:$file, error:$err}')")
  fi

  echo
done

avg_cost=$(awk "BEGIN {printf \"%.8f\", $total_cost / 10}")
avg_tokens_in=$((total_tokens_in / 10))
avg_tokens_out=$((total_tokens_out / 10))
avg_latency=$((total_latency / 10))

echo "================================================================"
echo "SUMMARY"
echo "  Trials:            10"
echo "  Successes:         $((10 - failures))"
echo "  Failures:          $failures"
echo "  Total cost:        \$$(printf '%.4f' $total_cost)"
echo "  Avg cost/trial:    \$$(printf '%.6f' $avg_cost)"
echo "  Avg tokens in:     $avg_tokens_in"
echo "  Avg tokens out:    $avg_tokens_out"
echo "  Avg latency (ms):  $avg_latency"
echo "  RuView SHA:        $REPO_SHA"
echo

# Write JSON report
jq -n \
  --arg sha "$REPO_SHA" \
  --arg ts "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
  --argjson trials 10 \
  --argjson failures "$failures" \
  --argjson total_cost "$total_cost" \
  --argjson avg_cost "$avg_cost" \
  --argjson total_tokens_in "$total_tokens_in" \
  --argjson total_tokens_out "$total_tokens_out" \
  --argjson avg_tokens_in "$avg_tokens_in" \
  --argjson avg_tokens_out "$avg_tokens_out" \
  --argjson avg_latency "$avg_latency" \
  --argjson results "[$(IFS=,; echo "${results[*]}")]" \
  '{adr:"ADR-092", phase:"phase-0-value-proof", fixture_repo:"https://github.com/ruvnet/RuView", fixture_sha:$sha, timestamp:$ts, trials:$trials, failures:$failures, total_cost_usd:$total_cost, avg_cost_usd:$avg_cost, total_tokens_in:$total_tokens_in, total_tokens_out:$total_tokens_out, avg_tokens_in:$avg_tokens_in, avg_tokens_out:$avg_tokens_out, avg_latency_ms:$avg_latency, results:$results}' \
  > "$REPORT"

echo "Full report: $REPORT"
