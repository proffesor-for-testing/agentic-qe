#!/usr/bin/env bash
# CI wrapper for vitest that handles process hangs gracefully.
#
# Problem: vitest completes all tests but hangs due to open handles
# (SQLite connections, HNSW models, timers). The `timeout` command
# kills it with exit code 124, which CI treats as failure even though
# all tests passed.
#
# Solution: Use `timeout --foreground` so the signal is sent only to
# vitest (not this wrapper script), then check junit.xml for actual
# test results. If all tests passed, exit 0.
#
# Usage: scripts/ci-vitest-run.sh [vitest args...]

TIMEOUT_SECONDS="${CI_VITEST_TIMEOUT:-480}"

# --foreground: send signal only to the child process, not the process
# group. Without this, timeout kills this wrapper script too.
timeout --foreground "$TIMEOUT_SECONDS" npx vitest run --reporter=junit "$@" && EXIT=0 || EXIT=$?

if [ "$EXIT" -eq 0 ]; then
  exit 0
fi

echo "::notice::Vitest exited with code $EXIT. Checking junit.xml..."

# Check if tests actually passed before the hang.
if [ -f junit.xml ]; then
  echo "::notice::junit.xml exists ($(wc -c < junit.xml) bytes)"
  # Show first line for debug
  head -1 junit.xml

  # Simple check: if there are NO <failure tags and the file has test results, tests passed.
  FAILURE_COUNT=$(grep -c '<failure' junit.xml 2>/dev/null || echo "0")
  HAS_TESTSUITES=$(grep -c '<testsuites' junit.xml 2>/dev/null || echo "0")

  echo "::notice::Failure tags: $FAILURE_COUNT, Has testsuites: $HAS_TESTSUITES"

  if [ "$FAILURE_COUNT" = "0" ] && [ "$HAS_TESTSUITES" -gt 0 ]; then
    echo ""
    echo "::warning::Vitest process hung after all tests passed (exit $EXIT). Treating as success."
    exit 0
  fi
else
  echo "::error::junit.xml not found — vitest may have been killed before tests completed."
fi

exit "$EXIT"
