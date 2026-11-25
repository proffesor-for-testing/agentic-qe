/**
 * #1481: routing metrics read only rows with an observed outcome. Open route
 * sentinels (quality_score = -1), swept 'stale-sentinel' rows and hook rows
 * closed by the installed hooks' constant --success true are routing
 * decisions, not results, and are excluded at read time. No row is modified.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';

const holder: { db: Database.Database | null } = { db: null };

vi.mock('../../../src/kernel/unified-memory.js', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return {
    ...actual,
    getUnifiedMemory: () => ({
      isInitialized: () => true,
      initialize: async () => {},
      getDatabase: () => holder.db,
      writeWhenUnlocked: async (fn: () => void) => fn(),
    }),
  };
});

import { createRoutingFeedbackCollector } from '../../../src/routing/routing-feedback';
import {
  OBSERVED_HOOK_OUTCOME_TAG,
  OBSERVED_ROUTING_OUTCOME_SQL,
  STALE_SENTINEL_ERROR,
} from '../../../src/routing/routing-outcomes-migration';
import { findDeterministicAction } from '../../../src/coordination/deterministic-actions';

function seed(db: Database.Database): void {
  db.exec(`
    CREATE TABLE routing_outcomes (
      id TEXT PRIMARY KEY, task_json TEXT NOT NULL, decision_json TEXT NOT NULL,
      used_agent TEXT NOT NULL, followed_recommendation INTEGER NOT NULL,
      success INTEGER NOT NULL, quality_score REAL NOT NULL, duration_ms REAL NOT NULL,
      error TEXT, model_tier TEXT, advisor_consultation_json TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE kv_store (key TEXT PRIMARY KEY, value TEXT, updated_at TEXT);
  `);
  const insert = db.prepare(`
    INSERT INTO routing_outcomes (id, task_json, decision_json, used_agent,
      followed_recommendation, success, quality_score, duration_ms, error)
    VALUES (?, '{"description":"t"}', '{"recommended":"qe-a","confidence":0.8}', 'qe-a', 1, ?, ?, 0, ?)
  `);
  insert.run('observed-success', 1, 0.9, null);
  insert.run('observed-failure', 0, 0, 'Task execution failed');
  insert.run('observed-low-confidence', 1, 0.7, 'low-confidence');
  insert.run('open-sentinel', 0, -1, null);
  insert.run('open-low-confidence-sentinel', 0, -1, 'low-confidence');
  insert.run('stale-sentinel', 0, 0.325, STALE_SENTINEL_ERROR);
  // Hook rows (id prefix 'route-'): the legacy Stop hook closed every turn as
  // success=1, q=0.675 without observing a result; an observed close is tagged.
  insert.run('route-legacy-closed', 1, 0.675, null);
  insert.run('route-legacy-closed-2', 1, 0.675, null);
  insert.run('route-observed', 0, 0.425, OBSERVED_HOOK_OUTCOME_TAG);
}

describe('routing outcomes: read-time sentinel exclusion (#1481)', () => {
  beforeEach(() => {
    holder.db = new Database(':memory:');
    seed(holder.db);
  });

  afterEach(() => {
    holder.db?.close();
    holder.db = null;
  });

  it('the SQL predicate keeps only observed outcomes', () => {
    const ids = holder.db!
      .prepare(`SELECT id FROM routing_outcomes WHERE ${OBSERVED_ROUTING_OUTCOME_SQL} ORDER BY id`)
      .all()
      .map((r) => (r as { id: string }).id);

    expect(ids).toEqual(['observed-failure', 'observed-low-confidence', 'observed-success', 'route-observed']);
  });

  it('the collector loads observed outcomes only and leaves the rows intact', async () => {
    const collector = createRoutingFeedbackCollector(100);
    await collector.initialize();

    const accuracy = collector.analyzeRoutingAccuracy();
    expect(accuracy.totalOutcomes).toBe(4);
    // 2 of 4 observed outcomes succeeded. Before #1481 the two legacy hook
    // "successes" counted and the sentinels counted as failures.
    expect(accuracy.successRate).toBe(0.5);
    // The observed hook row counts for success but not for follow stats: its
    // followed_recommendation was written before any agent ran.
    expect(accuracy.followKnownOutcomes).toBe(3);
    expect(accuracy.recommendationSuccessRate).toBeCloseTo(2 / 3);

    const total = holder.db!.prepare('SELECT COUNT(*) AS n FROM routing_outcomes').get() as { n: number };
    expect(total.n).toBe(9);
  });

  it('an unrouted outcome is not counted as an override', async () => {
    const collector = createRoutingFeedbackCollector(100);
    await collector.initialize();
    const before = collector.analyzeRoutingAccuracy();

    collector.recordOutcome(
      { id: 't', description: 't', complexity: 'medium', domains: [], context: {} } as never,
      { recommended: 'unrouted', confidence: 0.8 } as never,
      'tier-2',
      { success: false, qualityScore: 0, durationMs: 10, error: 'failed' },
    );
    const after = collector.analyzeRoutingAccuracy();

    // It is an observed failure...
    expect(after.totalOutcomes).toBe(before.totalOutcomes + 1);
    expect(after.successRate!).toBeLessThan(before.successRate!);
    // ...but there was no recommendation to override.
    expect(after.followKnownOutcomes).toBe(before.followKnownOutcomes);
    expect(after.overrideRate).toBe(before.overrideRate);
    expect(collector.getStats().recentOverrides).toBe(0);
  });

  it('reports null rates, not 0, when nothing was observed', () => {
    const collector = createRoutingFeedbackCollector(100);
    const accuracy = collector.analyzeRoutingAccuracy();

    expect(accuracy).toMatchObject({
      totalOutcomes: 0, successRate: null, overrideRate: null,
      recommendationSuccessRate: null, overrideSuccessRate: null,
    });
  });

  it('keeps the deprecated escalation API as an honest no-op', () => {
    const collector = createRoutingFeedbackCollector(100, { enableAutoEscalation: true });
    collector.enableAutoEscalation({ escalateAfterFailures: 1 } as never);

    expect(collector.getEscalationState('qe-a')).toBeNull();
  });

  it('the routing-accuracy workflow action counts observed outcomes only', async () => {
    const action = findDeterministicAction('learning-optimization', 'routing-check')!;
    const result = await action.execute({}, {
      input: {}, results: {},
      metadata: { executionId: 'e', workflowId: 'w', startedAt: new Date() },
    } as never);

    // Before #1481 all 9 rows counted: 4 successes of 9 = 44.44%.
    expect(result.value).toMatchObject({
      totalOutcomes: 4, successfulOutcomes: 2, successRate: 50, source: 'database',
    });
  });

  // Round 2: pre-#1481 executor rows ('outcome-' id, tier number as both the
  // recommended and the used agent) carry a constant followed=1.
  it('keeps legacy executor rows as outcomes but out of follow stats', async () => {
    const legacy = holder.db!.prepare(`
      INSERT INTO routing_outcomes (id, task_json, decision_json, used_agent,
        followed_recommendation, success, quality_score, duration_ms, error, created_at)
      VALUES (?, '{"description":"scan-security"}', ?, ?, 1, 1, 0.675, 120, NULL, ?)
    `);
    legacy.run('outcome-legacy-1', '{"recommended":"2","reasoning":"Recorded from feedback"}', '2', '2026-08-01 10:00:00');
    legacy.run('outcome-legacy-2', '{"recommended":"0","reasoning":"Recorded from feedback"}', '0', '2026-08-02 10:00:00');
    const collector = createRoutingFeedbackCollector(100);
    await collector.initialize();

    const accuracy = collector.analyzeRoutingAccuracy();

    expect(accuracy.totalOutcomes).toBe(6);
    expect(accuracy.followKnownOutcomes).toBe(3);
    expect(accuracy.followedRecommendations).toBe(3);
  });

  it('adds a caveat when every observed outcome predates the #1020 evidence gate', async () => {
    holder.db!.exec(`UPDATE routing_outcomes SET created_at = '2026-08-01 10:00:00'`);
    const collector = createRoutingFeedbackCollector(100);
    await collector.initialize();

    expect(collector.analyzeRoutingAccuracy().caveat)
      .toBe('all 4 observed outcomes predate evidence-gated execution (#1020)');

    const action = findDeterministicAction('learning-optimization', 'routing-check')!;
    const result = await action.execute({}, {
      input: {}, results: {}, metadata: { executionId: 'e', workflowId: 'w', startedAt: new Date() },
    } as never);
    expect(result.value).toMatchObject({
      totalOutcomes: 4, caveat: 'all 4 observed outcomes predate evidence-gated execution (#1020)',
    });
  });

  it('adds no caveat once an observed outcome is newer than the gate', async () => {
    const collector = createRoutingFeedbackCollector(100);
    await collector.initialize();

    expect(collector.analyzeRoutingAccuracy().caveat).toBeUndefined();
  });
});
