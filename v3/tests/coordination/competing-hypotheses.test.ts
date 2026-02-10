/**
 * Unit tests for Competing Hypotheses - HypothesisManager and Factory
 * ADR-064 Phase 4A: Multi-agent competing hypotheses for root cause analysis
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  HypothesisManager,
  createHypothesisManager,
  DEFAULT_COMPETING_HYPOTHESES_CONFIG,
} from '../../src/coordination/competing-hypotheses/index.js';
import type {
  Evidence,
  InvestigationStrategy,
} from '../../src/coordination/competing-hypotheses/types.js';

// ============================================================================
// Helpers
// ============================================================================

type EvidenceInput = Omit<Evidence, 'id' | 'hypothesisId' | 'timestamp'>;

/** Build supporting evidence input with sensible defaults */
function makeSupportingEvidence(overrides: Partial<EvidenceInput> = {}): EvidenceInput {
  return {
    type: overrides.type ?? 'code-match',
    description: overrides.description ?? 'Found matching code pattern',
    weight: overrides.weight ?? 0.7,
    supports: true,
    source: overrides.source ?? 'test-agent',
    data: overrides.data,
  };
}

/** Build refuting evidence input with sensible defaults */
function makeRefutingEvidence(overrides: Partial<EvidenceInput> = {}): EvidenceInput {
  return {
    type: overrides.type ?? 'counter-example',
    description: overrides.description ?? 'Counter-example found',
    weight: overrides.weight ?? 0.7,
    supports: false,
    source: overrides.source ?? 'test-agent',
    data: overrides.data,
  };
}

// ============================================================================
// HypothesisManager
// ============================================================================

