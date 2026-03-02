/**
 * Adaptive Locator Service
 *
 * Inspired by Scrapling's similarity-based element matching.
 * When a primary selector fails, falls back through text, ARIA, and
 * fingerprint similarity matching to find the intended element.
 *
 * @module test-execution/services/e2e/adaptive-locator-service
 */

import type { IBrowserClient, ElementTarget } from '@integrations/browser';
import type {
  ElementFingerprint,
  AdaptiveLocatorConfig,
  LocatorResolutionResult,
  LocatorResolutionMethod,
} from './adaptive-locator-types';
import { DEFAULT_ADAPTIVE_LOCATOR_CONFIG } from './adaptive-locator-types';

// ============================================================================
// Fingerprint Capture Script (runs in browser context)
// ============================================================================

/**
 * JavaScript to evaluate in the browser to capture an element fingerprint.
 * Returns a serialisable object matching ElementFingerprint.
 */
function buildCaptureScript(cssSelector: string): string {
  return `
    (() => {
      const el = document.querySelector(${JSON.stringify(cssSelector)});
      if (!el) return null;
      const parent = el.parentElement;
      const siblings = parent ? parent.children : [];
      let childIndex = 0;
      for (let i = 0; i < siblings.length; i++) {
        if (siblings[i] === el) { childIndex = i; break; }
      }
      return {
        tagName: el.tagName.toLowerCase(),
        classes: Array.from(el.classList),
        ariaRole: el.getAttribute('role') || undefined,
        ariaLabel: el.getAttribute('aria-label') || undefined,
        textContent: (el.textContent || '').trim().slice(0, 200) || undefined,
        attributes: {
          id: el.id || undefined,
          name: el.getAttribute('name') || undefined,
          'data-testid': el.getAttribute('data-testid') || undefined,
          type: el.getAttribute('type') || undefined,
          placeholder: el.getAttribute('placeholder') || undefined,
          href: el.getAttribute('href') || undefined,
        },
        positionHints: {
          parentTag: parent ? parent.tagName.toLowerCase() : undefined,
          childIndex,
          siblingCount: siblings.length,
        },
        matchCount: 0,
        lastMatchedAt: new Date().toISOString(),
      };
    })()
  `;
}

/**
 * JavaScript to find candidate elements on the page and return their fingerprints.
 */
function buildCandidatesScript(): string {
  return `
    (() => {
      const interactiveTags = 'a,button,input,select,textarea,[role],[data-testid],[aria-label]';
      const elements = document.querySelectorAll(interactiveTags);
      const results = [];
      for (let i = 0; i < Math.min(elements.length, 300); i++) {
        const el = elements[i];
        const parent = el.parentElement;
        const siblings = parent ? parent.children : [];
        let childIndex = 0;
        for (let j = 0; j < siblings.length; j++) {
          if (siblings[j] === el) { childIndex = j; break; }
        }
        results.push({
          tagName: el.tagName.toLowerCase(),
          classes: Array.from(el.classList),
          ariaRole: el.getAttribute('role') || undefined,
          ariaLabel: el.getAttribute('aria-label') || undefined,
          textContent: (el.textContent || '').trim().slice(0, 200) || undefined,
          attributes: {
            id: el.id || undefined,
            name: el.getAttribute('name') || undefined,
            'data-testid': el.getAttribute('data-testid') || undefined,
            type: el.getAttribute('type') || undefined,
            placeholder: el.getAttribute('placeholder') || undefined,
            href: el.getAttribute('href') || undefined,
          },
          positionHints: {
            parentTag: parent ? parent.tagName.toLowerCase() : undefined,
            childIndex,
            siblingCount: siblings.length,
          },
          // Build a unique-enough CSS selector for this element
          selector: buildSelector(el),
        });
      }

      function buildSelector(el) {
        if (el.id) return '#' + CSS.escape(el.id);
        if (el.getAttribute('data-testid')) return '[data-testid="' + el.getAttribute('data-testid') + '"]';
        if (el.getAttribute('name')) return el.tagName.toLowerCase() + '[name="' + el.getAttribute('name') + '"]';
        // Fallback: tag + nth-child
        const parent = el.parentElement;
        if (!parent) return el.tagName.toLowerCase();
        const siblings = Array.from(parent.children).filter(s => s.tagName === el.tagName);
        const idx = siblings.indexOf(el) + 1;
        return el.tagName.toLowerCase() + ':nth-of-type(' + idx + ')';
      }

      return results;
    })()
  `;
}

