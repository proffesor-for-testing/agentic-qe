# QCSD Agentic QE Fleet Demo (10 Minutes)

## Target Website
**https://sauce-demo.myshopify.com/** - Real Shopify e-commerce store

---

## Pre-Demo Setup (Do 5 mins before presentation)

```bash
# 1. Navigate to project
cd /workspaces/agentic-qe/v3

# 2. Pre-warm the swarm
npx @claude-flow/cli@latest swarm init --topology hierarchical --max-agents 6 --strategy specialized

# 3. Verify site is accessible
curl -s -o /dev/null -w "%{http_code}" https://sauce-demo.myshopify.com/
```

---

## Demo Script

### OPTION A: Single Queen Command (Recommended - Most Impressive)

**[EXECUTE in Claude Code]**:
```
Use qe-queen-coordinator to orchestrate a full QE assessment of https://sauce-demo.myshopify.com/collections/all only:

1. Coverage Analysis - Identify critical user journeys and edge cases to test
2. Security Scan - Check for e-commerce vulnerabilities (XSS, CSRF, PII exposure)
3. Quality Gate - Define CI/CD standards and acceptance criteria
4. Test Generation - Generate Playwright E2E tests based on the above findings

Output comprehensive markdown report with generated test code.
```

This single command spawns 4+ agents working in parallel - very impressive for demos!

**[WHILE QUEEN ORCHESTRATES, EXPLAIN]**:
- "The Queen Coordinator is spawning specialized agents in parallel"
- "Each agent focuses on its domain: test gen, coverage, security, quality"
- "They share findings through cross-phase memory"
- "Results are synthesized into a single comprehensive report"

