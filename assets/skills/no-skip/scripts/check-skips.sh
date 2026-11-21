#!/bin/bash
# check-skips.sh — No-Skip hook
# Blocks writes that add test-skipping patterns to test files.
#
# Modes (exit codes are the same in every mode: 0 = allowed, 2 = blocked; reasons go to stderr):
#   Claude Code PreToolUse hook  JSON payload on stdin (Write / Edit / MultiEdit). Only files that
#                                look like tests are checked; other files are always allowed.
#   Manual / CI                  check-skips.sh "<content>"  or  printf '%s' "<content>" | check-skips.sh
#                                (the content is always checked).
#
# Patterns are POSIX extended regular expressions (grep -E with [[:space:]]
# classes) so GNU grep (Linux) and BSD grep (macOS) behave identically.
# Do not use grep -P here: BSD grep rejects it, and a failed grep inside an
# `if` silently reads as "no match", which would let every skip through.

# --- Claude Code hook input (shared by the no-skip, freeze-tests and security-watch hooks) ---
# A PreToolUse hook receives a JSON payload on stdin:
#   {"tool_name":"Write|Edit|MultiEdit","tool_input":{"file_path":...,"content":...,
#    "new_string":...,"edits":[{"new_string":...}]}}
# It is decoded with node (always present where Claude Code runs); jq is not required.
# read_hook_input sets HOOK_MODE=1, HOOK_FILE and HOOK_TEXT for a hook payload, or
# HOOK_MODE=0 and HOOK_TEXT=<raw stdin> for plain text. It exits 2 (blocked) if a
# payload cannot be decoded, so a decoding failure never reads as "allowed".
hook_field() {
  printf '%s' "$HOOK_INPUT" | node -e '
    const field = process.argv[1];
    let raw = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (d) => { raw += d; }).on("end", () => {
      let payload;
      try { payload = JSON.parse(raw); } catch { process.exit(3); }
      const input = payload && typeof payload === "object" ? payload.tool_input : undefined;
      if (!input || typeof input !== "object") process.exit(3);
      if (field === "path") {
        const p = input.file_path ?? input.notebook_path ?? input.path ?? "";
        process.stdout.write(typeof p === "string" ? p : "");
        return;
      }
      const parts = [];
      for (const key of ["content", "new_string", "new_source"]) {
        if (typeof input[key] === "string") parts.push(input[key]);
      }
      if (Array.isArray(input.edits)) {
        for (const e of input.edits) if (e && typeof e.new_string === "string") parts.push(e.new_string);
      }
      process.stdout.write(parts.join("\n"));
    });
  ' "$1"
}

read_hook_input() {
  HOOK_INPUT=$(cat)
  HOOK_MODE=0
  HOOK_FILE=""
  HOOK_TEXT="$HOOK_INPUT"
  local trimmed rc
  trimmed="${HOOK_INPUT#"${HOOK_INPUT%%[![:space:]]*}"}"
  [ "${trimmed:0:1}" = "{" ] || return 0
  if ! command -v node >/dev/null 2>&1; then
    echo "BLOCKED: cannot decode the hook payload: node was not found on PATH" >&2
    exit 2
  fi
  HOOK_FILE=$(hook_field path)
  rc=$?
  if [ $rc -eq 3 ]; then
    HOOK_FILE=""
    return 0 # plain text that happens to start with "{"
  fi
  if [ $rc -ne 0 ] || ! HOOK_TEXT=$(hook_field text); then
    echo "BLOCKED: cannot decode the hook payload (node exit $rc)" >&2
    exit 2
  fi
  HOOK_MODE=1
}
# --- end hook input ---

# Test files: *.test.* / *.spec.*, __tests__/ or test(s)/ directories, JVM/.NET *Test/*Tests/*Spec
# classes, Python test_*.py / *_test.py, Go *_test.go.
TEST_FILE_RE='\.(test|spec)\.[[:alnum:]]+$|__tests__/|(^|/)tests?/|(Test|Tests|Spec|IT)\.(java|kt|scala|groovy|cs)$|(^|/)test_[^/]*\.py$|_test\.(py|go)$'

if [ -n "$1" ]; then
  CONTENT="$1"
else
  read_hook_input
  CONTENT="$HOOK_TEXT"
  if [ "$HOOK_MODE" -eq 1 ] && [ -n "$HOOK_FILE" ] \
    && ! printf '%s\n' "$HOOK_FILE" | grep -Eq -- "$TEST_FILE_RE"; then
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
