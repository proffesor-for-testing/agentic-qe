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
  FINDING_VERDICT_SCHEMA,
  type RiskDecision,
  type FindingVerdict,
  type CoverageGap,
} from '../../../src/contracts/verdicts';

const digest = `sha256:${'a'.repeat(64)}`;
const goldenMeasurementReceipt = {
  contract: 'judge-measurement@1' as const,
  provider: 'provider-a',
  requestedModel: 'judge',
  resolvedModel: 'judge-2026-09',
  endpointClass: 'shared' as const,
  snapshotIdentity: 'L2_CONTENT_BOUND' as const,
  semantics: 'verified' as const,
  fingerprint: 'fp-1',
  requestHash: digest,
  promptHash: digest,
  configHash: digest,
  parserSchemaHash: digest,
  outputHash: digest,
  parsedVoteHash: digest,
  temperature: 0,
  topP: 1,
  seed: 7,
  deterministic: true,
  cacheStatus: 'miss' as const,
  retryCount: 0,
  timestamp: '2026-09-06T00:00:00.000Z',
  windowId: '2026-09-06',
  latencyMs: 42,
  requestId: 'request-1',
};

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

  it('should validate a well-formed measurement receipt', () => {
    const verdict = { ...goldenFindingVerdict, measurementReceipts: [goldenMeasurementReceipt] };

    expect(validateFindingVerdict(verdict)).toEqual({ valid: true, errors: [] });
  });

  it('should reject a malformed measurement receipt', () => {
    const verdict = {
      ...goldenFindingVerdict,
      measurementReceipts: [{ ...goldenMeasurementReceipt, latencyMs: -1 }],
    };

    const result = validateFindingVerdict(verdict);

    expect(result.valid).toBe(false);
    expect(result.errors.join()).toContain('measurementReceipts[0].latencyMs');
  });

  it.each([
    ['temperature', -1],
    ['topP', 1.01],
    ['seed', 1.5],
    ['seed', Number.MAX_SAFE_INTEGER + 1],
  ])('should reject an invalid receipt %s value', (field, invalidValue) => {
    const verdict = {
      ...goldenFindingVerdict,
      measurementReceipts: [{ ...goldenMeasurementReceipt, [field]: invalidValue }],
    };

    const result = validateFindingVerdict(verdict);

    expect(result.valid).toBe(false);
    expect(result.errors.join()).toContain(`measurementReceipts[0].${field}`);
  });

  it('should expose measurement receipts in the source-of-truth JSON schema', () => {
    expect(FINDING_VERDICT_SCHEMA.properties).toHaveProperty('measurementReceipts');
    const receipt = FINDING_VERDICT_SCHEMA.properties.measurementReceipts.items.properties;
    expect(receipt.temperature).toMatchObject({ minimum: 0 });
    expect(receipt.topP).toMatchObject({ minimum: 0, maximum: 1 });
    expect(receipt.seed).toMatchObject({
      type: ['integer', 'null'],
      minimum: Number.MIN_SAFE_INTEGER,
      maximum: Number.MAX_SAFE_INTEGER,
    });
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
