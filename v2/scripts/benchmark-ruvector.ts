#!/usr/bin/env ts-node
/**
 * RuVector vs AgentDB Standalone Benchmark
 *
 * Run: npx ts-node scripts/benchmark-ruvector.ts
 */

import { RuVectorPatternStore, TestPattern } from '../src/core/memory/RuVectorPatternStore';
import { AgentDBManager, MemoryPattern } from '../src/core/memory/AgentDBManager';
import { AdapterType } from '../src/core/memory/AdapterConfig';
import * as fs from 'fs';
import * as path from 'path';

const BENCHMARK_CONFIG = {
  smallDataset: 100,
  mediumDataset: 1000,
  largeDataset: 10000,
  searchIterations: 100,
  warmupIterations: 10,
  vectorDimension: 384,
};

function generateRandomEmbedding(dimension: number = 384): number[] {
  return Array.from({ length: dimension }, () => Math.random() * 2 - 1);
}

function generateTestPatterns(count: number): TestPattern[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `pattern-${i}-${Date.now()}`,
    type: 'unit-test',
    domain: `domain-${i % 10}`,
    content: `Test pattern ${i} for benchmarking vector search performance`,
    embedding: generateRandomEmbedding(),
    framework: ['jest', 'vitest', 'mocha'][i % 3],
    coverage: 0.7 + Math.random() * 0.3,
    flakinessScore: Math.random() * 0.2,
    verdict: ['success', 'failure', 'flaky'][i % 3] as 'success' | 'failure' | 'flaky',
    createdAt: Date.now(),
    lastUsed: Date.now(),
    usageCount: Math.floor(Math.random() * 100),
  }));
}

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
    }),
    confidence: pattern.coverage ?? 0.8,
    usage_count: pattern.usageCount ?? 0,
    success_count: 0,
    created_at: pattern.createdAt ?? Date.now(),
    last_used: pattern.lastUsed ?? Date.now(),
  };
}

async function measureTime<T>(fn: () => Promise<T> | T): Promise<{ result: T; timeMs: number }> {
  const start = performance.now();
  const result = await fn();
  const timeMs = performance.now() - start;
  return { result, timeMs };
}

function percentile(arr: number[], p: number): number {
  const sorted = [...arr].sort((a, b) => a - b);
  const index = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, index)];
}

