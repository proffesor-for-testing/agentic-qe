# Agile Testing Days 2025 - End-to-End Test Suite

**Comprehensive Playwright E2E Tests for https://agiletestingdays.com/**

## 📋 Overview

This test suite provides comprehensive end-to-end testing coverage for the Agile Testing Days 2025 conference website, implementing 67 BDD scenarios from the test plan covering:

- **Navigation Structure** (8 scenarios)
- **Registration & Ticketing** (12 scenarios)
- **Payment Processing** (8 scenarios)
- **Newsletter Signup** (6 scenarios)
- **Login Functionality** (8 scenarios)
- **FAQ Section** (5 scenarios)
- **Call for Papers** (7 scenarios)
- **Speaker Profiles** (4 scenarios)
- **External Links** (6 scenarios)

## 🎯 Test Coverage

### Priority Breakdown
- **P0 (Critical)**: 25+ tests covering registration, payment, navigation, login
- **P1 (High)**: 15+ tests covering newsletter, CFP, key user flows
- **P2 (Medium)**: 10+ tests covering FAQ, speakers, external links

### Test Files
```
tests/
├── navigation.spec.ts          ✅ 13 tests (P0/P1)
├── registration.spec.ts        ✅ 11 tests (P0/P1)
├── payment.spec.ts             ✅ 13 tests (P0)
├── newsletter.spec.ts          ✅ 7 tests (P1)
├── login.spec.ts               ✅ 11 tests (P0/P1)
├── faq.spec.ts                 ✅ 6 tests (P2)
├── call-for-papers.spec.ts     ✅ 7 tests (P1)
├── speakers.spec.ts            ✅ 6 tests (P2)
└── external-links.spec.ts      ✅ 4 tests (P2)
```

**Total: 78 test cases** (covering all 67 BDD scenarios from test plan)

## 🚀 Quick Start

### Prerequisites

- **Node.js**: v18.x or higher
- **npm**: v9.x or higher

### Installation

```bash
# Navigate to the test directory
cd atd

# Install dependencies
npm install

# Install Playwright browsers
npx playwright install chromium
```

### Running Tests

#### Run all tests
```bash
npm test
```

#### Run tests in headed mode (see browser)
```bash
npm run test:headed
```

#### Run tests with UI mode (interactive)
```bash
npm run test:ui
```

#### Run specific test suites
```bash
# Critical path tests only
npm run test:p0

# High priority tests
npm run test:p1

# Smoke tests
npm run test:smoke

# Specific test file
npm run test:navigation
npm run test:registration
npm run test:payment
npm run test:newsletter
npm run test:login
```

#### Debug tests
```bash
npm run test:debug
```

#### View test report
```bash
npm run report
```

## 📁 Project Structure

```
atd/
├── playwright.config.ts          # Playwright configuration
├── package.json                  # Dependencies and scripts
├── tsconfig.json                 # TypeScript configuration
├── .env.example                  # Environment variables template
│
├── tests/                        # Test specifications
│   ├── navigation.spec.ts        # Navigation and menu tests
│   ├── registration.spec.ts      # Ticket selection and registration
│   ├── payment.spec.ts           # Payment processing tests
│   ├── newsletter.spec.ts        # Newsletter subscription tests
│   ├── login.spec.ts             # Authentication tests
│   ├── faq.spec.ts               # FAQ functionality tests
│   ├── call-for-papers.spec.ts   # CFP submission tests
│   ├── speakers.spec.ts          # Speaker profile tests
│   └── external-links.spec.ts    # External integration tests
│
├── page-objects/                 # Page Object Model
│   ├── BasePage.ts               # Base page with common methods
│   ├── HomePage.ts               # Homepage interactions
│   ├── RegistrationPage.ts       # Registration flow
│   ├── PaymentPage.ts            # Payment processing
│   ├── LoginPage.ts              # Authentication
│   └── index.ts                  # Exports
│
├── fixtures/                     # Test data and fixtures
│   ├── test-data.ts              # Static test data
│   └── user-factory.ts           # User data generation
│
├── utils/                        # Helper functions
│   └── test-helpers.ts           # Utility functions
│
└── test-results/                 # Generated test results
    ├── html-report/              # HTML test report
    ├── screenshots/              # Failure screenshots
    └── artifacts/                # Videos and traces
```

## 🎨 Test Tagging

Tests use tags for easy filtering:

- `@p0` - Priority 0 (Critical path)
- `@p1` - Priority 1 (High importance)
- `@p2` - Priority 2 (Medium importance)
- `@smoke` - Smoke tests (quick validation)
- `@critical` - Critical business flows

### Run tests by tag
```bash
# Run only smoke tests
npx playwright test --grep @smoke

# Run critical tests
npx playwright test --grep @critical

# Run P0 and P1 tests
npx playwright test --grep "@p0|@p1"
```

## 🔧 Configuration

### Environment Variables

Copy `.env.example` to `.env` and configure:

```bash
cp .env.example .env
```

Key variables:
```env
BASE_URL=https://agiletestingdays.com
TEST_USER_EMAIL=test.user@mailinator.com
TEST_USER_PASSWORD=TestPassword123!
TEST_EMAIL_DOMAIN=mailinator.com
HEADLESS=true
```

### Playwright Configuration

