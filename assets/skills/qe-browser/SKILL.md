---
name: "qe-browser"
description: "Browser automation for QE agents using Vibium (WebDriver BiDi) with assertions, batch execution, visual diff, prompt-injection scanning, and semantic intents. Use when any QE skill needs to drive a real browser — visual testing, accessibility audits, E2E flow verification, pentest validation, or exploratory testing."
trust_tier: 3
validation:
  schema_path: schemas/output.json
  validator_path: scripts/validate-config.json
  eval_path: evals/qe-browser.yaml
---

# QE Browser

Thin AQE-owned wrapper around [Vibium](https://github.com/VibiumDev/vibium) that adds QE-specific primitives: typed assertions, batch execution, visual-diff against baselines, prompt-injection scanning, and semantic intent scoring.

**Engine:** Vibium — single ~10MB Go binary, built on WebDriver BiDi (W3C standard), Apache-2.0 licensed, published on npm/PyPI/Maven Central. Auto-launches a background daemon and auto-downloads Chrome for Testing on first use.

**Why Vibium, not Playwright?**
- 10MB binary vs ~300MB Playwright install
- WebDriver BiDi standard (not CDP) — future-proof for Firefox/Safari
- `--json` mode on every command (matches AQE structured-output rule)
- Built-in MCP server: `npx -y vibium mcp`
- First-class semantic locators: `find text|label|placeholder|testid|role|xpath|alt|title`

## Platform support (verified 2026-04-09 against Vibium v26.3.18)

| Platform | `npm install -g vibium` | `vibium go <url>` | smoke-test.sh |
|---|---|---|---|
| macOS arm64 (Apple Silicon native) | ✅ | ✅ | ✅ |
| macOS x64 (Intel) | ✅ | ✅ | ✅ |
| Linux x86_64 | ✅ | ✅ | ✅ |
| Windows x64 | ✅ | ✅ | not yet tested |
| **Linux ARM64 (aarch64)** | ✅ binary itself | ⚠️ **Workaround required** | ✅ after workaround |

### Linux ARM64 workaround

Google Chrome for Testing does not publish a `linux-arm64` build. Vibium falls back to `chrome-linux64` (x86_64) on aarch64 hosts, which fails under Rosetta with `failed to open elf at /lib64/ld-linux-x86-64.so.2`. To run qe-browser on a Linux ARM64 codespace or container:

```bash
# 1. Install Vibium normally — the vibium binary itself IS native ARM64
npm install -g vibium

# 2. Install Debian's native ARM64 chromium + chromedriver
sudo apt-get update
sudo apt-get install -y chromium chromium-driver

# 3. Symlink Vibium's broken cached binaries to the native system ones.
#    Run after `vibium install` (auto-runs on first `vibium go`).
for dir in ~/.cache/vibium/chrome-for-testing/*/; do
  # Newer Vibium layout (v26.3.x): chromedriver and chrome at the root
  if [ -e "$dir/chromedriver" ]; then
    rm -f "$dir/chromedriver" "$dir/chrome"
    ln -s /usr/bin/chromedriver "$dir/chromedriver"
    ln -s /usr/bin/chromium     "$dir/chrome"
  fi
  # Older Vibium layout: chromedriver-linux64/ and chrome-linux64/ subdirs
  if [ -e "$dir/chromedriver-linux64/chromedriver" ]; then
    rm -f "$dir/chromedriver-linux64/chromedriver" "$dir/chrome-linux64/chrome"
    ln -s /usr/bin/chromedriver "$dir/chromedriver-linux64/chromedriver"
    ln -s /usr/bin/chromium     "$dir/chrome-linux64/chrome"
  fi
done

# 4. Verify
vibium --headless go https://httpbin.org/html
vibium --headless title  # → "Herman Melville - Moby-Dick"
```

This workaround is verified working on Debian bookworm aarch64 with chromium 146.0.7680.177-1~deb12u1. Track upstream — when Vibium adds a `--browser-path` flag or Google ships `linux-arm64` Chrome for Testing, this section becomes obsolete.

## Headless mode

Helper scripts (`assert.js`, `batch.js`, `visual-diff.js`, `check-injection.js`, `intent-score.js`) automatically inject `--headless` into every `vibium` invocation because the qe-browser skill is designed for QE/CI use cases where there's no display server. **Vibium itself defaults to "visible by default"** — running `vibium go` on a headless container without `--headless` fails with `Missing X server or $DISPLAY`.

Opt out for interactive debugging:
```bash
QE_BROWSER_HEADED=1 node .claude/skills/qe-browser/scripts/assert.js --checks '...'
```

When you call `vibium` directly (not through a helper), pass `--headless` yourself if you're in a container:
```bash
vibium --headless go https://example.com
vibium --headless title
```

## Activation

- When a QE skill needs to navigate, read, interact with, or capture a web page
- When running visual regression tests against stored baselines
- When asserting page state (URL, text visibility, console errors, network failures)
- When validating exploitability of security findings (pentest)
- When scanning untrusted pages for prompt injection
- When running batch automation with explicit pass/fail gates

## Core Workflow

Every browser-driven QE task follows the same shape:

1. **Navigate** — `vibium go <url>`
2. **Map** — `vibium map` to get element refs (`@e1`, `@e2`, …)
3. **Interact** — `vibium click @e1`, `vibium fill @e2 "text"`
4. **Verify** — use this skill's `assert.js` to run typed checks, OR use `vibium diff map` to see what changed
5. **Re-map** if DOM changed

```bash
# Typical login flow verification
vibium go https://app.example.com/login
vibium map --json > /tmp/refs.json
vibium fill @e1 "$USERNAME"
vibium fill @e2 "$PASSWORD"
vibium click @e3
vibium wait url "/dashboard"
node .claude/skills/qe-browser/scripts/assert.js --checks '[
  {"kind": "url_contains", "text": "/dashboard"},
  {"kind": "no_console_errors"},
  {"kind": "no_failed_requests"}
]'
```

## Ref Lifecycle — use `diff map`

Vibium refs are invalidated when the DOM changes. Instead of versioning refs manually, Vibium gives you `vibium diff map` which shows exactly what's new, removed, or repositioned since the last `map` call. After any interaction that changes the DOM:

```bash
vibium click @e3
vibium diff map --json   # shows added/removed/moved refs
```

This is cleaner than tracking version numbers — you get a structured delta you can feed directly into the next action.

## QE Primitives (this skill's value-add)

All scripts live in `.claude/skills/qe-browser/scripts/` and shell out to `vibium`. They expect `vibium` to be on PATH (installed by `aqe init`).

### `assert.js` — Typed assertions with 16 check kinds

```bash
node scripts/assert.js --checks '[
  {"kind": "url_contains", "text": "/dashboard"},
  {"kind": "text_visible", "text": "Welcome"},
  {"kind": "selector_visible", "selector": "#user-menu"},
  {"kind": "value_equals", "selector": "input[name=email]", "value": "user@test.com"},
  {"kind": "no_console_errors"},
  {"kind": "no_failed_requests"},
  {"kind": "response_status", "url": "/api/user", "status": 200},
  {"kind": "element_count", "selector": ".result", "op": ">=", "count": 5}
]'
```

All 16 kinds: `url_contains`, `url_equals`, `text_visible`, `text_hidden`, `selector_visible`, `selector_hidden`, `value_equals`, `attribute_equals`, `no_console_errors`, `no_failed_requests`, `response_status`, `request_url_seen`, `console_message_matches`, `element_count`, `title_matches`, `page_source_contains`.

Full reference: [references/assertion-kinds.md](references/assertion-kinds.md).

Exit code is non-zero if any check fails. Output is JSON: `{ "passed": N, "failed": M, "results": [...] }`.

### `batch.js` — Multi-step execution with stop-on-failure

```bash
node scripts/batch.js --steps '[
  {"action": "go", "url": "https://example.com/login"},
  {"action": "fill", "ref": "@e1", "text": "user@test.com"},
  {"action": "fill", "ref": "@e2", "text": "secret"},
  {"action": "click", "ref": "@e3"},
  {"action": "wait_url", "pattern": "/dashboard"},
  {"action": "assert", "checks": [{"kind": "no_console_errors"}]}
]' --summary-only
```

Reduces round-trips vs calling `vibium` per step. Supports `--stop-on-failure` (default true) and `--summary-only`.

### `visual-diff.js` — Pixel diff against stored baselines

```bash
# First run — creates baseline
node scripts/visual-diff.js --name "homepage"

# Subsequent runs — compare
node scripts/visual-diff.js --name "homepage" --threshold 0.05

# Scope to an element
node scripts/visual-diff.js --name "hero" --selector "#hero"

# Reset baseline after intentional change
node scripts/visual-diff.js --name "homepage" --update-baseline
```

Baselines stored in `.aqe/visual-baselines/` (project-local, gitignored by default). Uses `pixelmatch` for pixel comparison; returns similarity % and diff image path.

### `check-injection.js` — Prompt injection scanner

Scans the current page content for known prompt-injection patterns (ignore previous instructions, system prompts in hidden text, etc.). Ported from gsd-browser's heuristic scanner (MIT/Apache).

```bash
vibium go https://untrusted-page.com
node scripts/check-injection.js --include-hidden --json
```

Returns severity-ranked findings. Intended for `pentest-validation`, `injection-analyst`, and `aidefence-guardian`.

### `intent-score.js` — 15 semantic intents

Heuristic-scored element discovery — no LLM round-trip. Ported from gsd-browser's `intent.rs:59-385` (MIT/Apache).

```bash
node scripts/intent-score.js --intent accept_cookies
node scripts/intent-score.js --intent submit_form --scope "#login-form"
node scripts/intent-score.js --intent primary_cta
```

Intents: `submit_form`, `close_dialog`, `primary_cta`, `search_field`, `next_step`, `dismiss`, `auth_action`, `back_navigation`, `fill_email`, `fill_password`, `fill_username`, `accept_cookies`, `main_content`, `pagination_next`, `pagination_prev`.

Returns top 5 candidates with scores and selectors. Useful for dismissing cookie banners, finding login forms, and navigating through wizards without having to map the whole page.

## Common QE Patterns

### Pattern 1 — Visual regression in CI

```bash
vibium go "$STAGING_URL"
vibium wait load
node scripts/visual-diff.js --name "homepage-$(uname -m)" --threshold 0.02
# Non-zero exit if diff exceeds threshold
```

### Pattern 2 — E2E flow with explicit assertions

```bash
node scripts/batch.js --steps @flows/login-flow.json
node scripts/assert.js --checks @assertions/post-login.json
```

### Pattern 3 — Accessibility audit without axe round-trip

```bash
vibium go "$URL"
vibium a11y-tree --json > a11y.json
# Analyze a11y.json with axe-core or in-skill rules
```

### Pattern 4 — Auth state reuse

```bash
# Once: log in and save state
vibium go https://app.example.com/login
vibium fill "input[name=email]" "$USERNAME"
vibium fill "input[name=password]" "$PASSWORD"
vibium click "button[type=submit]"
vibium wait url "/dashboard"
vibium storage -o .aqe/auth/myapp.json

# Every subsequent run
vibium storage restore .aqe/auth/myapp.json
vibium go https://app.example.com/dashboard
```

### Pattern 5 — Pentest exploit validation

```bash
vibium go "$TARGET"
node scripts/check-injection.js --include-hidden > injection-report.json
vibium record start --name "exploit-$(date +%s)"
# Perform exploit steps via vibium commands
vibium record stop -o evidence.zip
```

### Pattern 6 — Semantic cookie banner dismissal

```bash
vibium go "$URL"
# Heuristic scoring — no LLM needed
ACCEPT=$(node scripts/intent-score.js --intent accept_cookies --json | jq -r '.candidates[0].selector // empty')
[ -n "$ACCEPT" ] && vibium click "$ACCEPT"
```

## MCP Integration

Vibium ships its own MCP server. Use via:

```bash
claude mcp add vibium -- npx -y vibium mcp
```

When Vibium MCP tools are available (`mcp__vibium__*`), prefer them over shell-out for the core navigate/map/click/fill operations. Continue to use this skill's `scripts/` for the QE-specific primitives (assertions, batch, visual-diff, injection, intents) — they are not part of Vibium.

## Fallback Policy

If `vibium` is not installed (e.g., `aqe init` hasn't run or user opted out), skills that depend on qe-browser must:

1. Print a clear error naming `vibium` and pointing to `aqe init` or `npm install -g vibium`.
2. Not silently fall back to Playwright or puppeteer-extra.
3. Return `status: "skipped"` with reason `"browser-engine-unavailable"` in their output JSON.

## Migration from Playwright

If you have an existing Playwright test:

```javascript
// Playwright
await page.goto('https://example.com');
await page.fill('input[name=email]', 'user@test.com');
await page.click('button[type=submit]');
await expect(page).toHaveURL(/dashboard/);
```

Becomes:

```bash
# qe-browser
vibium go https://example.com
vibium fill "input[name=email]" "user@test.com"
vibium click "button[type=submit]"
vibium wait url "/dashboard"
node .claude/skills/qe-browser/scripts/assert.js --checks '[
  {"kind": "url_contains", "text": "/dashboard"}
]'
```

Full migration guide: [references/migration-from-playwright.md](references/migration-from-playwright.md).

## Output Contract

All scripts emit a structured JSON envelope:

```json
{
  "skillName": "qe-browser",
  "version": "1.0.0",
  "timestamp": "2026-04-08T12:00:00Z",
  "status": "success",
  "trustTier": 3,
  "output": {
    "operation": "assert",
    "summary": "All 6 assertions passed",
    "results": [...]
  }
}
```

Validate with `scripts/validate-config.json` + `schemas/output.json`.

## Attribution

- Prompt-injection scanner and intent-scoring logic ported from [gsd-browser](https://github.com/gsd-build/gsd-browser) (MIT/Apache-2.0).
- Engine: [Vibium](https://github.com/VibiumDev/vibium) (Apache-2.0).
