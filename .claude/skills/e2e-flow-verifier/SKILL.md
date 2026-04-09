---
name: e2e-flow-verifier
description: "Use when verifying complete user flows end-to-end with the qe-browser skill (Vibium), recording session evidence, and asserting state at each step. For product verification with real browser automation."
user-invocable: true
---

# E2E Flow Verifier

Product verification skill that drives user flows with the **qe-browser** fleet skill (Vibium engine), asserts state at each step, and records evidence as a ZIP of screenshots + DOM snapshots.

## Activation

```
/e2e-flow-verifier [flow-name]
```

## Dependency

This skill uses `.claude/skills/qe-browser/` for all browser automation. The `vibium` binary is installed automatically by `aqe init`. See `qe-browser/SKILL.md` for the full command reference.

## Flow Verification Pattern (qe-browser + batch + assert)

Define the flow as a JSON batch plan and drive it with the qe-browser batch runner:

```bash
# flows/{{flow-name}}.json
cat > /tmp/{{flow-name}}.json <<'EOF'
[
  {"action": "go",      "url": "{{base_url}}"},
  {"action": "wait_load"},
  {"action": "fill",    "selector": "[data-testid=email]",    "text": "{{test_user}}"},
  {"action": "fill",    "selector": "[data-testid=password]", "text": "{{test_password}}"},
  {"action": "click",   "selector": "[data-testid=login-btn]"},
  {"action": "wait_url","pattern": "/dashboard"},
  {"action": "assert",  "checks": [
    {"kind": "url_contains",    "text": "/dashboard"},
    {"kind": "selector_visible","selector": "[data-testid=dashboard]"},
    {"kind": "no_console_errors"},
    {"kind": "no_failed_requests"}
  ]},
  {"action": "click",   "selector": "[data-testid={{action_element}}]"},
  {"action": "assert",  "checks": [
    {"kind": "text_visible", "text": "{{expected_text}}"}
  ]}
]
EOF

# Record evidence AND drive the flow
vibium record start --screenshots --snapshots --name "{{flow-name}}"
node .claude/skills/qe-browser/scripts/batch.js --steps "@/tmp/{{flow-name}}.json"
FLOW_EXIT=$?
vibium record stop -o "test-results/{{flow-name}}/evidence.zip"
exit $FLOW_EXIT
```

The batch runner exits non-zero if any step fails, so CI gates work with a plain `$?` check.

## Evidence Collection

After each flow verification, `vibium record` produces a ZIP containing:

1. **Screenshots** — one per action + annotated failure shots
2. **DOM snapshots** — before/after each interaction
3. **Timeline** — ordered event log with URLs and timings
4. **Console/network logs** — captured inline

Use `vibium har-export` for a separate HAR 1.2 network log if needed.

## Asserting backend state alongside UI

The qe-browser `assert.js` check kinds include network assertions that capture backend calls made from the page:

```bash
node .claude/skills/qe-browser/scripts/assert.js --checks '[
  {"kind": "response_status", "url": "/api/{{resource}}", "status": 200},
  {"kind": "request_url_seen", "url": "/api/{{resource}}"}
]'
```

For API calls that don't originate from the page, run the API check in a separate step (`curl` + `jq`, or a dedicated API test skill).

## Common Flows to Verify

| Flow | Steps | Critical Assertions |
|------|-------|-------------------|
| Sign-up | Register → Verify email → Login | `url_contains /dashboard`, `no_failed_requests` |
| Purchase | Browse → Add to cart → Checkout → Pay | `response_status /api/orders 201`, `text_visible "Thank you"` |
| Profile | Login → Edit profile → Save | `value_equals` on the reloaded form, `no_console_errors` |
| Search | Enter query → Filter → Select result | `element_count .result >= 1`, `text_visible <query>` |

## Reusing auth state across runs

```bash
# Once: log in and save state
vibium go "{{base_url}}/login"
vibium fill "[data-testid=email]" "$USERNAME"
vibium fill "[data-testid=password]" "$PASSWORD"
vibium click "[data-testid=login-btn]"
vibium wait url "/dashboard"
vibium storage -o test-results/auth/state.json

# Every subsequent run
vibium storage restore test-results/auth/state.json
vibium go "{{base_url}}/dashboard"
```

## Gotchas

- **Re-map after DOM changes** — Vibium `@e1` refs are invalidated by navigation; use `vibium diff map` to see what changed and re-map if needed.
- **Selectors break on deployment** — prefer `data-testid` over CSS classes.
- **Auth tokens expire** — use fresh login per run, or rotate `storage` snapshots.
- **Evidence ZIPs grow** — keep failure runs only in CI, gc after N days.
- **No raw Playwright** — this skill used to use `@playwright/test`. If you need Playwright's network interception (`page.route`), use it in a separate skill and call it as a step; don't reintroduce the dependency here.
