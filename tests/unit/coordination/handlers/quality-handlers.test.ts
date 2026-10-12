/**
 * #996: the assess-quality task handler must not approve when key metrics
 * are unmeasured (coverage -1 sentinel), and must say plainly that the
 * static-analysis path evaluates no quality gate.
 */
import { describe, expect, it, vi } from 'vitest';
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
      qualityScore: 88,
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
