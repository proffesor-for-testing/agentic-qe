/**
 * Stealth Browser Client Types
 *
 * Configuration for Patchright-based stealth browser automation.
 * Patchright is a drop-in Playwright replacement that avoids CDP detection.
 *
 * @module integrations/browser/stealth/stealth-types
 */

import type { ResourceBlockingConfig, ResourceBlockingPreset } from '../resource-blocking';

// ============================================================================
// Stealth Configuration
// ============================================================================

/**
 * Configuration for the stealth browser client
 */
export interface StealthBrowserConfig {
  /** Use persistent context for maximum stealth (default: true) */
  persistentContext: boolean;
  /** User data directory for persistent context */
  userDataDir?: string;
  /** Resource blocking configuration or preset name */
  resourceBlocking?: ResourceBlockingConfig | ResourceBlockingPreset;
  /** Wait seconds for Cloudflare challenge resolution (0 = disabled) */
  cloudflareWaitSeconds: number;
  /** Wait seconds for Akamai challenge resolution (0 = disabled) */
  akamaiWaitSeconds: number;
  /** Custom user agent string */
  userAgent?: string;
  /** Proxy configuration */
  proxy?: {
    server: string;
    username?: string;
    password?: string;
  };
}

/**
 * Default stealth browser configuration
 */
export const DEFAULT_STEALTH_CONFIG: StealthBrowserConfig = {
  persistentContext: true,
  cloudflareWaitSeconds: 0,
  akamaiWaitSeconds: 0,
  resourceBlocking: 'functional',
};
