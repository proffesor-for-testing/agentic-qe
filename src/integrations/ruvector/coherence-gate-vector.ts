/**
 * Coherence Gate - Vector Math Utilities
 *
 * Pure math functions for word-level feature hashing and similarity.
 * Uses FNV-1a hashing for bucket assignment and L2-normalized
 * term-frequency vectors with cosine similarity.
 *
 * @module integrations/ruvector/coherence-gate-vector
 * @see ADR-083-coherence-gated-agent-actions.md
 */

/** Feature vector dimensionality */
export const FEATURE_DIM = 64;

/**
 * Hash a word to a bucket index 0-63 using FNV-1a.
 *
 * @param word - The word to hash
 * @returns Bucket index in [0, FEATURE_DIM)
 */
export function hashWord(word: string): number {
  let h = 0x811c9dc5; // FNV offset basis
  for (let i = 0; i < word.length; i++) {
    h ^= word.charCodeAt(i);
    h = Math.imul(h, 0x01000193); // FNV prime
  }
  return ((h >>> 0) % FEATURE_DIM);
}

/**
 * Convert text to a 64-dim word-level feature vector using feature hashing.
 *
 * Tokenizes on whitespace and punctuation, hashes each word to one of 64
 * buckets via FNV-1a, builds a term-frequency vector, and L2-normalizes it.
 *
 * @param text - The text to vectorize
 * @returns L2-normalized 64-dim feature vector
 */
export function textToWordFeatureVector(text: string): number[] {
  const vec = new Array(FEATURE_DIM).fill(0);
  const words = text.toLowerCase().split(/[\s,;:.!?()[\]{}"']+/).filter(w => w.length > 0);

  for (const word of words) {
    const bucket = hashWord(word);
    vec[bucket]++;
  }

  // L2-normalize
  let norm = 0;
  for (let i = 0; i < FEATURE_DIM; i++) {
    norm += vec[i] * vec[i];
  }
  norm = Math.sqrt(norm);
  if (norm > 1e-10) {
    for (let i = 0; i < FEATURE_DIM; i++) {
      vec[i] /= norm;
    }
  }

  return vec;
}

/**
 * Compute cosine similarity between two vectors.
 *
 * @param a - First vector
 * @param b - Second vector
 * @returns Cosine similarity in [0, 1] for non-negative vectors
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  const len = Math.min(a.length, b.length);
  for (let i = 0; i < len; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom > 1e-10 ? dot / denom : 0;
}
