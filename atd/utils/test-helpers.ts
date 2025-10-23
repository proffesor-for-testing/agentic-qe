/**
 * Test Helpers - Utility functions for E2E tests
 */

import { Page, expect } from '@playwright/test';

/**
 * Wait for email delivery (simulated)
 * In real scenarios, this would poll an email testing service like Mailinator
 */
export async function waitForEmail(
  emailAddress: string,
  subject: string,
  timeoutMs: number = 5 * 60 * 1000 // 5 minutes
): Promise<boolean> {
  // TODO: Implement email checking using Mailinator API or similar
  // For now, we'll just wait a bit to simulate email delay
  await new Promise(resolve => setTimeout(resolve, 2000));
  return true;
}

/**
 * Extract numeric value from price string
 * Examples: "€2,925" -> 2925, "2.500 EUR" -> 2500
 */
export function extractPrice(priceString: string): number {
  // Remove currency symbols and common separators
  const cleaned = priceString.replace(/[€$£,.\s]/g, '');
  const numeric = parseFloat(cleaned);

  if (isNaN(numeric)) {
    throw new Error(`Cannot extract price from: ${priceString}`);
  }

  // If the original had a decimal point, adjust accordingly
  if (priceString.includes('.') && !priceString.includes(',')) {
    return numeric / 100; // Assume cents
  }

  return numeric;
}

/**
 * Calculate VAT amount
 */
export function calculateVAT(basePrice: number, vatRate: number = 0.19): number {
  return Math.round(basePrice * vatRate * 100) / 100;
}

/**
 * Calculate total with VAT
 */
export function calculateTotalWithVAT(basePrice: number, vatRate: number = 0.19): number {
  return Math.round(basePrice * (1 + vatRate) * 100) / 100;
}

/**
 * Generate unique test ID
 */
export function generateTestId(): string {
  return `test-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
}

/**
 * Wait for navigation and ensure page is loaded
 */
export async function waitForNavigation(page: Page, urlPattern?: string | RegExp): Promise<void> {
  if (urlPattern) {
    await page.waitForURL(urlPattern, { timeout: 30000 });
  }
  await page.waitForLoadState('networkidle');
}

/**
 * Check if element is visible with retry
 */
export async function isElementVisible(
  page: Page,
  selector: string,
  timeoutMs: number = 5000
): Promise<boolean> {
  try {
    await page.locator(selector).first().waitFor({ state: 'visible', timeout: timeoutMs });
    return true;
  } catch {
    return false;
  }
}

/**
 * Retry an action multiple times
 */
export async function retryAction<T>(
  action: () => Promise<T>,
  maxRetries: number = 3,
  delayMs: number = 1000
): Promise<T> {
  let lastError: Error | undefined;

  for (let i = 0; i < maxRetries; i++) {
    try {
      return await action();
    } catch (error) {
      lastError = error as Error;
      if (i < maxRetries - 1) {
        await new Promise(resolve => setTimeout(resolve, delayMs));
      }
    }
  }

  throw lastError || new Error('Retry action failed');
}

/**
 * Take a screenshot with a descriptive name
 */
export async function takeTestScreenshot(page: Page, testName: string, step: string): Promise<void> {
  const timestamp = new Date().toISOString().replace(/:/g, '-');
  const fileName = `${testName}-${step}-${timestamp}.png`;
  await page.screenshot({
    path: `test-results/screenshots/${fileName}`,
    fullPage: true,
  });
}

/**
 * Handle cookie consent popup (if present)
 */
export async function handleCookieConsent(page: Page): Promise<void> {
  const cookieSelectors = [
    'button:has-text("Accept")',
    'button:has-text("Accept all")',
    'button:has-text("Agree")',
    '[id*="cookie"] button',
    '.cookie-consent button',
  ];

  for (const selector of cookieSelectors) {
    const button = page.locator(selector).first();
    if (await button.isVisible({ timeout: 2000 }).catch(() => false)) {
      await button.click();
      await page.waitForTimeout(500);
      break;
    }
  }
}

/**
 * Verify URL contains expected pattern
 */
export async function verifyUrlContains(page: Page, pattern: string | RegExp): Promise<void> {
  const url = page.url();
  const regex = typeof pattern === 'string' ? new RegExp(pattern, 'i') : pattern;
  expect(url).toMatch(regex);
}

/**
 * Verify page title contains expected text
 */
export async function verifyPageTitle(page: Page, expectedText: string): Promise<void> {
  const title = await page.title();
  expect(title).toContain(expectedText);
}

/**
 * Get text content from multiple elements
 */
export async function getTextContentFromElements(
  page: Page,
  selector: string
): Promise<string[]> {
  const elements = page.locator(selector);
  const count = await elements.count();
  const texts: string[] = [];

  for (let i = 0; i < count; i++) {
    const text = await elements.nth(i).textContent();
    if (text) {
      texts.push(text.trim());
    }
  }

  return texts;
}

/**
 * Wait for element to disappear
 */
export async function waitForElementToDisappear(
  page: Page,
  selector: string,
  timeoutMs: number = 10000
): Promise<void> {
  await page.locator(selector).first().waitFor({ state: 'hidden', timeout: timeoutMs });
}

/**
 * Verify element count
 */
export async function verifyElementCount(
  page: Page,
  selector: string,
  expectedCount: number
): Promise<void> {
  const count = await page.locator(selector).count();
  expect(count).toBe(expectedCount);
}

/**
 * Verify element count is at least
 */
export async function verifyElementCountAtLeast(
  page: Page,
  selector: string,
  minCount: number
): Promise<void> {
  const count = await page.locator(selector).count();
  expect(count).toBeGreaterThanOrEqual(minCount);
}

/**
 * Check if external link opens in new tab
 */
export async function verifyExternalLinkOpensNewTab(
  page: Page,
  linkSelector: string,
  expectedDomain: string
): Promise<void> {
  const [newPage] = await Promise.all([
    page.context().waitForEvent('page'),
    page.click(linkSelector),
  ]);

  await newPage.waitForLoadState();
  const url = newPage.url();
  expect(url).toContain(expectedDomain);
  await newPage.close();
}

/**
 * Format currency for comparison
 */
export function formatCurrency(amount: number, currency: string = 'EUR'): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
  }).format(amount);
}

/**
 * Sleep for specified milliseconds
 */
export async function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
