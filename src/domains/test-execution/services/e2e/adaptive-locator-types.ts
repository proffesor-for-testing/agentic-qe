/**
 * Adaptive Locator Types
 *
 * Inspired by Scrapling's similarity-based element matching.
 * When a CSS/XPath selector fails, falls back to fingerprint-based
 * element matching to reduce E2E flakiness from UI changes.
 *
 * @module test-execution/services/e2e/adaptive-locator-types
 */

// ============================================================================
// Element Fingerprint
// ============================================================================

/**
 * Captured fingerprint of a DOM element for similarity matching.
 * Stored after successful interactions to enable fallback matching.
 */
export interface ElementFingerprint {
  /** HTML tag name (e.g., 'button', 'input', 'a') */
  tagName: string;
  /** CSS classes on the element */
  classes: string[];
  /** WAI-ARIA role */
  ariaRole?: string;
  /** WAI-ARIA label */
  ariaLabel?: string;
  /** Visible text content (trimmed, max 200 chars) */
  textContent?: string;
  /** Key attributes for matching */
  attributes: {
    id?: string;
    name?: string;
    'data-testid'?: string;
    type?: string;
    placeholder?: string;
    href?: string;
  };
  /** Structural position hints */
  positionHints: {
    parentTag?: string;
    childIndex: number;
    siblingCount: number;
  };
  /** Number of times this fingerprint matched */
  matchCount: number;
  /** Last time this fingerprint was matched (ISO string) */
  lastMatchedAt: string;
}

// ============================================================================
// Configuration
// ============================================================================

/**
 * Configuration for the adaptive locator service
 */
export interface AdaptiveLocatorConfig {
  /** Enable adaptive locator fallback */
  enabled: boolean;
  /** Minimum similarity score (0-1) to accept a fingerprint match */
  similarityThreshold: number;
  /** Maximum fingerprints to store per page */
  maxFingerprintsPerPage: number;
  /** Memory namespace for fingerprint storage */
  namespace: string;
  /** Fallback chain order */
  fallbackChain: Array<'text' | 'aria' | 'fingerprint'>;
}

/**
 * Default adaptive locator configuration
 */
export const DEFAULT_ADAPTIVE_LOCATOR_CONFIG: AdaptiveLocatorConfig = {
  enabled: true,
  similarityThreshold: 0.6,
  maxFingerprintsPerPage: 200,
  namespace: 'aqe/adaptive-locators',
  fallbackChain: ['text', 'aria', 'fingerprint'],
};

// ============================================================================
// Resolution Result
// ============================================================================

/**
 * Method used to resolve an element target
 */
export type LocatorResolutionMethod = 'primary' | 'text' | 'aria' | 'fingerprint';

/**
 * Result of adaptive locator resolution
 */
export interface LocatorResolutionResult {
  /** The resolved element target selector */
  resolvedSelector: string;
  /** How the element was found */
  method: LocatorResolutionMethod;
  /** Similarity score (1.0 for primary, 0-1 for fallbacks) */
  similarityScore: number;
  /** Whether the fingerprint database was updated */
  fingerprintUpdated: boolean;
}
