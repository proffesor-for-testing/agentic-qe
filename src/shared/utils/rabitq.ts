/**
 * RaBitQ-style 1-bit sign signatures for fast vector retrieval.
 *
 * Ports ruflo's perf-M4 optimization: sign-random-projection + Hamming popcount
 * as a cheap prefilter ahead of exact cosine reranking.
 *
 * ## Why this works
 *
 * For unit-normalized embeddings, the sign of each coordinate is a valid
 * Locality-Sensitive Hash (LSH) for cosine similarity: the probability that two
 * vectors agree on the sign of a random projection is `1 - theta/pi`, where
 * `theta` is the angle between them (Charikar 2002, "SimHash"). The AQE
 * canonical embedding dimension is 384 (patterns.rvf dim=384); the coordinate
 * basis itself acts as the random projection family, so `bit_i = (vec[i] >= 0)`
 * yields a Hamming distance that is monotonically related to cosine angle.
 *
 * We therefore use Hamming distance over packed 1-bit signatures as a *cheap*
 * ranking proxy to shrink the candidate pool, then run *exact* cosine on the
 * survivors. With a large enough rerank pool the final top-k is identical to a
 * full exact scan — only the work is reduced.
 *
 * ## Memory
 *
 * A 384-dim Float32 vector costs 1536 bytes. Its sign signature costs 48 bytes
 * (12 × uint32). That is a 32× index-memory reduction for the prefilter stage.
 *
 * Self-contained: no I/O, no side effects, pure functions + one ranking helper.
 *
 * @module shared/utils/rabitq
 */

import { cosineSimilarity } from './vector-math.js';

// ============================================================================
// Constants
// ============================================================================

/** Bits packed per Uint32 word. */
const BITS_PER_WORD = 32;

/** AQE canonical embedding dimension (patterns.rvf dim=384). */
export const SIGNATURE_DIM = 384;

/**
 * Bytes per signature for the canonical 384-dim embedding:
 * ceil(384 / 32) = 12 words × 4 bytes = 48 bytes.
 * (vs 384 × 4 = 1536 bytes for the raw Float32 vector → 32× reduction.)
 */
export const SIGNATURE_BYTES = Math.ceil(SIGNATURE_DIM / BITS_PER_WORD) * 4; // 48

// ============================================================================
// Popcount (Brian-Kernighan)
// ============================================================================

/**
 * Population count (number of set bits) of a 32-bit word.
 *
 * Uses the SWAR (SIMD-within-a-register) bit-twiddle which is branchless and
 * faster than a per-byte table lookup for 32-bit words. The hdc-fingerprint
 * module uses a 256-entry per-byte table + Brian-Kernighan for its Uint8Array
 * vectors; here we operate on Uint32 words, so the SWAR variant is the natural
 * fit and avoids importing/splitting words into bytes.
 */
function popcount32(n: number): number {
  // Force unsigned 32-bit semantics.
  n = n >>> 0;
  n = n - ((n >>> 1) & 0x55555555);
  n = (n & 0x33333333) + ((n >>> 2) & 0x33333333);
  n = (n + (n >>> 4)) & 0x0f0f0f0f;
  return (Math.imul(n, 0x01010101) >>> 24) & 0xff;
}

// ============================================================================
// Signature construction
// ============================================================================

/**
 * Build a 1-bit sign signature from a vector.
 *
 * `bit_i = (vec[i] >= 0)`. Bits are packed LSB-first into Uint32 words:
 * coordinate `i` lives in word `i >> 5` at bit `i & 31`.
 *
 * For a 384-dim input this returns 12 words (48 bytes). Inputs of other
 * dimensions are supported (signature length = ceil(dim / 32) words).
 *
 * @param vec Embedding vector (assumed unit-normalized for the LSH guarantee,
 *            but the function works on any real vector).
 * @returns Packed sign bits as a Uint32Array.
 */
export function signSignature(vec: number[] | Float32Array): Uint32Array {
  const dim = vec.length;
  const words = Math.ceil(dim / BITS_PER_WORD);
  const sig = new Uint32Array(words);
  for (let i = 0; i < dim; i++) {
    if (vec[i] >= 0) {
      sig[i >> 5] |= 1 << (i & 31);
    }
  }
  return sig;
}

// ============================================================================
// Hamming distance / similarity
// ============================================================================

/**
 * Hamming distance between two packed signatures: popcount(a XOR b) summed
 * over all words.
 *
 * @throws If the two signatures have different word lengths.
 */
export function hammingDistance(a: Uint32Array, b: Uint32Array): number {
  if (a.length !== b.length) {
    throw new Error(
      `Signature length mismatch: ${a.length} vs ${b.length} words`
    );
  }
  let dist = 0;
  for (let i = 0; i < a.length; i++) {
    dist += popcount32((a[i] ^ b[i]) >>> 0);
  }
  return dist;
}

/**
 * Hamming similarity in [0, 1]: `1 - hammingDistance / bits`.
 *
 * This is a monotonic proxy for cosine similarity (higher = closer). `bits`
 * should be the true embedding dimension (e.g. 384), not `words × 32`, so that
 * trailing padding bits — which are always 0 in both signatures and never
 * contribute to the distance — don't deflate the normalization.
 */
export function hammingSimilarity(
  a: Uint32Array,
  b: Uint32Array,
  bits: number
): number {
  if (bits <= 0) return 0;
  return 1 - hammingDistance(a, b) / bits;
}

// ============================================================================
// Top-K retrieval
// ============================================================================

