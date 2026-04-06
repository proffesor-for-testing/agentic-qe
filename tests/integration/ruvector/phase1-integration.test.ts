/**
 * RuVector Phase 1 Integration Tests
 *
 * Exercises all Phase 1 components together:
 * - Native HNSW Backend (with JS fallback)
 * - Metadata Filtering (filter-adapter)
 * - Temporal Compression (temporal-compression)
 * - Deterministic Dithering (dither-adapter)
 * - Feature Flags (feature-flags)
 *
 * @see docs/implementation/ruvector-integration-plan.md
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';

// Kernel / HNSW
import { HnswAdapter } from '../../../src/kernel/hnsw-adapter.js';
import { ProgressiveHnswBackend } from '../../../src/kernel/progressive-hnsw-backend.js';
import {
  NativeHnswBackend,
  NativeHnswUnavailableError,
  resetNativeModuleLoader,
  isNativeModuleAvailable,
} from '../../../src/kernel/native-hnsw-backend.js';

// RuVector components
import {
  applyFilter,
  applyFilterSync,
  evaluateFilter,
  and,
  or,
  not,
  field,
  validateFilter,
  resetNativeEngine,
} from '../../../src/integrations/ruvector/filter-adapter.js';

import {
  TemporalCompressionService,
  createTemporalCompressionService,
  cosineSimilarity,
  TIER_CONFIG,
  THEORETICAL_COMPRESSION_RATIOS,
  EXPECTED_COMPRESSION_RATIOS,
} from '../../../src/integrations/ruvector/temporal-compression.js';

import {
  applyDither,
  applyNaiveQuantization,
  createDitherSequence,
  verifyDeterminism,
  computeMSE,
  computeSNR,
} from '../../../src/integrations/ruvector/dither-adapter.js';

import {
  getRuVectorFeatureFlags,
  setRuVectorFeatureFlags,
  resetRuVectorFeatureFlags,
} from '../../../src/integrations/ruvector/feature-flags.js';

import type { PatternSearchResult } from '../../../src/learning/pattern-store.js';
import type { FilterExpression } from '../../../src/integrations/ruvector/interfaces.js';

// ============================================================================
// Test Data Generators
// ============================================================================

const DIMENSIONS = 384;

/**
 * Generate a deterministic test vector for a given id and optional domain seed.
 *
 * Uses FNV-1a to derive 5 independent phases per id, then combines them into
 * a sum of sinusoids at incommensurate frequencies with decaying amplitude.
 * This preserves smoothness (good for compression/dither tests) while
 * guaranteeing unique nearest neighbours — the previous
 * `Math.sin((id + domainSeed) * 0.1 + i * 0.01) * 0.5` generator had
 * single-phase sine aliasing: since 2π / 0.1 ≈ 63, ids spaced ~63 apart
 * produced cosine similarities > 0.999 (e.g. id=42 vs id=105/356/419/482/
 * 733/796/922 all aliased), so "nearest neighbour = self" depended on
 * floating-point sort stability in HNSW and @ruvector/gnn. The fix preserves
 * deterministic output and the expected value range (~[-0.5, 0.5]) while
 * ensuring no pair in the 1000-id range exceeds ~0.998 cosine similarity,
 * leaving a safe margin for the top-1 self-match assertion (1.0 vs ≤0.96).
 */
function generateTestVector(id: number, domainSeed: number = 0): Float32Array {
  const vector = new Float32Array(DIMENSIONS);
  // FNV-1a seeded with (id, domainSeed) to derive 5 independent phases.
  let h = (2166136261 ^ id ^ (domainSeed * 16777619)) >>> 0;
  const phases: number[] = [];
  for (let p = 0; p < 5; p++) {
    h = Math.imul(h ^ 0x9e3779b9, 16777619);
    phases.push(((h >>> 0) / 0x100000000) * 2 * Math.PI);
  }
  // Incommensurate frequencies with decaying amplitude preserve the
  // smooth-signal character the compression tests expect.
  const freqs = [0.010, 0.023, 0.037, 0.053, 0.071];
  const amps = [0.28, 0.18, 0.12, 0.08, 0.05];
  for (let i = 0; i < DIMENSIONS; i++) {
    let x = 0;
    for (let p = 0; p < 5; p++) {
      x += Math.sin(phases[p] + i * freqs[p]) * amps[p];
    }
    vector[i] = x;
  }
  return vector;
}

/**
 * Generate a test pattern metadata record.
 */
function generateTestMetadata(
  id: number,
  domain: string
): Record<string, unknown> {
  return {
    domain,
    severity: (id % 5) + 1,
    confidence: 0.5 + (id % 50) / 100,
    tags: [`tag-${id % 10}`, `category-${id % 3}`],
    createdAt: new Date(Date.now() - id * 86400000).toISOString(),
  };
}

/**
 * Create a mock PatternSearchResult with the given fields.
 */
