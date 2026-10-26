/**
 * #996: quality_assess MCP result mapping must surface unmeasured metrics and
 * never attach an approve RiskDecision built from missing evidence.
 */
import { describe, expect, it } from 'vitest';
// Side-effect import: domain-handler-configs participates in a circular import
// with domain-handlers, so the barrel must be initialized first.
import '../../../../src/mcp/handlers/domain-handlers';
import { qualityAssessConfig } from '../../../../src/mcp/handlers/domain-handler-configs.js';
import { validateRiskDecision } from '../../../../src/contracts/verdicts.js';

const map = (data: Record<string, unknown>) => qualityAssessConfig.mapToResult('task-1', data, 5);

describe('qualityAssessConfig.mapToResult evidence fields (#996)', () => {
  it('reports insufficient evidence instead of approving when coverage is unmeasured', () => {
    const result = map({
      qualityScore: 88, passed: false, threshold: 80,
      metrics: { coverage: -1, complexity: 1, maintainability: 80, security: -1 },
      recommendations: ['Insufficient evidence: coverage was not measured.'],
      evidenceStatus: 'insufficient-evidence', unmeasured: ['coverage'],
      gateEvaluated: false, confidence: 0.67, note: 'Static analysis only; no quality gate was evaluated.',
    });

    expect(result).toMatchObject({
      status: 'insufficient-evidence',
      passed: false,
      // No overall score without coverage; a producer's number is kept as a subset.
      qualityScore: -1,
      subsetScore: 88,
      evidenceStatus: 'insufficient-evidence',
      unmeasured: ['coverage'],
      gateEvaluated: false,
      confidence: 0.67,
      riskDecision: { decision: 'escalate' },
    });
    expect(result.riskDecision!.confidence).toBeLessThan(0.5);
    expect(validateRiskDecision(result.riskDecision).valid).toBe(true);
  });

  it('forces passed=false if a producer reports passed with unmeasured metrics', () => {
    const result = map({
      qualityScore: 88, passed: true, metrics: { coverage: -1 }, recommendations: [],
      unmeasured: ['coverage'], gateEvaluated: false,
    });

    expect(result.passed).toBe(false);
    expect(result.status).toBe('insufficient-evidence');
    expect(result.riskDecision?.decision).not.toBe('approve');
  });

  it('keeps a fully measured static pass as completed/approve and says no gate ran', () => {
    const result = map({
      qualityScore: 88, passed: true, metrics: { coverage: 90 }, recommendations: [],
      evidenceStatus: 'measured', unmeasured: [], gateEvaluated: false, confidence: 1,
      note: 'Static analysis only; no quality gate was evaluated.',
    });

    expect(result).toMatchObject({
      status: 'completed', passed: true, evidenceStatus: 'measured', unmeasured: [],
      gateEvaluated: false, riskDecision: { decision: 'approve', confidence: 0.7 },
    });
    expect(result.riskDecision!.rationale).toMatch(/no quality gate was evaluated/i);
  });

  it('blocks a measured failure while still listing unmeasured metrics (N2)', () => {
    const result = map({
      qualityScore: 60, passed: false, metrics: { coverage: 0, security: -1 }, recommendations: [],
      evidenceStatus: 'insufficient-evidence', unmeasured: ['security'], gateEvaluated: false,
      measuredFailures: [{ metric: 'coverage', value: 0, threshold: 80, direction: 'min' }],
      confidence: 0.5,
    });

    expect(result).toMatchObject({
      passed: false, unmeasured: ['security'],
      measuredFailures: [{ metric: 'coverage' }],
      riskDecision: { decision: 'block', confidence: 0.9 },
    });
  });

  it.each([
    ['a bare string', 'coverage'],
    ['an unknown name', ['coverage', 'vibes']],
    ['an empty array', []],
  ])('rejects %s as metrics in mapToPayload (N3)', (_label, metrics) => {
    expect(() => qualityAssessConfig.mapToPayload({ metrics } as never, null))
      .toThrow(/metrics must be a non-empty array of metric names/);
  });

  it('marks whether the threshold came from the request (round 2b)', () => {
    expect(qualityAssessConfig.mapToPayload({ threshold: 10 }, null))
      .toMatchObject({ threshold: 10, thresholdSource: 'request' });
    expect(qualityAssessConfig.mapToPayload({}, null))
      .toMatchObject({ threshold: 80, thresholdSource: 'default' });
  });

  it('passes a valid metrics list through mapToPayload', () => {
    expect(qualityAssessConfig.mapToPayload({ metrics: ['complexity'] }, null))
      .toMatchObject({ metrics: ['complexity'] });
  });

  it('leaves measured gate results unchanged apart from the additive fields', () => {
    const result = map({
      passed: true, checks: [], metrics: { coverage: 90 }, recommendations: [],
      evidenceStatus: 'measured', unmeasured: [], gateEvaluated: true,
    });

    expect(result).toMatchObject({
      status: 'completed', passed: true, gateEvaluated: true, riskDecision: { decision: 'approve' },
    });
    expect(result.riskDecision!.rationale).toBe('Quality gate passed');
  });
});

