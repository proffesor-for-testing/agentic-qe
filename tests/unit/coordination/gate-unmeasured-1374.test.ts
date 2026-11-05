/**
 * #1374: quality-gate-check read its pass rate from test_outcomes with
 * "no rows → 0%", and counted the never-run rows the MCP handler factory wrote
 * for generated tests (generated_by 'qe-test-generation', passed = 1) up to
 * #1372, so a project with only those rows PASSED at 100%. The bug count had
 * the same "no rows → 0 bugs (pass)" fault.
 *
 * Uses a real SQLite database with the real test_outcomes schema, so the SQL
 * predicates themselves are exercised. TestOutcomeTracker.loadFromDb must skip
 * the generation rows too, without deleting them.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Database from 'better-sqlite3';
import { FEEDBACK_SCHEMA } from '../../../src/kernel/unified-memory-schemas.js';
import type { WorkflowContext } from '../../../src/coordination/workflow-types.js';

let db: Database.Database;

vi.mock('../../../src/kernel/unified-memory.js', () => ({
  getUnifiedMemory: () => ({
    isInitialized: () => true,
    initialize: async () => undefined,
    getDatabase: () => db,
    writeWhenUnlocked: async <T>(fn: () => T) => fn(),
  }),
}));

const { findDeterministicAction } = await import('../../../src/coordination/deterministic-actions.js');
const { TestOutcomeTracker } = await import('../../../src/feedback/test-outcome-tracker.js');

const context = (): WorkflowContext => ({
  input: {}, results: {}, metadata: { executionId: 'e', workflowId: 'w', startedAt: new Date() },
});

let n = 0;
function row(generatedBy: string, passed: 0 | 1, opts: { flaky?: 0 | 1; age?: string; domain?: string } = {}) {
  db.prepare(`INSERT INTO test_outcomes (id, test_id, test_name, generated_by, framework, language, domain,
      passed, flaky, execution_time_ms, maintainability_score, created_at)
    VALUES (?, ?, ?, ?, 'vitest', 'typescript', ?, ?, ?, 5, 0.5, datetime('now', ?))`)
    .run(`r${++n}`, `t${n}`, `test ${n}`, generatedBy, opts.domain ?? 'test-execution', passed, opts.flaky ?? 0, opts.age ?? '-1 minutes');
}
/** The never-run rows exactly as the pre-#1372 handler factory wrote them (domain 'test-generation'). */
const generated = (count: number) => {
  for (let i = 0; i < count; i++) row('qe-test-generation', 1, { domain: 'test-generation' });
};
const executed = (...passed: Array<0 | 1>) => passed.forEach(p => row('cli-hook-post-command', p));

/** Coverage is supplied, so only the test_outcomes inputs are read from the DB. */
async function gate(input: Record<string, unknown> = { currentCoverage: 95 }) {
  const result = await findDeterministicAction('quality-assessment', 'gate-check')!.execute(input, context());
  if (!result.success) throw result.error;
  return result.value as {
    passed: boolean; score: number; unmeasured?: string[]; reason?: string;
    details: Record<'coverage' | 'testsPassing' | 'bugs', { current: number | null; passed: boolean; unmeasured?: boolean }>;
  };
}

beforeEach(() => {
  db = new Database(':memory:');
  db.exec(FEEDBACK_SCHEMA);
});
afterEach(() => db.close());

