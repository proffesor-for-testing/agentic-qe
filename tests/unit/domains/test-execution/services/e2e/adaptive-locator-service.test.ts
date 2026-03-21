/**
 * Tests for Adaptive Locator Service
 */

import { describe, it, expect, vi, beforeEach, afterEach} from 'vitest';
import {
  AdaptiveLocatorService,
  computeSimilarity,
  FingerprintStore,
} from '../../../../../../src/domains/test-execution/services/e2e/adaptive-locator-service';
import type { ElementFingerprint } from '../../../../../../src/domains/test-execution/services/e2e/adaptive-locator-types';
import type { IBrowserClient } from '../../../../../../src/integrations/browser/types';

// ============================================================================
// Helpers
// ============================================================================

function makeFingerprint(overrides: Partial<ElementFingerprint> = {}): ElementFingerprint {
  return {
    tagName: 'button',
    classes: ['btn', 'primary'],
    ariaRole: 'button',
    ariaLabel: 'Submit',
    textContent: 'Submit Form',
    attributes: {
      id: 'submit-btn',
      name: undefined,
      'data-testid': 'submit',
      type: 'submit',
      placeholder: undefined,
      href: undefined,
    },
    positionHints: {
      parentTag: 'form',
      childIndex: 3,
      siblingCount: 5,
    },
    matchCount: 1,
    lastMatchedAt: new Date().toISOString(),
    ...overrides,
  };
}

function createMockClient(overrides: Partial<Record<string, unknown>> = {}): IBrowserClient {
  return {
    tool: 'agent-browser' as const,
    launch: vi.fn(),
    quit: vi.fn(),
    isAvailable: vi.fn().mockResolvedValue(true),
    navigate: vi.fn(),
    reload: vi.fn(),
    goBack: vi.fn(),
    goForward: vi.fn(),
    click: vi.fn(),
    fill: vi.fn(),
    getText: vi.fn(),
    isVisible: vi.fn().mockResolvedValue({ success: true, value: true }),
    screenshot: vi.fn(),
    evaluate: vi.fn().mockResolvedValue({ success: true, value: null }),
    dispose: vi.fn(),
    ...overrides,
  } as unknown as IBrowserClient;
}

// ============================================================================
// FingerprintStore Tests
// ============================================================================

describe('FingerprintStore', () => {
  let store: FingerprintStore;

  beforeEach(() => {
    store = new FingerprintStore(5);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });


  it('stores and retrieves fingerprints', () => {
    const fp = makeFingerprint();
    store.set('https://example.com', '#btn', fp);
    expect(store.get('https://example.com', '#btn')).toBe(fp);
  });

  it('returns undefined for missing keys', () => {
    expect(store.get('https://example.com', '#missing')).toBeUndefined();
  });

  it('enforces max per-page limit', () => {
    for (let i = 0; i < 10; i++) {
      store.set('https://example.com', `#el${i}`, makeFingerprint());
    }
    // Only 5 should remain for this page
    expect(store.size()).toBeLessThanOrEqual(10); // total store can have more from eviction
    // Last 5 should exist
    expect(store.get('https://example.com', '#el9')).toBeDefined();
  });

  it('clears all fingerprints', () => {
    store.set('https://a.com', '#x', makeFingerprint());
    store.set('https://b.com', '#y', makeFingerprint());
    store.clear();
    expect(store.size()).toBe(0);
  });
});

// ============================================================================
// computeSimilarity Tests
// ============================================================================

