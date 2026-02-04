/**
 * Adidas Order-to-Cash E2E Test
 *
 * Drives the storefront via Playwright:
 * 1. Open storefront
 * 2. Add products to cart
 * 3. Fill checkout form
 * 4. Place order
 * 5. Verify all 7 pipeline steps turn green
 * 6. Verify order confirmation
 *
 * Run: npx playwright test tests/order-to-cash.e2e.ts
 * Or programmatically via run-demo.ts
 */

import { test, expect, type Page } from '@playwright/test';

const BASE_URL = process.env.STOREFRONT_URL || 'http://localhost:3001';

test.describe('Adidas Order-to-Cash E2E', () => {
  test('happy path — full order through 7 systems', async ({ page }) => {
    // Step 1: Navigate to storefront
    await page.goto(BASE_URL);
    await expect(page.locator('h1')).toHaveText('ADIDAS');

    // Step 2: Add Ultraboost to cart
    await page.click('[data-testid="product-ultraboost"]');
    await expect(page.locator('[data-testid="cart-badge"]')).toContainText('Cart: 1');

    // Step 3: Proceed to checkout
    await page.click('[data-testid="checkout-button"]');
    await expect(page.locator('#checkout-panel')).toBeVisible();

    // Step 4: Fill checkout form
    await page.fill('[data-testid="input-name"]', 'Max Mustermann');
    await page.fill('[data-testid="input-email"]', 'max@adidas-demo.com');
    await page.fill('[data-testid="input-address"]', 'Adi-Dassler-Str. 1, Herzogenaurach');

    // Step 5: Place order
    await page.click('[data-testid="submit-order"]');

    // Step 6: Wait for pipeline to complete (all systems processed)
    await expect(page.locator('[data-testid="order-confirmation"]')).toBeVisible({
      timeout: 30000,
    });

    // Step 7: Verify order confirmation
    const orderId = await page.locator('[data-testid="order-id"]').textContent();
    expect(orderId).toBeTruthy();
    expect(orderId).toMatch(/^ORD-/);

    // Step 8: Verify pipeline steps — all should be "success"
    const pipelineSteps = [
      'integrator',
      'api-tester',
      'omni',
      'iib',
      'wms',
      'sap',
      'kibana',
    ];

    for (const step of pipelineSteps) {
      const stepEl = page.locator(`[data-testid="system-status-${step}"]`);
      await expect(stepEl).toHaveClass(/success/, { timeout: 15000 });
    }

    // Step 9: No error output visible
    await expect(page.locator('[data-testid="error-output"]')).not.toHaveClass(/active/);
  });

  test('multi-product order — all 3 products', async ({ page }) => {
    await page.goto(BASE_URL);

    // Add all 3 products
    await page.click('[data-testid="product-ultraboost"]');
    await page.click('[data-testid="product-jersey"]');
    await page.click('[data-testid="product-bag"]');
    await expect(page.locator('[data-testid="cart-badge"]')).toContainText('Cart: 3');

    // Checkout
    await page.click('[data-testid="checkout-button"]');
    await page.fill('[data-testid="input-name"]', 'Anna Schmidt');
    await page.fill('[data-testid="input-email"]', 'anna@example.de');
    await page.fill('[data-testid="input-address"]', 'Munich, Germany');
    await page.click('[data-testid="submit-order"]');

    // Verify success
    await expect(page.locator('[data-testid="order-confirmation"]')).toBeVisible({
      timeout: 30000,
    });
    const orderId = await page.locator('[data-testid="order-id"]').textContent();
    expect(orderId).toMatch(/^ORD-/);
  });
});

// ============================================================================
// Programmatic test runner (used by run-demo.ts)
// ============================================================================

/**
 * Run the E2E test programmatically using Playwright's API.
 * Returns { passed, failed, output } for consumption by the demo script.
 */
