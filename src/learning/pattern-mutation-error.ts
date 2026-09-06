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
