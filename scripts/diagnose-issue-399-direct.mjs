/**
 * Issue #399 — bypass our wrapper and test @ruvector/router VectorDb directly.
 *
 * Tests:
 *   1. Cosine with NORMALIZED Gaussian inputs (unit-length)
 *   2. Cosine with UNNORMALIZED Gaussian inputs
 *   3. Euclidean with Gaussian inputs
 *
 * If normalized cosine works and unnormalized doesn't, the bug is "VectorDb
 * cosine requires pre-normalized inputs" — we'd need to normalize in our wrapper.
 *
 * If neither cosine variant works but Euclidean does, the bug is in VectorDb's
 * cosine implementation specifically.
 *
 * If nothing works, the entire HNSW graph walk is broken upstream.
 */

import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { VectorDb, DistanceMetric } = require('@ruvector/router');

const DIM = 384;
const N = 1000;
const QUERY_ID = 42;

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

function normalize(v) {
  let s = 0;
  for (let i = 0; i < v.length; i++) s += v[i] * v[i];
  const n = Math.sqrt(s);
  if (n === 0) return v;
  const out = new Float32Array(v.length);
  for (let i = 0; i < v.length; i++) out[i] = v[i] / n;
  return out;
}

function cosine(a, b) {
  let d = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) { d += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; }
  const den = Math.sqrt(na) * Math.sqrt(nb);
  return den === 0 ? 0 : d / den;
}

const mode = process.argv[2] ?? 'cosine-normalized';
console.log(`========== mode=${mode} ==========`);

const rng = mkRng(7777);
const raw = [];
for (let i = 0; i < N; i++) raw.push(gaussianVector(rng, DIM));

let dataset, metric;
if (mode === 'cosine-normalized') {
  dataset = raw.map(normalize);
  metric = DistanceMetric.Cosine;
} else if (mode === 'cosine-unnormalized') {
  dataset = raw;
  metric = DistanceMetric.Cosine;
} else if (mode === 'euclidean') {
  dataset = raw;
  metric = DistanceMetric.Euclidean;
} else {
  console.error('mode must be cosine-normalized | cosine-unnormalized | euclidean');
  process.exit(1);
}

const queryVector = dataset[QUERY_ID];

// Brute-force ground truth using cosine on whatever the dataset is
const gt = dataset.map((v, id) => ({ id, score: cosine(queryVector, v) })).sort((a, b) => b.score - a.score).slice(0, 10);
console.log(`brute-force top-10 ids: ${gt.map(r => r.id).join(', ')}`);
console.log(`brute-force top-1: id=${gt[0].id} score=${gt[0].score.toFixed(6)}`);

const db = new VectorDb({ dimensions: DIM, distanceMetric: metric, hnswM: 16, hnswEfConstruction: 200, hnswEfSearch: 100 });

const tIns = performance.now();
for (let i = 0; i < N; i++) db.insert(String(i), dataset[i]);
const tInsEnd = performance.now() - tIns;

const tSrch = performance.now();
const raw_results = db.search(queryVector, 10);
const tSrchEnd = performance.now() - tSrch;

console.log(`insert: ${tInsEnd.toFixed(0)}ms; search: ${tSrchEnd.toFixed(2)}ms`);
console.log(`raw VectorDb top-10:`);
for (let i = 0; i < raw_results.length; i++) {
  const r = raw_results[i];
  const trueRank = gt.findIndex(g => String(g.id) === r.id);
  console.log(`  ${i + 1}. id=${r.id} score=${r.score.toFixed(6)} ${trueRank >= 0 ? `(brute-force rank ${trueRank + 1})` : '(NOT IN BF TOP-10)'}`);
}

const hits = new Set(raw_results.map(r => r.id));
const recall = gt.filter(g => hits.has(String(g.id))).length / gt.length;
console.log(`recall@10: ${(recall * 100).toFixed(0)}%`);
console.log(`top-1 == self(${QUERY_ID}): ${raw_results[0].id === String(QUERY_ID) ? 'YES' : 'NO'}`);
process.exit(0);
