#!/usr/bin/env bash
# CI wrapper for vitest that handles process hangs gracefully.
#
# Problem: vitest completes all tests but hangs due to open handles
# (SQLite connections, HNSW models, timers). The `timeout` command
# kills it with exit code 124, which CI treats as failure even though
# all tests passed.
#
# Solution: Always include the junit reporter so junit.xml is written
# when tests complete. When timeout kills vitest (exit 124), check
# junit.xml for actual test results. If all tests passed, exit 0.
#
# Usage: scripts/ci-vitest-run.sh [vitest args...]
# Example: scripts/ci-vitest-run.sh tests/unit/mcp/handlers/ --fileParallelism=false --reporter=verbose

set -o pipefail

TIMEOUT_SECONDS="${CI_VITEST_TIMEOUT:-480}"

# Ensure junit reporter is always included so junit.xml is written
# even if --reporter=verbose overrides vitest.config.ts reporters.
# Inject --reporter=junit before any user args.
timeout "$TIMEOUT_SECONDS" npx vitest run --reporter=junit "$@"
EXIT=$?

if [ $EXIT -eq 0 ]; then
  exit 0
fi

# Exit 124 = killed by timeout. Check if tests actually passed.
if [ $EXIT -eq 124 ] && [ -f junit.xml ]; then
  FAILURES=$(grep -c '<failure' junit.xml 2>/dev/null || echo "0")
  ERRORS=$(grep -o 'errors="[^0"][^"]*"' junit.xml 2>/dev/null | head -1)
  TESTS_RUN=$(grep -o 'tests="[0-9]*"' junit.xml 2>/dev/null | head -1)

  if [ "$FAILURES" = "0" ] && [ -z "$ERRORS" ] && [ -n "$TESTS_RUN" ]; then
    echo ""
    echo "::warning::Vitest process hung after all tests passed (exit 124). Tests passed — treating as success."
    echo "  junit.xml confirms: 0 failures, $TESTS_RUN"
    exit 0
  fi
fi

exit $EXIT
