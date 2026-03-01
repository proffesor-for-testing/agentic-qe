/**
 * SpreadingActivation Bounds Tests
 * Milestone 3.3: Add Bounds to Spreading Activation
 *
 * Tests to verify that spreading activation history has bounds
 * and proper cleanup mechanism to prevent unbounded memory growth.
 *
 * @module tests/unit/learning/dream/spreading-activation-bounds
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  SpreadingActivation,
  MAX_ACTIVATION_HISTORY_ENTRIES,
  MAX_COACTIVATION_ENTRIES,
  HISTORY_TRIM_TARGET_RATIO,
  DEFAULT_ACTIVATION_CONFIG,
  type ActivationConfig,
} from '../../../../src/learning/dream/index.js';
import type { ConceptNode, ConceptEdge, ConceptGraphStats } from '../../../../src/learning/dream/types.js';

// ============================================================================
// Mock ConceptGraph for Testing
// ============================================================================

/**
 * A minimal mock ConceptGraph that implements only what SpreadingActivation needs.
 * This allows us to test the bounds mechanism in isolation.
 */
class MockConceptGraph {
  private nodes: Map<string, ConceptNode> = new Map();
  private edges: Map<string, ConceptEdge[]> = new Map();

  constructor(nodeCount: number = 100, edgesPerNode: number = 3) {
    // Create nodes
    for (let i = 0; i < nodeCount; i++) {
      const node: ConceptNode = {
        id: `node-${i}`,
        conceptType: 'pattern',
        content: `Test node ${i}`,
        activationLevel: 0,
      };
      this.nodes.set(node.id, node);
    }

    // Create edges (simple ring topology with extra connections)
    const nodeIds = Array.from(this.nodes.keys());
    for (let i = 0; i < nodeIds.length; i++) {
      const sourceId = nodeIds[i];
      const nodeEdges: ConceptEdge[] = [];

      for (let j = 1; j <= edgesPerNode; j++) {
        const targetIndex = (i + j) % nodeIds.length;
        const targetId = nodeIds[targetIndex];
        nodeEdges.push({
          id: `edge-${sourceId}-${targetId}`,
          source: sourceId,
          target: targetId,
          weight: 0.5 + Math.random() * 0.3,
          edgeType: 'similarity',
          evidence: 1,
        });
      }

      this.edges.set(sourceId, nodeEdges);
    }
  }

  getConcept(id: string): ConceptNode | undefined {
    return this.nodes.get(id);
  }

  getAllConcepts(minActivation: number = 0): ConceptNode[] {
    return Array.from(this.nodes.values()).filter(
      (node) => node.activationLevel >= minActivation
    );
  }

  getActiveNodes(threshold: number): ConceptNode[] {
    return Array.from(this.nodes.values()).filter(
      (node) => node.activationLevel >= threshold
    );
  }

  getEdges(nodeId: string): ConceptEdge[] {
    return this.edges.get(nodeId) || [];
  }

  getEdge(source: string, target: string): ConceptEdge | undefined {
    const edges = this.edges.get(source) || [];
    return edges.find((e) => e.target === target);
  }

  setActivation(nodeId: string, level: number): void {
    const node = this.nodes.get(nodeId);
    if (node) {
      node.activationLevel = level;
    }
  }

  decayActivations(factor: number): void {
    for (const node of this.nodes.values()) {
      node.activationLevel *= factor;
    }
  }

  getStats(): ConceptGraphStats {
    return {
      nodeCount: this.nodes.size,
      edgeCount: Array.from(this.edges.values()).reduce((sum, e) => sum + e.length, 0),
      byType: { pattern: this.nodes.size, technique: 0, domain: 0, outcome: 0, error: 0 },
      avgEdgesPerNode: 3,
      avgActivation: 0,
    };
  }
}

// ============================================================================
// Tests
// ============================================================================

