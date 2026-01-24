/**
 * Belief Reconciler Tests
 * ADR-052: Strange Loop Belief Reconciliation Protocol
 *
 * Tests for the belief reconciliation system that handles
 * contradictory beliefs detected by the CoherenceService.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  BeliefReconciler,
  createBeliefReconciler,
  DEFAULT_BELIEF_RECONCILER_CONFIG,
  type ReconciliationStrategy,
  type BeliefVote,
  type IVoteCollector,
  type IWitnessAdapter,
} from '../../../src/strange-loop/belief-reconciler.js';
import type { Belief, Contradiction, WitnessRecord } from '../../../src/integrations/coherence/types.js';

// ============================================================================
// Test Helpers
// ============================================================================

function createTestBelief(
  id: string,
  statement: string,
  confidence: number,
  timestamp: Date = new Date()
): Belief {
  return {
    id,
    statement,
    embedding: Array(128).fill(0).map(() => Math.random()),
    confidence,
    source: `test-agent-${id}`,
    timestamp,
    evidence: [`Evidence for ${id}`],
  };
}

function createTestContradiction(
  nodeId1: string,
  nodeId2: string,
  severity: 'low' | 'medium' | 'high' | 'critical' = 'medium'
): Contradiction {
  return {
    nodeIds: [nodeId1, nodeId2],
    severity,
    description: `Contradiction between ${nodeId1} and ${nodeId2}`,
    confidence: 0.9,
    resolution: 'Resolve by reconciliation',
  };
}

class MockVoteCollector implements IVoteCollector {
  private votes: BeliefVote[] = [];

  setVotes(votes: BeliefVote[]): void {
    this.votes = votes;
  }

  async collectVotes(): Promise<BeliefVote[]> {
    return this.votes;
  }
}

class MockWitnessAdapter implements IWitnessAdapter {
  public witnessCount = 0;

  async createWitness(data: unknown): Promise<WitnessRecord> {
    this.witnessCount++;
    return {
      witnessId: `witness-${this.witnessCount}`,
      decisionId: (data as { id?: string })?.id || 'unknown',
      hash: `hash-${Date.now()}`,
      chainPosition: this.witnessCount,
      timestamp: new Date(),
    };
  }
}

// ============================================================================
// Tests
// ============================================================================

describe('BeliefReconciler', () => {
  describe('createBeliefReconciler', () => {
    it('should create reconciler with default config', () => {
      const reconciler = createBeliefReconciler();
      expect(reconciler).toBeInstanceOf(BeliefReconciler);
      expect(reconciler.getStrategy()).toBe(DEFAULT_BELIEF_RECONCILER_CONFIG.defaultStrategy);
    });

    it('should create reconciler with custom config', () => {
      const reconciler = createBeliefReconciler({
        defaultStrategy: 'consensus',
        authorityThreshold: 0.9,
      });
      expect(reconciler.getStrategy()).toBe('consensus');
    });

    it('should accept custom vote collector and witness adapter', () => {
      const voteCollector = new MockVoteCollector();
      const witnessAdapter = new MockWitnessAdapter();

      const reconciler = createBeliefReconciler(
        { enableWitness: true },
        { voteCollector, witnessAdapter }
      );

      expect(reconciler).toBeInstanceOf(BeliefReconciler);
    });
  });

  describe('Strategy Management', () => {
    let reconciler: BeliefReconciler;

    beforeEach(() => {
      reconciler = createBeliefReconciler({ defaultStrategy: 'latest' });
    });

    it('should get current strategy', () => {
      expect(reconciler.getStrategy()).toBe('latest');
    });

    it('should set new strategy', () => {
      reconciler.setStrategy('authority');
      expect(reconciler.getStrategy()).toBe('authority');
    });

    it('should emit strategy_changed event', () => {
      const listener = vi.fn();
      reconciler.on('strategy_changed', listener);

      reconciler.setStrategy('consensus');

      expect(listener).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'strategy_changed',
          data: {
            oldStrategy: 'latest',
            newStrategy: 'consensus',
          },
        })
      );
    });

    it('should reset failure count on strategy change', async () => {
      // Set up auto-escalation
      const escalatingReconciler = createBeliefReconciler({
        defaultStrategy: 'authority',
        autoEscalateOnFailure: true,
        failuresBeforeEscalate: 2,
        authorityThreshold: 0.99, // Will cause failures
      });

      const belief1 = createTestBelief('b1', 'Test 1', 0.5);
      const belief2 = createTestBelief('b2', 'Test 2', 0.5);
      escalatingReconciler.registerBeliefs([belief1, belief2]);

      const contradiction = createTestContradiction('b1', 'b2');

      // Cause failures
      await escalatingReconciler.reconcile([contradiction]);
      await escalatingReconciler.reconcile([contradiction]);

      // Change strategy - should reset failure count
      escalatingReconciler.setStrategy('latest');

      // Next reconciliation should use 'latest', not 'escalate'
      const result = await escalatingReconciler.reconcile([contradiction]);
      expect(result.strategy).toBe('latest');
    });
  });

  describe('Belief Registration', () => {
    let reconciler: BeliefReconciler;

    beforeEach(() => {
      reconciler = createBeliefReconciler();
    });

    it('should register single belief', () => {
      const belief = createTestBelief('b1', 'Test belief', 0.8);
      reconciler.registerBelief(belief);
      // Verify by attempting reconciliation that uses the belief
      // (The belief will be found in the store)
    });

    it('should register multiple beliefs', () => {
      const beliefs = [
        createTestBelief('b1', 'Test 1', 0.8),
        createTestBelief('b2', 'Test 2', 0.7),
        createTestBelief('b3', 'Test 3', 0.6),
      ];
      reconciler.registerBeliefs(beliefs);
    });

    it('should clear beliefs', async () => {
      const belief = createTestBelief('b1', 'Test belief', 0.8);
      reconciler.registerBelief(belief);
      reconciler.clearBeliefs();

      // After clearing, reconciliation should fail to find beliefs
      const contradiction = createTestContradiction('b1', 'b2');
      const result = await reconciler.reconcile([contradiction]);
      expect(result).toHaveProperty('unresolvedContradictions');
      expect(result.unresolvedContradictions).toHaveLength(1);
    });
  });

  describe('Latest Strategy', () => {
    let reconciler: BeliefReconciler;

    beforeEach(() => {
      reconciler = createBeliefReconciler({ defaultStrategy: 'latest' });
    });

    it('should prefer newer belief', async () => {
      const older = createTestBelief('b1', 'Old statement', 0.8, new Date('2024-01-01'));
      const newer = createTestBelief('b2', 'New statement', 0.7, new Date('2024-06-01'));

      reconciler.registerBeliefs([older, newer]);

      const contradiction = createTestContradiction('b1', 'b2');
      const result = await reconciler.reconcile([contradiction]);

      expect(result.success).toBe(true);
      expect(result.strategy).toBe('latest');
      expect(result.resolvedContradictions).toHaveLength(1);
      expect(result.newBeliefs).toHaveLength(1);
      expect(result.newBeliefs[0].statement).toBe('New statement');
    });

    it('should handle contradictions with missing beliefs', async () => {
      const belief = createTestBelief('b1', 'Only belief', 0.8);
      reconciler.registerBelief(belief);

      const contradiction = createTestContradiction('b1', 'missing');
      const result = await reconciler.reconcile([contradiction]);

      expect(result.unresolvedContradictions).toHaveLength(1);
    });
  });

  describe('Authority Strategy', () => {
    let reconciler: BeliefReconciler;

    beforeEach(() => {
      reconciler = createBeliefReconciler({
        defaultStrategy: 'authority',
        authorityThreshold: 0.7,
      });
    });

    it('should prefer higher confidence belief', async () => {
      const lowConf = createTestBelief('b1', 'Low confidence', 0.5);
      const highConf = createTestBelief('b2', 'High confidence', 0.9);

      reconciler.registerBeliefs([lowConf, highConf]);

      const contradiction = createTestContradiction('b1', 'b2');
      const result = await reconciler.reconcile([contradiction]);

      expect(result.success).toBe(true);
      expect(result.strategy).toBe('authority');
      expect(result.newBeliefs[0].statement).toBe('High confidence');
    });

    it('should not resolve when neither belief meets threshold', async () => {
      const lowConf1 = createTestBelief('b1', 'Low 1', 0.3);
      const lowConf2 = createTestBelief('b2', 'Low 2', 0.4);

      reconciler.registerBeliefs([lowConf1, lowConf2]);

      const contradiction = createTestContradiction('b1', 'b2');
      const result = await reconciler.reconcile([contradiction]);

      expect(result.unresolvedContradictions).toHaveLength(1);
      expect(result.resolvedContradictions).toHaveLength(0);
    });
  });

  describe('Consensus Strategy', () => {
    let reconciler: BeliefReconciler;
    let voteCollector: MockVoteCollector;

    beforeEach(() => {
      voteCollector = new MockVoteCollector();
      reconciler = createBeliefReconciler(
        {
          defaultStrategy: 'consensus',
          consensusThreshold: 0.6,
          consensusTimeoutMs: 1000,
        },
        { voteCollector }
      );
    });

    it('should resolve when consensus is reached', async () => {
      const belief1 = createTestBelief('b1', 'Belief 1', 0.8);
      const belief2 = createTestBelief('b2', 'Belief 2', 0.7);
      reconciler.registerBeliefs([belief1, belief2]);

      // Set up votes favoring belief1
      voteCollector.setVotes([
        { agentId: 'agent-1', beliefId: 'b1', confidence: 0.9 },
        { agentId: 'agent-2', beliefId: 'b1', confidence: 0.8 },
        { agentId: 'agent-3', beliefId: 'b2', confidence: 0.5 },
      ]);

      const contradiction = createTestContradiction('b1', 'b2');
      const result = await reconciler.reconcile([contradiction]);

      expect(result.success).toBe(true);
      expect(result.strategy).toBe('consensus');
      expect(result.newBeliefs[0].statement).toBe('Belief 1');
    });

    it('should not resolve when no votes received', async () => {
      const belief1 = createTestBelief('b1', 'Belief 1', 0.8);
      const belief2 = createTestBelief('b2', 'Belief 2', 0.7);
      reconciler.registerBeliefs([belief1, belief2]);

      voteCollector.setVotes([]); // No votes

      const contradiction = createTestContradiction('b1', 'b2');
      const result = await reconciler.reconcile([contradiction]);

      expect(result.unresolvedContradictions).toHaveLength(1);
    });

    it('should not resolve when consensus threshold not met', async () => {
      const belief1 = createTestBelief('b1', 'Belief 1', 0.8);
      const belief2 = createTestBelief('b2', 'Belief 2', 0.7);
      reconciler.registerBeliefs([belief1, belief2]);

      // Set up votes with no clear winner
      voteCollector.setVotes([
        { agentId: 'agent-1', beliefId: 'b1', confidence: 0.5 },
        { agentId: 'agent-2', beliefId: 'b2', confidence: 0.5 },
      ]);

      const contradiction = createTestContradiction('b1', 'b2');
      const result = await reconciler.reconcile([contradiction]);

      expect(result.unresolvedContradictions).toHaveLength(1);
    });
  });

  describe('Merge Strategy', () => {
    let reconciler: BeliefReconciler;

    beforeEach(() => {
      reconciler = createBeliefReconciler({
        defaultStrategy: 'merge',
        mergeSimilarityThreshold: 0.5, // Lower threshold for testing
      });
    });

    it('should merge similar beliefs', async () => {
      // Create beliefs with similar embeddings
      const embedding = Array(128).fill(0).map(() => Math.random());
      const belief1: Belief = {
        id: 'b1',
        statement: 'System is healthy',
        embedding: [...embedding],
        confidence: 0.8,
        source: 'agent-1',
        timestamp: new Date(),
      };
      const belief2: Belief = {
        id: 'b2',
        statement: 'System is operational',
        embedding: embedding.map(v => v + Math.random() * 0.1), // Slightly different
        confidence: 0.7,
        source: 'agent-2',
        timestamp: new Date(),
      };

      reconciler.registerBeliefs([belief1, belief2]);

      const contradiction = createTestContradiction('b1', 'b2');
      const result = await reconciler.reconcile([contradiction]);

      expect(result.strategy).toBe('merge');
      if (result.success) {
        expect(result.newBeliefs.length).toBeGreaterThan(0);
        expect(result.newBeliefs[0].source).toContain('merged');
      }
    });
  });

  describe('Escalate Strategy', () => {
    let reconciler: BeliefReconciler;

    beforeEach(() => {
      reconciler = createBeliefReconciler({ defaultStrategy: 'escalate' });
    });

    it('should emit escalation event', async () => {
      const listener = vi.fn();
      reconciler.on('escalation_requested', listener);

      const belief1 = createTestBelief('b1', 'Belief 1', 0.8);
      const belief2 = createTestBelief('b2', 'Belief 2', 0.7);
      reconciler.registerBeliefs([belief1, belief2]);

      const contradiction = createTestContradiction('b1', 'b2');
      await reconciler.reconcile([contradiction]);

      expect(listener).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'escalation_requested',
        })
      );
    });

    it('should mark contradictions as unresolved but return success', async () => {
      const belief1 = createTestBelief('b1', 'Belief 1', 0.8);
      const belief2 = createTestBelief('b2', 'Belief 2', 0.7);
      reconciler.registerBeliefs([belief1, belief2]);

      const contradiction = createTestContradiction('b1', 'b2');
      const result = await reconciler.reconcile([contradiction]);

      expect(result.success).toBe(true);
      expect(result.strategy).toBe('escalate');
      expect(result.unresolvedContradictions).toHaveLength(1);
      expect(result.resolvedContradictions).toHaveLength(0);
    });
  });

  describe('Auto-Escalation', () => {
    it('should auto-escalate after repeated failures', async () => {
      const reconciler = createBeliefReconciler({
        defaultStrategy: 'authority',
        authorityThreshold: 0.99, // Will cause failures
        autoEscalateOnFailure: true,
        failuresBeforeEscalate: 2,
      });

      const belief1 = createTestBelief('b1', 'Test 1', 0.5);
      const belief2 = createTestBelief('b2', 'Test 2', 0.5);
      reconciler.registerBeliefs([belief1, belief2]);

      const contradiction = createTestContradiction('b1', 'b2');

      // First failure
      const result1 = await reconciler.reconcile([contradiction]);
      expect(result1.strategy).toBe('authority');

      // Second failure
      const result2 = await reconciler.reconcile([contradiction]);
      expect(result2.strategy).toBe('authority');

      // Should auto-escalate on third attempt
      const result3 = await reconciler.reconcile([contradiction]);
      expect(result3.strategy).toBe('escalate');
    });

    it('should not auto-escalate when disabled', async () => {
      const reconciler = createBeliefReconciler({
        defaultStrategy: 'authority',
        authorityThreshold: 0.99,
        autoEscalateOnFailure: false,
        failuresBeforeEscalate: 2,
      });

      const belief1 = createTestBelief('b1', 'Test 1', 0.5);
      const belief2 = createTestBelief('b2', 'Test 2', 0.5);
      reconciler.registerBeliefs([belief1, belief2]);

      const contradiction = createTestContradiction('b1', 'b2');

      // Multiple failures
      await reconciler.reconcile([contradiction]);
      await reconciler.reconcile([contradiction]);
      const result = await reconciler.reconcile([contradiction]);

      // Should still use authority strategy
      expect(result.strategy).toBe('authority');
    });
  });

  describe('Witness Records', () => {
    it('should create witness record on successful reconciliation', async () => {
      const witnessAdapter = new MockWitnessAdapter();
      const reconciler = createBeliefReconciler(
        {
          defaultStrategy: 'latest',
          enableWitness: true,
        },
        { witnessAdapter }
      );

      const older = createTestBelief('b1', 'Old', 0.8, new Date('2024-01-01'));
      const newer = createTestBelief('b2', 'New', 0.7, new Date('2024-06-01'));
      reconciler.registerBeliefs([older, newer]);

      const contradiction = createTestContradiction('b1', 'b2');
      const result = await reconciler.reconcile([contradiction]);

      expect(result.witnessId).toBeDefined();
      expect(witnessAdapter.witnessCount).toBe(1);
    });

    it('should not create witness when disabled', async () => {
      const witnessAdapter = new MockWitnessAdapter();
      const reconciler = createBeliefReconciler(
        {
          defaultStrategy: 'latest',
          enableWitness: false,
        },
        { witnessAdapter }
      );

      const older = createTestBelief('b1', 'Old', 0.8, new Date('2024-01-01'));
      const newer = createTestBelief('b2', 'New', 0.7, new Date('2024-06-01'));
      reconciler.registerBeliefs([older, newer]);

      const contradiction = createTestContradiction('b1', 'b2');
      const result = await reconciler.reconcile([contradiction]);

      expect(result.witnessId).toBeUndefined();
      expect(witnessAdapter.witnessCount).toBe(0);
    });
  });

  describe('History', () => {
    let reconciler: BeliefReconciler;

    beforeEach(() => {
      reconciler = createBeliefReconciler({
        defaultStrategy: 'latest',
        maxHistorySize: 5,
      });

      const older = createTestBelief('b1', 'Old', 0.8, new Date('2024-01-01'));
      const newer = createTestBelief('b2', 'New', 0.7, new Date('2024-06-01'));
      reconciler.registerBeliefs([older, newer]);
    });

    it('should record reconciliations in history', async () => {
      const contradiction = createTestContradiction('b1', 'b2');
      await reconciler.reconcile([contradiction]);

      const history = reconciler.getHistory();
      expect(history).toHaveLength(1);
      expect(history[0].contradictions).toHaveLength(1);
      expect(history[0].result.success).toBe(true);
    });

    it('should limit history size', async () => {
      const contradiction = createTestContradiction('b1', 'b2');

      // Add more than maxHistorySize
      for (let i = 0; i < 10; i++) {
        await reconciler.reconcile([contradiction]);
      }

      const history = reconciler.getHistory();
      expect(history).toHaveLength(5); // maxHistorySize
    });

    it('should clear history', async () => {
      const contradiction = createTestContradiction('b1', 'b2');
      await reconciler.reconcile([contradiction]);

      reconciler.clearHistory();

      expect(reconciler.getHistory()).toHaveLength(0);
    });
  });

  describe('Statistics', () => {
    let reconciler: BeliefReconciler;

    beforeEach(() => {
      reconciler = createBeliefReconciler({ defaultStrategy: 'latest' });

      const older = createTestBelief('b1', 'Old', 0.8, new Date('2024-01-01'));
      const newer = createTestBelief('b2', 'New', 0.7, new Date('2024-06-01'));
      reconciler.registerBeliefs([older, newer]);
    });

    it('should track statistics', async () => {
      const contradiction = createTestContradiction('b1', 'b2');

      // Perform some reconciliations
      await reconciler.reconcile([contradiction]);
      await reconciler.reconcile([contradiction]);

      const stats = reconciler.getStats();

      expect(stats.totalReconciliations).toBe(2);
      expect(stats.successfulReconciliations).toBe(2);
      expect(stats.failedReconciliations).toBe(0);
      expect(stats.totalContradictionsResolved).toBe(2);
      expect(stats.strategyDistribution.latest).toBe(2);
      expect(stats.avgDurationMs).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Events', () => {
    let reconciler: BeliefReconciler;

    beforeEach(() => {
      reconciler = createBeliefReconciler({ defaultStrategy: 'latest' });

      const older = createTestBelief('b1', 'Old', 0.8, new Date('2024-01-01'));
      const newer = createTestBelief('b2', 'New', 0.7, new Date('2024-06-01'));
      reconciler.registerBeliefs([older, newer]);
    });

    it('should emit belief_reconciliation_started event', async () => {
      const listener = vi.fn();
      reconciler.on('belief_reconciliation_started', listener);

      const contradiction = createTestContradiction('b1', 'b2');
      await reconciler.reconcile([contradiction]);

      expect(listener).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'belief_reconciliation_started',
          data: expect.objectContaining({
            contradictionCount: 1,
            strategy: 'latest',
          }),
        })
      );
    });

    it('should emit belief_reconciled event on success', async () => {
      const listener = vi.fn();
      reconciler.on('belief_reconciled', listener);

      const contradiction = createTestContradiction('b1', 'b2');
      await reconciler.reconcile([contradiction]);

      expect(listener).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'belief_reconciled',
          data: expect.objectContaining({
            resolvedCount: 1,
          }),
        })
      );
    });

    it('should remove event listener', async () => {
      const listener = vi.fn();
      reconciler.on('belief_reconciled', listener);
      reconciler.off('belief_reconciled', listener);

      const contradiction = createTestContradiction('b1', 'b2');
      await reconciler.reconcile([contradiction]);

      expect(listener).not.toHaveBeenCalled();
    });
  });

  describe('Empty Contradictions', () => {
    it('should handle empty contradiction array', async () => {
      const reconciler = createBeliefReconciler();

      const result = await reconciler.reconcile([]);

      expect(result.success).toBe(true);
      expect(result.resolvedContradictions).toHaveLength(0);
      expect(result.unresolvedContradictions).toHaveLength(0);
      expect(result.newBeliefs).toHaveLength(0);
    });
  });

  describe('Multiple Contradictions', () => {
    it('should handle multiple contradictions', async () => {
      const reconciler = createBeliefReconciler({ defaultStrategy: 'latest' });

      const b1 = createTestBelief('b1', 'Belief 1', 0.8, new Date('2024-01-01'));
      const b2 = createTestBelief('b2', 'Belief 2', 0.7, new Date('2024-06-01'));
      const b3 = createTestBelief('b3', 'Belief 3', 0.6, new Date('2024-02-01'));
      const b4 = createTestBelief('b4', 'Belief 4', 0.9, new Date('2024-08-01'));

      reconciler.registerBeliefs([b1, b2, b3, b4]);

      const contradictions = [
        createTestContradiction('b1', 'b2'),
        createTestContradiction('b3', 'b4'),
      ];

      const result = await reconciler.reconcile(contradictions);

      expect(result.success).toBe(true);
      expect(result.resolvedContradictions).toHaveLength(2);
      expect(result.newBeliefs).toHaveLength(2);
    });
  });
});
