#!/bin/bash
# scan-security.sh — Security Watch hook
# Scans file content for security anti-patterns before writes.
# Called by PreToolUse hook on Write/Edit.

CONTENT="$1"
ISSUES=0

if [ -z "$CONTENT" ]; then
  CONTENT=$(cat)
fi

# Secret patterns
for pattern in 'AKIA[0-9A-Z]{16}' 'sk-[a-zA-Z0-9]{48}' 'ghp_[a-zA-Z0-9]{36}' 'BEGIN (RSA |EC )?PRIVATE KEY' 'sk_live_[a-zA-Z0-9]+'; do
  if echo "$CONTENT" | grep -qP "$pattern" 2>/dev/null; then
    echo "BLOCKED: Potential secret detected (pattern: $pattern)"
    ISSUES=$((ISSUES + 1))
  fi
done

# Hardcoded password patterns
if echo "$CONTENT" | grep -qP 'password\s*[:=]\s*["\x27][^"\x27]{3,}' 2>/dev/null; then
  echo "BLOCKED: Possible hardcoded password detected"
  ISSUES=$((ISSUES + 1))
fi

# Dangerous function patterns
for pattern in '\beval\s*\(' '\bFunction\s*\(' '\.innerHTML\s*=' 'dangerouslySetInnerHTML'; do
  if echo "$CONTENT" | grep -qP "$pattern" 2>/dev/null; then
    echo "WARNING: Dangerous pattern: $pattern"
    ISSUES=$((ISSUES + 1))
  fi
done

# SQL injection risk
if echo "$CONTENT" | grep -qP '\$\{.*\}.*(SELECT|INSERT|UPDATE|DELETE|DROP)' 2>/dev/null; then
  echo "WARNING: Possible SQL injection — template literal in SQL query"
  ISSUES=$((ISSUES + 1))
fi

if [ $ISSUES -gt 0 ]; then
  echo "Found $ISSUES security issue(s). Review before proceeding."
  exit 1
fi

exit 0
