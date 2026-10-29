/**
 * Learning Retention (#1239)
 *
 * Bounds the learning tables that otherwise grow for as long as a project
 * lives. Two kinds of step, kept apart on purpose:
 *
 * - Dream retention steps remove only rows that carry no learning value.
 *   They are off by default. With `AQE_DREAM_RETENTION=on` they run after
 *   each committed dream cycle; while off, the dream reports what they
 *   would remove (COUNT queries only, nothing is written):
 *     - failed/interrupted `dream_cycles` past a retention window. A cycle
 *       that did not commit wrote no insights, and any cycle that still has
 *       an insight is kept.
 *     - `outcome` concept nodes beyond a cap, with their edges. They are
 *       derived from `qe_pattern_usage`, which is not touched, and only the
 *       newest 100 usage rows are ever loaded back, so a cap >= 100 does not
 *       churn.
 *
 * - Opt-in steps drop data that could still matter to someone, so they run
 *   only from `aqe learning prune`, which defaults to a dry run:
 *     - compacting soft-archived and merged experiences: `result_json` and the
 *       embedding are cleared, the row and its counters stay (the experience
 *       count stays monotonic, v3.9.22).
 *     - `routing_outcomes` older than a number of days.
 *
 * Every step reports the row counts it measured before and after, or, in a
 * dry run, the counts it would change.
 */

import type { Database as DatabaseType } from 'better-sqlite3';
import { acknowledgeCheckpointShrink, removedRows } from './checkpoint-shrink-ack.js';

export interface TableCount {
  readonly table: string;
  readonly before: number;
  readonly after: number;
}

export interface RetentionStepResult {
  readonly step: RetentionStep;
  readonly dryRun: boolean;
  /** Rows deleted, or for compaction rows whose payload was cleared. */
  readonly affected: number;
  /**
   * Row counts per table. `after` is read back after the write; in a dry run
   * it is the projection (`before` minus the rows the step would delete).
   */
  readonly tables: readonly TableCount[];
  /** Bytes of payload removed (compaction only), measured with length(). */
  readonly payloadBytes?: number;
}

export type RetentionStep =
  | 'failed-dream-cycles'
  | 'outcome-concepts'
  | 'compact-experiences'
  | 'routing-outcomes';

export const DEFAULT_FAILED_DREAM_CYCLE_RETENTION_DAYS = 7;
export const DEFAULT_OUTCOME_CONCEPT_CAP = 2000;
/** Below this the cap would delete outcome nodes that the next dream reloads. */
export const MIN_OUTCOME_CONCEPT_CAP = 100;

function tableExists(db: DatabaseType, table: string): boolean {
  return !!db.prepare(`SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?`).get(table);
}

function count(db: DatabaseType, sql: string, ...params: unknown[]): number {
  return (db.prepare(sql).get(...params) as { n: number }).n;
}

function rowCount(db: DatabaseType, table: string): number {
  return count(db, `SELECT COUNT(*) AS n FROM ${table}`);
}

interface Measured {
  readonly affected: number;
  /** Rows the step would delete, per table (for the dry-run projection). */
  readonly deletes: Readonly<Record<string, number>>;
  readonly payloadBytes?: number;
}

/**
 * Measure, then apply, in one transaction, reading the table counts around
 * it. A real run is IMMEDIATE (waits on busy_timeout instead of failing on
 * lock upgrade); a dry run only reads.
 */
function runStep(
  db: DatabaseType,
  step: RetentionStep,
  tables: readonly string[],
  dryRun: boolean,
  measure: () => Measured,
  apply: () => void,
): RetentionStepResult {
  if (!tables.every(t => tableExists(db, t))) {
    return { step, dryRun, affected: 0, tables: [] };
  }
  const run = db.transaction((): RetentionStepResult => {
    const before = tables.map(t => rowCount(db, t));
    const { affected, deletes, payloadBytes } = measure();
    if (!dryRun && affected > 0) apply();
    const after = dryRun
      ? tables.map((t, i) => before[i] - (deletes[t] ?? 0))
      : tables.map(t => rowCount(db, t));
    return {
      step,
      dryRun,
      affected,
      tables: tables.map((table, i) => ({ table, before: before[i], after: after[i] })),
      ...(payloadBytes !== undefined ? { payloadBytes } : {}),
    };
  });
  return dryRun ? run() : run.immediate();
}

// ---------------------------------------------------------------------------
// Default steps
// ---------------------------------------------------------------------------

