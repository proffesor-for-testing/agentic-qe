import { describe, expect, it } from 'vitest';
import {
  evaluateMeasuredQualityEvidence,
  getMeasuredQualityExitCode,
  loadQualityEvidence,
} from '../../../src/cli/commands/quality.js';

describe('quality command evidence loading', () => {
  const passing = {
    coverage: 90,
    testsPassing: 100,
    criticalBugs: 0,
    codeSmells: 10,
    securityVulnerabilities: 0,
    technicalDebt: 2,
    duplications: 3,
  };

  it('refuses to invent zero metrics when AgentDB has no measured evidence', async () => {
    const memory = { get: async () => undefined };
    await expect(loadQualityEvidence(memory as never)).rejects.toThrow(/no measured quality evidence/i);
  });

  it('loads measured coverage and test pass rate from canonical AgentDB keys', async () => {
    const memory = {
      get: async (key: string) => {
        const metric = key.split(':')[1] as keyof typeof passing;
        return {
          schemaVersion: 1,
          metric,
          value: passing[metric],
          measuredAt: new Date().toISOString(),
          source: 'test',
        };
      },
    };
    const evidence = await loadQualityEvidence(memory as never);
    expect(evidence).toEqual(passing);
  });

  it('reports all configured checks from measured evidence', () => {
    const result = evaluateMeasuredQualityEvidence(passing);

    expect(result.passed).toBe(true);
    expect(result.checks.map(check => check.name)).toEqual(Object.keys(passing));
  });

  it('preserves pass, fail, and near-threshold warning exit codes', () => {
    const failed = evaluateMeasuredQualityEvidence({ ...passing, coverage: 79.9 });
    const warning = evaluateMeasuredQualityEvidence({ ...passing, coverage: 82 });
    const passed = evaluateMeasuredQualityEvidence(passing);

    expect(getMeasuredQualityExitCode(failed)).toBe(1);
    expect(getMeasuredQualityExitCode(warning)).toBe(2);
    expect(getMeasuredQualityExitCode(passed)).toBe(0);
  });
});
