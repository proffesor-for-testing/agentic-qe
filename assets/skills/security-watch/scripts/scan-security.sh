#!/bin/bash
# scan-security.sh — Security Watch hook
# Scans file content for security anti-patterns before writes.
# Called by PreToolUse hook on Write/Edit.
#
# Patterns are POSIX extended regular expressions (grep -E with [[:space:]]
# classes) so GNU grep (Linux) and BSD grep (macOS) behave identically.
# grep -P is not portable: BSD grep rejects it, and the failure inside an `if`
# would read as "no secret found".

CONTENT="$1"
ISSUES=0
WORD_START='(^|[^[:alnum:]_])'

if [ -z "$CONTENT" ]; then
  CONTENT=$(cat)
fi

# Returns 0 when CONTENT matches the pattern; fails closed if grep itself errors.
matches() {
  printf '%s\n' "$CONTENT" | grep -Eq -- "$1"
  status=$?
  if [ $status -gt 1 ]; then
    echo "BLOCKED: grep could not evaluate pattern: $1 (exit $status)"
    return 0
  fi
  return $status
}

# Secret patterns
for pattern in 'AKIA[0-9A-Z]{16}' 'sk-[a-zA-Z0-9]{48}' 'ghp_[a-zA-Z0-9]{36}' 'BEGIN (RSA |EC )?PRIVATE KEY' 'sk_live_[a-zA-Z0-9]+'; do
  if matches "$pattern"; then
    echo "BLOCKED: Potential secret detected (pattern: $pattern)"
    ISSUES=$((ISSUES + 1))
  fi
done

# Hardcoded password patterns
if matches "password[[:space:]]*[:=][[:space:]]*[\"'][^\"']{3,}"; then
  echo "BLOCKED: Possible hardcoded password detected"
  ISSUES=$((ISSUES + 1))
fi

# Dangerous function patterns
for pattern in "${WORD_START}eval[[:space:]]*\\(" "${WORD_START}Function[[:space:]]*\\(" '\.innerHTML[[:space:]]*=' 'dangerouslySetInnerHTML'; do
  if matches "$pattern"; then
    echo "WARNING: Dangerous pattern: $pattern"
    ISSUES=$((ISSUES + 1))
  fi
done

# SQL injection risk
if matches '\$\{.*\}.*(SELECT|INSERT|UPDATE|DELETE|DROP)'; then
  echo "WARNING: Possible SQL injection — template literal in SQL query"
  ISSUES=$((ISSUES + 1))
fi

if [ $ISSUES -gt 0 ]; then
  echo "Found $ISSUES security issue(s). Review before proceeding."
  exit 1
fi

exit 0
