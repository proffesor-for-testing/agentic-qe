/**
 * ADR-118 accept/v1+sig — paired-bootstrap significance gate adopted from ruflo.
 * Proves the gap it closes: a within-noise held-out gain that accept/v1 PROMOTES
 * is REJECTED by accept/v1+sig. accept/v1 itself is unchanged (frozen).
 */
import { describe, it, expect } from 'vitest';
import { bootstrapDeltaCILow, pairedDeltas } from '../../../src/validation/paired-bootstrap.js';
import {
  reExecuteGate,
  gateFingerprint,
  ACCEPTANCE_RULES,
  type SealedInputs,
} from '../../../src/validation/gate-reexecute.js';

const baseSealed: SealedInputs = {
  candidateHeldOut: 0.85,
  baselineHeldOut: 0.8,
  candidateAnchorMean: 0.92,
  baselineAnchorMean: 0.9,
  anchorHash: 'e566f31a',
  anchorTol: 0.0,
  provenanceTier: 'oracle:test-exec',
};

describe('bootstrapDeltaCILow', () => {
  it('should_beDeterministic_forReplay', () => {
    const d = [0.1, 0.2, 0.15, 0.05, 0.12];
    expect(bootstrapDeltaCILow(d)).toBe(bootstrapDeltaCILow(d));
  });

  it('should_returnNegInfinity_forEmptySample', () => {
    expect(bootstrapDeltaCILow([])).toBe(-Infinity);
  });

  it('should_beAboveZero_forAConsistentPositiveGain', () => {
    expect(bootstrapDeltaCILow([0.2, 0.18, 0.22, 0.19, 0.21])).toBeGreaterThan(0);
  });

  it('should_beAtMostZero_forAZeroCenteredHighVarianceGain', () => {
    // Mean ≈ 0 with large swings — not distinguishable from noise.
    expect(bootstrapDeltaCILow([0.18, -0.18, 0.18, -0.18, 0.01])).toBeLessThanOrEqual(0);
  });

  it('pairedDeltas_should_subtractByIndex', () => {
    const d = pairedDeltas([0.7, 0.8], [0.5, 0.5]);
    expect(d[0]).toBeCloseTo(0.2, 10);
    expect(d[1]).toBeCloseTo(0.3, 10);
  });
});

describe('accept/v1+sig via reExecuteGate', () => {
  it('should_promote_when_pairedGainIsSignificant', () => {
    const sealed: SealedInputs = {
      ...baseSealed,
      candidateHeldOut: 0.85,
      baselineHeldOut: 0.8,
      candidateHeldOutSamples: [0.85, 0.86, 0.84, 0.85, 0.85],
      baselineHeldOutSamples: [0.8, 0.8, 0.8, 0.8, 0.8],
    };
    expect(reExecuteGate('accept/v1+sig', sealed).promote).toBe(true);
  });

  it('should_REJECT_aWithinNoiseGain_thatAcceptV1_PROMOTES', () => {
    // candidate mean (0.802) beats baseline (0.80) → accept/v1 promotes …
    const sealed: SealedInputs = {
      ...baseSealed,
      candidateHeldOut: 0.802,
      baselineHeldOut: 0.8,
      candidateHeldOutSamples: [0.98, 0.62, 0.98, 0.62, 0.81],
      baselineHeldOutSamples: [0.8, 0.8, 0.8, 0.8, 0.8],
    };
    // … but the paired gain is within noise → accept/v1+sig rejects. THIS is the gap.
    expect(reExecuteGate('accept/v1', sealed).promote).toBe(true);
    const sig = reExecuteGate('accept/v1+sig', sealed);
    expect(sig.promote).toBe(false);
    expect(sig.reason).toMatch(/significan/i);
  });

  it('should_failClosed_whenPairedSamplesAreMissing', () => {
    const sig = reExecuteGate('accept/v1+sig', baseSealed); // no samples
    expect(sig.promote).toBe(false);
    expect(sig.reason).toMatch(/missing|mismatched/i);
  });

  it('should_failClosed_whenSampleVectorsMismatchInLength', () => {
    const sealed: SealedInputs = {
      ...baseSealed,
      candidateHeldOutSamples: [0.85, 0.86],
      baselineHeldOutSamples: [0.8],
    };
    expect(reExecuteGate('accept/v1+sig', sealed).promote).toBe(false);
  });

  it('should_shortCircuitToAcceptV1_whenBaseConditionsFail', () => {
    const sealed: SealedInputs = {
      ...baseSealed,
      provenanceTier: 'proxy:structural', // accept/v1 already rejects this
      candidateHeldOutSamples: [0.85, 0.86, 0.84],
      baselineHeldOutSamples: [0.8, 0.8, 0.8],
    };
    const sig = reExecuteGate('accept/v1+sig', sealed);
    expect(sig.promote).toBe(false);
    expect(sig.reason).toMatch(/tier/);
  });
});

describe('accept/v1+sig registration', () => {
  it('should_beRegistered_alongsideFrozenV1', () => {
    expect(Object.keys(ACCEPTANCE_RULES).sort()).toEqual(['accept/v1', 'accept/v1+sig']);
  });

  it('should_haveADistinctFingerprint', () => {
    expect(gateFingerprint('accept/v1+sig')).not.toBe(gateFingerprint('accept/v1'));
  });
});
