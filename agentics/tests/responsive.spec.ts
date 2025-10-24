import { test, expect, devices } from '@playwright/test';
import { HomePage } from '../pages/HomePage';

/**
 * Test Suite: Responsive Design Tests
 *
 * Coverage:
 * - TC-005: Mobile Responsiveness (iPhone 12)
 * - TC-006: Tablet Responsiveness (iPad)
 * - Desktop responsiveness at various resolutions
 */

test.describe('Responsive Design Tests', () => {
  test('TC-005: Site should be fully responsive on mobile (iPhone 12)', async ({ browser }) => {
    // Create mobile context
    const context = await browser.newContext({
      ...devices['iPhone 12'],
    });
    const page = await context.newPage();
    const homePage = new HomePage(page);

    await homePage.goto();

    // Verify viewport is correct
    const viewport = page.viewportSize();
    expect(viewport?.width).toBe(390);
    expect(viewport?.height).toBe(844);

    // Verify no horizontal scroll
    const hasHorizontalScroll = await page.evaluate(() => {
      return document.documentElement.scrollWidth > document.documentElement.clientWidth;
    });
    expect(hasHorizontalScroll).toBe(false);

    // Verify mobile menu button is visible
    await expect(homePage.mobileMenuButton).toBeVisible();

    // Verify logo is visible on mobile
    await expect(homePage.logo).toBeVisible();

    // Verify hero content is visible
    await expect(homePage.heroHeading).toBeVisible();

    // Verify text is readable (no truncation)
    const heroText = await homePage.heroHeading.textContent();
    expect(heroText).toBeTruthy();
    expect(heroText!.length).toBeGreaterThan(10);

    // Verify touch targets are large enough (minimum 44x44px)
    const joinButtonBox = await homePage.joinCommunityButton.boundingBox();
    if (joinButtonBox) {
      expect(joinButtonBox.height).toBeGreaterThanOrEqual(44);
    }

    // Verify console button is accessible on mobile
    await expect(homePage.consoleButton).toBeVisible();

    await context.close();
  });

  test('TC-006: Site should adapt correctly to tablet (iPad)', async ({ browser }) => {
    // Create tablet context
    const context = await browser.newContext({
      ...devices['iPad Pro'],
    });
    const page = await context.newPage();
    const homePage = new HomePage(page);

    await homePage.goto();

    // Verify viewport
    const viewport = page.viewportSize();
    expect(viewport?.width).toBe(1024);
    expect(viewport?.height).toBe(1366);

    // Verify logo is visible
    await expect(homePage.logo).toBeVisible();

    // Verify navigation is visible on tablet
    const isNavVisible = await homePage.isNavigationVisible();
    expect(isNavVisible).toBe(true);

    // Verify content is properly aligned
    await expect(homePage.heroHeading).toBeVisible();
    await expect(homePage.pathsHeading).toBeVisible();

    // Verify explore cards are visible
    const cardsVisible = await homePage.areExploreCardsVisible();
    expect(cardsVisible).toBe(true);

    await context.close();
  });

  test('TC-R03: Site should work at common desktop resolution (1366x768)', async ({ browser }) => {
    const context = await browser.newContext({
      viewport: { width: 1366, height: 768 },
    });
    const page = await context.newPage();
    const homePage = new HomePage(page);

    await homePage.goto();

    // Verify all main elements are visible
    await expect(homePage.logo).toBeVisible();
    await expect(homePage.navAbout).toBeVisible();
    await expect(homePage.heroHeading).toBeVisible();

    // Verify no horizontal scroll
    const hasHorizontalScroll = await page.evaluate(() => {
      return document.documentElement.scrollWidth > document.documentElement.clientWidth;
    });
    expect(hasHorizontalScroll).toBe(false);

    await context.close();
  });

  test('TC-R04: Site should work at large desktop resolution (1920x1080)', async ({ browser }) => {
    const context = await browser.newContext({
      viewport: { width: 1920, height: 1080 },
    });
    const page = await context.newPage();
    const homePage = new HomePage(page);

    await homePage.goto();

    // Verify all elements are visible and properly spaced
    await expect(homePage.logo).toBeVisible();
    await expect(homePage.heroHeading).toBeVisible();

    // Verify navigation menu is visible
    const navLinks = await homePage.getAllNavLinks();
    expect(navLinks.length).toBeGreaterThanOrEqual(7);

    // Verify paths of impact are visible
    const allPathsVisible = await homePage.areAllPathsVisible();
    expect(allPathsVisible).toBe(true);

    await context.close();
  });

  test('TC-R05: Site should handle landscape orientation on mobile', async ({ browser }) => {
    const context = await browser.newContext({
      ...devices['iPhone 12 landscape'],
    });
    const page = await context.newPage();
    const homePage = new HomePage(page);

    await homePage.goto();

    // Verify content is accessible in landscape
    await expect(homePage.logo).toBeVisible();
    await expect(homePage.heroHeading).toBeVisible();

    // Verify no horizontal scroll
    const hasHorizontalScroll = await page.evaluate(() => {
      return document.documentElement.scrollWidth > document.documentElement.clientWidth;
    });
    expect(hasHorizontalScroll).toBe(false);

    await context.close();
  });
});
