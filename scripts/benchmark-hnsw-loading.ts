/**
 * HNSW Loading Benchmark
 *
 * Compares vector index build performance across implementations:
 * 1. Pure JS InMemoryHNSWIndex (current, efConstruction=200)
 * 2. Pure JS InMemoryHNSWIndex with reduced efConstruction=50
 * 3. @ruvector/gnn differentiableSearch (Rust/NAPI)
 * 4. Optimized JS with Float32Array deserialization
 *
 * Same scenario for all: 5073 vectors, 768 dimensions, cosine similarity.
 * Measures: build time, search time, memory usage, recall quality.
 */

import { performance } from 'perf_hooks';

// ============================================================================
// Scenario Configuration (identical for all implementations)
// ============================================================================
const NUM_VECTORS = 5073;
const DIMENSIONS = 768;
const NUM_SEARCHES = 100;
const SEARCH_K = 5;

// ============================================================================
// Generate deterministic test data (same seed for all)
// ============================================================================

function seededRandom(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) & 0xFFFFFFFF;
    return (s >>> 0) / 0xFFFFFFFF;
  };
}

function generateVectors(count: number, dim: number): { ids: string[]; embeddings: number[][] } {
  const rand = seededRandom(42);
  const ids: string[] = [];
  const embeddings: number[][] = [];

  for (let i = 0; i < count; i++) {
    ids.push(`code-intelligence:kg:node:${i}`);
    const vec: number[] = new Array(dim);
    let norm = 0;
    for (let d = 0; d < dim; d++) {
      vec[d] = rand() * 2 - 1;
      norm += vec[d] * vec[d];
    }
    // Normalize for cosine similarity
    norm = Math.sqrt(norm);
    for (let d = 0; d < dim; d++) vec[d] /= norm;
    embeddings.push(vec);
  }

  return { ids, embeddings };
}

function generateQueries(count: number, dim: number): number[][] {
  const rand = seededRandom(12345);
  const queries: number[][] = [];
  for (let i = 0; i < count; i++) {
    const vec: number[] = new Array(dim);
    let norm = 0;
    for (let d = 0; d < dim; d++) {
      vec[d] = rand() * 2 - 1;
      norm += vec[d] * vec[d];
    }
    norm = Math.sqrt(norm);
    for (let d = 0; d < dim; d++) vec[d] /= norm;
    queries.push(vec);
  }
  return queries;
}

// Simulate SQLite buffer format (Float32LE)
function vectorToBuffer(vec: number[]): Buffer {
  const buf = Buffer.alloc(vec.length * 4);
  for (let i = 0; i < vec.length; i++) buf.writeFloatLE(vec[i], i * 4);
  return buf;
}

// Current slow deserialization
function bufferToFloatArraySlow(buffer: Buffer, dimensions: number): number[] {
  const arr: number[] = [];
  for (let i = 0; i < dimensions; i++) arr.push(buffer.readFloatLE(i * 4));
  return arr;
}

// Optimized deserialization via Float32Array view
function bufferToFloatArrayFast(buffer: Buffer, dimensions: number): number[] {
  const f32 = new Float32Array(buffer.buffer, buffer.byteOffset, dimensions);
  return Array.from(f32);
}

// ============================================================================
// Brute-force ground truth for recall measurement
// ============================================================================

function cosineSim(a: number[], b: number[]): number {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  const denom = Math.sqrt(na) * Math.sqrt(nb);
  return denom === 0 ? 0 : dot / denom;
}

function bruteForceTopK(query: number[], embeddings: number[][], ids: string[], k: number): string[] {
  const scored = ids.map((id, i) => ({ id, score: cosineSim(query, embeddings[i]) }));
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, k).map(s => s.id);
}

function recallAtK(predicted: string[], actual: string[]): number {
  const actualSet = new Set(actual);
  let hits = 0;
  for (const p of predicted) {
    if (actualSet.has(p)) hits++;
  }
  return hits / actual.length;
}

// ============================================================================
// Implementation 1: Pure JS HNSW (current)
// ============================================================================