// ============================================================================
// Similarity Computation
// ============================================================================

/** Weights for similarity scoring */
const WEIGHTS = {
  tagName: 0.20,
  ariaRole: 0.15,
  classes: 0.15,
  textContent: 0.20,
  attributes: 0.15,
  positionHints: 0.15,
} as const;

/**
 * Compute Jaccard similarity between two string arrays
 */
function jaccardSimilarity(a: string[], b: string[]): number {
  if (a.length === 0 && b.length === 0) return 1;
  const setA = new Set(a);
  const setB = new Set(b);
  let intersection = 0;
  for (const item of setA) {
    if (setB.has(item)) intersection++;
  }
  const union = new Set([...setA, ...setB]).size;
  return union === 0 ? 0 : intersection / union;
}

/**
 * Normalised string similarity (simple containment-based)
 */
function textSimilarity(a?: string, b?: string): number {
  if (!a && !b) return 1;
  if (!a || !b) return 0;
  const la = a.toLowerCase();
  const lb = b.toLowerCase();
  if (la === lb) return 1;
  if (la.includes(lb) || lb.includes(la)) return 0.8;
  // Character overlap ratio
  const setA = new Set(la);
  const setB = new Set(lb);
  let common = 0;
  for (const c of setA) {
    if (setB.has(c)) common++;
  }
  const total = new Set([...setA, ...setB]).size;
  return total === 0 ? 0 : common / total * 0.6;
}

/**
 * Compute weighted similarity between a stored fingerprint and a candidate element
 */
export function computeSimilarity(
  stored: ElementFingerprint,
  candidate: Omit<ElementFingerprint, 'matchCount' | 'lastMatchedAt'>
): number {
  let score = 0;

  // Tag name (exact match)
  score += (stored.tagName === candidate.tagName ? 1 : 0) * WEIGHTS.tagName;

  // ARIA role
  if (stored.ariaRole || candidate.ariaRole) {
    score += (stored.ariaRole === candidate.ariaRole ? 1 : 0) * WEIGHTS.ariaRole;
  } else {
    score += WEIGHTS.ariaRole; // both undefined = match
  }

  // Classes (Jaccard)
  score += jaccardSimilarity(stored.classes, candidate.classes) * WEIGHTS.classes;

  // Text content
  score += textSimilarity(stored.textContent, candidate.textContent) * WEIGHTS.textContent;

  // Attributes overlap
  const storedAttrs = Object.entries(stored.attributes).filter(([, v]) => v);
  const candidateAttrs = Object.entries(candidate.attributes).filter(([, v]) => v);
  if (storedAttrs.length === 0 && candidateAttrs.length === 0) {
    score += WEIGHTS.attributes;
  } else {
    let matches = 0;
    for (const [key, val] of storedAttrs) {
      const candidateVal = candidate.attributes[key as keyof ElementFingerprint['attributes']];
      if (candidateVal === val) matches++;
    }
    const total = Math.max(storedAttrs.length, candidateAttrs.length, 1);
    score += (matches / total) * WEIGHTS.attributes;
  }

  // Position hints
  const posScore = computePositionScore(stored.positionHints, candidate.positionHints);
  score += posScore * WEIGHTS.positionHints;

  return Math.min(1, Math.max(0, score));
}

function computePositionScore(
  a: ElementFingerprint['positionHints'],
  b: ElementFingerprint['positionHints']
): number {
  let total = 0;
  let matches = 0;

  // Parent tag
  total++;
  if (a.parentTag === b.parentTag) matches++;

  // Child index proximity
  total++;
  const indexDiff = Math.abs(a.childIndex - b.childIndex);
  matches += Math.max(0, 1 - indexDiff / 10);

  // Sibling count proximity
  total++;
  const sibDiff = Math.abs(a.siblingCount - b.siblingCount);
  matches += Math.max(0, 1 - sibDiff / 10);

  return matches / total;
}

