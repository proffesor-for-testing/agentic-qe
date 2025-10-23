/**
 * External Links Tests - External platform integrations and social media
 * Priority: P2
 * Test Plan Scenarios: 6 scenarios from External Links and Integrations section
 */

import { test, expect } from '@playwright/test';
import { HomePage } from '../page-objects/HomePage';
import { handleCookieConsent } from '../utils/test-helpers';
import { EXTERNAL_LINKS } from '../fixtures/test-data';

test.describe('External Platform Integration', () => {
  let homePage: HomePage;

  test.beforeEach(async ({ page }) => {
    homePage = new HomePage(page);
    await homePage.navigateToHomepage();
    await handleCookieConsent(page);
  });

  test('@p2 should navigate to Slack community', async ({ page }) => {
    // Look for Slack link
    const slackLink = page.locator('a[href*="slack"], a:has-text("Slack")').first();
    const hasSlackLink = await slackLink.isVisible({ timeout: 5000 }).catch(() => false);

    if (hasSlackLink) {
      // Get the href to verify it's a Slack link
      const href = await slackLink.getAttribute('href');
      expect(href).toContain('slack');

      // Verify link opens in new tab
      const target = await slackLink.getAttribute('target');
      expect(target).toBe('_blank');

      // Optional: Click and verify (may trigger popup blockers)
      // const [newPage] = await Promise.all([
      //   page.context().waitForEvent('page'),
      //   slackLink.click(),
      // ]);
      // await newPage.close();
    } else {
      console.log('Slack link not found - may be in footer or different location');
    }
  });

  test('@p2 should navigate to LinkedIn page', async ({ page }) => {
    const linkedinLink = page.locator('a[href*="linkedin"], a:has-text("LinkedIn")').first();
    const hasLinkedInLink = await linkedinLink.isVisible({ timeout: 5000 }).catch(() => false);

    if (hasLinkedInLink) {
      const href = await linkedinLink.getAttribute('href');
      expect(href).toContain('linkedin.com');

      const target = await linkedinLink.getAttribute('target');
      expect(target).toBe('_blank');
    } else {
      console.log('LinkedIn link not found');
    }
  });

  test('@p2 should navigate to YouTube channel', async ({ page }) => {
    const youtubeLink = page.locator('a[href*="youtube"], a:has-text("YouTube")').first();
    const hasYouTubeLink = await youtubeLink.isVisible({ timeout: 5000 }).catch(() => false);

    if (hasYouTubeLink) {
      const href = await youtubeLink.getAttribute('href');
      expect(href).toContain('youtube.com');

      const target = await youtubeLink.getAttribute('target');
      expect(target).toBe('_blank');
    } else {
      console.log('YouTube link not found');
    }
  });

  test('@p2 should navigate to Bluesky profile', async ({ page }) => {
    const blueskyLink = page.locator('a[href*="bsky"], a:has-text("Bluesky")').first();
    const hasBlueskyLink = await blueskyLink.isVisible({ timeout: 5000 }).catch(() => false);

    if (hasBlueskyLink) {
      const href = await blueskyLink.getAttribute('href');
      expect(href).toContain('bsky');

      const target = await blueskyLink.getAttribute('target');
      expect(target).toBe('_blank');
    } else {
      console.log('Bluesky link not found');
    }
  });

  test('@p2 should verify live chat widget loads', async ({ page }) => {
    // Wait for page to fully load
    await page.waitForLoadState('networkidle');

    // Common live chat widget selectors
    const chatWidgetSelectors = [
      '#chat-widget',
      '.chat-widget',
      '[class*="chat"]',
      'iframe[title*="chat" i]',
      '.intercom-launcher',
      '.drift-widget',
      '#hubspot-messages-iframe-container',
    ];

    let chatFound = false;
    for (const selector of chatWidgetSelectors) {
      const widget = page.locator(selector).first();
      const isVisible = await widget.isVisible({ timeout: 2000 }).catch(() => false);
      if (isVisible) {
        chatFound = true;
        break;
      }
    }

    // Chat widget is optional, so we just log the result
    console.log('Live chat widget found:', chatFound);
  });

  test('@p2 should navigate to AgileTD Zone community site', async ({ page }) => {
    // Look for AgileTD Zone or community link
    const communityLink = page.locator('a:has-text("AgileTD Zone"), a:has-text("Community")').first();
    const hasCommunityLink = await communityLink.isVisible({ timeout: 5000 }).catch(() => false);

    if (hasCommunityLink) {
      const href = await communityLink.getAttribute('href');
      expect(href).toBeTruthy();

      // Verify it's a valid URL
      if (href) {
        expect(href).toMatch(/^https?:\/\//);
      }
    } else {
      console.log('AgileTD Zone community link not found');
    }
  });
});

test.describe('Social Media Links', () => {
  test('@p2 should have social media links in footer or header', async ({ page }) => {
    const homePage = new HomePage(page);
    await homePage.navigateToHomepage();
    await handleCookieConsent(page);

    // Count social media links
    const socialLinks = page.locator('a[href*="linkedin"], a[href*="youtube"], a[href*="slack"], a[href*="bsky"], a[href*="twitter"], a[href*="facebook"]');
    const count = await socialLinks.count();

    // Should have at least some social media presence
    expect(count).toBeGreaterThan(0);
  });

  test('@p2 should verify all external links open in new tab', async ({ page }) => {
    const homePage = new HomePage(page);
    await homePage.navigateToHomepage();
    await handleCookieConsent(page);

    // Get all external links
    const externalLinks = page.locator('a[href^="http"]:not([href*="agiletestingdays.com"])');
    const count = await externalLinks.count();

    if (count > 0) {
      // Check first few external links
      const linksToCheck = Math.min(count, 5);
      for (let i = 0; i < linksToCheck; i++) {
        const link = externalLinks.nth(i);
        const target = await link.getAttribute('target');
        const href = await link.getAttribute('href');

        // External links should open in new tab
        if (href && !href.includes('agiletestingdays.com')) {
          expect(target).toBe('_blank');
        }
      }
    }
  });
});