async function benchmarkPureJS(
  label: string,
  efConstruction: number,
  buffers: Buffer[],
  ids: string[],
  embeddings: number[][],
  queries: number[][],
  groundTruth: string[][]
) {
  // Import from compiled output
  const { InMemoryHNSWIndex } = await import('../v3/dist/kernel/unified-memory-hnsw.js');

  const index = new InMemoryHNSWIndex();
  if (efConstruction !== 200) {
    (index as any).efConstruction = efConstruction;
  }

  const memBefore = process.memoryUsage().heapUsed;

  // Measure deserialization + build
  const buildStart = performance.now();
  for (let i = 0; i < buffers.length; i++) {
    const embedding = bufferToFloatArraySlow(buffers[i], DIMENSIONS);
    index.add(ids[i], embedding);
  }
  const buildMs = performance.now() - buildStart;

  const memAfter = process.memoryUsage().heapUsed;

  // Measure search
  const searchStart = performance.now();
  const searchResults: string[][] = [];
  for (const q of queries) {
    const results = index.search(q, SEARCH_K);
    searchResults.push(results.map(r => r.id));
  }
  const searchMs = performance.now() - searchStart;

  // Compute recall
  let totalRecall = 0;
  for (let i = 0; i < queries.length; i++) {
    totalRecall += recallAtK(searchResults[i], groundTruth[i]);
  }
  const avgRecall = totalRecall / queries.length;

  return {
    label,
    buildMs: Math.round(buildMs),
    searchMs: Math.round(searchMs),
    avgSearchMs: (searchMs / queries.length).toFixed(2),
    memoryMB: Math.round((memAfter - memBefore) / 1024 / 1024),
    recall: (avgRecall * 100).toFixed(1),
    indexSize: index.size(),
  };
}

// ============================================================================
// Implementation 2: Pure JS with Fast Deserialization
// ============================================================================

async function benchmarkPureJSFastDeser(
  buffers: Buffer[],
  ids: string[],
  embeddings: number[][],
  queries: number[][],
  groundTruth: string[][]
) {
  const { InMemoryHNSWIndex } = await import('../v3/dist/kernel/unified-memory-hnsw.js');
  const index = new InMemoryHNSWIndex();

  const memBefore = process.memoryUsage().heapUsed;

  const buildStart = performance.now();
  for (let i = 0; i < buffers.length; i++) {
    const embedding = bufferToFloatArrayFast(buffers[i], DIMENSIONS);
    index.add(ids[i], embedding);
  }
  const buildMs = performance.now() - buildStart;

  const memAfter = process.memoryUsage().heapUsed;

  const searchStart = performance.now();
  const searchResults: string[][] = [];
  for (const q of queries) {
    const results = index.search(q, SEARCH_K);
    searchResults.push(results.map(r => r.id));
  }
  const searchMs = performance.now() - searchStart;

  let totalRecall = 0;
  for (let i = 0; i < queries.length; i++) {
    totalRecall += recallAtK(searchResults[i], groundTruth[i]);
  }

  return {
    label: 'Pure JS (efC=200) + Float32Array deser',
    buildMs: Math.round(buildMs),
    searchMs: Math.round(searchMs),
    avgSearchMs: (searchMs / queries.length).toFixed(2),
    memoryMB: Math.round((memAfter - memBefore) / 1024 / 1024),
    recall: ((totalRecall / queries.length) * 100).toFixed(1),
    indexSize: index.size(),
  };
}

// ============================================================================
// Implementation 3: @ruvector/gnn (Rust/NAPI)
// ============================================================================

