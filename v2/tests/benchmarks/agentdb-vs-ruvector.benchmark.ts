/**
 * AgentDB vs RuVector Performance Benchmark
 *
 * Compares the performance of AgentDB (current) vs RuVector (proposed)
 * for vector pattern storage and retrieval.
 *
 * Metrics tested:
 * - Insert latency (single)
 * - Search latency (k=10, k=100)
 * - Throughput (queries per second)
 * - Memory usage
 *
 * Expected improvements from RuVector:
 * - 61µs p50 search latency (150x faster)
 * - 16,400 QPS throughput
 * - Native Rust/WASM performance
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from '@jest/globals';
import { RuVectorPatternStore, TestPattern } from '../../src/core/memory/RuVectorPatternStore';
import { AgentDBManager, AgentDBConfig, MemoryPattern } from '../../src/core/memory/AgentDBManager';
import { AdapterType } from '../../src/core/memory/AdapterConfig';
import { createSeededRandom, SeededRandom } from '../../src/utils/SeededRandom';
import * as fs from 'fs';
import * as path from 'path';

// Seeded random instance for reproducible benchmarks
const rng = createSeededRandom(12345);

// Test configuration
const BENCHMARK_CONFIG = {
  smallDataset: 100,
  mediumDataset: 1000,
  largeDataset: 10000,
  searchIterations: 100,
  warmupIterations: 10,
  vectorDimension: 384,
};

// Results storage
interface BenchmarkResult {
  operation: string;
  datasetSize: number;
  agentDBTime: number;
  ruVectorTime: number;
  speedup: number;
  unit: string;
}

const results: BenchmarkResult[] = [];

// Helper to generate random embeddings
function generateRandomEmbedding(dimension: number = 384): number[] {
  return Array.from({ length: dimension }, () => rng.random() * 2 - 1);
}

// Helper to generate test patterns
function generateTestPatterns(count: number): TestPattern[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `pattern-${i}-${Date.now()}`,
    type: 'unit-test',
    domain: `domain-${i % 10}`,
    content: `Test pattern ${i} for benchmarking vector search performance`,
    embedding: generateRandomEmbedding(),
    framework: ['jest', 'vitest', 'mocha'][i % 3],
    coverage: 0.7 + rng.random() * 0.3,
    flakinessScore: rng.random() * 0.2,
    verdict: ['success', 'failure', 'flaky'][i % 3] as 'success' | 'failure' | 'flaky',
    createdAt: Date.now(),
    lastUsed: Date.now(),
    usageCount: rng.randomInt(0, 99),
  }));
}

// Helper to convert TestPattern to MemoryPattern for AgentDB
function toMemoryPattern(pattern: TestPattern): MemoryPattern {
  return {
    id: pattern.id,
    type: pattern.type,
    domain: pattern.domain,
    pattern_data: JSON.stringify({
      content: pattern.content,
      embedding: pattern.embedding,
      framework: pattern.framework,
      coverage: pattern.coverage,
      flakinessScore: pattern.flakinessScore,
      verdict: pattern.verdict,
    }),
    confidence: pattern.coverage ?? 0.8,
    usage_count: pattern.usageCount ?? 0,
    success_count: 0,
    created_at: pattern.createdAt ?? Date.now(),
    last_used: pattern.lastUsed ?? Date.now(),
  };
}

// Measure function execution time
async function measureTime<T>(fn: () => Promise<T> | T): Promise<{ result: T; timeMs: number }> {
  const start = performance.now();
  const result = await fn();
  const timeMs = performance.now() - start;
  return { result, timeMs };
}

// Calculate percentiles
function percentile(arr: number[], p: number): number {
  const sorted = [...arr].sort((a, b) => a - b);
  const index = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, index)];
}

describe('AgentDB vs RuVector Performance Benchmark', () => {
  const TEST_DIR = path.join(__dirname, '../fixtures/benchmark');
  let ruVectorStore: RuVectorPatternStore;
  let agentDBManager: AgentDBManager;

  beforeAll(async () => {
    // Create test directory
    if (!fs.existsSync(TEST_DIR)) {
      fs.mkdirSync(TEST_DIR, { recursive: true });
    }
  });

  afterAll(() => {
    // Print results summary
    console.log('\n' + '='.repeat(80));
    console.log('BENCHMARK RESULTS SUMMARY');
    console.log('='.repeat(80));
    console.log('\n');

    console.log('| Operation | Dataset | AgentDB | RuVector | Speedup |');
    console.log('|-----------|---------|---------|----------|---------|');

    for (const r of results) {
      const agentDBStr = `${r.agentDBTime.toFixed(3)}${r.unit}`;
      const ruVectorStr = `${r.ruVectorTime.toFixed(3)}${r.unit}`;
      const speedupStr = `${r.speedup.toFixed(1)}x`;
      console.log(`| ${r.operation.padEnd(9)} | ${String(r.datasetSize).padEnd(7)} | ${agentDBStr.padEnd(7)} | ${ruVectorStr.padEnd(8)} | ${speedupStr.padEnd(7)} |`);
    }

    console.log('\n');

    // Cleanup test directory
    if (fs.existsSync(TEST_DIR)) {
      fs.rmSync(TEST_DIR, { recursive: true, force: true });
    }
  });

  describe('Initialization', () => {
    it('should show RuVector implementation info', async () => {
      ruVectorStore = new RuVectorPatternStore({
        dimension: BENCHMARK_CONFIG.vectorDimension,
        storagePath: path.join(TEST_DIR, 'ruvector-init.db'),
        autoPersist: false,
      });

      await ruVectorStore.initialize();

      const info = ruVectorStore.getImplementationInfo();
      console.log(`\nRuVector Implementation: ${info.type} (v${info.version})`);

      expect(['native', 'fallback']).toContain(info.type);

      await ruVectorStore.shutdown();
    });
  });

  describe('Insert Performance', () => {
    beforeEach(async () => {
      // Initialize RuVector
      ruVectorStore = new RuVectorPatternStore({
        dimension: BENCHMARK_CONFIG.vectorDimension,
        storagePath: path.join(TEST_DIR, `ruvector-insert-${Date.now()}.db`),
        autoPersist: false,
      });
      await ruVectorStore.initialize();

      // Initialize AgentDB with real adapter
      const agentDBConfig: AgentDBConfig = {
        adapter: {
          type: AdapterType.REAL,
          dbPath: path.join(TEST_DIR, `agentdb-insert-${Date.now()}.db`),
          dimension: BENCHMARK_CONFIG.vectorDimension,
          failFast: true,
          validateOnStartup: true,
        },
        enableQUICSync: false,
        syncPort: 4433,
        syncPeers: [],
        enableLearning: false,
        enableReasoning: false,
        cacheSize: 1000,
        quantizationType: 'none',
      };
      agentDBManager = new AgentDBManager(agentDBConfig);
      await agentDBManager.initialize();
    });

    afterEach(async () => {
      await ruVectorStore?.shutdown();
      await agentDBManager?.shutdown();
    });

    it('should benchmark single insert (100 patterns)', async () => {
      const patterns = generateTestPatterns(BENCHMARK_CONFIG.smallDataset);

      // Benchmark AgentDB
      const agentDBTimes: number[] = [];
      for (const pattern of patterns) {
        const { timeMs } = await measureTime(() =>
          agentDBManager.storePattern(toMemoryPattern(pattern))
        );
        agentDBTimes.push(timeMs);
      }

      // Benchmark RuVector
      const ruVectorTimes: number[] = [];
      for (const pattern of patterns) {
        const { timeMs } = await measureTime(() => ruVectorStore.storePattern(pattern));
        ruVectorTimes.push(timeMs);
      }

      const agentDBAvg = agentDBTimes.reduce((a, b) => a + b, 0) / agentDBTimes.length;
      const ruVectorAvg = ruVectorTimes.reduce((a, b) => a + b, 0) / ruVectorTimes.length;
      const speedup = agentDBAvg / ruVectorAvg;

      results.push({
        operation: 'Insert',
        datasetSize: BENCHMARK_CONFIG.smallDataset,
        agentDBTime: agentDBAvg,
        ruVectorTime: ruVectorAvg,
        speedup,
        unit: 'ms',
      });

      console.log(`\nSingle Insert (${BENCHMARK_CONFIG.smallDataset} patterns):`);
      console.log(`  AgentDB avg:  ${agentDBAvg.toFixed(3)}ms`);
      console.log(`  RuVector avg: ${ruVectorAvg.toFixed(3)}ms`);
      console.log(`  Speedup:      ${speedup.toFixed(1)}x`);

      expect(ruVectorAvg).toBeLessThan(agentDBAvg * 2); // RuVector should be at least comparable
    });

    it('should benchmark batch insert (1000 patterns)', async () => {
      const patterns = generateTestPatterns(BENCHMARK_CONFIG.mediumDataset);

      // Benchmark AgentDB (sequential since no batch API)
      const { timeMs: agentDBTime } = await measureTime(async () => {
        for (const pattern of patterns) {
          await agentDBManager.storePattern(toMemoryPattern(pattern));
        }
      });

      // Benchmark RuVector batch
      const { timeMs: ruVectorTime } = await measureTime(() =>
        ruVectorStore.storeBatch(patterns)
      );

      const speedup = agentDBTime / ruVectorTime;

      results.push({
        operation: 'BatchIns',
        datasetSize: BENCHMARK_CONFIG.mediumDataset,
        agentDBTime,
        ruVectorTime,
        speedup,
        unit: 'ms',
      });

      console.log(`\nBatch Insert (${BENCHMARK_CONFIG.mediumDataset} patterns):`);
      console.log(`  AgentDB:  ${agentDBTime.toFixed(2)}ms (sequential)`);
      console.log(`  RuVector: ${ruVectorTime.toFixed(2)}ms (batch)`);
      console.log(`  Speedup:  ${speedup.toFixed(1)}x`);

      expect(ruVectorTime).toBeLessThan(agentDBTime * 2);
    });
  });

  describe('Search Performance', () => {
    const testPatterns = generateTestPatterns(BENCHMARK_CONFIG.mediumDataset);

    beforeEach(async () => {
      // Initialize and populate RuVector
      ruVectorStore = new RuVectorPatternStore({
        dimension: BENCHMARK_CONFIG.vectorDimension,
        storagePath: path.join(TEST_DIR, `ruvector-search-${Date.now()}.db`),
        autoPersist: false,
      });
      await ruVectorStore.initialize();
      await ruVectorStore.storeBatch(testPatterns);
      await ruVectorStore.buildIndex();

      // Initialize and populate AgentDB
      const agentDBConfig: AgentDBConfig = {
        adapter: {
          type: AdapterType.REAL,
          dbPath: path.join(TEST_DIR, `agentdb-search-${Date.now()}.db`),
          dimension: BENCHMARK_CONFIG.vectorDimension,
          failFast: true,
          validateOnStartup: true,
        },
        enableQUICSync: false,
        syncPort: 4433,
        syncPeers: [],
        enableLearning: false,
        enableReasoning: false,
        cacheSize: 1000,
        quantizationType: 'none',
      };
      agentDBManager = new AgentDBManager(agentDBConfig);
      await agentDBManager.initialize();

      // Insert patterns sequentially
      for (const pattern of testPatterns) {
        await agentDBManager.storePattern(toMemoryPattern(pattern));
      }
    });

    afterEach(async () => {
      await ruVectorStore?.shutdown();
      await agentDBManager?.shutdown();
    });

    it('should benchmark search k=10 (1000 patterns)', async () => {
      const queryEmbedding = generateRandomEmbedding();

      // Warmup
      for (let i = 0; i < BENCHMARK_CONFIG.warmupIterations; i++) {
        await agentDBManager.retrieve(queryEmbedding, { k: 10 });
        await ruVectorStore.searchSimilar(queryEmbedding, { k: 10 });
      }

      // Benchmark AgentDB
      const agentDBTimes: number[] = [];
      for (let i = 0; i < BENCHMARK_CONFIG.searchIterations; i++) {
        const { timeMs } = await measureTime(() =>
          agentDBManager.retrieve(queryEmbedding, { k: 10 })
        );
        agentDBTimes.push(timeMs);
      }

      // Benchmark RuVector
      const ruVectorTimes: number[] = [];
      for (let i = 0; i < BENCHMARK_CONFIG.searchIterations; i++) {
        const { timeMs } = await measureTime(() =>
          ruVectorStore.searchSimilar(queryEmbedding, { k: 10 })
        );
        ruVectorTimes.push(timeMs);
      }

      const agentDBP50 = percentile(agentDBTimes, 50);
      const agentDBP99 = percentile(agentDBTimes, 99);
      const ruVectorP50 = percentile(ruVectorTimes, 50);
      const ruVectorP99 = percentile(ruVectorTimes, 99);
      const speedup = agentDBP50 / ruVectorP50;

      results.push({
        operation: 'Search10',
        datasetSize: BENCHMARK_CONFIG.mediumDataset,
        agentDBTime: agentDBP50,
        ruVectorTime: ruVectorP50,
        speedup,
        unit: 'ms',
      });

      console.log(`\nSearch k=10 (${BENCHMARK_CONFIG.mediumDataset} patterns, ${BENCHMARK_CONFIG.searchIterations} iterations):`);
      console.log(`  AgentDB  p50: ${agentDBP50.toFixed(3)}ms, p99: ${agentDBP99.toFixed(3)}ms`);
      console.log(`  RuVector p50: ${ruVectorP50.toFixed(3)}ms, p99: ${ruVectorP99.toFixed(3)}ms`);
      console.log(`  Speedup (p50): ${speedup.toFixed(1)}x`);

      // RuVector should be significantly faster
      expect(ruVectorP50).toBeLessThan(1); // Target: <1ms
    });

    it('should benchmark search k=100 (1000 patterns)', async () => {
      const queryEmbedding = generateRandomEmbedding();

      // Warmup
      for (let i = 0; i < BENCHMARK_CONFIG.warmupIterations; i++) {
        await agentDBManager.retrieve(queryEmbedding, { k: 100 });
        await ruVectorStore.searchSimilar(queryEmbedding, { k: 100 });
      }

      // Benchmark AgentDB
      const agentDBTimes: number[] = [];
      for (let i = 0; i < BENCHMARK_CONFIG.searchIterations; i++) {
        const { timeMs } = await measureTime(() =>
          agentDBManager.retrieve(queryEmbedding, { k: 100 })
        );
        agentDBTimes.push(timeMs);
      }

      // Benchmark RuVector
      const ruVectorTimes: number[] = [];
      for (let i = 0; i < BENCHMARK_CONFIG.searchIterations; i++) {
        const { timeMs } = await measureTime(() =>
          ruVectorStore.searchSimilar(queryEmbedding, { k: 100 })
        );
        ruVectorTimes.push(timeMs);
      }

      const agentDBP50 = percentile(agentDBTimes, 50);
      const ruVectorP50 = percentile(ruVectorTimes, 50);
      const speedup = agentDBP50 / ruVectorP50;

      results.push({
        operation: 'Search100',
        datasetSize: BENCHMARK_CONFIG.mediumDataset,
        agentDBTime: agentDBP50,
        ruVectorTime: ruVectorP50,
        speedup,
        unit: 'ms',
      });

      console.log(`\nSearch k=100 (${BENCHMARK_CONFIG.mediumDataset} patterns):`);
      console.log(`  AgentDB  p50: ${agentDBP50.toFixed(3)}ms`);
      console.log(`  RuVector p50: ${ruVectorP50.toFixed(3)}ms`);
      console.log(`  Speedup (p50): ${speedup.toFixed(1)}x`);
    });
  });

  describe('Throughput (QPS)', () => {
    beforeEach(async () => {
      const patterns = generateTestPatterns(BENCHMARK_CONFIG.mediumDataset);

      // Initialize RuVector
      ruVectorStore = new RuVectorPatternStore({
        dimension: BENCHMARK_CONFIG.vectorDimension,
        storagePath: path.join(TEST_DIR, `ruvector-qps-${Date.now()}.db`),
        autoPersist: false,
      });
      await ruVectorStore.initialize();
      await ruVectorStore.storeBatch(patterns);
      await ruVectorStore.buildIndex();

      // Initialize AgentDB
      const agentDBConfig: AgentDBConfig = {
        adapter: {
          type: AdapterType.REAL,
          dbPath: path.join(TEST_DIR, `agentdb-qps-${Date.now()}.db`),
          dimension: BENCHMARK_CONFIG.vectorDimension,
          failFast: true,
          validateOnStartup: true,
        },
        enableQUICSync: false,
        syncPort: 4433,
        syncPeers: [],
        enableLearning: false,
        enableReasoning: false,
        cacheSize: 1000,
        quantizationType: 'none',
      };
      agentDBManager = new AgentDBManager(agentDBConfig);
      await agentDBManager.initialize();

      for (const pattern of patterns) {
        await agentDBManager.storePattern(toMemoryPattern(pattern));
      }
    });

    afterEach(async () => {
      await ruVectorStore?.shutdown();
      await agentDBManager?.shutdown();
    });

    it('should measure queries per second', async () => {
      const queryEmbedding = generateRandomEmbedding();
      const testDurationMs = 1000; // 1 second

      // Measure AgentDB QPS
      let agentDBQueries = 0;
      const agentDBStart = performance.now();
      while (performance.now() - agentDBStart < testDurationMs) {
        await agentDBManager.retrieve(queryEmbedding, { k: 10 });
        agentDBQueries++;
      }
      const agentDBQPS = agentDBQueries / ((performance.now() - agentDBStart) / 1000);

      // Measure RuVector QPS
      let ruVectorQueries = 0;
      const ruVectorStart = performance.now();
      while (performance.now() - ruVectorStart < testDurationMs) {
        await ruVectorStore.searchSimilar(queryEmbedding, { k: 10 });
        ruVectorQueries++;
      }
      const ruVectorQPS = ruVectorQueries / ((performance.now() - ruVectorStart) / 1000);

      const speedup = ruVectorQPS / agentDBQPS;

      results.push({
        operation: 'QPS',
        datasetSize: BENCHMARK_CONFIG.mediumDataset,
        agentDBTime: agentDBQPS,
        ruVectorTime: ruVectorQPS,
        speedup,
        unit: 'qps',
      });

      console.log(`\nThroughput (${BENCHMARK_CONFIG.mediumDataset} patterns):`);
      console.log(`  AgentDB:  ${agentDBQPS.toFixed(0)} QPS`);
      console.log(`  RuVector: ${ruVectorQPS.toFixed(0)} QPS`);
      console.log(`  Speedup:  ${speedup.toFixed(1)}x`);

      expect(ruVectorQPS).toBeGreaterThan(agentDBQPS);
    });
  });

  describe('Memory Usage', () => {
    it('should compare memory footprint', async () => {
      const patterns = generateTestPatterns(BENCHMARK_CONFIG.mediumDataset);

      // RuVector memory
      ruVectorStore = new RuVectorPatternStore({
        dimension: BENCHMARK_CONFIG.vectorDimension,
        storagePath: path.join(TEST_DIR, `ruvector-mem-${Date.now()}.db`),
        autoPersist: false,
      });
      await ruVectorStore.initialize();
      await ruVectorStore.storeBatch(patterns);

      const ruVectorStats = await ruVectorStore.getStats();

      // AgentDB memory
      const agentDBConfig: AgentDBConfig = {
        adapter: {
          type: AdapterType.REAL,
          dbPath: path.join(TEST_DIR, `agentdb-mem-${Date.now()}.db`),
          dimension: BENCHMARK_CONFIG.vectorDimension,
          failFast: true,
          validateOnStartup: true,
        },
        enableQUICSync: false,
        syncPort: 4433,
        syncPeers: [],
        enableLearning: false,
        enableReasoning: false,
        cacheSize: 1000,
        quantizationType: 'none',
      };
      agentDBManager = new AgentDBManager(agentDBConfig);
      await agentDBManager.initialize();

      for (const pattern of patterns) {
        await agentDBManager.storePattern(toMemoryPattern(pattern));
      }

      const agentDBStats = await agentDBManager.getStats();

      console.log(`\nMemory Usage (${BENCHMARK_CONFIG.mediumDataset} patterns):`);
      console.log(`  RuVector: ${ruVectorStats.count} vectors, ${ruVectorStats.memoryUsage ?? 'N/A'} bytes`);
      console.log(`  RuVector implementation: ${ruVectorStats.implementation}`);
      console.log(`  AgentDB stats: ${JSON.stringify(agentDBStats)}`);

      await ruVectorStore.shutdown();
      await agentDBManager.shutdown();

      expect(ruVectorStats.count).toBe(BENCHMARK_CONFIG.mediumDataset);
    });
  });

  describe('Scale Test', () => {
    it('should handle 10,000 patterns efficiently', async () => {
      const patterns = generateTestPatterns(BENCHMARK_CONFIG.largeDataset);

      // RuVector scale test
      ruVectorStore = new RuVectorPatternStore({
        dimension: BENCHMARK_CONFIG.vectorDimension,
        storagePath: path.join(TEST_DIR, `ruvector-scale-${Date.now()}.db`),
        autoPersist: false,
      });
      await ruVectorStore.initialize();

      const { timeMs: ruVectorInsertTime } = await measureTime(() =>
        ruVectorStore.storeBatch(patterns)
      );

      await ruVectorStore.buildIndex();

      const queryEmbedding = generateRandomEmbedding();

      // Warmup
      for (let i = 0; i < 10; i++) {
        await ruVectorStore.searchSimilar(queryEmbedding, { k: 10 });
      }

      // Measure search time at scale
      const searchTimes: number[] = [];
      for (let i = 0; i < 50; i++) {
        const { timeMs } = await measureTime(() =>
          ruVectorStore.searchSimilar(queryEmbedding, { k: 10 })
        );
        searchTimes.push(timeMs);
      }

      const p50 = percentile(searchTimes, 50);
      const p99 = percentile(searchTimes, 99);

      results.push({
        operation: 'Scale10K',
        datasetSize: BENCHMARK_CONFIG.largeDataset,
        agentDBTime: 0, // Not tested at this scale
        ruVectorTime: p50,
        speedup: 0,
        unit: 'ms',
      });

      console.log(`\nScale Test (${BENCHMARK_CONFIG.largeDataset} patterns):`);
      console.log(`  Insert time: ${ruVectorInsertTime.toFixed(2)}ms`);
      console.log(`  Search p50:  ${p50.toFixed(3)}ms`);
      console.log(`  Search p99:  ${p99.toFixed(3)}ms`);

      await ruVectorStore.shutdown();

      // Target: <1ms search even at 10K scale
      expect(p50).toBeLessThan(1);
    });
  });
});
