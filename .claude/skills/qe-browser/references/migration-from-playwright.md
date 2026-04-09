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

## Gotchas you'll hit during migration (verified 2026-04-09 against Vibium v26.3.18)

These are the things that bit me when I ran the qe-browser smoke test against a real Vibium install for the first time. Save yourself some time:

### 1. Vibium defaults to "visible browser" — fails in headless containers

Running `vibium go https://example.com` on a CI container or codespace without `--headless` produces:
```
ERROR:ui/ozone/platform/x11/ozone_platform_x11.cc:256] Missing X server or $DISPLAY
The platform failed to initialize.  Exiting.
```

The qe-browser helper scripts (`assert.js`, `batch.js`, `visual-diff.js`, `check-injection.js`, `intent-score.js`) automatically inject `--headless` for you. If you call `vibium` directly, pass it yourself:
```bash
vibium --headless go https://example.com
```

Opt out for interactive debugging via `QE_BROWSER_HEADED=1`.

### 2. `vibium screenshot -o <abs/path>` ignores the directory

`vibium screenshot -o /tmp/foo.png` saves to `~/Pictures/Vibium/foo.png`, NOT `/tmp/foo.png`. Only the basename is honored. The qe-browser `visual-diff.js` works around this — if you write your own script that calls `vibium screenshot`, expect to read from `~/Pictures/Vibium/<basename>` and copy to wherever you actually want the file.

### 3. `vibium screenshot --selector` flag does NOT exist in v26.3.x

Scoped-region screenshots are not supported. The qe-browser `visual-diff.js` throws a clear error if you pass `--selector`. To capture a region, take a full-page screenshot and crop it externally with ImageMagick:
```bash
convert /tmp/full.png -crop 400x300+100+200 /tmp/region.png
```

### 4. `vibium eval --stdin --json` returns the LAST EXPRESSION value, not console.log output

Vibium's eval contract:
- Input: a JS expression
- Output (with `--json`): `{"ok":true,"result":"<stringified value>"}`

The `result` field is a STRING when the expression returned a string, or a Go-side serialization of the BiDi RemoteValue map type when it returned an object directly. Always wrap your return value in `JSON.stringify(...)` and parse the `result` string back into an object on the Node side. The qe-browser `lib/vibium.js` `unwrapEvalResult()` does this for you.

### 5. Linux ARM64 — Vibium has no Chrome to download

Google Chrome for Testing does not publish a `linux-arm64` build. Vibium's `vibium install` falls back to `chrome-linux64` (x86_64), which fails under Rosetta on Apple Silicon Linux containers with `failed to open elf at /lib64/ld-linux-x86-64.so.2`.

Workaround (verified on Debian bookworm aarch64):
```bash
sudo apt-get update
sudo apt-get install -y chromium chromium-driver
for dir in ~/.cache/vibium/chrome-for-testing/*/; do
  if [ -e "$dir/chromedriver" ]; then
    rm -f "$dir/chromedriver" "$dir/chrome"
    ln -s /usr/bin/chromedriver "$dir/chromedriver"
    ln -s /usr/bin/chromium     "$dir/chrome"
  fi
  if [ -e "$dir/chromedriver-linux64/chromedriver" ]; then
    rm -f "$dir/chromedriver-linux64/chromedriver" "$dir/chrome-linux64/chrome"
    ln -s /usr/bin/chromedriver "$dir/chromedriver-linux64/chromedriver"
    ln -s /usr/bin/chromium     "$dir/chrome-linux64/chrome"
  fi
done
vibium --headless go https://httpbin.org/html  # should succeed
```

When Vibium adds a `--browser-path` flag or Google ships `linux-arm64` Chrome for Testing, this workaround becomes obsolete.

### 6. Visual-diff baselines need an explicit viewport for determinism

`vibium` headless picks a varying window size between runs (765×672 vs 780×654 observed on httpbin.org/html). Pixel-diff against a baseline will fail spuriously unless you set the viewport explicitly first:
```bash
vibium --headless viewport 1280 720
vibium --headless go https://example.com
node .claude/skills/qe-browser/scripts/visual-diff.js --name homepage
```

The qe-browser `smoke-test.sh` does this for tc006/tc007. Build the same pattern into your own baseline workflows.

### 7. `npm install -g vibium` can take 1–3 minutes on a cold cache

Vibium downloads Chrome for Testing on first install. The synchronous spawn in `aqe init` phase 09 logs a "this can take 1–3 minutes" pre-spawn banner, but if you call `npm install -g vibium` directly you'll see no output for the duration. Don't Ctrl-C.

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
