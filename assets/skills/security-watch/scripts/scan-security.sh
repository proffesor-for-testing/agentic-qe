#!/bin/bash
# scan-security.sh — Security Watch hook
# Scans file content for security anti-patterns before writes.
#
# Severities:
#   CRITICAL  secrets, private keys, hardcoded passwords — always blocked: exit 2, findings on stderr.
#   WARNING   eval / Function / innerHTML / SQL-in-template heuristics — never hard-blocked:
#             hook mode prints a PreToolUse "ask" decision on stdout (Claude Code asks the user)
#             and exits 0; manual / CI mode prints the warnings on stderr and exits 0.
# Modes:
#   Claude Code PreToolUse hook  JSON payload on stdin (Write / Edit / MultiEdit); the written text
#                                (content, new_string, edits[].new_string) is decoded and scanned.
#   Manual / CI                  scan-security.sh "<content>"  or  printf '%s' "<content>" | scan-security.sh
#
# Patterns are POSIX extended regular expressions (grep -E with [[:space:]]
# classes) so GNU grep (Linux) and BSD grep (macOS) behave identically.
# grep -P is not portable: BSD grep rejects it, and the failure inside an `if`
# would read as "no secret found".

SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
for helper in hook-input.sh; do
  # shellcheck source=/dev/null
  if ! . "$SCRIPT_DIR/$helper"; then
    echo "BLOCKED: cannot load $SCRIPT_DIR/$helper" >&2
    exit 2
  fi
done

HOOK_MODE=0
if [ -n "$1" ]; then
  CONTENT="$1"
else
  read_hook_input
  CONTENT="$HOOK_TEXT"
fi

CRITICAL=0
WARNINGS=""
WORD_START='(^|[^[:alnum:]_])'

critical() {
  echo "BLOCKED: $1" >&2
  CRITICAL=$((CRITICAL + 1))
}
warning() {
  WARNINGS="${WARNINGS:+$WARNINGS; }$1"
}

# Returns 0 when CONTENT matches the pattern. A grep failure is reported as a
# CRITICAL finding (fail closed) and returns 1 so it is not double-counted.
matches() {
  printf '%s\n' "$CONTENT" | grep -Eq -- "$1"
  status=$?
  if [ $status -gt 1 ]; then
    critical "grep could not evaluate pattern: $1 (exit $status)"
    return 1
  fi
  return $status
}

# CRITICAL: secret patterns
for pattern in 'AKIA[0-9A-Z]{16}' 'sk-[a-zA-Z0-9]{48}' 'ghp_[a-zA-Z0-9]{36}' 'BEGIN (RSA |EC )?PRIVATE KEY' 'sk_live_[a-zA-Z0-9]+'; do
  if matches "$pattern"; then
    critical "Potential secret detected (pattern: $pattern)"
  fi
done

# CRITICAL: hardcoded password patterns
if matches "password[[:space:]]*[:=][[:space:]]*[\"'][^\"']{3,}"; then
  critical "Possible hardcoded password detected"
fi

# WARNING: dangerous function patterns
# Each entry is "<label>@@<pattern>".
for check in \
  "eval() call@@${WORD_START}eval[[:space:]]*\\(" \
  "Function() constructor@@${WORD_START}Function[[:space:]]*\\(" \
  'innerHTML assignment@@\.innerHTML[[:space:]]*=' \
  'dangerouslySetInnerHTML@@dangerouslySetInnerHTML'; do
  if matches "${check#*@@}"; then
    warning "Dangerous pattern: ${check%%@@*}"
  fi
done

# WARNING: SQL injection risk
if matches '\$\{.*\}.*(SELECT|INSERT|UPDATE|DELETE|DROP)'; then
  warning "Possible SQL injection — template literal in SQL query"
fi

if [ $CRITICAL -gt 0 ]; then
  [ -z "$WARNINGS" ] || echo "WARNING: $WARNINGS" >&2
  echo "Found $CRITICAL critical security issue(s). Remove them before writing this file." >&2
  exit 2
fi

if [ -n "$WARNINGS" ]; then
  if [ "$HOOK_MODE" -eq 1 ]; then
    # Ask the user instead of hard-blocking. Escape for a JSON string (findings are single-line).
    reason="security-watch: $WARNINGS"
    reason=${reason//\\/\\\\}
    reason=${reason//\"/\\\"}
    printf '{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"ask","permissionDecisionReason":"%s"}}\n' "$reason"
  else
    echo "WARNING: $WARNINGS" >&2
    echo "Review the warning(s) above before proceeding." >&2
  fi
fi

exit 0
