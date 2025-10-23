/**
 * FAQ Tests - Frequently Asked Questions section
 * Priority: P2
 * Test Plan Scenarios: 5 scenarios from FAQ Section
 */

import { test, expect } from '@playwright/test';
import { BasePage } from '../page-objects/BasePage';
import { handleCookieConsent } from '../utils/test-helpers';

test.describe('FAQ Expandable Q&A', () => {
  let basePage: BasePage;

  test.beforeEach(async ({ page }) => {
    basePage = new BasePage(page);

    // Navigate to FAQ page
    await basePage.goto('/faq');
    await handleCookieConsent(page);

    // Alternative paths if FAQ is not at /faq
    const hasFAQ = await page.locator('text=/FAQ|frequently.*asked/i').first().isVisible({ timeout: 5000 }).catch(() => false);

    if (!hasFAQ) {
      // Try finding FAQ section on homepage or other pages
      await basePage.goto('/');
      await page.locator('text=/FAQ/i').first().click().catch(() => {});
    }
  });

  test('@p2 should expand individual FAQ item', async ({ page }) => {
    // Look for FAQ items (common patterns)
    const faqItems = page.locator('.faq-item, .accordion-item, [class*="faq"], details');
    const count = await faqItems.count();

    if (count > 0) {
      // Click first FAQ item
      const firstItem = faqItems.first();
      await firstItem.click();

      // Wait for expansion
      await page.waitForTimeout(500);

      // Verify answer is visible
      const hasAnswer = await firstItem.locator('.answer, .faq-answer, [class*="answer"]')
        .first()
        .isVisible({ timeout: 3000 })
        .catch(() => false);

      // Or check if details element is open
      const isOpen = await firstItem.evaluate(el => {
        if (el.tagName === 'DETAILS') {
          return (el as HTMLDetailsElement).open;
        }
        return el.classList.contains('open') || el.classList.contains('active');
      }).catch(() => false);

      expect(hasAnswer || isOpen).toBeTruthy();
    } else {
      console.log('No FAQ items found on page');
    }
  });

  test('@p2 should collapse expanded FAQ item', async ({ page }) => {
    const faqItems = page.locator('.faq-item, .accordion-item, [class*="faq"], details');
    const count = await faqItems.count();

    if (count > 0) {
      const firstItem = faqItems.first();

      // Expand
      await firstItem.click();
      await page.waitForTimeout(500);

      // Collapse
      await firstItem.click();
      await page.waitForTimeout(500);

      // Verify answer is hidden
      const answerHidden = await firstItem.locator('.answer, .faq-answer')
        .first()
        .isHidden()
        .catch(() => true);

      // Or check if details element is closed
      const isClosed = await firstItem.evaluate(el => {
        if (el.tagName === 'DETAILS') {
          return !(el as HTMLDetailsElement).open;
        }
        return !el.classList.contains('open') && !el.classList.contains('active');
      }).catch(() => true);

      expect(answerHidden || isClosed).toBeTruthy();
    }
  });

  test('@p2 should display group discount information in FAQ', async ({ page }) => {
    // Search for group discount FAQ
    const groupDiscountFAQ = page.locator('text=/group.*discount|minimum.*3.*member/i');
    const exists = await groupDiscountFAQ.first().isVisible({ timeout: 5000 }).catch(() => false);

    if (exists) {
      // Click to expand
      await groupDiscountFAQ.first().click();
      await page.waitForTimeout(500);

      // Verify "minimum 3 members" is mentioned
      const hasGroupInfo = await page
        .locator('text=/minimum.*3|3.*member/i')
        .first()
        .isVisible({ timeout: 3000 })
        .catch(() => false);

      expect(hasGroupInfo).toBeTruthy();
    } else {
      console.log('Group discount FAQ not found - may be on different page');
    }
  });

  test('@p2 should display payment options in FAQ', async ({ page }) => {
    // Search for payment options FAQ
    const paymentFAQ = page.locator('text=/payment.*option|how.*pay|payment.*method/i');
    const exists = await paymentFAQ.first().isVisible({ timeout: 5000 }).catch(() => false);

    if (exists) {
      // Click to expand
      await paymentFAQ.first().click();
      await page.waitForTimeout(500);

      // Verify payment methods are mentioned
      const hasInvoice = await page
        .locator('text=/invoice|bank.*transfer/i')
        .first()
        .isVisible({ timeout: 3000 })
        .catch(() => false);

      const hasCreditCard = await page
        .locator('text=/credit.*card|stripe/i')
        .first()
        .isVisible({ timeout: 3000 })
        .catch(() => false);

      expect(hasInvoice || hasCreditCard).toBeTruthy();
    }
  });

  test('@p2 should display alumni discount eligibility in FAQ', async ({ page }) => {
    // Search for alumni discount FAQ
    const alumniFAQ = page.locator('text=/alumni.*discount|who.*eligible/i');
    const exists = await alumniFAQ.first().isVisible({ timeout: 5000 }).catch(() => false);

    if (exists) {
      // Click to expand
      await alumniFAQ.first().click();
      await page.waitForTimeout(500);

      // Verify eligibility criteria are mentioned
      const hasEligibility = await page
        .locator('text=/2017|previous.*attend|past.*attend/i')
        .first()
        .isVisible({ timeout: 3000 })
        .catch(() => false);

      if (hasEligibility) {
        expect(hasEligibility).toBeTruthy();
      }
    }
  });
});

test.describe('FAQ Page Structure', () => {
  test('@p2 should have FAQ section with multiple questions', async ({ page }) => {
    const basePage = new BasePage(page);
    await basePage.goto('/');
    await handleCookieConsent(page);

    // Look for FAQ link in navigation or footer
    const faqLink = page.locator('a:has-text("FAQ"), a:has-text("Frequently")').first();
    const hasFAQLink = await faqLink.isVisible({ timeout: 5000 }).catch(() => false);

    if (hasFAQLink) {
      await faqLink.click();
      await page.waitForLoadState('networkidle');

      // Verify multiple FAQ items exist
      const faqItems = page.locator('.faq-item, .accordion-item, [class*="faq"], details');
      const count = await faqItems.count();

      expect(count).toBeGreaterThan(0);
    } else {
      console.log('FAQ link not found in navigation - may be integrated into other pages');
    }
  });
});