function createMockPatternSearchResult(
  overrides: Partial<{
    id: string;
    qeDomain: string;
    confidence: number;
    severity: number;
    score: number;
    tags: string[];
    usageCount: number;
  }> = {}
): PatternSearchResult {
  const id = overrides.id ?? 'pattern-1';
  const qeDomain = overrides.qeDomain ?? 'test-generation';
  const confidence = overrides.confidence ?? 0.8;
  const severity = overrides.severity ?? 3;
  const score = overrides.score ?? 0.9;
  const tags = overrides.tags ?? ['unit', 'typescript'];
  const usageCount = overrides.usageCount ?? 5;

  return {
    pattern: {
      id,
      patternType: 'test-template',
      qeDomain,
      domain: qeDomain,
      name: `Test Pattern ${id}`,
      description: `Test pattern for domain ${qeDomain}`,
      confidence,
      usageCount,
      successRate: 0.85,
      qualityScore: 0.75,
      context: {
        language: 'typescript',
        framework: 'vitest',
        testType: 'unit',
        tags,
      },
      template: {
        type: 'code',
        content: 'test("{{name}}", () => { expect(true).toBe(true); })',
        variables: [
          {
            name: 'name',
            type: 'string',
            required: true,
            description: 'Test name',
          },
        ],
      },
      tier: 'short-term',
      createdAt: new Date(),
      lastUsedAt: new Date(),
      successfulUses: 3,
      reusable: true,
      reuseCount: 2,
      averageTokenSavings: 100,
      severity,
    } as any,
    score,
    matchType: 'vector',
    similarity: score,
    canReuse: true,
    estimatedTokenSavings: 100,
    reuseConfidence: 0.9,
  };
}

// ============================================================================
// 1. HNSW Backend: Store, Search, and Fallback
// ============================================================================

describe('Phase 1: HNSW Backend Integration', () => {
  beforeEach(() => {
    resetRuVectorFeatureFlags();
    HnswAdapter.closeAll();
  });

  afterEach(() => {
    resetRuVectorFeatureFlags();
    HnswAdapter.closeAll();
  });

  // Issue #399 / ADR-090 (April 2026): this test was previously skipped
  // because @ruvector/router 0.1.28's HNSW graph walk returned essentially
  // random results (recall@10 ~0% on the same fixture, top-1 candidates
  // not even in the brute-force top-10). NativeHnswBackend was rewritten
  // to wrap hnswlib-node, which gives 100% recall@10 at default M=16,
  // efC=200, efS=100 — verified empirically against this exact fixture
  // on linux-arm64. The test now runs against both backends successfully.
  it('should store 1000 vectors via HnswAdapter and search with correct ranking', () => {
    const adapter = HnswAdapter.create('phase1-test-1000', {
      dimensions: DIMENSIONS,
      metric: 'cosine',
    });

    // Store 1000 vectors
    for (let i = 0; i < 1000; i++) {
      const vector = generateTestVector(i);
      const metadata = generateTestMetadata(i, 'test-generation');
      adapter.add(i, vector, metadata);
    }

    expect(adapter.size()).toBe(1000);

    // Search for a vector similar to id=42
    const queryVector = generateTestVector(42);
    const results = adapter.search(queryVector, 10);

    expect(results.length).toBe(10);

    // The best match should be vector id=42 itself (exact match)
    expect(results[0].id).toBe(42);
    expect(results[0].score).toBeCloseTo(1.0, 1);

    // Results should be in descending score order
    for (let i = 1; i < results.length; i++) {
      expect(results[i - 1].score).toBeGreaterThanOrEqual(results[i].score);
    }

    // All result IDs should be valid
    for (const r of results) {
      expect(r.id).toBeGreaterThanOrEqual(0);
      expect(r.id).toBeLessThan(1000);
    }

    // No duplicate IDs
    const ids = new Set(results.map((r) => r.id));
    expect(ids.size).toBe(results.length);

    HnswAdapter.close('phase1-test-1000');
  });

  it('should gracefully handle native backend with flag on', () => {
    resetNativeModuleLoader();

    // Enable the flag so the factory tries native first
    setRuVectorFeatureFlags({ useNativeHNSW: true });

    const adapter = HnswAdapter.create('phase1-fallback-test', {
      dimensions: DIMENSIONS,
    });

    // The factory either succeeds with hnswlib-node native or falls back
    // to JS if the native binary fails to load. What matters is the
    // adapter works correctly regardless.
    // (Pre #399, the native backend wrapped @ruvector/router VectorDb
    // and could fail due to a process-wide redb file lock — that
    // failure mode no longer exists with hnswlib-node.)
    const usedNative = adapter.isNativeBackend();
    expect(typeof usedNative).toBe('boolean');

    adapter.add(0, generateTestVector(0));
    adapter.add(1, generateTestVector(1));
    adapter.add(2, generateTestVector(2));

    const results = adapter.search(generateTestVector(1), 2);
    expect(results.length).toBe(2);
    expect(results[0].id).toBe(1);

    HnswAdapter.close('phase1-fallback-test');
  });

  it('should throw NativeHnswUnavailableError or succeed based on platform', () => {
    resetNativeModuleLoader();

    // NativeHnswBackend (hnswlib-node) only fails to construct when the
    // native binary isn't available for the current platform/arch (very
    // rare since hnswlib-node ships prebuilds via node-gyp for all major
    // targets). Both outcomes are valid; consumers fall back to the JS
    // backend on the error path.
    try {
      const backend = new NativeHnswBackend({ dimensions: DIMENSIONS });
      // If construction succeeds, the native module is available
      expect(backend.isNativeAvailable()).toBe(true);
    } catch (err) {
      // Construction failed — must be NativeHnswUnavailableError
      expect(err).toBeInstanceOf(NativeHnswUnavailableError);
    }
  });

  it('should use ProgressiveHnswBackend when useNativeHNSW flag is off', () => {
    setRuVectorFeatureFlags({ useNativeHNSW: false });

    const adapter = HnswAdapter.create('phase1-js-backend', {
      dimensions: DIMENSIONS,
    });

    expect(adapter.isNativeBackend()).toBe(false);

    // Basic ops work
    adapter.add(0, generateTestVector(0));
    expect(adapter.size()).toBe(1);

    const results = adapter.search(generateTestVector(0), 1);
    expect(results).toHaveLength(1);
    expect(results[0].id).toBe(0);

    HnswAdapter.close('phase1-js-backend');
  });

  it('should support string-based ID APIs for backward compatibility', () => {
    const adapter = HnswAdapter.create('phase1-string-ids', {
      dimensions: DIMENSIONS,
    });

    const v1 = Array.from(generateTestVector(1));
    const v2 = Array.from(generateTestVector(2));
    const v3 = Array.from(generateTestVector(3));

    adapter.addByStringId('pattern-alpha', v1);
    adapter.addByStringId('pattern-beta', v2);
    adapter.addByStringId('pattern-gamma', v3);

    expect(adapter.size()).toBe(3);

    const results = adapter.searchByArray(v2, 2);
    expect(results.length).toBe(2);
    expect(results[0].id).toBe('pattern-beta');

    const removed = adapter.removeByStringId('pattern-alpha');
    expect(removed).toBe(true);
    expect(adapter.size()).toBe(2);

    HnswAdapter.close('phase1-string-ids');
  });

  it('should return metadata associated with stored vectors', () => {
    const adapter = HnswAdapter.create('phase1-metadata', {
      dimensions: DIMENSIONS,
    });

    const metadata = { domain: 'test-generation', severity: 3 };
    adapter.add(0, generateTestVector(0), metadata);

    const results = adapter.search(generateTestVector(0), 1);
    expect(results[0].metadata).toBeDefined();
    expect(results[0].metadata!.domain).toBe('test-generation');
    expect(results[0].metadata!.severity).toBe(3);

    HnswAdapter.close('phase1-metadata');
  });
});

