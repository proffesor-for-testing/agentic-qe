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
every `edits[].new_string` for MultiEdit). Only test files are checked: `*.test.*`,
`*.spec.*`, files under `__tests__/`, `test/` or `tests/`, `*Test`/`*Tests`/`*Spec`/`*IT`
classes (`.java`, `.kt`, `.scala`, `.groovy`, `.cs`), `test_*.py`, `*_test.py` and `*_test.go`.
Other files are allowed.

For manual or CI use, pass the content as the first argument or as plain text on stdin;
that content is always checked:

```bash
# Check content passed as an argument
bash .claude/skills/no-skip/scripts/check-skips.sh "$CONTENT"

# Or pipe it on stdin
printf '%s' "$CONTENT" | bash .claude/skills/no-skip/scripts/check-skips.sh
```

Exit codes are the same in every mode: `0` = allowed, `2` = blocked (reasons on stderr).
If the hook payload cannot be decoded (for example `node` is missing), the script blocks
rather than allowing the write.

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