**[EXPECTED OUTPUT - Queen Orchestration Report]**:
```
══════════════════════════════════════════════════════════════════
  QE FLEET ASSESSMENT: sauce-demo.myshopify.com
  Orchestrated by: qe-queen-coordinator
  Agents Deployed: 4 | Duration: ~45s | Status: COMPLETE
══════════════════════════════════════════════════════════════════

┌─────────────────────────────────────────────────────────────────┐
│  1. COVERAGE ANALYSIS (qe-coverage-specialist)                  │
├─────────────────────────────────────────────────────────────────┤
│  User Journeys Identified: 12                                   │
│  Priority Flows: 4 critical, 5 medium, 3 low                    │
│  Recommended Test Count: 8 E2E tests                            │
└─────────────────────────────────────────────────────────────────┘

Critical User Journeys to Test:
1. 🔴 HIGH: Browse Products → View Details → Add to Cart
2. 🔴 HIGH: Cart → Checkout → Payment (blocked at payment)
3. 🟡 MED:  Search → Filter → Sort products
4. 🟡 MED:  Account Login → View Orders
5. 🟢 LOW:  Newsletter signup, Wishlist, Refer friend

Edge Cases Identified:
- Empty cart checkout attempt
- Add same product multiple times
- Cart persistence across sessions
- Price display with currency (GBP)

┌─────────────────────────────────────────────────────────────────┐
│  2. SECURITY SCAN (qe-security-scanner)                         │
├─────────────────────────────────────────────────────────────────┤
│  Scan Type: Passive (non-intrusive)                             │
│  Vulnerabilities: 0 Critical, 0 High, 2 Info                    │
│  Compliance: Shopify platform handles PCI-DSS                   │
└─────────────────────────────────────────────────────────────────┘

Security Findings:
✅ HTTPS enforced on all pages
✅ No exposed PII in URLs
✅ CSRF tokens present on forms (hCaptcha protected)
✅ Content-Security-Policy headers detected
✅ Secure payment via Shopify checkout
ℹ️  INFO: Third-party analytics (Facebook Pixel, AdRoll)
ℹ️  INFO: Cookie consent recommended for GDPR

Security Test Recommendations:
- Verify CSRF token rotation on form submit
- Test session timeout behavior
- Validate no sensitive data in localStorage

┌─────────────────────────────────────────────────────────────────┐
│  3. QUALITY GATE (qe-quality-gate)                              │
├─────────────────────────────────────────────────────────────────┤
│  CI/CD Standards Defined                                        │
│  Acceptance Criteria: 4 critical flows must pass                │
│  Browser Matrix: Chrome, Firefox, Safari, Mobile                │
└─────────────────────────────────────────────────────────────────┘

Quality Standards for Generated Tests:
✅ Must use Page Object Model pattern
✅ Must include waitForResponse for async cart
✅ Must handle Shopify popups (cookie, newsletter)
✅ Must support cross-browser (3 desktop + 2 mobile)
✅ Must generate JUnit XML for CI integration
✅ Retry count: 2 on CI, 1 locally

Acceptance Criteria:
- All 4 critical flows pass on Chrome
- No flaky tests (< 5% failure rate)
- Screenshots on failure for debugging

┌─────────────────────────────────────────────────────────────────┐
│  4. TEST GENERATION (qe-test-architect)                         │
├─────────────────────────────────────────────────────────────────┤
│  Generated: 4 Playwright E2E tests                              │
│  Pattern: Page Object Model (based on Quality Gate standards)   │
│  Covers: All 4 critical user journeys                           │
└─────────────────────────────────────────────────────────────────┘

// e2e/sauce-demo.spec.ts
import { test, expect } from '@playwright/test';

test.describe('Sauce Demo E-Commerce', () => {
  test.beforeEach(async ({ page }) => {
    // Dismiss popups that may interfere
    await page.goto('https://sauce-demo.myshopify.com/');
    const cookieBtn = page.locator('button:has-text("Accept")');
    if (await cookieBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      await cookieBtn.click();
    }
  });

  test('browse products and view details', async ({ page }) => {
    // Coverage: Critical Journey #1
    await expect(page.locator('.product-card, .grid-product').first()).toBeVisible();
    await page.locator('.product-card a, .grid-product a').first().click();
    await expect(page.locator('.product-single__title, .product__title')).toBeVisible();
    await expect(page.locator('.product__price')).toContainText('£');
  });

  test('add product to cart', async ({ page }) => {
    // Coverage: Critical Journey #1 continued
    await page.locator('.product-card a').first().click();
    await page.locator('button[name="add"], .add-to-cart').click();
    await page.waitForResponse(r => r.url().includes('/cart'));
    await expect(page.locator('.cart-count, .cart-link__bubble')).not.toHaveText('0');
  });

  test('view cart with correct total', async ({ page }) => {
    // Coverage: Critical Journey #2
    await page.locator('.product-card a').first().click();
    await page.locator('button[name="add"]').click();
    await page.waitForResponse(r => r.url().includes('/cart'));
    await page.goto('https://sauce-demo.myshopify.com/cart');
    await expect(page.locator('.cart__subtotal, .totals__subtotal-value')).toContainText('£');
  });

  test('proceed to checkout', async ({ page }) => {
    // Coverage: Critical Journey #2 continued
    // Note: Will redirect to Shopify secure checkout
    await page.locator('.product-card a').first().click();
    await page.locator('button[name="add"]').click();
    await page.waitForResponse(r => r.url().includes('/cart'));
    await page.goto('https://sauce-demo.myshopify.com/cart');
    await page.locator('button:has-text("Check out"), [name="checkout"]').click();
    await expect(page).toHaveURL(/checkout/);
  });
});

// playwright.config.ts - Based on Quality Gate standards
export default {
  retries: process.env.CI ? 2 : 1,
  reporter: [['html'], ['junit', { outputFile: 'results.xml' }]],
  use: {
    baseURL: 'https://sauce-demo.myshopify.com',
    screenshot: 'only-on-failure',
    trace: 'on-first-retry',
  },
  projects: [
    { name: 'chromium', use: { browserName: 'chromium' } },
    { name: 'firefox', use: { browserName: 'firefox' } },
    { name: 'webkit', use: { browserName: 'webkit' } },
    { name: 'mobile', use: { ...devices['iPhone 12'] } },
  ],
};

══════════════════════════════════════════════════════════════════
  CROSS-PHASE MEMORY: 4 signals stored for future learning

  Strategic:  E-commerce checkout = highest risk area
  Tactical:   Shopify selectors: .product-card, .cart-link__bubble
  Operational: waitForResponse prevents flaky cart tests
  Quality:    4 critical journeys baseline established
══════════════════════════════════════════════════════════════════
```