async function benchmarkRuVector() {
  console.log('='.repeat(70));
  console.log('RuVector Benchmark (Native @ruvector/core)');
  console.log('='.repeat(70));

  const TEST_DIR = '/tmp/ruvector-benchmark';
  if (!fs.existsSync(TEST_DIR)) {
    fs.mkdirSync(TEST_DIR, { recursive: true });
  }

  const store = new RuVectorPatternStore({
    dimension: BENCHMARK_CONFIG.vectorDimension,
    storagePath: path.join(TEST_DIR, `ruvector-${Date.now()}.db`),
    autoPersist: false,
  });

  await store.initialize();
  const info = store.getImplementationInfo();
  console.log(`\nImplementation: ${info.type} (v${info.version})`);

  // 1. INSERT BENCHMARK
  console.log('\n--- INSERT BENCHMARK ---');
  const patterns = generateTestPatterns(BENCHMARK_CONFIG.mediumDataset);

  const { timeMs: insertTime } = await measureTime(() => store.storeBatch(patterns));
  console.log(`Inserted ${patterns.length} patterns in ${insertTime.toFixed(2)}ms`);
  console.log(`Throughput: ${Math.round(patterns.length / (insertTime / 1000))} inserts/sec`);

  await store.buildIndex();
  console.log('HNSW index built');

  // 2. SEARCH BENCHMARK
  console.log('\n--- SEARCH BENCHMARK (k=10) ---');
  const queryEmbedding = generateRandomEmbedding();

  // Warmup
  for (let i = 0; i < BENCHMARK_CONFIG.warmupIterations; i++) {
    await store.searchSimilar(queryEmbedding, { k: 10 });
  }

  const searchTimes: number[] = [];
  for (let i = 0; i < BENCHMARK_CONFIG.searchIterations; i++) {
    const { timeMs } = await measureTime(() => store.searchSimilar(queryEmbedding, { k: 10 }));
    searchTimes.push(timeMs);
  }

  const avgLatency = searchTimes.reduce((a, b) => a + b, 0) / searchTimes.length;
  const p50Latency = percentile(searchTimes, 50);
  const p99Latency = percentile(searchTimes, 99);

  console.log(`Avg latency:  ${avgLatency.toFixed(4)}ms (${(avgLatency * 1000).toFixed(1)} µs)`);
  console.log(`p50 latency:  ${p50Latency.toFixed(4)}ms (${(p50Latency * 1000).toFixed(1)} µs)`);
  console.log(`p99 latency:  ${p99Latency.toFixed(4)}ms (${(p99Latency * 1000).toFixed(1)} µs)`);

  // 3. THROUGHPUT TEST
  console.log('\n--- THROUGHPUT TEST ---');
  const testDurationMs = 1000;
  let queries = 0;
  const startTime = performance.now();
  while (performance.now() - startTime < testDurationMs) {
    await store.searchSimilar(queryEmbedding, { k: 10 });
    queries++;
  }
  const actualDuration = performance.now() - startTime;
  const qps = queries / (actualDuration / 1000);
  console.log(`QPS: ${Math.round(qps)} queries/second`);

  // 4. SCALE TEST (10K)
  console.log('\n--- SCALE TEST (10K patterns) ---');
  const largePatterns = generateTestPatterns(BENCHMARK_CONFIG.largeDataset);

  const scaleStore = new RuVectorPatternStore({
    dimension: BENCHMARK_CONFIG.vectorDimension,
    storagePath: path.join(TEST_DIR, `ruvector-scale-${Date.now()}.db`),
    autoPersist: false,
  });
  await scaleStore.initialize();

  const { timeMs: scaleInsertTime } = await measureTime(() => scaleStore.storeBatch(largePatterns));
  console.log(`Insert 10K: ${scaleInsertTime.toFixed(2)}ms`);

  await scaleStore.buildIndex();

  // Warmup
  for (let i = 0; i < 10; i++) {
    await scaleStore.searchSimilar(queryEmbedding, { k: 10 });
  }

  const scaleSearchTimes: number[] = [];
  for (let i = 0; i < 50; i++) {
    const { timeMs } = await measureTime(() => scaleStore.searchSimilar(queryEmbedding, { k: 10 }));
    scaleSearchTimes.push(timeMs);
  }

  const scaleP50 = percentile(scaleSearchTimes, 50);
  const scaleP99 = percentile(scaleSearchTimes, 99);
  console.log(`10K Search p50: ${scaleP50.toFixed(4)}ms (${(scaleP50 * 1000).toFixed(1)} µs)`);
  console.log(`10K Search p99: ${scaleP99.toFixed(4)}ms (${(scaleP99 * 1000).toFixed(1)} µs)`);

  await store.shutdown();
  await scaleStore.shutdown();

  // Cleanup
  fs.rmSync(TEST_DIR, { recursive: true, force: true });

  return {
    insertThroughput: patterns.length / (insertTime / 1000),
    p50Latency,
    p99Latency,
    qps,
    scale10kP50: scaleP50,
  };
}

