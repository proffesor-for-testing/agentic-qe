/**
 * Agentic QE v3 - Archiving one learned pattern (#1071, #1106)
 *
 * Archiving is a move inside the `learning-optimization` namespace:
 *
 *   learning:pattern:<id>  ->  learning:pattern:archived:<id>
 *
 * Both callers use it: the consolidation protocol's trim path (#1071) and the
 * merge path in `LearningCoordinatorService.consolidatePatterns` (#1106).
 *
 * Safety rules:
 * - Only the active key of the given pattern is deleted.
 * - The active record must still be that pattern (same id, and the same scores
 *   and last use) when the archive runs, or nothing is written or deleted.
 * - The archive copy is read back before the active key is deleted, so a
 *   failed or partial write never loses the pattern.
 */

import type { MemoryBackend } from '../../kernel/interfaces.js';
import { LEARNING_NS, LEARNING_PATTERN_KEY_PREFIX, isActivePatternKey } from './active-patterns.js';
import type { LearnedPattern } from './interfaces.js';

export type ArchiveOutcome = 'archived' | 'missing' | 'failed';

/**
 * Write the archive copy of one pattern and read it back, without touching
 * the active key. `copied` means the copy is verified and the active record
 * is still the given pattern.
 */
export async function copyPatternToArchive(
  memory: MemoryBackend,
  pattern: LearnedPattern,
  archivedAt: Date = new Date(),
): Promise<'copied' | Exclude<ArchiveOutcome, 'archived'>> {
  const activeKey = `${LEARNING_PATTERN_KEY_PREFIX}${pattern.id}`;
  if (!isActivePatternKey(activeKey)) return 'missing';

  const current = await memory.get<Record<string, unknown>>(activeKey, LEARNING_NS);
  if (!current || current.id !== pattern.id || changedSinceSelection(current, pattern)) return 'missing';

  const archiveKey = `${LEARNING_PATTERN_KEY_PREFIX}archived:${pattern.id}`;
  await memory.set(archiveKey, { ...pattern, archivedAt }, { ...LEARNING_NS, persist: true });

  const copy = await memory.get<{ id?: unknown }>(archiveKey, LEARNING_NS);
  return copy && copy.id === pattern.id ? 'copied' : 'failed';
}

/** Remove the active key of a pattern whose archive copy was verified. */
export async function removeArchivedPattern(memory: MemoryBackend, pattern: LearnedPattern): Promise<void> {
  await memory.delete(`${LEARNING_PATTERN_KEY_PREFIX}${pattern.id}`, LEARNING_NS);
}

/** Move one pattern to its archive key in the learning namespace. */
export async function archiveSelectedPattern(
  memory: MemoryBackend,
  pattern: LearnedPattern,
  archivedAt: Date = new Date(),
): Promise<ArchiveOutcome> {
  const copied = await copyPatternToArchive(memory, pattern, archivedAt);
  if (copied !== 'copied') return copied;
  await removeArchivedPattern(memory, pattern);
  return 'archived';
}

/** True when the stored record's scores or last use differ from the selected snapshot. */
function changedSinceSelection(current: Record<string, unknown>, selected: LearnedPattern): boolean {
  const time = (value: unknown): number => new Date(value as string | number | Date).getTime();
  return (
    !Object.is(current.usageCount, selected.usageCount) ||
    !Object.is(current.confidence, selected.confidence) ||
    !Object.is(current.successRate, selected.successRate) ||
    !Object.is(time(current.lastUsedAt), time(selected.lastUsedAt))
  );
}
