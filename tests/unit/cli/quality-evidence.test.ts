import { beforeAll, describe, expect, it, vi } from 'vitest';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  createQualityCommand,
  describeUnavailableQualityEvidence,
  evaluateMeasuredQualityEvidence,
  getMeasuredQualityExitCode,
  loadQualityEvidence,
} from '../../../src/cli/commands/quality.js';
import { qualityGateToMarkdown } from '../../../src/cli/utils/ci-output.js';
import { createGitCandidateFixture, evidenceKeyFixture } from '../../fixtures/quality-evidence-candidates.js';

// #1474: the gate resolves its candidate from the project checkout; point the
// root at a Git fixture so it resolves, and answer its candidate-bound keys.
beforeAll(() => {
  vi.stubEnv('AQE_PROJECT_ROOT', createGitCandidateFixture('aqe-cli-quality-'));
  return () => vi.unstubAllEnvs();
});

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
        const fixture = evidenceKeyFixture(key);
        return fixture?.record(passing[fixture.metric]);
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

// #996: MCP-CLI parity — missing evidence yields a structured, non-approving
// insufficient-evidence result that names the unmeasured metrics.
describe('quality command with unmeasured evidence (#996)', () => {
  const now = () => new Date().toISOString();
  const partialMemory = (present: Record<string, number>) => ({
    get: async (key: string) => {
      const fixture = evidenceKeyFixture(key);
      return fixture && fixture.metric in present
        ? fixture.record(present[fixture.metric], { measuredAt: now() })
        : undefined;
    },
  });

  it('lists every metric without measured evidence', async () => {
    const memory = partialMemory({ testsPassing: 100, criticalBugs: 0 });

    const result = await describeUnavailableQualityEvidence(
      memory as never, new Error('No measured quality evidence found for coverage.'),
    );

    expect(result).toMatchObject({
      passed: false,
      score: 'N/A',
      checks: [],
      status: 'insufficient-evidence',
      evidenceStatus: 'insufficient-evidence',
      gateEvaluated: false,
      unmeasured: ['coverage', 'codeSmells', 'securityVulnerabilities', 'technicalDebt', 'duplications'],
      error: 'No measured quality evidence found for coverage.',
    });
    // N9: insufficient evidence has its own exit code, distinct from a measured failure.
    expect(getMeasuredQualityExitCode(result)).toBe(3);
    // N6: one specific recommendation per missing metric.
    expect(result.recommendations).toContain(
      'Insufficient evidence: securityVulnerabilities not measured — a measured vulnerability count is required; '
        + 'no MCP tool or CLI command records it yet, so supply it from your own measurement.',
    );
  });

  it('names stale and malformed metrics in unmeasured, not only absent ones (N5)', async () => {
    const fresh = now();
    const stale = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
    const memory = {
      get: async (key: string) => {
        const fixture = evidenceKeyFixture(key);
        if (!fixture) return undefined;
        if (fixture.metric === 'coverage') return fixture.record(90, { measuredAt: stale });
        if (fixture.metric === 'testsPassing') return fixture.record(100, { measuredAt: undefined });
        return fixture.record(0, { measuredAt: fresh });
      },
    };

    const error = await loadQualityEvidence(memory as never).catch((e: Error) => e);
    const result = await describeUnavailableQualityEvidence(memory as never, error);

    expect(result.unmeasured).toEqual(['coverage', 'testsPassing']);
    expect(result.error).toMatch(/stale/i);
    expect(getMeasuredQualityExitCode(result)).toBe(3);
  });

  it('rethrows errors that are not about evidence', async () => {
    const memory = partialMemory({
      coverage: 90, testsPassing: 100, criticalBugs: 0, codeSmells: 1,
      securityVulnerabilities: 0, technicalDebt: 1, duplications: 1,
    });
    const boom = new Error('database is locked');

    await expect(describeUnavailableQualityEvidence(memory as never, boom)).rejects.toBe(boom);
  });

  it('emits structured JSON and exits 3 instead of a stack trace', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'aqe-996-cli-'));
    const output = join(dir, 'quality.json');
    const exit = vi.fn(async (_code: number) => undefined);
    const command = createQualityCommand(
      { kernel: { memory: partialMemory({ testsPassing: 100 }) } } as never,
      exit as never,
      async () => true,
    );

    await command.parseAsync(['--format', 'json', '--output', output], { from: 'user' });

    expect(exit).toHaveBeenCalledWith(3);
    const written = JSON.parse(await readFile(output, 'utf8'));
    expect(written).toMatchObject({
      passed: false, status: 'insufficient-evidence', gateEvaluated: false,
    });
    expect(written.unmeasured).toContain('coverage');
    expect(written.unmeasured).not.toContain('testsPassing');
  });

  it('renders insufficient evidence in markdown rather than a pass or fail table', () => {
    const md = qualityGateToMarkdown({
      passed: false, score: 'N/A', checks: [], status: 'insufficient-evidence',
      evidenceStatus: 'insufficient-evidence', unmeasured: ['coverage'], gateEvaluated: false,
    });

    expect(md).toMatch(/insufficient evidence/i);
    expect(md).toContain('coverage');
    expect(md).not.toContain('PASSED');
  });
});
