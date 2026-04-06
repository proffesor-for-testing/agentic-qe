/**
 * Issue #399 — verify hnswlib-node passes the recall test that
 * @ruvector/router fails. Same fixture (1000 unit-Gaussian random vectors,
 * self-query at id=42), same params (M=16, efC=200, efS=100), same
 * cosine metric. Expected: recall@10 == 100%, top-1 == id 42.
 *
 * Usage: node scripts/diagnose-issue-399-hnswlib.mjs [efSearch]
 */

import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const hnswlib = require('hnswlib-node');
const { HierarchicalNSW } = hnswlib;

const DIM = 384;
const N = 1000;
const QUERY_ID = 42;
const efSearch = parseInt(process.argv[2] ?? '100', 10);

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
  let d = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) { d += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; }
  const den = Math.sqrt(na) * Math.sqrt(nb);
  return den === 0 ? 0 : d / den;
}

console.log(`========== hnswlib-node M=16 efC=200 efS=${efSearch} ==========`);
console.log(`platform=${process.platform}-${process.arch}`);

const rng = mkRng(7777);
const dataset = [];
for (let i = 0; i < N; i++) dataset.push(gaussianVector(rng, DIM));
const queryVector = dataset[QUERY_ID];

// Brute-force ground truth (matches the @ruvector/router test, same RNG seed)
const gt = dataset.map((v, id) => ({ id, score: cosine(queryVector, v) })).sort((a, b) => b.score - a.score).slice(0, 10);
console.log(`brute-force top-1: id=${gt[0].id} score=${gt[0].score.toFixed(6)}`);
console.log(`brute-force top-10 ids: ${gt.map(r => r.id).join(', ')}`);

// hnswlib-node setup. Cosine space, dim=384.
const index = new HierarchicalNSW('cosine', DIM);
index.initIndex(N, 16, 200);  // maxElements, M, efConstruction
index.setEf(efSearch);

const tIns = performance.now();
for (let i = 0; i < N; i++) index.addPoint(Array.from(dataset[i]), i);
const tInsEnd = performance.now() - tIns;

const tSrch = performance.now();
const res = index.searchKnn(Array.from(queryVector), 10);
const tSrchEnd = performance.now() - tSrch;

console.log(`insert: ${tInsEnd.toFixed(0)}ms; search: ${tSrchEnd.toFixed(2)}ms`);
console.log(`hnswlib-node top-10:`);
for (let i = 0; i < res.neighbors.length; i++) {
  const id = res.neighbors[i];
  const dist = res.distances[i];
  // hnswlib-node cosine returns 1 - cos_sim as distance
  const sim = 1 - dist;
  const trueRank = gt.findIndex(g => g.id === id);
  console.log(`  ${i + 1}. id=${id} sim=${sim.toFixed(6)} ${trueRank >= 0 ? `(brute-force rank ${trueRank + 1})` : '(NOT IN BF TOP-10)'}`);
}

const hits = new Set(res.neighbors);
const recall = gt.filter(g => hits.has(g.id)).length / gt.length;
console.log(`recall@10: ${(recall * 100).toFixed(0)}%`);
console.log(`top-1 == self(${QUERY_ID}): ${res.neighbors[0] === QUERY_ID ? 'YES' : 'NO'}`);
process.exit(0);
