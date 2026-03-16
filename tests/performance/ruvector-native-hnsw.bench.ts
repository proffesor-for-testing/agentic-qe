/**
 * RuVector Native HNSW Performance Benchmarks
 *
 * Measures:
 * - HNSW search latency at 1K and 10K vectors
 * - Compressed vs uncompressed memory usage
 * - Filter performance with varying result set sizes
 *
 * Run with: npx vitest bench tests/performance/ruvector-native-hnsw.bench.ts
 */

import { describe, bench, beforeAll } from 'vitest';

import { HnswAdapter } from '../../src/kernel/hnsw-adapter.js';
import { ProgressiveHnswBackend } from '../../src/kernel/progressive-hnsw-backend.js';
import {
  createTemporalCompressionService,
  TemporalCompressionService,
  cosineSimilarity,
} from '../../src/integrations/ruvector/temporal-compression.js';
import {
  applyFilterSync,
  and,
  or,
  field,
} from '../../src/integrations/ruvector/filter-adapter.js';
import {
  applyDither,
  applyNaiveQuantization,
} from '../../src/integrations/ruvector/dither-adapter.js';
import {
  setRuVectorFeatureFlags,
  resetRuVectorFeatureFlags,
} from '../../src/integrations/ruvector/feature-flags.js';

import type { PatternSearchResult } from '../../src/learning/pattern-store.js';

// ============================================================================
// Constants & Helpers
// ============================================================================

const DIMENSIONS = 384;

/** Generate a deterministic test vector */
function generateTestVector(id: number): Float32Array {
  const vector = new Float32Array(DIMENSIONS);
  for (let i = 0; i < DIMENSIONS; i++) {
    vector[i] = Math.sin(id * 0.1 + i * 0.01) * 0.5;
  }
  return vector;
}

/** Generate a random query vector for realistic search benchmarks */
function randomQueryVector(): Float32Array {
  const vector = new Float32Array(DIMENSIONS);
  for (let i = 0; i < DIMENSIONS; i++) {
    vector[i] = Math.random() * 2 - 1;
  }
  return vector;
}

/** Create a mock PatternSearchResult for filter benchmarks */
function createMockResult(
  id: number,
  domain: string,
  confidence: number,
  severity: number
): PatternSearchResult {
  return {
    pattern: {
      id: `pattern-${id}`,
      patternType: 'test-template',
      qeDomain: domain,
      domain,
      name: `Pattern ${id}`,
      description: `Test pattern ${id}`,
      confidence,
      usageCount: id % 20,
      successRate: 0.8,
      qualityScore: 0.7,
      context: {
        language: 'typescript',
        tags: [`tag-${id % 10}`, `category-${id % 5}`],
      },
      template: { type: 'code', content: '', variables: [] },
      tier: 'short-term',
      createdAt: new Date(),
      lastUsedAt: new Date(),
      successfulUses: 3,
      reusable: true,
      reuseCount: 1,
      averageTokenSavings: 50,
      severity,
    } as any,
    score: 0.5 + (id % 50) / 100,
    matchType: 'vector' as const,
    similarity: 0.5 + (id % 50) / 100,
    canReuse: true,
    estimatedTokenSavings: 50,
    reuseConfidence: 0.8,
  };
}

// ============================================================================
// 1. HNSW Search Latency Benchmarks
// ============================================================================

describe('HNSW Search Latency', () => {
  let backend1k: ProgressiveHnswBackend;
  let backend10k: ProgressiveHnswBackend;
  let queryVector: Float32Array;

  beforeAll(() => {
    // Build 1K index
    backend1k = new ProgressiveHnswBackend({
      dimensions: DIMENSIONS,
      metric: 'cosine',
    });
    for (let i = 0; i < 1000; i++) {
      backend1k.add(i, generateTestVector(i));
    }

    // Build 10K index
    backend10k = new ProgressiveHnswBackend({
      dimensions: DIMENSIONS,
      metric: 'cosine',
    });
    for (let i = 0; i < 10000; i++) {
      backend10k.add(i, generateTestVector(i));
    }

    queryVector = randomQueryVector();
  });

  bench('search k=10 in 1K vectors', () => {
    backend1k.search(queryVector, 10);
  });

  bench('search k=50 in 1K vectors', () => {
    backend1k.search(queryVector, 50);
  });

  bench('search k=10 in 10K vectors', () => {
    backend10k.search(queryVector, 10);
  });

  bench('search k=50 in 10K vectors', () => {
    backend10k.search(queryVector, 50);
  });

  bench('search k=100 in 10K vectors', () => {
    backend10k.search(queryVector, 100);
  });
});

