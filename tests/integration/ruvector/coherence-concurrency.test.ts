/**
 * Coherence Gate Concurrency Tests
 *
 * Validates that 8+ concurrent agents can use the coherence gate without:
 * - Deadlocks
 * - Data races in witness chain
 * - Cross-domain interference
 * - Lost or corrupted validation results
 *
 * @see Issue #355 — RuVector P1: Concurrency test (Task 3.5)
 * @see ADR-083 — Coherence-Gated Agent Actions
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';

import {
  CoherenceGate,
  createCoherenceGate,
  type TestArtifact,
  type ValidationResult,
} from '../../../src/integrations/ruvector/coherence-gate.js';
import {
  WitnessChain,
  createWitnessChain,
  type WitnessDecision,
} from '../../../src/governance/witness-chain.js';
import {
  setRuVectorFeatureFlags,
  resetRuVectorFeatureFlags,
} from '../../../src/integrations/ruvector/feature-flags.js';

// ============================================================================
// Helpers
// ============================================================================

const DOMAINS = [
  'test-generation',
  'coverage-analysis',
  'defect-intelligence',
  'test-execution',
  'quality-assessment',
  'code-intelligence',
  'requirements-validation',
  'security-compliance',
];

function createArtifactForDomain(
  domain: string,
  quality: 'consistent' | 'hallucinated',
): TestArtifact {
  if (quality === 'consistent') {
    return {
      assertions: [
        `expect(${domain}.result).toBe(true)`,
        `expect(${domain}.status).toBe(200)`,
      ],
      observedBehavior: [
        `${domain} result was true`,
        `${domain} status was 200`,
      ],
      coverage: 0.85 + Math.random() * 0.1,
      domain,
      confidence: 0.9 + Math.random() * 0.05,
    };
  }

  return {
    assertions: [
      `expect(${domain}.result).toBe(true)`,
      `expect(${domain}.data).not.toBeNull()`,
      `expect(${domain}.count).toBeGreaterThan(0)`,
      `expect(${domain}.valid).toBe(true)`,
      `expect(${domain}.processed).toBe(true)`,
    ],
    observedBehavior: [
      `${domain} returned error`,
    ],
    coverage: 0.1,
    domain,
    confidence: 0.2,
  };
}

// ============================================================================
// Tests
// ============================================================================

describe('Coherence Gate Concurrency', () => {
  beforeEach(() => {
    setRuVectorFeatureFlags({
      useCoherenceGate: true,
      useWitnessChain: true,
    });
  });

  afterEach(() => {
    resetRuVectorFeatureFlags();
  });

  // --------------------------------------------------------------------------
  // 1. Concurrent validations with separate gate instances (per-agent pattern)
  // --------------------------------------------------------------------------

  it('should handle 8 concurrent validations with separate gate instances', async () => {
    const results: ValidationResult[] = [];

    // Simulate 8 agents, each with their own CoherenceGate
    const agentPromises = DOMAINS.map(async (domain) => {
      const gate = createCoherenceGate();
      const artifact = createArtifactForDomain(domain, 'consistent');

      // Simulate async work around validation
      await new Promise(resolve => setTimeout(resolve, Math.random() * 5));
      const result = gate.validate(artifact);
      return { domain, result };
    });

    const outcomes = await Promise.all(agentPromises);

    for (const { domain, result } of outcomes) {
      results.push(result);
      // Consistent artifacts should pass
      expect(result.passed).toBe(true);
      expect(result.energy).toBeLessThanOrEqual(result.threshold);
      expect(result.witness).toBeDefined();
      expect(result.witness.id).toBeTruthy();
      expect(result.witness.recordHash).toBeTruthy();
    }

    // All 8 validations completed
    expect(results).toHaveLength(8);
  });

  // --------------------------------------------------------------------------
  // 2. Shared gate instance with concurrent validations
  // --------------------------------------------------------------------------

  it('should handle 8 concurrent validations on a shared gate instance', async () => {
    const gate = createCoherenceGate();

    const agentPromises = DOMAINS.map(async (domain) => {
      const artifact = createArtifactForDomain(domain, 'consistent');
      await new Promise(resolve => setTimeout(resolve, Math.random() * 5));
      return gate.validate(artifact);
    });

    const results = await Promise.all(agentPromises);

    expect(results).toHaveLength(8);
    for (const result of results) {
      expect(result.passed).toBe(true);
      expect(result.witness).toBeDefined();
    }

    // Decision log should have all 8 entries
    const log = gate.getDecisionLog();
    expect(log).toHaveLength(8);

    // Each domain should appear exactly once
    const domains = new Set(log.map(d => d.domain));
    expect(domains.size).toBe(8);
  });

  // --------------------------------------------------------------------------
  // 3. Witness chain integrity under concurrent appends
  // --------------------------------------------------------------------------

  it('should maintain witness chain integrity with concurrent appends', async () => {
    const chain = createWitnessChain();

    // 8 agents appending witness records concurrently
    const appendPromises = DOMAINS.map(async (domain, index) => {
      const decision: WitnessDecision = {
        type: 'coherence-gate',
        decision: index % 2 === 0 ? 'PASS' : 'FAIL',
        context: { domain, energy: 0.2 + index * 0.05, threshold: 0.4 },
      };

      await new Promise(resolve => setTimeout(resolve, Math.random() * 5));
      return chain.appendWitness(decision);
    });

    const receipts = await Promise.all(appendPromises);

    // All 8 receipts created
    expect(receipts).toHaveLength(8);

    // Chain indices should be unique (0-7)
    const indices = receipts.map(r => r.chainIndex).sort((a, b) => a - b);
    expect(new Set(indices).size).toBe(8);

    // Chain should verify as valid
    const verification = chain.verifyChain();
    expect(verification.valid).toBe(true);
    expect(verification.length).toBe(8);
  });

  // --------------------------------------------------------------------------
  // 4. Mixed pass/fail across domains (no cross-domain interference)
  // --------------------------------------------------------------------------

  it('should correctly validate mixed pass/fail across domains without interference', async () => {
    const gate = createCoherenceGate();

    const agentPromises = DOMAINS.map(async (domain, index) => {
      const quality = index % 2 === 0 ? 'consistent' : 'hallucinated';
      const artifact = createArtifactForDomain(domain, quality as 'consistent' | 'hallucinated');
      await new Promise(resolve => setTimeout(resolve, Math.random() * 5));
      return { domain, result: gate.validate(artifact), expectedPass: quality === 'consistent' };
    });

    const outcomes = await Promise.all(agentPromises);

    for (const { domain, result, expectedPass } of outcomes) {
      if (expectedPass) {
        expect(result.passed).toBe(true);
      } else {
        // Hallucinated artifacts should have high energy
        expect(result.energy).toBeGreaterThan(0);
      }
      // Witness record always generated regardless of outcome
      expect(result.witness.id).toBeTruthy();
    }
  });

  // --------------------------------------------------------------------------
  // 5. Rapid sequential validations (no stale state between calls)
  // --------------------------------------------------------------------------

  it('should handle rapid sequential validations without stale state', () => {
    const gate = createCoherenceGate();

    const results: ValidationResult[] = [];
    for (let i = 0; i < 100; i++) {
      const domain = DOMAINS[i % DOMAINS.length];
      const artifact = createArtifactForDomain(domain, 'consistent');
      results.push(gate.validate(artifact));
    }

    expect(results).toHaveLength(100);
    expect(gate.getDecisionLog()).toHaveLength(100);

    // All consistent artifacts should pass
    for (const result of results) {
      expect(result.passed).toBe(true);
    }
  });

  // --------------------------------------------------------------------------
  // 6. Concurrent validation with witness chain disabled (no crash)
  // --------------------------------------------------------------------------

  it('should work concurrently with witness chain disabled', async () => {
    setRuVectorFeatureFlags({
      useCoherenceGate: true,
      useWitnessChain: false,
    });

    const gate = createCoherenceGate();

    const agentPromises = DOMAINS.map(async (domain) => {
      const artifact = createArtifactForDomain(domain, 'consistent');
      await new Promise(resolve => setTimeout(resolve, Math.random() * 5));
      return gate.validate(artifact);
    });

    const results = await Promise.all(agentPromises);

    expect(results).toHaveLength(8);
    for (const result of results) {
      expect(result.passed).toBe(true);
      // Witness record still created (just not chained)
      expect(result.witness).toBeDefined();
    }

    // Witness chain should be empty when disabled
    expect(gate.getWitnessChain()).toHaveLength(0);
  });

  // --------------------------------------------------------------------------
  // 7. Transfer validation concurrency (ITransferCoherenceGate)
  // --------------------------------------------------------------------------

  it('should handle concurrent cross-domain transfer validations', async () => {
    const gate = createCoherenceGate();

    const transferPromises = DOMAINS.map(async (sourceDomain, index) => {
      const targetDomain = DOMAINS[(index + 1) % DOMAINS.length];
      const pattern = {
        id: `pattern-${index}`,
        domain: sourceDomain,
        confidence: 0.85,
        coverage: 0.9,
      };

      await new Promise(resolve => setTimeout(resolve, Math.random() * 5));
      return {
        source: sourceDomain,
        target: targetDomain,
        result: gate.validateTransfer(pattern, targetDomain),
      };
    });

    const outcomes = await Promise.all(transferPromises);

    expect(outcomes).toHaveLength(8);
    for (const { result } of outcomes) {
      expect(result.approved).toBe(true);
    }
  });

  // --------------------------------------------------------------------------
  // 8. Stress test: 50 concurrent validations
  // --------------------------------------------------------------------------

  it('should handle 50 concurrent validations without deadlock', async () => {
    const gate = createCoherenceGate();

    const promises = Array.from({ length: 50 }, async (_, i) => {
      const domain = DOMAINS[i % DOMAINS.length];
      const quality = i % 3 === 0 ? 'hallucinated' : 'consistent';
      const artifact = createArtifactForDomain(domain, quality as 'consistent' | 'hallucinated');
      await new Promise(resolve => setTimeout(resolve, Math.random() * 10));
      return gate.validate(artifact);
    });

    const results = await Promise.all(promises);

    expect(results).toHaveLength(50);
    expect(gate.getDecisionLog()).toHaveLength(50);

    // No undefined results
    for (const result of results) {
      expect(result.energy).toBeGreaterThanOrEqual(0);
      expect(result.energy).toBeLessThanOrEqual(1);
      expect(result.witness).toBeDefined();
    }
  });
});
