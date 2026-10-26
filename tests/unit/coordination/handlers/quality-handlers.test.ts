/**
 * #996: the assess-quality task handler must not approve when key metrics
 * are unmeasured (coverage -1 sentinel), and must say plainly that the
 * static-analysis path evaluates no quality gate.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdir, mkdtemp, realpath, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ok } from '../../../../src/shared/types/index.js';
import { registerQualityHandlers } from '../../../../src/coordination/handlers/quality-handlers.js';
import type {
  InstanceTaskHandler,
  TaskHandlerContext,
} from '../../../../src/coordination/handlers/handler-types.js';
import type { QueenTask } from '../../../../src/coordination/queen-coordinator.js';

interface MetricDetail { name: string; value: number }

function report(metrics: MetricDetail[], overall: number, coverage = -1) {
  return {
    score: { overall, coverage, complexity: 1, maintainability: 80, security: -1 },
    metrics: metrics.map(m => ({ ...m, rating: 'A', trend: 'stable' })),
    trends: [],
    recommendations: [],
  };
}

function setup(analysis: ReturnType<typeof report>, memoryGet = vi.fn(async () => undefined)) {
  let handler: InstanceTaskHandler | undefined;
  const analyzeQuality = vi.fn(async () => ok(analysis));
  const ctx = {
    registerHandler: (_type: string, h: InstanceTaskHandler) => { handler = h; },
    memory: { get: memoryGet },
    getQualityAnalyzer: () => ({ analyzeQuality }),
  } as unknown as TaskHandlerContext;
  registerQualityHandlers(ctx);
  const run = (payload: Record<string, unknown>) =>
    handler!({ id: 't1', type: 'assess-quality', payload } as unknown as QueenTask);
  return { run, analyzeQuality };
}

type Data = Record<string, unknown> & {
  passed: boolean; unmeasured: string[]; recommendations: string[]; metrics: Record<string, number>;
};

describe('assess-quality measured-failure thresholds (#996 round 2b)', () => {
  const coverage50 = () => report([
    { name: 'coverage', value: 50 }, { name: 'complexity', value: 1 }, { name: 'maintainability', value: 80 },
  ], 75, 50);
  const metrics = ['coverage', 'complexity', 'maintainability'];
  let dir: string;
  let cwd: ReturnType<typeof vi.spyOn>;

  beforeEach(async () => {
    // A directory with no .aqe-ci.yml anywhere above it would be ideal; a fresh
    // temp dir plus an explicit config file (where needed) keeps the test hermetic.
    dir = await mkdtemp(join(tmpdir(), 'aqe-996-thresholds-'));
    cwd = vi.spyOn(process, 'cwd').mockReturnValue(dir);
  });
  afterEach(() => cwd.mockRestore());

  it('does not block coverage 50 when the request threshold is 10', async () => {
    const { run } = setup(coverage50());

    const result = await run({ runGate: false, threshold: 10, thresholdSource: 'request',
      sourceFiles: ['src/a.ts'], metrics });

    expect((result as { value: Data }).value).toMatchObject({ passed: true, measuredFailures: [] });
  });

  it('blocks coverage 50 against the default 80 when no threshold was given', async () => {
    const { run } = setup(coverage50());

    const result = await run({ runGate: false, threshold: 80, thresholdSource: 'default',
      sourceFiles: ['src/a.ts'], metrics });

    expect((result as { value: Data }).value).toMatchObject({
      passed: false, measuredFailures: [{ metric: 'coverage', value: 50, threshold: 80 }],
    });
  });

  it('uses the user-configured gate coverage threshold when the request gives none', async () => {
    await writeFile(join(dir, '.aqe-ci.yml'), 'version: "1"\nquality_gate:\n  thresholds:\n    coverage: 40\n');
    const { run } = setup(coverage50());

    const result = await run({ runGate: false, threshold: 80, thresholdSource: 'default',
      sourceFiles: ['src/a.ts'], metrics });

    expect((result as { value: Data }).value).toMatchObject({ measuredFailures: [] });
  });

  it('lets the request threshold win over the configured one', async () => {
    await writeFile(join(dir, '.aqe-ci.yml'), 'version: "1"\nquality_gate:\n  thresholds:\n    coverage: 40\n');
    const { run } = setup(coverage50());

    const result = await run({ runGate: false, threshold: 60, thresholdSource: 'request',
      sourceFiles: ['src/a.ts'], metrics });

    expect((result as { value: Data }).value).toMatchObject({
      passed: false, measuredFailures: [{ metric: 'coverage', threshold: 60 }],
    });
  });

  it.each([150, -1, Number.NaN])('rejects request threshold %s as caller input', async (threshold) => {
    const { run, analyzeQuality } = setup(coverage50());

    const result = await run({ runGate: false, threshold, thresholdSource: 'request',
      sourceFiles: ['src/a.ts'], metrics });

    expect(result.success).toBe(false);
    expect((result as { error: Error & { callerError?: boolean } }).error).toMatchObject({
      message: 'threshold must be a finite number between 0 and 100.', callerError: true,
    });
    expect(analyzeQuality).not.toHaveBeenCalled();
  });
});

describe('assess-quality handler evidence sufficiency (#996)', () => {
  it('does not pass when coverage is -1 (unmeasured), even with a high static score', async () => {
    const { run } = setup(report(
      [{ name: 'complexity', value: 1 }, { name: 'maintainability', value: 80 }], 88,
    ));

    const result = await run({ runGate: false, threshold: 80, sourceFiles: ['src/a.ts'],
      metrics: ['coverage', 'complexity', 'maintainability'] });

    expect(result.success).toBe(true);
    const data = (result as { value: Data }).value;
    expect(data).toMatchObject({
      // No overall score without coverage (-1, as the gate since #1223); the
      // static score over the measured metrics is kept as a labelled subset.
      qualityScore: -1,
      qualityScoreReason: 'not computed: coverage unmeasured',
      subsetScore: 88,
      passed: false,
      evidenceStatus: 'insufficient-evidence',
      unmeasured: ['coverage'],
      gateEvaluated: false,
      confidence: 0.67,
    });
    expect(data.metrics.coverage).toBe(-1);
    expect(data.note).toMatch(/no quality gate was evaluated/i);
    // N6: the recommendation names what to run for the missing metric.
    expect(data.recommendations[0]).toMatch(/insufficient evidence: coverage not measured — run the tests with coverage/i);
  });

  it('blocks on a measured failing metric even when another is unmeasured (N2)', async () => {
    const { run } = setup(report(
      [{ name: 'coverage', value: 0 }, { name: 'complexity', value: 1 }, { name: 'maintainability', value: 80 }],
      60, 0,
    ));

    const result = await run({ runGate: false, threshold: 80, sourceFiles: ['src/a.ts'],
      metrics: ['coverage', 'complexity', 'security'] });

    const data = (result as { value: Data }).value;
    expect(data).toMatchObject({
      passed: false,
      unmeasured: ['security'],
      measuredFailures: [{ metric: 'coverage', value: 0, threshold: 80, direction: 'min' }],
    });
    expect(data.recommendations[0]).toBe('coverage measured at 0 fails its threshold (at least 80).');
    expect(data.recommendations[1]).toMatch(/security not measured — static analysis never measures security/);
  });

  it.each([
    ['a bare string', 'coverage'],
    ['an unknown name', ['coverage', 'vibes']],
  ])('rejects %s as metrics with a caller validation error (N3)', async (_label, metrics) => {
    const { run, analyzeQuality } = setup(report([], 0));

    const result = await run({ runGate: false, threshold: 80, sourceFiles: ['src/a.ts'], metrics });

    expect(result.success).toBe(false);
    const error = (result as { error: Error & { callerError?: boolean } }).error;
    expect(error.message).toMatch(/metrics must be a non-empty array of metric names/);
    expect(error.callerError).toBe(true);
    expect(analyzeQuality).not.toHaveBeenCalled();
  });

  it('keeps the verdict unchanged when every requested metric is measured', async () => {
    const { run } = setup(report([
      { name: 'coverage', value: 90 }, { name: 'complexity', value: 1 },
      { name: 'maintainability', value: 80 },
    ], 88, 90));

    const result = await run({ runGate: false, threshold: 80, sourceFiles: ['src/a.ts'],
      metrics: ['coverage', 'complexity', 'maintainability'] });

    const data = (result as { value: Data }).value;
    expect(data).toMatchObject({
      qualityScore: 88, passed: true, evidenceStatus: 'measured', unmeasured: [],
      gateEvaluated: false, confidence: 1,
    });
    expect(data.note).toMatch(/no quality gate was evaluated/i);
  });

  it('still fails a fully measured run that scores below threshold', async () => {
    const { run } = setup(report([
      { name: 'coverage', value: 40 }, { name: 'complexity', value: 30 },
      { name: 'maintainability', value: 40 },
    ], 45, 40));

    const result = await run({ runGate: false, threshold: 80, sourceFiles: ['src/a.ts'],
      metrics: ['coverage', 'complexity', 'maintainability'] });

    expect((result as { value: Data }).value).toMatchObject({
      passed: false, evidenceStatus: 'measured', unmeasured: [],
    });
  });

  it('lists only the missing metrics for partial evidence', async () => {
    const { run } = setup(report([{ name: 'complexity', value: 2 }], 95));

    const result = await run({ runGate: false, threshold: 80, sourceFiles: ['src/a.ts'],
      metrics: ['coverage', 'complexity', 'maintainability'] });

    const data = (result as { value: Data }).value;
    expect(data.passed).toBe(false);
    expect(data.unmeasured).toEqual(['coverage', 'maintainability']);
    expect(data.confidence).toBe(0.33);
  });

  it('does not judge metrics the caller did not request', async () => {
    const { run } = setup(report(
      [{ name: 'complexity', value: 1 }, { name: 'maintainability', value: 80 }], 88,
    ));

    const result = await run({ runGate: false, threshold: 80, sourceFiles: ['src/a.ts'],
      metrics: ['complexity', 'maintainability'] });

    expect((result as { value: Data }).value).toMatchObject({
      passed: true, evidenceStatus: 'measured', unmeasured: [],
    });
  });

  it('does not emit the placeholder security score as a measured value', async () => {
    const { run } = setup(report([{ name: 'complexity', value: 1 }], 88));

    const result = await run({ runGate: false, threshold: 80, sourceFiles: ['src/a.ts'],
      metrics: ['complexity'] });

    expect((result as { value: Data }).value.metrics.security).toBe(-1);
  });

  it('fails closed with runGate true when measured coverage evidence is missing', async () => {
    const { run, analyzeQuality } = setup(report([{ name: 'complexity', value: 1 }], 88));

    const result = await run({ runGate: true, threshold: 80, metrics: ['coverage'] });

    expect(result.success).toBe(false);
    const error = (result as { error: Error & { unmeasured?: string[]; toDetails?: () => unknown } }).error;
    expect(error.message).toMatch(/no measured quality evidence found for coverage/i);
    // N4/N5: the failure carries the shared insufficient-evidence details.
    expect(error.unmeasured).toEqual([
      'coverage', 'testsPassing', 'criticalBugs', 'codeSmells',
      'securityVulnerabilities', 'technicalDebt', 'duplications',
    ]);
    expect(error.toDetails?.()).toMatchObject({
      passed: false, status: 'insufficient-evidence', gateEvaluated: false,
    });
    // A static score must never stand in for the missing gate evidence.
    expect(analyzeQuality).not.toHaveBeenCalled();
  });

  it('marks a measured gate run as gate-evaluated', async () => {
    const now = new Date().toISOString();
    const values: Record<string, number> = {
      coverage: 90, testsPassing: 100, criticalBugs: 0, codeSmells: 10,
      securityVulnerabilities: 0, technicalDebt: 2, duplications: 3,
    };
    const memoryGet = vi.fn(async (key: string) => {
      const metric = key.split(':')[1];
      return { schemaVersion: 1, metric, value: values[metric], measuredAt: now, source: 'test' };
    });
    const { run } = setup(report([], 0), memoryGet as never);

    const result = await run({ runGate: true, threshold: 80 });

    expect((result as { value: Data }).value).toMatchObject({
      passed: true, gateEvaluated: true, evidenceStatus: 'measured', unmeasured: [],
    });
  });
});

describe('assess-quality scopes analysis to target / sourceFiles inside the project root (#1021 B2)', () => {
  let root: string;
  let outside: string;
  const measured = () => report([{ name: 'complexity', value: 2 }], 90);

  beforeEach(async () => {
    root = await realpath(await mkdtemp(join(tmpdir(), 'aqe-1021-root-')));
    outside = await realpath(await mkdtemp(join(tmpdir(), 'aqe-1021-outside-')));
    await mkdir(join(root, 'src', 'pages'), { recursive: true });
    await mkdir(join(root, 'lib'), { recursive: true });
    await writeFile(join(root, 'src', 'a.ts'), 'export const a = 1;\n');
    await writeFile(join(root, 'src', 'pages', '[...slug].tsx'), 'export default function P() { return null; }\n');
    await writeFile(join(root, 'lib', 'b.ts'), 'export const b = 2;\n');
    await writeFile(join(outside, 'secret.ts'), 'export const s = 1;\n');
    vi.stubEnv('AQE_PROJECT_ROOT', root);
  });
  afterEach(async () => {
    vi.unstubAllEnvs();
    await rm(root, { recursive: true, force: true });
    await rm(outside, { recursive: true, force: true });
  });

  const callArgs = (analyzeQuality: ReturnType<typeof vi.fn>) =>
    analyzeQuality.mock.calls[0][0] as { sourceFiles: string[]; explicitFiles?: string[] };

  it('analyses only the target directory', async () => {
    const { run, analyzeQuality } = setup(measured());

    await run({ runGate: false, threshold: 80, target: 'lib', metrics: ['complexity'] });

    expect(callArgs(analyzeQuality).sourceFiles).toEqual([join(root, 'lib', 'b.ts')]);
    expect(callArgs(analyzeQuality).explicitFiles).toEqual([]);
  });

  it('resolves against AQE_PROJECT_ROOT, not the process cwd (#1021 round 2b)', async () => {
    const cwd = vi.spyOn(process, 'cwd').mockReturnValue(outside);
    try {
      const { run, analyzeQuality } = setup(measured());

      await run({ runGate: false, threshold: 80, target: 'lib', metrics: ['complexity'] });

      expect(callArgs(analyzeQuality).sourceFiles).toEqual([join(root, 'lib', 'b.ts')]);
    } finally {
      cwd.mockRestore();
    }
  });

  it('treats a file target as an explicit file', async () => {
    const { run, analyzeQuality } = setup(measured());

    await run({ runGate: false, threshold: 80, target: 'src/pages/[...slug].tsx', metrics: ['complexity'] });

    const file = join(root, 'src', 'pages', '[...slug].tsx');
    expect(callArgs(analyzeQuality)).toMatchObject({ sourceFiles: [file], explicitFiles: [file] });
  });

  it('resolves sourceFiles against the root and marks them explicit', async () => {
    const { run, analyzeQuality } = setup(measured());

    await run({ runGate: false, threshold: 80, sourceFiles: ['src/a.ts'], metrics: ['complexity'] });

    const file = join(root, 'src', 'a.ts');
    expect(callArgs(analyzeQuality)).toMatchObject({ sourceFiles: [file], explicitFiles: [file] });
  });

  it.each([
    ['a ../ target', { target: '../' }],
    ['an absolute target outside the root', { target: '/etc' }],
    ['a sourceFile outside the root', { sourceFiles: ['src/a.ts', '/etc/passwd'] }],
  ])('rejects %s as caller input', async (_label, scope) => {
    const { run, analyzeQuality } = setup(measured());

    const result = await run({ runGate: false, threshold: 80, metrics: ['complexity'], ...scope });

    expect(result.success).toBe(false);
    expect((result as { error: Error & { callerError?: boolean } }).error).toMatchObject({
      message: expect.stringMatching(/outside the project root/), callerError: true,
    });
    expect(analyzeQuality).not.toHaveBeenCalled();
  });

  it('rejects a target symlink that escapes the root', async () => {
    await symlink(outside, join(root, 'escape'));
    const { run, analyzeQuality } = setup(measured());

    const result = await run({ runGate: false, threshold: 80, target: 'escape', metrics: ['complexity'] });

    expect(result.success).toBe(false);
    expect((result as { error: Error }).error.message).toMatch(/outside the project root/);
    expect(analyzeQuality).not.toHaveBeenCalled();
  });

  it('rejects a target that does not exist', async () => {
    const { run, analyzeQuality } = setup(measured());

    const result = await run({ runGate: false, threshold: 80, target: 'nope', metrics: ['complexity'] });

    expect(result.success).toBe(false);
    expect((result as { error: Error & { callerError?: boolean } }).error).toMatchObject({
      message: expect.stringMatching(/does not exist/), callerError: true,
    });
    expect(analyzeQuality).not.toHaveBeenCalled();
  });

  it('reports partial metrics and excluded files without blocking a measured verdict', async () => {
    const analysis = {
      ...report([{ name: 'complexity', value: 2 }], 90),
      excluded: [{ file: 'src/types.d.ts', reason: 'src/types.d.ts: type declaration file' }],
      partial: [{
        metric: 'complexity', analysedFiles: 19, totalFiles: 20, coverageOfScope: 0.95,
        failed: [{ file: 'src/broken.ts', reason: 'src/broken.ts could not be parsed (3 syntax errors)' }],
      }],
    };
    const { run } = setup(analysis as ReturnType<typeof report>);

    const result = await run({ runGate: false, threshold: 80, target: 'src', metrics: ['complexity'] });

    const data = (result as { value: Data & Record<string, unknown> }).value;
    expect(data).toMatchObject({
      passed: true, evidenceStatus: 'measured',
      partialMetrics: analysis.partial,
      excludedFiles: analysis.excluded, excludedCount: 1,
    });
    expect(data.recommendations.some((r) => /complexity measured over 19 of 20 file\(s\) \(95%\)/.test(r))).toBe(true);
    expect(data.recommendations.some((r) => r.includes('not analysed: src/broken.ts could not be parsed'))).toBe(true);
  });
});

describe('assess-quality labels a subset score (#1021 round 2b)', () => {
  type Basis = Data & { scoreBasis?: string[] };

  it('names the metrics behind the score when evidence is insufficient', async () => {
    const { run } = setup(report([{ name: 'duplication', value: 0 }], 100));

    const result = await run({ runGate: false, threshold: 80, sourceFiles: ['src/a.ts'],
      metrics: ['complexity', 'duplication'] });

    expect((result as { value: Basis }).value).toMatchObject({
      evidenceStatus: 'insufficient-evidence', qualityScore: -1, subsetScore: 100, scoreBasis: ['duplication'],
    });
  });

  it('names the metrics behind the score when a metric is partial', async () => {
    const analysis = {
      ...report([{ name: 'complexity', value: 2 }], 90),
      partial: [{ metric: 'complexity', analysedFiles: 19, totalFiles: 20, coverageOfScope: 0.95, failed: [] }],
    };
    const { run } = setup(analysis as ReturnType<typeof report>);

    const result = await run({ runGate: false, threshold: 80, sourceFiles: ['src/a.ts'], metrics: ['complexity'] });

    expect((result as { value: Basis }).value.scoreBasis).toEqual(['complexity']);
  });

  it('omits scoreBasis for a fully measured run', async () => {
    const { run } = setup(report([{ name: 'complexity', value: 2 }], 90));

    const result = await run({ runGate: false, threshold: 80, sourceFiles: ['src/a.ts'], metrics: ['complexity'] });

    expect((result as { value: Basis }).value).not.toHaveProperty('scoreBasis');
  });
});

describe('assess-quality reports why metrics were not measured (#1011)', () => {
  const garbage = '1 of 2 file(s) could not be analysed: src/garbage.ts has binary content';

  it('reports -1 for every requested unmeasured metric and names the reason', async () => {
    const analysis = {
      ...report([{ name: 'coverage', value: 90 }], -1, 90),
      unmeasured: ['complexity', 'testability', 'duplication']
        .map((metric) => ({ metric, reason: garbage, files: ['src/garbage.ts'] })),
    };
    const { run } = setup(analysis as ReturnType<typeof report>);

    const result = await run({ runGate: false, threshold: 80, sourceFiles: ['src/a.ts'],
      metrics: ['coverage', 'complexity', 'testability', 'duplication'] });

    const data = (result as { value: Data & { unmeasuredReasons: Record<string, string> } }).value;
    expect(data).toMatchObject({
      passed: false, evidenceStatus: 'insufficient-evidence',
      unmeasured: ['complexity', 'testability', 'duplication'],
      qualityScore: -1,
    });
    expect(data.metrics).toMatchObject({ coverage: 90, complexity: -1, testability: -1, duplication: -1 });
    expect(data.unmeasuredReasons.complexity).toBe(garbage);
    expect(data.unmeasuredReasons.duplication).toBe(garbage);
  });

  it('explains that security is never measured statically', async () => {
    const { run } = setup(report([{ name: 'complexity', value: 1 }], 88));

    const result = await run({ runGate: false, threshold: 80, sourceFiles: ['src/a.ts'],
      metrics: ['complexity', 'security'] });

    const data = (result as { value: Data & { unmeasuredReasons: Record<string, string> } }).value;
    expect(data.unmeasuredReasons.security).toMatch(/static analysis never measures security/i);
  });
});
