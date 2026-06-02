#!/usr/bin/env tsx
/**
 * RaBitQ Signature-Prefilter Benchmark
 *
 * Item #8 of docs/ruflo-adoption-plan.md (issue #510). Ports ruflo's perf-M4
 * (sign-random-projection + Hamming popcount prefilter ahead of exact cosine
 * rerank) and measures it honestly against a full exact-cosine scan.
 *
 * For each N in {100, 1000, 5000} we build a deterministic (mulberry32) corpus
 * of unit 384-dim vectors and run M queries comparing:
 *   - EXACT:  full cosine top-k over all N (baseline)
 *   - RABITQ: topKBySignature (Hamming prefilter + exact cosine rerank)
 *
 * We report per N: exact ms, rabitq ms, speedup ×, recall@10, and index memory
 * (raw Float32 vs packed signatures) with the reduction factor.
 *
 * HONESTY NOTE: a 1-bit sign signature in 384-dim is coarse. To keep
 * recall@10 ≥ 0.95 the rerank pool must be a sizeable fraction of N (~40%+),
 * which caps the achievable speedup. We pick the pool to TARGET recall, then
 * report whatever speedup falls out — we do not fake a win.
 *
 * Run: npx tsx scripts/benchmark-rabitq.ts  (or: npm run benchmark:rabitq)
 */

import * as fs from 'fs';
import * as path from 'path';
import {
  signSignature,
  topKBySignature,
  SIGNATURE_BYTES,
  type RaBitQCandidate,
} from '../src/shared/utils/rabitq.js';
import { cosineSimilarity } from '../src/shared/utils/vector-math.js';

// ── Config ──────────────────────────────────────────────────────────

const DIMENSIONS = 384;
const SIZES = [100, 1000, 5000];
const QUERY_COUNT = 100;
const K = 10;
/**
 * Rerank-pool fraction of N. Chosen empirically so recall@10 ≥ 0.95 with 1-bit
 * sign signatures at these sizes (see module docs). Floored at 4×K.
 */
const POOL_FRACTION = 0.55;

const RUNS_DIR = path.join('docs', 'benchmarks', 'runs');
const OUT_PATH = path.join(RUNS_DIR, 'rabitq-latest.json');

// ── Seeded PRNG (mulberry32) ────────────────────────────────────────

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function randomUnitVector(dim: number, rng: () => number): Float32Array {
  const v = new Float32Array(dim);
  let norm = 0;
  for (let i = 0; i < dim; i++) {
    v[i] = rng() * 2 - 1;
    norm += v[i] * v[i];
  }
  norm = Math.sqrt(norm);
  if (norm > 0) for (let i = 0; i < dim; i++) v[i] /= norm;
  return v;
}

// ── Baselines ───────────────────────────────────────────────────────