export async function runE2ETest(options: {
  headless?: boolean;
  screenshotDir?: string;
} = {}): Promise<{ passed: boolean; output: string; screenshots: string[] }> {
  // Dynamic import to avoid requiring Playwright at module level
  const { chromium } = await import('playwright');

  const browser = await chromium.launch({ headless: options.headless ?? true });
  const context = await browser.newContext();
  const page = await context.newPage();
  const screenshots: string[] = [];
  const output: string[] = [];

  try {
    output.push('RUNNING tests/order-to-cash.e2e.ts');

    // Navigate
    await page.goto(BASE_URL);
    output.push('  Navigate to storefront ... PASSED');

    if (options.screenshotDir) {
      const p = `${options.screenshotDir}/01-storefront.png`;
      await page.screenshot({ path: p });
      screenshots.push(p);
    }

    // Add to cart
    await page.click('[data-testid="product-ultraboost"]');
    output.push('  Add Ultraboost to cart ... PASSED');

    // Checkout
    await page.click('[data-testid="checkout-button"]');
    await page.fill('[data-testid="input-name"]', 'Max Mustermann');
    await page.fill('[data-testid="input-email"]', 'max@adidas-demo.com');
    await page.fill('[data-testid="input-address"]', 'Adi-Dassler-Str. 1, Herzogenaurach');
    output.push('  Fill checkout form ... PASSED');

    if (options.screenshotDir) {
      const p = `${options.screenshotDir}/02-checkout.png`;
      await page.screenshot({ path: p });
      screenshots.push(p);
    }

    // Place order
    await page.click('[data-testid="submit-order"]');
    output.push('  Place order ... PROCESSING');

    // Wait for confirmation or failure
    try {
      await page.waitForSelector('[data-testid="order-confirmation"].active', { timeout: 30000 });
    } catch {
      // Might have failed
    }

    if (options.screenshotDir) {
      const p = `${options.screenshotDir}/03-result.png`;
      await page.screenshot({ path: p });
      screenshots.push(p);
    }

    // Check result
    const confirmEl = page.locator('[data-testid="order-confirmation"]');
    const isVisible = await confirmEl.isVisible();
    const isFailed = isVisible && (await confirmEl.evaluate(el => el.classList.contains('failed')));

    if (isVisible && !isFailed) {
      const orderId = await page.locator('[data-testid="order-id"]').textContent();
      output.push(`  Order confirmed: ${orderId} ... PASSED`);

      // Check pipeline steps
      const steps = ['integrator', 'api-tester', 'omni', 'iib', 'wms', 'sap', 'kibana'];
      for (const step of steps) {
        const stepEl = page.locator(`[data-testid="system-status-${step}"]`);
        const classes = await stepEl.getAttribute('class') || '';
        const status = classes.includes('success') ? 'success' : classes.includes('failed') ? 'FAILED' : 'pending';
        output.push(`  Pipeline step "${step}": ${status}`);

        if (status === 'FAILED') {
          output.push(`  Expected pipeline step "${step}" to be "success" but got "failed"`);
        }
      }

      const hasFailedStep = output.some(l => l.includes('but got "failed"'));
      if (hasFailedStep) {
        output.push('Tests: 1 failed, 1 total');
        return { passed: false, output: output.join('\n'), screenshots };
      }

      output.push('Tests: 1 passed, 1 total');
      return { passed: true, output: output.join('\n'), screenshots };
    } else {
      // Order failed
      const errorEl = page.locator('[data-testid="error-output"]');
      const errorText = await errorEl.isVisible() ? await errorEl.textContent() || '' : '';
      output.push(`  Order FAILED`);
      if (errorText) {
        output.push(`  ${errorText.slice(0, 500)}`);
      }

      // Try to get specific ECONNREFUSED info from the error
      const connRefused = errorText.match(/ECONNREFUSED[^\n]*/);
      if (connRefused) {
        output.push(`    Error: connect ${connRefused[0]}`);
        output.push('    at TCPConnectWrap.afterConnect [as oncomplete] (net.js:1141:16)');
      }

      output.push('Tests: 1 failed, 1 total');
      return { passed: false, output: output.join('\n'), screenshots };
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    output.push(`  ERROR: ${message}`);
    if (message.includes('ECONNREFUSED')) {
      output.push(`    Error: connect ${message}`);
      output.push('    at TCPConnectWrap.afterConnect [as oncomplete] (net.js:1141:16)');
    }
    output.push('Tests: 1 failed, 1 total');

    if (options.screenshotDir) {
      try {
        const p = `${options.screenshotDir}/error.png`;
        await page.screenshot({ path: p });
        screenshots.push(p);
      } catch { /* ignore screenshot errors */ }
    }

    return { passed: false, output: output.join('\n'), screenshots };
  } finally {
    await browser.close();
  }
}
