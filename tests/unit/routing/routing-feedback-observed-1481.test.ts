/**
 * #1481: routing metrics read only rows with an observed outcome. Open route
 * sentinels (quality_score = -1) and swept 'stale-sentinel' rows are routing
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

    expect(ids).toEqual(['observed-failure', 'observed-low-confidence', 'observed-success']);
  });

  it('the collector loads observed outcomes only and leaves the rows intact', async () => {
    const collector = createRoutingFeedbackCollector(100);
    await collector.initialize();

    const accuracy = collector.analyzeRoutingAccuracy();
    expect(accuracy.totalOutcomes).toBe(3);
    // 2 of 3 observed outcomes succeeded; the 3 sentinel rows are not failures.
    expect(accuracy.recommendationSuccessRate).toBeCloseTo(2 / 3);

    const total = holder.db!.prepare('SELECT COUNT(*) AS n FROM routing_outcomes').get() as { n: number };
    expect(total.n).toBe(6);
  });

  it('a recorded failure lowers the agent success rate', async () => {
    const collector = createRoutingFeedbackCollector(100);
    await collector.initialize();
    const before = collector.getAgentMetrics('qe-a')!.successRate;

    collector.recordOutcome(
      { id: 't', description: 't', complexity: 'medium', domains: [], context: {} } as never,
      { recommended: 'qe-a', confidence: 0.8 } as never,
      'qe-a',
      { success: false, qualityScore: 0, durationMs: 10, error: 'failed' },
    );

    expect(collector.getAgentMetrics('qe-a')!.successRate).toBeLessThan(before);
  });

  it('the routing-accuracy workflow action counts observed outcomes only', async () => {
    const action = findDeterministicAction('learning-optimization', 'routing-check')!;
    const result = await action.execute({}, {
      input: {}, results: {},
      metadata: { executionId: 'e', workflowId: 'w', startedAt: new Date() },
    } as never);

    // Before #1481 the 3 sentinel rows were counted as failures: 2/6 = 33.33%.
    expect(result.value).toMatchObject({
      totalOutcomes: 3, successfulOutcomes: 2, successRate: 66.67, source: 'database',
    });
  });
});