// ============================================================================
// 2. Metadata Filtering
// ============================================================================

describe('Phase 1: Metadata Filtering Integration', () => {
  let results: PatternSearchResult[];

  beforeEach(() => {
    resetRuVectorFeatureFlags();
    resetNativeEngine();

    // Create a diverse set of test patterns for filtering
    results = [
      createMockPatternSearchResult({
        id: 'p1',
        qeDomain: 'test-generation',
        confidence: 0.9,
        severity: 5,
        score: 0.95,
        tags: ['unit', 'typescript'],
        usageCount: 10,
      }),
      createMockPatternSearchResult({
        id: 'p2',
        qeDomain: 'coverage-analysis',
        confidence: 0.7,
        severity: 3,
        score: 0.85,
        tags: ['integration', 'javascript'],
        usageCount: 5,
      }),
      createMockPatternSearchResult({
        id: 'p3',
        qeDomain: 'test-generation',
        confidence: 0.5,
        severity: 1,
        score: 0.75,
        tags: ['e2e', 'python'],
        usageCount: 2,
      }),
      createMockPatternSearchResult({
        id: 'p4',
        qeDomain: 'defect-intelligence',
        confidence: 0.85,
        severity: 4,
        score: 0.65,
        tags: ['unit', 'rust'],
        usageCount: 15,
      }),
      createMockPatternSearchResult({
        id: 'p5',
        qeDomain: 'test-execution',
        confidence: 0.6,
        severity: 2,
        score: 0.55,
        tags: ['smoke', 'typescript'],
        usageCount: 1,
      }),
    ];
  });

  afterEach(() => {
    resetRuVectorFeatureFlags();
    resetNativeEngine();
  });

  it('should filter by single field equality', () => {
    setRuVectorFeatureFlags({ useMetadataFiltering: true });

    const filter = field('qeDomain', 'eq', 'test-generation');
    const filtered = applyFilterSync(results, filter);

    expect(filtered).toHaveLength(2);
    expect(filtered.every((r) => r.pattern.qeDomain === 'test-generation')).toBe(true);
  });

  it('should filter by numeric comparison (gt, lt, gte, lte)', () => {
    setRuVectorFeatureFlags({ useMetadataFiltering: true });

    // confidence > 0.7
    const gtFilter = field('confidence', 'gt', 0.7);
    const gtResults = applyFilterSync(results, gtFilter);
    expect(gtResults).toHaveLength(2); // p1 (0.9), p4 (0.85)

    // severity <= 3
    const lteFilter = field('severity', 'lte', 3);
    const lteResults = applyFilterSync(results, lteFilter);
    expect(lteResults).toHaveLength(3); // p2 (3), p3 (1), p5 (2)
  });

  it('should support AND composite filters', () => {
    setRuVectorFeatureFlags({ useMetadataFiltering: true });

    const filter = and(
      field('qeDomain', 'eq', 'test-generation'),
      field('confidence', 'gt', 0.6)
    );
    const filtered = applyFilterSync(results, filter);

    expect(filtered).toHaveLength(1);
    expect(filtered[0].pattern.id).toBe('p1');
  });

  it('should support OR composite filters', () => {
    setRuVectorFeatureFlags({ useMetadataFiltering: true });

    const filter = or(
      field('qeDomain', 'eq', 'test-generation'),
      field('qeDomain', 'eq', 'coverage-analysis')
    );
    const filtered = applyFilterSync(results, filter);

    expect(filtered).toHaveLength(3); // p1, p2, p3
  });

  it('should support NOT filters', () => {
    setRuVectorFeatureFlags({ useMetadataFiltering: true });

    const filter = not(field('qeDomain', 'eq', 'test-generation'));
    const filtered = applyFilterSync(results, filter);

    expect(filtered).toHaveLength(3);
    expect(filtered.every((r) => r.pattern.qeDomain !== 'test-generation')).toBe(true);
  });

  it('should support nested composite filters', () => {
    setRuVectorFeatureFlags({ useMetadataFiltering: true });

    // (domain = test-generation OR domain = coverage-analysis) AND confidence >= 0.7
    const filter = and(
      or(
        field('qeDomain', 'eq', 'test-generation'),
        field('qeDomain', 'eq', 'coverage-analysis')
      ),
      field('confidence', 'gte', 0.7)
    );
    const filtered = applyFilterSync(results, filter);

    expect(filtered).toHaveLength(2); // p1 (0.9), p2 (0.7)
  });

  it('should support "in" operator', () => {
    setRuVectorFeatureFlags({ useMetadataFiltering: true });

    const filter = field('qeDomain', 'in', [
      'test-generation',
      'defect-intelligence',
    ]);
    const filtered = applyFilterSync(results, filter);

    expect(filtered).toHaveLength(3); // p1, p3, p4
  });

  it('should support "contains" operator on arrays', () => {
    setRuVectorFeatureFlags({ useMetadataFiltering: true });

    // Tags contain 'unit'
    const filter = field('context.tags', 'contains', 'unit');
    const filtered = applyFilterSync(results, filter);

    expect(filtered).toHaveLength(2); // p1 (unit,ts), p4 (unit,rust)
  });

  it('should support "between" operator for numeric ranges', () => {
    setRuVectorFeatureFlags({ useMetadataFiltering: true });

    const filter = field('confidence', 'between', [0.6, 0.85]);
    const filtered = applyFilterSync(results, filter);

    expect(filtered).toHaveLength(3); // p2 (0.7), p4 (0.85), p5 (0.6)
  });

  it('should return all results when filter is null/undefined', () => {
    setRuVectorFeatureFlags({ useMetadataFiltering: true });

    const filtered = applyFilterSync(results, null);
    expect(filtered).toHaveLength(5);

    const filtered2 = applyFilterSync(results, undefined);
    expect(filtered2).toHaveLength(5);
  });

  it('should validate filter expressions', () => {
    const valid = validateFilter(
      and(field('qeDomain', 'eq', 'test-generation'))
    );
    expect(valid.valid).toBe(true);
    expect(valid.errors).toHaveLength(0);

    const invalid = validateFilter({
      type: 'FIELD',
      field: undefined,
      operator: undefined,
    } as any);
    expect(invalid.valid).toBe(false);
    expect(invalid.errors.length).toBeGreaterThan(0);
  });

  it('should pass through unfiltered when useMetadataFiltering is off', async () => {
    setRuVectorFeatureFlags({ useMetadataFiltering: false });

    const filter = field('qeDomain', 'eq', 'test-generation');
    const filtered = await applyFilter(results, filter);

    // All results pass through because feature flag is off
    expect(filtered).toHaveLength(5);
  });
});

