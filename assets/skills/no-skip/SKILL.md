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

The hook runs the shipped detector, `scripts/check-skips.sh`. It takes the new file
content as its first argument or on stdin, prints each matched pattern, and exits
`1` (blocked) when a skip is found or `0` when the content is clean.

```bash
# Check content passed as an argument
bash .claude/skills/no-skip/scripts/check-skips.sh "$CONTENT"

# Or pipe it on stdin
printf '%s' "$CONTENT" | bash .claude/skills/no-skip/scripts/check-skips.sh
```

Detected patterns: `.skip(`, `.only(`, `xit(`, `xdescribe(`, `xcontext(`, `test.todo(`,
`@Skip`, `@Disabled`, `@Ignore`. The detector uses POSIX extended regular expressions
(`grep -E` with `[[:space:]]`), so GNU grep on Linux and BSD grep on macOS give the same
result. Do not rewrite it with `grep -P`: BSD grep rejects `-P`, and inside an `if` that
error reads as "no match", so every skip would pass. If grep itself fails, the detector
blocks rather than allowing the write.

## Gotchas

- This catches NEW skips being written, not existing ones — run `grep -r '.skip(' tests/` to find existing skips
- `.only()` is sometimes used intentionally during debugging — deactivate with `/no-skip off` if needed
- Some frameworks use `pending()` instead of `.skip()` — add to patterns if using Jasmine
