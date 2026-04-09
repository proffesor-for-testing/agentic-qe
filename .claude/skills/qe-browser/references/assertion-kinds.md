# qe-browser: Assertion Kinds Reference

Full reference for the 16 typed check kinds accepted by `scripts/assert.js --checks`.

All checks return `{ passed: boolean, actual, expected, message? }` and the overall runner returns a JSON envelope with `passed`, `failed`, and `results` arrays.

## Page state checks

### `url_contains`
```json
{ "kind": "url_contains", "text": "/dashboard" }
```
Passes if `location.href` contains the given substring.

### `url_equals`
```json
{ "kind": "url_equals", "url": "https://app.example.com/login" }
```
Passes if `location.href` exactly equals the given URL.

### `title_matches`
```json
{ "kind": "title_matches", "pattern": "^Dashboard — .*" }
```
Passes if `document.title` matches the given regex. `pattern` is a JS-style regex string.

### `page_source_contains`
```json
{ "kind": "page_source_contains", "text": "data-testid=\"hero\"" }
```
Passes if `document.documentElement.outerHTML` contains the given substring. Use sparingly — slow on large pages.

## Content checks

### `text_visible`
```json
{ "kind": "text_visible", "text": "Welcome, Jane" }
```
Passes if `document.body.innerText` contains the given substring.

### `text_hidden`
```json
{ "kind": "text_hidden", "text": "Loading…" }
```
Passes if `document.body.innerText` does NOT contain the given substring. Use after a spinner should have gone away.

## Element checks

### `selector_visible`
```json
{ "kind": "selector_visible", "selector": "#user-menu" }
```
Passes if `document.querySelector(selector)` exists AND has non-zero dimensions AND `display` is not `none` AND `visibility` is not `hidden` AND `opacity > 0`.

### `selector_hidden`
```json
{ "kind": "selector_hidden", "selector": ".error-banner" }
```
Passes if the selector either doesn't exist OR is invisible.

### `value_equals`
```json
{ "kind": "value_equals", "selector": "input[name=email]", "value": "user@test.com" }
```
Passes if `element.value === value`. For `<input>`, `<textarea>`, `<select>`.

### `attribute_equals`
```json
{ "kind": "attribute_equals", "selector": "#toggle", "attribute": "aria-pressed", "value": "true" }
```
Passes if `element.getAttribute(attribute) === value`.

### `element_count`
```json
{ "kind": "element_count", "selector": ".result", "op": ">=", "count": 5 }
```
Passes if `document.querySelectorAll(selector).length` satisfies `op count`. Operators: `==`, `>=`, `<=`, `>`, `<`.

## Console checks

### `no_console_errors`
```json
{ "kind": "no_console_errors" }
```
Passes if the captured console log has zero entries with level `error` or `severe`. Console buffer may reset on navigation — run this check BEFORE navigating away from the page you care about.

### `console_message_matches`
```json
{ "kind": "console_message_matches", "pattern": "ready: \\d+" }
```
Passes if any console entry's message matches the given regex.

## Network checks

### `no_failed_requests`
```json
{ "kind": "no_failed_requests" }
```
Passes if no captured network entry has `status >= 400` or `failed === true`. Same caveat as `no_console_errors` — network buffer may reset on navigation.

### `response_status`
```json
{ "kind": "response_status", "url": "/api/user", "status": 200 }
```
Passes if a captured network entry whose URL contains the given substring has exactly the given status code.

### `request_url_seen`
```json
{ "kind": "request_url_seen", "url": "/analytics.js" }
```
Passes if any captured network entry's URL contains the given substring. Use to verify that a specific request was made.

## Combining checks

Pass multiple checks in one call — the runner evaluates them in order and reports `passed`/`failed` counts:

```bash
node .claude/skills/qe-browser/scripts/assert.js --checks '[
  {"kind": "url_contains", "text": "/dashboard"},
  {"kind": "selector_visible", "selector": "#user-menu"},
  {"kind": "no_console_errors"},
  {"kind": "no_failed_requests"},
  {"kind": "element_count", "selector": ".notification", "op": "==", "count": 0}
]'
```

## Notes and limitations

- **Console/network buffers are session-scoped in Vibium.** If they're empty, the check passes by default with a `note` field in the result. This is conservative. If you need hard guarantees, use `vibium console --json` and `vibium network --json` yourself before calling `assert`.
- **Regex patterns are JS-style** (not POSIX). Escape backslashes in JSON: `\\d+`, `\\s+`.
- **All selectors go through `document.querySelector` / `querySelectorAll`.** No XPath (use Vibium's native `vibium find xpath` for that).
- **Checks run in the page context** via `vibium eval --stdin`. They cannot see cross-origin iframe content unless you switch frames first via `vibium select-frame`.
