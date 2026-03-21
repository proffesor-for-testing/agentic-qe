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
# group. Without this, timeout kills this wrapper script too, preventing
# the junit.xml recovery check from running.
timeout --foreground "$TIMEOUT_SECONDS" npx vitest run --reporter=junit "$@" && EXIT=0 || EXIT=$?

if [ "$EXIT" -eq 0 ]; then
  exit 0
fi

# Check if tests actually passed before the hang.
# Exit 124 = timeout killed vitest.
if [ -f junit.xml ]; then
  FAILURES=$(grep -c '<failure' junit.xml 2>/dev/null || echo "0")
  ERRORS=$(grep -o 'errors="[^0"][^"]*"' junit.xml 2>/dev/null | head -1)
  TESTS_RUN=$(grep -o 'tests="[0-9]*"' junit.xml 2>/dev/null | head -1)

  if [ "$FAILURES" = "0" ] && [ -z "$ERRORS" ] && [ -n "$TESTS_RUN" ]; then
    echo ""
    echo "::warning::Vitest process hung after all tests passed (exit $EXIT). Treating as success."
    echo "  junit.xml confirms: 0 failures, $TESTS_RUN"
    exit 0
  else
    echo "::error::Tests failed. Failures: $FAILURES, Errors: $ERRORS, Tests: $TESTS_RUN"
  fi
else
  echo "::error::junit.xml not found — vitest may have been killed before completing."
fi

exit "$EXIT"