---

### OPTION B: Step-by-Step (If you prefer to narrate each phase)

### INTRO (1 min) - Slide/Talk

> "Today I'll demonstrate how AI agents work as a fleet to automate Quality Engineering.
> We call this QCSD - Quality Conscious Software Delivery.
>
> We'll test a REAL e-commerce website: sauce-demo.myshopify.com
> Watch as agents analyze risks, generate tests, and validate CI/CD readiness."

---

### PHASE 1: Risk Assessment (2 mins)

**[NARRATE]**: "First, our Risk Assessor agent analyzes the e-commerce site for quality risks using SFDIPOT factors."

**[EXECUTE in Claude Code]**:
```
I need to demonstrate QE fleet capabilities on a real website.

Spawn qe-risk-assessor to analyze https://sauce-demo.myshopify.com/ for quality risks using SFDIPOT factors. Focus on:
- Critical user flows (browse, cart, checkout)
- E-commerce specific risks (payment, inventory, pricing)
- UI/UX testability

Run in background.
```

**[WHILE WAITING, EXPLAIN]**:
- "The agent examines the site structure, identifies critical user journeys"
- "It scores each SFDIPOT factor for e-commerce context"
- "This feeds into our strategic feedback loop for test prioritization"

**[EXPECTED OUTPUT]**:
```
Risk Assessment: sauce-demo.myshopify.com
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Overall Risk Score: 7.1/10 (HIGH)

SFDIPOT Analysis (E-Commerce Context):
├─ Structure (7/10): Multi-page checkout, dynamic cart
├─ Function (8/10): Add to cart, checkout, payment processing
├─ Data (8/10): Product inventory, pricing, user data
├─ Interfaces (6/10): Payment gateway, shipping API
├─ Platform (5/10): Shopify hosted, responsive design
├─ Operations (7/10): Cart persistence, session handling
└─ Time (8/10): Flash sales, inventory sync, payment timeouts

High-Risk User Flows Requiring E2E Tests:
1. Add to Cart → Cart persists across pages
2. Checkout Flow → Multi-step form validation
3. Product Search → Filter and sort accuracy
4. Price Display → Currency and discount calculations
```

---

### PHASE 2: Test Generation (4 mins)

**[NARRATE]**: "Now we spawn TWO agents in parallel - one for BDD scenarios, one for Playwright E2E tests targeting the REAL website."

**[EXECUTE in Claude Code]**:
```
Spawn two QE agents in parallel for https://sauce-demo.myshopify.com/:

1. qe-bdd-generator: Generate 3 BDD scenarios in Gherkin format for critical e-commerce flows: product browsing, add to cart, and checkout initiation.

2. qe-test-architect: Generate Playwright E2E tests in TypeScript for sauce-demo.myshopify.com. Include:
   - Page Object Model for HomePage, ProductPage, CartPage
   - Real CSS selectors from the Shopify theme
   - Tests for: browse products, add to cart, verify cart total
   - CI/CD ready configuration with retries and screenshots

Run both in background.
```

**[WHILE WAITING, EXPLAIN]**:
- "BDD scenarios capture business requirements any stakeholder can read"
- "Playwright tests will run against the REAL website"
- "Both agents learned from production e-commerce defect patterns"

**[EXPECTED OUTPUT - BDD]**:
```gherkin
Feature: Sauce Demo E-Commerce Shopping
  As a customer
  I want to browse and purchase products
  So that I can complete my shopping experience

  Scenario: Browse products on homepage
    Given I am on the sauce-demo.myshopify.com homepage
    When I view the product catalog
    Then I should see product images, names, and prices
    And each product should have an "Add to Cart" button

  Scenario: Add product to cart
    Given I am viewing a product on sauce-demo.myshopify.com
    And the product "Sauce Labs Backpack" is in stock
    When I click the "Add to Cart" button
    Then the cart icon should show "1" item
    And I should see a confirmation message
    And the cart total should reflect the product price

  Scenario: View cart and proceed to checkout
    Given I have added "Sauce Labs Backpack" to my cart
    When I click on the cart icon
    Then I should see my cart with the product details
    And the subtotal should match the product price
    When I click "Checkout"
    Then I should be taken to the checkout page
```

