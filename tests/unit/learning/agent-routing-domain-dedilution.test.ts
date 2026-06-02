/**
 * Regression test for the domain-score de-dilution fix (#510 item 2).
 *
 * Before the fix, domain score was `(domainMatch / detectedDomains.length) * 0.4`.
 * AQE's domain detector routinely emits 7-12 domains per task, so a perfect
 * single-domain specialist scored `(1/11)*0.4 ≈ 0.04` — relevance washed out by
 * detector breadth, leaving routing confidence dominated by the fixed
 * performance term (measured: broad task 27.7% before, 33.3% after).
 *
 * The fix caps the denominator at DOMAIN_DENOM_CAP, so beyond the cap a match's
 * contribution no longer shrinks as more (irrelevant) domains are detected.
 * These tests lock in:
 *   1. dilution-immunity — padding detected domains beyond the cap does NOT
 *      lower a matching agent's score;
 *   2. the precise-detector case (few domains) is preserved;
 *   3. proportionality — matching more relevant domains still scores higher.
 */

import { describe, it, expect } from 'vitest';
import {
  calculateAgentScores,
  DOMAIN_DENOM_CAP,
  type RoutingWeights,
  type AgentCapabilityProfile,
} from '../../../src/learning/agent-routing.js';
import type { QEDomain } from '../../../src/learning/qe-reasoning-bank-types.js';

const WEIGHTS: RoutingWeights = {
  similarity: 1,
  performance: 1,
  capabilities: 1,
  language: 1.0,
};
const emptyPatterns = new Map<string, number>();

// One agent that matches exactly the 'test-generation' domain, nothing else.
const oneDomainAgent: Record<string, AgentCapabilityProfile> = {
  'specialist': {
    domains: ['test-generation'] as QEDomain[],
    capabilities: ['unit-test'],
    performanceScore: 0.8,
  },
};

// Helper: score the single specialist agent against a given detected-domain set.
function scoreFor(detected: QEDomain[]): number {
  const scores = calculateAgentScores(
    detected,
    undefined,
    emptyPatterns,
    WEIGHTS,
    oneDomainAgent,
  );
  return scores[0].score;
}

// A broad detector emits many domains; the agent still matches only 1.
const broad11: QEDomain[] = [
  'test-generation', 'test-execution', 'coverage-analysis', 'quality-assessment',
  'defect-intelligence', 'requirements-validation', 'code-intelligence',
  'security-compliance', 'contract-testing', 'visual-accessibility', 'chaos-resilience',
] as QEDomain[];

describe('agent-routing domain de-dilution (#510 item 2)', () => {
  it('is immune to detector breadth beyond the cap (no further dilution)', () => {
    // Both have detected-domain count >= cap, agent matches the same 1 domain.
    const atCap = scoreFor(broad11.slice(0, DOMAIN_DENOM_CAP) as QEDomain[]);
    const wayOverCap = scoreFor(broad11);
    expect(wayOverCap).toBeCloseTo(atCap, 10);
  });

  it('contributes the CAPPED domain term (not the 1/length diluted one) through the real code', () => {
    // Score two agents that differ ONLY in domains, against the same broad (11)
    // detection; the score delta is exactly the domain term the code computed.
    // An agent matching 1 domain vs an agent matching 0 should differ by the
    // DE-DILUTED term (1/min(11,cap))*0.4, NOT the old diluted (1/11)*0.4. This
    // calls calculateAgentScores, so it fails if the cap is removed.
    const noMatchAgent: Record<string, AgentCapabilityProfile> = {
      specialist: { domains: ['no-such-domain'] as unknown as QEDomain[], capabilities: ['unit-test'], performanceScore: 0.8 },
    };
    const matchScore = scoreFor(broad11); // oneDomainAgent matches 'test-generation' ∈ broad11
    const noMatchScore = calculateAgentScores(broad11, undefined, emptyPatterns, WEIGHTS, noMatchAgent)[0].score;
    const delta = matchScore - noMatchScore;
    const cappedTerm = (1 / Math.min(broad11.length, DOMAIN_DENOM_CAP)) * 0.4; // 0.1333
    const oldDilutedTerm = (1 / broad11.length) * 0.4;                          // 0.0364
    expect(delta).toBeCloseTo(cappedTerm, 4);        // the real computed contribution
    expect(delta).toBeGreaterThan(oldDilutedTerm * 2); // and clearly above the old dilution
  });

  it('preserves the precise-detector case (single detected domain => full term)', () => {
    // 1 detected domain, matched: denom = min(1, cap) = 1 => full 0.4 domain term.
    const precise = scoreFor(['test-generation'] as QEDomain[]);
    const broad = scoreFor(broad11);
    // Precise detection should still out-score broad detection for the same match.
    expect(precise).toBeGreaterThan(broad);
  });

  it('keeps proportionality — matching more relevant domains scores higher', () => {
    const twoDomainAgent: Record<string, AgentCapabilityProfile> = {
      generalist: {
        domains: ['test-generation', 'coverage-analysis'] as QEDomain[],
        capabilities: ['unit-test'],
        performanceScore: 0.8,
      },
    };
    const oneMatch = calculateAgentScores(broad11, undefined, emptyPatterns, WEIGHTS, oneDomainAgent)[0].score;
    const twoMatch = calculateAgentScores(broad11, undefined, emptyPatterns, WEIGHTS, twoDomainAgent)[0].score;
    expect(twoMatch).toBeGreaterThan(oneMatch);
  });
});
