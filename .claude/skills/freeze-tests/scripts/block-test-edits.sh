#!/bin/bash
# block-test-edits.sh — Freeze Tests hook
# Blocks all modifications to test files during refactoring.
# Called by PreToolUse hook on Write/Edit targeting test files.
#
# Patterns are POSIX extended regular expressions (grep -E) so GNU grep (Linux)
# and BSD grep (macOS) behave identically. grep -P is not portable: BSD grep
# rejects it, and the failure would read as "not a test file".

FILE="$1"

if [ -z "$FILE" ]; then
  exit 0
fi

# Returns 0 when FILE matches the pattern; fails closed if grep itself errors.
matches() {
  printf '%s\n' "$FILE" | grep -Eq -- "$1"
  status=$?
  if [ $status -gt 1 ]; then
    echo "BLOCKED: grep could not evaluate pattern: $1 (exit $status)"
    return 0
  fi
  return $status
}

# Check if file matches test patterns
if matches '\.(test|spec)\.(ts|js|tsx|jsx)$'; then
  echo "BLOCKED: Test files are frozen during refactoring."
  echo "File: $FILE"
  echo "Deactivate with: /freeze-tests off"
  exit 1
fi

if matches '__tests__/|/tests/'; then
  echo "BLOCKED: Test directories are frozen during refactoring."
  echo "File: $FILE"
  echo "Deactivate with: /freeze-tests off"
  exit 1
fi

exit 0
