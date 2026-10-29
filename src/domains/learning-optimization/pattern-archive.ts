/**
 * Agentic QE v3 - Archiving one learned pattern (#1071, #1106, #1149)
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
 * - The archive copy is the stored active record. It is read back and compared
 *   in full before the active key is deleted, so a failed or partial write
 *   never loses the pattern (#1149).
 * - Compare-and-delete: the active key is deleted only while the active record
 *   still equals the archive copy. An update made after the copy keeps the
 *   pattern active (#1149).
 * - A copy that is not followed by a delete is removed again, so no archive
 *   row is left for a pattern that is still active (#1149).
 * - Moves on one backend run one at a time (`withPatternMoveLock`), so two
 *   merges of the same patterns cannot both succeed (#1149). The lock is
 *   per process; the backend has no transactions to lock across processes.
 */

import type { MemoryBackend } from '../../kernel/interfaces.js';
import { LEARNING_NS, LEARNING_PATTERN_KEY_PREFIX, isActivePatternKey } from './active-patterns.js';
import type { LearnedPattern } from './interfaces.js';

/**
 * Outcome of one move:
 * - `archived`: copied, verified, and removed from the active set
 * - `missing`: the active record is gone; nothing was written
 * - `changed`: the active record changed since it was selected, or during
 *   the move; it stays active and no archive copy is kept
 * - `failed`: the archive copy could not be verified; the pattern stays active
 */
export type ArchiveOutcome = 'archived' | 'missing' | 'changed' | 'failed';

/**
 * Outcome of removing the active key after a copy:
 * - `removed`: the active record equalled the archive copy and was deleted
 * - `missing`: the active record was already gone
 * - `changed`: the active record changed after the copy; left active
 * - `failed`: the archive copy is gone or no longer verifies; left active
 */
export type RemoveOutcome = 'removed' | 'missing' | 'changed' | 'failed';

const activeKeyOf = (id: string): string => `${LEARNING_PATTERN_KEY_PREFIX}${id}`;
const archiveKeyOf = (id: string): string => `${LEARNING_PATTERN_KEY_PREFIX}archived:${id}`;

/**
 * JSON with object keys sorted, so two records compare equal exactly when
 * they store the same values. Dates serialize as ISO strings, as they do in
 * the backend.
 */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(value, (_key, v: unknown) =>
    v && typeof v === 'object' && !Array.isArray(v)
      ? Object.fromEntries(Object.entries(v as Record<string, unknown>).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)))
      : v
  );
}

/** The archive copy without its `archivedAt` stamp, i.e. the record that was archived. */
function archivedRecord(copy: Record<string, unknown>): Record<string, unknown> {
  const { archivedAt: _archivedAt, ...record } = copy;
  return record;
}

/**
 * Write the archive copy of one pattern and read it back, without touching
 * the active key. `copied` means the copy is verified in full and the active
 * record is still the given pattern. On `failed` the unverified copy has been
 * removed again.
 */
export async function copyPatternToArchive(
  memory: MemoryBackend,
  pattern: LearnedPattern,
  archivedAt: Date = new Date(),
): Promise<'copied' | Exclude<ArchiveOutcome, 'archived'>> {
  const activeKey = activeKeyOf(pattern.id);
  if (!isActivePatternKey(activeKey)) return 'missing';

  const current = await memory.get<Record<string, unknown>>(activeKey, LEARNING_NS);
  if (!current || current.id !== pattern.id) return 'missing';
  if (changedSinceSelection(current, pattern)) return 'changed';

  const archiveKey = archiveKeyOf(pattern.id);
  const expected = { ...current, archivedAt };
  await memory.set(archiveKey, expected, { ...LEARNING_NS, persist: true });

  const copy = await memory.get<unknown>(archiveKey, LEARNING_NS);
  if (copy && canonicalJson(copy) === canonicalJson(expected)) return 'copied';
  await discardArchiveCopy(memory, pattern);
  return 'failed';
}

/**
 * Compare-and-delete the active key of a pattern whose archive copy was
 * verified: delete only while the active record still equals the copy.
 */
export async function removeArchivedPattern(memory: MemoryBackend, pattern: LearnedPattern): Promise<RemoveOutcome> {
  const activeKey = activeKeyOf(pattern.id);
  const active = await memory.get<unknown>(activeKey, LEARNING_NS);
  if (!active) return 'missing';

  const copy = await memory.get<Record<string, unknown>>(archiveKeyOf(pattern.id), LEARNING_NS);
  if (!copy || typeof copy !== 'object' || copy.id !== pattern.id) return 'failed';
  if (canonicalJson(active) !== canonicalJson(archivedRecord(copy))) return 'changed';

  await memory.delete(activeKey, LEARNING_NS);
  return 'removed';
}

/**
 * Remove the archive copy of a pattern that is still active, after a move
 * that did not complete. The copy is kept when the active record is gone, so
 * a pattern is never left without either record.
 */
export async function discardArchiveCopy(memory: MemoryBackend, pattern: LearnedPattern): Promise<boolean> {
  if (!(await memory.get<unknown>(activeKeyOf(pattern.id), LEARNING_NS))) return false;
  return memory.delete(archiveKeyOf(pattern.id), LEARNING_NS);
}

/** Move one pattern to its archive key in the learning namespace. */
export async function archiveSelectedPattern(
  memory: MemoryBackend,
  pattern: LearnedPattern,
  archivedAt: Date = new Date(),
): Promise<ArchiveOutcome> {
  return withPatternMoveLock(memory, async () => {
    const copied = await copyPatternToArchive(memory, pattern, archivedAt);
    if (copied !== 'copied') return copied;
    const removed = await removeArchivedPattern(memory, pattern);
    if (removed === 'removed') return 'archived';
    await discardArchiveCopy(memory, pattern);
    return removed;
  });
}

const moveQueues = new WeakMap<MemoryBackend, Promise<unknown>>();

/**
 * Run `fn` after every earlier pattern move on the same backend has settled.
 * Not re-entrant: `fn` must not call `withPatternMoveLock` (or
 * `archiveSelectedPattern`) on the same backend.
 */
export function withPatternMoveLock<T>(memory: MemoryBackend, fn: () => Promise<T>): Promise<T> {
  const previous = moveQueues.get(memory) ?? Promise.resolve();
  const run = previous.then(fn, fn);
  moveQueues.set(memory, run.then(() => undefined, () => undefined));
  return run;
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
