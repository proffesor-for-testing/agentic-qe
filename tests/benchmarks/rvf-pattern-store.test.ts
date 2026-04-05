/**
 * Benchmark: RvfPatternStore with REAL @ruvector/rvf-node native backend
 *
 * Measures actual user-facing performance with disk-backed HNSW:
 * 1. Cold-start time (open .rvf file + index ready)
 * 2. Ingest throughput (patterns/second to native HNSW)
 * 3. Search latency p50/p95 (native SIMD-accelerated queries)
 * 4. Correctness (self-search returns stored pattern)
 *
 * Run: npx vitest run tests/benchmarks/rvf-pattern-store.test.ts
 */

import { describe, it, expect, afterAll } from 'vitest';
import { existsSync, unlinkSync, mkdirSync } from 'fs';
import { join } from 'path';
import { RvfPatternStore } from '../../src/learning/rvf-pattern-store.js';
import {
  createRvfStore,
  isRvfNativeAvailable,
} from '../../src/integrations/ruvector/rvf-native-adapter.js';
import type { QEPattern } from '../../src/learning/qe-patterns.js';

// ============================================================================
// Helpers
// ============================================================================

const BENCH_DIR = join(process.cwd(), '.agentic-qe', 'bench-tmp');
const RVF_PATH = join(BENCH_DIR, 'bench-patterns.rvf');
const DIM = 384;

function cleanupBenchFiles(): void {
  for (const ext of ['', '.idmap.json']) {
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
// Real Native Benchmarks
// ============================================================================

describe('RvfPatternStore — Real Native Benchmarks', () => {
  const nativeAvailable = isRvfNativeAvailable();

  afterAll(() => {
    cleanupBenchFiles();
  });

  it('should have @ruvector/rvf-node native binary available', () => {
    expect(nativeAvailable).toBe(true);
  });

  it.runIf(nativeAvailable)('cold-start: open/create .rvf file', async () => {
    cleanupBenchFiles();
    if (!existsSync(BENCH_DIR)) mkdirSync(BENCH_DIR, { recursive: true });

    const start = performance.now();
    const store = new RvfPatternStore(
      (path, dim) => createRvfStore(path, dim),
      { rvfPath: RVF_PATH, base: undefined as any },
    );
    await store.initialize();
    const coldStartMs = performance.now() - start;
    await store.dispose();

    console.log(`[REAL BENCH] Cold-start (create new .rvf): ${coldStartMs.toFixed(2)}ms`);
    // Creating a new .rvf file should be fast (no index to rebuild)
    expect(coldStartMs).toBeLessThan(500);
  });

  it.runIf(nativeAvailable)('ingest 1000 patterns into native HNSW', async () => {
    cleanupBenchFiles();
    if (!existsSync(BENCH_DIR)) mkdirSync(BENCH_DIR, { recursive: true });

    const store = new RvfPatternStore(
      (path, dim) => createRvfStore(path, dim),
      { rvfPath: RVF_PATH, base: undefined as any },
    );
    await store.initialize();

    const PATTERN_COUNT = 1000;
    const patterns = Array.from({ length: PATTERN_COUNT }, (_, i) => makePattern(i));

    const start = performance.now();
    for (const p of patterns) {
      await store.store(p);
    }
    const ingestMs = performance.now() - start;
    const throughput = PATTERN_COUNT / (ingestMs / 1000);

    console.log(
      `[REAL BENCH] Ingest ${PATTERN_COUNT} patterns: ${ingestMs.toFixed(2)}ms ` +
      `(${throughput.toFixed(0)} patterns/sec)`,
    );

    const stats = await store.getStats();
    console.log(`[REAL BENCH] RVF status: ${stats.totalPatterns} vectors, ${stats.hnswStats.indexSizeBytes} bytes`);

    expect(stats.totalPatterns).toBe(PATTERN_COUNT);
    expect(ingestMs).toBeLessThan(10000); // generous limit for CI

    await store.dispose();
  });

  it.runIf(nativeAvailable)('ingest + search latency with 1000 patterns in same session', async () => {
    cleanupBenchFiles();
    if (!existsSync(BENCH_DIR)) mkdirSync(BENCH_DIR, { recursive: true });

    const store = new RvfPatternStore(
      (path, dim) => createRvfStore(path, dim),
      { rvfPath: join(BENCH_DIR, 'search-bench.rvf'), base: undefined as any },
    );
    await store.initialize();

    // Ingest 1000 patterns
    const PATTERN_COUNT = 1000;
    const patternMap = new Map<string, QEPattern>();
    for (let i = 0; i < PATTERN_COUNT; i++) {
      const p = makePattern(i);
      patternMap.set(p.id, p);
      await store.store(p);
    }

    // Attach mock sqlite for metadata resolution
    (store as any).sqliteStore = {
      getPattern: (id: string) => patternMap.get(id) ?? null,
    };

    // Run 100 search queries and measure latency
    const latencies: number[] = [];
    for (let i = 0; i < 100; i++) {
      const query = randomEmbedding();
      const start = performance.now();
      const result = await store.search(query, { limit: 10 });
      latencies.push(performance.now() - start);

      if (i === 0 && result.success) {
        console.log(`[REAL BENCH] First search returned ${result.value.length} results`);
      }
    }

    latencies.sort((a, b) => a - b);
    const p50 = latencies[Math.floor(latencies.length * 0.5)];
    const p95 = latencies[Math.floor(latencies.length * 0.95)];
    const avg = latencies.reduce((s, l) => s + l, 0) / latencies.length;

    console.log(
      `[REAL BENCH] Search (${PATTERN_COUNT} patterns): avg=${avg.toFixed(2)}ms ` +
      `p50=${p50.toFixed(2)}ms p95=${p95.toFixed(2)}ms`,
    );

    expect(p95).toBeLessThan(50);

    await store.dispose();
    // Cleanup
    for (const ext of ['', '.idmap.json']) {
      const p = join(BENCH_DIR, `search-bench.rvf${ext}`);
      if (existsSync(p)) unlinkSync(p);
    }
  });

  it.runIf(nativeAvailable)('correctness: self-search finds stored pattern', async () => {
    cleanupBenchFiles();
    if (!existsSync(BENCH_DIR)) mkdirSync(BENCH_DIR, { recursive: true });

    const store = new RvfPatternStore(
      (path, dim) => createRvfStore(path, dim),
      { rvfPath: RVF_PATH, base: undefined as any },
    );
    await store.initialize();

    const pattern = makePattern(42);
    await store.store(pattern);

    // Attach mock sqlite for metadata resolution
    (store as any).sqliteStore = {
      getPattern: (id: string) => id === pattern.id ? pattern : null,
    };

    // Search with the same embedding — should find it
    const result = await store.search(pattern.embedding!, { limit: 5 });

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
