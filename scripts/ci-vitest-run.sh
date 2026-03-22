#!/usr/bin/env bash
# CI wrapper for vitest that handles process hangs gracefully.
#
# Problem: vitest completes all tests but hangs due to open handles
# (SQLite connections, HNSW models, timers). The `timeout` command
# kills it with exit code 124, which CI treats as failure even though
# all tests passed.
#
# Solution: Capture vitest output via tee. When timeout kills vitest,
# check the captured output for the "Test Files  X passed" summary
# line that vitest prints after all tests complete. junit.xml cannot
# be used because vitest writes it only on clean exit, and the killed
# process leaves it as 0 bytes.
#
# Usage: scripts/ci-vitest-run.sh [vitest args...]

TIMEOUT_SECONDS="${CI_VITEST_TIMEOUT:-480}"
OUTFILE=$(mktemp /tmp/vitest-output.XXXXXX)

# --foreground: send signal only to the child process, not the process
# group. Without this, timeout kills this wrapper script too.
# Pipe through tee to capture output while still displaying it.
timeout --foreground "$TIMEOUT_SECONDS" npx vitest run "$@" 2>&1 | tee "$OUTFILE"
# PIPESTATUS[0] is timeout's exit code, not tee's
EXIT=${PIPESTATUS[0]}

if [ "$EXIT" -eq 0 ]; then
  rm -f "$OUTFILE"
  exit 0
fi

# Check captured output for vitest's test summary.
# Vitest prints "Test Files  X passed" after all tests complete,
# before the process hangs. If this line exists with no failures,
# tests passed and the exit code is from the timeout kill.
if grep -q "Test Files.*passed" "$OUTFILE" 2>/dev/null; then
  if grep -q "Test Files.*failed" "$OUTFILE" 2>/dev/null; then
    echo "::error::Some test files failed."
    rm -f "$OUTFILE"
    exit "$EXIT"
  fi
  echo ""
  echo "::warning::Vitest process hung after all tests passed (exit $EXIT). Treating as success."
  rm -f "$OUTFILE"
  exit 0
fi

echo "::error::Vitest was killed before tests completed (exit $EXIT)."
rm -f "$OUTFILE"
exit "$EXIT"
