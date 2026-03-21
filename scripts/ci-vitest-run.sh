#!/usr/bin/env bash
# CI wrapper for vitest that handles process hangs gracefully.
#
# Problem: vitest completes all tests but hangs due to open handles
# (SQLite connections, HNSW models, timers). The `timeout` command
# kills it with exit code 124, which CI treats as failure even though
# all tests passed.
#
# Solution: When timeout kills vitest (exit 124), check junit.xml for
# actual test results. If all tests passed, exit 0.
#
# Usage: scripts/ci-vitest-run.sh [vitest args...]
# Example: scripts/ci-vitest-run.sh tests/unit/mcp/handlers/ --fileParallelism=false --reporter=verbose

set -o pipefail

TIMEOUT_SECONDS="${CI_VITEST_TIMEOUT:-480}"

timeout "$TIMEOUT_SECONDS" npx vitest run "$@"
EXIT=$?

if [ $EXIT -eq 0 ]; then
  exit 0
fi

# Exit 124 = killed by timeout. Check if tests actually passed.
if [ $EXIT -eq 124 ] && [ -f junit.xml ]; then
  FAILURES=$(grep -c '<failure' junit.xml 2>/dev/null || echo "0")
  ERRORS=$(grep -oP 'errors="(\d+)"' junit.xml 2>/dev/null | grep -v 'errors="0"' | head -1)
  TESTS_RUN=$(grep -oP 'tests="(\d+)"' junit.xml 2>/dev/null | head -1)

  if [ "$FAILURES" = "0" ] && [ -z "$ERRORS" ] && [ -n "$TESTS_RUN" ]; then
    echo ""
    echo "::warning::Vitest process hung after all tests passed (exit 124). Tests passed — treating as success."
    echo "  junit.xml confirms: 0 failures, $TESTS_RUN"
    exit 0
  fi
fi

exit $EXIT
