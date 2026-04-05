/**
 * HNSW Shadow Validator (ADR-071 Phase 2C)
 *
 * Runs search queries against both the old HNSW implementation (brute-force
 * or InMemoryHNSWIndex) and the unified HnswAdapter backend, then compares
 * results to detect divergences before fully decommissioning old code.
 *
 * Use HnswShadowValidator.validate() to run a batch of queries and get a
 * divergence report. A divergence rate <2% is the go-criteria for enabling
 * the useUnifiedHnsw flag.
 *
 * @module kernel/hnsw-shadow-validator
 */

import { cosineSimilarity } from '../shared/utils/vector-math.js';
import type { HnswAdapter } from './hnsw-adapter.js';

// ============================================================================
// Types
// ============================================================================

export interface ShadowValidationResult {
  /** Total number of queries run */
  totalQueries: number;
  /** Number of queries where top-k sets diverged */
  divergentQueries: number;
  /** Divergence rate (0-1) */
  divergenceRate: number;
  /** Average Jaccard overlap of top-k result sets (1.0 = identical) */
  avgJaccardOverlap: number;
  /** Average score delta between old and new top-1 results */
  avgTop1ScoreDelta: number;
  /** Maximum observed score delta */
  maxTop1ScoreDelta: number;
  /** Whether the divergence rate meets the <2% go-criteria */
  passesGoGate: boolean;
  /** Per-query divergence details (only for divergent queries) */
  divergences: DivergenceDetail[];
}

export interface DivergenceDetail {
  queryIndex: number;
  oldTopK: string[];
  newTopK: string[];
  jaccardOverlap: number;
  top1ScoreDelta: number;
}

export interface ShadowValidationOptions {
  /** Number of nearest neighbors to compare (default: 10) */
  k?: number;
  /** Divergence rate threshold for pass/fail (default: 0.02 = 2%) */
  threshold?: number;
}

// ============================================================================
// Brute-Force Reference Implementation
// ============================================================================

/**
 * Simple brute-force cosine search used as ground-truth reference.
 * O(n) per query — accurate but slow.
 */
function bruteForceSearch(
  vectors: Map<string, number[]>,
  query: number[],
  k: number,
): Array<{ id: string; score: number }> {
  const scored: Array<{ id: string; score: number }> = [];
  for (const [id, vec] of vectors) {
    scored.push({ id, score: cosineSimilarity(query, vec) });
  }
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, k);
}

// ============================================================================
// Shadow Validator
// ============================================================================

/**
 * Validates that the unified HnswAdapter produces results consistent
 * with a brute-force reference search.
 *
 * @example
 * ```typescript
 * const validator = new HnswShadowValidator(adapter);
 *
 * // Add vectors to both the adapter and the validator's reference store
 * validator.addVector('doc-1', embedding1);
 * validator.addVector('doc-2', embedding2);
 *
 * // Run validation queries
 * const queries = [randomEmbedding(), randomEmbedding()];
 * const result = validator.validate(queries);
 *
 * console.log(`Divergence: ${(result.divergenceRate * 100).toFixed(1)}%`);
 * console.log(`Passes: ${result.passesGoGate}`);
 * ```
 */
export class HnswShadowValidator {
  private readonly adapter: HnswAdapter;
  private readonly referenceVectors = new Map<string, number[]>();

  constructor(adapter: HnswAdapter) {
    this.adapter = adapter;
  }

  /**
   * Add a vector to both the unified adapter and the brute-force reference.
   */
  addVector(id: string, vector: number[]): void {
    this.adapter.addByStringId(id, vector);
    this.referenceVectors.set(id, vector);
  }

  /**
   * Remove a vector from both stores.
   */
  removeVector(id: string): void {
    this.adapter.removeByStringId(id);
    this.referenceVectors.delete(id);
  }

  /**
   * Get the number of vectors in the reference store.
   */
  get size(): number {
    return this.referenceVectors.size;
  }

  /**
   * Run N queries against both implementations and compare results.
   *
   * @param queries - Array of query vectors
   * @param options - Validation options
   * @returns Validation result with divergence metrics
   */
  validate(
    queries: number[][],
    options: ShadowValidationOptions = {},
  ): ShadowValidationResult {
    const k = options.k ?? 10;
    const threshold = options.threshold ?? 0.02;

    const divergences: DivergenceDetail[] = [];
    let totalJaccard = 0;
    let totalScoreDelta = 0;
    let maxScoreDelta = 0;

    for (let qi = 0; qi < queries.length; qi++) {
      const query = queries[qi];

      // Reference: brute-force
      const refResults = bruteForceSearch(this.referenceVectors, query, k);
      const refIds = refResults.map(r => r.id);
      const refTop1Score = refResults.length > 0 ? refResults[0].score : 0;

      // Unified: HnswAdapter
      const adapterResults = this.adapter.searchByArray(query, k);
      const adapterIds = adapterResults.map(r => r.id);
      const adapterTop1Score = adapterResults.length > 0 ? adapterResults[0].score : 0;

      // Compute Jaccard overlap
      const refSet = new Set(refIds);
      const adapterSet = new Set(adapterIds);
      const intersection = new Set([...refSet].filter(id => adapterSet.has(id)));
      const union = new Set([...refSet, ...adapterSet]);
      const jaccard = union.size > 0 ? intersection.size / union.size : 1;

      const scoreDelta = Math.abs(refTop1Score - adapterTop1Score);

      totalJaccard += jaccard;
      totalScoreDelta += scoreDelta;
      maxScoreDelta = Math.max(maxScoreDelta, scoreDelta);

      // Track divergence if sets don't fully overlap
      if (jaccard < 1.0) {
        divergences.push({
          queryIndex: qi,
          oldTopK: refIds,
          newTopK: adapterIds,
          jaccardOverlap: jaccard,
          top1ScoreDelta: scoreDelta,
        });
      }
    }

    const divergenceRate = queries.length > 0
      ? divergences.length / queries.length
      : 0;

    return {
      totalQueries: queries.length,
      divergentQueries: divergences.length,
      divergenceRate,
      avgJaccardOverlap: queries.length > 0 ? totalJaccard / queries.length : 1,
      avgTop1ScoreDelta: queries.length > 0 ? totalScoreDelta / queries.length : 0,
      maxTop1ScoreDelta: maxScoreDelta,
      passesGoGate: divergenceRate <= threshold,
      divergences,
    };
  }
}
