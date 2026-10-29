/**
 * Richness comparison between an existing RVF mirror and a new export
 * (#629, ADR-128; #1251 for the checkpoint policy).
 *
 * - `strict` (default, manual `aqe brain export`): any mirrored table with
 *   fewer rows than the existing mirror refuses the export.
 * - `checkpoint` (the Stop-hook checkpoint): routine retention trims rows
 *   between turns (routing outcomes, concept edges, q-values, trajectories),
 *   so only a collapse refuses: a table that lost at least
 *   CHECKPOINT_MIN_LOST_ROWS rows and more than its share in
 *   CHECKPOINT_MAX_LOSS (half by default). A database recreated from seed data
 *   loses that much; a retention pass does not. A table the existing mirror
 *   does not have (added in a later release) held no rows to lose.
 */

export type RichnessPolicy = 'strict' | 'checkpoint';

export const RICHNESS_POLICIES: readonly RichnessPolicy[] = ['strict', 'checkpoint'];

/** Smallest loss the checkpoint policy refuses, so a tiny table can empty out. */
export const CHECKPOINT_MIN_LOST_ROWS = 10;

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
  return lost >= CHECKPOINT_MIN_LOST_ROWS && lost > existing * maxLoss;
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