// ============================================================================
// In-Memory Fingerprint Store (lightweight, no DB dependency)
// ============================================================================

/**
 * Simple in-memory fingerprint store keyed by `pageUrl::selector`
 */
export class FingerprintStore {
  private readonly store = new Map<string, ElementFingerprint>();
  private readonly maxPerPage: number;

  constructor(maxPerPage = 200) {
    this.maxPerPage = maxPerPage;
  }

  private key(pageUrl: string, selector: string): string {
    return `${pageUrl}::${selector}`;
  }

  get(pageUrl: string, selector: string): ElementFingerprint | undefined {
    return this.store.get(this.key(pageUrl, selector));
  }

  set(pageUrl: string, selector: string, fp: ElementFingerprint): void {
    const k = this.key(pageUrl, selector);
    this.store.set(k, fp);

    // Enforce per-page limit by evicting oldest entries
    const prefix = `${pageUrl}::`;
    const pageKeys = [...this.store.keys()].filter((key) => key.startsWith(prefix));
    if (pageKeys.length > this.maxPerPage) {
      const toRemove = pageKeys.length - this.maxPerPage;
      for (let i = 0; i < toRemove; i++) {
        this.store.delete(pageKeys[i]);
      }
    }
  }

  size(): number {
    return this.store.size;
  }

  clear(): void {
    this.store.clear();
  }
}

// ============================================================================
// Adaptive Locator Service
// ============================================================================

/**
 * Adaptive Locator Service
 *
 * Provides fallback element resolution when primary selectors fail.
 * Maintains a fingerprint database of previously-matched elements
 * and uses weighted similarity to find the best match.
 */
export class AdaptiveLocatorService {
  private readonly config: AdaptiveLocatorConfig;
  private readonly fingerprintStore: FingerprintStore;

  constructor(config?: Partial<AdaptiveLocatorConfig>) {
    this.config = { ...DEFAULT_ADAPTIVE_LOCATOR_CONFIG, ...config };
    this.fingerprintStore = new FingerprintStore(this.config.maxFingerprintsPerPage);
  }

  /**
   * Capture and store a fingerprint for a successfully-interacted element
   */
  async captureFingerprint(
    selector: string,
    client: IBrowserClient,
    pageUrl: string
  ): Promise<ElementFingerprint | null> {
    if (!this.config.enabled) return null;

    try {
      const cssSelector = this.toCssForCapture(selector);
      if (!cssSelector) return null;

      const result = await client.evaluate<ElementFingerprint | null>(
        buildCaptureScript(cssSelector)
      );

      if (!result.success || !result.value) return null;

      const fingerprint = result.value;
      fingerprint.matchCount = (this.fingerprintStore.get(pageUrl, selector)?.matchCount ?? 0) + 1;
      fingerprint.lastMatchedAt = new Date().toISOString();

      this.fingerprintStore.set(pageUrl, selector, fingerprint);
      return fingerprint;
    } catch {
      return null;
    }
  }

  /**
   * Resolve an element target with adaptive fallback chain.
   *
   * 1. Try primary selector
   * 2. Text-based match
   * 3. ARIA-based match
   * 4. Fingerprint similarity matching
   */
  async resolveWithFallback(
    selector: string,
    client: IBrowserClient,
    pageUrl: string
  ): Promise<LocatorResolutionResult | null> {
    if (!this.config.enabled) return null;

    const storedFingerprint = this.fingerprintStore.get(pageUrl, selector);
    if (!storedFingerprint) return null;

    for (const method of this.config.fallbackChain) {
      const result = await this.tryFallbackMethod(method, storedFingerprint, client);
      if (result) return result;
    }

    return null;
  }

  /**
   * Get the fingerprint store size (for diagnostics)
   */
  getStoreSize(): number {
    return this.fingerprintStore.size();
  }

  /**
   * Clear all stored fingerprints
   */
  clearFingerprints(): void {
    this.fingerprintStore.clear();
  }

  // ==========================================================================
  // Private Helpers
  // ==========================================================================