/** Failed or interrupted cycles older than `retentionDays` that have no insight. */
export function pruneFailedDreamCycles(
  db: DatabaseType,
  options: { retentionDays?: number; dryRun?: boolean } = {},
): RetentionStepResult {
  const retentionDays = options.retentionDays ?? DEFAULT_FAILED_DREAM_CYCLE_RETENTION_DAYS;
  assertWholeNumber('retentionDays', retentionDays, 1);
  // julianday() reads both the ISO strings the engine writes and SQLite's own
  // datetime('now') format, which a plain string comparison would mix up.
  const where = `status IN ('failed', 'interrupted')
    AND julianday(COALESCE(end_time, start_time, created_at)) < julianday('now', ?)
    AND NOT EXISTS (SELECT 1 FROM dream_insights i WHERE i.cycle_id = dream_cycles.id)`;
  const window = `-${retentionDays} days`;
  return runStep(
    db, 'failed-dream-cycles', ['dream_cycles', 'dream_insights'], options.dryRun ?? false,
    () => {
      const n = count(db, `SELECT COUNT(*) AS n FROM dream_cycles WHERE ${where}`, window);
      return { affected: n, deletes: { dream_cycles: n } };
    },
    () => { db.prepare(`DELETE FROM dream_cycles WHERE ${where}`).run(window); },
  );
}

/** Keep the newest `maxNodes` outcome concept nodes; delete the rest and their edges. */
export function capOutcomeConcepts(
  db: DatabaseType,
  options: { maxNodes?: number; dryRun?: boolean } = {},
): RetentionStepResult {
  const maxNodes = options.maxNodes ?? DEFAULT_OUTCOME_CONCEPT_CAP;
  assertWholeNumber('maxNodes', maxNodes, MIN_OUTCOME_CONCEPT_CAP);
  const doomed = `SELECT id FROM concept_nodes WHERE concept_type = 'outcome'
    ORDER BY created_at DESC, id DESC LIMIT -1 OFFSET ?`;
  return runStep(
    db, 'outcome-concepts', ['concept_nodes', 'concept_edges'], options.dryRun ?? false,
    () => {
      const nodes = count(db, `SELECT COUNT(*) AS n FROM (${doomed})`, maxNodes);
      const edges = count(db,
        `SELECT COUNT(*) AS n FROM concept_edges WHERE source IN (${doomed}) OR target IN (${doomed})`,
        maxNodes, maxNodes);
      return { affected: nodes, deletes: { concept_nodes: nodes, concept_edges: edges } };
    },
    () => {
      // Edges first and explicitly: the ON DELETE CASCADE only fires when the
      // connection has foreign_keys on, which not every caller sets.
      db.prepare(`DELETE FROM concept_edges WHERE source IN (${doomed}) OR target IN (${doomed})`)
        .run(maxNodes, maxNodes);
      db.prepare(`DELETE FROM concept_nodes WHERE id IN (${doomed})`).run(maxNodes);
    },
  );
}

// ---------------------------------------------------------------------------
// Opt-in steps (aqe learning prune)
// ---------------------------------------------------------------------------

/** Soft-archived ('archived') and merged (survivor id) rows; 'contradicted' is left alone. */
const CONSOLIDATED = `consolidated_into IS NOT NULL AND consolidated_into <> 'contradicted'`;
const HAS_PAYLOAD = `(result_json IS NOT NULL OR embedding IS NOT NULL)`;

/** Clear `result_json` and the embedding of archived and merged experiences. */
export function compactConsolidatedExperiences(
  db: DatabaseType,
  options: { dryRun?: boolean } = {},
): RetentionStepResult {
  const where = `${CONSOLIDATED} AND ${HAS_PAYLOAD}`;
  return runStep(
    db, 'compact-experiences', ['captured_experiences'], options.dryRun ?? false,
    () => {
      const row = db.prepare(
        `SELECT COUNT(*) AS n,
                COALESCE(SUM(COALESCE(length(result_json), 0) + COALESCE(length(embedding), 0)), 0) AS bytes
           FROM captured_experiences WHERE ${where}`,
      ).get() as { n: number; bytes: number };
      return { affected: row.n, deletes: {}, payloadBytes: row.bytes };
    },
    () => {
      db.prepare(
        `UPDATE captured_experiences
            SET result_json = NULL, embedding = NULL, embedding_dimension = NULL
          WHERE ${where}`,
      ).run();
    },
  );
}

/** Delete routing outcomes older than `olderThanDays`. */
export function pruneRoutingOutcomes(
  db: DatabaseType,
  options: { olderThanDays: number; dryRun?: boolean },
): RetentionStepResult {
  assertWholeNumber('olderThanDays', options.olderThanDays, 1);
  const where = `julianday(created_at) < julianday('now', ?)`;
  const window = `-${options.olderThanDays} days`;
  return runStep(
    db, 'routing-outcomes', ['routing_outcomes'], options.dryRun ?? false,
    () => {
      const n = count(db, `SELECT COUNT(*) AS n FROM routing_outcomes WHERE ${where}`, window);
      return { affected: n, deletes: { routing_outcomes: n } };
    },
    () => { db.prepare(`DELETE FROM routing_outcomes WHERE ${where}`).run(window); },
  );
}

// ---------------------------------------------------------------------------
// Defaults and their settings
// ---------------------------------------------------------------------------

export interface DefaultRetentionSettings {
  /** AQE_DREAM_RETENTION: false (the default) previews the steps instead of running them. */
  readonly enabled: boolean;
  /** null = off */
  readonly failedDreamCycleRetentionDays: number | null;
  /** null = off */
  readonly outcomeConceptCap: number | null;
  readonly warnings: readonly string[];
}

