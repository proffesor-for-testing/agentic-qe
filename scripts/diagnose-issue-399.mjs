/**
 * Diagnostic script for issue #399.
 *
 * Single-config invocation (because @ruvector/router VectorDb holds a
 * process-wide lock and refuses concurrent instances even after dispose).
 *
 * Usage: node scripts/diagnose-issue-399.mjs <M> <efConstruction> <efSearch> [insertOrder]
 *   insertOrder: "sequential" (default) or "random"
 */

import { NativeHnswBackend, isNativeModuleAvailable } from '../dist/kernel/native-hnsw-backend.js';

const DIMENSIONS = 384;
const N = 1000;
const QUERY_ID = 42;

const M = parseInt(process.argv[2] ?? '16', 10);
const efConstruction = parseInt(process.argv[3] ?? '200', 10);
const efSearch = parseInt(process.argv[4] ?? '100', 10);
const insertOrder = process.argv[5] ?? 'sequential';

function generateTestVector(id, domainSeed = 0) {
  const vector = new Float32Array(DIMENSIONS);
  let h = (2166136261 ^ id ^ (domainSeed * 16777619)) >>> 0;
  const phases = [];
  for (let p = 0; p < 5; p++) {
    h = Math.imul(h ^ 0x9e3779b9, 16777619);
    phases.push(((h >>> 0) / 0x100000000) * 2 * Math.PI);
  }
  const freqs = [0.010, 0.023, 0.037, 0.053, 0.071];
  const amps = [0.28, 0.18, 0.12, 0.08, 0.05];
  for (let i = 0; i < DIMENSIONS; i++) {
    let x = 0;
    for (let p = 0; p < 5; p++) {
      x += Math.sin(phases[p] + i * freqs[p]) * amps[p];
    }
    vector[i] = x;
  }
  return vector;
}

function cosine(a, b) {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  const denom = Math.sqrt(na) * Math.sqrt(nb);
  return denom === 0 ? 0 : dot / denom;
}

function bruteForceTopK(query, vectors, k) {
  const scored = vectors.map((v, id) => ({ id, score: cosine(query, v) }));
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, k);
}

console.log(`[diag] M=${M} efC=${efConstruction} efS=${efSearch} order=${insertOrder} platform=${process.platform}-${process.arch} native=${isNativeModuleAvailable()}`);

const dataset = [];
for (let i = 0; i < N; i++) dataset.push(generateTestVector(i));
const queryVector = generateTestVector(QUERY_ID);

const groundTruth = bruteForceTopK(queryVector, dataset, 10);
console.log(`[diag] ground-truth top-1: id=${groundTruth[0].id} score=${groundTruth[0].score.toFixed(6)}`);

let backend;
try {
  backend = new NativeHnswBackend({
    dimensions: DIMENSIONS,
    metric: 'cosine',
    M, efConstruction, efSearch,
  });
} catch (err) {
  console.error(`[diag] FAIL: ${err.message}`);
  process.exit(1);
}

const insertOrderIds = insertOrder === 'random'
  ? (() => {
      // Mulberry32 PRNG seeded with a constant for reproducibility
      let state = 1234567;
      const rand = () => {
        state = (state + 0x6D2B79F5) | 0;
        let t = state;
        t = Math.imul(t ^ (t >>> 15), 1 | t);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
      };
      const ids = Array.from({ length: N }, (_, i) => i);
      for (let i = ids.length - 1; i > 0; i--) {
        const j = Math.floor(rand() * (i + 1));
        [ids[i], ids[j]] = [ids[j], ids[i]];
      }
      return ids;
    })()
  : Array.from({ length: N }, (_, i) => i);

const tStart = performance.now();
for (const id of insertOrderIds) backend.add(id, dataset[id]);
const tInsert = performance.now() - tStart;

const tSearchStart = performance.now();
const results = backend.search(queryVector, 10);
const tSearch = performance.now() - tSearchStart;

console.log(`[diag] insert ${N} vectors: ${tInsert.toFixed(0)}ms; search top-10: ${tSearch.toFixed(2)}ms`);

const groundTruthIds = new Set(groundTruth.map((r) => r.id));
const hitIds = new Set(results.map((r) => r.id));
const recallAt10 = [...groundTruthIds].filter((id) => hitIds.has(id)).length / groundTruthIds.size;
const containsSelf = results.some((r) => r.id === QUERY_ID);
const isTopSelf = results[0].id === QUERY_ID;

console.log(`[diag] top-1: id=${results[0].id} score=${results[0].score.toFixed(6)}`);
console.log(`[diag] top-1 == self(${QUERY_ID}): ${isTopSelf ? 'YES' : 'NO'}`);
console.log(`[diag] top-10 contains self:        ${containsSelf ? 'YES' : 'NO'}`);
console.log(`[diag] recall@10 vs brute-force:    ${(recallAt10 * 100).toFixed(0)}%`);
console.log(`[diag] full top-10:`);
for (let i = 0; i < results.length; i++) {
  const r = results[i];
  const gtRank = groundTruth.findIndex((g) => g.id === r.id);
  const gtMarker = gtRank >= 0 ? `(brute-force rank ${gtRank + 1})` : '(NOT IN BRUTE-FORCE TOP-10)';
  console.log(`         ${i + 1}. id=${r.id} score=${r.score.toFixed(6)} ${gtMarker}`);
}

backend.dispose();
process.exit(0);