  private async tryFallbackMethod(
    method: 'text' | 'aria' | 'fingerprint',
    stored: ElementFingerprint,
    client: IBrowserClient
  ): Promise<LocatorResolutionResult | null> {
    switch (method) {
      case 'text':
        return this.tryTextMatch(stored, client);
      case 'aria':
        return this.tryAriaMatch(stored, client);
      case 'fingerprint':
        return this.tryFingerprintMatch(stored, client);
      default:
        return null;
    }
  }

  private async tryTextMatch(
    stored: ElementFingerprint,
    client: IBrowserClient
  ): Promise<LocatorResolutionResult | null> {
    if (!stored.textContent) return null;

    const safeText = JSON.stringify(stored.textContent);
    const script = `
      (() => {
        const target = ${safeText};
        const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_ELEMENT);
        while (walker.nextNode()) {
          const el = walker.currentNode;
          const text = (el.textContent || '').trim().slice(0, 200);
          if (text === target) {
            if (el.id) return '#' + CSS.escape(el.id);
            if (el.getAttribute('data-testid')) return '[data-testid="' + el.getAttribute('data-testid') + '"]';
            return null;
          }
        }
        return null;
      })()
    `;

    try {
      const result = await client.evaluate<string | null>(script);
      if (result.success && result.value) {
        return {
          resolvedSelector: result.value,
          method: 'text' as LocatorResolutionMethod,
          similarityScore: 0.9,
          fingerprintUpdated: false,
        };
      }
    } catch {
      // continue to next method
    }
    return null;
  }

  private async tryAriaMatch(
    stored: ElementFingerprint,
    client: IBrowserClient
  ): Promise<LocatorResolutionResult | null> {
    if (!stored.ariaRole && !stored.ariaLabel) return null;

    let ariaSelector = '';
    if (stored.ariaRole && stored.ariaLabel) {
      ariaSelector = `[role="${stored.ariaRole}"][aria-label="${stored.ariaLabel}"]`;
    } else if (stored.ariaLabel) {
      ariaSelector = `[aria-label="${stored.ariaLabel}"]`;
    } else if (stored.ariaRole) {
      ariaSelector = `[role="${stored.ariaRole}"]`;
    }

    if (!ariaSelector) return null;

    try {
      const checkScript = `!!document.querySelector(${JSON.stringify(ariaSelector)})`;
      const result = await client.evaluate<boolean>(checkScript);
      if (result.success && result.value) {
        return {
          resolvedSelector: ariaSelector,
          method: 'aria' as LocatorResolutionMethod,
          similarityScore: 0.85,
          fingerprintUpdated: false,
        };
      }
    } catch {
      // continue to next method
    }
    return null;
  }

  private async tryFingerprintMatch(
    stored: ElementFingerprint,
    client: IBrowserClient
  ): Promise<LocatorResolutionResult | null> {
    try {
      const result = await client.evaluate<
        Array<Omit<ElementFingerprint, 'matchCount' | 'lastMatchedAt'> & { selector: string }>
      >(buildCandidatesScript());

      if (!result.success || !result.value?.length) return null;

      let bestScore = 0;
      let bestSelector = '';

      for (const candidate of result.value) {
        const score = computeSimilarity(stored, candidate);
        if (score > bestScore) {
          bestScore = score;
          bestSelector = candidate.selector;
        }
      }

      if (bestScore >= this.config.similarityThreshold && bestSelector) {
        return {
          resolvedSelector: bestSelector,
          method: 'fingerprint' as LocatorResolutionMethod,
          similarityScore: bestScore,
          fingerprintUpdated: false,
        };
      }
    } catch {
      // fingerprint match failed
    }
    return null;
  }

  /**
   * Convert a selector string to a CSS selector suitable for capture.
   * Returns null for non-CSS selectors that can't be used with querySelector.
   */
  private toCssForCapture(selector: string): string | null {
    if (selector.startsWith('//') || selector.startsWith('xpath=')) return null;
    if (/^@?e\d+$/.test(selector)) return null;
    if (selector.startsWith('text=')) return null;
    return selector;
  }
}