// ============================================================================
// 2. HnswAdapter Search Latency (with overhead)
// ============================================================================

describe('HnswAdapter Search Latency', () => {
  let adapter1k: HnswAdapter;
  let adapter10k: HnswAdapter;
  let queryVector: Float32Array;

  beforeAll(() => {
    HnswAdapter.closeAll();
    resetRuVectorFeatureFlags();

    adapter1k = HnswAdapter.create('bench-adapter-1k', {
      dimensions: DIMENSIONS,
    });
    for (let i = 0; i < 1000; i++) {
      adapter1k.add(i, generateTestVector(i));
    }

    adapter10k = HnswAdapter.create('bench-adapter-10k', {
      dimensions: DIMENSIONS,
    });
    for (let i = 0; i < 10000; i++) {
      adapter10k.add(i, generateTestVector(i));
    }

    queryVector = randomQueryVector();
  });

  bench('adapter search k=10 in 1K vectors', () => {
    adapter1k.search(queryVector, 10);
  });

  bench('adapter search k=10 in 10K vectors', () => {
    adapter10k.search(queryVector, 10);
  });

  bench('adapter string-id search k=10 in 1K vectors', () => {
    adapter1k.searchByArray(Array.from(queryVector), 10);
  });
});

// ============================================================================
// 3. Temporal Compression Benchmarks
// ============================================================================

describe('Temporal Compression Performance', () => {
  let compressionService: TemporalCompressionService;
  let testVectors: Float32Array[];

  beforeAll(async () => {
    compressionService = createTemporalCompressionService();
    await compressionService.initialize();

    testVectors = [];
    for (let i = 0; i < 100; i++) {
      testVectors.push(generateTestVector(i));
    }
  });

  bench('compress single vector (hot, 8-bit)', () => {
    compressionService.compress(testVectors[0], 'hot');
  });

  bench('compress single vector (warm, 5-bit)', () => {
    compressionService.compress(testVectors[0], 'warm');
  });

  bench('compress single vector (cold, 3-bit)', () => {
    compressionService.compress(testVectors[0], 'cold');
  });

  bench('compress + decompress round-trip (hot)', () => {
    const compressed = compressionService.compress(testVectors[0], 'hot');
    compressionService.decompress(compressed);
  });

  bench('compress + decompress round-trip (cold)', () => {
    const compressed = compressionService.compress(testVectors[0], 'cold');
    compressionService.decompress(compressed);
  });

  bench('batch compress 100 vectors (mixed tiers)', () => {
    for (let i = 0; i < 100; i++) {
      const tier = i < 30 ? 'hot' : i < 70 ? 'warm' : 'cold';
      compressionService.compress(testVectors[i], tier as 'hot' | 'warm' | 'cold');
    }
  });
});

// ============================================================================
// 4. Compressed vs Uncompressed Memory Usage
// ============================================================================

describe('Compressed vs Uncompressed Memory', () => {
  let compressionService: TemporalCompressionService;

  beforeAll(async () => {
    compressionService = createTemporalCompressionService();
    await compressionService.initialize();
  });

  bench('store 1K uncompressed vectors (baseline)', () => {
    const store: Float32Array[] = [];
    for (let i = 0; i < 1000; i++) {
      store.push(generateTestVector(i));
    }
  });

  bench('store 1K hot-compressed vectors', () => {
    const store: { data: Int8Array; scale: number; offset: number }[] = [];
    for (let i = 0; i < 1000; i++) {
      const compressed = compressionService.compress(generateTestVector(i), 'hot');
      store.push({
        data: compressed.data,
        scale: compressed.scale,
        offset: compressed.offset,
      });
    }
  });

  bench('store 1K cold-compressed vectors', () => {
    const store: { data: Int8Array; scale: number; offset: number }[] = [];
    for (let i = 0; i < 1000; i++) {
      const compressed = compressionService.compress(generateTestVector(i), 'cold');
      store.push({
        data: compressed.data,
        scale: compressed.scale,
        offset: compressed.offset,
      });
    }
  });
});

