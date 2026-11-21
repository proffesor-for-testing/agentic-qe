#!/bin/bash
# check-skips.sh — No-Skip hook
# Blocks writes that add test-skipping patterns to test files.
# Called by PreToolUse hook on Write/Edit to **/*.test.* or **/*.spec.*
#
# Usage: check-skips.sh "<content>"   or   printf '%s' "<content>" | check-skips.sh
# Exit 0 = allowed, exit 1 = blocked.
#
# Patterns are POSIX extended regular expressions (grep -E with [[:space:]]
# classes) so GNU grep (Linux) and BSD grep (macOS) behave identically.
# Do not use grep -P here: BSD grep rejects it, and a failed grep inside an
# `if` silently reads as "no match", which would let every skip through.

CONTENT="$1"

if [ -z "$CONTENT" ]; then
  # If no content passed, read from stdin
  CONTENT=$(cat)
fi

FOUND=0
WORD_START='(^|[^[:alnum:]_])'

# Check for skip patterns
for pattern in \
  '\.skip[[:space:]]*\(' \
  '\.only[[:space:]]*\(' \
  "${WORD_START}xit[[:space:]]*\\(" \
  "${WORD_START}xdescribe[[:space:]]*\\(" \
  "${WORD_START}xcontext[[:space:]]*\\(" \
  'test\.todo[[:space:]]*\(' \
  '@Skip' \
  '@Disabled' \
  '@Ignore'; do
  printf '%s\n' "$CONTENT" | grep -Eq -- "$pattern"
  status=$?
  if [ $status -eq 0 ]; then
    echo "BLOCKED: Found skip pattern: $pattern"
    FOUND=1
  elif [ $status -gt 1 ]; then
    # grep itself failed (exit >1): fail closed instead of reading it as "clean".
    echo "BLOCKED: grep could not evaluate pattern: $pattern (exit $status)"
    FOUND=1
  fi
done

if [ $FOUND -eq 1 ]; then
  echo "Remove the skip and either fix the test or delete it."
  exit 1
fi

exit 0
