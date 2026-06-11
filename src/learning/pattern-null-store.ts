/**
 * Pattern Null Store (ADR-110, issue #522)
 *
 * First-class negative pattern records: when an applied pattern fails in a
 * context, the failure is kept — consolidated per (pattern, context) — and
 * surfaced at retrieval time so ranking can discount by context-matched null
 * density. Nulls are information, not tombstones: a pattern that fails in one
 * context may be right in another, and a deleted failure is unauditable (the
 * Pattern Space v2.1 lesson).
 *
 * Persistence: qe_pattern_nulls (schema v10, migration
 * 20260611_add_pattern_nulls_table). Obtain the handle via
 * SQLitePatternStore.getDatabase().
 */
import { v4 as uuidv4 } from 'uuid';
import type { Database as DatabaseType } from 'better-sqlite3';
import { applyMigration } from '../migrations/20260611_add_pattern_nulls_table.js';

export type NullEvidenceClass = 'EXECUTED' | 'STATIC' | 'INFERRED' | 'CONJECTURE';

export interface PatternNullRecord {
  patternId: string;
  contextFingerprint: string;
  failureMode: string;
  trajectoryRef?: string;
  /** What evidence backs this failure record (ADR-105). Verdict-pipeline failures are EXECUTED. */
  evidenceClass?: NullEvidenceClass;
}

export interface NullSummary {
  patternId: string;
  /** Total consolidated failure count across all contexts */
  totalFailures: number;
  /** Per-context consolidated counts */
  byContext: Record<string, number>;
}

/** Weight of a context-matched null vs a null from elsewhere (ADR-110: local nulls outweigh remote successes). */
const CONTEXT_MATCHED_WEIGHT = 0.15;
const UNMATCHED_WEIGHT = 0.03;
/** Floor so heavily-nulled patterns remain retrievable (nulls inform, never erase). */
const DISCOUNT_FLOOR = 0.25;

export class PatternNullStore {
  constructor(private readonly db: DatabaseType) {
    // Additive, idempotent — safe on DBs that predate schema v10.
    applyMigration(db);
  }

  /** Record a failure; consolidates on repeat (pattern, context) pairs. */
  recordNull(record: PatternNullRecord): void {
    this.db.prepare(`
      INSERT INTO qe_pattern_nulls (id, pattern_id, context_fingerprint, failure_mode, trajectory_ref, evidence_class)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(pattern_id, context_fingerprint) DO UPDATE SET
        consolidated_count = consolidated_count + 1,
        failure_mode = excluded.failure_mode,
        trajectory_ref = COALESCE(excluded.trajectory_ref, trajectory_ref),
        updated_at = datetime('now')
    `).run(
      uuidv4(),
      record.patternId,
      record.contextFingerprint,
      record.failureMode,
      record.trajectoryRef ?? null,
      record.evidenceClass ?? 'EXECUTED',
    );
  }

  /** Batch summaries for retrieval-time surfacing. Missing patterns simply have no entry. */
  getNullSummaries(patternIds: string[]): Map<string, NullSummary> {
    const out = new Map<string, NullSummary>();
    if (patternIds.length === 0) return out;

    const placeholders = patternIds.map(() => '?').join(',');
    const rows = this.db.prepare(`
      SELECT pattern_id, context_fingerprint, consolidated_count
      FROM qe_pattern_nulls
      WHERE pattern_id IN (${placeholders})
    `).all(...patternIds) as Array<{ pattern_id: string; context_fingerprint: string; consolidated_count: number }>;

    for (const row of rows) {
      let summary = out.get(row.pattern_id);
      if (!summary) {
        summary = { patternId: row.pattern_id, totalFailures: 0, byContext: {} };
        out.set(row.pattern_id, summary);
      }
      summary.totalFailures += row.consolidated_count;
      summary.byContext[row.context_fingerprint] = row.consolidated_count;
    }
    return out;
  }

  /**
   * Pure ranking-discount helper (no DB) so retrieval code can apply it
   * without coupling. A null in the caller's own context discounts hardest;
   * remote nulls discount mildly; the floor keeps patterns retrievable.
   */
  static applyNullDiscount(score: number, summary: NullSummary | undefined, contextFingerprint?: string): number {
    if (!summary || summary.totalFailures === 0) return score;
    const matched = contextFingerprint ? (summary.byContext[contextFingerprint] ?? 0) : 0;
    const unmatched = summary.totalFailures - matched;
    const factor = Math.max(
      DISCOUNT_FLOOR,
      1 - matched * CONTEXT_MATCHED_WEIGHT - unmatched * UNMATCHED_WEIGHT,
    );
    return score * factor;
  }
}
