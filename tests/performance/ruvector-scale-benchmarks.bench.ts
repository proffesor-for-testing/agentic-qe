/**
 * RuVector Tiered Scale Benchmarks (1K → 10K → 100K → 500K)
 *
 * Measures HNSW performance at increasing scale to validate O(log N) growth.
 * Tracks insert throughput, search latency, and memory usage per tier.
 *
 * Run manually for cross-release comparison:
 *   RUN_SCALE_BENCH=1 npx vitest bench tests/performance/ruvector-scale-benchmarks.bench.ts
 *
 * In CI, only 1K and 10K tiers run (default).
 *
 * @see Issue #355 — RuVector P1: Scale & Performance Benchmarks
 */

import { describe, bench, beforeAll, afterAll } from 'vitest';

import { ProgressiveHnswBackend } from '../../src/kernel/progressive-hnsw-backend.js';
import {
  createTemporalCompressionService,
  type TemporalCompressionService,
} from '../../src/integrations/ruvector/temporal-compression.js';
import {
  applyFilterSync,
  and,
  field,
} from '../../src/integrations/ruvector/filter-adapter.js';
import {
  setRuVectorFeatureFlags,
  resetRuVectorFeatureFlags,
} from '../../src/integrations/ruvector/feature-flags.js';

import type { PatternSearchResult } from '../../src/learning/pattern-store.js';

// ============================================================================
// Configuration
// ============================================================================

const DIMENSIONS = 384;
const SCALE_BENCH = process.env.RUN_SCALE_BENCH === '1';

/** Tier sizes — 100K and 500K only run with RUN_SCALE_BENCH=1 */
const TIERS = SCALE_BENCH
  ? [1_000, 10_000, 100_000, 500_000]
  : [1_000, 10_000];

// ============================================================================
// Helpers
// ============================================================================

/** Deterministic test vector for reproducible benchmarks */
function generateTestVector(id: number): Float32Array {
  const vector = new Float32Array(DIMENSIONS);
  for (let i = 0; i < DIMENSIONS; i++) {
    vector[i] = Math.sin(id * 0.1 + i * 0.01) * 0.5;
  }
  return vector;
}

/** Random query vector for realistic search benchmarks */
function randomQueryVector(): Float32Array {
  const vector = new Float32Array(DIMENSIONS);
  for (let i = 0; i < DIMENSIONS; i++) {
    vector[i] = Math.random() * 2 - 1;
  }
  return vector;
}

/** Estimate memory usage for a backend at current size */
function estimateMemoryBytes(vectorCount: number, dimensions: number): number {
  // Raw vectors: count × dims × 4 bytes (Float32)
  const rawVectors = vectorCount * dimensions * 4;
  // HNSW graph overhead: ~2-3x raw vectors (edges, metadata)
  const graphOverhead = rawVectors * 2;
  return rawVectors + graphOverhead;
}

