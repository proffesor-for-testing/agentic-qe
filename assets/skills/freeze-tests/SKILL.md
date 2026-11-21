---
name: freeze-tests
description: "Use when refactoring production code and you want to ensure test files are not modified. Activate with /freeze-tests to block all edits to test files for safe refactoring."
user-invocable: true
---

# Freeze Tests Mode

When activated, blocks all modifications to test files. Use during refactoring to ensure behavior (as captured by tests) is preserved.

## What It Does

Blocks Write, Edit and MultiEdit operations on any test file (the same definition no-skip uses):
- files under `spec/`, `specs/`, `e2e/`, `cypress/`, `__tests__/`, `test/` or `tests/`
- `*.test.*`, `*.spec.*`, `*_spec.*`, `*-spec.*`, `*.cy.*`
- `*Spec.*`, `*Test.*`, `*Tests.*`, `*IT.*` class files
- `test_*.py`, `*_test.py`, `*_test.go`

## Activation

```
/freeze-tests
```

Deactivate with `/freeze-tests off`.

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
            "command": "bash \"$CLAUDE_PROJECT_DIR\"/.claude/skills/freeze-tests/scripts/block-test-edits.sh"
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

The hook runs the shipped script, `scripts/block-test-edits.sh`. In hook mode it reads the
target path from `tool_input.file_path`, blocks test files and allows anything else.

Test files are defined once in `scripts/test-files.sh` (shared by no-skip and freeze-tests;
`\` is normalised to `/`):

- files under a `spec/`, `specs/`, `e2e/`, `cypress/`, `__tests__/`, `test/` or `tests/` directory
- `*.test.*`, `*.spec.*`, `*_spec.*`, `*-spec.*`, `*.tests.*` (case-insensitive), and Cypress `*.cy.*`
- `*Spec.*`, `*Test.*`, `*Tests.*`, `*IT.*` class files (e.g. `FooTest.java`, `FooTests.swift`, `aTest.php`)
- `test_*.py`, `*_test.py`, `*_test.go`

For manual or CI use, pass the path as the first argument or as plain text on stdin:

```bash
bash .claude/skills/freeze-tests/scripts/block-test-edits.sh "$FILE"
printf '%s' "$FILE" | bash .claude/skills/freeze-tests/scripts/block-test-edits.sh
```

Exit codes are the same in every mode: `0` = allowed, `2` = blocked (reasons on stderr).
Stdin whose first character is `{` (after an optional UTF-8 BOM) is treated as a hook
payload. If it cannot be decoded (truncated JSON, no `tool_input` object, `node` missing),
the script blocks with the reason on stderr rather than allowing the write. To check plain
text that starts with `{` manually, pass it as the first argument.

The definition uses POSIX extended regular expressions (`grep -E`), so GNU grep on
Linux and BSD grep on macOS give the same result. Do not rewrite it with `grep -P`: BSD
grep rejects `-P`, and inside an `if` that error reads as "not a test file", so every edit
would pass. If grep itself fails, the script blocks rather than allowing the edit.

## When to Use

1. **Refactoring**: Changing code structure without changing behavior
2. **Performance optimization**: Making code faster without changing logic
3. **Dependency updates**: Upgrading libraries while preserving behavior

## Gotchas

- Frozen tests can't be fixed if they break during refactoring — that's the point (the refactoring broke behavior)
- If a refactoring requires test changes, it's not a pure refactoring — deactivate and treat as a feature change
- This doesn't prevent running tests — only modifying test files
