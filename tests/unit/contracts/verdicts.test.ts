/**
 * Contract tests for verdict envelopes (ADR-103)
 *
 * Golden samples validate; mutated samples are rejected with field-level
 * errors; the quality-gate builder always emits a valid envelope.
 */

import { describe, it, expect } from 'vitest';
import {
  validateRiskDecision,
  validateFindingVerdict,
  validateCoverageGap,
  buildRiskDecisionFromQualityGate,
  type RiskDecision,
  type FindingVerdict,
  type CoverageGap,
} from '../../../src/contracts/verdicts';

const goldenRiskDecision: RiskDecision = {
  contract: 'risk-decision@1',
  decision: 'block',
  riskFactors: ['coverage below threshold', '3 critical complexity hotspots'],
  confidence: 0.9,
  rationale: 'Quality gate failed with score 61',
};

const goldenFindingVerdict: FindingVerdict = {
  contract: 'finding-verdict@1',
  id: 'find-001',
  title: 'SQL injection in report filter',
  file: 'src/reports/filter.ts',
  severity: 'critical',
  confidence: 0.85,
  evidence: ['string concatenation at filter.ts:42', 'no parameterization'],
  verdict: 'upheld',
  refutations: [],
};

const goldenCoverageGap: CoverageGap = {
  contract: 'coverage-gap@1',
  file: 'src/billing/refund.ts',
  rangeStart: 110,
  rangeEnd: 152,
  riskScore: 0.8,
  suggestedTests: ['refund over original amount', 'refund on voided invoice'],
};

describe('validateRiskDecision', () => {
  it('should accept the golden sample', () => {
    expect(validateRiskDecision(goldenRiskDecision)).toEqual({ valid: true, errors: [] });
  });

  it('should accept unknown additional fields (additive envelope)', () => {
    const result = validateRiskDecision({ ...goldenRiskDecision, futureField: 42 });

    expect(result.valid).toBe(true);
  });

  it('should reject an unknown decision value', () => {
    const result = validateRiskDecision({ ...goldenRiskDecision, decision: 'maybe' });

    expect(result.valid).toBe(false);
    expect(result.errors.join()).toContain('decision');
  });

  it('should reject confidence above 1', () => {
    const result = validateRiskDecision({ ...goldenRiskDecision, confidence: 1.2 });

    expect(result.valid).toBe(false);
    expect(result.errors.join()).toContain('confidence');
  });

  it('should reject a missing rationale', () => {
    const { rationale: _omitted, ...rest } = goldenRiskDecision;

    expect(validateRiskDecision(rest).valid).toBe(false);
  });

  it('should reject non-objects', () => {
    expect(validateRiskDecision('approve').valid).toBe(false);
    expect(validateRiskDecision(null).valid).toBe(false);
  });
});

describe('validateFindingVerdict', () => {
  it('should accept the golden sample', () => {
    expect(validateFindingVerdict(goldenFindingVerdict)).toEqual({ valid: true, errors: [] });
  });

  it('should reject a missing severity', () => {
    const { severity: _omitted, ...rest } = goldenFindingVerdict;

    const result = validateFindingVerdict(rest);

    expect(result.valid).toBe(false);
    expect(result.errors.join()).toContain('severity');
  });

  it('should reject non-array evidence', () => {
    const result = validateFindingVerdict({ ...goldenFindingVerdict, evidence: 'just one string' });

    expect(result.valid).toBe(false);
    expect(result.errors.join()).toContain('evidence');
  });

  it('should reject an unknown verdict value', () => {
    expect(validateFindingVerdict({ ...goldenFindingVerdict, verdict: 'plausible' }).valid).toBe(false);
  });
});

describe('validateCoverageGap', () => {
  it('should accept the golden sample', () => {
    expect(validateCoverageGap(goldenCoverageGap)).toEqual({ valid: true, errors: [] });
  });

  it('should accept a whole-file gap without a range', () => {
    const { rangeStart: _s, rangeEnd: _e, ...rest } = goldenCoverageGap;

    expect(validateCoverageGap(rest).valid).toBe(true);
  });

  it('should reject negative riskScore', () => {
    expect(validateCoverageGap({ ...goldenCoverageGap, riskScore: -0.1 }).valid).toBe(false);
  });

  it('should reject an inverted range', () => {
    const result = validateCoverageGap({ ...goldenCoverageGap, rangeStart: 200, rangeEnd: 100 });

    expect(result.valid).toBe(false);
    expect(result.errors.join()).toContain('rangeEnd');
  });
});

describe('buildRiskDecisionFromQualityGate', () => {
  it('should approve on a passed gate and validate', () => {
    const decision = buildRiskDecisionFromQualityGate({ passed: true, qualityScore: 92 });

    expect(decision.decision).toBe('approve');
    expect(validateRiskDecision(decision).valid).toBe(true);
  });

  it('should block on a failed gate with recommendations as risk factors', () => {
    const decision = buildRiskDecisionFromQualityGate({
      passed: false,
      qualityScore: 61,
      recommendations: ['raise branch coverage'],
    });

    expect(decision.decision).toBe('block');
    expect(decision.riskFactors).toEqual(['raise branch coverage']);
    expect(validateRiskDecision(decision).valid).toBe(true);
  });

  it('should escalate when the gate outcome is indeterminate', () => {
    const decision = buildRiskDecisionFromQualityGate({});

    expect(decision.decision).toBe('escalate');
    expect(decision.confidence).toBe(0.5);
    expect(validateRiskDecision(decision).valid).toBe(true);
  });
});
