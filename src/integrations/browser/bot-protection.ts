/**
 * Bot Protection Detection - Shared Constants
 *
 * Challenge page title patterns for detecting bot protection systems.
 * Used by StealthBrowserClient and WebContentFetcher.
 *
 * @module integrations/browser/bot-protection
 */

/**
 * Title patterns that indicate a bot protection challenge page.
 * Covers Cloudflare, Akamai, and DataDome.
 */
export const BOT_CHALLENGE_PATTERNS: readonly string[] = [
  // Cloudflare
  'Just a moment',
  'Checking your browser',
  'Attention Required',
  // Akamai
  'Access Denied',
  'Before we continue',
  'Please verify you are a human',
  'Request unsuccessful',
  // DataDome
  'Pardon Our Interruption',
  'Human Verification',
] as const;

/**
 * Check if a page title indicates a bot protection challenge.
 */
export function isBotChallenge(title: string): boolean {
  return BOT_CHALLENGE_PATTERNS.some(pattern => title.includes(pattern));
}
