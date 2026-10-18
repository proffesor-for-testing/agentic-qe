/**
 * #1129: `aqe learning stats` printed "Pattern Success Rate: 100%" after test
 * runs that had failing tests. MCP tool runs were captured with a fixed
 * `success: true`, only successful experiences reached qe_pattern_usage, and
 * the rate was taken over every usage row.
 *
 * Now a usage row says whether its success was read from the result, failed
 * measured outcomes are recorded, the rate counts measured rows only, and rows
 * written before the tag existed are read as unmeasured (never rewritten).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import {
  measureToolOutcome,
  usageOutcomeOf,
  MEASURED_USAGE_SQL,
  formatLearningOutcomes,
  formatPatternSuccessRate,
} from '../../../src/learning/usage-outcome.js';
import { createExperienceCaptureService, type ExperienceCaptureService } from '../../../src/learning/experience-capture.js';
import type { PatternStore } from '../../../src/learning/pattern-store.js';
import type { MemoryBackend } from '../../../src/kernel/interfaces.js';
import { ok } from '../../../src/shared/types/index.js';
import { QEReasoningBank } from '../../../src/learning/qe-reasoning-bank.js';
import { createMockMemory } from '../../mocks';

describe('#1129 measureToolOutcome', () => {
  it.each([
    ['a run with a failing test', 'execute-tests', { total: 3, passed: 2, failed: 1 }, { measured: true, success: false, basis: 'test-results' }],
    ['a run where every test passed', 'execute-tests', { total: 3, passed: 3, failed: 0 }, { measured: true, success: true, basis: 'test-results' }],
    ['a run that found no tests', 'execute-tests', { total: 0, passed: 0, failed: 0 }, { measured: false, success: null, basis: 'no-test-results' }],
    // #1142 review: an index fails for the caller's input and for indexer
    // errors alike; counting only successes would be 100% by selection.
    ['an index that indexed files', 'index-code', { filesIndexed: 1 }, { measured: false, success: null, basis: 'tool-completed' }],
    ['an index of a missing target', 'index-code', { filesIndexed: 0 }, { measured: false, success: null, basis: 'tool-completed' }],
    ['a tool with no outcome measure', 'generate-tests', { tests: [] }, { measured: false, success: null, basis: 'tool-completed' }],
  ])('%s', (_label, taskType, data, expected) => {
    expect(measureToolOutcome(taskType, data)).toEqual(expected);
  });
});

describe('#1129 usage row classification (TypeScript and SQL agree)', () => {
  // Only an explicit outcome tag makes a row measured (#1142 review B1).
  const rows: Array<[string, string | null, 'measured' | 'unmeasured']> = [
    ['tagged measured', '{"outcome":"measured","outcomeBasis":"test-results"}', 'measured'],
    ['tagged unmeasured', '{"outcome":"unmeasured","outcomeBasis":"tool-completed"}', 'unmeasured'],
    ['session consolidation, as written before #1129', '{"source":"session-consolidation","domain":"test-generation","agent":"cli-hook"}', 'unmeasured'],
    ['session consolidation, as written now', '{"source":"session-consolidation","domain":"test-generation","agent":"cli-hook","outcome":"unmeasured","outcomeBasis":"session-consolidation"}', 'unmeasured'],
    ['pre-#1129 experience capture (no metrics)', null, 'unmeasured'],
    ['pre-#1129 MCP handler row', '{"executionTimeMs":5}', 'unmeasured'],
    ['hook-reported pass counts', '{"testsPassed":4,"testsFailed":1}', 'unmeasured'],
    ['empty metrics', '{}', 'unmeasured'],
    ['malformed metrics', '{"outcome":"measured"', 'unmeasured'],
  ];

  it.each(rows)('%s', (_label, metricsJson, expected) => {
    let parsed: Record<string, unknown> | null = null;
    try { parsed = metricsJson ? JSON.parse(metricsJson) : null; } catch { parsed = null; }
    expect(usageOutcomeOf(parsed)).toBe(expected);

    const db = new Database(':memory:');
    db.exec('CREATE TABLE qe_pattern_usage (id INTEGER PRIMARY KEY, metrics_json TEXT)');
    db.prepare('INSERT INTO qe_pattern_usage (metrics_json) VALUES (?)').run(metricsJson);
    const row = db.prepare(`SELECT ${MEASURED_USAGE_SQL} AS measured FROM qe_pattern_usage`).get() as { measured: number };
    db.close();
    expect(row.measured).toBe(expected === 'measured' ? 1 : 0);
  });
});

describe('#1129 stats wording', () => {
  it('says insufficient evidence instead of a rate when nothing is measured', () => {
    const stats = { learningOutcomes: 418, measuredOutcomes: 0, unmeasuredOutcomes: 418, patternSuccessRate: null };
    expect(formatLearningOutcomes(stats)).toBe('418 (0 measured runs, 418 unmeasured)');
    expect(formatPatternSuccessRate(stats)).toBe('insufficient evidence (no measured outcomes)');
  });

  it('prints the rate over measured runs, which can be fewer than rows', () => {
    const stats = { learningOutcomes: 9, measuredOutcomes: 5, unmeasuredOutcomes: 0, patternSuccessRate: 1 / 5 };
    expect(formatLearningOutcomes(stats)).toBe('9 (5 measured runs, 0 unmeasured)');
    expect(formatPatternSuccessRate(stats)).toBe('20.0% of 5 measured runs');
  });
});

describe('#1129 experience capture records measured failures', () => {
  let patternStore: PatternStore;
  let service: ExperienceCaptureService;

  function memory(): MemoryBackend {
    const storage = new Map<string, unknown>();
    return {
      get: vi.fn(async (key: string) => storage.get(key) ?? null),
      set: vi.fn(async (key: string, value: unknown) => { storage.set(key, value); }),
      delete: vi.fn(async (key: string) => { storage.delete(key); }),
      search: vi.fn(async () => []),
    } as unknown as MemoryBackend;
  }

  beforeEach(async () => {
    patternStore = {
      create: vi.fn().mockResolvedValue(ok({ id: 'p-new' })),
      get: vi.fn().mockResolvedValue({ id: 'p-1', tier: 'short-term', usageCount: 99 }),
      search: vi.fn().mockResolvedValue(ok([])),
      recordUsage: vi.fn().mockResolvedValue(ok(undefined)),
      promote: vi.fn().mockResolvedValue(ok(undefined)),
    } as unknown as PatternStore;
    service = createExperienceCaptureService(memory(), patternStore);
    await service.initialize();
  });

  afterEach(async () => {
    await service.dispose();
  });

  async function capture(outcome: { success: boolean; quality: number; outcomeBasis?: string }) {
    const id = service.startCapture('execute-tests: {"testFiles":["tests/math.test.ts"]}', { domain: 'test-execution' });
    return service.completeCapture(id, outcome);
  }

  it('records a failed test run as a failed, measured use', async () => {
    const result = await capture({ success: false, quality: 0.3, outcomeBasis: 'test-results' });

    expect(result.success).toBe(true);
    expect(patternStore.recordUsage).toHaveBeenCalledWith(
      'p-new', false, { outcome: 'measured', outcomeBasis: 'test-results' }
    );
  });

  it('tags a completion-only success as unmeasured', async () => {
    await capture({ success: true, quality: 0.7 });

    expect(patternStore.recordUsage).toHaveBeenCalledWith(
      'p-new', true, { outcome: 'unmeasured', outcomeBasis: 'task-completed' }
    );
  });

  it('carries the run id so rows from one run count once', async () => {
    const id = service.startCapture('execute-tests: run', { domain: 'test-execution', metadata: { runId: 'task-7' } });
    await service.completeCapture(id, { success: false, quality: 0.3, outcomeBasis: 'test-results' });

    expect(patternStore.recordUsage).toHaveBeenCalledWith(
      'p-new', false, { outcome: 'measured', outcomeBasis: 'test-results', runId: 'task-7' }
    );
  });

  it('still records nothing for an unmeasured failure', async () => {
    await capture({ success: false, quality: 0.3 });

    expect(patternStore.recordUsage).not.toHaveBeenCalled();
  });

  it('never promotes a pattern on a failed use', async () => {
    const task = 'execute-tests: {"testFiles":["tests/math.test.ts"]}';
    vi.mocked(patternStore.search).mockResolvedValue(ok([{
      pattern: {
        id: 'p-1', patternType: 'test-template', qeDomain: 'test-execution',
        context: { experienceOrigin: { task, domain: 'test-execution', patternType: 'test-template' } },
      },
    }]) as never);

    await capture({ success: false, quality: 0.3, outcomeBasis: 'test-results' });

    expect(patternStore.recordUsage).toHaveBeenCalledWith('p-1', false, expect.objectContaining({ outcome: 'measured' }));
    expect(patternStore.promote).not.toHaveBeenCalled();
  });
});

describe('#1129 QEReasoningBank.getStats', () => {
  function bankWith(aggregate: Record<string, number>): QEReasoningBank {
    const bank = new QEReasoningBank(createMockMemory());
    Object.assign(bank as unknown as Record<string, unknown>, {
      initialized: true,
      patternStore: { getStats: async () => ({ totalPatterns: 0, byDomain: {} }) },
      sqliteStore: {
        getAggregateOutcomeStats: () => ({
          routingRequests: 5, avgRoutingConfidence: 0.6, successfulRoutings: 5, avgPatternSuccessRate: 1,
          ...aggregate,
        }),
      },
    });
    return bank;
  }

  it('reports no rate, and says why, when every usage row only records a completed call', async () => {
    const stats = await bankWith({ learningOutcomes: 5, measuredOutcomes: 0, unmeasuredOutcomes: 5, successfulOutcomes: 0 }).getStats();

    expect(stats).toMatchObject({
      learningOutcomes: 5, measuredOutcomes: 0, unmeasuredOutcomes: 5,
      patternSuccessRate: null, evidenceStatus: 'insufficient-evidence',
    });
  });

  it('takes the rate over measured runs, and reports unmeasured rows as rows', async () => {
    // 10 rows: 8 measured rows from 4 runs, plus 2 unmeasured rows.
    const stats = await bankWith({ learningOutcomes: 10, measuredOutcomes: 4, unmeasuredOutcomes: 2, successfulOutcomes: 1 }).getStats();

    expect(stats.patternSuccessRate).toBe(0.25);
    expect(stats).toMatchObject({ measuredOutcomes: 4, unmeasuredOutcomes: 2 });
    expect(stats).not.toHaveProperty('evidenceStatus');
  });
});