describe('quality_assess scope and partial evidence at the MCP boundary (#1021)', () => {
  const payload = (params: Record<string, unknown>) =>
    qualityAssessConfig.mapToPayload(params as never, undefined) as Record<string, unknown>;

  it('forwards target and sourceFiles to the handler', () => {
    expect(payload({ target: 'src/pages' })).toMatchObject({ target: 'src/pages' });
    expect(payload({ sourceFiles: ['src/a.ts'] })).toMatchObject({ sourceFiles: ['src/a.ts'] });
    expect(payload({})).not.toHaveProperty('target');
  });

  it.each([
    ['an empty target', { target: '' }],
    ['a non-string target', { target: 7 }],
    ['an empty sourceFiles list', { sourceFiles: [] }],
    ['a non-string source file', { sourceFiles: ['a.ts', 3] }],
  ])('rejects %s as caller input', (_label, params) => {
    expect(() => payload(params)).toThrow(/target must be|sourceFiles must be/);
    try { payload(params); } catch (error) {
      expect((error as { callerError?: boolean }).callerError).toBe(true);
    }
  });

  it('passes through partial metrics, excluded files and the analysed scope', () => {
    const partialMetrics = [{
      metric: 'complexity', analysedFiles: 19, totalFiles: 20, coverageOfScope: 0.95,
      failed: [{ file: 'src/broken.ts', reason: 'src/broken.ts could not be parsed (3 syntax errors)' }],
    }];
    const excludedFiles = [{ file: 'src/types.d.ts', reason: 'type declaration file' }];
    const result = map({
      qualityScore: 88, passed: true, metrics: { complexity: 2 }, recommendations: [],
      evidenceStatus: 'measured', unmeasured: [], gateEvaluated: false,
      partialMetrics, excludedFiles, excludedCount: 1, scope: '/repo/src',
    });

    expect(result).toMatchObject({ partialMetrics, excludedFiles, excludedCount: 1, scope: '/repo/src', passed: true });
  });

  it('passes through scoreBasis for a subset score (round 2b)', () => {
    const result = map({
      qualityScore: 100, passed: false, metrics: { complexity: -1, duplication: 0 }, recommendations: [],
      evidenceStatus: 'insufficient-evidence', unmeasured: ['complexity'], scoreBasis: ['duplication'],
    });

    expect(result).toMatchObject({ qualityScore: -1, subsetScore: 100, scoreBasis: ['duplication'], status: 'insufficient-evidence' });
  });
});

describe('qualityAssessConfig.mapToResult unmeasured reasons (#1011)', () => {
  it('passes through why each metric was not measured', () => {
    const reasons = { complexity: '1 of 2 file(s) could not be analysed: src/garbage.ts has binary content' };
    const result = map({
      qualityScore: -1, passed: false, metrics: { complexity: -1 }, recommendations: [],
      evidenceStatus: 'insufficient-evidence', unmeasured: ['complexity'], unmeasuredReasons: reasons,
      gateEvaluated: false,
    });

    expect(result.unmeasuredReasons).toEqual(reasons);
  });

  it('drops a malformed unmeasuredReasons value', () => {
    const result = map({
      passed: false, metrics: {}, recommendations: [], unmeasured: ['complexity'],
      unmeasuredReasons: { complexity: 7 },
    });

    expect(result.unmeasuredReasons).toBeUndefined();
  });
});