const OFF_VALUES = new Set(['off', 'false', 'no', '0']);

function parseSetting(
  name: string, raw: string | undefined, fallback: number, min: number, warnings: string[],
): number | null {
  if (raw === undefined || raw.trim() === '') return fallback;
  const value = raw.trim().toLowerCase();
  if (OFF_VALUES.has(value)) return null;
  if (/^\d+$/.test(value) && Number(value) >= min) return Number(value);
  // These settings delete rows, so a value that cannot be read turns the step off.
  warnings.push(`Invalid ${name}=${JSON.stringify(raw)}; expected a whole number >= ${min} or "off". ` +
    'That retention step is off until this is fixed; nothing is deleted by it.');
  return null;
}

const ON_VALUES = new Set(['on', 'true', 'yes', '1']);

/** Unset or "off" disables; "on" enables; anything else disables with a warning. */
function parseSwitch(name: string, raw: string | undefined, warnings: string[]): boolean {
  if (raw === undefined || raw.trim() === '') return false;
  const value = raw.trim().toLowerCase();
  if (ON_VALUES.has(value)) return true;
  if (!OFF_VALUES.has(value)) {
    warnings.push(`Invalid ${name}=${JSON.stringify(raw)}; expected "on" or "off". ` +
      'Dream retention stays off until this is fixed; nothing is deleted.');
  }
  return false;
}

/**
 * Read `AQE_DREAM_RETENTION` (off by default) and the per-step settings
 * `AQE_FAILED_DREAM_CYCLE_RETENTION_DAYS` (default 7) and
 * `AQE_OUTCOME_CONCEPT_CAP` (default 2000). Each step setting accepts "off".
 */
export function resolveDefaultRetention(
  env: Readonly<Record<string, string | undefined>> = process.env,
): DefaultRetentionSettings {
  const warnings: string[] = [];
  return {
    enabled: parseSwitch('AQE_DREAM_RETENTION', env.AQE_DREAM_RETENTION, warnings),
    failedDreamCycleRetentionDays: parseSetting('AQE_FAILED_DREAM_CYCLE_RETENTION_DAYS',
      env.AQE_FAILED_DREAM_CYCLE_RETENTION_DAYS, DEFAULT_FAILED_DREAM_CYCLE_RETENTION_DAYS, 1, warnings),
    outcomeConceptCap: parseSetting('AQE_OUTCOME_CONCEPT_CAP',
      env.AQE_OUTCOME_CONCEPT_CAP, DEFAULT_OUTCOME_CONCEPT_CAP, MIN_OUTCOME_CONCEPT_CAP, warnings),
    warnings,
  };
}

export interface DreamRetentionReport {
  /** False: the steps ran as a dry run and wrote nothing. */
  readonly enabled: boolean;
  readonly steps: readonly RetentionStepResult[];
  /** Set when retention could not run (a locked database, say); nothing was deleted. */
  readonly error?: string;
}

/**
 * The dream retention steps that are not switched off individually: run
 * when retention is enabled, otherwise previewed as a dry run.
 */
export function runDreamRetention(
  db: DatabaseType,
  settings: DefaultRetentionSettings = resolveDefaultRetention(),
): DreamRetentionReport {
  const dryRun = !settings.enabled;
  const steps: RetentionStepResult[] = [];
  if (settings.failedDreamCycleRetentionDays !== null) {
    steps.push(pruneFailedDreamCycles(db, { retentionDays: settings.failedDreamCycleRetentionDays, dryRun }));
  }
  if (settings.outcomeConceptCap !== null) {
    steps.push(capOutcomeConcepts(db, { maxNodes: settings.outcomeConceptCap, dryRun }));
  }
  // #1251: a deliberate shrink, so the next brain checkpoint accepts it.
  if (removedRows(steps)) acknowledgeCheckpointShrink(db.name, 'dream retention (AQE_DREAM_RETENTION=on)');
  return { enabled: settings.enabled, steps };
}

/** Lines for a dream's output: what retention removed, or would remove while off. */
export function describeDreamRetention(report: DreamRetentionReport): string[] {
  if (report.error) return [`skipped: ${report.error}`];
  const lines = report.steps.filter(s => s.affected > 0).map(describeRetention);
  return report.enabled ? lines : lines.map(l => `${l} [off: set AQE_DREAM_RETENTION=on]`);
}

/** One line per step, for logs: "outcome-concepts: 3000 removed (concept_nodes 5000 -> 2000, ...)". */
export function describeRetention(result: RetentionStepResult): string {
  const verb = result.step === 'compact-experiences' ? 'compacted' : 'removed';
  const counts = result.tables
    .map(t => `${t.table} ${t.before} -> ${t.after}${result.dryRun ? ' projected' : ''}`)
    .join(', ');
  return `${result.step}: ${result.affected} ${result.dryRun ? `would be ${verb}` : verb}` +
    (counts ? ` (${counts})` : '');
}

function assertWholeNumber(name: string, value: number, min: number): void {
  if (!Number.isInteger(value) || value < min) {
    throw new Error(`${name} must be a whole number >= ${min}, got ${value}`);
  }
}