async function benchmarkAgentDB() {
  console.log('\n' + '='.repeat(70));
  console.log('AgentDB Benchmark (SQLite-based)');
  console.log('='.repeat(70));

  const TEST_DIR = '/tmp/agentdb-benchmark';
  if (!fs.existsSync(TEST_DIR)) {
    fs.mkdirSync(TEST_DIR, { recursive: true });
  }

  try {
    const manager = new AgentDBManager({
      adapter: {
        type: AdapterType.REAL,
        dbPath: path.join(TEST_DIR, `agentdb-${Date.now()}.db`),
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
    });

    await manager.initialize();
    console.log('\nAgentDB initialized');

    // 1. INSERT BENCHMARK
    console.log('\n--- INSERT BENCHMARK ---');
    const patterns = generateTestPatterns(BENCHMARK_CONFIG.mediumDataset);

    const { timeMs: insertTime } = await measureTime(async () => {
      for (const pattern of patterns) {
        await manager.storePattern(toMemoryPattern(pattern));
      }
    });
    console.log(`Inserted ${patterns.length} patterns in ${insertTime.toFixed(2)}ms (sequential)`);
    console.log(`Throughput: ${Math.round(patterns.length / (insertTime / 1000))} inserts/sec`);

    // 2. SEARCH BENCHMARK
    console.log('\n--- SEARCH BENCHMARK (k=10) ---');
    const queryEmbedding = generateRandomEmbedding();

    // Warmup
    for (let i = 0; i < BENCHMARK_CONFIG.warmupIterations; i++) {
      await manager.retrieve(queryEmbedding, { k: 10 });
    }

    const searchTimes: number[] = [];
    for (let i = 0; i < BENCHMARK_CONFIG.searchIterations; i++) {
      const { timeMs } = await measureTime(() => manager.retrieve(queryEmbedding, { k: 10 }));
      searchTimes.push(timeMs);
    }

    const avgLatency = searchTimes.reduce((a, b) => a + b, 0) / searchTimes.length;
    const p50Latency = percentile(searchTimes, 50);
    const p99Latency = percentile(searchTimes, 99);

    console.log(`Avg latency:  ${avgLatency.toFixed(4)}ms`);
    console.log(`p50 latency:  ${p50Latency.toFixed(4)}ms`);
    console.log(`p99 latency:  ${p99Latency.toFixed(4)}ms`);

    // 3. THROUGHPUT TEST
    console.log('\n--- THROUGHPUT TEST ---');
    const testDurationMs = 1000;
    let queries = 0;
    const startTime = performance.now();
    while (performance.now() - startTime < testDurationMs) {
      await manager.retrieve(queryEmbedding, { k: 10 });
      queries++;
    }
    const actualDuration = performance.now() - startTime;
    const qps = queries / (actualDuration / 1000);
    console.log(`QPS: ${Math.round(qps)} queries/second`);

    await manager.shutdown();

    // Cleanup
    fs.rmSync(TEST_DIR, { recursive: true, force: true });

    return {
      insertThroughput: patterns.length / (insertTime / 1000),
      p50Latency,
      p99Latency,
      qps,
    };
  } catch (error: any) {
    console.log(`\nAgentDB benchmark failed: ${error.message}`);
    fs.rmSync(TEST_DIR, { recursive: true, force: true });
    return null;
  }
}

async function main() {
  console.log('\n');
  console.log('╔═══════════════════════════════════════════════════════════════════╗');
  console.log('║     RuVector vs AgentDB Performance Comparison Benchmark          ║');
  console.log('║     Platform: ' + process.platform.padEnd(10) + ' Architecture: ' + process.arch.padEnd(15) + '  ║');
  console.log('╚═══════════════════════════════════════════════════════════════════╝');

  const ruVectorResults = await benchmarkRuVector();
  const agentDBResults = await benchmarkAgentDB();

  // Summary
  console.log('\n' + '='.repeat(70));
  console.log('BENCHMARK SUMMARY');
  console.log('='.repeat(70));
  console.log('\n| Metric           | RuVector      | AgentDB       | Speedup |');
  console.log('|------------------|---------------|---------------|---------|');

  if (agentDBResults) {
    const insertSpeedup = ruVectorResults.insertThroughput / agentDBResults.insertThroughput;
    const latencySpeedup = agentDBResults.p50Latency / ruVectorResults.p50Latency;
    const qpsSpeedup = ruVectorResults.qps / agentDBResults.qps;

    console.log(`| Insert (ops/s)   | ${ruVectorResults.insertThroughput.toFixed(0).padStart(13)} | ${agentDBResults.insertThroughput.toFixed(0).padStart(13)} | ${insertSpeedup.toFixed(1).padStart(6)}x |`);
    console.log(`| Search p50 (ms)  | ${ruVectorResults.p50Latency.toFixed(4).padStart(13)} | ${agentDBResults.p50Latency.toFixed(4).padStart(13)} | ${latencySpeedup.toFixed(1).padStart(6)}x |`);
    console.log(`| Search p99 (ms)  | ${ruVectorResults.p99Latency.toFixed(4).padStart(13)} | ${agentDBResults.p99Latency.toFixed(4).padStart(13)} | ${(agentDBResults.p99Latency / ruVectorResults.p99Latency).toFixed(1).padStart(6)}x |`);
    console.log(`| Throughput (QPS) | ${ruVectorResults.qps.toFixed(0).padStart(13)} | ${agentDBResults.qps.toFixed(0).padStart(13)} | ${qpsSpeedup.toFixed(1).padStart(6)}x |`);
  } else {
    console.log(`| Insert (ops/s)   | ${ruVectorResults.insertThroughput.toFixed(0).padStart(13)} | N/A           | N/A     |`);
    console.log(`| Search p50 (ms)  | ${ruVectorResults.p50Latency.toFixed(4).padStart(13)} | N/A           | N/A     |`);
    console.log(`| Search p99 (ms)  | ${ruVectorResults.p99Latency.toFixed(4).padStart(13)} | N/A           | N/A     |`);
    console.log(`| Throughput (QPS) | ${ruVectorResults.qps.toFixed(0).padStart(13)} | N/A           | N/A     |`);
  }

  console.log(`| Scale 10K p50    | ${ruVectorResults.scale10kP50.toFixed(4).padStart(13)} | N/A           | N/A     |`);
  console.log('\n');
}

main().catch(console.error);