describe('HypothesisManager', () => {
  let manager: HypothesisManager;

  beforeEach(() => {
    manager = new HypothesisManager();
  });

  // --------------------------------------------------------------------------
  // createInvestigation
  // --------------------------------------------------------------------------

  describe('createInvestigation', () => {
    it('creates with correct fields and open status', () => {
      const inv = manager.createInvestigation('task-1', 'test-execution', 'Flaky test detected');

      expect(inv.id).toMatch(/^inv-/);
      expect(inv.taskId).toBe('task-1');
      expect(inv.domain).toBe('test-execution');
      expect(inv.description).toBe('Flaky test detected');
      expect(inv.hypotheses).toEqual([]);
      expect(inv.status).toBe('open');
      expect(inv.maxHypotheses).toBe(DEFAULT_COMPETING_HYPOTHESES_CONFIG.maxHypothesesPerInvestigation);
      expect(inv.convergenceThreshold).toBe(DEFAULT_COMPETING_HYPOTHESES_CONFIG.convergenceThreshold);
      expect(inv.createdAt).toBeGreaterThan(0);
      expect(inv.updatedAt).toBeGreaterThan(0);
      expect(inv.convergenceResult).toBeUndefined();
    });
  });

  // --------------------------------------------------------------------------
  // addHypothesis
  // --------------------------------------------------------------------------

  describe('addHypothesis', () => {
    it('adds to investigation and changes status to investigating', () => {
      const inv = manager.createInvestigation('task-1', 'test-execution', 'Flaky test');
      expect(inv.status).toBe('open');

      const hyp = manager.addHypothesis(inv.id, 'Race condition', 'code-analysis', 'agent-1');

      expect(hyp.id).toMatch(/^hyp-/);
      expect(hyp.description).toBe('Race condition');
      expect(hyp.strategy).toBe('code-analysis');
      expect(hyp.investigatorAgentId).toBe('agent-1');
      expect(hyp.status).toBe('pending');
      expect(hyp.evidence).toEqual([]);
      expect(hyp.confidenceScore).toBe(0.5);

      const updated = manager.getInvestigation(inv.id)!;
      expect(updated.status).toBe('investigating');
      expect(updated.hypotheses).toHaveLength(1);
      expect(updated.hypotheses[0].id).toBe(hyp.id);
    });

    it('throws when max hypotheses reached', () => {
      const mgr = new HypothesisManager({ maxHypothesesPerInvestigation: 2 });
      const inv = mgr.createInvestigation('task-1', 'test-execution', 'Limited');

      mgr.addHypothesis(inv.id, 'Hyp A', 'code-analysis');
      mgr.addHypothesis(inv.id, 'Hyp B', 'log-analysis');

      expect(() => mgr.addHypothesis(inv.id, 'Hyp C', 'test-execution')).toThrowError(
        /already has 2 hypotheses \(max\)/,
      );
    });
  });

  // --------------------------------------------------------------------------
  // submitEvidence
  // --------------------------------------------------------------------------

  describe('submitEvidence', () => {
    let investigationId: string;
    let hypothesisId: string;

    beforeEach(() => {
      const inv = manager.createInvestigation('task-1', 'test-execution', 'Flaky test');
      investigationId = inv.id;
      const hyp = manager.addHypothesis(investigationId, 'Race condition', 'code-analysis');
      hypothesisId = hyp.id;
    });

    it('adds evidence and recalculates confidence', () => {
      const evidence = manager.submitEvidence(investigationId, hypothesisId, makeSupportingEvidence());

      expect(evidence.id).toMatch(/^evi-/);
      expect(evidence.hypothesisId).toBe(hypothesisId);
      expect(evidence.timestamp).toBeGreaterThan(0);

      const inv = manager.getInvestigation(investigationId)!;
      const hyp = inv.hypotheses.find(h => h.id === hypothesisId)!;
      expect(hyp.evidence).toHaveLength(1);
      // One supporting evidence => supportWeight / (supportWeight + refuteWeight) = 1.0
      expect(hyp.confidenceScore).toBe(1.0);
    });

    it('with supporting evidence increases confidence', () => {
      // Start neutral at 0.5, add supporting evidence
      manager.submitEvidence(investigationId, hypothesisId, makeSupportingEvidence({ weight: 0.8 }));

      const inv = manager.getInvestigation(investigationId)!;
      const hyp = inv.hypotheses.find(h => h.id === hypothesisId)!;
      // All evidence is supporting, so confidence = supportWeight / total = 1.0
      expect(hyp.confidenceScore).toBeGreaterThan(0.5);
    });

    it('with refuting evidence decreases confidence', () => {
      // Add one supporting piece first so we have a baseline
      manager.submitEvidence(investigationId, hypothesisId, makeSupportingEvidence({ weight: 0.3 }));
      // Then add stronger refuting evidence
      manager.submitEvidence(investigationId, hypothesisId, makeRefutingEvidence({ weight: 0.7 }));

      const inv = manager.getInvestigation(investigationId)!;
      const hyp = inv.hypotheses.find(h => h.id === hypothesisId)!;
      // supportWeight=0.3, refuteWeight=0.7, confidence = 0.3/1.0 = 0.3
      expect(hyp.confidenceScore).toBe(0.3);
      expect(hyp.confidenceScore).toBeLessThan(0.5);
    });

    it('auto-rejects hypothesis below autoRejectThreshold after 2+ evidence', () => {
      // Default autoRejectThreshold is 0.15
      // Submit two refuting evidence pieces with high weight to drop confidence below 0.15
      manager.submitEvidence(investigationId, hypothesisId, makeRefutingEvidence({ weight: 0.9 }));
      // After 1 evidence: confidence = 0/(0+0.9) = 0, but only 1 evidence piece
      let inv = manager.getInvestigation(investigationId)!;
      let hyp = inv.hypotheses.find(h => h.id === hypothesisId)!;
      // Not rejected yet because we need >= 2 evidence pieces
      expect(hyp.status).not.toBe('rejected');

      manager.submitEvidence(investigationId, hypothesisId, makeRefutingEvidence({ weight: 0.8 }));
      // After 2 evidence: confidence = 0/(0+0.9+0.8) = 0 < 0.15, and evidence.length >= 2
      inv = manager.getInvestigation(investigationId)!;
      hyp = inv.hypotheses.find(h => h.id === hypothesisId)!;
      expect(hyp.status).toBe('rejected');
      expect(hyp.confidenceScore).toBeLessThan(DEFAULT_COMPETING_HYPOTHESES_CONFIG.autoRejectThreshold);
    });
  });

  // --------------------------------------------------------------------------
  // completeHypothesis
  // --------------------------------------------------------------------------

  describe('completeHypothesis', () => {
    it('sets status to completed', () => {
      const inv = manager.createInvestigation('task-1', 'test-execution', 'Issue');
      const hyp = manager.addHypothesis(inv.id, 'Root cause A', 'code-analysis');

      manager.completeHypothesis(inv.id, hyp.id);

      const updated = manager.getInvestigation(inv.id)!;
      const completedHyp = updated.hypotheses.find(h => h.id === hyp.id)!;
      expect(completedHyp.status).toBe('completed');
    });
  });

  // --------------------------------------------------------------------------
  // converge
  // --------------------------------------------------------------------------

  describe('converge', () => {
    it('returns winning hypothesis when confidence gap exceeds threshold', () => {
      const inv = manager.createInvestigation('task-1', 'test-execution', 'Bug');
      const h1 = manager.addHypothesis(inv.id, 'Strong hypothesis', 'code-analysis');
      const h2 = manager.addHypothesis(inv.id, 'Weak hypothesis', 'log-analysis');

      // Give h1 strong supporting evidence (3 pieces to meet minEvidenceForConvergence=3)
      manager.submitEvidence(inv.id, h1.id, makeSupportingEvidence({ weight: 0.9 }));
      manager.submitEvidence(inv.id, h1.id, makeSupportingEvidence({ weight: 0.8 }));
      manager.submitEvidence(inv.id, h1.id, makeSupportingEvidence({ weight: 0.7 }));
      // h1 confidence = all supporting = 1.0

      // Give h2 weak/refuting evidence
      manager.submitEvidence(inv.id, h2.id, makeRefutingEvidence({ weight: 0.6 }));
      manager.submitEvidence(inv.id, h2.id, makeSupportingEvidence({ weight: 0.1 }));
      // h2 confidence = 0.1 / (0.6 + 0.1) = ~0.143

      manager.completeHypothesis(inv.id, h1.id);
      manager.completeHypothesis(inv.id, h2.id);

      const result = manager.converge(inv.id);

      expect(result.winningHypothesisId).toBe(h1.id);
      expect(result.confidence).toBe(1.0);
      expect(result.method).toBe('evidence-scoring');
      expect(result.evidenceSummary).toBeTruthy();

      const updated = manager.getInvestigation(inv.id)!;
      expect(updated.status).toBe('converged');
    });

    it('returns inconclusive when insufficient evidence', () => {
      // minEvidenceForConvergence defaults to 3
      const inv = manager.createInvestigation('task-1', 'test-execution', 'Bug');
      const h1 = manager.addHypothesis(inv.id, 'Hypothesis A', 'code-analysis');

      // Only 1 piece of evidence, need 3
      manager.submitEvidence(inv.id, h1.id, makeSupportingEvidence());

      const result = manager.converge(inv.id);

      expect(result.winningHypothesisId).toBeNull();
      expect(result.confidence).toBe(0);
      expect(result.evidenceSummary).toContain('Insufficient evidence');

      const updated = manager.getInvestigation(inv.id)!;
      expect(updated.status).toBe('inconclusive');
    });

    it('returns inconclusive when no clear winner (gap too small)', () => {
      // Set a high convergence threshold to make it hard to converge
      const mgr = new HypothesisManager({
        convergenceThreshold: 0.5,
        minEvidenceForConvergence: 2,
      });
      const inv = mgr.createInvestigation('task-1', 'test-execution', 'Bug');
      const h1 = mgr.addHypothesis(inv.id, 'Hypothesis A', 'code-analysis');
      const h2 = mgr.addHypothesis(inv.id, 'Hypothesis B', 'log-analysis');

      // Both get similar supporting evidence -> similar confidence scores
      mgr.submitEvidence(inv.id, h1.id, makeSupportingEvidence({ weight: 0.6 }));
      mgr.submitEvidence(inv.id, h2.id, makeSupportingEvidence({ weight: 0.5 }));
      // h1 confidence = 1.0 (all supporting), h2 confidence = 1.0 (all supporting)
      // gap = 0.0, well below threshold of 0.5

      const result = mgr.converge(inv.id);

      expect(result.winningHypothesisId).toBeNull();
      expect(result.confidence).toBe(0);

      const updated = mgr.getInvestigation(inv.id)!;
      expect(updated.status).toBe('inconclusive');
    });

    it('returns unanimous when only 1 non-rejected hypothesis', () => {
      const mgr = new HypothesisManager({ minEvidenceForConvergence: 2 });
      const inv = mgr.createInvestigation('task-1', 'test-execution', 'Bug');
      const h1 = mgr.addHypothesis(inv.id, 'Good hypothesis', 'code-analysis');
      const h2 = mgr.addHypothesis(inv.id, 'Bad hypothesis', 'log-analysis');

      // Give h1 supporting evidence
      mgr.submitEvidence(inv.id, h1.id, makeSupportingEvidence({ weight: 0.8 }));
      mgr.submitEvidence(inv.id, h1.id, makeSupportingEvidence({ weight: 0.7 }));

      // Auto-reject h2 by giving heavy refuting evidence (2 pieces for auto-reject)
      mgr.submitEvidence(inv.id, h2.id, makeRefutingEvidence({ weight: 0.95 }));
      mgr.submitEvidence(inv.id, h2.id, makeRefutingEvidence({ weight: 0.95 }));
      // h2 confidence = 0 < 0.15, and 2 evidence pieces => auto-rejected

      // Verify h2 is rejected before converging
      const preConverge = mgr.getInvestigation(inv.id)!;
      const rejectedHyp = preConverge.hypotheses.find(h => h.id === h2.id)!;
      expect(rejectedHyp.status).toBe('rejected');

      const result = mgr.converge(inv.id);

      expect(result.winningHypothesisId).toBe(h1.id);
      expect(result.method).toBe('unanimous');
      expect(result.rejectedHypotheses).toContain(h2.id);

      const updated = mgr.getInvestigation(inv.id)!;
      expect(updated.status).toBe('converged');
    });
  });

  // --------------------------------------------------------------------------
  // listInvestigations
  // --------------------------------------------------------------------------

  describe('listInvestigations', () => {
    it('returns all investigations', () => {
      expect(manager.listInvestigations()).toEqual([]);

      const inv1 = manager.createInvestigation('task-1', 'test-execution', 'Bug 1');
      const inv2 = manager.createInvestigation('task-2', 'coverage-analysis', 'Bug 2');

      const list = manager.listInvestigations();
      expect(list).toHaveLength(2);

      const ids = list.map(i => i.id);
      expect(ids).toContain(inv1.id);
      expect(ids).toContain(inv2.id);
    });
  });

  // --------------------------------------------------------------------------
  // dispose
  // --------------------------------------------------------------------------

  describe('dispose', () => {
    it('clears all state', () => {
      manager.createInvestigation('task-1', 'test-execution', 'Bug 1');
      manager.createInvestigation('task-2', 'coverage-analysis', 'Bug 2');
      expect(manager.listInvestigations()).toHaveLength(2);

      manager.dispose();

      expect(manager.listInvestigations()).toEqual([]);
    });
  });
});

// ============================================================================
// Factory
// ============================================================================

describe('createHypothesisManager', () => {
  it('creates instance with default config', () => {
    const mgr = createHypothesisManager();

    expect(mgr).toBeInstanceOf(HypothesisManager);
    expect(mgr.getConfig()).toEqual(DEFAULT_COMPETING_HYPOTHESES_CONFIG);
  });

  it('accepts custom config', () => {
    const mgr = createHypothesisManager({
      maxHypothesesPerInvestigation: 10,
      convergenceThreshold: 0.3,
      autoRejectThreshold: 0.05,
    });

    const config = mgr.getConfig();
    expect(config.maxHypothesesPerInvestigation).toBe(10);
    expect(config.convergenceThreshold).toBe(0.3);
    expect(config.autoRejectThreshold).toBe(0.05);
    // Non-overridden fields retain defaults
    expect(config.investigationTimeoutMs).toBe(DEFAULT_COMPETING_HYPOTHESES_CONFIG.investigationTimeoutMs);
    expect(config.minEvidenceForConvergence).toBe(DEFAULT_COMPETING_HYPOTHESES_CONFIG.minEvidenceForConvergence);
  });
});
