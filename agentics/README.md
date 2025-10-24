# E2E Tests for Agentics.org

Comprehensive End-to-End test suite for the Agentics Foundation website (https://agentics.org/) using Playwright and TypeScript.

## Test Coverage

### Functional Tests (`tests/homepage.spec.ts`)
- ✅ Homepage load and core elements (TC-001)
- ✅ SEO and metadata validation (TC-002)
- ✅ Navigation menu with 7 items (TC-003)
- ✅ Hero section with community stats (TC-004)
- ✅ Four explore cards (About, Impact, Community, Projects) (TC-005)
- ✅ Community statistics (130K+ Reddit, 52K+ LinkedIn, 3K+ Discord) (TC-006)
- ✅ Seven paths of impact (TC-007)
- ✅ "What is Agentic AI" section with coding approaches (TC-008)
- ✅ External community platform link (TC-009)
- ✅ Console button (TC-010)
- ✅ Heading hierarchy (TC-011)
- ✅ HTTPS enforcement (TC-012)
- ✅ Footer content and contact button (TC-013, TC-014)

### Responsive Design Tests (`tests/responsive.spec.ts`)
- ✅ Mobile responsiveness - iPhone 12 (390x844) (TC-005)
- ✅ Tablet responsiveness - iPad Pro (1024x1366) (TC-006)
- ✅ Desktop at 1366x768
- ✅ Desktop at 1920x1080
- ✅ Landscape orientation on mobile

### Accessibility Tests (`tests/accessibility.spec.ts`)
- ✅ WCAG 2.1 AA compliance (TC-007)
- ✅ Keyboard navigation (TC-008)
- ✅ Alt text for all images
- ✅ Proper heading hierarchy
- ✅ Meaningful link text
- ✅ Landmark roles (main, nav, footer)
- ✅ Focus indicators
- ✅ Color contrast compliance
- ✅ Form label associations

### Performance Tests (`tests/performance.spec.ts`)
- ✅ Page load time < 5s (TC-009)
- ✅ Resource optimization (TC-010)
- ✅ Core Web Vitals (LCP, CLS)
- ✅ Image optimization
- ✅ Render-blocking resources check
- ✅ Slow 3G simulation
- ✅ Console error monitoring

## Tech Stack

- **Playwright** v1.5 6.1 - Cross-browser E2E testing
- **TypeScript** - Type-safe test code
- **@axe-core/playwright** - Accessibility testing
- **Page Object Model** - Clean, maintainable test architecture

## Installation

```bash
# Install dependencies
npm install

# Install Playwright browsers
npx playwright install
```

## Running Tests

```bash
# Run all tests
npm test

# Run tests in headed mode (see browser)
npm run test:headed

# Run tests in UI mode (interactive)
npm run test:ui

# Run specific test file
npx playwright test tests/homepage.spec.ts

# Run tests on specific browser
npx playwright test --project=chromium
npx playwright test --project=firefox
npx playwright test --project=webkit

# Run tests on mobile
npx playwright test --project="Mobile Chrome"
npx playwright test --project="Mobile Safari"
```

## Test Reports

```bash
# Generate and view HTML report
npm run test:report

# View last HTML report
npx playwright show-report
```

## Project Structure

```
agentics/
├── tests/
│   ├── homepage.spec.ts          # Main functional tests
│   ├── responsive.spec.ts        # Responsive design tests
│   ├── accessibility.spec.ts     # WCAG 2.1 AA compliance tests
│   └── performance.spec.ts       # Performance and Web Vitals tests
├── pages/
│   └── HomePage.ts                # Page Object Model for homepage
├── playwright.config.ts           # Playwright configuration
├── package.json                   # Dependencies and scripts
├── E2E-TEST-PLAN.md              # Comprehensive test plan document
├── crawl-site.ts                  # Site crawler utility
└── README.md                      # This file
```

## Page Object Model

The `HomePage` class (`pages/HomePage.ts`) encapsulates all interactions with the homepage:

```typescript
import { HomePage } from '../pages/HomePage';

test('example', async ({ page }) => {
  const homePage = new HomePage(page);
  await homePage.goto();

  // Use clean API methods
  await expect(homePage.heroHeading).toBeVisible();
  await homePage.clickNav('About');
  const stats = await homePage.getCommunityStats();
});
```

## Browser Coverage

The test suite runs on:

- ✅ Chrome (Desktop)
- ✅ Firefox (Desktop)
- ✅ Safari/WebKit (Desktop)
- ✅ Edge (Desktop)
- ✅ Chrome Mobile (Pixel 5)
- ✅ Safari Mobile (iPhone 12)
- ✅ iPad Pro

## CI/CD Integration

The tests are configured for CI/CD environments:

- Runs in headless mode on CI
- Captures screenshots on failure
- Records video on failure
- Generates JUnit XML reports
- Creates HTML test reports

### GitHub Actions Example

```yaml
name: E2E Tests
on: [push, pull_request]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
      - run: npm ci
      - run: npx playwright install --with-deps
      - run: npm test
      - uses: actions/upload-artifact@v3
        if: always()
        with:
          name: playwright-report
          path: playwright-report/
```

## Test Data

- No test data required (informational website)
- Uses real production URLs
- No authentication or user data

## Debugging

```bash
# Debug specific test
npx playwright test tests/homepage.spec.ts --debug

# Run with trace
npx playwright test --trace on

# View trace
npx playwright show-trace trace.zip
```

## Best Practices Implemented

1. **Page Object Model** - Encapsulated page interactions
2. **Parallel Execution** - Tests run concurrently for speed
3. **Auto-waiting** - Playwright waits for elements automatically
4. **Screenshot on Failure** - Visual debugging
5. **Video Recording** - Replay failed tests
6. **Cross-browser** - Validated on all major browsers
7. **Responsive** - Tested on mobile, tablet, desktop
8. **Accessible** - WCAG 2.1 AA compliance
9. **Performant** - Core Web Vitals monitoring

## Accessibility Testing

Uses @axe-core/playwright for automated accessibility scanning:

```typescript
import AxeBuilder from '@axe-core/playwright';

const results = await new AxeBuilder({ page })
  .withTags(['wcag2a', 'wcag2aa'])
  .analyze();

expect(results.violations).toEqual([]);
```

## Performance Metrics

Monitors Core Web Vitals:

- **LCP** (Largest Contentful Paint): < 2.5s
- **FID** (First Input Delay): < 100ms
- **CLS** (Cumulative Layout Shift): < 0.1

## Maintenance

- Review tests quarterly
- Update selectors as UI changes
- Add new tests for new features
- Keep dependencies updated

## Contributing

1. Follow existing test patterns
2. Use Page Object Model
3. Write descriptive test names
4. Add comments for complex logic
5. Ensure tests are idempotent

## Documentation

- **Test Plan**: See `E2E-TEST-PLAN.md` for comprehensive test strategy
- **Playwright Docs**: https://playwright.dev/
- **WCAG Guidelines**: https://www.w3.org/WAI/WCAG21/quickref/

## Support

For issues or questions:
- Check Playwright documentation
- Review test plan document
- Open GitHub issue

---

**Test Suite Version**: 1.0.0
**Last Updated**: 2025-10-24
**Website Under Test**: https://agentics.org/
**Status**: ✅ Active
