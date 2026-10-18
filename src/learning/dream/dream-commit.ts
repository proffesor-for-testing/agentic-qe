/**
 * Dream commit (#1060): compute, then commit.
 *
 * A dream cycle is computed entirely in memory (spreading activation and
 * insight generation never touch the database). Its results are then written
 * here in ONE synchronous better-sqlite3 transaction: the activation levels,
 * the insights and the final cycle row. There is no `await` inside the
 * transaction, so no foreground write on the shared connection can join it,
 * and no lock is held while asynchronous work runs. A cancelled, failed or
 * interrupted dream commits nothing beyond its cycle row.
 *
 * Before #1060 the dream wrote its results one awaited statement at a time
 * (and, with opt-in branching, inside a SAVEPOINT held across the whole
 * asynchronous dream), so a discard or a shutdown mid-dream rolled back
 * foreground writes that had already been acknowledged.
 */

import type { Database as DatabaseType } from 'better-sqlite3';
import type { DreamCycle } from './types.js';
import type { DreamInsight } from './insight-generator.js';

/** Everything a dream cycle writes, computed before anything is written. */
export interface ComputedDream {
  cycle: DreamCycle;
  /**
   * Final activation level per concept node (clamped to [0, 1] on write),
   * with the level the dream loaded. A node whose stored level no longer
   * equals `loadedLevel` was written by someone else during the dream and is
   * left alone. Omit `loadedLevel` to write unconditionally.
   */
  activations: ReadonlyArray<readonly [nodeId: string, level: number, loadedLevel?: number]>;
  insights: readonly DreamInsight[];
}

export interface DreamCommitResult {
  /** Wall-clock time the write transaction was open, in milliseconds. */
  commitDurationMs: number;
  /** Concept nodes updated (a node deleted meanwhile is skipped, not recreated). */
  activationsWritten: number;
  /** Activations skipped: the node vanished or a foreground write changed it. */
  activationsSkipped: number;
  insightsWritten: number;
}

/**
 * Write a computed dream in one short synchronous transaction.
 * Throws (and writes nothing) if any statement fails.
 */
export function commitDream(db: DatabaseType, dream: ComputedDream): DreamCommitResult {
  const updateActivation = db.prepare(`
    UPDATE concept_nodes
    SET activation_level = ?, last_activated = datetime('now')
    WHERE id = ? AND (? IS NULL OR COALESCE(activation_level, 0) = ?)
  `);
  const insertInsight = db.prepare(`
    INSERT INTO dream_insights
    (id, cycle_id, insight_type, source_concepts, description, novelty_score,
     confidence_score, actionable, applied, suggested_action, pattern_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?, NULL)
  `);
  // Upsert: a dream run with commit:false (SpeculativeDreamer) wrote no
  // 'running' row up front, so its row is created here.
  const upsertCycle = db.prepare(`
    INSERT INTO dream_cycles
    (id, start_time, end_time, duration_ms, concepts_processed, associations_found,
     insights_generated, status, error)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      end_time = excluded.end_time, duration_ms = excluded.duration_ms,
      concepts_processed = excluded.concepts_processed,
      associations_found = excluded.associations_found,
      insights_generated = excluded.insights_generated,
      status = excluded.status, error = excluded.error
  `);

  const write = db.transaction((): Omit<DreamCommitResult, 'commitDurationMs'> => {
    // The cycle row first: insights reference it.
    const { cycle } = dream;
    upsertCycle.run(
      cycle.id,
      cycle.startTime.toISOString(),
      cycle.endTime?.toISOString() ?? null,
      cycle.durationMs ?? null,
      cycle.conceptsProcessed,
      cycle.associationsFound,
      cycle.insightsGenerated,
      cycle.status,
      cycle.error ?? null,
    );
    let activationsWritten = 0;
    for (const [nodeId, level, loadedLevel] of dream.activations) {
      // Conflict rule: the foreground wins. A node removed since the dream
      // loaded it is not recreated, and a node whose level changed since then
      // is not overwritten; in both cases the UPDATE matches no row.
      const expected = loadedLevel ?? null;
      activationsWritten += updateActivation.run(
        Math.max(0, Math.min(1, level)), nodeId, expected, expected,
      ).changes;
    }
    for (const insight of dream.insights) {
      insertInsight.run(
        insight.id,
        insight.cycleId,
        insight.type,
        JSON.stringify(insight.sourceConcepts),
        insight.description,
        insight.noveltyScore,
        insight.confidenceScore,
        insight.actionable ? 1 : 0,
        insight.suggestedAction ?? null,
      );
    }
    return {
      activationsWritten,
      activationsSkipped: dream.activations.length - activationsWritten,
      insightsWritten: dream.insights.length,
    };
  });

  const started = performance.now();
  // IMMEDIATE takes the write lock up front, so the transaction waits on
  // busy_timeout instead of failing at the read-to-write upgrade.
  const counts = write.immediate();
  return { ...counts, commitDurationMs: performance.now() - started };
}

/**
 * Margin added to the longest dream duration before a `running` cycle is
 * treated as abandoned (covers graph loading and insight generation).
 */
export const ABANDONED_CYCLE_GRACE_MS = 10 * 60 * 1000;

/** Error recorded on a cycle the abandoned-cycle sweep marks interrupted. */
export const ABANDONED_CYCLE_ERROR = 'abandoned: process exited';

/**
 * Mark cycles a dead process left `running` as `interrupted` (#1060). Only a
 * cycle that started more than `olderThanMs` ago is touched, so pass at least
 * the longest dream duration plus ABANDONED_CYCLE_GRACE_MS: a cycle still
 * running in another live process is then never marked. Rows are only
 * updated, never deleted. Returns the number of cycles marked.
 */
export function markAbandonedCycles(
  db: DatabaseType,
  olderThanMs: number = ABANDONED_CYCLE_GRACE_MS,
  now: number = Date.now(),
): number {
  const cutoff = new Date(now - olderThanMs).toISOString();
  return db.prepare(`
    UPDATE dream_cycles
    SET status = 'interrupted',
        error = ?,
        end_time = COALESCE(end_time, ?)
    WHERE status = 'running' AND start_time < ?
  `).run(ABANDONED_CYCLE_ERROR, new Date(now).toISOString(), cutoff).changes;
}