// ============================================================================
// 5. Filter Performance Benchmarks
// ============================================================================

describe('Metadata Filter Performance', () => {
  let results100: PatternSearchResult[];
  let results1k: PatternSearchResult[];
  let results10k: PatternSearchResult[];

  const domains = [
    'test-generation',
    'coverage-analysis',
    'defect-intelligence',
    'test-execution',
    'quality-assessment',
  ];

  beforeAll(() => {
    setRuVectorFeatureFlags({ useMetadataFiltering: true });

    results100 = Array.from({ length: 100 }, (_, i) =>
      createMockResult(
        i,
        domains[i % domains.length],
        0.3 + (i % 70) / 100,
        (i % 5) + 1
      )
    );

    results1k = Array.from({ length: 1000 }, (_, i) =>
      createMockResult(
        i,
        domains[i % domains.length],
        0.3 + (i % 70) / 100,
        (i % 5) + 1
      )
    );

    results10k = Array.from({ length: 10000 }, (_, i) =>
      createMockResult(
        i,
        domains[i % domains.length],
        0.3 + (i % 70) / 100,
        (i % 5) + 1
      )
    );
  });

  // Single field filter
  const simpleFilter = field('qeDomain', 'eq', 'test-generation');

  bench('filter 100 results (single field eq)', () => {
    applyFilterSync(results100, simpleFilter);
  });

  bench('filter 1K results (single field eq)', () => {
    applyFilterSync(results1k, simpleFilter);
  });

  bench('filter 10K results (single field eq)', () => {
    applyFilterSync(results10k, simpleFilter);
  });

  // Composite AND filter
  const andFilter = and(
    field('qeDomain', 'eq', 'test-generation'),
    field('confidence', 'gt', 0.7)
  );

  bench('filter 1K results (AND composite)', () => {
    applyFilterSync(results1k, andFilter);
  });

  bench('filter 10K results (AND composite)', () => {
    applyFilterSync(results10k, andFilter);
  });

  // Complex nested filter
  const complexFilter = and(
    or(
      field('qeDomain', 'eq', 'test-generation'),
      field('qeDomain', 'eq', 'coverage-analysis')
    ),
    field('confidence', 'between', [0.5, 0.9]),
    field('severity', 'lte', 3)
  );

  bench('filter 1K results (complex nested)', () => {
    applyFilterSync(results1k, complexFilter);
  });

  bench('filter 10K results (complex nested)', () => {
    applyFilterSync(results10k, complexFilter);
  });
});

// ============================================================================
// 6. Dithering Performance Benchmarks
// ============================================================================

describe('Deterministic Dithering Performance', () => {
  let vector384: Float32Array;

  beforeAll(() => {
    vector384 = generateTestVector(42);
  });

  bench('dither 384-dim vector at 8-bit', () => {
    applyDither(vector384, 8, 0);
  });

  bench('dither 384-dim vector at 5-bit', () => {
    applyDither(vector384, 5, 0);
  });

  bench('dither 384-dim vector at 3-bit', () => {
    applyDither(vector384, 3, 0);
  });

  bench('naive quantization 384-dim at 3-bit (baseline)', () => {
    applyNaiveQuantization(vector384, 3);
  });

  bench('verify determinism (2 runs at 8-bit)', () => {
    applyDither(vector384, 8, 42);
    applyDither(vector384, 8, 42);
  });
});

// ============================================================================
// 7. Cosine Similarity Computation (Search Quality Baseline)
// ============================================================================

describe('Cosine Similarity Computation', () => {
  let vectorA: Float32Array;
  let vectorB: Float32Array;

  beforeAll(() => {
    vectorA = generateTestVector(1);
    vectorB = generateTestVector(2);
  });

  bench('cosine similarity of 384-dim vectors', () => {
    cosineSimilarity(vectorA, vectorB);
  });
});