// ============================================================================
// 3. Temporal Compression
// ============================================================================

describe('Phase 1: Temporal Compression Integration', () => {
  let service: TemporalCompressionService;

  beforeEach(async () => {
    resetRuVectorFeatureFlags();
    setRuVectorFeatureFlags({ useTemporalCompression: true });
    service = createTemporalCompressionService();
    await service.initialize();
  });

  afterEach(() => {
    resetRuVectorFeatureFlags();
  });

  it('should classify access dates into correct tiers', () => {
    const now = new Date();
    const twoDaysAgo = new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000);
    const fifteenDaysAgo = new Date(now.getTime() - 15 * 24 * 60 * 60 * 1000);
    const sixtyDaysAgo = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000);

    expect(service.classifyTier(now)).toBe('hot');
    expect(service.classifyTier(twoDaysAgo)).toBe('hot');
    expect(service.classifyTier(fifteenDaysAgo)).toBe('warm');
    expect(service.classifyTier(sixtyDaysAgo)).toBe('cold');
  });

  it('should compress hot-tier vectors with 8-bit quantization', () => {
    const vector = generateTestVector(1);
    const compressed = service.compress(vector, 'hot');

    expect(compressed.tier).toBe('hot');
    expect(compressed.bitDepth).toBe(8);
    expect(compressed.originalLength).toBe(DIMENSIONS);
    expect(compressed.data.length).toBe(DIMENSIONS);
    expect(compressed.compressedByteSize).toBeLessThan(compressed.originalByteSize);

    // 8-bit = 4x compression ratio
    const ratio = compressed.originalByteSize / compressed.compressedByteSize;
    expect(ratio).toBeCloseTo(4.0, 0);
  });

  it('should compress warm-tier vectors with 5-bit quantization', () => {
    const vector = generateTestVector(2);
    const compressed = service.compress(vector, 'warm');

    expect(compressed.tier).toBe('warm');
    expect(compressed.bitDepth).toBe(5);
    expect(compressed.originalLength).toBe(DIMENSIONS);

    // In TS fallback, Int8Array storage gives ~4x for all tiers
    const ratio = compressed.originalByteSize / compressed.compressedByteSize;
    expect(ratio).toBeCloseTo(4.0, 0);
  });

  it('should compress cold-tier vectors with 3-bit quantization', () => {
    const vector = generateTestVector(3);
    const compressed = service.compress(vector, 'cold');

    expect(compressed.tier).toBe('cold');
    expect(compressed.bitDepth).toBe(3);

    // In TS fallback, Int8Array storage gives ~4x for all tiers
    const ratio = compressed.originalByteSize / compressed.compressedByteSize;
    expect(ratio).toBeCloseTo(4.0, 0);
  });

  it('should decompress vectors with acceptable accuracy for each tier', () => {
    const vector = generateTestVector(42);

    // Hot tier: high fidelity
    const hotCompressed = service.compress(vector, 'hot');
    const hotDecompressed = service.decompress(hotCompressed);
    const hotSimilarity = cosineSimilarity(vector, hotDecompressed);
    expect(hotSimilarity).toBeGreaterThan(0.95);

    // Warm tier: moderate fidelity
    const warmCompressed = service.compress(vector, 'warm');
    const warmDecompressed = service.decompress(warmCompressed);
    const warmSimilarity = cosineSimilarity(vector, warmDecompressed);
    expect(warmSimilarity).toBeGreaterThan(0.85);

    // Cold tier: lower but acceptable fidelity
    const coldCompressed = service.compress(vector, 'cold');
    const coldDecompressed = service.decompress(coldCompressed);
    const coldSimilarity = cosineSimilarity(vector, coldDecompressed);
    expect(coldSimilarity).toBeGreaterThan(0.70);
  });

  it('should compress 1000 patterns and track stats correctly', () => {
    service.resetStats();

    for (let i = 0; i < 1000; i++) {
      const vector = generateTestVector(i);
      let tier: 'hot' | 'warm' | 'cold';
      if (i < 300) tier = 'hot';
      else if (i < 700) tier = 'warm';
      else tier = 'cold';

      service.compress(vector, tier);
    }

    const stats = service.getCompressionStats();
    expect(stats.totalCompressed).toBe(1000);
    expect(stats.byTier.hot).toBe(300);
    expect(stats.byTier.warm).toBe(400);
    expect(stats.byTier.cold).toBe(300);
    expect(stats.totalBytesSaved).toBeGreaterThan(0);
    expect(stats.totalOriginalBytes).toBeGreaterThan(stats.totalCompressedBytes);

    // Avg compression ratios should be non-zero
    expect(stats.avgCompressionRatio.hot).toBeGreaterThan(0);
    expect(stats.avgCompressionRatio.warm).toBeGreaterThan(0);
    expect(stats.avgCompressionRatio.cold).toBeGreaterThan(0);

    // In TS fallback (no native bit-packing), all tiers deliver ~4x
    // (Int8Array = 1 byte/element regardless of logical bit depth)
    expect(stats.avgCompressionRatio.cold).toBeCloseTo(
      stats.avgCompressionRatio.hot, 0
    );
  });

  it('should handle empty vectors gracefully', () => {
    const empty = new Float32Array(0);
    const compressed = service.compress(empty, 'hot');
    expect(compressed.data.length).toBe(0);
    expect(compressed.originalLength).toBe(0);

    const decompressed = service.decompress(compressed);
    expect(decompressed.length).toBe(0);
  });

  it('should handle constant vectors (all same values)', () => {
    const constant = new Float32Array(DIMENSIONS);
    constant.fill(0.5);

    const compressed = service.compress(constant, 'warm');
    const decompressed = service.decompress(compressed);

    // All values should be close to the original
    for (let i = 0; i < DIMENSIONS; i++) {
      expect(decompressed[i]).toBeCloseTo(0.5, 0);
    }
  });
});

