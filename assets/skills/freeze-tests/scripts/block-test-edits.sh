#!/bin/bash
# block-test-edits.sh — Freeze Tests hook
# Blocks all modifications to test files during refactoring.
#
# Modes (exit codes are the same in every mode: 0 = allowed, 2 = blocked; reasons go to stderr):
#   Claude Code PreToolUse hook  JSON payload on stdin; the path is tool_input.file_path.
#   Manual / CI                  block-test-edits.sh "<file path>"  or  printf '%s' "<path>" | block-test-edits.sh
#
# Test files are defined once in test-files.sh (shared with no-skip). It uses POSIX
# extended regular expressions (grep -E), so GNU grep (Linux) and BSD grep (macOS)
# behave identically.

SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
for helper in hook-input.sh test-files.sh; do
  # shellcheck source=/dev/null
  if ! . "$SCRIPT_DIR/$helper"; then
    echo "BLOCKED: cannot load $SCRIPT_DIR/$helper" >&2
    exit 2
  fi
done

if [ -n "$1" ]; then
  FILE="$1"
else
  read_hook_input
  if [ "$HOOK_MODE" -eq 1 ]; then
    FILE="$HOOK_FILE"
  else
    FILE=$(printf '%s\n' "$HOOK_TEXT" | head -n 1)
  fi
fi

if [ -z "$FILE" ]; then
  exit 0
fi

if is_test_file "$FILE"; then
  {
    echo "BLOCKED: Test files are frozen during refactoring."
    echo "File: $FILE"
    echo "Deactivate with: /freeze-tests off"
  } >&2
  exit 2
fi

exit 0
