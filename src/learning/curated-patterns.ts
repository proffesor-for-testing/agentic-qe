/**
 * Agentic QE v3 - Patterns a person or the product curated (#1388)
 *
 * Automatic writers (experience capture, session consolidation, the
 * PostTestGeneration hook, task-completed extraction, dream insights,
 * ReasoningBankService task patterns) store patterns with unmeasured
 * "task completed" evidence. Test generation applies such a pattern only once
 * it has a measured success. Two kinds of pattern apply without one:
 *
 *   - built-in seeds shipped with AQE, and their cross-domain transfers
 *     (`<seed> (from <domain>)`);
 *   - patterns a person curated: `aqe hooks learn` stores one with
 *     `context.curation = 'user-store'`; `aqe learning import` / `import-merge`
 *     keep the marker an export wrote, and `--curate` marks every row of a file
 *     the person vouches for with 'user-import'.
 *
 * Curation is a positive marker no automatic writer sets. It is never
 * inferred from the absence of an automatic writer's markers. An export
 * writes it only for rows applicable when exported (seed, curated, or with a
 * measured success), so a backup/restore round trip does not turn unproven
 * patterns into curated ones.
 */

import { PRETRAINED_PATTERNS } from './pretrained-patterns.js';
import { MEASURED_USAGE_SQL } from './usage-outcome.js';

/** How a person curated a pattern. */
export type PatternCuration = 'user-import' | 'user-store';
const CURATIONS: ReadonlySet<string> = new Set<PatternCuration>(['user-import', 'user-store']);

/** The context field that carries the curation marker. */
export const CURATION_FIELD = 'curation';

/**
 * Seeds ReasoningBankService stores into an empty bank
 * (src/mcp/services/reasoning-bank-service.ts, seedInitialPatternsIfNeeded).
 */
export const REASONING_BANK_SERVICE_SEED_NAMES: readonly string[] = [
  'unit-test-generation',
  'coverage-gap-analysis',
  'integration-test-generation',
  'flaky-test-remediation',
  'security-vulnerability-scan',
];

/** Names of every built-in seed pattern. */
export const BUILTIN_SEED_PATTERN_NAMES: ReadonlySet<string> = new Set([
  ...PRETRAINED_PATTERNS.map((pattern) => pattern.name),
  ...REASONING_BANK_SERVICE_SEED_NAMES,
]);

const TRANSFER_SUFFIX = / \(from [a-z-]+\)$/;

/** True for a built-in seed or its cross-domain transfer `<seed> (from <domain>)`. */
export function isBuiltinSeedName(name: string): boolean {
  return BUILTIN_SEED_PATTERN_NAMES.has(name) || BUILTIN_SEED_PATTERN_NAMES.has(name.replace(TRANSFER_SUFFIX, ''));
}

/** Mark a pattern context as curated by a person (overrides any incoming marker). */
export function markUserCurated<T extends object>(context: T | undefined, curation: PatternCuration): T & { curation: PatternCuration } {
  return { ...(context ?? ({} as T)), [CURATION_FIELD]: curation } as T & { curation: PatternCuration };
}

/** The valid curation marker of a parsed pattern context, if any. */
export function curationOf(context: unknown): PatternCuration | undefined {
  if (!context || typeof context !== 'object') return undefined;
  const value = (context as Record<string, unknown>)[CURATION_FIELD];
  return typeof value === 'string' && CURATIONS.has(value) ? (value as PatternCuration) : undefined;
}

/** True when the parsed pattern context carries a person's curation marker. */
export function isUserCurated(context: unknown): boolean {
  return curationOf(context) !== undefined;
}

/** The context without any curation field (valid or not). */
export function withoutCuration<T extends object>(context: T | undefined): T {
  const copy = { ...(context ?? ({} as T)) } as Record<string, unknown>;
  delete copy[CURATION_FIELD];
  return copy as T;
}

/** Minimal statement interface shared by better-sqlite3 handles. */
interface QueryableDb {
  prepare(sql: string): { all(...params: unknown[]): unknown[] };
}

/** Ids of patterns with at least one measured successful usage. Read-only. */
export function selectMeasuredSuccessIds(db: QueryableDb): Set<string> {
  const rows = db.prepare(
    `SELECT DISTINCT pattern_id AS id FROM qe_pattern_usage WHERE success = 1 AND ${MEASURED_USAGE_SQL} = 1`
  ).all() as Array<{ id: string }>;
  return new Set(rows.map((row) => row.id));
}

/**
 * The context an export writes for one pattern: a curation marker only when
 * the pattern is applicable now (seed, curated, or measured success), and no
 * marker otherwise.
 */
export function exportContext<T extends object>(
  pattern: { id: string; name: string; context?: T },
  measuredSuccessIds: ReadonlySet<string>
): T {
  const applicable = isBuiltinSeedName(pattern.name) || isUserCurated(pattern.context) || measuredSuccessIds.has(pattern.id);
  if (!applicable) return withoutCuration(pattern.context);
  return markUserCurated(pattern.context, curationOf(pattern.context) ?? 'user-import');
}

/**
 * The context an import stores: with `curate`, every row is marked as the
 * person vouches for the file; otherwise a valid incoming marker is kept and
 * an invalid one dropped.
 */
export function importContext<T extends object>(context: T | undefined, curate: boolean): T {
  if (curate) return markUserCurated(context, 'user-import');
  const curation = curationOf(context);
  return curation ? markUserCurated(context, curation) : withoutCuration(context);
}
