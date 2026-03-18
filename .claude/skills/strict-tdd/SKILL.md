---
name: strict-tdd
description: "Use when enforcing TDD discipline — blocks writing production code unless a failing test exists first. Activate with /strict-tdd to enable session-scoped Red-Green-Refactor guardrail."
user-invocable: true
---

# Strict TDD Mode

When activated, this skill registers a session-scoped hook that enforces Red-Green-Refactor discipline.

## What It Does

Blocks writes to `src/` (production code) unless:
1. A test file exists that covers the target module
2. That test has at least one failing assertion (Red phase confirmed)

This prevents the common agent failure of writing test + implementation simultaneously.

## Activation

```
/strict-tdd
```

Remains active for the current session only.

## Hook Configuration

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Write|Edit",
        "hook": ".claude/skills/strict-tdd/scripts/enforce-red-phase.sh",
        "condition": "file matches src/**/*.{ts,js} AND NOT src/**/*.test.{ts,js}"
      }
    ]
  }
}
```

## Enforcement Logic

```bash
#!/bin/bash
# enforce-red-phase.sh
# Called before any Write/Edit to src/ files

TARGET_FILE="$1"
TEST_FILE="${TARGET_FILE%.ts}.test.ts"

if [ ! -f "$TEST_FILE" ]; then
  echo "BLOCKED: No test file found at $TEST_FILE"
  echo "Write a failing test first (Red phase), then implement."
  exit 1
fi

# Check if tests are currently failing (Red phase)
npx jest "$TEST_FILE" --passWithNoTests 2>/dev/null
if [ $? -eq 0 ]; then
  echo "WARNING: Tests are passing. Are you in Green/Refactor phase?"
  echo "If adding new behavior, write a failing test first."
fi
```

## Gotchas

- Only blocks src/ files — test files and config files are always writable
- During Refactor phase, tests should still pass — this is expected, don't treat as violation
- If test runner isn't installed, hook will error — ensure jest/vitest is available
- Agent may try to write to a different path to bypass — the hook should match all production code paths
