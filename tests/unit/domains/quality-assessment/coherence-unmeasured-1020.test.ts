/**
 * #1020: the coherence (lambda) gate never reads a missing or invalid input
 * as "none". highVulns, mediumVulns and flakyTestRatio used to fall back to 0
 * (`|| 0`), and a -1 critical count raised the security score to 1.2.
 */
import { describe, expect, it } from 'vitest';
import {
  calculateQualityLambda,
  canDeploy,
  createCoherenceGateController,
  DEFAULT_COHERENCE_GATE_POLICY,
  evaluateCoherenceGate,
  QualityTier,
  type QualityMetricsInput,
} from '../../../../src/domains/quality-assessment/coherence';
import { CoherenceGateService } from '../../../../src/domains/quality-assessment/services/coherence-gate';
import type { MemoryBackend } from '../../../../src/kernel/interfaces';

const COMPLETE: QualityMetricsInput = {
  lineCoverage: 90,
  testPassRate: 100,
  criticalVulns: 0,
  highVulns: 0,
  mediumVulns: 0,
  p95Latency: 100,
  targetLatency: 200,
  maintainabilityIndex: 90,
  flakyTestRatio: 0,
};

function memoryStub(): MemoryBackend {
  const store = new Map<string, unknown>();
  return {
    set: async (k: string, v: unknown) => { store.set(k, v); },
    get: async (k: string) => store.get(k),
    search: async () => [],
  } as unknown as MemoryBackend;
}

describe('lambda calculator with unmeasured inputs (#1020)', () => {
  it('allows a complete, healthy measurement', () => {
    expect(calculateQualityLambda(COMPLETE).unmeasured).toEqual([]);
    expect(evaluateCoherenceGate(COMPLETE).decision).toBe('allow');
  });

  it('lists omitted high/medium vulnerability counts and flaky ratio as unmeasured', () => {
    const { highVulns: _h, mediumVulns: _m, flakyTestRatio: _f, ...partial } = COMPLETE;

    const lambda = calculateQualityLambda(partial as QualityMetricsInput);

    expect(lambda.unmeasured).toEqual(['highVulns', 'mediumVulns', 'flakyTestRatio']);
    expect(lambda.dimensions.reliability).toBeUndefined();
  });

  it('keeps a measured critical-vulnerability failure conclusive without the high/medium counts', () => {
    const { highVulns: _h, mediumVulns: _m, ...partial } = COMPLETE;

    const decision = evaluateCoherenceGate({ ...partial, criticalVulns: 5 } as QualityMetricsInput);

    expect(decision.tier).toBe(QualityTier.QUARANTINE);
    expect([decision.reason, ...(decision.additionalReasons ?? [])]).toEqual(
      expect.arrayContaining(['securityCritical', 'insufficientEvidence']),
    );
  });

  it('never allows deployment while an input is unmeasured', () => {
    const { flakyTestRatio: _f, ...partial } = COMPLETE;

    const decision = evaluateCoherenceGate(partial as QualityMetricsInput);

    expect(decision.decision).not.toBe('allow');
    expect(decision.reason).toBe('insufficientEvidence');
    expect(decision.explanation).toMatch(/Not measured: flakyTestRatio/);
    expect(canDeploy(partial as QualityMetricsInput)).toBe(false);
  });

  it('does not let a -1 critical count raise security above 1', () => {
    const lambda = calculateQualityLambda({ ...COMPLETE, criticalVulns: -1 });

    expect(lambda.dimensions.security).toBeUndefined();
    expect(lambda.unmeasured).toEqual(['criticalVulns']);
  });

  it.each([
    ['lineCoverage', -1],
    ['testPassRate', Number.NaN],
    ['maintainabilityIndex', Number.POSITIVE_INFINITY],
    ['p95Latency', -1],
    ['duplicationPercent', -1],
  ] as const)('treats %s = %s as unmeasured', (input, value) => {
    const lambda = calculateQualityLambda({ ...COMPLETE, [input]: value });

    expect(lambda.unmeasured).toContain(input);
    expect(evaluateCoherenceGate({ ...COMPLETE, [input]: value }).decision).not.toBe('allow');
  });

  it('keeps unmeasured inputs blocking even when the policy allows unstable deploys', () => {
    const controller = createCoherenceGateController({
      policy: { ...DEFAULT_COHERENCE_GATE_POLICY, allowDeployWhenUnstable: true },
    });
    const { flakyTestRatio: _f, ...partial } = COMPLETE;

    expect(controller.canDeploy(calculateQualityLambda(partial as QualityMetricsInput))).toBe(false);
  });
});

describe('CoherenceGateService (#1020)', () => {
  const metrics = {
    coverage: 90, testsPassing: 100, criticalBugs: 0, codeSmells: 2,
    securityVulnerabilities: 0, technicalDebt: 1, duplications: 1,
  };

  it('does not invent latency or flaky-test data for its coherence check', () => {
    const service = new CoherenceGateService(memoryStub());

    const lambda = service.calculateLambda(metrics);

    expect(lambda.unmeasured).toEqual(['flakyTestRatio', 'p95Latency']);
    expect(lambda.dimensions.performance).toBeUndefined();
    expect(service.canDeploy(metrics)).toBe(false);
  });

  it('leaves the measured threshold verdict in charge when coherence lacks evidence', async () => {
    const service = new CoherenceGateService(memoryStub());

    const result = await service.evaluateGateWithCoherence({
      gateName: 'release',
      metrics,
      thresholds: { coverage: { min: 80 }, testsPassing: { min: 95 }, criticalBugs: { max: 0 } },
    });

    expect(result.success && result.value).toMatchObject({ passed: true, coherenceOverride: false });
    expect(result.success && result.value.tier).toBeLessThan(QualityTier.SAFE);
  });
});
