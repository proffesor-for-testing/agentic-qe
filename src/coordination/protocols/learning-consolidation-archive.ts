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
 * - The active record must still be the selected pattern (same id) when the
 *   archive runs, or nothing is written or deleted.
 * - The archive copy is read back before the active key is deleted, so a
 *   failed write never loses the pattern.
 */

import type { MemoryBackend } from '../../kernel/interfaces.js';
import {
  LEARNING_NS,
  LEARNING_PATTERN_KEY_PREFIX,
  isActivePatternKey,
} from '../../domains/learning-optimization/active-patterns.js';
import type { LearnedPattern } from '../../domains/learning-optimization/interfaces.js';

export type ArchiveOutcome = 'archived' | 'missing' | 'failed';

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

/**
 * Move one selected pattern to its archive key in the learning namespace.
 */
export async function archiveSelectedPattern(
  memory: MemoryBackend,
  pattern: LearnedPattern,
  archivedAt: Date = new Date(),
): Promise<ArchiveOutcome> {
  const activeKey = `${LEARNING_PATTERN_KEY_PREFIX}${pattern.id}`;
  if (!isActivePatternKey(activeKey)) return 'missing';

  const current = await memory.get<{ id?: unknown }>(activeKey, LEARNING_NS);
  if (!current || current.id !== pattern.id) return 'missing';

  const archiveKey = `${LEARNING_PATTERN_KEY_PREFIX}archived:${pattern.id}`;
  await memory.set(archiveKey, { ...pattern, archivedAt }, { ...LEARNING_NS, persist: true });

  const copy = await memory.get<{ id?: unknown }>(archiveKey, LEARNING_NS);
  if (!copy || copy.id !== pattern.id) return 'failed';

  await memory.delete(activeKey, LEARNING_NS);
  return 'archived';
}

/** True when the pattern was created less than `graceDays` days ago. */
export function isWithinRetentionGrace(pattern: LearnedPattern, graceDays: number, now = Date.now()): boolean {
  if (graceDays <= 0) return false;
  const created = new Date(pattern.createdAt).getTime();
  if (!Number.isFinite(created)) return false;
  return now - created < graceDays * 24 * 60 * 60 * 1000;
}
