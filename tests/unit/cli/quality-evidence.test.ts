import { describe, expect, it } from 'vitest';
import {
  evaluateMeasuredQualityEvidence,
  getMeasuredQualityExitCode,
  loadQualityEvidence,
} from '../../../src/cli/commands/quality.js';

describe('quality command evidence loading', () => {
  it('refuses to invent zero metrics when AgentDB has no measured evidence', async () => {
    const memory = { get: async () => undefined };
    await expect(loadQualityEvidence(memory as never)).rejects.toThrow(/no measured quality evidence/i);
  });

  it('loads measured coverage and test pass rate from canonical AgentDB keys', async () => {
    const memory = {
      get: async (key: string) => key === 'coverage:latest'
        ? { line: 81.25 }
        : { passed: 38, failed: 2, skipped: 0 },
    };
    const evidence = await loadQualityEvidence(memory as never);
    expect(evidence.coverage).toBe(81.25);
    expect(evidence.testsPassing).toBe(95);
  });

  it('reports only measured checks and does not invent security or debt zeros', () => {
    const result = evaluateMeasuredQualityEvidence({
      coverage: 81.25,
      testsPassing: 95,
    });

    expect(result.passed).toBe(true);
    expect(result.checks.map(check => check.name)).toEqual(['coverage', 'testsPassing']);
    expect(result.checks).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'securityVulnerabilities' }),
        expect.objectContaining({ name: 'technicalDebt' }),
      ]),
    );
  });

  it('preserves pass, fail, and near-threshold warning exit codes', () => {
    const failed = evaluateMeasuredQualityEvidence({ coverage: 79.9, testsPassing: 100 });
    const warning = evaluateMeasuredQualityEvidence({ coverage: 82, testsPassing: 100 });
    const passed = evaluateMeasuredQualityEvidence({ coverage: 90, testsPassing: 100 });

    expect(getMeasuredQualityExitCode(failed)).toBe(1);
    expect(getMeasuredQualityExitCode(warning)).toBe(2);
    expect(getMeasuredQualityExitCode(passed)).toBe(0);
  });
});