/** Format bytes for human-readable output */
function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)}GB`;
}

const DOMAINS = [
  'test-generation',
  'coverage-analysis',
  'defect-intelligence',
  'test-execution',
  'quality-assessment',
];

function createMockResult(
  id: number,
  domain: string,
  confidence: number,
  severity: number,
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
// 1. Tiered Insert Throughput
// ============================================================================

describe('Tiered Insert Throughput', () => {
  for (const size of TIERS) {
    const label = size >= 1000 ? `${size / 1000}K` : `${size}`;

    bench(`insert ${label} vectors`, () => {
      const backend = new ProgressiveHnswBackend({
        dimensions: DIMENSIONS,
        metric: 'cosine',
      });
      for (let i = 0; i < size; i++) {
        backend.add(i, generateTestVector(i));
      }
    }, {
      iterations: size <= 10_000 ? 3 : 1,
      warmupIterations: 0,
    });
  }
});

// ============================================================================
// 2. Tiered Search Latency
// ============================================================================

describe('Tiered Search Latency', () => {
  const backends = new Map<number, ProgressiveHnswBackend>();
  let queryVector: Float32Array;

  beforeAll(() => {
    for (const size of TIERS) {
      const backend = new ProgressiveHnswBackend({
        dimensions: DIMENSIONS,
        metric: 'cosine',
      });
      for (let i = 0; i < size; i++) {
        backend.add(i, generateTestVector(i));
      }
      backends.set(size, backend);
    }
    queryVector = randomQueryVector();
  });

  for (const size of TIERS) {
    const label = size >= 1000 ? `${size / 1000}K` : `${size}`;

    bench(`search k=10 in ${label} vectors`, () => {
      backends.get(size)!.search(queryVector, 10);
    });

    bench(`search k=50 in ${label} vectors`, () => {
      backends.get(size)!.search(queryVector, 50);
    });
  }
});

// ============================================================================
// 3. Tiered Memory Usage Report
// ============================================================================

describe('Tiered Memory Usage Comparison', () => {
  for (const size of TIERS) {
    const label = size >= 1000 ? `${size / 1000}K` : `${size}`;

    bench(`memory estimate for ${label} vectors (raw=${formatBytes(size * DIMENSIONS * 4)}, est=${formatBytes(estimateMemoryBytes(size, DIMENSIONS))})`, () => {
      const raw = size * DIMENSIONS * 4;
      estimateMemoryBytes(size, DIMENSIONS);
    });
  }
});

// ============================================================================
// 4. Compressed vs Uncompressed at Scale
// ============================================================================

describe('Compressed vs Uncompressed at Scale', () => {
  let compressionService: TemporalCompressionService;

  beforeAll(async () => {
    compressionService = createTemporalCompressionService();
    await compressionService.initialize();
  });

  // Test at 1K — always runs
  bench('1K uncompressed vectors (baseline)', () => {
    const store: Float32Array[] = [];
    for (let i = 0; i < 1000; i++) {
      store.push(generateTestVector(i));
    }
  });

  bench('1K cold-compressed vectors', () => {
    const store: { data: Int8Array; scale: number; offset: number }[] = [];
    for (let i = 0; i < 1000; i++) {
      const compressed = compressionService.compress(generateTestVector(i), 'cold');
      store.push({ data: compressed.data, scale: compressed.scale, offset: compressed.offset });
    }
  });

  // Test at 10K — always runs
  bench('10K uncompressed vectors (baseline)', () => {
    const store: Float32Array[] = [];
    for (let i = 0; i < 10000; i++) {
      store.push(generateTestVector(i));
    }
  });

  bench('10K mixed-tier compressed vectors', () => {
    const store: { data: Int8Array; scale: number; offset: number }[] = [];
    for (let i = 0; i < 10000; i++) {
      const tier = i < 3000 ? 'hot' : i < 7000 ? 'warm' : 'cold';
      const compressed = compressionService.compress(generateTestVector(i), tier as 'hot' | 'warm' | 'cold');
      store.push({ data: compressed.data, scale: compressed.scale, offset: compressed.offset });
    }
  });
});

// ============================================================================
// 5. Filter Performance at Scale
// ============================================================================

describe('Filter Performance at Scale', () => {
  const resultSets = new Map<number, PatternSearchResult[]>();

  beforeAll(() => {
    setRuVectorFeatureFlags({ useMetadataFiltering: true });

    for (const size of TIERS) {
      const results = Array.from({ length: size }, (_, i) =>
        createMockResult(
          i,
          DOMAINS[i % DOMAINS.length],
          0.3 + (i % 70) / 100,
          (i % 5) + 1,
        ),
      );
      resultSets.set(size, results);
    }
  });

  afterAll(() => {
    resetRuVectorFeatureFlags();
  });

  const compositeFilter = and(
    field('qeDomain', 'eq', 'test-generation'),
    field('confidence', 'gt', 0.7),
  );

  for (const size of TIERS) {
    const label = size >= 1000 ? `${size / 1000}K` : `${size}`;

    bench(`filter ${label} results (AND composite)`, () => {
      applyFilterSync(resultSets.get(size)!, compositeFilter);
    });
  }
});

// ============================================================================
// 6. Growth Curve Report (console output for manual comparison)
// ============================================================================

describe('Growth Curve Report', () => {
  // Print growth curve data once before benchmarks (not inside bench loop)
  beforeAll(() => {
    console.log('\n=== HNSW Growth Curve (v3.8.8 baseline) ===');
    console.log('Vectors   | Raw Memory | Est. Total | Cold Compressed');
    console.log('----------|------------|------------|----------------');
    for (const size of TIERS) {
      const label = String(size).padStart(9);
      const raw = formatBytes(size * DIMENSIONS * 4).padStart(10);
      const est = formatBytes(estimateMemoryBytes(size, DIMENSIONS)).padStart(10);
      const cold = formatBytes(Math.ceil(size * DIMENSIONS * 0.375)).padStart(14);
      console.log(`${label} | ${raw} | ${est} | ${cold}`);
    }
    console.log('');
  });

  bench('growth curve computation', () => {
    TIERS.map(size => ({
      vectors: size,
      rawMemory: size * DIMENSIONS * 4,
      estimatedTotal: estimateMemoryBytes(size, DIMENSIONS),
      coldCompressedEstimate: Math.ceil(size * DIMENSIONS * 0.375),
    }));
  });
});
