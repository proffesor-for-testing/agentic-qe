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

Add this to `.claude/settings.json` (Claude Code settings schema):

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Write|Edit|MultiEdit",
        "hooks": [
          {
            "type": "command",
            "command": "bash \"$CLAUDE_PROJECT_DIR\"/.claude/skills/no-skip/scripts/check-skips.sh"
          }
        ]
      }
    ]
  }
}
```

Claude Code sends the tool call as JSON on stdin. The script decodes it with `node`
(no `jq` needed) and, when it blocks, exits `2` with the reason on stderr, which Claude
Code shows to the model. Exit `0` allows the write.

## Enforcement Logic

The hook runs the shipped detector, `scripts/check-skips.sh`. In hook mode it reads
`tool_input.file_path` and the written text (`content` for Write, `new_string` for Edit,
every `edits[].new_string` for MultiEdit). Only test files are checked; other files are
allowed.

Test files are defined once in `scripts/test-files.sh` (shared by no-skip and freeze-tests;
`\` is normalised to `/`):

- files under a `spec/`, `specs/`, `e2e/`, `cypress/`, `__tests__/`, `test/` or `tests/` directory
- `*.test.*`, `*.spec.*`, `*_spec.*`, `*-spec.*`, `*.tests.*` (case-insensitive), and Cypress `*.cy.*`
- `*Spec.*`, `*Test.*`, `*Tests.*`, `*IT.*` class files (e.g. `FooTest.java`, `FooTests.swift`, `aTest.php`)
- `test_*.py`, `*_test.py`, `*_test.go`

For manual or CI use, pass the content as the first argument or as plain text on stdin;
that content is always checked:

```bash
# Check content passed as an argument
bash .claude/skills/no-skip/scripts/check-skips.sh "$CONTENT"

# Or pipe it on stdin
printf '%s' "$CONTENT" | bash .claude/skills/no-skip/scripts/check-skips.sh
```

Exit codes are the same in every mode: `0` = allowed, `2` = blocked (reasons on stderr).
Stdin whose first character is `{` (after an optional UTF-8 BOM) is treated as a hook
payload. If it cannot be decoded (truncated JSON, no `tool_input` object, `node` missing),
the script blocks with the reason on stderr rather than allowing the write. To check plain
text that starts with `{` manually, pass it as the first argument.

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
