---
name: freeze-tests
description: "Use when refactoring production code and you want to ensure test files are not modified. Activate with /freeze-tests to block all edits to test files for safe refactoring."
user-invocable: true
---

# Freeze Tests Mode

When activated, blocks all modifications to test files. Use during refactoring to ensure behavior (as captured by tests) is preserved.

## What It Does

Blocks Write and Edit operations on any file matching test patterns:
- `**/*.test.{ts,js,tsx,jsx}`
- `**/*.spec.{ts,js,tsx,jsx}`
- `**/__tests__/**`
- `**/tests/**`

## Activation

```
/freeze-tests
```

Deactivate with `/freeze-tests off`.

## Hook Configuration

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Write|Edit",
        "hook": ".claude/skills/freeze-tests/scripts/block-test-edits.sh",
        "condition": "file matches **/*.test.* OR **/*.spec.* OR **/__tests__/** OR **/tests/**"
      }
    ]
  }
}
```

## Enforcement Logic

```bash
#!/bin/bash
# block-test-edits.sh
FILE="$1"

if echo "$FILE" | grep -qP '\.(test|spec)\.(ts|js|tsx|jsx)$|__tests__|/tests/'; then
  echo "BLOCKED: Test files are frozen during refactoring."
  echo "If tests need updating, deactivate with: /freeze-tests off"
  exit 1
fi
```

## When to Use

1. **Refactoring**: Changing code structure without changing behavior
2. **Performance optimization**: Making code faster without changing logic
3. **Dependency updates**: Upgrading libraries while preserving behavior

## Gotchas

- Frozen tests can't be fixed if they break during refactoring — that's the point (the refactoring broke behavior)
- If a refactoring requires test changes, it's not a pure refactoring — deactivate and treat as a feature change
- This doesn't prevent running tests — only modifying test files