describe('quality-gate-check without execution evidence (#1374)', () => {
  it('no rows: pass rate and bugs are unmeasured (null), and the gate fails without a fake 0%', async () => {
    const g = await gate();
    expect(g.details.testsPassing).toMatchObject({ current: null, passed: false, unmeasured: true });
    expect(g.details.bugs).toMatchObject({ current: null, passed: false, unmeasured: true });
    expect(g.passed).toBe(false);
    expect(g.unmeasured).toEqual(['testsPassing', 'bugs']);
    expect(g.reason).toMatch(/No execution evidence for testsPassing, bugs/);
  });

  it('only never-run generation rows: unmeasured, not a 100% pass', async () => {
    generated(5);
    const g = await gate();
    expect(g.details.testsPassing).toMatchObject({ current: null, unmeasured: true });
    expect(g.passed).toBe(false);
  });

  it('executed rows are measured, and generation rows next to them do not count', async () => {
    generated(5);
    executed(1, 0);
    const g = await gate();
    expect(g.details.testsPassing).toMatchObject({ current: 50, passed: false });
    expect(g.details.testsPassing.unmeasured).toBeUndefined();
    expect(g.details.bugs).toMatchObject({ current: 1, passed: true });
    expect(g.unmeasured).toBeUndefined();
  });

  it('a real executed run of an AQE-generated test is evidence (only the never-run pair is ignored)', async () => {
    row('qe-test-generation', 0, { domain: 'test-execution' });
    row('qe-test-generation', 1, { domain: 'test-execution' });
    const g = await gate();
    expect(g.details.testsPassing).toMatchObject({ current: 50 });
    expect(g.details.bugs).toMatchObject({ current: 1 });
  });

  it('the reason says where testsPassing and bugs come from', async () => {
    expect((await gate()).reason).toMatch(/testsPassing and bugs come from executed test_outcomes rows of the last 7 days/);
  });

  it('a measured, healthy project passes', async () => {
    executed(1, 1, 1, 1);
    const g = await gate();
    expect(g.details.testsPassing.current).toBe(100);
    expect(g.details.bugs.current).toBe(0);
    expect(g.passed).toBe(true);
  });

  it('only the last 7 days count; older executed rows leave the rate unmeasured', async () => {
    row('cli-hook-post-command', 1, { age: '-8 days' });
    expect((await gate()).details.testsPassing.unmeasured).toBe(true);
  });

  it('flaky failures are not bugs', async () => {
    row('cli-hook-post-command', 0, { flaky: 1 });
    executed(1);
    const g = await gate();
    expect(g.details.bugs.current).toBe(0);
    expect(g.details.testsPassing.current).toBe(50);
  });

  it('caller-supplied values are used as before, even with no rows', async () => {
    const g = await gate({ currentCoverage: 95, currentTestsPassingRate: 99, currentBugs: 0 });
    expect(g.passed).toBe(true);
    expect(g.unmeasured).toBeUndefined();
  });

  it('a supplied pass rate with no rows still leaves bugs unmeasured', async () => {
    const g = await gate({ currentCoverage: 95, currentTestsPassingRate: 99 });
    expect(g.details.testsPassing.current).toBe(99);
    expect(g.details.bugs).toMatchObject({ current: null, unmeasured: true });
    expect(g.passed).toBe(false);
  });
});

describe('TestOutcomeTracker skips never-run generation rows (#1374)', () => {
  const count = () => (db.prepare('SELECT COUNT(*) as c FROM test_outcomes').get() as { c: number }).c;

  it('loadFromDb loads executed rows only and deletes nothing', async () => {
    generated(3);
    executed(1, 0);
    row('qe-test-generation', 1, { domain: 'test-execution' });
    const tracker = new TestOutcomeTracker();
    await tracker.initialize();
    const loaded = tracker.exportOutcomes();
    expect(loaded.map(o => `${o.generatedBy}/${o.domain}`).sort()).toEqual([
      'cli-hook-post-command/test-execution', 'cli-hook-post-command/test-execution', 'qe-test-generation/test-execution',
    ]);
    expect(count()).toBe(6);
  });

  it('memory matches the DB after a restart: a never-run outcome is persisted but not held in memory', async () => {
    const tracker = new TestOutcomeTracker();
    await tracker.initialize();
    const base = {
      testName: 'x', framework: 'vitest', language: 'typescript', passed: true,
      coverage: { lines: 0, branches: 0, functions: 0 }, executionTimeMs: 1, flaky: false,
      maintainabilityScore: 0.5, timestamp: new Date(),
    } as const;
    await tracker.track({ ...base, id: 'gen-1', testId: 'gen-1', generatedBy: 'qe-test-generation', domain: 'test-generation' } as never);
    await tracker.track({ ...base, id: 'run-1', testId: 'run-1', generatedBy: 'qe-test-generation', domain: 'test-execution' } as never);
    tracker.importOutcomes([{ ...base, id: 'gen-2', testId: 'gen-2', generatedBy: 'qe-test-generation', domain: 'test-generation' } as never]);
    expect(tracker.exportOutcomes().map(o => o.id)).toEqual(['run-1']);
    expect(count()).toBe(2); // both tracked rows were persisted

    const restarted = new TestOutcomeTracker();
    await restarted.initialize();
    expect(restarted.exportOutcomes().map(o => o.id)).toEqual(['run-1']);
  });
});
