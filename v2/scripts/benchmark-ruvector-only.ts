#!/usr/bin/env ts-node
/**
 * RuVector Standalone Benchmark (No AgentDB dependency)
 *
 * Run: npx ts-node scripts/benchmark-ruvector-only.ts
 */

import * as fs from 'fs';
import * as path from 'path';

// Direct import from @ruvector/core
const ruvector = require('@ruvector/core');

const BENCHMARK_CONFIG = {
  smallDataset: 100,
  mediumDataset: 1000,
  largeDataset: 10000,
  searchIterations: 100,
  warmupIterations: 10,
  vectorDimension: 384,
};

function generateRandomEmbedding(dimension: number = 384): Float32Array {
  const arr = new Float32Array(dimension);
  for (let i = 0; i < dimension; i++) {
    arr[i] = Math.random() * 2 - 1;
  }
  return arr;
}

function generateTestVectors(count: number) {
  return Array.from({ length: count }, (_, i) => ({
    id: `vec-${i}-${Date.now()}`,
    vector: generateRandomEmbedding(),
  }));
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

async function main() {
  console.log('\n');
  console.log('╔═══════════════════════════════════════════════════════════════════╗');
  console.log('║     RuVector Performance Benchmark (@ruvector/core native)        ║');
  console.log('║     Platform: ' + process.platform.padEnd(10) + ' Architecture: ' + process.arch.padEnd(15) + '  ║');
  console.log('╚═══════════════════════════════════════════════════════════════════╝');

  // Check version
  try {
    const version = ruvector.version();
    console.log(`\nRuVector version: ${version}`);
  } catch (e) {
    console.log('\nRuVector loaded (version unavailable)');
  }

  // Create database (note: VectorDb with lowercase 'd')
  const db = new ruvector.VectorDb({
    dimensions: BENCHMARK_CONFIG.vectorDimension,
    distanceMetric: 'Cosine',
  });

  console.log('\n' + '='.repeat(60));
  console.log('INSERT BENCHMARK (1000 vectors)');
  console.log('='.repeat(60));

  const vectors = generateTestVectors(BENCHMARK_CONFIG.mediumDataset);

  // Batch insert
  const { timeMs: batchInsertTime } = await measureTime(async () => {
    await db.insertBatch(vectors);
  });

  console.log(`\nBatch insert time: ${batchInsertTime.toFixed(2)}ms`);
  console.log(`Throughput:        ${Math.round(vectors.length / (batchInsertTime / 1000))} inserts/sec`);

  // Verify count
  const count = await db.len();
  console.log(`Vectors stored:    ${count}`);

  console.log('\n' + '='.repeat(60));
  console.log('SEARCH BENCHMARK (k=10, 100 iterations)');
  console.log('='.repeat(60));

  const queryVector = generateRandomEmbedding();

  // Warmup
  console.log('\nWarmup...');
  for (let i = 0; i < BENCHMARK_CONFIG.warmupIterations; i++) {
    await db.search({ vector: queryVector, k: 10 });
  }

  // Benchmark
  const searchTimes: number[] = [];
  for (let i = 0; i < BENCHMARK_CONFIG.searchIterations; i++) {
    const { timeMs } = await measureTime(() => db.search({ vector: queryVector, k: 10 }));
    searchTimes.push(timeMs);
  }

  const avgLatency = searchTimes.reduce((a, b) => a + b, 0) / searchTimes.length;
  const p50Latency = percentile(searchTimes, 50);
  const p99Latency = percentile(searchTimes, 99);
  const minLatency = Math.min(...searchTimes);
  const maxLatency = Math.max(...searchTimes);

  console.log(`\nSearch Latency (${BENCHMARK_CONFIG.searchIterations} iterations):`);
  console.log(`  Avg:  ${avgLatency.toFixed(4)}ms (${(avgLatency * 1000).toFixed(1)} µs)`);
  console.log(`  p50:  ${p50Latency.toFixed(4)}ms (${(p50Latency * 1000).toFixed(1)} µs)`);
  console.log(`  p99:  ${p99Latency.toFixed(4)}ms (${(p99Latency * 1000).toFixed(1)} µs)`);
  console.log(`  Min:  ${minLatency.toFixed(4)}ms (${(minLatency * 1000).toFixed(1)} µs)`);
  console.log(`  Max:  ${maxLatency.toFixed(4)}ms (${(maxLatency * 1000).toFixed(1)} µs)`);

  console.log('\n' + '='.repeat(60));
  console.log('THROUGHPUT TEST (QPS)');
  console.log('='.repeat(60));

  const testDurationMs = 1000;
  let queries = 0;
  const startTime = performance.now();
  while (performance.now() - startTime < testDurationMs) {
    await db.search({ vector: queryVector, k: 10 });
    queries++;
  }
  const actualDuration = performance.now() - startTime;
  const qps = queries / (actualDuration / 1000);
  console.log(`\nQueries in 1 second: ${queries}`);
  console.log(`QPS:                 ${Math.round(qps)} queries/second`);

  console.log('\n' + '='.repeat(60));
  console.log('SCALE TEST (10,000 vectors)');
  console.log('='.repeat(60));

  const scaleDb = new ruvector.VectorDb({
    dimensions: BENCHMARK_CONFIG.vectorDimension,
    distanceMetric: 'Cosine',
  });

  const largeVectors = generateTestVectors(BENCHMARK_CONFIG.largeDataset);

  const { timeMs: scaleInsertTime } = await measureTime(async () => {
    await scaleDb.insertBatch(largeVectors);
  });

  console.log(`\nInserted 10K vectors in: ${scaleInsertTime.toFixed(2)}ms`);
  console.log(`Insert throughput:       ${Math.round(largeVectors.length / (scaleInsertTime / 1000))} inserts/sec`);

  // Warmup scale search
  for (let i = 0; i < 10; i++) {
    await scaleDb.search({ vector: queryVector, k: 10 });
  }

  // Benchmark scale search
  const scaleSearchTimes: number[] = [];
  for (let i = 0; i < 50; i++) {
    const { timeMs } = await measureTime(() => scaleDb.search({ vector: queryVector, k: 10 }));
    scaleSearchTimes.push(timeMs);
  }

  const scaleP50 = percentile(scaleSearchTimes, 50);
  const scaleP99 = percentile(scaleSearchTimes, 99);
  console.log(`\n10K Search Latency:`);
  console.log(`  p50:  ${scaleP50.toFixed(4)}ms (${(scaleP50 * 1000).toFixed(1)} µs)`);
  console.log(`  p99:  ${scaleP99.toFixed(4)}ms (${(scaleP99 * 1000).toFixed(1)} µs)`);

  // Scale QPS
  let scaleQueries = 0;
  const scaleStartTime = performance.now();
  while (performance.now() - scaleStartTime < testDurationMs) {
    await scaleDb.search({ vector: queryVector, k: 10 });
    scaleQueries++;
  }
  const scaleQps = scaleQueries / ((performance.now() - scaleStartTime) / 1000);
  console.log(`  QPS:  ${Math.round(scaleQps)} queries/second`);

  // Summary
  console.log('\n' + '='.repeat(60));
  console.log('SUMMARY');
  console.log('='.repeat(60));
  console.log('\n| Metric                | Value         |');
  console.log('|-----------------------|---------------|');
  console.log(`| Insert (1K ops/s)     | ${Math.round(vectors.length / (batchInsertTime / 1000)).toString().padStart(13)} |`);
  console.log(`| Search p50 (1K)       | ${(p50Latency * 1000).toFixed(1).padStart(10)} µs |`);
  console.log(`| Search p99 (1K)       | ${(p99Latency * 1000).toFixed(1).padStart(10)} µs |`);
  console.log(`| QPS (1K vectors)      | ${Math.round(qps).toString().padStart(13)} |`);
  console.log(`| Insert (10K ops/s)    | ${Math.round(largeVectors.length / (scaleInsertTime / 1000)).toString().padStart(13)} |`);
  console.log(`| Search p50 (10K)      | ${(scaleP50 * 1000).toFixed(1).padStart(10)} µs |`);
  console.log(`| Search p99 (10K)      | ${(scaleP99 * 1000).toFixed(1).padStart(10)} µs |`);
  console.log(`| QPS (10K vectors)     | ${Math.round(scaleQps).toString().padStart(13)} |`);
  console.log('\n');
}

main().catch(console.error);
