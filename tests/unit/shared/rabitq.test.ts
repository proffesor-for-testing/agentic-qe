/**
 * Tests for RaBitQ-style 1-bit sign signatures (src/shared/utils/rabitq.ts).
 *
 * Validates:
 * - sign signature bit packing + word length
 * - Hamming distance bounds (identical → 0, opposite → dim)
 * - Hamming similarity monotonicity vs cosine (rank correlation)
 * - topKBySignature exact-rerank recall@k == 1.0 vs brute-force cosine
 * - small-N gate falls back to exact cosine
 */

import { describe, it, expect } from 'vitest';
import {
  signSignature,
  hammingDistance,
  hammingSimilarity,
  topKBySignature,
  SIGNATURE_BYTES,
  type RaBitQCandidate,
} from '../../../src/shared/utils/rabitq';
import { cosineSimilarity } from '../../../src/shared/utils/vector-math';

// ============================================================================
// Seeded PRNG (mulberry32) — deterministic test corpus
// ============================================================================

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
    // Box-Muller-ish: use uniform centered, good enough for sign-LSH testing.
    v[i] = rng() * 2 - 1;
    norm += v[i] * v[i];
  }
  norm = Math.sqrt(norm);
  if (norm > 0) for (let i = 0; i < dim; i++) v[i] /= norm;
  return v;
}

