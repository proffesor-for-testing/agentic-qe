/**
 * Cookie Banner Dismissal - Shared Selectors
 *
 * Common cookie consent banner selectors used across browser tiers.
 * Used by fetch-content.cjs and WebContentFetcher.
 *
 * @module integrations/browser/cookie-dismissal
 */

/**
 * CSS selectors for common cookie consent "Accept" buttons.
 * Ordered from most specific to most generic.
 */
export const COOKIE_BANNER_SELECTORS: readonly string[] = [
  '[data-testid="consent-accept-all"]',
  '#onetrust-accept-btn-handler',
  'button[id*="accept"]',
  '[class*="cookie"] button[class*="accept"]',
  '[class*="cookie"] button',
  '[aria-label*="Accept"]',
  'button:has-text("Accept All")',
  'button:has-text("Accept Cookies")',
  'button:has-text("Accept")',
  'button:has-text("I agree")',
] as const;
