#!/bin/bash
# enforce-red-phase.sh — Strict TDD hook
# Blocks writes to src/ unless a corresponding test file exists and has failing tests.
# Called by PreToolUse hook on Write/Edit to src/**/*.{ts,js}

TARGET_FILE="$1"

# Skip non-source files
if [[ ! "$TARGET_FILE" =~ ^src/ ]] || [[ "$TARGET_FILE" =~ \.(test|spec)\.(ts|js|tsx|jsx)$ ]]; then
  exit 0
fi

# Derive test file path
TEST_FILE="${TARGET_FILE%.ts}.test.ts"
if [ ! -f "$TEST_FILE" ]; then
  TEST_FILE="${TARGET_FILE%.js}.test.js"
fi

if [ ! -f "$TEST_FILE" ]; then
  echo "BLOCKED: No test file found for $TARGET_FILE"
  echo "Expected: ${TARGET_FILE%.ts}.test.ts"
  echo "Write a failing test first (Red phase), then implement."
  exit 1
fi

# Check if tests are currently passing (should be failing in Red phase)
npx jest "$TEST_FILE" --passWithNoTests --silent 2>/dev/null
TEST_EXIT=$?

if [ $TEST_EXIT -eq 0 ]; then
  echo "WARNING: Tests in $TEST_FILE are all passing."
  echo "If adding new behavior, write a failing test first (Red phase)."
  echo "If in Green/Refactor phase, this is expected — proceed."
fi

exit 0