function bruteForceTopK(
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

// ============================================================================
// signSignature: bit packing + length
// ============================================================================

describe('signSignature', () => {
  it('packs the sign of each coordinate LSB-first', () => {
    // dim=4: bits for [+, -, +, +] => bit0=1, bit1=0, bit2=1, bit3=1 => 0b1101 = 13
    const sig = signSignature([0.5, -0.5, 0.1, 2.0]);
    expect(sig.length).toBe(1); // ceil(4/32) = 1 word
    expect(sig[0]).toBe(0b1101);
  });

  it('treats zero as a set bit (vec[i] >= 0)', () => {
    const sig = signSignature([0, -1]);
    // bit0 = (0 >= 0) = 1, bit1 = (-1 >= 0) = 0
    expect(sig[0]).toBe(0b01);
  });

  it('produces ceil(dim/32) words for 384-dim vectors', () => {
    const sig = signSignature(new Float32Array(384).fill(1));
    expect(sig.length).toBe(12); // ceil(384/32)
    // all positive → all 384 bits set
    expect(hammingDistance(sig, sig)).toBe(0);
  });

  it('handles dimensions that are not multiples of 32', () => {
    const sig = signSignature(new Float32Array(384 + 5).fill(1));
    expect(sig.length).toBe(13); // ceil(389/32)
  });

  it('exposes SIGNATURE_BYTES = 48 for 384-dim', () => {
    expect(SIGNATURE_BYTES).toBe(48); // 12 words * 4 bytes
  });
});

// ============================================================================
// hammingDistance
// ============================================================================

describe('hammingDistance', () => {
  it('returns 0 for identical vectors', () => {
    const rng = mulberry32(42);
    const v = randomUnitVector(384, rng);
    const sig = signSignature(v);
    expect(hammingDistance(sig, sig)).toBe(0);
  });

  it('returns dim for sign-opposite vectors', () => {
    const rng = mulberry32(7);
    const v = randomUnitVector(384, rng);
    const opposite = v.map((x) => -x);
    // Negate every coordinate that was >= 0 and vice versa.
    // Note: -0 >= 0 is true, so guard against exact zeros (random unit vec ~never 0).
    const a = signSignature(v);
    const b = signSignature(opposite);
    expect(hammingDistance(a, b)).toBe(384);
  });

  it('throws on length mismatch', () => {
    const a = signSignature(new Float32Array(64));
    const b = signSignature(new Float32Array(96));
    expect(() => hammingDistance(a, b)).toThrow(/length mismatch/i);
  });
});

// ============================================================================
// hammingSimilarity monotonicity vs cosine
// ============================================================================

describe('hammingSimilarity', () => {
  it('is monotonically related to cosine over random unit vectors (rank corr > 0.7)', () => {
    const rng = mulberry32(12345);
    const dim = 384;
    const query = randomUnitVector(dim, rng);
    const querySig = signSignature(query);

    const SAMPLE = 400;
    const pairs: Array<{ cos: number; ham: number }> = [];
    for (let i = 0; i < SAMPLE; i++) {
      const v = randomUnitVector(dim, rng);
      pairs.push({
        cos: cosineSimilarity(query, v),
        ham: hammingSimilarity(querySig, signSignature(v), dim),
      });
    }

    expect(spearman(pairs.map((p) => p.cos), pairs.map((p) => p.ham))).toBeGreaterThan(0.7);
  });

  it('returns 1.0 for identical and ~0.0 for opposite', () => {
    const rng = mulberry32(99);
    const v = randomUnitVector(384, rng);
    const sig = signSignature(v);
    expect(hammingSimilarity(sig, sig, 384)).toBe(1.0);
    const opp = signSignature(v.map((x) => -x));
    expect(hammingSimilarity(sig, opp, 384)).toBe(0.0);
  });
});

/** Spearman rank correlation coefficient. */
function spearman(x: number[], y: number[]): number {
  const rank = (arr: number[]): number[] => {
    const idx = arr.map((v, i) => ({ v, i })).sort((a, b) => a.v - b.v);
    const ranks = new Array<number>(arr.length);
    for (let r = 0; r < idx.length; r++) ranks[idx[r].i] = r;
    return ranks;
  };
  const rx = rank(x);
  const ry = rank(y);
  const n = x.length;
  let sumSqD = 0;
  for (let i = 0; i < n; i++) {
    const d = rx[i] - ry[i];
    sumSqD += d * d;
  }
  return 1 - (6 * sumSqD) / (n * (n * n - 1));
}

// ============================================================================
// topKBySignature
// ============================================================================

describe('topKBySignature', () => {
  it('exact-rerank with a large enough pool returns the same top-k as brute-force cosine (recall@10 == 1.0)', () => {
    // A 1-bit sign signature in 384-dim is coarse: the true top-10 only all
    // land inside the Hamming-top pool once the pool is a large fraction of N
    // (empirically ~80% at N=300 — see scripts/benchmark-rabitq.ts). When the
    // pool is large enough, exact rerank reproduces brute-force EXACTLY.
    const rng = mulberry32(2024);
    const dim = 384;
    const N = 300;
    const candidates: RaBitQCandidate[] = [];
    for (let i = 0; i < N; i++) {
      candidates.push({ id: `c-${i}`, vector: randomUnitVector(dim, rng) });
    }

    const k = 10;
    const QUERIES = 20;
    for (let q = 0; q < QUERIES; q++) {
      const query = randomUnitVector(dim, rng);
      const expected = bruteForceTopK(query, candidates, k);
      const got = topKBySignature(query, candidates, k, {
        gateN: 100,
        rerankPool: 240, // ~80% of N — required for exact recall at 1-bit precision
        exactRerank: true,
      }).map((r) => r.id);

      const expectedSet = new Set(expected);
      const recall = got.filter((id) => expectedSet.has(id)).length / k;
      expect(recall).toBe(1.0);
      // With a sufficient pool, exact rerank reproduces ordering exactly.
      expect(got).toEqual(expected);
    }
  });

  it('documents the recall/speed tradeoff: a small pool sacrifices recall', () => {
    // HONEST CONTRACT: a small fixed rerank pool (4×k) does NOT preserve
    // recall@10 at scale. This test pins that measured behavior so regressions
    // (or accidental claims of free exact recall) are caught.
    const rng = mulberry32(2024);
    const dim = 384;
    const N = 300;
    const candidates: RaBitQCandidate[] = [];
    for (let i = 0; i < N; i++) {
      candidates.push({ id: `c-${i}`, vector: randomUnitVector(dim, rng) });
    }
    const k = 10;
    let total = 0;
    const QUERIES = 20;
    for (let q = 0; q < QUERIES; q++) {
      const query = randomUnitVector(dim, rng);
      const expected = new Set(bruteForceTopK(query, candidates, k));
      const got = topKBySignature(query, candidates, k, {
        gateN: 100,
        rerankPool: 4 * k, // 40 — small pool
        exactRerank: true,
      }).map((r) => r.id);
      total += got.filter((id) => expected.has(id)).length / k;
    }
    const avgRecall = total / QUERIES;
    // Small pool recovers most but not all neighbors — strictly below 1.0.
    expect(avgRecall).toBeLessThan(1.0);
    expect(avgRecall).toBeGreaterThan(0.5);
  });

  it('small-N (< gateN) falls back to exact cosine top-k', () => {
    const rng = mulberry32(555);
    const dim = 384;
    const N = 50; // below default gateN=100
    const candidates: RaBitQCandidate[] = [];
    for (let i = 0; i < N; i++) {
      candidates.push({ id: `c-${i}`, vector: randomUnitVector(dim, rng) });
    }
    const query = randomUnitVector(dim, rng);
    const k = 10;
    const expected = bruteForceTopK(query, candidates, k);
    const got = topKBySignature(query, candidates, k).map((r) => r.id);
    expect(got).toEqual(expected);
  });

  it('returns Hamming-only ranking when exactRerank=false', () => {
    const rng = mulberry32(31337);
    const dim = 384;
    const N = 200;
    const candidates: RaBitQCandidate[] = [];
    for (let i = 0; i < N; i++) {
      candidates.push({ id: `c-${i}`, vector: randomUnitVector(dim, rng) });
    }
    const query = randomUnitVector(dim, rng);
    const got = topKBySignature(query, candidates, 10, { exactRerank: false });
    expect(got).toHaveLength(10);
    // Scores must be the Hamming-proxy similarity in [0,1], descending.
    for (let i = 1; i < got.length; i++) {
      expect(got[i].score).toBeLessThanOrEqual(got[i - 1].score);
      expect(got[i].score).toBeGreaterThanOrEqual(0);
      expect(got[i].score).toBeLessThanOrEqual(1);
    }
  });

  it('reuses precomputed signatures when provided', () => {
    const rng = mulberry32(8);
    const dim = 384;
    const N = 150;
    const candidates: RaBitQCandidate[] = [];
    for (let i = 0; i < N; i++) {
      const vector = randomUnitVector(dim, rng);
      candidates.push({ id: `c-${i}`, vector, signature: signSignature(vector) });
    }
    const query = randomUnitVector(dim, rng);
    const expected = bruteForceTopK(query, candidates, 10);
    // Full pool (= N) → exact equality, exercises the precomputed-signature path.
    const got = topKBySignature(query, candidates, 10, { rerankPool: N }).map(
      (r) => r.id
    );
    expect(got).toEqual(expected);
  });

  it('returns empty for empty candidates or non-positive k', () => {
    const query = new Float32Array(384).fill(1);
    expect(topKBySignature(query, [], 10)).toEqual([]);
    expect(topKBySignature(query, [{ id: 'x', vector: query }], 0)).toEqual([]);
  });
});
