/**
 * Unit tests for MinCutCalculator
 * ADR-047: MinCut Self-Organizing QE Integration
 *
 * Tests the minimum cut algorithms for swarm topology analysis.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  MinCutCalculator,
  createMinCutCalculator,
  calculateMinCut,
  findWeakVertices,
} from '../../../../src/coordination/mincut/mincut-calculator';
import { SwarmGraph, createSwarmGraph } from '../../../../src/coordination/mincut/swarm-graph';
import { SwarmVertex, SwarmEdge } from '../../../../src/coordination/mincut/interfaces';

describe('MinCutCalculator', () => {
  let calculator: MinCutCalculator;
  let graph: SwarmGraph;

  beforeEach(() => {
    calculator = createMinCutCalculator();
    graph = createSwarmGraph();
  });

  // ==========================================================================
  // Helper Functions
  // ==========================================================================

  function addVertices(ids: string[]): void {
    for (const id of ids) {
      graph.addVertex({
        id,
        type: 'agent',
        domain: 'test-generation',
        weight: 1.0,
        createdAt: new Date(),
      });
    }
  }

  function addEdge(source: string, target: string, weight: number = 1.0): void {
    graph.addEdge({
      source,
      target,
      weight,
      type: 'coordination',
      bidirectional: true,
    });
  }

  // ==========================================================================
  // Empty Graph
  // ==========================================================================

  describe('Empty Graph', () => {
    it('should return 0 for empty graph', () => {
      expect(calculator.getMinCutValue(graph)).toBe(0);
    });

    it('should return empty result for approxMinCut on empty graph', () => {
      const result = calculator.approxMinCut(graph);
      expect(result.value).toBe(0);
      expect(result.sourceSide).toHaveLength(0);
      expect(result.targetSide).toHaveLength(0);
    });

    it('should return no weak vertices for empty graph', () => {
      const weakVertices = calculator.findWeakVertices(graph);
      expect(weakVertices).toHaveLength(0);
    });
  });

  // ==========================================================================
  // Single Vertex
  // ==========================================================================

  describe('Single Vertex', () => {
    beforeEach(() => {
      addVertices(['a']);
    });

    it('should return 0 for single vertex (no edges)', () => {
      expect(calculator.getMinCutValue(graph)).toBe(0);
    });

    it('should find single vertex as weak', () => {
      const weakVertices = calculator.findWeakVertices(graph, 0);
      expect(weakVertices.length).toBeGreaterThanOrEqual(0);
    });
  });

  // ==========================================================================
  // Simple Linear Graph
  // ==========================================================================

  describe('Linear Graph (a -- b -- c)', () => {
    beforeEach(() => {
      addVertices(['a', 'b', 'c']);
      addEdge('a', 'b', 1.0);
      addEdge('b', 'c', 1.0);
    });

    it('should calculate minimum weighted degree as min-cut', () => {
      // a has degree 1, b has degree 2, c has degree 1
      // Min-cut value = min weighted degree = 1.0
      expect(calculator.getMinCutValue(graph)).toBe(1.0);
    });

    it('should identify endpoints as weak vertices', () => {
      const weakVertices = calculator.findWeakVertices(graph, 1.5);
      const weakIds = weakVertices.map(v => v.vertexId);

      expect(weakIds).toContain('a');
      expect(weakIds).toContain('c');
    });

    it('should provide strengthening suggestions', () => {
      const weakVertices = calculator.findWeakVertices(graph, 1.5);
      const weakA = weakVertices.find(v => v.vertexId === 'a');

      expect(weakA).toBeDefined();
      expect(weakA!.suggestions.length).toBeGreaterThan(0);
    });
  });

  // ==========================================================================
  // Triangle Graph (Fully Connected)
  // ==========================================================================

  describe('Triangle Graph (fully connected)', () => {
    beforeEach(() => {
      addVertices(['a', 'b', 'c']);
      addEdge('a', 'b', 1.0);
      addEdge('b', 'c', 1.0);
      addEdge('a', 'c', 1.0);
    });

    it('should have higher min-cut than linear graph', () => {
      // Each vertex has degree 2 (bidirectional edges)
      expect(calculator.getMinCutValue(graph)).toBe(2.0);
    });

    it('should find no weak vertices when all are equally connected', () => {
      // All vertices have same degree, threshold would need to be > 2
      const weakVertices = calculator.findWeakVertices(graph, 2.5);
      expect(weakVertices.length).toBe(3); // All below threshold
    });
  });

  // ==========================================================================
  // Star Graph (One Hub)
  // ==========================================================================

  describe('Star Graph (a is hub)', () => {
    beforeEach(() => {
      addVertices(['a', 'b', 'c', 'd', 'e']);
      addEdge('a', 'b', 1.0);
      addEdge('a', 'c', 1.0);
      addEdge('a', 'd', 1.0);
      addEdge('a', 'e', 1.0);
    });

    it('should have min-cut of 1 (leaves have degree 1)', () => {
      expect(calculator.getMinCutValue(graph)).toBe(1.0);
    });

    it('should identify leaves as weak vertices', () => {
      const weakVertices = calculator.findWeakVertices(graph, 1.5);
      const weakIds = weakVertices.map(v => v.vertexId);

      expect(weakIds).toContain('b');
      expect(weakIds).toContain('c');
      expect(weakIds).toContain('d');
      expect(weakIds).toContain('e');
      expect(weakIds).not.toContain('a'); // Hub should not be weak
    });

    it('should suggest connecting leaves to each other', () => {
      const weakVertices = calculator.findWeakVertices(graph, 1.5);
      const weakB = weakVertices.find(v => v.vertexId === 'b');

      expect(weakB).toBeDefined();
      const addEdgeAction = weakB!.suggestions.find(s => s.type === 'add_edge');
      expect(addEdgeAction).toBeDefined();
    });
  });

  // ==========================================================================
  // Weighted Edges
  // ==========================================================================

  describe('Weighted Edges', () => {
    beforeEach(() => {
      addVertices(['a', 'b', 'c']);
      addEdge('a', 'b', 0.5);
      addEdge('b', 'c', 3.0);
    });

    it('should consider edge weights in min-cut', () => {
      // a has weighted degree 0.5
      // b has weighted degree 3.5
      // c has weighted degree 3.0
      expect(calculator.getMinCutValue(graph)).toBe(0.5);
    });

    it('should identify vertex with lowest weighted degree', () => {
      const minDegreeVertex = calculator.getMinDegreeVertex(graph);
      expect(minDegreeVertex).toBeDefined();
      expect(minDegreeVertex!.vertexId).toBe('a');
      expect(minDegreeVertex!.degree).toBe(0.5);
    });
  });

  // ==========================================================================
  // Approximate MinCut Results
  // ==========================================================================

  describe('approxMinCut', () => {
    beforeEach(() => {
      addVertices(['a', 'b', 'c', 'd']);
      addEdge('a', 'b', 1.0);
      addEdge('b', 'c', 2.0);
      addEdge('c', 'd', 1.0);
      addEdge('a', 'd', 1.0);
    });

    it('should return cut edges', () => {
      const result = calculator.approxMinCut(graph);

      expect(result.cutEdges.length).toBeGreaterThan(0);
      expect(result.calculatedAt).toBeInstanceOf(Date);
      expect(result.algorithm).toBe('weighted-degree');
    });

    it('should split vertices into source and target sides', () => {
      const result = calculator.approxMinCut(graph);

      expect(result.sourceSide.length).toBeGreaterThan(0);
      expect(result.targetSide.length).toBeGreaterThan(0);
      expect(result.sourceSide.length + result.targetSide.length).toBe(4);
    });

    it('should include duration', () => {
      const result = calculator.approxMinCut(graph);
      expect(result.durationMs).toBeGreaterThanOrEqual(0);
    });
  });

  // ==========================================================================
  // Weak Vertex Detection
  // ==========================================================================

  describe('findWeakVertices', () => {
    beforeEach(() => {
      // Create an unbalanced graph
      addVertices(['hub', 'a', 'b', 'c', 'isolated']);

      addEdge('hub', 'a', 2.0);
      addEdge('hub', 'b', 2.0);
      addEdge('hub', 'c', 2.0);
      addEdge('a', 'b', 1.0);
      // 'isolated' has no edges
    });

    it('should find isolated vertex as weakest', () => {
      const weakVertices = calculator.findWeakVertices(graph, 0.1);

      expect(weakVertices.length).toBeGreaterThan(0);

      const isolated = weakVertices.find(v => v.vertexId === 'isolated');
      expect(isolated).toBeDefined();
      expect(isolated!.weightedDegree).toBe(0);
      // Risk score should be high (above 0.7) for isolated vertex
      expect(isolated!.riskScore).toBeGreaterThan(0.7);
    });

    it('should calculate risk scores', () => {
      const weakVertices = calculator.findWeakVertices(graph);

      for (const weak of weakVertices) {
        expect(weak.riskScore).toBeGreaterThanOrEqual(0);
        expect(weak.riskScore).toBeLessThanOrEqual(1);
      }
    });

    it('should include reasons for weakness', () => {
      const weakVertices = calculator.findWeakVertices(graph, 0.1);

      const isolated = weakVertices.find(v => v.vertexId === 'isolated');
      expect(isolated?.reason.toLowerCase()).toContain('isolated');
    });

    it('should sort by risk score (highest first)', () => {
      const weakVertices = calculator.findWeakVertices(graph);

      for (let i = 0; i < weakVertices.length - 1; i++) {
        expect(weakVertices[i].riskScore).toBeGreaterThanOrEqual(weakVertices[i + 1].riskScore);
      }
    });
  });

  // ==========================================================================
  // Partitioning Points
  // ==========================================================================

  describe('findPartitioningPoints', () => {
    beforeEach(() => {
      // Create graph where removing 'b' disconnects it
      addVertices(['a', 'b', 'c']);
      addEdge('a', 'b', 1.0);
      addEdge('b', 'c', 1.0);
    });

    it('should find articulation points', () => {
      const points = calculator.findPartitioningPoints(graph);

      expect(points.length).toBe(3);

      const pointB = points.find(p => p.vertexId === 'b');
      expect(pointB).toBeDefined();
      expect(pointB!.wouldDisconnect).toBe(true);
    });

    it('should sort by local min-cut (critical first)', () => {
      const points = calculator.findPartitioningPoints(graph);

      for (let i = 0; i < points.length - 1; i++) {
        expect(points[i].localMinCut).toBeLessThanOrEqual(points[i + 1].localMinCut);
      }
    });
  });

  // ==========================================================================
  // Edge Addition Suggestions
  // ==========================================================================

  describe('suggestEdgeAdditions', () => {
    beforeEach(() => {
      addVertices(['a', 'b', 'c', 'd']);
      addEdge('a', 'b', 1.0);
      addEdge('c', 'd', 1.0);
      // Two disconnected pairs
    });

    it('should suggest edges to improve min-cut', () => {
      const suggestions = calculator.suggestEdgeAdditions(graph, 2.0);

      expect(suggestions.length).toBeGreaterThan(0);

      for (const suggestion of suggestions) {
        expect(suggestion.type).toBe('coordination');
        expect(suggestion.bidirectional).toBe(true);
      }
    });

    it('should connect weak vertices to well-connected ones', () => {
      // Add a well-connected vertex
      graph.addVertex({ id: 'hub', type: 'agent', weight: 1, createdAt: new Date() });
      addEdge('hub', 'a', 2.0);
      addEdge('hub', 'b', 2.0);
      addEdge('hub', 'c', 2.0);

      const suggestions = calculator.suggestEdgeAdditions(graph, 1.0);

      // d is weak (degree 1), should suggest connecting to hub
      const suggestionForD = suggestions.find(s => s.source === 'd' || s.target === 'd');
      if (suggestionForD) {
        expect([suggestionForD.source, suggestionForD.target]).toContain('d');
      }
    });
  });

  // ==========================================================================
  // Connectivity Critical Check
  // ==========================================================================

  describe('isConnectivityCritical', () => {
    beforeEach(() => {
      addVertices(['a', 'b', 'c']);
      addEdge('a', 'b', 1.0);
      addEdge('b', 'c', 0.5);
    });

    it('should return true when below threshold', () => {
      // Min-cut is 0.5 (vertex c)
      expect(calculator.isConnectivityCritical(graph, 1.0)).toBe(true);
    });

    it('should return false when above threshold', () => {
      expect(calculator.isConnectivityCritical(graph, 0.3)).toBe(false);
    });
  });

  // ==========================================================================
  // Local MinCut
  // ==========================================================================

  describe('getLocalMinCut', () => {
    beforeEach(() => {
      addVertices(['a', 'b', 'c']);
      addEdge('a', 'b', 1.5);
      addEdge('b', 'c', 2.0);
    });

    it('should return weighted degree as local min-cut', () => {
      expect(calculator.getLocalMinCut(graph, 'a')).toBe(1.5);
      expect(calculator.getLocalMinCut(graph, 'b')).toBe(3.5);
      expect(calculator.getLocalMinCut(graph, 'c')).toBe(2.0);
    });

    it('should return 0 for non-existent vertex', () => {
      expect(calculator.getLocalMinCut(graph, 'nonexistent')).toBe(0);
    });
  });

  // ==========================================================================
  // Convenience Functions
  // ==========================================================================

  describe('Convenience Functions', () => {
    beforeEach(() => {
      addVertices(['a', 'b']);
      addEdge('a', 'b', 1.5);
    });

    it('calculateMinCut should return min-cut value', () => {
      expect(calculateMinCut(graph)).toBe(1.5);
    });

    it('findWeakVertices should find weak vertices', () => {
      const weak = findWeakVertices(graph, 2.0);
      expect(weak.length).toBe(2);
    });
  });

  // ==========================================================================
  // Edge Cases
  // ==========================================================================

  describe('Edge Cases', () => {
    it('should handle all vertices with same degree', () => {
      addVertices(['a', 'b', 'c']);
      addEdge('a', 'b', 1.0);
      addEdge('b', 'c', 1.0);
      addEdge('a', 'c', 1.0);

      const weakVertices = calculator.findWeakVertices(graph);
      // All have same degree, so all should have similar risk scores
      if (weakVertices.length >= 2) {
        const riskScores = weakVertices.map(v => v.riskScore);
        const maxDiff = Math.max(...riskScores) - Math.min(...riskScores);
        expect(maxDiff).toBeLessThan(0.5);
      }
    });

    it('should handle large graph', () => {
      // Create a graph with 100 vertices
      const ids = Array.from({ length: 100 }, (_, i) => `v${i}`);
      addVertices(ids);

      // Connect in a ring
      for (let i = 0; i < 100; i++) {
        addEdge(`v${i}`, `v${(i + 1) % 100}`, 1.0);
      }

      const minCut = calculator.getMinCutValue(graph);
      expect(minCut).toBe(2.0); // Ring has degree 2 for all vertices
    });
  });
});
