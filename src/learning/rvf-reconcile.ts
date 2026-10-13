/**
 * Reconcile the derived RVF vector index with authoritative SQLite vectors
 * (#981 review B2).
 *
 * `aqe learning backfill-embeddings` and any other SQLite-only vector write
 * leave patterns.rvf behind. The original re-ingest only ran while the index
 * was empty, so a single pattern learned with an embedder blocked every later
 * backfill from reaching vector search. This pass ingests exactly the vectors
 * that are in SQLite for the active embedding space but not in the index.
 */

import type { RvfNativeAdapter } from '../integrations/ruvector/rvf-native-adapter.js';

export interface RvfReconcileSource {
  /** Pattern ids with a stored vector in `spaceId`; `ordered`: most recently used first. */
  getEmbeddingIdsInSpace(spaceId: string, options?: { ordered?: boolean }): string[];
  /** Stored vectors for `ids`. */
  getEmbeddingsByIds(ids: string[]): Array<{ patternId: string; embedding: number[] }>;
}

export type RvfReconcileTarget = Pick<RvfNativeAdapter, 'ingest'> & Partial<Pick<RvfNativeAdapter, 'has'>>;

export interface RvfReconcileResult {
  /** SQLite vectors in the active space that the index did not hold. */
  missing: number;
  ingested: number;
  rejected: number;
  /** True when `missing` exceeded `limit` and the rest waits for a later pass. */
  capped: boolean;
}

/**
 * Ingest SQLite vectors (active space only) missing from the RVF index.
 * Idempotent: ids the index already holds are skipped, so repeated runs add
 * nothing. An adapter without `has()` cannot be reconciled safely (ingest is
 * not idempotent), so the pass is skipped.
 */
export function reconcileRvfWithSqlite(
  adapter: RvfReconcileTarget,
  sqlite: RvfReconcileSource,
  activeSpaceId: string,
  limit: number,
): RvfReconcileResult {
  const none: RvfReconcileResult = { missing: 0, ingested: 0, rejected: 0, capped: false };
  if (typeof adapter.has !== 'function') return none;

  // Cheap no-op path first: an unordered id scan + has() per id. The ordered
  // (join + sort) query runs only when one pass cannot ingest everything and
  // the most recently used vectors should go first.
  const missing = (ids: string[]) => ids.filter((id) => !adapter.has!(id));
  let missingIds = missing(sqlite.getEmbeddingIdsInSpace(activeSpaceId));
  if (missingIds.length === 0) return none;

  const cap = Number.isFinite(limit) && limit > 0 ? Math.floor(limit) : 1000;
  if (missingIds.length > cap) {
    missingIds = missing(sqlite.getEmbeddingIdsInSpace(activeSpaceId, { ordered: true }));
  }
  const batchIds = missingIds.slice(0, cap);
  const vectors = sqlite
    .getEmbeddingsByIds(batchIds)
    .filter(({ embedding }) => embedding && embedding.length > 0)
    .map(({ patternId, embedding }) => ({ id: patternId, vector: new Float32Array(embedding) }));
  const { accepted, rejected } = vectors.length > 0 ? adapter.ingest(vectors) : { accepted: 0, rejected: 0 };
  return { missing: missingIds.length, ingested: accepted, rejected, capped: missingIds.length > cap };
}
