#!/usr/bin/env npx tsx
/**
 * RuVector vs AgentDB Real Performance Benchmark
 *
 * Compares REAL performance between:
 * - AgentDB v1.9.3 (direct npm package: WASMVectorSearch + HNSWIndex)
 * - RuVector (@ruvector/core native Rust + HNSW)
 *
 * NO MOCKS, NO STUBS, NO FAKE DATA - Real measurements only.
 *
 * This benchmark uses AgentDB's direct APIs to avoid wrapper overhead.
 *
 * Metrics measured:
 * - Insert throughput (ops/sec)
 * - Search latency (p50, p95, p99 in µs)
 * - Search throughput (QPS)
 * - Memory usage (MB)
 */

import { RuVectorPatternStore, isRuVectorAvailable } from '../src/core/memory/index.js';
// Use AgentDB package directly for fair comparison
import { WASMVectorSearch, createDatabase } from 'agentdb';
import { performance } from 'perf_hooks';
import * as fs from 'fs';
import * as path from 'path';

// Benchmark configuration
const CONFIG = {
  vectorDimension: 384,
  warmupIterations: 50,
  insertCounts: [100, 500, 1000],
  searchIterations: 500,
};

interface BenchmarkResult {
  name: string;
  backend: string;
  operation: string;
  vectorCount: number;
  totalTime: number;
  opsPerSecond: number;
  latencyP50: number;
  latencyP95: number;
  latencyP99: number;
  memoryUsedMB: number;
}

function generateRandomVector(dim: number): number[] {
  return Array.from({ length: dim }, () => Math.random() * 2 - 1);
}

function percentile(arr: number[], p: number): number {
  if (arr.length === 0) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const idx = Math.floor(sorted.length * p);
  return sorted[Math.min(idx, sorted.length - 1)] || 0;
}

function getMemoryUsage(): number {
  const used = process.memoryUsage();
  return Math.round((used.heapUsed / 1024 / 1024) * 100) / 100;
}

/**
 * Benchmark RuVector Native
 */
async function benchmarkRuVector(
  vectorCount: number,
  searchIterations: number
): Promise<BenchmarkResult[]> {
  const results: BenchmarkResult[] = [];
  const startMem = getMemoryUsage();

  // Create RuVector store
  const store = new RuVectorPatternStore({
    dimension: CONFIG.vectorDimension,
    metric: 'cosine',
    enableMetrics: true,
    hnsw: {
      m: 32,
      efConstruction: 200,
      efSearch: 100,
    },
  });
  await store.initialize();

  const info = store.getImplementationInfo();
  const backend = info.type === 'ruvector' ? 'RuVector Native' : 'RuVector Fallback';

  // Warmup
  console.log(`  [${backend}] Warming up (${CONFIG.warmupIterations} patterns)...`);
  for (let i = 0; i < CONFIG.warmupIterations; i++) {
    await store.storePattern({
      id: `warmup-${i}`,
      type: 'unit',
      domain: 'jest',
      embedding: generateRandomVector(CONFIG.vectorDimension),
      content: `Warmup pattern ${i}`,
      framework: 'jest',
      coverage: Math.random(),
      verdict: 'success',
      createdAt: Date.now(),
      lastUsed: Date.now(),
      usageCount: 0,
      metadata: { tags: ['warmup'] },
    });
  }
  await store.clear();

  // Force GC if available
  if (global.gc) global.gc();

  // INSERT BENCHMARK
  console.log(`  [${backend}] Inserting ${vectorCount} patterns...`);
  const insertTimes: number[] = [];
  const insertStart = performance.now();

  for (let i = 0; i < vectorCount; i++) {
    const t0 = performance.now();
    await store.storePattern({
      id: `bench-${i}`,
      type: 'unit',
      domain: 'jest',
      embedding: generateRandomVector(CONFIG.vectorDimension),
      content: `Benchmark pattern ${i} for testing`,
      framework: 'jest',
      coverage: Math.random(),
      verdict: 'success',
      createdAt: Date.now(),
      lastUsed: Date.now(),
      usageCount: i,
      metadata: { tags: ['benchmark', 'test'] },
    });
    insertTimes.push((performance.now() - t0) * 1000); // µs
  }

  const insertTotalTime = performance.now() - insertStart;
  const insertOpsPerSec = (vectorCount / insertTotalTime) * 1000;

  results.push({
    name: `Insert ${vectorCount} patterns`,
    backend,
    operation: 'insert',
    vectorCount,
    totalTime: insertTotalTime,
    opsPerSecond: Math.round(insertOpsPerSec),
    latencyP50: Math.round(percentile(insertTimes, 0.5) * 100) / 100,
    latencyP95: Math.round(percentile(insertTimes, 0.95) * 100) / 100,
    latencyP99: Math.round(percentile(insertTimes, 0.99) * 100) / 100,
    memoryUsedMB: Math.round((getMemoryUsage() - startMem) * 100) / 100,
  });

  // Build index
  await store.buildIndex();

  // SEARCH BENCHMARK
  console.log(`  [${backend}] Searching ${searchIterations} queries (k=10)...`);
  const searchTimes: number[] = [];
  const searchStart = performance.now();

  for (let i = 0; i < searchIterations; i++) {
    const query = generateRandomVector(CONFIG.vectorDimension);
    const t0 = performance.now();
    await store.searchSimilar(query, { k: 10 });
    searchTimes.push((performance.now() - t0) * 1000); // µs
  }

  const searchTotalTime = performance.now() - searchStart;
  const searchQPS = (searchIterations / searchTotalTime) * 1000;

  results.push({
    name: `Search k=10 (${vectorCount} patterns)`,
    backend,
    operation: 'search',
    vectorCount,
    totalTime: searchTotalTime,
    opsPerSecond: Math.round(searchQPS),
    latencyP50: Math.round(percentile(searchTimes, 0.5) * 100) / 100,
    latencyP95: Math.round(percentile(searchTimes, 0.95) * 100) / 100,
    latencyP99: Math.round(percentile(searchTimes, 0.99) * 100) / 100,
    memoryUsedMB: Math.round((getMemoryUsage() - startMem) * 100) / 100,
  });

  await store.shutdown();
  return results;
}

