/**
 * Agentic QE v3 - Learning consolidation: pattern archiving (#1071)
 *
 * The consolidation protocol archives patterns it selected for removal.
 * Archiving is a move inside the `learning-optimization` namespace, where
 * `LearningCoordinatorService` writes every learned pattern:
 *
 *   learning:pattern:<id>  ->  learning:pattern:archived:<id>
 *
 * Safety rules:
 * - Only the active key of a pattern the protocol selected is deleted.
 * - The active record must still be the selected pattern (same id, and the
 *   same scores and last use) when the archive runs, or nothing is written or
 *   deleted. A pattern used or re-scored since it was selected is left active.
 * - The archive copy is read back before the active key is deleted, so a
 *   failed write never loses the pattern.
 * The move is implemented in domains/learning-optimization/pattern-archive.ts.
 */

import type { LearnedPattern } from '../../domains/learning-optimization/interfaces.js';

// The move itself lives with the patterns, so the merge path in
// LearningCoordinatorService uses the same read-back rule (#1106).
export { archiveSelectedPattern, type ArchiveOutcome } from '../../domains/learning-optimization/pattern-archive.js';

/** Counts of one consolidation run's archive step, for logs and results. */
export interface ArchiveCounts {
  /** Patterns the retention and trim rules selected for removal. */
  selected: number;
  /** Selected patterns moved to `:archived:` and removed from the active set. */
  archived: number;
  /** Selected patterns whose active record was gone or changed; left alone. */
  missing: number;
  /** Selected patterns whose archive copy could not be verified; left active. */
  failed: number;
}

export function emptyArchiveCounts(): ArchiveCounts {
  return { selected: 0, archived: 0, missing: 0, failed: 0 };
}

/** True when the pattern was created less than `graceDays` days ago. */
export function isWithinRetentionGrace(pattern: LearnedPattern, graceDays: number, now = Date.now()): boolean {
  if (graceDays <= 0) return false;
  const created = new Date(pattern.createdAt).getTime();
  if (!Number.isFinite(created)) return false;
  return now - created < graceDays * 24 * 60 * 60 * 1000;
}
