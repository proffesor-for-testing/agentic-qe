/**
 * Agentic QE v3 - Active learned-pattern reads (#1055)
 *
 * Active learned patterns live at `learning:pattern:<id>`. The same prefix
 * also holds records that are NOT active patterns:
 *
 * - `learning:pattern:creation:<id>`: creation provenance written by
 *   `LearningCoordinatorService.recordPatternCreation()` (no `context`)
 * - `learning:pattern:archived:<id>`: archived patterns written by
 *   `archiveSelectedPattern()` (pattern-archive.ts) for the merge path and
 *   the learning-consolidation protocol (full pattern shape)
 *
 * Every reader of active patterns must go through this module so that
 * provenance and archives are excluded before `get()`, and so that those rows
 * cannot use up the search cap and push active patterns out. Records stay
 * untouched; this is read-side classification only.
 */

import type { MemoryBackend, RetrieveOptions } from '../../kernel/interfaces.js';
import type { LearnedPattern } from './interfaces.js';
import { rehydrateDates } from '../../shared/utils/kv-date-rehydrate.js';
import { searchAllKeys } from '../../shared/utils/namespaced-search.js';

/**
 * The kv namespace every learning-optimization writer uses (#491 Bug 2).
 * A database identifier: never rename it.
 */
export const LEARNING_NAMESPACE = 'learning-optimization';

/** Retrieve options for reads and deletes in `LEARNING_NAMESPACE` (#1071). */
export const LEARNING_NS: Readonly<RetrieveOptions> = Object.freeze({ namespace: LEARNING_NAMESPACE });

export const LEARNING_PATTERN_KEY_PREFIX = 'learning:pattern:';

/** Sub-key families under the pattern prefix that are not active patterns. */
export const NON_ACTIVE_PATTERN_SEGMENTS: readonly string[] = ['creation', 'archived'];

/**
 * True when the key is in the active pattern key family
 * (`learning:pattern:<id>`), false for provenance, archives and any other
 * non-active sub-key.
 */
export function isActivePatternKey(key: string): boolean {
  if (!key.startsWith(LEARNING_PATTERN_KEY_PREFIX)) return false;
  const rest = key.slice(LEARNING_PATTERN_KEY_PREFIX.length);
  if (rest.length === 0) return false;
  const firstSegment = rest.split(':', 1)[0];
  return !NON_ACTIVE_PATTERN_SEGMENTS.includes(firstSegment);
}

/**
 * Shape guard for a record read from an active key: it must be an object
 * whose own id maps back to that key, and it must carry a `context` object.
 */
export function isActivePatternRecord(key: string, value: unknown): value is LearnedPattern {
  if (!value || typeof value !== 'object') return false;
  const record = value as { id?: unknown; context?: unknown };
  if (typeof record.id !== 'string' || key !== `${LEARNING_PATTERN_KEY_PREFIX}${record.id}`) {
    return false;
  }
  return !!record.context && typeof record.context === 'object';
}

export interface ReadActivePatternsOptions {
  /** Namespace passed to `search()` and `get()`. Omit for the backend default. */
  retrieve?: RetrieveOptions;
  /** First key-scan request size (tests). The scan always reads every key. */
  scanPageSize?: number;
}

/**
 * Read every active learned pattern: list every key (no cap, #1071), drop
 * non-active key families before `get()`, then drop records that fail the
 * shape guard. Patterns come back in key order. Date fields
 * come back from kv as ISO strings and are rehydrated (#491 Bug 3), so
 * `TimeRange.contains(pattern.createdAt)` works for every reader.
 */
export async function readActivePatterns(
  memory: MemoryBackend,
  options: ReadActivePatternsOptions = {},
): Promise<LearnedPattern[]> {
  const keys = await searchAllKeys(memory, `${LEARNING_PATTERN_KEY_PREFIX}*`, {
    retrieve: options.retrieve,
    pageSize: options.scanPageSize,
  });

  const patterns: LearnedPattern[] = [];
  for (const key of keys) {
    if (!isActivePatternKey(key)) continue;
    const value = await memory.get<unknown>(key, options.retrieve);
    if (isActivePatternRecord(key, value)) {
      patterns.push(rehydrateDates(value, ['createdAt', 'lastUsedAt']) as LearnedPattern);
    }
  }
  return patterns;
}