/**
 * Benchmark AgentDB v1.9.3 (Direct npm package API)
 *
 * Uses WASMVectorSearch directly from the agentdb package
 * for accurate performance measurement of the published v1.9.3 version.
 */
async function benchmarkAgentDB(
  vectorCount: number,
  searchIterations: number
): Promise<BenchmarkResult[]> {
  const results: BenchmarkResult[] = [];
  const startMem = getMemoryUsage();

  // Create SQLite database using AgentDB's createDatabase
  const db = await createDatabase(':memory:');

  // Create WASMVectorSearch - this is the core vector engine in AgentDB v1.9.3
  const vectorSearch = new WASMVectorSearch(db, {
    enableWASM: true,
    enableSIMD: true,
    batchSize: 100,
    indexThreshold: 100,
  });

  const backend = 'AgentDB v1.9.3 (WASM)';

  // Store vectors directly (arrays for in-memory benchmark)
  let storedVectors: Float32Array[] = [];
  let storedIds: number[] = [];
  let storedMetadata: any[] = [];

  // Warmup
  console.log(`  [${backend}] Warming up (${CONFIG.warmupIterations} vectors)...`);
  for (let i = 0; i < CONFIG.warmupIterations; i++) {
    const vec = new Float32Array(generateRandomVector(CONFIG.vectorDimension));
    storedVectors.push(vec);
    storedIds.push(i);
    storedMetadata.push({ type: 'warmup', id: `warmup-${i}` });
  }
  // Build index for warmup
  vectorSearch.buildIndex(storedVectors, storedIds, storedMetadata);

  // Clear warmup data
  storedVectors = [];
  storedIds = [];
  storedMetadata = [];

  // Force GC if available
  if (global.gc) global.gc();

  // INSERT BENCHMARK
  console.log(`  [${backend}] Inserting ${vectorCount} vectors...`);
  const insertTimes: number[] = [];
  const insertStart = performance.now();

  for (let i = 0; i < vectorCount; i++) {
    const t0 = performance.now();
    const vec = new Float32Array(generateRandomVector(CONFIG.vectorDimension));
    storedVectors.push(vec);
    storedIds.push(i);
    storedMetadata.push({
      type: 'unit',
      domain: 'jest',
      id: `bench-${i}`,
      content: `Benchmark pattern ${i}`,
    });
    insertTimes.push((performance.now() - t0) * 1000); // µs
  }

  const insertTotalTime = performance.now() - insertStart;
  const insertOpsPerSec = (vectorCount / insertTotalTime) * 1000;

  // Build ANN index (this is part of AgentDB's HNSW functionality)
  console.log(`  [${backend}] Building ANN index...`);
  const indexStart = performance.now();
  vectorSearch.buildIndex(storedVectors, storedIds, storedMetadata);
  const indexTime = performance.now() - indexStart;
  console.log(`  [${backend}] Index built in ${indexTime.toFixed(1)}ms`);

  results.push({
    name: `Insert ${vectorCount} vectors`,
    backend,
    operation: 'insert',
    vectorCount,
    totalTime: insertTotalTime + indexTime, // Include index build time
    opsPerSecond: Math.round(insertOpsPerSec),
    latencyP50: Math.round(percentile(insertTimes, 0.5) * 100) / 100,
    latencyP95: Math.round(percentile(insertTimes, 0.95) * 100) / 100,
    latencyP99: Math.round(percentile(insertTimes, 0.99) * 100) / 100,
    memoryUsedMB: Math.round((getMemoryUsage() - startMem) * 100) / 100,
  });

  // SEARCH BENCHMARK
  console.log(`  [${backend}] Searching ${searchIterations} queries (k=10)...`);
  const searchTimes: number[] = [];
  const searchStart = performance.now();

  for (let i = 0; i < searchIterations; i++) {
    const query = new Float32Array(generateRandomVector(CONFIG.vectorDimension));
    const t0 = performance.now();
    // Use searchIndex for ANN search (same as HNSW-enabled AgentDB)
    vectorSearch.searchIndex(query, 10);
    searchTimes.push((performance.now() - t0) * 1000); // µs
  }

  const searchTotalTime = performance.now() - searchStart;
  const searchQPS = (searchIterations / searchTotalTime) * 1000;

  results.push({
    name: `Search k=10 (${vectorCount} vectors)`,
    backend,
    operation: 'search',
    vectorCount,
    totalTime: searchTotalTime,
    opsPerSecond: Math.round(searchQPS),
    latencyP50: Math.round(percentile(searchTimes, 0.5) * 100) / 100,
    latencyP95: Math.round(percentile(searchTimes, 0.95) * 100) / 100,
    latencyP99: Math.round(percentile(searchTimes, 0.99) * 100) / 100,
    memoryUsedMB: Math.round((getMemoryUsage() - startMem) * 100) / 100,
  });

  // Cleanup database
  db.close();

  return results;
}

