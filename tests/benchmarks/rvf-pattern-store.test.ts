/**
 * Native correctness: RvfPatternStore with REAL @ruvector/rvf-node backend.
 *
 * These checks stay in the coverage suite. Wall-clock limits are enforced in
 * tests/performance/rvf-pattern-store.test.ts without V8 instrumentation.
 *
 * Run: npx vitest run tests/benchmarks/rvf-pattern-store.test.ts
 */

import { describe, it, expect, afterAll } from 'vitest';
import { existsSync, unlinkSync, mkdirSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { RvfPatternStore } from '../../src/learning/rvf-pattern-store.js';
import {
  createRvfStore,
  isRvfNativeAvailable,
} from '../../src/integrations/ruvector/rvf-native-adapter.js';
import type { QEPattern } from '../../src/learning/qe-patterns.js';

// ============================================================================
// Helpers
// ============================================================================

// Use a run-specific location. A fixed project-relative path lets interrupted
// or concurrent benchmark runs reopen stale native state and inflate counts.
const BENCH_DIR = join(tmpdir(), `aqe-rvf-bench-${process.pid}-${Date.now()}`);
const RVF_PATH = join(BENCH_DIR, 'bench-patterns.rvf');
const DIM = 384;
const TEST_SPACE_ID = 'benchmark-runtime-embedding-space';

function cleanupBenchFiles(): void {
  for (const ext of ['', '.idmap.json', '.space.json']) {
    const p = `${RVF_PATH}${ext}`;
    if (existsSync(p)) unlinkSync(p);
  }
}

function randomEmbedding(): number[] {
  return Array.from({ length: DIM }, () => Math.random() - 0.5);
}

function makePattern(idx: number): QEPattern {
  return {
    id: `bench-${idx}`,
    patternType: 'test-template',
    qeDomain: 'test-generation',
    domain: 'test-generation',
    name: `Bench Pattern ${idx}`,
    description: `Benchmark pattern number ${idx} for performance testing`,
    confidence: 0.5 + Math.random() * 0.5,
    usageCount: Math.floor(Math.random() * 20),
    successRate: 0.7 + Math.random() * 0.3,
    qualityScore: 0.6 + Math.random() * 0.3,
    context: { tags: ['bench'] },
    template: { type: 'code', content: 'bench()', variables: [] },
    embedding: randomEmbedding(),
    tier: 'short-term',
    createdAt: new Date(),
    lastUsedAt: new Date(),
    successfulUses: 3,
    reusable: false,
    reuseCount: 0,
    averageTokenSavings: 0,
  } as QEPattern;
}

// ============================================================================
// Real Native Correctness
// ============================================================================

describe('RvfPatternStore — Real Native Correctness', () => {
  const nativeAvailable = isRvfNativeAvailable();

  afterAll(() => {
    cleanupBenchFiles();
  });

  it('should have @ruvector/rvf-node native binary available', () => {
    expect(nativeAvailable).toBe(true);
  });

  it.runIf(nativeAvailable)('correctness: self-search finds stored pattern', async () => {
    cleanupBenchFiles();
    if (!existsSync(BENCH_DIR)) mkdirSync(BENCH_DIR, { recursive: true });

    const store = new RvfPatternStore(
      (path, dim) => createRvfStore(path, dim),
      { rvfPath: RVF_PATH, base: undefined as any, embeddingSpaceId: TEST_SPACE_ID },
    );
    await store.initialize();

    const pattern = makePattern(42);
    await store.store(pattern);

    // Attach mock sqlite for metadata resolution
    (store as any).sqliteStore = {
      getPattern: (id: string) => id === pattern.id ? pattern : null,
    };

    // Search with the same embedding — should find it
    const result = await store.search(pattern.embedding!, { limit: 5, embeddingSpaceId: TEST_SPACE_ID });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.value.length).toBeGreaterThan(0);
      expect(result.value[0].pattern.id).toBe(pattern.id);
      expect(result.value[0].score).toBeGreaterThan(0.95);
      console.log(
        `[REAL BENCH] Self-search score: ${result.value[0].score.toFixed(4)} ` +
        `(expected ~1.0)`,
      );
    }

    await store.dispose();
    cleanupBenchFiles();
  });
});