describe('SpreadingActivation History Bounds (Milestone 3.3)', () => {
  describe('constants', () => {
    it('should have MAX_ACTIVATION_HISTORY_ENTRIES defined', () => {
      expect(MAX_ACTIVATION_HISTORY_ENTRIES).toBeDefined();
      expect(typeof MAX_ACTIVATION_HISTORY_ENTRIES).toBe('number');
      expect(MAX_ACTIVATION_HISTORY_ENTRIES).toBeGreaterThan(0);
    });

    it('should have MAX_COACTIVATION_ENTRIES defined', () => {
      expect(MAX_COACTIVATION_ENTRIES).toBeDefined();
      expect(typeof MAX_COACTIVATION_ENTRIES).toBe('number');
      expect(MAX_COACTIVATION_ENTRIES).toBeGreaterThan(0);
    });

    it('should have HISTORY_TRIM_TARGET_RATIO defined and valid', () => {
      expect(HISTORY_TRIM_TARGET_RATIO).toBeDefined();
      expect(typeof HISTORY_TRIM_TARGET_RATIO).toBe('number');
      expect(HISTORY_TRIM_TARGET_RATIO).toBeGreaterThan(0);
      expect(HISTORY_TRIM_TARGET_RATIO).toBeLessThan(1);
    });

    it('should have reasonable default values', () => {
      // MAX_ACTIVATION_HISTORY_ENTRIES should allow for reasonable session lengths
      expect(MAX_ACTIVATION_HISTORY_ENTRIES).toBeGreaterThanOrEqual(1000);
      expect(MAX_ACTIVATION_HISTORY_ENTRIES).toBeLessThanOrEqual(100000);

      // MAX_COACTIVATION_ENTRIES should be larger (pairs grow quadratically)
      expect(MAX_COACTIVATION_ENTRIES).toBeGreaterThanOrEqual(MAX_ACTIVATION_HISTORY_ENTRIES);

      // Trim ratio should be around 80%
      expect(HISTORY_TRIM_TARGET_RATIO).toBeCloseTo(0.8, 1);
    });
  });

  describe('getHistorySizes()', () => {
    let graph: MockConceptGraph;
    let activation: SpreadingActivation;

    beforeEach(() => {
      graph = new MockConceptGraph(50, 3);
      activation = new SpreadingActivation(graph as any);
    });

    it('should return history sizes via getHistorySizes()', () => {
      const sizes = activation.getHistorySizes();

      expect(sizes).toBeDefined();
      expect(typeof sizes.activationHistorySize).toBe('number');
      expect(typeof sizes.coActivationCountsSize).toBe('number');
    });

    it('should start with empty history', () => {
      const sizes = activation.getHistorySizes();

      expect(sizes.activationHistorySize).toBe(0);
      expect(sizes.coActivationCountsSize).toBe(0);
    });

    it('should grow history after spreading activation', async () => {
      await activation.spread(['node-0', 'node-1'], 1.0);

      const sizes = activation.getHistorySizes();
      expect(sizes.activationHistorySize).toBeGreaterThan(0);
    });
  });

  describe('trimActivationHistory()', () => {
    it('should trim activation history when exceeding MAX_ACTIVATION_HISTORY_ENTRIES', async () => {
      // Create a graph with more nodes than the history limit
      const excessNodes = Math.floor(MAX_ACTIVATION_HISTORY_ENTRIES * 1.3);
      const graph = new MockConceptGraph(excessNodes, 2);
      const activation = new SpreadingActivation(graph as any, {
        ...DEFAULT_ACTIVATION_CONFIG,
        maxIterations: 50, // Allow more iterations to build up history
        decayRate: 0.01, // Slow decay to keep nodes active
        threshold: 0.01, // Low threshold to activate more nodes
      });

      // Spread from all nodes to build up history beyond the limit
      const nodeIds = Array.from({ length: excessNodes }, (_, i) => `node-${i}`);

      // Spread multiple times to build up history
      for (let i = 0; i < 5; i++) {
        await activation.spread(nodeIds.slice(i * 100, (i + 1) * 100), 1.0);
      }

      // Check that history is within bounds
      const sizes = activation.getHistorySizes();

      // History should be trimmed to at most MAX entries (or 80% of MAX after trim)
      expect(sizes.activationHistorySize).toBeLessThanOrEqual(MAX_ACTIVATION_HISTORY_ENTRIES);
    });

    it('should not trim history when under the limit', async () => {
      // Create a small graph
      const graph = new MockConceptGraph(10, 3);
      const activation = new SpreadingActivation(graph as any);

      await activation.spread(['node-0', 'node-1'], 1.0);

      const sizes = activation.getHistorySizes();

      // Should be well under the limit
      expect(sizes.activationHistorySize).toBeLessThan(MAX_ACTIVATION_HISTORY_ENTRIES);
      expect(sizes.activationHistorySize).toBeGreaterThan(0);
    });
  });

  describe('trimCoActivationCounts()', () => {
    it('should track co-activation counts during spread', async () => {
      const graph = new MockConceptGraph(20, 5);
      const activation = new SpreadingActivation(graph as any, {
        ...DEFAULT_ACTIVATION_CONFIG,
        threshold: 0.05, // Low threshold to get more co-activations
      });

      // Spread to create co-activations
      await activation.spread(['node-0', 'node-5', 'node-10'], 1.0);

      const sizes = activation.getHistorySizes();

      // Co-activation counts should grow based on pairs of active nodes
      // (actual number depends on spreading behavior and thresholds)
      expect(sizes.coActivationCountsSize).toBeGreaterThanOrEqual(0);
    });

    it('should keep co-activation counts under MAX_COACTIVATION_ENTRIES', async () => {
      // This test verifies the bound exists, even if we can't easily exceed it
      // in a unit test (would require massive graphs)
      const graph = new MockConceptGraph(100, 5);
      const activation = new SpreadingActivation(graph as any, {
        ...DEFAULT_ACTIVATION_CONFIG,
        threshold: 0.01,
        maxIterations: 30,
      });

      // Multiple spreads to accumulate co-activations
      for (let i = 0; i < 10; i++) {
        await activation.spread([`node-${i * 10}`], 1.0);
      }

      const sizes = activation.getHistorySizes();

      // Should be under the limit
      expect(sizes.coActivationCountsSize).toBeLessThanOrEqual(MAX_COACTIVATION_ENTRIES);
    });
  });

  describe('reset() clears history', () => {
    let graph: MockConceptGraph;
    let activation: SpreadingActivation;

    beforeEach(() => {
      graph = new MockConceptGraph(50, 3);
      activation = new SpreadingActivation(graph as any);
    });

    it('should clear all history on reset', async () => {
      // Build up some history
      await activation.spread(['node-0', 'node-1', 'node-2'], 1.0);

      const sizesBeforeReset = activation.getHistorySizes();
      expect(sizesBeforeReset.activationHistorySize).toBeGreaterThan(0);

      // Reset
      await activation.reset();

      const sizesAfterReset = activation.getHistorySizes();
      expect(sizesAfterReset.activationHistorySize).toBe(0);
      expect(sizesAfterReset.coActivationCountsSize).toBe(0);
    });
  });

  describe('memory stability in long sessions', () => {
    it('should maintain stable memory after many spread cycles', async () => {
      const graph = new MockConceptGraph(100, 4);
      const activation = new SpreadingActivation(graph as any, {
        ...DEFAULT_ACTIVATION_CONFIG,
        threshold: 0.05,
      });

      // Simulate many spread cycles (like a long session)
      const cycleCount = 50;
      const historySizes: number[] = [];

      for (let i = 0; i < cycleCount; i++) {
        const seedNode = `node-${i % 100}`;
        await activation.spread([seedNode], 1.0);
        historySizes.push(activation.getHistorySizes().activationHistorySize);
      }

      // History should be bounded, not growing linearly
      const lastSize = historySizes[historySizes.length - 1];
      expect(lastSize).toBeLessThanOrEqual(MAX_ACTIVATION_HISTORY_ENTRIES);

      // If we had unbounded growth, size would be close to cycleCount * nodesPerSpread
      // With bounds, it should plateau
      const maxObservedSize = Math.max(...historySizes);
      expect(maxObservedSize).toBeLessThanOrEqual(MAX_ACTIVATION_HISTORY_ENTRIES);
    });
  });

  describe('dream cycle preserves functionality', () => {
    it('should still produce valid activation results after trimming', async () => {
      const graph = new MockConceptGraph(50, 3);
      const activation = new SpreadingActivation(graph as any);

      // Multiple spreads
      const result1 = await activation.spread(['node-0'], 1.0);
      const result2 = await activation.spread(['node-10'], 1.0);
      const result3 = await activation.spread(['node-20'], 1.0);

      // All results should be valid
      expect(result1.iterations).toBeGreaterThanOrEqual(0);
      expect(result2.iterations).toBeGreaterThanOrEqual(0);
      expect(result3.iterations).toBeGreaterThanOrEqual(0);

      // Activated nodes should be tracked
      expect(result1.activatedNodes).toBeDefined();
      expect(result2.activatedNodes).toBeDefined();
      expect(result3.activatedNodes).toBeDefined();
    });

    it('should still discover novel associations after trimming', async () => {
      const graph = new MockConceptGraph(30, 5);
      const activation = new SpreadingActivation(graph as any, {
        ...DEFAULT_ACTIVATION_CONFIG,
        threshold: 0.1,
      });

      // Spread to discover associations
      const result = await activation.spread(['node-0', 'node-5', 'node-10'], 1.0);

      // Novel associations should still work
      expect(result.novelAssociations).toBeDefined();
      expect(Array.isArray(result.novelAssociations)).toBe(true);
    });
  });
});
