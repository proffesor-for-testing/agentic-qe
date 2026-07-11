/**
 * ADR-120 — the guarantees gateReExecutes ACTUALLY provides, as property tests.
 *
 * gateReExecutes proves REPRODUCIBILITY, not correctness. This file pins the
 * four things re-execution can honestly guarantee (see ADR-120 "Threat model
 * and limits"):
 *
 *   (a) every frozen rule is DETERMINISTIC — the same sealed input yields the
 *       same verdict across repeated calls (re-execution is meaningful only if
 *       the rule is a pure function of its sealed inputs);
 *   (b) gateFingerprint is STABLE per version and DISTINCT across versions
 *       (a swapped rule ⇒ a different fingerprint ⇒ gateUnchanged catches it);
 *   (c) reExecuteGate reproduces a freshly-sealed receipt's verdict — the
 *       round-trip a legitimate promotion must survive;
 *   (d) a receipt whose recordedVerdict DISAGREES with the frozen rule fails
 *       verifyPromotion — the "lying log" (A8-EXT fake-`applied`) class it does
 *       catch.
 *
 * OUT OF SCOPE (the HIGH-4 limit): a BUGGY rule. If the rule itself encodes the
 * wrong acceptance logic, re-executing that same wrong rule on the sealed inputs
 * reproduces the wrong verdict and every check below still passes green.
 * Re-execution guarantees the log did not lie about the rule's verdict; it does
 * NOT guarantee the rule is correct. That correctness lives elsewhere (frozen
 * anchor no-regression, the conformance parity test, rule review).
 */

import { describe, it, expect } from 'vitest';
import {
  reExecuteGate,
  reExecutePathGate,
  gateFingerprint,
  pathGateFingerprint,
  sealedHash,
  pathSealedHash,
  verifyPromotion,
  verifyPathPromotion,
  ACCEPTANCE_RULES,
  PROMOTION_PATH_RULES,
  type SealedInputs,
  type PathSealedInputs,
  type PromotionReceipt,
  type PathPromotionReceipt,
} from '../../../src/validation/gate-reexecute.js';

// --- deterministic input generation (seeded; no randomness, no network) -------

/** Seeded LCG — reproducible pseudo-random stream so the property set is fixed. */
function makeRng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

const TIERS = ['oracle:test-exec', 'judge:llm', 'proxy:structural', 'garbage-tier'];

function genSealed(rng: () => number): SealedInputs {
  return {
    candidateHeldOut: rng(),
    baselineHeldOut: rng(),
    candidateAnchorMean: rng(),
    baselineAnchorMean: rng(),
    anchorHash: 'anchor-fixed-hash',
    anchorTol: [0, 0.01, 0.05][Math.floor(rng() * 3)],
    provenanceTier: TIERS[Math.floor(rng() * TIERS.length)],
    allowJudgeTier: rng() < 0.5,
  };
}

function genPathSealed(rng: () => number): PathSealedInputs {
  return {
    provenanceTier: TIERS[Math.floor(rng() * TIERS.length)],
    allowJudgeTier: rng() < 0.5,
    reward: rng(),
    rewardThreshold: rng(),
    occurrences: Math.floor(rng() * 20),
    occurrenceThreshold: Math.floor(rng() * 20),
    successRate: rng(),
    successRateThreshold: rng(),
    withinActivityWindow: rng() < 0.5,
    insightConfidence: rng(),
    insightConfidenceThreshold: rng(),
    insightActionable: rng() < 0.5,
  };
}

const SAMPLES = 200;

// --- (a) determinism ----------------------------------------------------------

describe('(a) frozen rules are deterministic — same sealed input, same verdict', () => {
  it('should_reproduce_identical_verdict_across_repeated_calls_for_every_acceptance_rule', () => {
    const rng = makeRng(1);
    for (const version of Object.keys(ACCEPTANCE_RULES)) {
      for (let i = 0; i < SAMPLES; i++) {
        const sealed = genSealed(rng);
        const first = reExecuteGate(version, sealed);
        const second = reExecuteGate(version, sealed);
        expect(second).toEqual(first);
      }
    }
  });

  it('should_reproduce_identical_verdict_across_repeated_calls_for_every_path_rule', () => {
    const rng = makeRng(2);
    for (const version of Object.keys(PROMOTION_PATH_RULES)) {
      for (let i = 0; i < SAMPLES; i++) {
        const sealed = genPathSealed(rng);
        const first = reExecutePathGate(version, sealed);
        const second = reExecutePathGate(version, sealed);
        expect(second).toEqual(first);
      }
    }
  });
});

// --- (b) fingerprint stability + distinctness ---------------------------------