// ============================================================================
// 4. Deterministic Dithering
// ============================================================================

describe('Phase 1: Deterministic Dithering Integration', () => {
  beforeEach(() => {
    resetRuVectorFeatureFlags();
  });

  afterEach(() => {
    resetRuVectorFeatureFlags();
  });

  it('should produce deterministic dither sequences for the same seed', () => {
    const seq1 = createDitherSequence(100, 42);
    const seq2 = createDitherSequence(100, 42);

    expect(seq1.length).toBe(100);
    for (let i = 0; i < 100; i++) {
      expect(seq1[i]).toBe(seq2[i]);
    }
  });

  it('should produce different sequences for different seeds', () => {
    const seq1 = createDitherSequence(100, 1);
    const seq2 = createDitherSequence(100, 2);

    let differences = 0;
    for (let i = 0; i < 100; i++) {
      if (seq1[i] !== seq2[i]) differences++;
    }
    expect(differences).toBeGreaterThan(50);
  });

  it('should produce dither values in [0, 1) range', () => {
    const seq = createDitherSequence(1000, 0);
    for (let i = 0; i < seq.length; i++) {
      expect(seq[i]).toBeGreaterThanOrEqual(0);
      expect(seq[i]).toBeLessThan(1);
    }
  });

  it('should apply dithered quantization deterministically', () => {
    const vector = generateTestVector(42);

    const result1 = applyDither(vector, 8, 42);
    const result2 = applyDither(vector, 8, 42);

    // Same seed produces identical quantized values
    expect(result1.quantized.length).toBe(result2.quantized.length);
    for (let i = 0; i < result1.quantized.length; i++) {
      expect(result1.quantized[i]).toBe(result2.quantized[i]);
    }
  });

  it('should verify determinism via verifyDeterminism()', () => {
    const vector = generateTestVector(99);
    expect(verifyDeterminism(vector, 8)).toBe(true);
    expect(verifyDeterminism(vector, 5)).toBe(true);
    expect(verifyDeterminism(vector, 3)).toBe(true);
  });

  it('should produce comparable MSE with dithering vs naive quantization at low bit depths', () => {
    // Dithering distributes quantization error more evenly but does not
    // always reduce aggregate MSE for every input. It improves perceptual
    // quality by avoiding systematic banding artifacts. So we test that
    // the MSE is within a reasonable factor rather than strictly lower.
    const vector = generateTestVector(7);

    // 3-bit quantization
    const dithered = applyDither(vector, 3, 0);
    const naive = applyNaiveQuantization(vector, 3);

    const ditherMSE = computeMSE(vector, dithered.dequantized);
    const naiveMSE = computeMSE(vector, naive.dequantized);

    // Both should be within 3x of each other (dithering trades aggregate MSE
    // for better error distribution, so neither should dominate dramatically)
    expect(ditherMSE).toBeLessThan(naiveMSE * 3);
    expect(naiveMSE).toBeLessThan(ditherMSE * 3);

    // Both MSE values should be small relative to the signal
    expect(ditherMSE).toBeLessThan(0.1);
    expect(naiveMSE).toBeLessThan(0.1);
  });

  it('should compute SNR that increases with bit depth', () => {
    const vector = generateTestVector(50);

    const snr3 = computeSNR(vector, applyDither(vector, 3, 0).dequantized);
    const snr5 = computeSNR(vector, applyDither(vector, 5, 0).dequantized);
    const snr8 = computeSNR(vector, applyDither(vector, 8, 0).dequantized);

    // Higher bit depth should give better SNR
    expect(snr8).toBeGreaterThan(snr5);
    expect(snr5).toBeGreaterThan(snr3);
  });

  it('should handle edge cases: empty vector and single element', () => {
    const empty = new Float32Array(0);
    const emptyResult = applyDither(empty, 8, 0);
    expect(emptyResult.quantized.length).toBe(0);
    expect(emptyResult.dequantized.length).toBe(0);

    const single = new Float32Array([0.42]);
    const singleResult = applyDither(single, 8, 0);
    expect(singleResult.quantized.length).toBe(1);
  });

  it('should reject invalid bit depths', () => {
    const vector = generateTestVector(1);

    expect(() => applyDither(vector, 0, 0)).toThrow();
    expect(() => applyDither(vector, 33, 0)).toThrow();
    expect(() => applyDither(vector, 2.5, 0)).toThrow();
  });
});