/** A retrieval candidate. `signature` is optional and lazily built if absent. */
export interface RaBitQCandidate {
  id: string;
  vector: number[] | Float32Array;
  /** Precomputed sign signature; built on demand from `vector` if omitted. */
  signature?: Uint32Array;
}

/** A scored result. `score` is the exact cosine similarity (or Hamming proxy). */
export interface RaBitQResult {
  id: string;
  score: number;
}

/** Tuning knobs for {@link topKBySignature}. */
export interface TopKOptions {
  /**
   * Below this candidate count, skip RaBitQ entirely and do an exact cosine
   * top-k. RaBitQ's signature-build + Hamming-scan overhead is not worth it for
   * small N. Default 100 (matches ruflo's gate).
   */
  gateN?: number;
  /**
   * How many Hamming-ranked candidates to feed into the exact rerank.
   *
   * Larger pool → higher recall, more exact-cosine work. **Default is
   * recall-aware**: `max(4 × k, ceil(0.4 × N))`.
   *
   * IMPORTANT — empirically measured tradeoff (384-dim, see
   * scripts/benchmark-rabitq.ts): a 1-bit sign signature is a *coarse*
   * quantization, so a small fixed pool (e.g. `4 × k = 40`) does NOT preserve
   * recall@10 at scale — at N=1000 it captures only ~70-85% of the true top-10,
   * and worse at N=5000. To keep recall@10 ≥ ~0.95 the pool must be a sizeable
   * fraction of N (~40% empirically), which limits the achievable speedup.
   * Callers that can tolerate lower recall may pass a smaller pool for more
   * speed; callers that need exact output should not use RaBitQ at all.
   */
  rerankPool?: number;
  /**
   * If true (default), run full cosineSimilarity on the Hamming-top pool and
   * return the true top-k by cosine. If false, return the Hamming-only ranking
   * (faster, approximate).
   */
  exactRerank?: boolean;
}

/**
 * Exact cosine top-k over all candidates. Shared by the small-N gate and the
 * rerank stage.
 */
function exactTopK(
  query: number[] | Float32Array,
  candidates: RaBitQCandidate[],
  k: number
): RaBitQResult[] {
  const scored: RaBitQResult[] = new Array(candidates.length);
  for (let i = 0; i < candidates.length; i++) {
    scored[i] = {
      id: candidates[i].id,
      score: cosineSimilarity(query, candidates[i].vector),
    };
  }
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, k);
}

/**
 * Retrieve the top-k candidates for a query using a RaBitQ Hamming prefilter
 * followed by an exact cosine rerank.
 *
 * Behavior:
 * - `candidates.length < gateN` → plain exact cosine top-k (gate; RaBitQ
 *   overhead not worth it for small N).
 * - otherwise → build/reuse sign signatures, rank ALL candidates by Hamming
 *   distance (cheap), take the top `rerankPool`, then:
 *     - `exactRerank=true` (default): run FULL cosine on just that pool and
 *       return the true top-k. Output equals an exact scan whenever the true
 *       top-k all fall within the Hamming top-`rerankPool` — recall is
 *       preserved by the rerank, only speed changes.
 *     - `exactRerank=false`: return the Hamming-only top-k (approximate).
 *
 * @param query Query vector (same dimension as candidate vectors).
 * @param candidates Candidate set.
 * @param k Number of results to return.
 * @param opts Tuning knobs (see {@link TopKOptions}).
 */
export function topKBySignature(
  query: number[] | Float32Array,
  candidates: RaBitQCandidate[],
  k: number,
  opts: TopKOptions = {}
): RaBitQResult[] {
  const gateN = opts.gateN ?? 100;
  const exactRerank = opts.exactRerank ?? true;

  const n = candidates.length;
  if (n === 0 || k <= 0) return [];

  // Recall-aware default pool: a 1-bit signature in high dimensions is coarse,
  // so the pool must scale with N to keep recall high (see rerankPool docs).
  const rerankPool = opts.rerankPool ?? Math.max(4 * k, Math.ceil(0.4 * n));

  // Small-N gate: exact cosine, skip signature machinery entirely.
  if (n < gateN) {
    return exactTopK(query, candidates, Math.min(k, n));
  }

  const bits = query.length;
  const querySig = signSignature(query);

  // Rank ALL candidates by Hamming distance (cheap popcount scan).
  const hammingRanked: Array<{ idx: number; dist: number }> = new Array(n);
  for (let i = 0; i < n; i++) {
    const cand = candidates[i];
    const sig = cand.signature ?? signSignature(cand.vector);
    hammingRanked[i] = { idx: i, dist: hammingDistance(querySig, sig) };
  }
  // Ascending distance = descending similarity.
  hammingRanked.sort((a, b) => a.dist - b.dist);

  const poolSize = Math.min(rerankPool, n);

  if (!exactRerank) {
    // Hamming-only ranking: return the top-k by Hamming proxy similarity.
    const topK = Math.min(k, n);
    const out: RaBitQResult[] = new Array(topK);
    for (let i = 0; i < topK; i++) {
      const { idx, dist } = hammingRanked[i];
      out[i] = { id: candidates[idx].id, score: 1 - dist / bits };
    }
    return out;
  }

  // Exact rerank: full cosine over the Hamming-top pool, return true top-k.
  const pool: RaBitQCandidate[] = new Array(poolSize);
  for (let i = 0; i < poolSize; i++) {
    pool[i] = candidates[hammingRanked[i].idx];
  }
  return exactTopK(query, pool, Math.min(k, poolSize));
}