function exactTopK(
  query: Float32Array,
  candidates: RaBitQCandidate[],
  k: number
): string[] {
  return candidates
    .map((c) => ({ id: c.id, score: cosineSimilarity(query, c.vector) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, k)
    .map((r) => r.id);
}

function formatMs(ms: number): string {
  if (ms < 1) return `${(ms * 1000).toFixed(1)}µs`;
  if (ms < 1000) return `${ms.toFixed(2)}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)}MB`;
}

// ── Per-size benchmark ──────────────────────────────────────────────

interface SizeResult {
  n: number;
  queries: number;
  k: number;
  rerankPool: number;
  exactMs: number;
  rabitqMs: number;
  speedup: number;
  recall: number;
  indexBytesExact: number;
  indexBytesSignatures: number;
  memoryReduction: number;
}

function benchmarkSize(n: number): SizeResult {
  const rng = mulberry32(0xc0ffee ^ n);

  // Build corpus with precomputed signatures (signatures are part of the index).
  const candidates: RaBitQCandidate[] = new Array(n);
  for (let i = 0; i < n; i++) {
    const vector = randomUnitVector(DIMENSIONS, rng);
    candidates[i] = { id: `c-${i}`, vector, signature: signSignature(vector) };
  }

  // Deterministic query set.
  const queries: Float32Array[] = new Array(QUERY_COUNT);
  for (let q = 0; q < QUERY_COUNT; q++) {
    queries[q] = randomUnitVector(DIMENSIONS, rng);
  }

  const rerankPool = Math.max(4 * K, Math.ceil(POOL_FRACTION * n));

  // Warmup (JIT) — run a couple queries through both paths.
  for (let w = 0; w < 3; w++) {
    exactTopK(queries[w % QUERY_COUNT], candidates, K);
    topKBySignature(queries[w % QUERY_COUNT], candidates, K, {
      gateN: 100,
      rerankPool,
      exactRerank: true,
    });
  }

  // EXACT timing + ground truth.
  const groundTruth: Set<string>[] = new Array(QUERY_COUNT);
  let exactStart = performance.now();
  for (let q = 0; q < QUERY_COUNT; q++) {
    const top = exactTopK(queries[q], candidates, K);
    groundTruth[q] = new Set(top);
  }
  const exactMs = (performance.now() - exactStart) / QUERY_COUNT;

  // RABITQ timing + recall.
  let totalRecall = 0;
  const rabitqStart = performance.now();
  for (let q = 0; q < QUERY_COUNT; q++) {
    const got = topKBySignature(queries[q], candidates, K, {
      gateN: 100,
      rerankPool,
      exactRerank: true,
    });
    let hits = 0;
    const truth = groundTruth[q];
    for (const r of got) if (truth.has(r.id)) hits++;
    totalRecall += hits / K;
  }
  const rabitqMs = (performance.now() - rabitqStart) / QUERY_COUNT;

  const recall = totalRecall / QUERY_COUNT;
  const indexBytesExact = n * DIMENSIONS * 4;
  const indexBytesSignatures = n * SIGNATURE_BYTES;

  return {
    n,
    queries: QUERY_COUNT,
    k: K,
    rerankPool,
    exactMs,
    rabitqMs,
    speedup: exactMs / rabitqMs,
    recall,
    indexBytesExact,
    indexBytesSignatures,
    memoryReduction: indexBytesExact / indexBytesSignatures,
  };
}

// ── Main ────────────────────────────────────────────────────────────

function main(): void {
  console.log('╔═══════════════════════════════════════════════════════════╗');
  console.log('║          RaBitQ Signature-Prefilter Benchmark            ║');
  console.log('║   Dimensions: 384 | Metric: cosine | 1-bit sign LSH      ║');
  console.log('╚═══════════════════════════════════════════════════════════╝');
  console.log(`\n  Platform:  ${process.platform} ${process.arch}`);
  console.log(`  Node:      ${process.version}`);
  console.log(`  Queries:   ${QUERY_COUNT}  |  k: ${K}  |  pool: ${(POOL_FRACTION * 100).toFixed(0)}% of N (≥ ${4 * K})`);
  console.log('');

  const results: SizeResult[] = [];
  for (const n of SIZES) {
    const r = benchmarkSize(n);
    results.push(r);
    console.log(`── N = ${n} ──────────────────────────────────────`);
    console.log(`  exact:    ${formatMs(r.exactMs)} / query`);
    console.log(`  rabitq:   ${formatMs(r.rabitqMs)} / query  (pool=${r.rerankPool})`);
    console.log(`  speedup:  ${r.speedup.toFixed(2)}×`);
    console.log(`  recall@${K}: ${(r.recall * 100).toFixed(1)}%`);
    console.log(`  index:    exact ${formatBytes(r.indexBytesExact)}  vs  sig ${formatBytes(r.indexBytesSignatures)}  (${r.memoryReduction.toFixed(1)}× smaller)`);
    console.log('');
  }

  // Persist results.
  fs.mkdirSync(RUNS_DIR, { recursive: true });
  fs.writeFileSync(
    OUT_PATH,
    JSON.stringify(
      {
        timestamp: null,
        benchmark: 'rabitq',
        dimensions: DIMENSIONS,
        k: K,
        queries: QUERY_COUNT,
        poolFraction: POOL_FRACTION,
        sizes: SIZES,
        platform: `${process.platform} ${process.arch}`,
        node: process.version,
        results,
      },
      null,
      2
    )
  );
  console.log(`  Results written to ${OUT_PATH}`);

  // ── Gates ──
  let failed = false;
  for (const r of results) {
    if (r.recall < 0.95) {
      console.error(`  ✗ FAIL: recall@${K} at N=${r.n} is ${(r.recall * 100).toFixed(1)}% (< 95%) — rerank did not preserve recall`);
      failed = true;
    }
    if (r.n >= 1000 && r.speedup < 1) {
      console.error(`  ✗ FAIL: rabitq is SLOWER than exact at N=${r.n} (${r.speedup.toFixed(2)}×)`);
      failed = true;
    }
  }

  if (failed) {
    console.error('\n  Benchmark gate FAILED.');
    process.exit(1);
  }
  console.log('\n  ✓ All gates passed (recall@10 ≥ 95% and speedup ≥ 1× at N ≥ 1000).');
}

main();
