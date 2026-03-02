/**
 * Resource Blocking for Browser Automation
 *
 * Inspired by Scrapling's resource filtering patterns.
 * Blocks non-essential resources (images, fonts, tracking) during E2E tests
 * to improve page load speed and reduce flakiness.
 *
 * @module integrations/browser/resource-blocking
 */

// ============================================================================
// Types
// ============================================================================

/**
 * Categories of resources that can be blocked
 */
export type ResourceCategory =
  | 'image'
  | 'font'
  | 'media'
  | 'stylesheet'
  | 'tracking'
  | 'advertising'
  | 'websocket';

/**
 * Configuration for resource blocking
 */
export interface ResourceBlockingConfig {
  /** Enable resource blocking */
  enabled: boolean;
  /** Resource categories to block */
  blockedCategories: ResourceCategory[];
  /** URL patterns to always allow (overrides blocked categories) */
  allowPatterns?: string[];
  /** URL patterns to always block (in addition to categories) */
  blockPatterns?: string[];
}

/**
 * Preset names for resource blocking configurations
 */
export type ResourceBlockingPreset = 'functional' | 'visual' | 'performance';

// ============================================================================
// Known Tracker / Ad Domains
// ============================================================================

const TRACKING_DOMAINS: ReadonlySet<string> = new Set([
  'google-analytics.com',
  'googletagmanager.com',
  'analytics.google.com',
  'hotjar.com',
  'fullstory.com',
  'segment.io',
  'segment.com',
  'mixpanel.com',
  'heap.io',
  'heapanalytics.com',
  'amplitude.com',
  'mouseflow.com',
  'crazyegg.com',
  'optimizely.com',
  'newrelic.com',
  'nr-data.net',
  'sentry.io',
  'bugsnag.com',
  'logrocket.com',
  'clarity.ms',
  'facebook.net',
  'connect.facebook.net',
]);

const ADVERTISING_DOMAINS: ReadonlySet<string> = new Set([
  'doubleclick.net',
  'googlesyndication.com',
  'googleadservices.com',
  'google-analytics.com',
  'adservice.google.com',
  'pagead2.googlesyndication.com',
  'ads.twitter.com',
  'ads-api.twitter.com',
  'adsserver.com',
  'adnxs.com',
  'amazon-adsystem.com',
  'criteo.com',
  'moatads.com',
  'outbrain.com',
  'taboola.com',
  'bidswitch.net',
  'rubiconproject.com',
]);

// ============================================================================
// Resource Type Mapping
// ============================================================================

/**
 * Maps Playwright/CDP resource types to our categories
 */
const RESOURCE_TYPE_TO_CATEGORY: Record<string, ResourceCategory> = {
  image: 'image',
  font: 'font',
  media: 'media',
  stylesheet: 'stylesheet',
  websocket: 'websocket',
};

// ============================================================================
// Presets
// ============================================================================

const PRESETS: Record<ResourceBlockingPreset, ResourceBlockingConfig> = {
  /**
   * Functional preset: block everything non-essential for functional testing.
   * Fastest page loads — only HTML, JS, and XHR/fetch are allowed.
   */
  functional: {
    enabled: true,
    blockedCategories: ['image', 'font', 'media', 'stylesheet', 'tracking', 'advertising'],
  },

  /**
   * Visual preset: block nothing — needed for visual regression testing.
   */
  visual: {
    enabled: false,
    blockedCategories: [],
  },

  /**
   * Performance preset: block heavy resources and tracking only.
   * Keeps stylesheets for layout accuracy but drops images/fonts/media.
   */
  performance: {
    enabled: true,
    blockedCategories: ['image', 'font', 'media', 'tracking', 'advertising'],
  },
};

// ============================================================================
// Core Logic
// ============================================================================

/**
 * Determine if a request should be blocked based on URL, resource type, and config.
 *
 * @param url - The request URL
 * @param resourceType - The CDP/Playwright resource type string (e.g., 'image', 'script', 'font')
 * @param config - The resource blocking configuration
 * @returns true if the request should be blocked
 */
export function shouldBlockRequest(
  url: string,
  resourceType: string,
  config: ResourceBlockingConfig
): boolean {
  if (!config.enabled) {
    return false;
  }

  // Check allow patterns first (highest priority)
  if (config.allowPatterns?.length) {
    for (const pattern of config.allowPatterns) {
      if (urlMatchesPattern(url, pattern)) {
        return false;
      }
    }
  }

  // Check explicit block patterns
  if (config.blockPatterns?.length) {
    for (const pattern of config.blockPatterns) {
      if (urlMatchesPattern(url, pattern)) {
        return true;
      }
    }
  }

  // Check resource type against blocked categories
  const category = RESOURCE_TYPE_TO_CATEGORY[resourceType];
  if (category && config.blockedCategories.includes(category)) {
    return true;
  }

  // Check domain-based categories (tracking & advertising)
  if (config.blockedCategories.includes('tracking') && isDomainInSet(url, TRACKING_DOMAINS)) {
    return true;
  }

  if (config.blockedCategories.includes('advertising') && isDomainInSet(url, ADVERTISING_DOMAINS)) {
    return true;
  }

  return false;
}

/**
 * Get a resource blocking preset by name.
 *
 * @param name - Preset name or a ResourceBlockingConfig object (passed through)
 * @returns A ResourceBlockingConfig
 */
export function getResourceBlockingPreset(
  name: ResourceBlockingPreset | ResourceBlockingConfig
): ResourceBlockingConfig {
  if (typeof name === 'object') {
    return name;
  }
  const preset = PRESETS[name];
  if (!preset) {
    return PRESETS.visual; // safe default: block nothing
  }
  // Return a copy to prevent mutation
  return { ...preset, blockedCategories: [...preset.blockedCategories] };
}

// ============================================================================
// Helpers
// ============================================================================

/**
 * Cache of compiled glob patterns to avoid RegExp creation on every request
 */
const patternCache = new Map<string, RegExp>();

/**
 * Check if a URL matches a simple glob pattern (supports * wildcard)
 */
function urlMatchesPattern(url: string, pattern: string): boolean {
  let regex = patternCache.get(pattern);
  if (!regex) {
    const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*');
    regex = new RegExp(escaped, 'i');
    patternCache.set(pattern, regex);
  }
  return regex.test(url);
}

/**
 * Check if a URL's hostname matches any domain in a set
 */
function isDomainInSet(url: string, domains: ReadonlySet<string>): boolean {
  try {
    const hostname = new URL(url).hostname;
    for (const domain of domains) {
      if (hostname === domain || hostname.endsWith(`.${domain}`)) {
        return true;
      }
    }
  } catch {
    // Invalid URL — don't block
  }
  return false;
}