Edit `playwright.config.ts` to customize:

- **Browsers**: Currently configured for Chromium (Chrome/Edge)
- **Timeouts**: 60s per test, 30s for navigation
- **Retries**: 2 retries in CI, 0 locally
- **Workers**: 4 parallel workers in CI, 2 locally
- **Reports**: HTML, JSON, JUnit XML

## 📊 Test Reports

After running tests:

```bash
# View HTML report
npm run report

# Reports are generated in:
# - test-results/html-report/index.html (interactive HTML)
# - test-results/results.json (JSON format)
# - test-results/junit.xml (JUnit XML for CI)
```

## 🐛 Debugging

### Debug specific test
```bash
npx playwright test tests/registration.spec.ts --debug
```

### Generate test code
```bash
npm run codegen
```

### View traces on failure
Traces are automatically captured on failure. View them at:
```bash
npx playwright show-trace test-results/artifacts/trace.zip
```

## 📝 Writing Tests

### Example Test Structure

```typescript
import { test, expect } from '@playwright/test';
import { HomePage } from '../page-objects/HomePage';
import { handleCookieConsent } from '../utils/test-helpers';

test.describe('Feature Name', () => {
  test.beforeEach(async ({ page }) => {
    const homePage = new HomePage(page);
    await homePage.navigateToHomepage();
    await handleCookieConsent(page);
  });

  test('@p0 @smoke should do something', async ({ page }) => {
    // Arrange
    const homePage = new HomePage(page);

    // Act
    await homePage.clickNavigationItem('About');

    // Assert
    const url = await homePage.getCurrentUrl();
    expect(url).toContain('about');
  });
});
```

### Using Page Objects

```typescript
// Good: Use Page Object Model
const registrationPage = new RegistrationPage(page);
await registrationPage.selectConferenceOnlyTicket();
await registrationPage.fillRegistrationForm(testUser);

// Avoid: Direct page interactions in tests
// await page.click('.ticket-button'); // ❌
```

### Using Test Data

```typescript
// Generate unique test users
import { UserFactory } from '../fixtures/user-factory';
const testUser = UserFactory.generateAttendee('new');

// Use static test data
import { TICKET_PRICING, PAYMENT_TEST_CARDS } from '../fixtures/test-data';
console.log(TICKET_PRICING.conferenceOnly.discountedPrice); // 2125
```

## 🎯 CI/CD Integration

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
        with:
          node-version: '18'
      - name: Install dependencies
        run: |
          cd atd
          npm ci
      - name: Install Playwright
        run: |
          cd atd
          npx playwright install --with-deps chromium
      - name: Run tests
        run: |
          cd atd
          npm run test:p0
      - name: Upload results
        if: always()
        uses: actions/upload-artifact@v3
        with:
          name: test-results
          path: atd/test-results/
```

## 🔍 Known Limitations

### Skipped Tests
Some tests are marked with `test.skip()` because they require:

1. **Stripe Test Mode**: Payment tests require Stripe test environment
   - Tests: `payment.spec.ts` - credit card processing
   - Solution: Enable Stripe test mode or use mock

2. **Valid Test Accounts**: Login tests require real user accounts
   - Tests: `login.spec.ts` - authentication flows
   - Solution: Create test user accounts

3. **Email Verification**: Email confirmation tests
   - Solution: Integrate with Mailinator or similar service

### Test Environment Notes

- Tests run against **production website** by default
- Some features (payments, registration) may require **test/staging environment**
- Use `.env` to configure test vs production URLs

## 📚 Resources

### Documentation
- [Playwright Documentation](https://playwright.dev/)
- [Test Plan](./e2e-test-plan.md) - Full BDD scenarios
- [Page Object Model Pattern](https://playwright.dev/docs/pom)

### Agile Testing Days
- **Website**: https://agiletestingdays.com/
- **Event Dates**: November 24-27, 2025
- **Venue**: Dorint Sanssouci Berlin/Potsdam

## 🤝 Contributing

### Adding New Tests

1. Follow the Page Object Model pattern
2. Add test data to `fixtures/test-data.ts`
3. Use appropriate tags (`@p0`, `@p1`, `@smoke`)
4. Update this README with new test scenarios

### Code Style

- **TypeScript**: Strict mode enabled
- **Naming**: Descriptive test names using "should" pattern
- **Structure**: Arrange-Act-Assert pattern
- **DRY**: Reuse Page Objects and helpers

## 🎓 Test Execution Best Practices

### Local Development
```bash
# Run smoke tests first (quick validation)
npm run test:smoke

# Then run critical path tests
npm run test:critical

# Debug failing tests
npm run test:debug
```

### CI Pipeline
```bash
# Smoke tests (2-3 minutes)
npm run test:smoke

# P0 critical tests (5-10 minutes)
npm run test:p0

# Full regression (15-20 minutes)
npm test
```

## 📞 Support

For issues or questions:
- Check the test plan: `/workspaces/test-project/atd/e2e-test-plan.md`
- Review Playwright docs: https://playwright.dev/
- Generated by: **Agentic QE Fleet v1.0.5**

---

**Generated**: 2025-10-23
**Test Framework**: Playwright v1.40.1
**Language**: TypeScript
**Pattern**: Page Object Model
**Coverage**: 67 BDD scenarios, 78+ test cases