describe('(b) gateFingerprint is stable per version and distinct across versions', () => {
  it('should_return_the_same_fingerprint_on_repeated_calls_for_a_version', () => {
    for (const version of Object.keys(ACCEPTANCE_RULES)) {
      expect(gateFingerprint(version)).toBe(gateFingerprint(version));
    }
    for (const version of Object.keys(PROMOTION_PATH_RULES)) {
      expect(pathGateFingerprint(version)).toBe(pathGateFingerprint(version));
    }
  });

  it('should_give_distinct_fingerprints_to_distinct_rule_versions', () => {
    // Two registered path-rule versions must fingerprint differently, so a
    // swapped rule cannot masquerade as the version it replaced (gateUnchanged).
    const pathVersions = Object.keys(PROMOTION_PATH_RULES);
    expect(pathVersions.length).toBeGreaterThanOrEqual(2);
    const fps = pathVersions.map((v) => pathGateFingerprint(v));
    expect(new Set(fps).size).toBe(fps.length);
  });

  it('should_domain_separate_acceptance_fingerprints_from_path_fingerprints', () => {
    // Even a name collision across the two registries must not collide the hash.
    const acceptFps = Object.keys(ACCEPTANCE_RULES).map((v) => gateFingerprint(v));
    const pathFps = Object.keys(PROMOTION_PATH_RULES).map((v) => pathGateFingerprint(v));
    for (const a of acceptFps) {
      expect(pathFps).not.toContain(a);
    }
  });
});

// --- (c) round-trip: a freshly-sealed receipt re-executes to its verdict ------

describe('(c) reExecuteGate reproduces a freshly-sealed receipt round-trip', () => {
  it('should_verify_every_honestly_sealed_acceptance_receipt', () => {
    const rng = makeRng(3);
    for (let i = 0; i < SAMPLES; i++) {
      const sealed = genSealed(rng);
      // Seal honestly: record whatever the frozen rule actually says.
      const truth = reExecuteGate('accept/v1', sealed).promote ? 'promote' : 'reject';
      const receipt: PromotionReceipt = {
        ruleVersion: 'accept/v1',
        ruleFingerprint: gateFingerprint('accept/v1'),
        sealedHash: sealedHash(sealed),
        sealed,
        recordedVerdict: truth,
      };
      const v = verifyPromotion(receipt);
      expect(v.valid).toBe(true);
      expect(v.checks).toEqual({ sealIntact: true, gateUnchanged: true, gateReExecutes: true });
    }
  });

  it('should_verify_every_honestly_sealed_path_receipt', () => {
    const rng = makeRng(4);
    for (const version of Object.keys(PROMOTION_PATH_RULES)) {
      for (let i = 0; i < SAMPLES; i++) {
        const sealed = genPathSealed(rng);
        const truth = reExecutePathGate(version, sealed).promote ? 'promote' : 'reject';
        const receipt: PathPromotionReceipt = {
          ruleVersion: version,
          ruleFingerprint: pathGateFingerprint(version),
          sealedHash: pathSealedHash(sealed),
          sealed,
          recordedVerdict: truth,
        };
        expect(verifyPathPromotion(receipt).valid).toBe(true);
      }
    }
  });
});

// --- (d) the lying log it DOES catch ------------------------------------------

describe('(d) a recordedVerdict that disagrees with the rule fails verification', () => {
  it('should_fail_on_gateReExecutes_for_every_flipped_acceptance_receipt', () => {
    const rng = makeRng(5);
    for (let i = 0; i < SAMPLES; i++) {
      const sealed = genSealed(rng);
      const truth = reExecuteGate('accept/v1', sealed).promote ? 'promote' : 'reject';
      const lie: 'promote' | 'reject' = truth === 'promote' ? 'reject' : 'promote';
      // Seal honestly (intact inputs, correct fingerprint) but LOG the opposite
      // verdict — the A8-EXT lying-log class. sealIntact + gateUnchanged still
      // pass, so the failure is isolated to gateReExecutes.
      const receipt: PromotionReceipt = {
        ruleVersion: 'accept/v1',
        ruleFingerprint: gateFingerprint('accept/v1'),
        sealedHash: sealedHash(sealed),
        sealed,
        recordedVerdict: lie,
      };
      const v = verifyPromotion(receipt);
      expect(v.valid).toBe(false);
      expect(v.checks.sealIntact).toBe(true);
      expect(v.checks.gateUnchanged).toBe(true);
      expect(v.checks.gateReExecutes).toBe(false);
      expect(v.failures).toEqual(['gateReExecutes']);
    }
  });

  it('should_fail_on_gateReExecutes_for_every_flipped_path_receipt', () => {
    const rng = makeRng(6);
    for (const version of Object.keys(PROMOTION_PATH_RULES)) {
      for (let i = 0; i < SAMPLES; i++) {
        const sealed = genPathSealed(rng);
        const truth = reExecutePathGate(version, sealed).promote ? 'promote' : 'reject';
        const lie: 'promote' | 'reject' = truth === 'promote' ? 'reject' : 'promote';
        const receipt: PathPromotionReceipt = {
          ruleVersion: version,
          ruleFingerprint: pathGateFingerprint(version),
          sealedHash: pathSealedHash(sealed),
          sealed,
          recordedVerdict: lie,
        };
        const v = verifyPathPromotion(receipt);
        expect(v.valid).toBe(false);
        expect(v.checks.gateReExecutes).toBe(false);
        expect(v.failures).toEqual(['gateReExecutes']);
      }
    }
  });
});
