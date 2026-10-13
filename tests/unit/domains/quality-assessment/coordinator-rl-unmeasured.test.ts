/**
 * #1002: the -1 "unmeasured" sentinel must never reach a learner as a number,
 * and insufficient-evidence runs must not become success/failure patterns.
 */
import { describe, expect, it, vi } from 'vitest';
import {
  createMetricsEmbedding,
  enhanceWithSimilarityPatterns,
  hasUnmeasuredGateMetrics,
  isInsufficientQualityReport,
  maskedScoreFeatures,
  storeQualityAnalysisPattern,
  storeQualityPattern,
  trainActorCritic,
  tuneThresholdsWithRL,
} from '../../../../src/domains/quality-assessment/coordinator-rl-integration';
import type {
  GateEvaluationRequest,
  GateResult,
  QualityAnalysisRequest,
  QualityReport,
} from '../../../../src/domains/quality-assessment/interfaces';

function report(overrides: Partial<QualityReport> = {}): QualityReport {
  return {
    score: { overall: 82, coverage: -1, complexity: 2, maintainability: 70, security: -1 },
    metrics: [
      { name: 'complexity', value: 2, rating: 'A', trend: 'stable' },
      { name: 'maintainability', value: 70, rating: 'C', trend: 'stable' },
    ],
    trends: [],
    recommendations: [],
    unmeasured: [],
    ...overrides,
  };
}

const request: QualityAnalysisRequest = { sourceFiles: ['a.ts'], includeMetrics: ['complexity', 'maintainability'] };

function sona() {
  return {
    createPattern: vi.fn(),
    adaptPattern: vi.fn(async () => ({ success: false })),
  };
}

const gateRequest = (coverage: number): GateEvaluationRequest => ({
  gateName: 'g',
  metrics: {
    coverage, testsPassing: 100, criticalBugs: 0, codeSmells: 3,
    securityVulnerabilities: 0, technicalDebt: 1, duplications: 2,
  },
  thresholds: { coverage: { min: 80 } },
});
const gateResult: GateResult = { gateName: 'g', passed: true, checks: [], overallScore: 95, failedChecks: [] };

describe('quality learning ignores unmeasured values (#1002)', () => {
  it('masks -1 score fields to 0 and adds presence flags', () => {
    const features = maskedScoreFeatures(report().score, 100);
    expect(features.every((f) => f >= 0)).toBe(true);
    // overall, coverage, complexity, maintainability, security, then one presence flag each
    expect(features).toEqual([0.82, 0, 0.02, 0.7, 0, 1, 0, 1, 1, 0]);
  });

  it('never puts a negative value in the metrics embedding (security/100 was -0.01)', () => {
    const embedding = Array.from(createMetricsEmbedding(report()));
    expect(embedding.some((v) => v < 0)).toBe(false);
  });

  it('flags a report with unmeasured metrics as insufficient', () => {
    expect(isInsufficientQualityReport(report({ unmeasured: [{ metric: 'complexity', reason: 'x' }] }))).toBe(true);
    expect(isInsufficientQualityReport(report({ score: { ...report().score, overall: -1 } }))).toBe(true);
    expect(isInsufficientQualityReport(report())).toBe(false);
  });

  it('does not store an insufficient-evidence analysis as a pattern', async () => {
    const qesona = sona();
    await storeQualityAnalysisPattern(
      qesona as never, request, report({ unmeasured: [{ metric: 'complexity', reason: 'unparseable' }] }), 'quality-assessment',
    );
    expect(qesona.createPattern).not.toHaveBeenCalled();
  });

  it('stores a measured analysis with masked features and the unmeasured score fields named', async () => {
    const qesona = sona();
    await storeQualityAnalysisPattern(qesona as never, request, report(), 'quality-assessment');
    expect(qesona.createPattern).toHaveBeenCalledTimes(1);
    const [state, , outcome, , , metadata] = qesona.createPattern.mock.calls[0];
    expect(state.features.some((f: number) => f < 0)).toBe(false);
    expect(outcome.success).toBe(true);
    expect(metadata.unmeasuredScoreFields).toEqual(['coverage', 'security']);
  });

  it('does not search similar patterns with -1 features', async () => {
    const qesona = sona();
    await enhanceWithSimilarityPatterns(report(), {} as never, qesona as never, 'quality-assessment');
    const [state] = qesona.adaptPattern.mock.calls[0];
    expect(state.features.some((f: number) => f < 0)).toBe(false);
  });

  describe('gate learning', () => {
    it('detects unmeasured gate metrics', () => {
      expect(hasUnmeasuredGateMetrics(gateRequest(-1).metrics)).toBe(true);
      expect(hasUnmeasuredGateMetrics(gateRequest(Number.NaN).metrics)).toBe(true);
      expect(hasUnmeasuredGateMetrics(gateRequest(90).metrics)).toBe(false);
    });

    it('does not store a gate pattern from unmeasured metrics', async () => {
      const qesona = sona();
      await storeQualityPattern(qesona as never, gateRequest(-1), gateResult, 'quality-assessment');
      expect(qesona.createPattern).not.toHaveBeenCalled();
    });

    it('does not train the actor-critic on unmeasured metrics', async () => {
      const actorCritic = { train: vi.fn(), predict: vi.fn() };
      await trainActorCritic(actorCritic as never, gateRequest(-1), gateResult);
      expect(actorCritic.train).not.toHaveBeenCalled();
    });

    it('does not tune thresholds from unmeasured metrics', async () => {
      const actorCritic = { train: vi.fn(), predict: vi.fn() };
      expect(await tuneThresholdsWithRL(actorCritic as never, gateRequest(-1).metrics)).toBeNull();
      expect(actorCritic.predict).not.toHaveBeenCalled();
    });

    it('still learns from fully measured gate metrics', async () => {
      const qesona = sona();
      const actorCritic = { train: vi.fn(), predict: vi.fn() };
      await storeQualityPattern(qesona as never, gateRequest(90), gateResult, 'quality-assessment');
      await trainActorCritic(actorCritic as never, gateRequest(90), gateResult);
      expect(qesona.createPattern).toHaveBeenCalledTimes(1);
      expect(actorCritic.train).toHaveBeenCalledTimes(1);
    });
  });
});