// ============================================================================
// 5. End-to-End: All Components Together
// ============================================================================

describe('Phase 1: End-to-End Component Integration', () => {
  beforeEach(() => {
    resetRuVectorFeatureFlags();
    HnswAdapter.closeAll();
  });

  afterEach(() => {
    resetRuVectorFeatureFlags();
    HnswAdapter.closeAll();
  });

  it('should store patterns, compress by tier, dither, and search with filters', async () => {
    // Enable all Phase 1 features
    setRuVectorFeatureFlags({
      useMetadataFiltering: true,
      useTemporalCompression: true,
      useDeterministicDither: true,
    });

    // 1. Create HNSW index and add vectors
    const adapter = HnswAdapter.create('e2e-phase1', {
      dimensions: DIMENSIONS,
    });

    const domains = [
      'test-generation',
      'coverage-analysis',
      'defect-intelligence',
    ];
    const patternCount = 100;

    for (let i = 0; i < patternCount; i++) {
      const domain = domains[i % domains.length];
      const vector = generateTestVector(i, domains.indexOf(domain));
      const metadata = generateTestMetadata(i, domain);
      adapter.add(i, vector, metadata);
    }

    expect(adapter.size()).toBe(patternCount);

    // 2. Search for vectors near a specific point
    const queryVector = generateTestVector(15, 0);
    const searchResults = adapter.search(queryVector, 20);
    expect(searchResults.length).toBe(20);

    // 3. Apply metadata filtering on search results
    const filterableResults: PatternSearchResult[] = searchResults.map(
      (sr) => {
        const meta = sr.metadata ?? {};
        return createMockPatternSearchResult({
          id: `pattern-${sr.id}`,
          qeDomain: meta.domain as string,
          confidence: meta.confidence as number,
          severity: meta.severity as number,
          score: sr.score,
        });
      }
    );

    // Filter: only test-generation with confidence > 0.6
    const filter = and(
      field('qeDomain', 'eq', 'test-generation'),
      field('confidence', 'gt', 0.6)
    );

    const filteredResults = await applyFilter(filterableResults, filter);
    expect(filteredResults.length).toBeLessThanOrEqual(searchResults.length);
    for (const r of filteredResults) {
      expect(r.pattern.qeDomain).toBe('test-generation');
      expect(r.pattern.confidence).toBeGreaterThan(0.6);
    }

    // 4. Compress some vectors by tier
    //
    // NOTE: Stored vectors above use a per-domain `domainSeed`
    // (`domains.indexOf(domain)`). We must use the same domainSeed when
    // re-generating a vector to compare against the stored copy —
    // otherwise the "hot" vector for id=1 would differ from the stored
    // id=1 and the search on line 945 would legitimately fail to find
    // id=1. Previously the test relied on single-phase sine aliasing to
    // accidentally return id=1 anyway; with the fixed hash-phase
    // generator we must match seeds explicitly.
    const compressionService = createTemporalCompressionService();
    await compressionService.initialize();

    const hotVector = generateTestVector(1, domains.indexOf(domains[1 % domains.length]));
    const warmVector = generateTestVector(50, domains.indexOf(domains[50 % domains.length]));
    const coldVector = generateTestVector(90, domains.indexOf(domains[90 % domains.length]));

    const hotCompressed = compressionService.compress(hotVector, 'hot');
    const warmCompressed = compressionService.compress(warmVector, 'warm');
    const coldCompressed = compressionService.compress(coldVector, 'cold');

    // 5. Verify decompression fidelity
    const hotReconstructed = compressionService.decompress(hotCompressed);
    const warmReconstructed = compressionService.decompress(warmCompressed);
    const coldReconstructed = compressionService.decompress(coldCompressed);

    expect(cosineSimilarity(hotVector, hotReconstructed)).toBeGreaterThan(0.95);
    expect(cosineSimilarity(warmVector, warmReconstructed)).toBeGreaterThan(0.85);
    expect(cosineSimilarity(coldVector, coldReconstructed)).toBeGreaterThan(0.70);

    // 6. Apply dithering to verify determinism
    const dithered1 = applyDither(hotVector, 8, 42);
    const dithered2 = applyDither(hotVector, 8, 42);
    for (let i = 0; i < dithered1.quantized.length; i++) {
      expect(dithered1.quantized[i]).toBe(dithered2.quantized[i]);
    }

    // 7. Search the reconstructed hot vector and verify it still matches
    const reconstructedResults = adapter.search(hotReconstructed, 5);
    expect(reconstructedResults.length).toBeGreaterThan(0);
    // The original vector id=1 should be among the top results
    const topIds = reconstructedResults.map((r) => r.id);
    expect(topIds).toContain(1);

    HnswAdapter.close('e2e-phase1');
  });

  it('should work correctly when all flags are toggled at runtime', async () => {
    const adapter = HnswAdapter.create('e2e-runtime-flags', {
      dimensions: DIMENSIONS,
    });

    // Add some vectors
    for (let i = 0; i < 50; i++) {
      adapter.add(i, generateTestVector(i), generateTestMetadata(i, 'test-generation'));
    }

    const mockResults = Array.from({ length: 5 }, (_, i) =>
      createMockPatternSearchResult({
        id: `p${i}`,
        qeDomain: 'test-generation',
        confidence: 0.5 + i * 0.1,
      })
    );

    // Start with flags OFF
    setRuVectorFeatureFlags({
      useMetadataFiltering: false,
      useTemporalCompression: false,
      useDeterministicDither: false,
    });

    // Filtering is disabled, all results pass
    const filter = field('confidence', 'gt', 0.7);
    let filtered = await applyFilter(mockResults, filter);
    expect(filtered).toHaveLength(5); // All pass through

    // Turn filtering ON at runtime
    setRuVectorFeatureFlags({ useMetadataFiltering: true });
    filtered = await applyFilter(mockResults, filter);
    expect(filtered).toHaveLength(2); // Only p3(0.8), p4(0.9) pass

    // Turn filtering back OFF
    setRuVectorFeatureFlags({ useMetadataFiltering: false });
    filtered = await applyFilter(mockResults, filter);
    expect(filtered).toHaveLength(5);

    HnswAdapter.close('e2e-runtime-flags');
  });
});

