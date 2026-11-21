#!/bin/bash
# block-test-edits.sh — Freeze Tests hook
# Blocks all modifications to test files during refactoring.
#
# Modes (exit codes are the same in every mode: 0 = allowed, 2 = blocked; reasons go to stderr):
#   Claude Code PreToolUse hook  JSON payload on stdin; the path is tool_input.file_path.
#   Manual / CI                  block-test-edits.sh "<file path>"  or  printf '%s' "<path>" | block-test-edits.sh
#
# Patterns are POSIX extended regular expressions (grep -E) so GNU grep (Linux)
# and BSD grep (macOS) behave identically. grep -P is not portable: BSD grep
# rejects it, and the failure would read as "not a test file".

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

# Returns 0 when FILE matches the pattern; fails closed if grep itself errors.
matches() {
  printf '%s\n' "$FILE" | grep -Eq -- "$1"
  status=$?
  if [ $status -gt 1 ]; then
    echo "BLOCKED: grep could not evaluate pattern: $1 (exit $status)" >&2
    return 0
  fi
  return $status
}

# Check if file matches test patterns
if matches '\.(test|spec)\.(ts|js|tsx|jsx)$'; then
  {
    echo "BLOCKED: Test files are frozen during refactoring."
    echo "File: $FILE"
    echo "Deactivate with: /freeze-tests off"
  } >&2
  exit 2
fi

if matches '__tests__/|/tests/'; then
  {
    echo "BLOCKED: Test directories are frozen during refactoring."
    echo "File: $FILE"
    echo "Deactivate with: /freeze-tests off"
  } >&2
  exit 2
fi

exit 0