async function benchmarkRuvector(
  buffers: Buffer[],
  ids: string[],
  embeddings: number[][],
  queries: number[][],
  groundTruth: string[][]
) {
  const { differentiableSearch, init } = await import('@ruvector/gnn');
  init();

  const memBefore = process.memoryUsage().heapUsed;

  // ruvector doesn't have a persistent index - it does brute-force differentiable search
  // Build = converting buffers to Float32Arrays (the "index" is just the array of embeddings)
  const buildStart = performance.now();
  const indexedVectors: Float32Array[] = [];
  for (let i = 0; i < buffers.length; i++) {
    const f32 = new Float32Array(buffers[i].buffer, buffers[i].byteOffset, DIMENSIONS);
    indexedVectors.push(new Float32Array(f32)); // copy since buffer may be reused
  }
  const buildMs = performance.now() - buildStart;

  const memAfter = process.memoryUsage().heapUsed;

  // Search
  const searchStart = performance.now();
  const searchResults: string[][] = [];
  for (const q of queries) {
    const queryF32 = new Float32Array(q);
    const result = differentiableSearch(
      queryF32 as unknown as number[],
      indexedVectors as unknown as number[][],
      SEARCH_K,
      1.0
    );
    searchResults.push(result.indices.map(idx => ids[idx]));
  }
  const searchMs = performance.now() - searchStart;

  let totalRecall = 0;
  for (let i = 0; i < queries.length; i++) {
    totalRecall += recallAtK(searchResults[i], groundTruth[i]);
  }

  return {
    label: '@ruvector/gnn differentiableSearch (Rust)',
    buildMs: Math.round(buildMs),
    searchMs: Math.round(searchMs),
    avgSearchMs: (searchMs / queries.length).toFixed(2),
    memoryMB: Math.round((memAfter - memBefore) / 1024 / 1024),
    recall: ((totalRecall / queries.length) * 100).toFixed(1),
    indexSize: indexedVectors.length,
  };
}

// ============================================================================
// Implementation 4: Optimized JS HNSW (reduced efConstruction + fast deser)
// ============================================================================

async function benchmarkOptimizedJS(
  buffers: Buffer[],
  ids: string[],
  embeddings: number[][],
  queries: number[][],
  groundTruth: string[][]
) {
  const { InMemoryHNSWIndex } = await import('../v3/dist/kernel/unified-memory-hnsw.js');
  const index = new InMemoryHNSWIndex();
  (index as any).efConstruction = 50;

  const memBefore = process.memoryUsage().heapUsed;

  const buildStart = performance.now();
  for (let i = 0; i < buffers.length; i++) {
    const embedding = bufferToFloatArrayFast(buffers[i], DIMENSIONS);
    index.add(ids[i], embedding);
  }
  const buildMs = performance.now() - buildStart;

  const memAfter = process.memoryUsage().heapUsed;

  const searchStart = performance.now();
  const searchResults: string[][] = [];
  for (const q of queries) {
    const results = index.search(q, SEARCH_K);
    searchResults.push(results.map(r => r.id));
  }
  const searchMs = performance.now() - searchStart;

  let totalRecall = 0;
  for (let i = 0; i < queries.length; i++) {
    totalRecall += recallAtK(searchResults[i], groundTruth[i]);
  }

  return {
    label: 'Optimized JS (efC=50 + Float32Array deser)',
    buildMs: Math.round(buildMs),
    searchMs: Math.round(searchMs),
    avgSearchMs: (searchMs / queries.length).toFixed(2),
    memoryMB: Math.round((memAfter - memBefore) / 1024 / 1024),
    recall: ((totalRecall / queries.length) * 100).toFixed(1),
    indexSize: index.size(),
  };
}

// ============================================================================
// Deserialization-only micro benchmark
// ============================================================================

function benchmarkDeserialization(buffers: Buffer[]) {
  // Slow path
  const slowStart = performance.now();
  for (const buf of buffers) {
    bufferToFloatArraySlow(buf, DIMENSIONS);
  }
  const slowMs = performance.now() - slowStart;

  // Fast path
  const fastStart = performance.now();
  for (const buf of buffers) {
    bufferToFloatArrayFast(buf, DIMENSIONS);
  }
  const fastMs = performance.now() - fastStart;

  return { slowMs: Math.round(slowMs), fastMs: Math.round(fastMs) };
}

// ============================================================================
// Main
// ============================================================================

