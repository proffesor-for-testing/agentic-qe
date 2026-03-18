#!/bin/bash
# check-skips.sh — No-Skip hook
# Blocks writes that add test-skipping patterns to test files.
# Called by PreToolUse hook on Write/Edit to **/*.test.* or **/*.spec.*

CONTENT="$1"

if [ -z "$CONTENT" ]; then
  # If no content passed, read from stdin
  CONTENT=$(cat)
fi

FOUND=0

# Check for skip patterns
for pattern in '\.skip\s*(' '\.only\s*(' '\bxit\s*(' '\bxdescribe\s*(' '\bxcontext\s*(' 'test\.todo\s*(' '@Skip' '@Disabled' '@Ignore'; do
  if echo "$CONTENT" | grep -qP "$pattern" 2>/dev/null || echo "$CONTENT" | grep -q "$pattern" 2>/dev/null; then
    echo "BLOCKED: Found skip pattern: $pattern"
    FOUND=1
  fi
done

if [ $FOUND -eq 1 ]; then
  echo "Remove the skip and either fix the test or delete it."
  exit 1
fi

exit 0
