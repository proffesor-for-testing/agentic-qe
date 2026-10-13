export type PatternMutationDisposition = 'FAILED' | 'COMMITTED_PENDING_INDEX';

/** Error evidence that distinguishes an uncommitted write from index lag. */
export class PatternMutationError extends Error {
  readonly patternId: string;
  readonly disposition: PatternMutationDisposition;
  override readonly cause: unknown;

  constructor(patternId: string, disposition: PatternMutationDisposition, cause: unknown) {
    super(`${disposition}: pattern ${patternId}: ${cause instanceof Error ? cause.message : String(cause)}`);
    this.name = 'PatternMutationError';
    this.patternId = patternId;
    this.disposition = disposition;
    this.cause = cause;
  }
}

/**
 * The pattern id when `error` proves the authoritative SQLite row committed and
 * only the derived vector index (HNSW/RVF) is pending, e.g. no embedding runtime
 * was available (#981). Callers treat that as a stored pattern whose vector can
 * be filled later by `aqe learning backfill-embeddings`. Any other error,
 * including a `FAILED` disposition, returns null.
 */
export function committedPendingIndexPatternId(error: unknown): string | null {
  return error instanceof PatternMutationError && error.disposition === 'COMMITTED_PENDING_INDEX'
    ? error.patternId
    : null;
}
