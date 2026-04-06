/**
 * Issue #399 — realistic vector distribution test.
 *
 * Same exact-match recall test as diagnose-issue-399.mjs but using vectors
 * sampled from N(0, 1) instead of FNV-hashed sine waves. This is closer to
 * how real text-embedding vectors are distributed (e.g., sentence-transformers
 * all-MiniLM-L6-v2 outputs are roughly Gaussian after normalization).
 *
 * If recall is good here, the original test's failure is a fixture problem,
 * not a fundamental HNSW bug.
 *
 * Usage: node scripts/diagnose-issue-399-realistic.mjs <M> <efC> <efS> [insertOrder]
 */

import { NativeHnswBackend, isNativeModuleAvailable } from '../dist/kernel/native-hnsw-backend.js';

const DIMENSIONS = 384;
const N = 1000;
const QUERY_ID = 42;

const M = parseInt(process.argv[2] ?? '16', 10);
const efConstruction = parseInt(process.argv[3] ?? '200', 10);
const efSearch = parseInt(process.argv[4] ?? '100', 10);
const insertOrder = process.argv[5] ?? 'sequential';

// Mulberry32 PRNG seeded for reproducibility
function mkRng(seed) {
  let state = seed;
  return () => {
    state = (state + 0x6D2B79F5) | 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), 1 | t);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Box-Muller for N(0,1)
function gaussianVector(rng, dim) {
  const v = new Float32Array(dim);
  for (let i = 0; i < dim; i += 2) {
    const u1 = Math.max(rng(), 1e-12);
    const u2 = rng();
    const r = Math.sqrt(-2 * Math.log(u1));
    const theta = 2 * Math.PI * u2;
    v[i] = r * Math.cos(theta);
    if (i + 1 < dim) v[i + 1] = r * Math.sin(theta);
  }
  return v;
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

console.log(`[realistic-diag] M=${M} efC=${efConstruction} efS=${efSearch} order=${insertOrder} platform=${process.platform}-${process.arch} native=${isNativeModuleAvailable()}`);

// Generate Gaussian random dataset, deterministic seed
const rng = mkRng(7777);
const dataset = [];
for (let i = 0; i < N; i++) dataset.push(gaussianVector(rng, DIMENSIONS));
const queryVector = dataset[QUERY_ID]; // Self-query: query == stored vector

const groundTruth = bruteForceTopK(queryVector, dataset, 10);
console.log(`[realistic-diag] ground-truth top-1: id=${groundTruth[0].id} score=${groundTruth[0].score.toFixed(6)}`);
console.log(`[realistic-diag] ground-truth top-10 ids: ${groundTruth.map(r => r.id).join(', ')}`);

let backend;
try {
  backend = new NativeHnswBackend({
    dimensions: DIMENSIONS,
    metric: 'cosine',
    M, efConstruction, efSearch,
  });
} catch (err) {
  console.error(`[realistic-diag] FAIL: ${err.message}`);
  process.exit(1);
}

const insertOrderIds = insertOrder === 'random'
  ? (() => {
      const r = mkRng(1234567);
      const ids = Array.from({ length: N }, (_, i) => i);
      for (let i = ids.length - 1; i > 0; i--) {
        const j = Math.floor(r() * (i + 1));
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

console.log(`[realistic-diag] insert ${N} vectors: ${tInsert.toFixed(0)}ms; search top-10: ${tSearch.toFixed(2)}ms`);

const groundTruthIds = new Set(groundTruth.map((r) => r.id));
const hitIds = new Set(results.map((r) => r.id));
const recallAt10 = [...groundTruthIds].filter((id) => hitIds.has(id)).length / groundTruthIds.size;

console.log(`[realistic-diag] top-1: id=${results[0].id} score=${results[0].score.toFixed(6)}`);
console.log(`[realistic-diag] top-1 == self(${QUERY_ID}): ${results[0].id === QUERY_ID ? 'YES' : 'NO'}`);
console.log(`[realistic-diag] top-10 contains self:        ${results.some(r => r.id === QUERY_ID) ? 'YES' : 'NO'}`);
console.log(`[realistic-diag] recall@10 vs brute-force:    ${(recallAt10 * 100).toFixed(0)}%`);

backend.dispose();
process.exit(0);