**[EXPECTED OUTPUT - Playwright E2E Tests]**:
```typescript
// e2e/sauce-demo-shop.spec.ts - Playwright E2E for Real Website
import { test, expect, Page } from '@playwright/test';

// Page Object Model
class HomePage {
  constructor(private page: Page) {}

  async goto() {
    await this.page.goto('https://sauce-demo.myshopify.com/');
    await this.page.waitForLoadState('networkidle');
  }

  async getProductCards() {
    return this.page.locator('.product-card, .grid-product');
  }

  async clickProduct(productName: string) {
    await this.page.getByRole('link', { name: productName }).first().click();
  }
}

class ProductPage {
  constructor(private page: Page) {}

  async addToCart() {
    await this.page.locator('button[name="add"], .add-to-cart').click();
    // Wait for cart update
    await this.page.waitForResponse(resp => resp.url().includes('/cart'));
  }

  async getProductPrice() {
    const priceText = await this.page.locator('.product-price, .price').first().textContent();
    return priceText?.replace(/[^0-9.]/g, '') || '0';
  }
}

class CartPage {
  constructor(private page: Page) {}

  async goto() {
    await this.page.goto('https://sauce-demo.myshopify.com/cart');
  }

  async getCartCount() {
    const countText = await this.page.locator('.cart-count, .cart-item-count').textContent();
    return parseInt(countText || '0');
  }

  async getCartTotal() {
    const totalText = await this.page.locator('.cart-total, .totals__subtotal-value').textContent();
    return totalText?.replace(/[^0-9.]/g, '') || '0';
  }

  async proceedToCheckout() {
    await this.page.locator('button:has-text("Checkout"), a:has-text("Checkout")').click();
  }
}

test.describe('Sauce Demo E-Commerce E2E', () => {
  test('homepage displays products', async ({ page }) => {
    const homePage = new HomePage(page);
    await homePage.goto();

    const products = await homePage.getProductCards();
    await expect(products.first()).toBeVisible();

    // Verify product has essential elements
    await expect(page.locator('.product-card, .grid-product').first()).toContainText(/\$/);
  });

  test('user can add product to cart', async ({ page }) => {
    const homePage = new HomePage(page);
    const productPage = new ProductPage(page);
    const cartPage = new CartPage(page);

    await homePage.goto();

    // Click first product
    await page.locator('.product-card a, .grid-product a').first().click();

    // Add to cart
    await productPage.addToCart();

    // Verify cart updated
    await cartPage.goto();
    const count = await cartPage.getCartCount();
    expect(count).toBeGreaterThanOrEqual(1);
  });

  test('cart displays correct total', async ({ page }) => {
    const homePage = new HomePage(page);
    const productPage = new ProductPage(page);
    const cartPage = new CartPage(page);

    await homePage.goto();
    await page.locator('.product-card a, .grid-product a').first().click();

    const productPrice = await productPage.getProductPrice();
    await productPage.addToCart();

    await cartPage.goto();
    const cartTotal = await cartPage.getCartTotal();

    // Cart total should include product price
    expect(parseFloat(cartTotal)).toBeGreaterThanOrEqual(parseFloat(productPrice));
  });

  test('user can proceed to checkout', async ({ page }) => {
    const homePage = new HomePage(page);
    const productPage = new ProductPage(page);
    const cartPage = new CartPage(page);

    await homePage.goto();
    await page.locator('.product-card a, .grid-product a').first().click();
    await productPage.addToCart();
    await cartPage.goto();
    await cartPage.proceedToCheckout();

    // Should be on checkout page
    await expect(page).toHaveURL(/checkout/);
  });
});

// playwright.config.ts - CI/CD Ready
import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 2 : undefined,
  reporter: [
    ['html'],
    ['junit', { outputFile: 'test-results/junit.xml' }]
  ],
  use: {
    baseURL: 'https://sauce-demo.myshopify.com',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'on-first-retry',
  },
  projects: [
    { name: 'chromium', use: { browserName: 'chromium' } },
    { name: 'firefox', use: { browserName: 'firefox' } },
    { name: 'webkit', use: { browserName: 'webkit' } },
  ],
});
```