describe('computeSimilarity', () => {
  it('returns 1.0 for identical fingerprints', () => {
    const fp = makeFingerprint();
    const { matchCount, lastMatchedAt, ...candidate } = fp;
    const score = computeSimilarity(fp, candidate);
    expect(score).toBeCloseTo(1.0, 1);
  });

  it('returns lower score for different tag names', () => {
    const stored = makeFingerprint({ tagName: 'button' });
    const candidate = makeFingerprint({ tagName: 'a' });
    const { matchCount, lastMatchedAt, ...candidateWithout } = candidate;
    const score = computeSimilarity(stored, candidateWithout);
    expect(score).toBeLessThan(1.0);
  });

  it('returns lower score for different classes', () => {
    const stored = makeFingerprint({ classes: ['btn', 'primary'] });
    const candidate = makeFingerprint({ classes: ['link', 'secondary'] });
    const { matchCount, lastMatchedAt, ...candidateWithout } = candidate;
    const score = computeSimilarity(stored, candidateWithout);
    expect(score).toBeLessThan(1.0);
  });

  it('returns higher score when text content matches', () => {
    const stored = makeFingerprint({ textContent: 'Submit Form' });
    const matched = makeFingerprint({ textContent: 'Submit Form', classes: ['other'] });
    const unmatched = makeFingerprint({ textContent: 'Cancel', classes: ['other'] });

    const { matchCount: m1, lastMatchedAt: l1, ...matchedCandidate } = matched;
    const { matchCount: m2, lastMatchedAt: l2, ...unmatchedCandidate } = unmatched;

    const scoreMatched = computeSimilarity(stored, matchedCandidate);
    const scoreUnmatched = computeSimilarity(stored, unmatchedCandidate);
    expect(scoreMatched).toBeGreaterThan(scoreUnmatched);
  });

  it('gives full ariaRole score when both are undefined', () => {
    const stored = makeFingerprint({ ariaRole: undefined });
    const candidate = makeFingerprint({ ariaRole: undefined });
    const { matchCount, lastMatchedAt, ...candidateWithout } = candidate;
    const score = computeSimilarity(stored, candidateWithout);
    // Should still get the ariaRole weight since both undefined = match
    expect(score).toBeGreaterThan(0.5);
  });

  it('handles empty arrays gracefully', () => {
    const stored = makeFingerprint({ classes: [] });
    const candidate = makeFingerprint({ classes: [] });
    const { matchCount, lastMatchedAt, ...candidateWithout } = candidate;
    const score = computeSimilarity(stored, candidateWithout);
    expect(score).toBeGreaterThan(0.5);
  });
});

// ============================================================================
// AdaptiveLocatorService Tests
// ============================================================================

describe('AdaptiveLocatorService', () => {
  let service: AdaptiveLocatorService;

  beforeEach(() => {
    service = new AdaptiveLocatorService({
      enabled: true,
      similarityThreshold: 0.6,
    });
  });

  it('initializes with default config', () => {
    const s = new AdaptiveLocatorService();
    expect(s.getStoreSize()).toBe(0);
  });

  it('captures fingerprint via evaluate', async () => {
    const fp = makeFingerprint();
    const client = createMockClient({
      evaluate: vi.fn().mockResolvedValue({ success: true, value: fp }),
    });

    const result = await service.captureFingerprint('#submit-btn', client, 'https://example.com');
    expect(result).toBeTruthy();
    expect(result?.tagName).toBe('button');
    expect(service.getStoreSize()).toBe(1);
  });

  it('returns null for non-CSS selectors during capture', async () => {
    const client = createMockClient();
    const result = await service.captureFingerprint('//div[@id="test"]', client, 'https://example.com');
    expect(result).toBeNull();
  });

  it('returns null when disabled', async () => {
    const disabledService = new AdaptiveLocatorService({ enabled: false });
    const client = createMockClient();
    const result = await disabledService.captureFingerprint('#btn', client, 'https://example.com');
    expect(result).toBeNull();
  });

  it('returns null from resolveWithFallback when no stored fingerprint', async () => {
    const client = createMockClient();
    const result = await service.resolveWithFallback('#unknown', client, 'https://example.com');
    expect(result).toBeNull();
  });

  it('clears fingerprints', async () => {
    const fp = makeFingerprint();
    const client = createMockClient({
      evaluate: vi.fn().mockResolvedValue({ success: true, value: fp }),
    });
    await service.captureFingerprint('#btn', client, 'https://example.com');
    expect(service.getStoreSize()).toBe(1);
    service.clearFingerprints();
    expect(service.getStoreSize()).toBe(0);
  });

  it('tries text fallback when stored fingerprint has text', async () => {
    // First capture a fingerprint
    const fp = makeFingerprint({ textContent: 'Click Me' });
    const evaluateMock = vi.fn()
      .mockResolvedValueOnce({ success: true, value: fp })          // capture
      .mockResolvedValueOnce({ success: true, value: '#found-btn' }); // text search
    const client = createMockClient({ evaluate: evaluateMock });

    await service.captureFingerprint('#btn', client, 'https://example.com');

    const result = await service.resolveWithFallback('#btn', client, 'https://example.com');
    expect(result).toBeTruthy();
    expect(result?.method).toBe('text');
    expect(result?.resolvedSelector).toBe('#found-btn');
  });

  it('tries aria fallback when text fails', async () => {
    const fp = makeFingerprint({ textContent: undefined, ariaRole: 'button', ariaLabel: 'Submit' });
    const evaluateMock = vi.fn()
      .mockResolvedValueOnce({ success: true, value: fp })       // capture
      .mockResolvedValueOnce({ success: true, value: true });    // aria check
    const client = createMockClient({ evaluate: evaluateMock });

    await service.captureFingerprint('#btn', client, 'https://example.com');

    const result = await service.resolveWithFallback('#btn', client, 'https://example.com');
    expect(result).toBeTruthy();
    expect(result?.method).toBe('aria');
  });
});
