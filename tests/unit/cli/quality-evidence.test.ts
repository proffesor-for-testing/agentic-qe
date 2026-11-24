import { beforeAll, describe, expect, it, vi } from 'vitest';
import { mkdtemp, readFile } from 'node:fs/promises';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
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
import { resolveQualityEvidenceCandidate } from '../../../src/domains/quality-assessment/evidence-candidate.js';

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

// #1474 re-review BLOCK: `aqe quality --gate -o <path>` must not hide real source changes.
describe('quality --gate -o registers only its own successfully written report', () => {
  function sourceProject(): string {
    const root = createGitCandidateFixture('aqe-cli-o-');
    mkdirSync(join(root, 'src'));
    writeFileSync(join(root, 'src', 'add.mjs'), 'export const add = (a, b) => a + b;\n');
    execFileSync('git', ['-c', 'user.email=f@example.invalid', '-c', 'user.name=f', 'add', '-A'], { cwd: root });
    execFileSync('git', ['-c', 'user.email=f@example.invalid', '-c', 'user.name=f', 'commit', '-qm', 's'], { cwd: root });
    vi.stubEnv('AQE_PROJECT_ROOT', root);
    return root;
  }
  async function gate(root: string, output: string) {
    const exit = vi.fn(async (_code: number) => undefined);
    const command = createQualityCommand({ kernel: { memory: { get: async () => undefined } } } as never, exit as never, async () => true);
    await command.parseAsync(['--gate', '--format', 'json', '--output', join(root, output)], { from: 'user' });
    return exit.mock.calls[0]?.[0];
  }

  it('-o src: the write fails (exit 1), nothing is registered, and an edit to src still changes the candidate', async () => {
    const root = sourceProject();
    const before = resolveQualityEvidenceCandidate(root);
    expect(await gate(root, 'src')).toBe(1);
    expect(existsSync(join(root, '.agentic-qe', 'candidate-ignore.json'))).toBe(false);
    writeFileSync(join(root, 'src', 'add.mjs'), 'export const add = (a, b) => a - b;\n');
    expect(resolveQualityEvidenceCandidate(root).id).not.toBe(before.id);
  });

  it('-o gate.json: the written report is registered and left out of later candidates', async () => {
    const root = sourceProject();
    expect(await gate(root, 'gate.json')).toBe(3);
    const after = resolveQualityEvidenceCandidate(root);
    expect(after).toMatchObject({ dirty: false, ignored: ['file:gate.json'] });
    writeFileSync(join(root, 'src', 'add.mjs'), 'export const add = () => 0;\n');
    expect(resolveQualityEvidenceCandidate(root).id).not.toBe(after.id);
  });
});