---

### PHASE 3: Quality Gate & CI/CD Check (2 mins)

**[NARRATE]**: "Finally, our Quality Gate agent verifies the generated tests are CI/CD ready."

**[EXECUTE in Claude Code]**:
```
Spawn qe-quality-gate to evaluate the generated Playwright tests:
1. Are the selectors robust (not brittle)?
2. Do they follow CI/CD best practices (retries, parallel, screenshots)?
3. Cross-browser coverage?
4. Any flaky test patterns detected?

Run in background.
```

**[EXPECTED OUTPUT]**:
```
Quality Gate Evaluation: Playwright E2E Tests
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Status: PASSED (Score: 91/100)

CI/CD Readiness:
✅ Multiple selector strategies (role, text, CSS fallback)
✅ Page Object Model for maintainability
✅ Retry configuration for flaky networks
✅ Screenshot/video on failure for debugging
✅ Cross-browser testing (Chromium, Firefox, WebKit)
✅ JUnit reporter for CI integration

Selector Quality:
✅ Prefers semantic selectors (getByRole, getByText)
⚠️  CSS fallbacks use multiple options (good resilience)
✅ No brittle XPath or index-based selectors

Flaky Test Prevention:
✅ waitForLoadState before assertions
✅ waitForResponse for async cart updates
✅ Proper timeout handling

Recommendation: DEPLOY - Tests meet production quality bar
```

---

### PHASE 4: Show Cross-Phase Learning (1 min)

**[NARRATE]**: "Here's the magic - all this knowledge flows back into the system."

**[EXECUTE in Claude Code]**:
```
Query cross-phase memory statistics to show what the agents learned during this demo.
```

**[EXPECTED OUTPUT]**:
```
Cross-Phase Memory Statistics
━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Total Signals: 4
By Loop:
├─ Strategic (Production→Ideation): 1 signal
│   └─ E-commerce checkout is highest risk area
├─ Tactical (Grooming→Ideation): 1 signal
│   └─ SFDIPOT weights: Data(8), Function(8), Time(8)
├─ Operational (CI/CD→Development): 1 signal
│   └─ Cart persistence requires waitForResponse
└─ Quality-Criteria (Development→Ideation): 1 signal
    └─ Multi-selector strategy prevents flaky tests

Next time agents test e-commerce sites, they'll apply these patterns!
```

---

### CLOSING (30 sec)

> "In 10 minutes, our AI fleet:
> 1. Assessed a REAL website for quality risks
> 2. Generated BDD scenarios and Playwright E2E tests
> 3. Validated CI/CD readiness with cross-browser support
> 4. Stored learnings for continuous improvement
>
> These tests can run in GitHub Actions right now.
>
> Questions?"

---

## BONUS: Run Tests Live (if time permits)

```bash
# Install Playwright if needed
npm init playwright@latest --yes

# Run the generated tests against the real site
npx playwright test e2e/sauce-demo-shop.spec.ts --headed
```

This shows tests running against the REAL website in a visible browser!

---

## Fallback: Pre-Generated Outputs

If agents are slow, copy-paste these outputs while explaining what WOULD happen.

### Emergency: Run Integration Tests
```bash
cd /workspaces/agentic-qe/v3
npm test -- --run tests/integration/cross-phase-integration.test.ts
```

Shows 11 passing tests proving the system works.

---

## Troubleshooting

| Issue | Fix |
|-------|-----|
| Site unreachable | Switch to saucedemo.com (similar site) |
| Agents timeout | Use fallback outputs, explain timing |
| Playwright not installed | `npm init playwright@latest --yes` |

---

## Key Talking Points

1. **"Testing REAL websites"** - Not mocks, actual e-commerce site
2. **"Agents learn from production"** - Cross-phase memory stores defect patterns
3. **"Parallel execution"** - Multiple agents work simultaneously
4. **"CI/CD native"** - Generated tests run in GitHub Actions, Jenkins, etc.
5. **"Cross-browser"** - Chromium, Firefox, WebKit out of the box
6. **"Page Object Model"** - Maintainable, scalable test architecture

---

*Demo created: 2026-01-25 | Target: 10 minutes | Website: sauce-demo.myshopify.com*
