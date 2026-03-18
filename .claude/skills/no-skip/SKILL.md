---
name: no-skip
description: "Use when you want to prevent .skip(), .only(), xit(), and xdescribe() from being committed to test files. Activate with /no-skip for session-scoped test skip prevention."
user-invocable: true
---

# No-Skip Mode

When activated, blocks any write that adds test-skipping patterns to test files.

## What It Does

Prevents these patterns from being written to test files:
- `.skip()` — skips individual tests
- `.only()` — runs only one test (excludes all others)
- `xit(` / `xdescribe(` — Jasmine skip syntax
- `test.todo(` — unimplemented test placeholders
- `@Skip` / `@Disabled` — JUnit skip annotations

## Activation

```
/no-skip
```

## Hook Configuration

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Write|Edit",
        "hook": ".claude/skills/no-skip/scripts/check-skips.sh",
        "condition": "file matches **/*.test.{ts,js,tsx,jsx} OR **/*.spec.{ts,js}"
      }
    ]
  }
}
```

## Enforcement Logic

```bash
#!/bin/bash
# check-skips.sh
CONTENT="$1"

SKIP_PATTERNS=(
  '\.skip\s*\('
  '\.only\s*\('
  '\bxit\s*\('
  '\bxdescribe\s*\('
  '\bxcontext\s*\('
  'test\.todo\s*\('
  '@Skip'
  '@Disabled'
  '@Ignore'
)

for pattern in "${SKIP_PATTERNS[@]}"; do
  if echo "$CONTENT" | grep -qP "$pattern"; then
    echo "BLOCKED: Found skip pattern '$pattern'"
    echo "Remove the skip and either fix the test or delete it."
    exit 1
  fi
done
```

## Gotchas

- This catches NEW skips being written, not existing ones — run `grep -r '.skip(' tests/` to find existing skips
- `.only()` is sometimes used intentionally during debugging — deactivate with `/no-skip off` if needed
- Some frameworks use `pending()` instead of `.skip()` — add to patterns if using Jasmine
