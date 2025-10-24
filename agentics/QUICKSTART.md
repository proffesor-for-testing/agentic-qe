# Quick Start Guide - Agentics.org E2E Tests

Get up and running with the E2E test suite in 5 minutes!

## Prerequisites

- Node.js 18+ installed
- npm or yarn

## Installation (First Time Only)

```bash
# Navigate to the test directory
cd agentics

# Install dependencies
npm install

# Install Playwright browsers
npx playwright install
```

## Run Your First Test

```bash
# Run all tests (headless)
npm test

# Run with visible browser (recommended for first time)
npm run test:headed
```

## View Test Results

After running tests:

```bash
# Open HTML report
npm run test:report
```

## Common Commands

```bash
# Run in interactive UI mode (best for development)
npm run test:ui

# Run only Chrome tests
npm run test:chromium

# Run only Firefox tests
npm run test:firefox

# Run mobile tests
npm run test:mobile

# Debug a specific test
npx playwright test tests/homepage.spec.ts --debug
```

## Understanding the Output

### Successful Test Run
```
✓ tests/homepage.spec.ts:26:3 › TC-001: Homepage should load
✓ tests/homepage.spec.ts:52:3 › TC-002: SEO and Metadata
...
14 passed (12.5s)
```

### Failed Test
```
✗ tests/homepage.spec.ts:26:3 › TC-001: Homepage should load
  Error: expect(received).toBe(expected)
  Screenshot: test-results/.../screenshot.png
```

## File Structure Quick Reference

```
agentics/
├── tests/           # Your test files
│   ├── homepage.spec.ts        # Main functional tests
│   ├── responsive.spec.ts      # Mobile/tablet tests
│   ├── accessibility.spec.ts   # WCAG compliance
│   └── performance.spec.ts     # Speed and Web Vitals
├── pages/           # Page Object Models
│   └── HomePage.ts             # Homepage interactions
└── playwright.config.ts        # Test configuration
```

## What Gets Tested?

✅ **Functional** (14 tests)
- Navigation, hero section, community stats, CTAs

✅ **Responsive** (5 tests)
- Mobile, tablet, desktop layouts

✅ **Accessibility** (10 tests)
- WCAG 2.1 AA compliance, keyboard nav

✅ **Performance** (7 tests)
- Page speed, Core Web Vitals

**Total: 36 automated tests**

## Writing Your First Test

```typescript
import { test, expect } from '@playwright/test';
import { HomePage } from '../pages/HomePage';

test('my first test', async ({ page }) => {
  const homePage = new HomePage(page);
  await homePage.goto();

  // Verify something
  await expect(homePage.logo).toBeVisible();
});
```

## Debugging Tips

1. **Use headed mode**: `npm run test:headed`
2. **Use UI mode**: `npm run test:ui` (interactive)
3. **Debug single test**: `npx playwright test tests/homepage.spec.ts --debug`
4. **View trace**: Look in `test-results/` folder after failed test
5. **Check screenshot**: Failed tests save screenshots automatically

## Next Steps

1. ✅ Read `README.md` for full documentation
2. ✅ Check `E2E-TEST-PLAN.md` for test strategy
3. ✅ Review `DELIVERABLES.md` for what's included
4. ✅ Explore test files in `tests/` folder
5. ✅ Modify tests as website changes

## Need Help?

- **Playwright Docs**: https://playwright.dev/
- **Test Plan**: See `E2E-TEST-PLAN.md`
- **Full Guide**: See `README.md`

## CI/CD Integration

Add to `.github/workflows/e2e.yml`:

```yaml
name: E2E Tests
on: [push, pull_request]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
      - run: cd agentics && npm ci
      - run: cd agentics && npx playwright install --with-deps
      - run: cd agentics && npm test
```

---

That's it! You're ready to run E2E tests for Agentics.org 🚀
