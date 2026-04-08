# Migrating from Playwright to qe-browser

Short recipe for porting existing Playwright tests (or Playwright-style snippets in QE skills) to the qe-browser + Vibium pipeline.

## TL;DR table

| Playwright | qe-browser / Vibium |
|---|---|
| `await page.goto(url)` | `vibium go <url>` |
| `await page.click(sel)` | `vibium click "<sel>"` |
| `await page.click(ref)` (from `page.locator`) | `vibium click @e1` (from `vibium map`) |
| `await page.fill(sel, text)` | `vibium fill "<sel>" "<text>"` |
| `await page.type(sel, text)` | `vibium type "<sel>" "<text>"` |
| `await page.press(key)` | `vibium press <key>` |
| `await page.hover(sel)` | `vibium hover "<sel>"` |
| `await page.getByRole('button', { name: 'X' })` | `vibium find role button --name "X"` |
| `await page.getByLabel('Email')` | `vibium find label "Email"` |
| `await page.getByPlaceholder('Search')` | `vibium find placeholder "Search"` |
| `await page.getByTestId('submit')` | `vibium find testid "submit"` |
| `await page.getByText('Sign In')` | `vibium find text "Sign In"` |
| `await page.waitForURL(pattern)` | `vibium wait url "<pattern>"` |
| `await page.waitForSelector(sel)` | `vibium wait "<sel>"` |
| `await page.waitForLoadState('networkidle')` | `vibium wait load` |
| `await page.screenshot({ path })` | `vibium screenshot -o <path>` |
| `await page.pdf({ path })` | `vibium pdf -o <path>` |
| `await expect(page).toHaveURL(/dashboard/)` | `assert.js`: `{"kind": "url_contains", "text": "dashboard"}` |
| `await expect(page.locator(sel)).toBeVisible()` | `assert.js`: `{"kind": "selector_visible", "selector": "<sel>"}` |
| `await expect(page.locator(sel)).toHaveText(txt)` | `assert.js`: `{"kind": "text_visible", "text": "<txt>"}` |
| `await expect(page.locator(sel)).toHaveValue(v)` | `assert.js`: `{"kind": "value_equals", "selector": "<sel>", "value": "<v>"}` |
| `await page.evaluate(fn)` | `vibium eval 'expr'` or `vibium eval --stdin <<'EOF' ... EOF` |
| `await context.storageState({ path })` | `vibium storage -o <path>` |
| `await context.addCookies(...)` + manual state | `vibium storage restore <path>` |
| `await page.setViewportSize(...)` | `vibium viewport <w> <h>` |
| Playwright `test.use({ video: 'on' })` | `vibium record start --screenshots` then `vibium record stop -o evidence.zip` |
| `await page.route(url, handler)` | Vibium does NOT currently ship network mocking — use a HTTP proxy or stub server |

## Worked example: login flow

### Before — Playwright

```typescript
import { test, expect } from '@playwright/test';

test('login flow', async ({ page }) => {
  await page.goto('https://app.example.com/login');
  await page.getByLabel('Email').fill('user@test.com');
  await page.getByLabel('Password').fill('secret');
  await page.getByRole('button', { name: 'Sign In' }).click();
  await expect(page).toHaveURL(/\/dashboard/);
  await expect(page.getByTestId('user-menu')).toBeVisible();
});
```

### After — qe-browser + Vibium

```bash
#!/bin/bash
set -euo pipefail
SKILL_DIR=.claude/skills/qe-browser

vibium go https://app.example.com/login
EMAIL_REF=$(vibium find label "Email" --json | jq -r '.ref')
PASS_REF=$(vibium find label "Password" --json | jq -r '.ref')
SIGNIN_REF=$(vibium find role button --name "Sign In" --json | jq -r '.ref')

vibium fill "$EMAIL_REF" "user@test.com"
vibium fill "$PASS_REF" "secret"
vibium click "$SIGNIN_REF"
vibium wait url "/dashboard"

node "$SKILL_DIR/scripts/assert.js" --checks '[
  {"kind": "url_contains", "text": "/dashboard"},
  {"kind": "selector_visible", "selector": "[data-testid=user-menu]"},
  {"kind": "no_console_errors"},
  {"kind": "no_failed_requests"}
]'
```

### Or as a single batch call

```bash
node "$SKILL_DIR/scripts/batch.js" --steps '[
  {"action": "go", "url": "https://app.example.com/login"},
  {"action": "fill", "selector": "input[name=email]", "text": "user@test.com"},
  {"action": "fill", "selector": "input[name=password]", "text": "secret"},
  {"action": "click", "selector": "button[type=submit]"},
  {"action": "wait_url", "pattern": "/dashboard"},
  {"action": "assert", "checks": [
    {"kind": "url_contains", "text": "/dashboard"},
    {"kind": "selector_visible", "selector": "[data-testid=user-menu]"}
  ]}
]'
```

## Things Vibium does BETTER than Playwright

- **Semantic find as first-class CLI verbs**: `vibium find label|placeholder|testid|role|text|alt|title|xpath`. No need to chain locator builders.
- **`vibium diff map`** gives you a differential of what changed since the last `map` call — no equivalent in Playwright.
- **`vibium record`** produces a ZIP of screenshots + DOM snapshots — lighter than Playwright's `.trace.zip`.
- **`vibium a11y-tree`** returns the accessibility tree without visual rendering — faster than axe-core for structure-only checks.

## Things Playwright still does better

- **Network mocking / interception** (`page.route`). Vibium has no equivalent today — use a real HTTP stub server.
- **Tracing with waterfall UI**. Vibium's record ZIP is enough for evidence but not a replacement for Playwright Trace Viewer.
- **Multi-browser parity out of the box**. Vibium targets Chrome/Chromium via WebDriver BiDi; Firefox/Safari BiDi support is landing but not yet at parity with Playwright's built-in cross-browser test matrix.

## When to keep Playwright

If a QE skill needs any of these, keep using Playwright for that specific skill:

1. Deep network interception / request modification
2. Cross-browser contract testing across all three major engines today
3. Codegen from interactive recording (Playwright `npx playwright codegen`)
4. Rich trace viewer with network/DOM/action timeline (though `vibium record` ZIPs + our `assert.js` results cover the essentials)

For everything else — navigate, map, interact, assert, screenshot, capture, record, scan for injections — use qe-browser.
