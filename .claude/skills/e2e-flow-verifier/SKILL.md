---
name: e2e-flow-verifier
description: "Verify complete user flows end-to-end with Playwright browser automation, video recording, trace capture, and per-step state assertions. Use when verifying sign-up, purchase, or profile flows with real browser evidence."
---

# E2E Flow Verifier

Product verification skill that drives user flows with Playwright, asserts state at each step, and records video evidence.

## Activation

```
/e2e-flow-verifier [flow-name]
```

## Flow Verification Pattern

```typescript
import { test, expect } from '@playwright/test';

test.describe('{{Flow Name}}', () => {
  // Record video for evidence
  test.use({
    video: 'on',
    screenshot: 'on',
    trace: 'on',
  });

  test('complete user journey', async ({ page }) => {
    // Step 1: Navigate
    await page.goto('{{base_url}}');
    await expect(page).toHaveTitle(/{{expected_title}}/);

    // Step 2: Authenticate (if needed)
    await page.fill('[data-testid="email"]', '{{test_user}}');
    await page.fill('[data-testid="password"]', '{{test_password}}');
    await page.click('[data-testid="login-btn"]');
    await expect(page.locator('[data-testid="dashboard"]')).toBeVisible();

    // Step 3: Perform action
    await page.click('[data-testid="{{action_element}}"]');
    await expect(page.locator('[data-testid="{{result_element}}"]')).toContainText('{{expected_text}}');

    // Step 4: Verify state change
    // Assert both UI state AND backend state
    const apiResponse = await page.request.get('/api/{{resource}}');
    expect(apiResponse.status()).toBe(200);
    const data = await apiResponse.json();
    expect(data.{{field}}).toBe('{{expected_value}}');
  });
});
```

## Evidence Collection

After each flow verification:
1. **Video** — `test-results/{{flow-name}}/video.webm`
2. **Screenshots** — at each assertion point
3. **Trace** — `test-results/{{flow-name}}/trace.zip` (open with `npx playwright show-trace`)
4. **Network log** — HAR file with all API calls

## Common Flows to Verify

| Flow | Steps | Critical Assertions |
|------|-------|-------------------|
| Sign-up | Register → Verify email → Login | Account created, session valid |
| Purchase | Browse → Add to cart → Checkout → Pay | Order created, payment processed |
| Profile | Login → Edit profile → Save | Changes persisted, shown on reload |
| Search | Enter query → Filter → Select result | Results relevant, filters work |

## Gotchas

- Agent writes Playwright tests but doesn't run them — always execute and check video evidence
- Selectors break on deployment — use `data-testid` attributes, never CSS classes
- Tests pass locally but fail in CI — headless browser behavior differs, use `--headed` for debugging
- Auth tokens in E2E tests expire — use fresh login per test, not shared tokens
- Video evidence is large — clean up after verification, keep only failure videos
