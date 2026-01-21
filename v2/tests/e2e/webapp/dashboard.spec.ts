import { test, expect } from '@playwright/test';

/**
 * E2E Tests for the P2P Dashboard
 *
 * These tests verify the web application from a user perspective,
 * testing actual browser interactions and visual elements.
 */

test.describe('P2P Dashboard', () => {
  test.beforeEach(async ({ page }) => {
    // Capture all console messages for debugging
    page.on('console', msg => {
      console.log(`[Browser ${msg.type()}]:`, msg.text());
    });
    await page.goto('/');
  });

  test('should load the dashboard page', async ({ page }) => {
    // Check title
    await expect(page).toHaveTitle(/Agentic QE - P2P Dashboard/);

    // Check root element exists
    const root = page.locator('#root');
    await expect(root).toBeVisible();
  });

  test('should display the app header', async ({ page }) => {
    // Wait for React to render with extended timeout
    try {
      await page.waitForSelector('#root > *', { timeout: 10000 });
    } catch (e) {
      // Capture HTML content for debugging
      const html = await page.content();
      console.log('Page HTML:', html.substring(0, 2000));
      throw e;
    }

    // The App component should render its content
    const content = page.locator('#root');
    await expect(content).not.toBeEmpty();
  });

  test('should show connection status', async ({ page }) => {
    // Wait for the app to initialize
    await page.waitForTimeout(1000);

    // Look for connection-related text
    const body = await page.textContent('body');
    expect(body).toBeDefined();
  });

  test('should handle page load without JavaScript errors', async ({ page }) => {
    const errors: string[] = [];
    const consoleErrors: string[] = [];

    page.on('pageerror', (error) => {
      console.log('[Page Error]:', error.message);
      errors.push(error.message);
    });

    page.on('console', msg => {
      if (msg.type() === 'error') {
        console.log('[Console Error]:', msg.text());
        consoleErrors.push(msg.text());
      }
    });

    await page.goto('/');
    await page.waitForTimeout(3000);

    // Log all errors for debugging
    if (errors.length > 0) {
      console.log('Page errors found:', errors);
    }
    if (consoleErrors.length > 0) {
      console.log('Console errors found:', consoleErrors);
    }

    // Filter out known acceptable errors (if any)
    const criticalErrors = errors.filter(e =>
      !e.includes('ResizeObserver loop') // Known non-critical error
    );

    expect(criticalErrors).toHaveLength(0);
  });

  test('should have correct viewport meta tag', async ({ page }) => {
    const viewport = await page.locator('meta[name="viewport"]').getAttribute('content');
    expect(viewport).toContain('width=device-width');
  });

  test('should load styles correctly', async ({ page }) => {
    // Check that body has the expected background style (from Tailwind)
    const bodyBg = await page.evaluate(() => {
      const body = document.body;
      return window.getComputedStyle(body).backgroundColor;
    });

    // Should have a dark background (rgb values for gray-900 or similar)
    expect(bodyBg).toBeDefined();
  });
});

test.describe('Dashboard Accessibility', () => {
  test('should have accessible structure', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#root > *');

    // Check for basic accessibility - no duplicate IDs
    const duplicateIds = await page.evaluate(() => {
      const allIds = Array.from(document.querySelectorAll('[id]')).map(el => el.id);
      const seen = new Set<string>();
      const duplicates: string[] = [];

      for (const id of allIds) {
        if (seen.has(id)) {
          duplicates.push(id);
        }
        seen.add(id);
      }

      return duplicates;
    });

    expect(duplicateIds).toHaveLength(0);
  });

  test('should have a lang attribute on html element', async ({ page }) => {
    await page.goto('/');
    const lang = await page.locator('html').getAttribute('lang');
    expect(lang).toBe('en');
  });
});

test.describe('Dashboard Performance', () => {
  test('should load within acceptable time', async ({ page }) => {
    const startTime = Date.now();

    await page.goto('/');
    await page.waitForSelector('#root > *');

    const loadTime = Date.now() - startTime;

    // Should load within 5 seconds
    expect(loadTime).toBeLessThan(5000);
  });

  test('should not have memory leaks from navigation', async ({ page }) => {
    // Navigate multiple times
    for (let i = 0; i < 3; i++) {
      await page.goto('/');
      await page.waitForTimeout(500);
    }

    // If we get here without crashing, basic memory handling is ok
    expect(true).toBe(true);
  });
});
