/**
 * Richness comparison between an existing RVF mirror and a new export
 * (#629, ADR-128; #1251 for the checkpoint policy).
 *
 * - `strict` (default, manual `aqe brain export`): any mirrored table with
 *   fewer rows than the existing mirror refuses the export.
 * - `checkpoint` (the Stop-hook checkpoint): routine retention trims rows
 *   between turns (routing outcomes, concept edges, q-values, trajectories),
 *   so only a collapse refuses: a table that lost more than its share in
 *   CHECKPOINT_MAX_LOSS (half by default), and either at least
 *   CHECKPOINT_MIN_LOST_ROWS rows or every row of a table that had at least
 *   CHECKPOINT_MIN_EMPTIED_ROWS. A database recreated from seed data loses
 *   that much; a retention pass does not. A table the existing mirror does
 *   not have (added in a later release) held no rows to lose.
 *
 * A deliberate shrink (`aqe learning prune --apply`, dream retention) records
 * a CheckpointShrinkAck. The checkpoint honours it in place of the mirror
 * comparison only while it is fresh and the export still holds the counts the
 * shrink left, so it cannot approve a later, unrelated drop.
 */

import type Database from 'better-sqlite3';
import { TABLE_CONFIGS, countRows } from './brain-shared.js';

export type RichnessPolicy = 'strict' | 'checkpoint';

export const RICHNESS_POLICIES: readonly RichnessPolicy[] = ['strict', 'checkpoint'];

/** Smallest loss the checkpoint policy refuses, so retention can trim a small table. */
export const CHECKPOINT_MIN_LOST_ROWS = 10;

/** A table emptied from at least this many rows is refused even under the minimum loss. */
export const CHECKPOINT_MIN_EMPTIED_ROWS = 3;

/**
 * Largest share of a table the checkpoint policy lets go. Learned patterns
 * are deduplicated at most 10% at a time (SQLitePatternStore), and captured
 * experiences are never deleted (v3.9.22), so they get the 10% bound.
 */
export const CHECKPOINT_MAX_LOSS: Readonly<Record<string, number>> = {
  qe_patterns: 0.1,
  captured_experiences: 0.1,
};
const CHECKPOINT_DEFAULT_MAX_LOSS = 0.5;

/** Code-intelligence vectors are a regenerable cache, never exported (#1238). */
export const CODE_INDEX_VECTOR_ID_PREFIX = 'code-intelligence:';

export type RvfMirrorGuardCode = 'RVF_MIRROR_RICHER' | 'RVF_MIRROR_INSPECTION_AMBIGUOUS';

/** Refusal to replace an existing mirror. The message starts with the code. */
export class RvfMirrorGuardError extends Error {
  constructor(readonly code: RvfMirrorGuardCode, detail: string) {
    super(`${code}: ${detail}`);
    this.name = 'RvfMirrorGuardError';
  }
}

export function isRichnessPolicy(value: unknown): value is RichnessPolicy {
  return typeof value === 'string' && (RICHNESS_POLICIES as readonly string[]).includes(value);
}

function isLoss(tableName: string, existing: number, candidate: number, policy: RichnessPolicy): boolean {
  if (policy === 'strict') return existing > candidate;
  const lost = existing - candidate;
  const maxLoss = CHECKPOINT_MAX_LOSS[tableName] ?? CHECKPOINT_DEFAULT_MAX_LOSS;
  const emptied = candidate === 0 && existing >= CHECKPOINT_MIN_EMPTIED_ROWS;
  return lost > existing * maxLoss && (lost >= CHECKPOINT_MIN_LOST_ROWS || emptied);
}

/**
 * Throw when replacing a mirror with `existingCounts` by a candidate with
 * `candidateCounts` would lose rows under `policy`. `existingCounts` is
 * undefined when the mirror has no table inventory at all: that is ambiguous
 * under every policy.
 */
