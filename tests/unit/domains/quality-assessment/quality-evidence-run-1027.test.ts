/**
 * #1027 round 2b NB1 — coverage measured in a run whose tests FAILED is only
 * usable together with the testsPassing of that SAME run.
 *
 * Before: `aqe test execute` (all pass → testsPassing 100), then a failing MCP
 * run persisted coverage (runStatus 'failed') but no testsPassing, so a gate
 * read fresh coverage + the stale 100 and could pass.
 */
import { describe, it, expect } from 'vitest';
import {
  inspectQualityEvidence,
  testsPassingPercent,
  writeQualityEvidence,
  writeTestRunEvidence,
} from '../../../../src/domains/quality-assessment/quality-evidence';

function memory() {
  const store = new Map<string, unknown>();
  const k = (key: string, o?: { namespace?: string }) => `${o?.namespace ?? ''}::${key}`;
  return {
    store,
    get: async (key: string, o?: { namespace?: string }) => store.get(k(key, o)),
    set: async (key: string, v: unknown, o?: { namespace?: string }) => { store.set(k(key, o), v); },
  };
}

const now = new Date().toISOString();
const others = { criticalBugs: 0, codeSmells: 0, securityVulnerabilities: 0, technicalDebt: 0, duplications: 0 };

describe('#1027 NB1 — run-scoped coverage + testsPassing evidence', () => {
  it('writeTestRunEvidence writes testsPassing (and coverage) stamped with the same runId and runStatus', async () => {
    const m = memory();
    await writeTestRunEvidence(m as never, { runId: 'r1', passed: 3, failed: 1, skipped: 0 }, { source: 'test', coverage: 87.5 });

    const { values, problems } = await inspectQualityEvidence(m as never);
    expect(values).toMatchObject({ coverage: 87.5, testsPassing: 75 });
    expect(problems.map(p => p.metric)).not.toContain('coverage');
    expect([...m.store.values()].filter(v => (v as { runId?: string }).runId === 'r1')).toHaveLength(2);
    expect([...m.store.values()].every(v => (v as { runStatus?: string }).runStatus === 'failed')).toBe(true);
  });

  it('coverage from a failing run WITHOUT that run\'s testsPassing is unusable (a stale 100 cannot pass the gate)', async () => {
    const m = memory();
    // 1. aqe test execute: all pass.
    await writeTestRunEvidence(m as never, { runId: 'cli-run', passed: 3, failed: 0 }, { source: 'aqe test execute' });
    await writeQualityEvidence(m as never, others, { measuredAt: now, source: 'seed' });
    // 2. a failing run's coverage only (its testsPassing never arrived).
    await writeQualityEvidence(m as never, { coverage: 87.5 }, { measuredAt: now, source: 'test-execution coverage', runId: 'mcp-run', runStatus: 'failed' });

    const { values, problems } = await inspectQualityEvidence(m as never);
    expect(values.coverage).toBeUndefined();
    expect(problems).toContainEqual(expect.objectContaining({ metric: 'coverage', reason: expect.stringMatching(/failing tests.*same run/i) }));
  });

  it('failing-run coverage with no runId (counts unknown) never pairs with an unscoped testsPassing', async () => {
    const m = memory();
    await writeQualityEvidence(m as never, { testsPassing: 100 }, { measuredAt: now, source: 'legacy' });
    await writeQualityEvidence(m as never, { coverage: 87.5 }, { measuredAt: now, source: 'nyc', runStatus: 'failed' });
    const { values } = await inspectQualityEvidence(m as never);
    expect(values.coverage).toBeUndefined();
  });

  it('coverage from a passing run (or from a report with no run) is usable on its own', async () => {
    const m = memory();
    await writeQualityEvidence(m as never, { coverage: 90 }, { measuredAt: now, source: 'x', runId: 'r2', runStatus: 'passed' });
    await writeQualityEvidence(m as never, { coverage: 91 }, { measuredAt: now, source: 'coverage-analysis' });
    const { values } = await inspectQualityEvidence(m as never);
    expect(values.coverage).toBe(91);
  });

  it('testsPassingPercent matches `aqe test execute` (skipped count in the total; no tests → 0)', () => {
    expect(testsPassingPercent({ passed: 3, failed: 1, skipped: 0 })).toBe(75);
    expect(testsPassingPercent({ passed: 2, failed: 0, skipped: 2 })).toBe(50);
    expect(testsPassingPercent({ passed: 0, failed: 0 })).toBe(0);
  });
});
