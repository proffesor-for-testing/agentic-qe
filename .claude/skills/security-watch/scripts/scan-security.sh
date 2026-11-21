#!/bin/bash
# scan-security.sh — Security Watch hook
# Scans file content for security anti-patterns before writes.
#
# Modes (exit codes are the same in every mode: 0 = clean, 2 = blocked; findings go to stderr):
#   Claude Code PreToolUse hook  JSON payload on stdin (Write / Edit / MultiEdit); the written text
#                                (content, new_string, edits[].new_string) is decoded and scanned.
#   Manual / CI                  scan-security.sh "<content>"  or  printf '%s' "<content>" | scan-security.sh
#
# Patterns are POSIX extended regular expressions (grep -E with [[:space:]]
# classes) so GNU grep (Linux) and BSD grep (macOS) behave identically.
# grep -P is not portable: BSD grep rejects it, and the failure inside an `if`
# would read as "no secret found".

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
  CONTENT="$1"
else
  read_hook_input
  CONTENT="$HOOK_TEXT"
fi

ISSUES=0
WORD_START='(^|[^[:alnum:]_])'

# Returns 0 when CONTENT matches the pattern; fails closed if grep itself errors.
matches() {
  printf '%s\n' "$CONTENT" | grep -Eq -- "$1"
  status=$?
  if [ $status -gt 1 ]; then
    echo "BLOCKED: grep could not evaluate pattern: $1 (exit $status)" >&2
    return 0
  fi
  return $status
}

# Secret patterns
for pattern in 'AKIA[0-9A-Z]{16}' 'sk-[a-zA-Z0-9]{48}' 'ghp_[a-zA-Z0-9]{36}' 'BEGIN (RSA |EC )?PRIVATE KEY' 'sk_live_[a-zA-Z0-9]+'; do
  if matches "$pattern"; then
    echo "BLOCKED: Potential secret detected (pattern: $pattern)" >&2
    ISSUES=$((ISSUES + 1))
  fi
done

# Hardcoded password patterns
if matches "password[[:space:]]*[:=][[:space:]]*[\"'][^\"']{3,}"; then
  echo "BLOCKED: Possible hardcoded password detected" >&2
  ISSUES=$((ISSUES + 1))
fi

# Dangerous function patterns
for pattern in "${WORD_START}eval[[:space:]]*\\(" "${WORD_START}Function[[:space:]]*\\(" '\.innerHTML[[:space:]]*=' 'dangerouslySetInnerHTML'; do
  if matches "$pattern"; then
    echo "WARNING: Dangerous pattern: $pattern" >&2
    ISSUES=$((ISSUES + 1))
  fi
done

# SQL injection risk
if matches '\$\{.*\}.*(SELECT|INSERT|UPDATE|DELETE|DROP)'; then
  echo "WARNING: Possible SQL injection — template literal in SQL query" >&2
  ISSUES=$((ISSUES + 1))
fi

if [ $ISSUES -gt 0 ]; then
  echo "Found $ISSUES security issue(s). Review before proceeding." >&2
  exit 2
fi

exit 0
