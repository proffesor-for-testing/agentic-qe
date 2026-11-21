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
- **Injection vectors**: template literals interpolated into SQL statements

## Activation

```
/security-watch
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
            "command": "bash \"$CLAUDE_PROJECT_DIR\"/.claude/skills/security-watch/scripts/scan-security.sh"
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

## Detection Patterns

The hook runs the shipped scanner, `scripts/scan-security.sh`. In hook mode it scans the
written text (`content` for Write, `new_string` for Edit, every `edits[].new_string` for
MultiEdit) of every file.

For manual or CI use, pass the content as the first argument or as plain text on stdin:

```bash
bash .claude/skills/security-watch/scripts/scan-security.sh "$CONTENT"
printf '%s' "$CONTENT" | bash .claude/skills/security-watch/scripts/scan-security.sh
```

Exit codes are the same in every mode: `0` = clean, `2` = blocked (findings on stderr; any finding blocks, including WARNING rows).
If the hook payload cannot be decoded (for example `node` is missing), the script blocks
rather than allowing the write.

| Check | Pattern (POSIX ERE) | Result |
|-------|---------------------|--------|
| AWS access key | `AKIA[0-9A-Z]{16}` | BLOCKED |
| OpenAI API key | `sk-[a-zA-Z0-9]{48}` | BLOCKED |
| GitHub personal token | `ghp_[a-zA-Z0-9]{36}` | BLOCKED |
| Private key | `BEGIN (RSA \|EC )?PRIVATE KEY` | BLOCKED |
| Stripe secret key | `sk_live_[a-zA-Z0-9]+` | BLOCKED |
| Hardcoded password | `password` then `:` or `=` then a quoted value of 3+ characters | BLOCKED |
| Dangerous functions | `eval(`, `Function(`, `.innerHTML =`, `dangerouslySetInnerHTML` | WARNING |
| SQL in a template literal | `${...}` followed by `SELECT`/`INSERT`/`UPDATE`/`DELETE`/`DROP` | WARNING |

The scanner uses `grep -E` with `[[:space:]]` classes, so GNU grep on Linux and BSD grep
on macOS give the same result. Do not rewrite it with `grep -P`: BSD grep rejects `-P`,
and inside an `if` that error reads as "no secret found". If grep itself fails, the
scanner reports the failure as a finding rather than passing the content.

## Gotchas

- False positives on test fixtures that intentionally contain patterns like `eval()` — there is no ignore comment; deactivate the hook while writing such fixtures
- Base64-encoded secrets won't be caught — this scans for plaintext patterns only
- Template literal injection detection has false positives on safe string interpolation — review warnings carefully
- This is a first line of defense, not a replacement for proper security review