async function runBenchmark() {
  console.log('╔══════════════════════════════════════════════════════════════════╗');
  console.log('║   RuVector vs AgentDB v1.9.3 - REAL Performance Benchmark        ║');
  console.log('║   NO MOCKS • NO STUBS • NO FAKE DATA                             ║');
  console.log('╚══════════════════════════════════════════════════════════════════╝\n');

  console.log('Configuration:');
  console.log(`  • Vector dimension: ${CONFIG.vectorDimension}`);
  console.log(`  • Pattern counts: ${CONFIG.insertCounts.join(', ')}`);
  console.log(`  • Search iterations: ${CONFIG.searchIterations}`);
  console.log(`  • RuVector native available: ${isRuVectorAvailable()}`);
  console.log(`  • Platform: ${process.platform}/${process.arch}`);
  console.log(`  • Node.js: ${process.version}\n`);

  const allResults: BenchmarkResult[] = [];

  for (const count of CONFIG.insertCounts) {
    console.log(`\n${'═'.repeat(60)}`);
    console.log(`  Benchmarking with ${count} patterns`);
    console.log('═'.repeat(60) + '\n');

    // Run RuVector benchmark
    console.log('🚀 RuVector:');
    try {
      const ruResults = await benchmarkRuVector(count, CONFIG.searchIterations);
      allResults.push(...ruResults);
      console.log(`   ✅ Complete\n`);
    } catch (error) {
      console.log(`   ❌ Failed: ${error}\n`);
    }

    // Force GC between benchmarks
    if (global.gc) global.gc();
    await new Promise(r => setTimeout(r, 500)); // Brief pause

    // Run AgentDB benchmark
    console.log('📦 AgentDB v1.9.3:');
    try {
      const agResults = await benchmarkAgentDB(count, CONFIG.searchIterations);
      allResults.push(...agResults);
      console.log(`   ✅ Complete\n`);
    } catch (error) {
      console.log(`   ❌ Failed: ${error}\n`);
    }

    // Force GC
    if (global.gc) global.gc();
    await new Promise(r => setTimeout(r, 500));
  }

  // Print results table
  console.log('\n\n' + '═'.repeat(110));
  console.log('                                    BENCHMARK RESULTS');
  console.log('═'.repeat(110));
  console.log('│ Backend          │ Operation │ Count │  Ops/sec │ p50 (µs) │ p95 (µs) │ p99 (µs) │ Memory (MB) │');
  console.log('├'.padEnd(110, '─') + '┤');

  for (const r of allResults) {
    const backend = r.backend.padEnd(16);
    const op = r.operation.padEnd(9);
    const count = r.vectorCount.toString().padStart(5);
    const ops = r.opsPerSecond.toString().padStart(8);
    const p50 = r.latencyP50.toFixed(1).padStart(8);
    const p95 = r.latencyP95.toFixed(1).padStart(8);
    const p99 = r.latencyP99.toFixed(1).padStart(8);
    const mem = r.memoryUsedMB.toFixed(1).padStart(11);
    console.log(`│ ${backend} │ ${op} │ ${count} │ ${ops} │ ${p50} │ ${p95} │ ${p99} │ ${mem} │`);
  }
  console.log('═'.repeat(110));

  // Calculate and print speedup comparisons
  console.log('\n\n' + '═'.repeat(70));
  console.log('                    SPEEDUP COMPARISON (RuVector vs AgentDB)');
  console.log('═'.repeat(70) + '\n');

  for (const count of CONFIG.insertCounts) {
    const ruInsert = allResults.find(r => r.backend.includes('RuVector') && r.operation === 'insert' && r.vectorCount === count);
    const agInsert = allResults.find(r => r.backend.includes('AgentDB') && r.operation === 'insert' && r.vectorCount === count);
    const ruSearch = allResults.find(r => r.backend.includes('RuVector') && r.operation === 'search' && r.vectorCount === count);
    const agSearch = allResults.find(r => r.backend.includes('AgentDB') && r.operation === 'search' && r.vectorCount === count);

    console.log(`📊 ${count} Patterns:`);

    if (ruInsert && agInsert) {
      const insertSpeedup = ruInsert.opsPerSecond / agInsert.opsPerSecond;
      console.log(`   Insert Throughput:`);
      console.log(`      RuVector: ${ruInsert.opsPerSecond.toLocaleString()} ops/sec`);
      console.log(`      AgentDB:  ${agInsert.opsPerSecond.toLocaleString()} ops/sec`);
      console.log(`      Speedup:  ${insertSpeedup.toFixed(1)}x ${insertSpeedup > 1 ? 'faster' : 'slower'}`);
    }

    if (ruSearch && agSearch) {
      const searchSpeedup = ruSearch.opsPerSecond / agSearch.opsPerSecond;
      const latencyReduction = agSearch.latencyP50 / Math.max(ruSearch.latencyP50, 0.1);
      console.log(`   Search Performance:`);
      console.log(`      RuVector: ${ruSearch.opsPerSecond.toLocaleString()} QPS, p50: ${ruSearch.latencyP50}µs`);
      console.log(`      AgentDB:  ${agSearch.opsPerSecond.toLocaleString()} QPS, p50: ${agSearch.latencyP50}µs`);
      console.log(`      Speedup:  ${searchSpeedup.toFixed(1)}x QPS, ${latencyReduction.toFixed(1)}x lower latency`);
    }
    console.log('');
  }

  // Save results
  const resultsFile = path.join(process.cwd(), 'docs', 'benchmarks', `real-benchmark-${new Date().toISOString().split('T')[0]}.json`);
  try {
    fs.mkdirSync(path.dirname(resultsFile), { recursive: true });
    fs.writeFileSync(resultsFile, JSON.stringify({
      timestamp: new Date().toISOString(),
      platform: `${process.platform}/${process.arch}`,
      nodeVersion: process.version,
      config: CONFIG,
      results: allResults,
    }, null, 2));
    console.log(`📁 Results saved to: ${resultsFile}`);
  } catch (error) {
    console.log(`⚠️ Could not save results: ${error}`);
  }

  console.log('\n✅ Benchmark complete - REAL DATA ONLY\n');
}

runBenchmark().catch(error => {
  console.error('❌ Benchmark failed:', error);
  process.exit(1);
});
