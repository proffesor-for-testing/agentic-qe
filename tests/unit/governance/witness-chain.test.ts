/**
 * Unit tests for governance/witness-chain.ts
 *
 * Tests: append witness, hash linking, chain verification, tamper detection,
 * export/import, SPRT evidence accumulation, large chain (1000 receipts),
 * and feature flag toggle.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  WitnessChain,
  createWitnessChain,
  isWitnessChainFeatureEnabled,
  SPRTAccumulator,
  type WitnessDecision,
  type WitnessReceipt,
} from '../../../src/governance/witness-chain.js';
import {
  setRuVectorFeatureFlags,
  resetRuVectorFeatureFlags,
} from '../../../src/integrations/ruvector/feature-flags.js';

describe('WitnessChain', () => {
  let chain: WitnessChain;

  beforeEach(() => {
    chain = createWitnessChain();
  });

  afterEach(() => {
    resetRuVectorFeatureFlags();
  });

  // ==========================================================================
  // Append Witness
  // ==========================================================================

  describe('appendWitness', () => {
    it('should create a receipt with a valid SHA-256 hash', () => {
      const decision: WitnessDecision = {
        type: 'coherence-gate',
        decision: 'PASS',
        context: { energy: 0.23, threshold: 0.4 },
      };

      const receipt = chain.appendWitness(decision);

      expect(receipt.id).toBeTruthy();
      expect(receipt.hash).toMatch(/^[a-f0-9]{64}$/);
      expect(receipt.previousHash).toBe('0'.repeat(64));
      expect(receipt.timestamp).toBeGreaterThan(0);
      expect(receipt.chainIndex).toBe(0);
      expect(receipt.decision).toEqual(decision);
    });

    it('should increment chainIndex for each append', () => {
      const decision: WitnessDecision = {
        type: 'quality-gate',
        decision: 'PASS',
        context: {},
      };

      const r1 = chain.appendWitness(decision);
      const r2 = chain.appendWitness(decision);
      const r3 = chain.appendWitness(decision);

      expect(r1.chainIndex).toBe(0);
      expect(r2.chainIndex).toBe(1);
      expect(r3.chainIndex).toBe(2);
    });

    it('should include evidence value when provided', () => {
      const decision: WitnessDecision = {
        type: 'coherence-gate',
        decision: 'INCONCLUSIVE',
        context: {},
        evidence: 0.75,
      };

      const receipt = chain.appendWitness(decision);
      expect(receipt.decision.evidence).toBe(0.75);
    });
  });

  // ==========================================================================
  // Hash Linking
  // ==========================================================================

  describe('hash linking', () => {
    it('should link each receipt to the previous via previousHash', () => {
      const decision: WitnessDecision = {
        type: 'quality-gate',
        decision: 'PASS',
        context: {},
      };

      const r1 = chain.appendWitness(decision);
      const r2 = chain.appendWitness(decision);
      const r3 = chain.appendWitness(decision);

      // First receipt's previousHash is genesis
      expect(r1.previousHash).toBe('0'.repeat(64));
      // Each subsequent receipt links to the prior one
      expect(r2.previousHash).toBe(r1.hash);
      expect(r3.previousHash).toBe(r2.hash);
    });

    it('should produce different hashes for different decisions', () => {
      const passDecision: WitnessDecision = {
        type: 'coherence-gate',
        decision: 'PASS',
        context: { energy: 0.1 },
      };
      const failDecision: WitnessDecision = {
        type: 'coherence-gate',
        decision: 'FAIL',
        context: { energy: 0.8 },
      };

      const chain1 = createWitnessChain();
      const chain2 = createWitnessChain();

      const r1 = chain1.appendWitness(passDecision);
      const r2 = chain2.appendWitness(failDecision);

      expect(r1.hash).not.toBe(r2.hash);
    });

    it('should produce unique receipt IDs', () => {
      const decision: WitnessDecision = {
        type: 'quality-gate',
        decision: 'PASS',
        context: {},
      };

      const ids = new Set<string>();
      for (let i = 0; i < 100; i++) {
        ids.add(chain.appendWitness(decision).id);
      }

      expect(ids.size).toBe(100);
    });
  });

  // ==========================================================================
  // Chain Verification (valid chain)
  // ==========================================================================

  describe('verifyChain', () => {
    it('should verify an empty chain as valid', () => {
      const result = chain.verifyChain();

      expect(result.valid).toBe(true);
      expect(result.length).toBe(0);
      expect(result.brokenAt).toBe(-1);
      expect(result.lastHash).toBe('0'.repeat(64));
    });

    it('should verify a single-receipt chain as valid', () => {
      chain.appendWitness({
        type: 'quality-gate',
        decision: 'PASS',
        context: {},
      });

      const result = chain.verifyChain();

      expect(result.valid).toBe(true);
      expect(result.length).toBe(1);
      expect(result.brokenAt).toBe(-1);
    });

    it('should verify a multi-receipt chain as valid', () => {
      for (let i = 0; i < 10; i++) {
        chain.appendWitness({
          type: 'coherence-gate',
          decision: i % 2 === 0 ? 'PASS' : 'FAIL',
          context: { index: i },
        });
      }

      const result = chain.verifyChain();

      expect(result.valid).toBe(true);
      expect(result.length).toBe(10);
      expect(result.brokenAt).toBe(-1);
    });
  });

  // ==========================================================================
  // Tamper Detection
  // ==========================================================================

  describe('tamper detection', () => {
    it('should detect a modified decision in a receipt', () => {
      chain.appendWitness({
        type: 'coherence-gate',
        decision: 'PASS',
        context: { energy: 0.2 },
      });
      chain.appendWitness({
        type: 'coherence-gate',
        decision: 'PASS',
        context: { energy: 0.3 },
      });

      // Tamper with the first receipt's decision
      const receipts = chain.getChain();
      (receipts[0] as any).decision.decision = 'FAIL';

      // We need to tamper with the internal state, so access via getChain
      // and manually replace. Since getChain returns a copy, we need a
      // different approach: export, tamper, import.
      const exported = chain.exportChain();
      const parsed = JSON.parse(exported);
      parsed.receipts[0].decision.decision = 'FAIL';

      const tampered = createWitnessChain();
      const importResult = tampered.importChain(JSON.stringify(parsed));

      // Import should fail because the hash no longer matches
      expect(importResult).toBe(false);
    });

    it('should detect a modified hash in a receipt', () => {
      chain.appendWitness({
        type: 'quality-gate',
        decision: 'PASS',
        context: {},
      });
      chain.appendWitness({
        type: 'quality-gate',
        decision: 'FAIL',
        context: {},
      });

      const exported = chain.exportChain();
      const parsed = JSON.parse(exported);

      // Tamper with the hash of the first receipt
      parsed.receipts[0].hash = 'a'.repeat(64);

      const tampered = createWitnessChain();
      const importResult = tampered.importChain(JSON.stringify(parsed));

      expect(importResult).toBe(false);
    });

    it('should detect a modified previousHash link', () => {
      chain.appendWitness({
        type: 'quality-gate',
        decision: 'PASS',
        context: {},
      });
      chain.appendWitness({
        type: 'quality-gate',
        decision: 'PASS',
        context: {},
      });

      const exported = chain.exportChain();
      const parsed = JSON.parse(exported);

      // Tamper with the previousHash of the second receipt
      parsed.receipts[1].previousHash = 'b'.repeat(64);

      const tampered = createWitnessChain();
      const importResult = tampered.importChain(JSON.stringify(parsed));

      expect(importResult).toBe(false);
    });
  });

  // ==========================================================================
  // Chain Export/Import
  // ==========================================================================

  describe('exportChain / importChain', () => {
    it('should export an empty chain', () => {
      const exported = chain.exportChain();
      const parsed = JSON.parse(exported);

      expect(parsed.version).toBe('1.0.0');
      expect(parsed.length).toBe(0);
      expect(parsed.receipts).toEqual([]);
      expect(parsed.exportedAt).toBeGreaterThan(0);
    });

    it('should export and import a chain with receipts', () => {
      chain.appendWitness({
        type: 'coherence-gate',
        decision: 'PASS',
        context: { energy: 0.1 },
      });
      chain.appendWitness({
        type: 'quality-gate',
        decision: 'FAIL',
        context: { reason: 'low coverage' },
      });

      const exported = chain.exportChain();

      const newChain = createWitnessChain();
      const result = newChain.importChain(exported);

      expect(result).toBe(true);
      expect(newChain.getChainLength()).toBe(2);
      expect(newChain.verifyChain().valid).toBe(true);
    });

    it('should reject invalid JSON on import', () => {
      const result = chain.importChain('not valid json!!!');
      expect(result).toBe(false);
    });

    it('should reject wrong version on import', () => {
      const result = chain.importChain(JSON.stringify({
        version: '2.0.0',
        exportedAt: Date.now(),
        length: 0,
        receipts: [],
      }));
      expect(result).toBe(false);
    });

    it('should reject import with missing receipts field', () => {
      const result = chain.importChain(JSON.stringify({
        version: '1.0.0',
        exportedAt: Date.now(),
        length: 0,
      }));
      expect(result).toBe(false);
    });

    it('should preserve chain state on failed import', () => {
      chain.appendWitness({
        type: 'quality-gate',
        decision: 'PASS',
        context: {},
      });

      const originalLength = chain.getChainLength();
      const originalHash = chain.getLastHash();

      // Attempt a bad import
      chain.importChain('garbage');

      // Original chain should be preserved
      expect(chain.getChainLength()).toBe(originalLength);
      expect(chain.getLastHash()).toBe(originalHash);
    });
  });

  // ==========================================================================
  // SPRT Evidence Accumulation
  // ==========================================================================

  describe('SPRT evidence accumulation', () => {
    it('should accumulate PASS decisions toward PASS threshold', () => {
      // Append enough positive decisions to cross the SPRT upper bound
      // Upper bound at default alpha=0.05: ln(1/0.05) ~ 2.996
      // Each positive adds +0.5, so ~6 positives should cross
      for (let i = 0; i < 7; i++) {
        chain.appendWitness({
          type: 'coherence-gate',
          decision: 'PASS',
          context: { index: i },
        });
      }

      const sprt = chain.getSPRT('coherence-gate');
      expect(sprt.getRatio()).toBeGreaterThan(0);
      expect(sprt.getObservations()).toBe(7);
    });

    it('should accumulate FAIL decisions toward FAIL threshold', () => {
      // Append enough negative decisions
      // Lower bound at default beta=0.05: ln(0.05) ~ -2.996
      // Each negative adds -0.5, so ~6 negatives should cross
      for (let i = 0; i < 7; i++) {
        chain.appendWitness({
          type: 'coherence-gate',
          decision: 'FAIL',
          context: { index: i },
        });
      }

      const sprt = chain.getSPRT('coherence-gate');
      expect(sprt.getRatio()).toBeLessThan(0);
    });

    it('should maintain separate accumulators per decision type', () => {
      chain.appendWitness({
        type: 'coherence-gate',
        decision: 'PASS',
        context: {},
      });
      chain.appendWitness({
        type: 'quality-gate',
        decision: 'FAIL',
        context: {},
      });

      const coherenceSPRT = chain.getSPRT('coherence-gate');
      const qualitySPRT = chain.getSPRT('quality-gate');

      expect(coherenceSPRT.getRatio()).toBe(0.5); // one positive
      expect(qualitySPRT.getRatio()).toBe(-0.5); // one negative
    });

    it('should treat PERMIT as positive and DENY as negative', () => {
      chain.appendWitness({
        type: 'transfer-gate',
        decision: 'PERMIT',
        context: {},
      });
      chain.appendWitness({
        type: 'transfer-gate',
        decision: 'DENY',
        context: {},
      });

      const sprt = chain.getSPRT('transfer-gate');
      // +0.5 (PERMIT) + -0.5 (DENY) = 0
      expect(sprt.getRatio()).toBe(0);
      expect(sprt.getObservations()).toBe(2);
    });
  });

  // ==========================================================================
  // Large Chain (1000 receipts)
  // ==========================================================================

  describe('large chain', () => {
    it('should handle 1000 receipts and verify successfully', () => {
      for (let i = 0; i < 1000; i++) {
        chain.appendWitness({
          type: 'quality-gate',
          decision: i % 3 === 0 ? 'FAIL' : 'PASS',
          context: { index: i },
        });
      }

      expect(chain.getChainLength()).toBe(1000);

      const result = chain.verifyChain();
      expect(result.valid).toBe(true);
      expect(result.length).toBe(1000);
      expect(result.brokenAt).toBe(-1);
    });

    it('should support getChain with limit on a large chain', () => {
      for (let i = 0; i < 100; i++) {
        chain.appendWitness({
          type: 'quality-gate',
          decision: 'PASS',
          context: { index: i },
        });
      }

      const last10 = chain.getChain(10);
      expect(last10.length).toBe(10);
      // Should be the last 10 receipts
      expect(last10[0].chainIndex).toBe(90);
      expect(last10[9].chainIndex).toBe(99);
    });

    it('should export and import a large chain', () => {
      for (let i = 0; i < 100; i++) {
        chain.appendWitness({
          type: 'quality-gate',
          decision: 'PASS',
          context: { index: i },
        });
      }

      const exported = chain.exportChain();
      const newChain = createWitnessChain();
      const result = newChain.importChain(exported);

      expect(result).toBe(true);
      expect(newChain.getChainLength()).toBe(100);
      expect(newChain.verifyChain().valid).toBe(true);
    });
  });

  // ==========================================================================
  // Feature Flag Toggle
  // ==========================================================================

  describe('feature flag', () => {
    it('should report disabled when useWitnessChain is off', () => {
      setRuVectorFeatureFlags({ useWitnessChain: false });
      expect(isWitnessChainFeatureEnabled()).toBe(false);
    });

    it('should report enabled when useWitnessChain is on', () => {
      setRuVectorFeatureFlags({ useWitnessChain: true });
      expect(isWitnessChainFeatureEnabled()).toBe(true);
    });
  });

  // ==========================================================================
  // Utility Methods
  // ==========================================================================

  describe('utility methods', () => {
    it('should return chain length', () => {
      expect(chain.getChainLength()).toBe(0);

      chain.appendWitness({
        type: 'quality-gate',
        decision: 'PASS',
        context: {},
      });

      expect(chain.getChainLength()).toBe(1);
    });

    it('should return last hash', () => {
      expect(chain.getLastHash()).toBe('0'.repeat(64));

      const receipt = chain.appendWitness({
        type: 'quality-gate',
        decision: 'PASS',
        context: {},
      });

      expect(chain.getLastHash()).toBe(receipt.hash);
    });

    it('should get receipt by index', () => {
      const receipt = chain.appendWitness({
        type: 'quality-gate',
        decision: 'PASS',
        context: { foo: 'bar' },
      });

      expect(chain.getReceipt(0)).toEqual(receipt);
      expect(chain.getReceipt(1)).toBeUndefined();
    });

    it('should return full chain when no limit is given', () => {
      for (let i = 0; i < 5; i++) {
        chain.appendWitness({
          type: 'quality-gate',
          decision: 'PASS',
          context: { index: i },
        });
      }

      const full = chain.getChain();
      expect(full.length).toBe(5);
    });
  });
});

// ============================================================================
// SPRTAccumulator Tests
// ============================================================================

describe('SPRTAccumulator', () => {
  let sprt: SPRTAccumulator;

  beforeEach(() => {
    sprt = new SPRTAccumulator();
  });

  it('should start with ratio 0 and 0 observations', () => {
    expect(sprt.getRatio()).toBe(0);
    expect(sprt.getObservations()).toBe(0);
  });

  it('should increment ratio by +0.5 for positive evidence', () => {
    const result = sprt.addEvidence(true);

    expect(sprt.getRatio()).toBe(0.5);
    expect(sprt.getObservations()).toBe(1);
    // Not enough evidence yet
    expect(result).toBe('INCONCLUSIVE');
  });

  it('should decrement ratio by -0.5 for negative evidence', () => {
    const result = sprt.addEvidence(false);

    expect(sprt.getRatio()).toBe(-0.5);
    expect(result).toBe('INCONCLUSIVE');
  });

  it('should return PASS when crossing upper bound', () => {
    // Default alpha=0.05, upper bound = ln(1/0.05) ~ 2.996
    // Need 6 positive observations to reach 3.0
    let result: string = 'INCONCLUSIVE';
    for (let i = 0; i < 6; i++) {
      result = sprt.addEvidence(true);
    }

    expect(result).toBe('PASS');
    expect(sprt.getRatio()).toBe(3.0);
  });

  it('should return FAIL when crossing lower bound', () => {
    // Default beta=0.05, lower bound = ln(0.05) ~ -2.996
    // Need 6 negative observations to reach -3.0
    let result: string = 'INCONCLUSIVE';
    for (let i = 0; i < 6; i++) {
      result = sprt.addEvidence(false);
    }

    expect(result).toBe('FAIL');
    expect(sprt.getRatio()).toBe(-3.0);
  });

  it('should remain INCONCLUSIVE with mixed evidence', () => {
    // Alternate positive and negative
    for (let i = 0; i < 10; i++) {
      const result = sprt.addEvidence(i % 2 === 0);
      if (i < 9) {
        expect(result).toBe('INCONCLUSIVE');
      }
    }
    // After 10 alternating: ratio oscillates near 0
    expect(Math.abs(sprt.getRatio())).toBeLessThanOrEqual(0.5);
  });

  it('should reset correctly', () => {
    sprt.addEvidence(true);
    sprt.addEvidence(true);
    sprt.addEvidence(false);

    sprt.reset();

    expect(sprt.getRatio()).toBe(0);
    expect(sprt.getObservations()).toBe(0);
  });

  it('should return correct bounds', () => {
    const bounds = sprt.getBounds();

    expect(bounds.upper).toBeCloseTo(Math.log(1 / 0.05), 5);
    expect(bounds.lower).toBeCloseTo(Math.log(0.05), 5);
  });

  it('should accept custom alpha and beta', () => {
    const custom = new SPRTAccumulator(0.01, 0.01);
    const bounds = custom.getBounds();

    expect(bounds.upper).toBeCloseTo(Math.log(100), 5);
    expect(bounds.lower).toBeCloseTo(Math.log(0.01), 5);
  });

  // ==========================================================================
  // Weighted Evidence
  // ==========================================================================

  describe('Weighted Evidence', () => {
    it('should reach PASS faster with strength 1.0 than default 0.5', () => {
      // With strength 1.0, each positive adds +1.0
      // Upper bound ~2.996, so 3 observations should suffice
      const weighted = new SPRTAccumulator();
      let weightedObs = 0;
      let result: string = 'INCONCLUSIVE';
      while (result === 'INCONCLUSIVE' && weightedObs < 100) {
        result = weighted.addWeightedEvidence(true, 1.0);
        weightedObs++;
      }
      expect(result).toBe('PASS');

      // With default strength 0.5, each positive adds +0.5
      // Need 6 observations to reach 3.0
      const standard = new SPRTAccumulator();
      let standardObs = 0;
      result = 'INCONCLUSIVE';
      while (result === 'INCONCLUSIVE' && standardObs < 100) {
        result = standard.addEvidence(true);
        standardObs++;
      }
      expect(result).toBe('PASS');

      // Weighted should need fewer observations
      expect(weightedObs).toBeLessThan(standardObs);
    });

    it('should reach PASS slower with strength 0.1 than default 0.5', () => {
      // With strength 0.1, each positive adds +0.1
      // Upper bound ~2.996, so ~30 observations needed
      const slow = new SPRTAccumulator();
      let slowObs = 0;
      let result: string = 'INCONCLUSIVE';
      while (result === 'INCONCLUSIVE' && slowObs < 200) {
        result = slow.addWeightedEvidence(true, 0.1);
        slowObs++;
      }
      expect(result).toBe('PASS');

      // With default strength 0.5, need 6 observations
      const standard = new SPRTAccumulator();
      let standardObs = 0;
      result = 'INCONCLUSIVE';
      while (result === 'INCONCLUSIVE' && standardObs < 100) {
        result = standard.addEvidence(true);
        standardObs++;
      }
      expect(result).toBe('PASS');

      // Slow weighted should need more observations
      expect(slowObs).toBeGreaterThan(standardObs);
    });

    it('should reach FAIL very quickly with strength 2.0', () => {
      // With strength 2.0, each negative adds -2.0
      // Lower bound ~-2.996, so 2 observations should suffice
      const fast = new SPRTAccumulator();
      let result: string = 'INCONCLUSIVE';
      let obs = 0;
      while (result === 'INCONCLUSIVE' && obs < 100) {
        result = fast.addWeightedEvidence(false, 2.0);
        obs++;
      }
      expect(result).toBe('FAIL');
      expect(obs).toBeLessThanOrEqual(2);
    });

    it('should converge with mixed weighted evidence of varying strengths', () => {
      // Add a mix of positive and negative with different strengths
      // Net positive should eventually reach PASS
      const mixed = new SPRTAccumulator();
      let result: string = 'INCONCLUSIVE';

      // Add some weak negatives and strong positives
      mixed.addWeightedEvidence(false, 0.1); // -0.1
      mixed.addWeightedEvidence(false, 0.2); // -0.3
      mixed.addWeightedEvidence(true, 1.0);  // +0.7
      mixed.addWeightedEvidence(true, 1.0);  // +1.7
      mixed.addWeightedEvidence(false, 0.1); // +1.6
      result = mixed.addWeightedEvidence(true, 1.5); // +3.1 -> crosses upper bound ~2.996

      expect(result).toBe('PASS');
      expect(mixed.getObservations()).toBe(6);
    });

    it('should produce same results as addEvidence when strength is 0.5', () => {
      const weighted = new SPRTAccumulator();
      const standard = new SPRTAccumulator();

      // Run identical sequences through both methods
      const sequence = [true, false, true, true, false, true, true, true];

      for (const positive of sequence) {
        const wResult = weighted.addWeightedEvidence(positive, 0.5);
        const sResult = standard.addEvidence(positive);

        expect(wResult).toBe(sResult);
        expect(weighted.getRatio()).toBe(standard.getRatio());
        expect(weighted.getObservations()).toBe(standard.getObservations());
      }
    });
  });
});
