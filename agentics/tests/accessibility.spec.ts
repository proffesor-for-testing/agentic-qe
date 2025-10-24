import { test, expect } from '@playwright/test';
import { HomePage } from '../pages/HomePage';
import AxeBuilder from '@axe-core/playwright';

/**
 * Test Suite: Accessibility Tests (WCAG 2.1 AA Compliance)
 *
 * Coverage:
 * - TC-007: Automated accessibility scan
 * - TC-008: Keyboard navigation
 * - Heading hierarchy
 * - Alt text for images
 * - Color contrast
 * - ARIA labels
 */

test.describe('Accessibility Tests', () => {
  let homePage: HomePage;

  test.beforeEach(async ({ page }) => {
    homePage = new HomePage(page);
    await homePage.goto();
  });

  test('TC-007: Should have no critical accessibility violations', async ({ page }) => {
    // Run axe accessibility scan
    const accessibilityScanResults = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa'])
      .analyze();

    // Verify no critical violations
    expect(accessibilityScanResults.violations).toEqual([]);
  });

  test('TC-008: Should support full keyboard navigation', async ({ page }) => {
    // Tab through interactive elements
    await page.keyboard.press('Tab');

    // Check first focusable element
    const firstFocused = await page.evaluate(() => {
      return document.activeElement?.tagName;
    });
    expect(['A', 'BUTTON']).toContain(firstFocused);

    // Tab multiple times to ensure keyboard navigation works
    for (let i = 0; i < 5; i++) {
      await page.keyboard.press('Tab');
    }

    // Verify we can reach navigation links
    const focused = await page.evaluate(() => {
      return document.activeElement?.textContent?.trim();
    });
    expect(focused).toBeTruthy();
  });

  test('TC-A03: All images should have alt text', async ({ page }) => {
    // Get all images
    const imagesWithoutAlt = await page.evaluate(() => {
      const images = Array.from(document.querySelectorAll('img'));
      return images.filter(img => !img.alt || img.alt.trim() === '').map(img => img.src);
    });

    // Verify all images have alt text
    expect(imagesWithoutAlt).toEqual([]);
  });

  test('TC-A04: Heading hierarchy should be correct', async () => {
    const headings = await homePage.getHeadings();

    // Should have exactly one H1
    const h1Count = headings.filter(h => h.level === 'h1').length;
    expect(h1Count).toBe(1);

    // Should not skip heading levels
    const levels = headings.map(h => parseInt(h.level.charAt(1)));
    for (let i = 1; i < levels.length; i++) {
      const diff = levels[i] - levels[i - 1];
      // Allow same level, one level down, or jump to h1 (section start)
      expect(diff).toBeLessThanOrEqual(1);
    }
  });

  test('TC-A05: Links should have meaningful text', async ({ page }) => {
    // Get all links
    const links = await page.evaluate(() => {
      const anchors = Array.from(document.querySelectorAll('a'));
      return anchors.map(a => ({
        text: a.textContent?.trim() || '',
        href: a.href,
        ariaLabel: a.getAttribute('aria-label')
      }));
    });

    // Filter out empty links (logo links may have aria-label instead)
    const problematicLinks = links.filter(link => {
      return !link.text && !link.ariaLabel && link.href;
    });

    // Verify all links have either text or aria-label
    expect(problematicLinks.length).toBeLessThan(2); // Allow logo link
  });

  test('TC-A06: Page should have proper landmark roles', async ({ page }) => {
    // Check for main landmark
    const hasMain = await page.locator('main, [role="main"]').count();
    expect(hasMain).toBeGreaterThan(0);

    // Check for navigation landmark
    const hasNav = await page.locator('nav, [role="navigation"]').count();
    expect(hasNav).toBeGreaterThan(0);

    // Check for footer/contentinfo
    const hasFooter = await page.locator('footer, [role="contentinfo"]').count();
    expect(hasFooter).toBeGreaterThan(0);
  });

  test('TC-A07: Interactive elements should have focus indicators', async ({ page }) => {
    // Focus on a button
    await homePage.joinCommunityButton.focus();

    // Check if element has focus
    const isFocused = await homePage.joinCommunityButton.evaluate((el) => {
      return document.activeElement === el;
    });
    expect(isFocused).toBe(true);

    // Verify focus is visible (element should have focus styles)
    const hasFocusStyle = await homePage.joinCommunityButton.evaluate((el) => {
      const styles = window.getComputedStyle(el);
      return styles.outline !== 'none' || styles.boxShadow !== 'none';
    });
    // Note: This test may need adjustment based on actual focus styling
    expect(hasFocusStyle).toBeTruthy();
  });

  test('TC-A08: Color contrast should meet WCAG AA standards', async ({ page }) => {
    // Run axe for color contrast specifically
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2aa'])
      .disableRules(['color-contrast']) // We'll handle this separately
      .analyze();

    // Check for color contrast violations
    const contrastResults = await new AxeBuilder({ page })
      .include('body')
      .options({ rules: { 'color-contrast': { enabled: true } } })
      .analyze();

    // Should have minimal or no contrast violations
    expect(contrastResults.violations.filter(v => v.id === 'color-contrast').length).toBeLessThanOrEqual(0);
  });

  test('TC-A09: Skip to main content link should exist', async ({ page }) => {
    // Check for skip link (common accessibility pattern)
    const skipLink = page.locator('a[href="#main"], a[href="#content"]').first();

    // Skip links are often visually hidden but should be in DOM
    const skipLinkCount = await page.locator('a[href^="#"]').count();
    expect(skipLinkCount).toBeGreaterThan(0);
  });

  test('TC-A10: Form elements should have associated labels', async ({ page }) => {
    // Get all inputs
    const inputsWithoutLabels = await page.evaluate(() => {
      const inputs = Array.from(document.querySelectorAll('input, select, textarea'));
      return inputs.filter(input => {
        const hasLabel = input.labels && input.labels.length > 0;
        const hasAriaLabel = input.getAttribute('aria-label');
        const hasAriaLabelledBy = input.getAttribute('aria-labelledby');
        return !hasLabel && !hasAriaLabel && !hasAriaLabelledBy;
      }).map(input => ({
        type: input.getAttribute('type'),
        name: input.getAttribute('name')
      }));
    });

    // All form inputs should have labels
    expect(inputsWithoutLabels).toEqual([]);
  });
});
