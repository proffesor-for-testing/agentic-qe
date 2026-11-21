#!/bin/bash
# check-skips.sh — No-Skip hook
# Blocks writes that add test-skipping patterns to test files.
#
# Modes (exit codes are the same in every mode: 0 = allowed, 2 = blocked; reasons go to stderr):
#   Claude Code PreToolUse hook  JSON payload on stdin (Write / Edit / MultiEdit). Only test files
#                                (see test-files.sh) are checked; other files are always allowed.
#   Manual / CI                  check-skips.sh "<content>"  or  printf '%s' "<content>" | check-skips.sh
#                                (the content is always checked).
#
# Patterns are POSIX extended regular expressions (grep -E with [[:space:]]
# classes) so GNU grep (Linux) and BSD grep (macOS) behave identically.
# Do not use grep -P here: BSD grep rejects it, and a failed grep inside an
# `if` silently reads as "no match", which would let every skip through.

SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
for helper in hook-input.sh test-files.sh; do
  # shellcheck source=/dev/null
  if ! . "$SCRIPT_DIR/$helper"; then
    echo "BLOCKED: cannot load $SCRIPT_DIR/$helper" >&2
    exit 2
  fi
done

if [ -n "$1" ]; then
  CONTENT="$1"
else
  read_hook_input
  CONTENT="$HOOK_TEXT"
  if [ "$HOOK_MODE" -eq 1 ] && [ -n "$HOOK_FILE" ] && ! is_test_file "$HOOK_FILE"; then
    exit 0 # not a test file
  fi
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
    echo "BLOCKED: Found skip pattern: $pattern" >&2
    FOUND=1
  elif [ $status -gt 1 ]; then
    # grep itself failed (exit >1): fail closed instead of reading it as "clean".
    echo "BLOCKED: grep could not evaluate pattern: $pattern (exit $status)" >&2
    FOUND=1
  fi
done

if [ $FOUND -eq 1 ]; then
  echo "Remove the skip and either fix the test or delete it." >&2
  exit 2
fi

exit 0
