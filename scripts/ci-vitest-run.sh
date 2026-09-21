#!/usr/bin/env bash
# Bound CI test execution without changing Vitest's exit status.
# A passing test summary does not prove coverage/report generation or cleanup
# completed. Runner errors and timeouts must remain failures.
#
# Usage: scripts/ci-vitest-run.sh [vitest args...]

TIMEOUT_SECONDS="${CI_VITEST_TIMEOUT:-480}"

# --foreground sends the timeout signal to the child rather than this wrapper's
# process group. exec preserves the runner's status, including timeout exit 124.
exec timeout --foreground "$TIMEOUT_SECONDS" npx vitest run "$@"
