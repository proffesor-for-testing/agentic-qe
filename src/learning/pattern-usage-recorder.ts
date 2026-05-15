/**
 * Pattern Usage Recorder
 * ADR-021: QE ReasoningBank for Pattern Learning (single-writer extension)
 *
 * Single source of truth for "pattern was used in a task" accounting:
 *
 *   - INSERTs a row into qe_pattern_usage (per-use audit trail)
 *   - UPDATEs qe_patterns.{usage_count, successful_uses, success_rate,
 *     quality_score, last_used_at, updated_at}
 *
 * Both writes happen inside ONE transaction so the audit trail and the
 * aggregate columns never disagree on count.
 *
 * Before this helper, two parallel writers existed (#486 Gap B):
 *   - SQLitePatternStore.recordUsage — did BOTH INSERT and UPDATE atomically
 *   - hooks-dream-learning.ts inline UPDATE — did UPDATE only, skipping the
 *     audit INSERT. Hook-driven usage stayed invisible in qe_pattern_usage
 *     even as qe_patterns.usage_count incremented.
 *
 * Quality formula (mirrors pattern-lifecycle.ts and the legacy inline hook):
 *   quality_score = confidence * 0.3 + min(usage_count/100, 1) * 0.2 + success_rate * 0.5
 */

import type { Database as DatabaseType } from 'better-sqlite3';

export interface PatternUsageRecord {
  patternId: string;
  success: boolean;
  metrics?: Record<string, unknown>;
  feedback?: string;
}

export interface PatternUsageResult {
  /**
   * Whether the helper found and updated the pattern row.
   * False (no throw) if patternId doesn't exist, since hook subprocesses
   * iterate over selectedPatternIds that may include stale UUIDs from
   * the routing kv. Callers who want strict semantics should check this
   * flag and throw themselves.
   */
  updated: boolean;
  /** Post-update usage_count. Undefined if !updated. */
  usageCount?: number;
  /** Post-update successful_uses. Undefined if !updated. */
  successfulUses?: number;
  /** Post-update success_rate. Undefined if !updated. */
  successRate?: number;
  /** Post-update quality_score. Undefined if !updated. */
  qualityScore?: number;
}

/**
 * Record one use of a pattern atomically across qe_pattern_usage and qe_patterns.
 *
 * Idempotency: each call inserts ONE audit row and increments usage_count by ONE.
 * The transaction makes the two writes atomic — if either fails, neither lands.
 *
 * Concurrency: better-sqlite3 transactions are serialized at the connection
 * level. Multiple concurrent callers on the same connection will queue.
 */
export function recordPatternUsage(
  db: DatabaseType,
  record: PatternUsageRecord,
): PatternUsageResult {
  const pattern = db
    .prepare(
      `SELECT confidence, usage_count, successful_uses FROM qe_patterns WHERE id = ?`,
    )
    .get(record.patternId) as
    | { confidence: number; usage_count: number; successful_uses: number }
    | undefined;

  if (!pattern) {
    return { updated: false };
  }

  const successInc = record.success ? 1 : 0;
  const newUsageCount = pattern.usage_count + 1;
  const newSuccessfulUses = pattern.successful_uses + successInc;
  const newSuccessRate = newSuccessfulUses / newUsageCount;
  const usageScore = Math.min(1, newUsageCount / 100);
  const newQualityScore =
    pattern.confidence * 0.3 + usageScore * 0.2 + newSuccessRate * 0.5;

  const insertUsage = db.prepare(`
    INSERT INTO qe_pattern_usage (pattern_id, success, metrics_json, feedback)
    VALUES (?, ?, ?, ?)
  `);
  const updatePattern = db.prepare(`
    UPDATE qe_patterns SET
      usage_count = ?,
      successful_uses = ?,
      success_rate = ?,
      quality_score = ?,
      last_used_at = datetime('now'),
      updated_at = datetime('now')
    WHERE id = ?
  `);

  const txn = db.transaction(() => {
    insertUsage.run(
      record.patternId,
      successInc,
      record.metrics ? JSON.stringify(record.metrics) : null,
      record.feedback ?? null,
    );
    updatePattern.run(
      newUsageCount,
      newSuccessfulUses,
      newSuccessRate,
      newQualityScore,
      record.patternId,
    );
  });
  txn();

  return {
    updated: true,
    usageCount: newUsageCount,
    successfulUses: newSuccessfulUses,
    successRate: newSuccessRate,
    qualityScore: newQualityScore,
  };
}