// ============================================================================
// 6. Backward Compatibility: All Feature Flags OFF
// ============================================================================

describe('Phase 1: Backward Compatibility (All Flags OFF)', () => {
  beforeEach(() => {
    resetRuVectorFeatureFlags();
    HnswAdapter.closeAll();
  });

  afterEach(() => {
    resetRuVectorFeatureFlags();
    HnswAdapter.closeAll();
  });

  it('should use JS backend when useNativeHNSW is explicitly disabled', () => {
    setRuVectorFeatureFlags({ useNativeHNSW: false });
    const flags = getRuVectorFeatureFlags();
    expect(flags.useNativeHNSW).toBe(false);

    const adapter = HnswAdapter.create('compat-hnsw', { dimensions: DIMENSIONS });
    expect(adapter.isNativeBackend()).toBe(false);

    adapter.add(0, generateTestVector(0));
    const results = adapter.search(generateTestVector(0), 1);
    expect(results).toHaveLength(1);

    HnswAdapter.close('compat-hnsw');
  });

  it('should not filter when useMetadataFiltering is explicitly disabled', async () => {
    setRuVectorFeatureFlags({ useMetadataFiltering: false });
    const flags = getRuVectorFeatureFlags();
    expect(flags.useMetadataFiltering).toBe(false);

    const results = [
      createMockPatternSearchResult({ id: 'p1', qeDomain: 'test-generation' }),
      createMockPatternSearchResult({ id: 'p2', qeDomain: 'coverage-analysis' }),
    ];

    const filter = field('qeDomain', 'eq', 'test-generation');
    const filtered = await applyFilter(results, filter);

    expect(filtered).toHaveLength(2); // No filtering applied
  });

  it('should report temporal compression disabled when flag is explicitly off', () => {
    setRuVectorFeatureFlags({ useTemporalCompression: false });
    const service = createTemporalCompressionService();
    const flags = getRuVectorFeatureFlags();
    expect(flags.useTemporalCompression).toBe(false);
    expect(service.isEnabled()).toBe(false);
  });

  it('should report dithering flag enabled by default', () => {
    const flags = getRuVectorFeatureFlags();
    expect(flags.useDeterministicDither).toBe(true);
  });

  it('should verify all Phase 1 flags default to true', () => {
    resetRuVectorFeatureFlags();
    const flags = getRuVectorFeatureFlags();

    // useNativeHNSW: was flipped to false in v3.9.5 due to a deadlock in
    // @ruvector/router. Issue #399 / ADR-090 migrated NativeHnswBackend to
    // hnswlib-node, which fixes the deadlock and the four other bugs found
    // in @ruvector/router 0.1.28. Default flipped back to true.
    expect(flags.useNativeHNSW).toBe(true);
    expect(flags.useTemporalCompression).toBe(true);
    expect(flags.useMetadataFiltering).toBe(true);
    expect(flags.useDeterministicDither).toBe(true);
  });

  it('should verify pre-existing flags default to true', () => {
    resetRuVectorFeatureFlags();
    const flags = getRuVectorFeatureFlags();

    expect(flags.useQESONA).toBe(true);
    expect(flags.useQEFlashAttention).toBe(true);
    expect(flags.useQEGNNIndex).toBe(true);
    expect(flags.logMigrationMetrics).toBe(true);
  });
});

