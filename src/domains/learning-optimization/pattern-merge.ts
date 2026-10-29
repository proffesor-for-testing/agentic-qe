/**
 * Agentic QE v3 - Committing one pattern merge (#1106, #1149)
 *
 * `LearningCoordinatorService.consolidatePatterns` builds the consolidated
 * pattern; this module moves the sources out of the active set:
 *
 * 1. Every source pattern's archive copy is written and verified.
 * 2. The consolidated pattern is stored and read back in full.
 * 3. The sources are removed one by one with compare-and-delete.
 *
 * A failure in steps 1-2, or before the first source is removed, rolls the
 * merge back: the consolidated pattern and the archive copies are deleted and
 * every source stays active. A failure after a source was removed keeps the
 * consolidated pattern (it now holds that source's data) and reports each
 * source's real state. Callers run this under `withPatternMoveLock`.
 */

import type { MemoryBackend } from '../../kernel/interfaces.js';
import { err, ok, type Result } from '../../shared/types/index.js';
import { toError } from '../../shared/error-utils.js';
import { LEARNING_NS, LEARNING_PATTERN_KEY_PREFIX } from './active-patterns.js';
import type { LearnedPattern } from './interfaces.js';
import {
  canonicalJson,
  copyPatternToArchive,
  discardArchiveCopy,
  removeArchivedPattern,
  type RemoveOutcome,
} from './pattern-archive.js';

const LEFT_ACTIVE = 'nothing was merged and every source pattern was left active';

const REMOVE_REASONS: Record<Exclude<RemoveOutcome, 'removed' | 'missing'>, string> = {
  changed: 'changed after its archive copy',
  failed: 'archive copy no longer verifies',
};

/**
 * Archive `sources`, store `consolidated` with `store`, then remove the
 * sources. Returns the consolidated pattern only when every source left the
 * active set.
 */
export async function commitPatternMerge(
  memory: MemoryBackend,
  sources: readonly LearnedPattern[],
  consolidated: LearnedPattern,
  store: (pattern: LearnedPattern) => Promise<void>,
  archivedAt: Date = new Date(),
): Promise<Result<LearnedPattern>> {
  const copied: LearnedPattern[] = [];
  let storeAttempted = false;
  const rollBack = async (reason: string): Promise<Result<LearnedPattern>> => {
    const problems = await undoMerge(memory, copied, storeAttempted ? consolidated : undefined);
    return err(new Error(`${reason}; ${LEFT_ACTIVE}${problems.length ? ` (rollback incomplete: ${problems.join('; ')})` : ''}`));
  };

  try {
    let notCopied = 0;
    for (const source of sources) {
      if ((await copyPatternToArchive(memory, source, archivedAt)) === 'copied') copied.push(source);
      else notCopied++;
    }
    if (notCopied > 0) {
      return rollBack(`${notCopied} of ${sources.length} source patterns could not be archived (archive copy not verified)`);
    }

    storeAttempted = true;
    await store(consolidated);
    const stored = await memory.get<unknown>(`${LEARNING_PATTERN_KEY_PREFIX}${consolidated.id}`, LEARNING_NS);
    if (!stored || canonicalJson(stored) !== canonicalJson(consolidated)) {
      return rollBack('Consolidated pattern could not be read back');
    }
  } catch (error) {
    return rollBack(`Merge failed before any source pattern was removed: ${toError(error).message}`);
  }

  const removed: string[] = [];
  for (let i = 0; i < sources.length; i++) {
    let reason: string;
    try {
      const outcome = await removeArchivedPattern(memory, sources[i]);
      if (outcome === 'removed' || outcome === 'missing') {
        removed.push(outcome === 'missing' ? `${sources[i].id} (already gone)` : sources[i].id);
        continue;
      }
      reason = REMOVE_REASONS[outcome];
    } catch (error) {
      // A delete can fail after it took effect: report what is stored.
      if (await isGone(memory, sources[i])) {
        removed.push(sources[i].id);
        continue;
      }
      reason = `delete failed: ${toError(error).message}`;
    }

    if (removed.length === 0) return rollBack(`Source pattern ${sources[i].id} was not removed (${reason})`);

    const leftActive = sources.slice(i);
    const problems: string[] = [];
    for (const source of leftActive) {
      try {
        await discardArchiveCopy(memory, source);
      } catch (error) {
        problems.push(`archive copy of ${source.id} not removed: ${toError(error).message}`);
      }
    }
    const states = leftActive.map((s, j) => `${s.id} (${j === 0 ? reason : 'not attempted'})`);
    return err(new Error(
      `Merge partially applied: consolidated pattern ${consolidated.id} is active; ` +
      `removed: ${removed.join(', ')}; left active: ${states.join(', ')}` +
      (problems.length ? `; ${problems.join('; ')}` : '')
    ));
  }

  return ok(consolidated);
}

/** True only when the source's active key is confirmed absent. */
async function isGone(memory: MemoryBackend, source: LearnedPattern): Promise<boolean> {
  try {
    return !(await memory.get<unknown>(`${LEARNING_PATTERN_KEY_PREFIX}${source.id}`, LEARNING_NS));
  } catch {
    return false;
  }
}

/** Delete the consolidated pattern and the archive copies of sources that are still active. */
async function undoMerge(
  memory: MemoryBackend,
  copied: readonly LearnedPattern[],
  consolidated: LearnedPattern | undefined,
): Promise<string[]> {
  const problems: string[] = [];
  if (consolidated) {
    try {
      await memory.delete(`${LEARNING_PATTERN_KEY_PREFIX}${consolidated.id}`, LEARNING_NS);
    } catch (error) {
      problems.push(`consolidated pattern ${consolidated.id} not removed: ${toError(error).message}`);
    }
  }
  for (const source of copied) {
    try {
      await discardArchiveCopy(memory, source);
    } catch (error) {
      problems.push(`archive copy of ${source.id} not removed: ${toError(error).message}`);
    }
  }
  return problems;
}
