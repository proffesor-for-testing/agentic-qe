---
name: security-watch
description: "Use when working on security-sensitive code to catch secrets, eval(), innerHTML, and other dangerous patterns before they're written. Activate with /security-watch for real-time security scanning."
user-invocable: true
---

# Security Watch Mode

When activated, scans every file write for common security anti-patterns and blocks dangerous code from being committed.

## What It Does

Blocks writes containing secrets and asks before writes containing risky patterns:
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
(no `jq` needed). A CRITICAL finding blocks: exit `2` with the findings on stderr, which
Claude Code shows to the model. WARNING findings never hard-block: the script prints a
PreToolUse `"permissionDecision": "ask"` decision on stdout and exits `0`, so Claude Code
asks the user whether to allow the write. Clean content exits `0` with no output.

## Detection Patterns

The hook runs the shipped scanner, `scripts/scan-security.sh`. In hook mode it scans the
written text (`content` for Write, `new_string` for Edit, every `edits[].new_string` for
MultiEdit) of every file.

For manual or CI use, pass the content as the first argument or as plain text on stdin:

```bash
bash .claude/skills/security-watch/scripts/scan-security.sh "$CONTENT"
printf '%s' "$CONTENT" | bash .claude/skills/security-watch/scripts/scan-security.sh
```

In manual or CI mode a CRITICAL finding exits `2` (findings on stderr); WARNING findings
are printed on stderr and the script exits `0`; clean content exits `0`.
Stdin whose first character is `{` (after an optional UTF-8 BOM) is treated as a hook
payload. If it cannot be decoded (truncated JSON, no `tool_input` object, `node` missing),
the script blocks with the reason on stderr rather than allowing the write. To check plain
text that starts with `{` manually, pass it as the first argument.

| Check | Pattern (POSIX ERE) | Result |
|-------|---------------------|--------|
| AWS access key | `AKIA[0-9A-Z]{16}` | CRITICAL (blocked) |
| OpenAI API key | `sk-[a-zA-Z0-9]{48}` | CRITICAL (blocked) |
| GitHub personal token | `ghp_[a-zA-Z0-9]{36}` | CRITICAL (blocked) |
| Private key | `BEGIN (RSA \|EC )?PRIVATE KEY` | CRITICAL (blocked) |
| Stripe secret key | `sk_live_[a-zA-Z0-9]+` | CRITICAL (blocked) |
| Hardcoded password | `password` then `:` or `=` then a quoted value of 3+ characters | CRITICAL (blocked) |
| Dangerous functions | `eval(`, `Function(`, `.innerHTML =`, `dangerouslySetInnerHTML` | WARNING (ask) |
| SQL in a template literal | `${...}` followed by `SELECT`/`INSERT`/`UPDATE`/`DELETE`/`DROP` | WARNING (ask) |

The scanner uses `grep -E` with `[[:space:]]` classes, so GNU grep on Linux and BSD grep
on macOS give the same result. Do not rewrite it with `grep -P`: BSD grep rejects `-P`,
and inside an `if` that error reads as "no secret found". If grep itself fails, the
scanner reports a CRITICAL finding rather than passing the content.

## Gotchas

- False positives on test fixtures that intentionally contain patterns like `eval()` — there is no ignore comment; deactivate the hook while writing such fixtures
- Base64-encoded secrets won't be caught — this scans for plaintext patterns only
- Template literal injection detection has false positives on safe string interpolation — review warnings carefully
- This is a first line of defense, not a replacement for proper security review