// ============================================================================
// 7. Feature Flag Runtime Toggling
// ============================================================================

describe('Phase 1: Feature Flag Runtime Toggling', () => {
  afterEach(() => {
    resetRuVectorFeatureFlags();
  });

  it('should toggle individual flags without affecting others', () => {
    resetRuVectorFeatureFlags();

    setRuVectorFeatureFlags({ useMetadataFiltering: true });
    let flags = getRuVectorFeatureFlags();
    expect(flags.useMetadataFiltering).toBe(true);
    expect(flags.useNativeHNSW).toBe(true); // Unchanged (default is true after #399 fix)
    expect(flags.useTemporalCompression).toBe(true); // Unchanged (default is true)

    setRuVectorFeatureFlags({ useNativeHNSW: false });
    flags = getRuVectorFeatureFlags();
    expect(flags.useMetadataFiltering).toBe(true); // Still true
    expect(flags.useNativeHNSW).toBe(false); // Opted out
  });

  it('should reset all flags to defaults', () => {
    setRuVectorFeatureFlags({
      useNativeHNSW: false,
      useTemporalCompression: false,
      useMetadataFiltering: false,
      useDeterministicDither: false,
      useQESONA: false,
    });

    resetRuVectorFeatureFlags();
    const flags = getRuVectorFeatureFlags();

    // All Phase 1 flags default to true after the #399 hnswlib-node migration.
    expect(flags.useNativeHNSW).toBe(true);
    expect(flags.useTemporalCompression).toBe(true);
    expect(flags.useMetadataFiltering).toBe(true);
    expect(flags.useDeterministicDither).toBe(true);
    expect(flags.useQESONA).toBe(true);
  });

  it('should batch-set multiple flags at once', () => {
    setRuVectorFeatureFlags({
      useNativeHNSW: true,
      useTemporalCompression: true,
      useMetadataFiltering: true,
      useDeterministicDither: true,
    });

    const flags = getRuVectorFeatureFlags();
    expect(flags.useNativeHNSW).toBe(true);
    expect(flags.useTemporalCompression).toBe(true);
    expect(flags.useMetadataFiltering).toBe(true);
    expect(flags.useDeterministicDither).toBe(true);
  });

  it('should return immutable copies from getRuVectorFeatureFlags', () => {
    const flags1 = getRuVectorFeatureFlags();
    const flags2 = getRuVectorFeatureFlags();

    // Different objects
    expect(flags1).not.toBe(flags2);

    // Same values
    expect(flags1).toEqual(flags2);
  });
});

// ============================================================================
// 8. HNSW + Compression Pipeline
// ============================================================================

describe('Phase 1: HNSW Search After Compression Round-Trip', () => {
  beforeEach(() => {
    resetRuVectorFeatureFlags();
    HnswAdapter.closeAll();
  });

  afterEach(() => {
    resetRuVectorFeatureFlags();
    HnswAdapter.closeAll();
  });

  // Issue #399 / ADR-090 (April 2026): un-skipped after the hnswlib-node
  // migration. The previous @ruvector/router HNSW couldn't find the
  // original vector with reliable top-1 ranking after a hot-compression
  // round-trip. hnswlib-node returns correct nearest-neighbor results,
  // and hot-compression is lossy enough that it preserves the top-1
  // ordering for this fixture.
  it('should find original vector as top result when searching with decompressed query', () => {
    const adapter = HnswAdapter.create('compression-search', {
      dimensions: DIMENSIONS,
    });

    // Store 100 original vectors
    for (let i = 0; i < 100; i++) {
      adapter.add(i, generateTestVector(i));
    }

    const compressionService = createTemporalCompressionService();

    // Compress and decompress a query vector
    const originalQuery = generateTestVector(50);
    const compressed = compressionService.compress(originalQuery, 'hot');
    const decompressedQuery = compressionService.decompress(compressed);

    // Search with decompressed query
    const results = adapter.search(decompressedQuery, 5);

    // The original vector (id=50) should be the top result
    expect(results[0].id).toBe(50);
    expect(results[0].score).toBeGreaterThan(0.9);

    HnswAdapter.close('compression-search');
  });

  it('should find original vector within top-3 even after cold compression', () => {
    const adapter = HnswAdapter.create('cold-compression-search', {
      dimensions: DIMENSIONS,
    });

    for (let i = 0; i < 100; i++) {
      adapter.add(i, generateTestVector(i));
    }

    const compressionService = createTemporalCompressionService();

    // Cold compression (3-bit, most lossy)
    const originalQuery = generateTestVector(25);
    const compressed = compressionService.compress(originalQuery, 'cold');
    const decompressedQuery = compressionService.decompress(compressed);

    const results = adapter.search(decompressedQuery, 5);

    // Even with cold compression, the original should be in top results
    const topIds = results.slice(0, 3).map((r) => r.id);
    expect(topIds).toContain(25);

    HnswAdapter.close('cold-compression-search');
  });
});
