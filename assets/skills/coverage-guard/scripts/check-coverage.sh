#!/bin/bash
# check-coverage.sh — Coverage Guard hook
# Checks coverage after test runs and warns if below threshold.
# Called by PostToolUse hook on Bash commands containing jest/vitest/npm test

COVERAGE_FILE="coverage/coverage-summary.json"
THRESHOLD=${COVERAGE_THRESHOLD:-80}
BRANCH_THRESHOLD=${BRANCH_COVERAGE_THRESHOLD:-70}

if [ ! -f "$COVERAGE_FILE" ]; then
  # No coverage report generated — skip silently
  exit 0
fi

# Extract coverage percentages
STATEMENTS=$(node -e "console.log(require('./$COVERAGE_FILE').total.statements.pct)" 2>/dev/null)
BRANCHES=$(node -e "console.log(require('./$COVERAGE_FILE').total.branches.pct)" 2>/dev/null)
FUNCTIONS=$(node -e "console.log(require('./$COVERAGE_FILE').total.functions.pct)" 2>/dev/null)

if [ -z "$STATEMENTS" ]; then
  exit 0
fi

EXIT_CODE=0

# Check statement coverage
if [ "$(echo "$STATEMENTS < $THRESHOLD" | bc -l 2>/dev/null)" = "1" ]; then
  echo "WARNING: Statement coverage (${STATEMENTS}%) below threshold (${THRESHOLD}%)"
  EXIT_CODE=1
fi

# Check branch coverage
if [ -n "$BRANCHES" ] && [ "$(echo "$BRANCHES < $BRANCH_THRESHOLD" | bc -l 2>/dev/null)" = "1" ]; then
  echo "WARNING: Branch coverage (${BRANCHES}%) below threshold (${BRANCH_THRESHOLD}%)"
  EXIT_CODE=1
fi

if [ $EXIT_CODE -eq 0 ]; then
  echo "Coverage OK: statements=${STATEMENTS}%, branches=${BRANCHES}%, functions=${FUNCTIONS}%"
fi

exit $EXIT_CODE
