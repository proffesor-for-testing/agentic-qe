/**
 * #1493: promotion and the QEAgentCompletion handler never treat an
 * unobserved hook result as a success.
 */

import { describe, it, expect, vi } from 'vitest';
import { shouldPromotePattern, type QEPattern } from '../../../src/learning/qe-patterns.js';
import {
  isLegacyHookDerivedPattern,
  LEGACY_HOOK_TASK_SOURCE,
  OBSERVED_HOOK_TASK_SOURCE,
} from '../../../src/learning/hook-outcome-provenance.js';
import { createQEHookHandlers, QE_HOOK_EVENTS } from '../../../src/learning/qe-hooks.js';
import type { QEReasoningBank } from '../../../src/learning/qe-reasoning-bank.js';
import { ok } from '../../../src/shared/types/index.js';
import { createLearningMetricsTracker } from '../../../src/learning/metrics-tracker.js';
import Database from 'better-sqlite3';
import { mkdtempSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const promotable = (tags: string[]): QEPattern => ({
  tier: 'short-term', successfulUses: 10, usageCount: 10, successRate: 1, confidence: 0.9,
  context: { tags },
} as unknown as QEPattern);

describe('promotion of hook-derived patterns (#1493)', () => {
  it('blocks a pattern consolidated from legacy post-task hook rows', () => {
    const check = shouldPromotePattern(promotable([LEGACY_HOOK_TASK_SOURCE]));

    expect(check.meetsUsageCriteria).toBe(false);
    expect(check.blockReason).toBe('insufficient_usage');
  });

  it.each([[[OBSERVED_HOOK_TASK_SOURCE]], [['cli-hook-post-edit']], [[]]])(
    'still promotes a pattern tagged %j', (tags) => {
      expect(shouldPromotePattern(promotable(tags)).meetsUsageCriteria).toBe(true);
    });

  it('recognises legacy provenance only from context tags', () => {
    expect(isLegacyHookDerivedPattern({ context: { tags: [LEGACY_HOOK_TASK_SOURCE, 'x'] } })).toBe(true);
    expect(isLegacyHookDerivedPattern({ context: { tags: [OBSERVED_HOOK_TASK_SOURCE] } })).toBe(false);
    expect(isLegacyHookDerivedPattern({ context: null })).toBe(false);
    expect(isLegacyHookDerivedPattern({})).toBe(false);
  });
});

describe('QEAgentCompletion handler (#1493)', () => {
  const bank = () => ({
    getPattern: vi.fn().mockResolvedValue({ id: 'p1' }),
    storePattern: vi.fn(),
    recordOutcome: vi.fn().mockResolvedValue(ok(undefined)),
  }) as unknown as QEReasoningBank & { recordOutcome: ReturnType<typeof vi.fn> };

  it.each([[undefined], [null], ['true']])('records no outcome for success=%j', async (success) => {
    const rb = bank();
    const handlers = createQEHookHandlers(rb);

    await handlers[QE_HOOK_EVENTS.QEAgentCompletion]({
      eventId: 'e1', timestamp: new Date(), data: { agentType: 'coder', success, patternId: 'p1' },
    });

    expect(rb.recordOutcome).not.toHaveBeenCalled();
  });

  it.each([[true], [false]])('records an observed boolean success=%j', async (success) => {
    const rb = bank();
    const handlers = createQEHookHandlers(rb);

    await handlers[QE_HOOK_EVENTS.QEAgentCompletion]({
      eventId: 'e2', timestamp: new Date(), data: { agentType: 'coder', success, patternId: 'p1' },
    });

    expect(rb.recordOutcome).toHaveBeenCalledWith(expect.objectContaining({ patternId: 'p1', success }));
  });
});

describe('LearningMetricsTracker experience stats (#1493)', () => {
  const setup = (sql: string) => {
    const root = mkdtempSync(join(tmpdir(), 'aqe-1493-metrics-'));
    mkdirSync(join(root, '.agentic-qe'), { recursive: true });
    const db = new Database(join(root, '.agentic-qe', 'memory.db'));
    db.exec(sql);
    db.close();
    return { root, tracker: createLearningMetricsTracker(root) };
  };

  it('leaves legacy post-task hook experiences out of totals, reward and success rate', async () => {
    const { root, tracker } = setup(`
      CREATE TABLE captured_experiences (id TEXT PRIMARY KEY, agent TEXT, domain TEXT, success INTEGER,
        quality REAL, started_at TEXT DEFAULT (datetime('now')), source TEXT);
      INSERT INTO captured_experiences (id, agent, domain, success, quality, source) VALUES
        ('l1', 'coder', 'general', 1, 0.675, '${LEGACY_HOOK_TASK_SOURCE}'),
        ('l2', 'coder', 'general', 1, 0.675, '${LEGACY_HOOK_TASK_SOURCE}'),
        ('o1', 'coder', 'general', 0, 0.2, '${OBSERVED_HOOK_TASK_SOURCE}');
    `);
    try {
      const m = await tracker.getCurrentMetrics();
      expect(m.totalExperiences).toBe(1);
      expect(m.avgReward).toBeCloseTo(0.2, 5);
      expect(m.successRate).toBe(0);
    } finally {
      tracker.close();
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('rates qe_pattern_usage by measured rows only when there is no experience table', async () => {
    const { root, tracker } = setup(`
      CREATE TABLE qe_pattern_usage (id INTEGER PRIMARY KEY AUTOINCREMENT, pattern_id TEXT, success INTEGER,
        metrics_json TEXT, created_at TEXT DEFAULT (datetime('now')));
      INSERT INTO qe_pattern_usage (pattern_id, success, metrics_json) VALUES
        ('p', 1, '{"source":"session-consolidation","outcome":"unmeasured"}'),
        ('p', 1, '{"source":"${LEGACY_HOOK_TASK_SOURCE}"}'),
        ('p', 1, NULL),
        ('p', 0, '{"outcome":"measured"}');
    `);
    try {
      const m = await tracker.getCurrentMetrics();
      expect(m.totalExperiences).toBe(4);
      expect(m.successRate).toBe(0);
    } finally {
      tracker.close();
      rmSync(root, { recursive: true, force: true });
    }
  });
});
