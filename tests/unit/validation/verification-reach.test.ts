import { describe, expect, it } from 'vitest';
import {
  createVerificationReachManifest,
  evaluateVerificationReach,
  type FailureModeRequirement,
  type VerificationReach,
} from '../../../src/validation/verification-reach.js';

const target = {
  revision: 'abc123',
  digest: 'sha256:artifact',
  environment: 'ci-linux-x64',
};

function check(overrides: Partial<VerificationReach> = {}): VerificationReach {
  return {
    checkId: 'boot-probe',
    channel: 'runtime',
    reach: 'direct',
    evidenceClass: 'EXECUTED',
    executionStatus: 'passed',
    target,
    oracleRef: 'process-exit-and-health-response',
    observedAt: '2026-09-06T10:00:00.000Z',
    limitations: ['does not exercise concurrent requests'],
    ...overrides,
  };
}

function risk(overrides: Partial<FailureModeRequirement> = {}): FailureModeRequirement {
  return {
    riskId: 'service-does-not-start',
    failureMode: 'service does not start',
    severity: 'critical',
    requiredOracle: 'process-exit-and-health-response',
    requiredObservations: ['runtime'],
    checks: [check()],
    dispositionWhenUncovered: 'fail',
    ...overrides,
  };
}

function evaluate(risks: FailureModeRequirement[]) {
  const manifest = createVerificationReachManifest({
    id: 'release-gate-v1',
    systemUnderTest: 'agentic-qe',
    artifact: target,
    risks,
    generatedAt: '2026-09-06T09:00:00.000Z',
    expiresAt: '2026-09-07T09:00:00.000Z',
  });
  return evaluateVerificationReach(manifest, { now: new Date('2026-09-06T11:00:00.000Z') });
}

describe('verification reach', () => {
  it('passes a risk only when direct executed evidence covers its channel and oracle', () => {
    const result = evaluate([risk()]);

    expect(result.coverageVerdict).toBe('pass');
    expect(result.risks[0]).toMatchObject({
      riskId: 'service-does-not-start',
      verdict: 'pass',
      directCheckIds: ['boot-probe'],
    });
  });

  it('keeps concurrency inconclusive when a boot probe has only partial reach', () => {
    const result = evaluate([risk({
      riskId: 'concurrent-write-loss',
      failureMode: 'concurrent writes are lost',
      requiredOracle: 'linearizability-oracle',
      checks: [check({ reach: 'partial' })],
      dispositionWhenUncovered: 'inconclusive',
    })]);

    expect(result.coverageVerdict).toBe('inconclusive');
    expect(result.risks[0]).toMatchObject({
      verdict: 'inconclusive',
      partialCheckIds: ['boot-probe'],
      directCheckIds: [],
    });
  });

  it('does not let screenshot evidence satisfy an API performance risk', () => {
    const result = evaluate([risk({
      riskId: 'scroll-budget',
      requiredOracle: 'p95-frame-budget',
      requiredObservations: ['browser', 'telemetry'],
      checks: [check({
        checkId: 'screenshot',
        channel: 'browser',
        oracleRef: 'visual-overlap-oracle',
      })],
      dispositionWhenUncovered: 'human-review',
    })]);

    expect(result.coverageVerdict).toBe('human-review');
    expect(result.risks[0].uncoveredObservations).toEqual(['browser', 'telemetry']);
  });

  it.each([
    ['wrong revision', check({ target: { ...target, revision: 'other' } })],
    ['stale evidence', check({ observedAt: '2026-09-05T08:00:00.000Z' })],
    ['future evidence', check({ observedAt: '2026-09-07T08:00:00.000Z' })],
    ['static evidence', check({ channel: 'static', evidenceClass: 'STATIC' })],
    ['non-executed evidence', check({ executionStatus: 'not-run' })],
  ])('refuses %s rather than reporting green', (_name, evidence) => {
    const result = evaluate([risk({ checks: [evidence] })]);

    expect(result.coverageVerdict).toBe('fail');
    expect(result.risks[0].verdict).toBe('fail');
    expect(result.risks[0].directCheckIds).toEqual([]);
  });

  it('reports an applicable executed check failure as a failed risk', () => {
    const result = evaluate([risk({ checks: [check({ executionStatus: 'failed' })] })]);

    expect(result.coverageVerdict).toBe('fail');
    expect(result.risks[0].failedCheckIds).toEqual(['boot-probe']);
  });

  it('refuses otherwise-valid evidence after the manifest expires', () => {
    const manifest = createVerificationReachManifest({
      id: 'expired-reach-v1',
      systemUnderTest: 'agentic-qe',
      artifact: target,
      risks: [risk()],
      generatedAt: '2026-09-06T09:00:00.000Z',
      expiresAt: '2026-09-06T10:30:00.000Z',
    });

    const result = evaluateVerificationReach(manifest, {
      now: new Date('2026-09-06T11:00:00.000Z'),
    });

    expect(result.coverageVerdict).toBe('fail');
    expect(result.risks[0].reason).toContain('expired');
  });

  it('rejects a manifest whose revision-bound content changed after hashing', () => {
    const manifest = createVerificationReachManifest({
      id: 'release-gate-v1',
      systemUnderTest: 'agentic-qe',
      artifact: target,
      risks: [risk()],
      generatedAt: '2026-09-06T09:00:00.000Z',
    });
    manifest.artifact.revision = 'tampered';

    expect(() => evaluateVerificationReach(manifest)).toThrow(/manifestHash/);
  });
});
