#!/bin/bash
# block-test-edits.sh — Freeze Tests hook
# Blocks all modifications to test files during refactoring.
# Called by PreToolUse hook on Write/Edit targeting test files.

FILE="$1"

if [ -z "$FILE" ]; then
  exit 0
fi

# Check if file matches test patterns
if echo "$FILE" | grep -qP '\.(test|spec)\.(ts|js|tsx|jsx)$' 2>/dev/null; then
  echo "BLOCKED: Test files are frozen during refactoring."
  echo "File: $FILE"
  echo "Deactivate with: /freeze-tests off"
  exit 1
fi

if echo "$FILE" | grep -qP '__tests__/|/tests/' 2>/dev/null; then
  echo "BLOCKED: Test directories are frozen during refactoring."
  echo "File: $FILE"
  echo "Deactivate with: /freeze-tests off"
  exit 1
fi

exit 0