async function main() {
  console.log('='.repeat(70));
  console.log('HNSW Loading Benchmark');
  console.log(`Scenario: ${NUM_VECTORS} vectors × ${DIMENSIONS} dims, ${NUM_SEARCHES} searches, k=${SEARCH_K}`);
  console.log('='.repeat(70));

  // Generate data
  console.log('\nGenerating test data...');
  const { ids, embeddings } = generateVectors(NUM_VECTORS, DIMENSIONS);
  const queries = generateQueries(NUM_SEARCHES, DIMENSIONS);

  // Convert to SQLite buffer format (simulates reading from DB)
  const buffers = embeddings.map(vectorToBuffer);

  // Compute brute-force ground truth
  console.log('Computing ground truth (brute force)...');
  const groundTruth = queries.map(q => bruteForceTopK(q, embeddings, ids, SEARCH_K));

  // Deserialization micro-benchmark
  console.log('\n--- Deserialization Benchmark ---');
  const deser = benchmarkDeserialization(buffers);
  console.log(`  readFloatLE loop: ${deser.slowMs}ms`);
  console.log(`  Float32Array view: ${deser.fastMs}ms`);
  console.log(`  Speedup: ${(deser.slowMs / deser.fastMs).toFixed(1)}x`);

  // Results table
  const results: any[] = [];

  // 1. Current implementation (Pure JS, efC=200, slow deser)
  console.log('\n[1/5] Pure JS HNSW (efC=200, readFloatLE) — current baseline...');
  results.push(await benchmarkPureJS(
    'Pure JS (efC=200) + readFloatLE [CURRENT]',
    200, buffers, ids, embeddings, queries, groundTruth
  ));
  console.log(`  Build: ${results[results.length-1].buildMs}ms`);

  // Force GC between tests
  if (global.gc) global.gc();

  // 2. Pure JS with fast deserialization
  console.log('\n[2/5] Pure JS HNSW (efC=200, Float32Array)...');
  results.push(await benchmarkPureJSFastDeser(buffers, ids, embeddings, queries, groundTruth));
  console.log(`  Build: ${results[results.length-1].buildMs}ms`);

  if (global.gc) global.gc();

  // 3. Optimized JS (efC=50 + fast deser)
  console.log('\n[3/5] Optimized JS HNSW (efC=50, Float32Array)...');
  results.push(await benchmarkOptimizedJS(buffers, ids, embeddings, queries, groundTruth));
  console.log(`  Build: ${results[results.length-1].buildMs}ms`);

  if (global.gc) global.gc();

  // 4. Pure JS with efC=50 but slow deser
  console.log('\n[4/5] Pure JS HNSW (efC=50, readFloatLE)...');
  results.push(await benchmarkPureJS(
    'Pure JS (efC=50) + readFloatLE',
    50, buffers, ids, embeddings, queries, groundTruth
  ));
  console.log(`  Build: ${results[results.length-1].buildMs}ms`);

  if (global.gc) global.gc();

  // 5. @ruvector/gnn
  console.log('\n[5/5] @ruvector/gnn differentiableSearch (Rust/NAPI)...');
  try {
    results.push(await benchmarkRuvector(buffers, ids, embeddings, queries, groundTruth));
    console.log(`  Build: ${results[results.length-1].buildMs}ms, Search: ${results[results.length-1].searchMs}ms`);
  } catch (e) {
    console.log(`  SKIPPED: ${(e as Error).message}`);
  }

  // Print results table
  console.log('\n' + '='.repeat(70));
  console.log('RESULTS');
  console.log('='.repeat(70));
  console.log('');
  console.log(
    'Implementation'.padEnd(48) +
    'Build(ms)'.padStart(10) +
    'Search(ms)'.padStart(11) +
    'Avg/q(ms)'.padStart(10) +
    'Mem(MB)'.padStart(8) +
    'Recall%'.padStart(8)
  );
  console.log('-'.repeat(95));

  for (const r of results) {
    console.log(
      r.label.padEnd(48) +
      String(r.buildMs).padStart(10) +
      String(r.searchMs).padStart(11) +
      String(r.avgSearchMs).padStart(10) +
      String(r.memoryMB).padStart(8) +
      String(r.recall + '%').padStart(8)
    );
  }

  console.log('-'.repeat(95));

  // Speedup summary
  if (results.length >= 2) {
    const baseline = results[0].buildMs;
    console.log('\nSpeedup vs current baseline:');
    for (let i = 1; i < results.length; i++) {
      const speedup = (baseline / results[i].buildMs).toFixed(1);
      console.log(`  ${results[i].label}: ${speedup}x faster build`);
    }
  }
}

main().catch(console.error);
