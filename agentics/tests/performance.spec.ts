import { test, expect } from '@playwright/test';
import { HomePage } from '../pages/HomePage';

/**
 * Test Suite: Performance Tests
 *
 * Coverage:
 * - TC-009: Page Load Performance
 * - TC-010: Resource Optimization
 * - Core Web Vitals (LCP, FID, CLS)
 */

test.describe('Performance Tests', () => {
  test('TC-009: Page should load within acceptable time limits', async ({ page }) => {
    const homePage = new HomePage(page);

    // Measure page load time
    const startTime = Date.now();
    await homePage.goto();
    const loadTime = Date.now() - startTime;

    // Verify page loads within 5 seconds
    expect(loadTime).toBeLessThan(5000);

    // Get detailed performance metrics
    const metrics = await homePage.getPerformanceMetrics();

    // Verify Time to First Byte (should be fast)
    expect(metrics.connectTime).toBeLessThan(2000);

    // Verify render time is acceptable
    expect(metrics.renderTime).toBeLessThan(3000);
  });

  test('TC-010: Resources should be optimized', async ({ page }) => {
    const homePage = new HomePage(page);

    // Track network requests
    const requests: any[] = [];
    page.on('request', (request) => {
      requests.push({
        url: request.url(),
        resourceType: request.resourceType(),
      });
    });

    await homePage.goto();

    // Verify JavaScript files are loaded
    const jsFiles = requests.filter(r => r.resourceType === 'script');
    expect(jsFiles.length).toBeGreaterThan(0);

    // Verify CSS files are loaded
    const cssFiles = requests.filter(r => r.resourceType === 'stylesheet');
    expect(cssFiles.length).toBeGreaterThan(0);

    // Verify images are loaded
    const imageFiles = requests.filter(r => r.resourceType === 'image');
    expect(imageFiles.length).toBeGreaterThan(0);

    // Check for caching headers
    const response = await page.goto('/');
    const headers = response ? await response.allHeaders() : {};

    // Verify cache headers exist (cache-control or etag)
    const hasCaching = headers['cache-control'] || headers['etag'];
    expect(hasCaching).toBeTruthy();
  });

  test('TC-P03: Core Web Vitals should meet "Good" thresholds', async ({ page }) => {
    const homePage = new HomePage(page);
    await homePage.goto();

    // Get Web Vitals
    const webVitals = await page.evaluate(() => {
      return new Promise((resolve) => {
        // Largest Contentful Paint (LCP)
        let lcp = 0;
        new PerformanceObserver((entryList) => {
          const entries = entryList.getEntries();
          const lastEntry = entries[entries.length - 1] as any;
          lcp = lastEntry.renderTime || lastEntry.loadTime;
        }).observe({ entryTypes: ['largest-contentful-paint'] });

        // Cumulative Layout Shift (CLS)
        let cls = 0;
        new PerformanceObserver((entryList) => {
          for (const entry of entryList.getEntries()) {
            if (!(entry as any).hadRecentInput) {
              cls += (entry as any).value;
            }
          }
        }).observe({ entryTypes: ['layout-shift'] });

        // Wait a bit to collect metrics
        setTimeout(() => {
          resolve({ lcp, cls });
        }, 3000);
      });
    });

    const vitals = webVitals as { lcp: number; cls: number };

    // LCP should be < 2.5s (2500ms) for "Good"
    if (vitals.lcp > 0) {
      expect(vitals.lcp).toBeLessThan(2500);
    }

    // CLS should be < 0.1 for "Good"
    expect(vitals.cls).toBeLessThan(0.1);
  });

  test('TC-P04: Images should be optimized', async ({ page }) => {
    const homePage = new HomePage(page);

    // Track image requests
    const images: any[] = [];
    page.on('response', async (response) => {
      if (response.request().resourceType() === 'image') {
        const headers = await response.allHeaders();
        images.push({
          url: response.url(),
          status: response.status(),
          contentType: headers['content-type'],
          size: parseInt(headers['content-length'] || '0'),
        });
      }
    });

    await homePage.goto();
    await page.waitForLoadState('networkidle');

    // Verify images are successfully loaded
    images.forEach((img) => {
      expect(img.status).toBe(200);
    });

    // Verify modern image formats are used (webp, svg, etc.)
    const modernFormats = images.filter((img) =>
      img.contentType?.includes('webp') ||
      img.contentType?.includes('svg') ||
      img.contentType?.includes('avif')
    );

    // At least some images should use modern formats
    expect(modernFormats.length).toBeGreaterThan(0);
  });

  test('TC-P05: Page should not have render-blocking resources', async ({ page }) => {
    const homePage = new HomePage(page);

    // Measure time to first paint
    await homePage.goto();

    const paintMetrics = await page.evaluate(() => {
      const paint = performance.getEntriesByType('paint');
      return {
        firstPaint: paint.find((p) => p.name === 'first-paint')?.startTime,
        firstContentfulPaint: paint.find((p) => p.name === 'first-contentful-paint')?.startTime,
      };
    });

    // FCP should be < 1.8s for "Good"
    if (paintMetrics.firstContentfulPaint) {
      expect(paintMetrics.firstContentfulPaint).toBeLessThan(1800);
    }
  });

  test('TC-P06: Page should handle slow 3G connection', async ({ page, context }) => {
    // Simulate slow 3G connection
    await context.route('**/*', async (route) => {
      // Add delay to simulate slow connection
      await new Promise((resolve) => setTimeout(resolve, 100));
      await route.continue();
    });

    const homePage = new HomePage(page);

    const startTime = Date.now();
    await homePage.goto();
    const loadTime = Date.now() - startTime;

    // Should still load within reasonable time on slow connection
    expect(loadTime).toBeLessThan(10000); // 10 seconds on slow 3G

    // Verify main content is visible
    await expect(homePage.heroHeading).toBeVisible();
  });

  test('TC-P07: No JavaScript errors in console', async ({ page }) => {
    const errors: string[] = [];

    // Listen for console errors
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        errors.push(msg.text());
      }
    });

    // Listen for page errors
    page.on('pageerror', (error) => {
      errors.push(error.message);
    });

    const homePage = new HomePage(page);
    await homePage.goto();

    // Wait for page to fully load
    await page.waitForLoadState('networkidle');

    // Should have no JavaScript errors
    expect(errors).toEqual([]);
  });
});
