---
name: security-watch
description: "Use when working on security-sensitive code to catch secrets, eval(), innerHTML, and other dangerous patterns before they're written. Activate with /security-watch for real-time security scanning."
user-invocable: true
---

# Security Watch Mode

When activated, scans every file write for common security anti-patterns and blocks dangerous code from being committed.

## What It Does

Flags or blocks writes containing:
- **Secrets**: API keys, passwords, tokens, private keys in source code
- **Dangerous functions**: `eval()`, `Function()`, `innerHTML`, `dangerouslySetInnerHTML`
- **Injection vectors**: Unsanitized template literals in SQL/shell commands
- **Insecure config**: `http://` URLs, disabled TLS verification, `*` CORS origins

## Activation

```
/security-watch
```

## Hook Configuration

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Write|Edit",
        "hook": ".claude/skills/security-watch/scripts/scan-security.sh"
      }
    ]
  }
}
```

## Detection Patterns

```bash
#!/bin/bash
# scan-security.sh
CONTENT="$1"
ISSUES=0

# Secrets detection
SECRET_PATTERNS=(
  'AKIA[0-9A-Z]{16}'                    # AWS Access Key
  'sk-[a-zA-Z0-9]{48}'                  # OpenAI API Key
  'ghp_[a-zA-Z0-9]{36}'                 # GitHub Personal Token
  'password\s*[:=]\s*["\x27][^"\x27]+'  # Hardcoded passwords
  'BEGIN (RSA |EC )?PRIVATE KEY'         # Private keys
  'sk_live_[a-zA-Z0-9]+'                # Stripe secret key
)

for pattern in "${SECRET_PATTERNS[@]}"; do
  if echo "$CONTENT" | grep -qP "$pattern"; then
    echo "BLOCKED: Potential secret detected matching pattern: $pattern"
    ISSUES=$((ISSUES + 1))
  fi
done

# Dangerous functions
DANGER_PATTERNS=(
  '\beval\s*\('
  '\bFunction\s*\('
  '\.innerHTML\s*='
  'dangerouslySetInnerHTML'
  'child_process.*exec\('
  '\$\{.*\}.*(?:SELECT|INSERT|UPDATE|DELETE)'
)

for pattern in "${DANGER_PATTERNS[@]}"; do
  if echo "$CONTENT" | grep -qP "$pattern"; then
    echo "WARNING: Dangerous pattern detected: $pattern"
    ISSUES=$((ISSUES + 1))
  fi
done

if [ $ISSUES -gt 0 ]; then
  echo "Found $ISSUES security issues. Review before proceeding."
  exit 1
fi
```

## Gotchas

- False positives on test fixtures that intentionally contain patterns like `eval()` — use `// security-watch:ignore` comment
- Base64-encoded secrets won't be caught — this scans for plaintext patterns only
- Template literal injection detection has false positives on safe string interpolation — review warnings carefully
- This is a first line of defense, not a replacement for proper security review
