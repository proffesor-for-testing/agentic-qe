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
      qualityScore: 88,
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
      gateEvaluated: false, riskDecision: { decision: 'approve' },
    });
    expect(result.riskDecision!.rationale).toMatch(/no quality gate was evaluated/i);
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