export function assertNotPoorerThanMirror(
  tableNames: readonly string[],
  existingCounts: Readonly<Record<string, number>> | undefined,
  candidateCounts: Readonly<Record<string, number>>,
  policy: RichnessPolicy = 'strict',
): void {
  const missing = tableNames.filter(
    (tableName) => !existingCounts || !Number.isSafeInteger(existingCounts[tableName]),
  );
  if (!existingCounts || (policy === 'strict' && missing.length > 0)) {
    throw new RvfMirrorGuardError(
      'RVF_MIRROR_INSPECTION_AMBIGUOUS',
      `existing mirror lacks trustworthy counts for ${missing.join(', ')}. Preserve/import it ` +
      `before retrying, or repeat with --force-overwrite-richer after preserving a backup.`,
    );
  }

  const richer = tableNames
    .map((tableName) => ({
      tableName,
      existing: Number.isSafeInteger(existingCounts[tableName]) ? existingCounts[tableName] : 0,
      candidate: candidateCounts[tableName] ?? 0,
    }))
    .filter(({ tableName, existing, candidate }) => isLoss(tableName, existing, candidate, policy));
  if (richer.length > 0) {
    const differences = richer
      .map(({ tableName, existing, candidate }) => `${tableName} ${existing} -> ${candidate}`)
      .join(', ');
    throw new RvfMirrorGuardError(
      'RVF_MIRROR_RICHER',
      `refusing to replace richer mirrored tables: ${differences}. Restore/import the mirror ` +
      `first, or repeat with --force-overwrite-richer after preserving a backup.`,
    );
  }
}

/** Row counts of every mirrored table, counted the way the RVF export counts them. */
export function mirroredTableCounts(db: Database.Database): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const { tableName } of TABLE_CONFIGS) {
    counts[tableName] = tableName === 'vectors'
      ? countRows(db, 'vectors', `(id IS NULL OR substr(id, 1, ?) != ?)`,
        [CODE_INDEX_VECTOR_ID_PREFIX.length, CODE_INDEX_VECTOR_ID_PREFIX])
      : countRows(db, tableName);
  }
  return counts;
}

// --- Deliberate-shrink acknowledgement ---

export type ShrinkProducer = 'prune' | 'dream';

/** What a deliberate shrink records for the checkpoint hook. */
export interface CheckpointShrinkAck {
  readonly at: string;
  readonly producer: ShrinkProducer;
  /** mirroredTableCounts() right after the shrink. */
  readonly tableCounts: Readonly<Record<string, number>>;
}

/** An acknowledgement is honoured for this long after the shrink. */
export const SHRINK_ACK_MAX_AGE_MS = 24 * 3600_000;
/** Clock skew tolerated for an acknowledgement dated in the future. */
const SHRINK_ACK_MAX_SKEW_MS = 5 * 60_000;

export type ShrinkAckVerdict =
  | { readonly honoured: true; readonly producer: ShrinkProducer }
  | { readonly honoured: false; readonly reason: string };

/**
 * Whether the acknowledgement `raw` (parsed JSON, or anything else) still
 * vouches for an export with `candidateCounts`: under 24h old, and no table
 * collapsed since the shrink, under the checkpoint policy. Growth is fine.
 */
export function evaluateShrinkAck(
  raw: unknown,
  tableNames: readonly string[],
  candidateCounts: Readonly<Record<string, number>>,
  now = Date.now(),
): ShrinkAckVerdict {
  const ack = raw as Partial<CheckpointShrinkAck> | null;
  if (!ack || typeof ack !== 'object' || (ack.producer !== 'prune' && ack.producer !== 'dream')
    || !ack.tableCounts || typeof ack.tableCounts !== 'object') {
    return { honoured: false, reason: 'malformed acknowledgement' };
  }
  const at = Date.parse(String(ack.at));
  if (!Number.isFinite(at) || at > now + SHRINK_ACK_MAX_SKEW_MS) {
    return { honoured: false, reason: `invalid time ${String(ack.at)}` };
  }
  if (now - at > SHRINK_ACK_MAX_AGE_MS) {
    return { honoured: false, reason: `older than 24h (${ack.producer} at ${ack.at})` };
  }
  try {
    assertNotPoorerThanMirror(tableNames, ack.tableCounts, candidateCounts, 'checkpoint');
  } catch (error) {
    const detail = error instanceof Error ? error.message.replace(/^RVF_MIRROR_[A-Z_]+: /, '') : String(error);
    return { honoured: false, reason: `the brain shrank again since the ${ack.producer}: ${detail.split('.')[0]}` };
  }
  return { honoured: true, producer: ack.producer };
}
