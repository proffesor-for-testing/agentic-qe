/**
 * MinCutAnalyzer Unit Tests
 *
 * Comprehensive test suite for minimum cut graph analysis using Stoer-Wagner algorithm.
 * Tests cover algorithm correctness, edge cases, performance, and error handling.
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { MinCutAnalyzer } from '../../../../../src/code-intelligence/analysis/mincut/MinCutAnalyzer.js';
import { JsMinCut } from '../../../../../src/code-intelligence/analysis/mincut/JsMinCut.js';
import { MinCutGraphInput, MinCutResult } from '../../../../../src/code-intelligence/analysis/mincut/types.js';

describe('MinCutAnalyzer', () => {
  let analyzer: MinCutAnalyzer;

  beforeEach(() => {
    analyzer = new MinCutAnalyzer({ algorithm: 'stoer-wagner' });
  });

  describe('computeMinCut', () => {
    it('should compute min cut for simple 4-node graph with clear partition', async () => {
      // Graph: A-B (weight 10), C-D (weight 10), B-C (weight 1)
      // Expected: Cut between {A,B} and {C,D} with value 1
      const graph: MinCutGraphInput = {
        nodes: [
          { id: 'A', label: 'A' },
          { id: 'B', label: 'B' },
          { id: 'C', label: 'C' },
          { id: 'D', label: 'D' },
        ],
        edges: [
          { source: 'A', target: 'B', weight: 10 },
          { source: 'B', target: 'C', weight: 1 },
          { source: 'C', target: 'D', weight: 10 },
        ],
        directed: false,
      };

      const result = await analyzer.computeMinCut(graph);

      expect(result.cutValue).toBeCloseTo(0.1, 2); // Normalized: 1/10 = 0.1
      expect(result.partition1.length).toBe(2);
      expect(result.partition2.length).toBe(2);
      expect(result.cutEdges.length).toBe(1);
      expect(result.algorithmUsed).toBe('stoer-wagner');
      expect(result.computationTimeMs).toBeGreaterThan(0);

      // Verify the cut edge is B-C
      const cutEdge = result.cutEdges[0];
      expect(
        (cutEdge.source === 'B' && cutEdge.target === 'C') ||
        (cutEdge.source === 'C' && cutEdge.target === 'B')
      ).toBe(true);
    });

    it('should handle disconnected graphs correctly', async () => {
      // Two disconnected components: A-B and C-D
      const graph: MinCutGraphInput = {
        nodes: [
          { id: 'A', label: 'A' },
          { id: 'B', label: 'B' },
          { id: 'C', label: 'C' },
          { id: 'D', label: 'D' },
        ],
        edges: [
          { source: 'A', target: 'B', weight: 5 },
          { source: 'C', target: 'D', weight: 5 },
        ],
        directed: false,
      };

      const result = await analyzer.computeMinCut(graph);

      // A disconnected graph has cut value 0 (no edges to cut)
      expect(result.cutValue).toBe(0);
      expect(result.cutEdges.length).toBe(0);
    });

    it('should respect timeout configuration', async () => {
      const shortTimeoutAnalyzer = new MinCutAnalyzer({
        algorithm: 'stoer-wagner',
        timeout: 1, // 1ms timeout
      });

      // Create a large graph that will take time
      const nodes = [];
      const edges = [];
      for (let i = 0; i < 100; i++) {
        nodes.push({ id: `node${i}`, label: `Node ${i}` });
        if (i > 0) {
          // Create a dense graph
          for (let j = 0; j < Math.min(i, 10); j++) {
            edges.push({ source: `node${i}`, target: `node${j}`, weight: 1 });
          }
        }
      }

      const graph: MinCutGraphInput = { nodes, edges, directed: false };

      await expect(shortTimeoutAnalyzer.computeMinCut(graph)).rejects.toThrow(
        /exceeded timeout/
      );
    });

    it('should validate graph size limits (maxNodes)', async () => {
      const limitedAnalyzer = new MinCutAnalyzer({
        algorithm: 'stoer-wagner',
        maxNodes: 5,
      });

      const nodes = [];
      for (let i = 0; i < 10; i++) {
        nodes.push({ id: `node${i}`, label: `Node ${i}` });
      }

      const graph: MinCutGraphInput = {
        nodes,
        edges: [],
        directed: false,
      };

      await expect(limitedAnalyzer.computeMinCut(graph)).rejects.toThrow(
        /exceeding limit of 5/
      );
    });

    it('should handle weighted graphs correctly', async () => {
      // Triangle with different weights
      const graph: MinCutGraphInput = {
        nodes: [
          { id: '1', label: '1' },
          { id: '2', label: '2' },
          { id: '3', label: '3' },
        ],
        edges: [
          { source: '1', target: '2', weight: 1 },
          { source: '2', target: '3', weight: 1 },
          { source: '3', target: '1', weight: 10 }, // Heavy edge
        ],
        directed: false,
      };

      const result = await analyzer.computeMinCut(graph);

      // Should find cut value of 2 (normalized: 1+1=2, max weight=10, so 0.2)
      expect(result.cutValue).toBeCloseTo(0.2, 2);
      expect(result.cutEdges.length).toBe(2);
    });

    it('should normalize weights when configured', async () => {
      const normalizedAnalyzer = new MinCutAnalyzer({
        algorithm: 'stoer-wagner',
        normalizeWeights: true,
      });

      const graph: MinCutGraphInput = {
        nodes: [
          { id: 'A', label: 'A' },
          { id: 'B', label: 'B' },
        ],
        edges: [
          { source: 'A', target: 'B', weight: 100 },
        ],
        directed: false,
      };

      const result = await normalizedAnalyzer.computeMinCut(graph);

      // With normalization, weight becomes 100/100 = 1.0
      // Single edge graph has cut value equal to edge weight
      expect(result.cutValue).toBeCloseTo(1.0, 2);
    });

    it('should not normalize weights when configured', async () => {
      const unnormalizedAnalyzer = new MinCutAnalyzer({
        algorithm: 'stoer-wagner',
        normalizeWeights: false,
      });

      const graph: MinCutGraphInput = {
        nodes: [
          { id: 'A', label: 'A' },
          { id: 'B', label: 'B' },
        ],
        edges: [
          { source: 'A', target: 'B', weight: 100 },
        ],
        directed: false,
      };

      const result = await unnormalizedAnalyzer.computeMinCut(graph);

      // Without normalization, weight stays 100
      expect(result.cutValue).toBe(100);
    });

    it('should return correct partition assignments', async () => {
      const graph: MinCutGraphInput = {
        nodes: [
          { id: 'A', label: 'A' },
          { id: 'B', label: 'B' },
          { id: 'C', label: 'C' },
        ],
        edges: [
          { source: 'A', target: 'B', weight: 1 },
          { source: 'B', target: 'C', weight: 1 },
        ],
        directed: false,
      };

      const result = await analyzer.computeMinCut(graph);

      // All nodes should be accounted for
      const allNodes = [...result.partition1, ...result.partition2].sort();
      expect(allNodes).toEqual(['A', 'B', 'C']);

      // Partitions should be non-empty (unless graph is trivial)
      expect(result.partition1.length).toBeGreaterThan(0);
      expect(result.partition2.length).toBeGreaterThan(0);
    });

    it('should identify cut edges correctly', async () => {
      const graph: MinCutGraphInput = {
        nodes: [
          { id: 'A', label: 'A' },
          { id: 'B', label: 'B' },
          { id: 'C', label: 'C' },
          { id: 'D', label: 'D' },
        ],
        edges: [
          { source: 'A', target: 'B', weight: 5 },
          { source: 'B', target: 'C', weight: 1 },
          { source: 'C', target: 'D', weight: 5 },
        ],
        directed: false,
      };

      const result = await analyzer.computeMinCut(graph);

      // Cut edges should connect nodes in different partitions
      for (const edge of result.cutEdges) {
        const sourceIn1 = result.partition1.includes(edge.source);
        const targetIn1 = result.partition1.includes(edge.target);
        expect(sourceIn1).not.toBe(targetIn1); // Different partitions
      }
    });
  });

  describe('findAllMinCuts', () => {
    it('should find multiple minimum cuts', async () => {
      // Square graph with equal weights - has multiple min cuts
      const graph: MinCutGraphInput = {
        nodes: [
          { id: '1', label: '1' },
          { id: '2', label: '2' },
          { id: '3', label: '3' },
          { id: '4', label: '4' },
        ],
        edges: [
          { source: '1', target: '2', weight: 1 },
          { source: '2', target: '3', weight: 1 },
          { source: '3', target: '4', weight: 1 },
          { source: '4', target: '1', weight: 1 },
        ],
        directed: false,
      };

      const results = await analyzer.findAllMinCuts(graph, 3);

      expect(results.length).toBeGreaterThan(1);
      expect(results.length).toBeLessThanOrEqual(3);

      // All should have the same cut value (equal min cuts)
      const firstCutValue = results[0].cutValue;
      for (const result of results) {
        expect(result.cutValue).toBeCloseTo(firstCutValue, 2);
      }
    });

    it('should respect maxCuts limit', async () => {
      const graph: MinCutGraphInput = {
        nodes: [
          { id: '1', label: '1' },
          { id: '2', label: '2' },
          { id: '3', label: '3' },
          { id: '4', label: '4' },
          { id: '5', label: '5' },
        ],
        edges: [
          { source: '1', target: '2', weight: 1 },
          { source: '2', target: '3', weight: 1 },
          { source: '3', target: '4', weight: 1 },
          { source: '4', target: '5', weight: 1 },
        ],
        directed: false,
      };

      const results = await analyzer.findAllMinCuts(graph, 2);

      expect(results.length).toBeLessThanOrEqual(2);
    });

    it('should return cuts in order of cut value', async () => {
      const graph: MinCutGraphInput = {
        nodes: [
          { id: 'A', label: 'A' },
          { id: 'B', label: 'B' },
          { id: 'C', label: 'C' },
          { id: 'D', label: 'D' },
        ],
        edges: [
          { source: 'A', target: 'B', weight: 1 },
          { source: 'B', target: 'C', weight: 2 },
          { source: 'C', target: 'D', weight: 3 },
        ],
        directed: false,
      };

      const results = await analyzer.findAllMinCuts(graph, 3);

      // Verify ascending order
      for (let i = 1; i < results.length; i++) {
        expect(results[i].cutValue).toBeGreaterThanOrEqual(results[i - 1].cutValue);
      }
    });
  });

  describe('edge cases', () => {
    it('should handle empty graph', async () => {
      const graph: MinCutGraphInput = {
        nodes: [],
        edges: [],
        directed: false,
      };

      await expect(analyzer.computeMinCut(graph)).rejects.toThrow(
        /must have at least one node/
      );
    });

    it('should handle single node graph', async () => {
      const graph: MinCutGraphInput = {
        nodes: [{ id: 'A', label: 'A' }],
        edges: [],
        directed: false,
      };

      const result = await analyzer.computeMinCut(graph);

      expect(result.cutValue).toBe(0);
      expect(result.partition1).toEqual(['A']);
      expect(result.partition2).toEqual([]);
      expect(result.cutEdges.length).toBe(0);
    });

    it('should handle graph with no edges', async () => {
      const graph: MinCutGraphInput = {
        nodes: [
          { id: 'A', label: 'A' },
          { id: 'B', label: 'B' },
          { id: 'C', label: 'C' },
        ],
        edges: [],
        directed: false,
      };

      const result = await analyzer.computeMinCut(graph);

      // Disconnected nodes have cut value 0
      expect(result.cutValue).toBe(0);
      expect(result.cutEdges.length).toBe(0);
    });

    it('should handle complete graph', async () => {
      // Complete graph K4 with uniform weights
      const graph: MinCutGraphInput = {
        nodes: [
          { id: '1', label: '1' },
          { id: '2', label: '2' },
          { id: '3', label: '3' },
          { id: '4', label: '4' },
        ],
        edges: [
          { source: '1', target: '2', weight: 1 },
          { source: '1', target: '3', weight: 1 },
          { source: '1', target: '4', weight: 1 },
          { source: '2', target: '3', weight: 1 },
          { source: '2', target: '4', weight: 1 },
          { source: '3', target: '4', weight: 1 },
        ],
        directed: false,
      };

      const result = await analyzer.computeMinCut(graph);

      // For complete graph K4, min cut should be 3 (degree of any node)
      expect(result.cutValue).toBeCloseTo(3.0, 1);
      expect(result.partition1.length).toBeGreaterThan(0);
      expect(result.partition2.length).toBeGreaterThan(0);
    });

    it('should handle graph with self-loops', async () => {
      const graph: MinCutGraphInput = {
        nodes: [
          { id: 'A', label: 'A' },
          { id: 'B', label: 'B' },
        ],
        edges: [
          { source: 'A', target: 'A', weight: 5 }, // Self-loop
          { source: 'A', target: 'B', weight: 1 },
          { source: 'B', target: 'B', weight: 3 }, // Self-loop
        ],
        directed: false,
      };

      const result = await analyzer.computeMinCut(graph);

      // Self-loops should not affect min cut between A and B
      expect(result.cutValue).toBeCloseTo(0.2, 2); // 1/5 normalized
    });

    it('should handle parallel edges (multiple edges between same nodes)', async () => {
      const graph: MinCutGraphInput = {
        nodes: [
          { id: 'A', label: 'A' },
          { id: 'B', label: 'B' },
        ],
        edges: [
          { source: 'A', target: 'B', weight: 2 },
          { source: 'A', target: 'B', weight: 3 }, // Parallel edge
        ],
        directed: false,
      };

      const result = await analyzer.computeMinCut(graph);

      // Parallel edges should be combined (weight = 2 + 3 = 5)
      expect(result.cutValue).toBeCloseTo(1.0, 2); // 5/5 normalized
    });
  });

  describe('performance', () => {
    it('should process 100-node graph in <100ms', async () => {
      const nodes = [];
      const edges = [];

      // Create a path graph: 1-2-3-...-100
      for (let i = 0; i < 100; i++) {
        nodes.push({ id: `node${i}`, label: `Node ${i}` });
        if (i > 0) {
          edges.push({ source: `node${i - 1}`, target: `node${i}`, weight: 1 });
        }
      }

      const graph: MinCutGraphInput = { nodes, edges, directed: false };

      const startTime = performance.now();
      const result = await analyzer.computeMinCut(graph);
      const elapsed = performance.now() - startTime;

      expect(elapsed).toBeLessThan(100);
      expect(result.cutValue).toBeGreaterThan(0);
      expect(result.computationTimeMs).toBeGreaterThan(0);
    });

    it('should handle moderately dense graph efficiently', async () => {
      const nodes = [];
      const edges = [];

      // Create a graph with 50 nodes and ~200 edges
      for (let i = 0; i < 50; i++) {
        nodes.push({ id: `node${i}`, label: `Node ${i}` });
        if (i > 0) {
          // Connect to previous 4 nodes
          for (let j = Math.max(0, i - 4); j < i; j++) {
            edges.push({ source: `node${i}`, target: `node${j}`, weight: 1 });
          }
        }
      }

      const graph: MinCutGraphInput = { nodes, edges, directed: false };

      const startTime = performance.now();
      const result = await analyzer.computeMinCut(graph);
      const elapsed = performance.now() - startTime;

      expect(elapsed).toBeLessThan(500); // 500ms for moderate graph
      expect(result.cutValue).toBeGreaterThan(0);
    });
  });

  describe('error handling', () => {
    it('should throw on graph exceeding maxNodes', async () => {
      const limitedAnalyzer = new MinCutAnalyzer({
        algorithm: 'stoer-wagner',
        maxNodes: 10,
      });

      const nodes = [];
      for (let i = 0; i < 20; i++) {
        nodes.push({ id: `node${i}`, label: `Node ${i}` });
      }

      const graph: MinCutGraphInput = { nodes, edges: [], directed: false };

      await expect(limitedAnalyzer.computeMinCut(graph)).rejects.toThrow(
        /has 20 nodes, exceeding limit of 10/
      );
    });

    it('should handle timeout gracefully', async () => {
      const shortTimeoutAnalyzer = new MinCutAnalyzer({
        algorithm: 'stoer-wagner',
        timeout: 1,
      });

      // Large dense graph
      const nodes = [];
      const edges = [];
      for (let i = 0; i < 50; i++) {
        nodes.push({ id: `node${i}`, label: `Node ${i}` });
        for (let j = 0; j < i; j++) {
          edges.push({ source: `node${i}`, target: `node${j}`, weight: 1 });
        }
      }

      const graph: MinCutGraphInput = { nodes, edges, directed: false };

      await expect(shortTimeoutAnalyzer.computeMinCut(graph)).rejects.toThrow(
        /exceeded timeout of 1ms/
      );
    });

    it('should provide helpful error messages for invalid edges', async () => {
      const graph: MinCutGraphInput = {
        nodes: [{ id: 'A', label: 'A' }],
        edges: [
          { source: 'A', target: 'B', weight: 1 }, // B doesn't exist
        ],
        directed: false,
      };

      await expect(analyzer.computeMinCut(graph)).rejects.toThrow(
        /Edge target 'B' not found in nodes/
      );
    });

    it('should reject negative weights', async () => {
      const graph: MinCutGraphInput = {
        nodes: [
          { id: 'A', label: 'A' },
          { id: 'B', label: 'B' },
        ],
        edges: [
          { source: 'A', target: 'B', weight: -1 },
        ],
        directed: false,
      };

      await expect(analyzer.computeMinCut(graph)).rejects.toThrow(
        /Edge weight must be non-negative/
      );
    });

    it('should validate edge source exists', async () => {
      const graph: MinCutGraphInput = {
        nodes: [{ id: 'B', label: 'B' }],
        edges: [
          { source: 'A', target: 'B', weight: 1 }, // A doesn't exist
        ],
        directed: false,
      };

      await expect(analyzer.computeMinCut(graph)).rejects.toThrow(
        /Edge source 'A' not found in nodes/
      );
    });
  });

  describe('configuration', () => {
    it('should use default configuration when none provided', () => {
      const defaultAnalyzer = new MinCutAnalyzer();
      const config = defaultAnalyzer.getConfig();

      expect(config.algorithm).toBe('stoer-wagner');
      expect(config.maxNodes).toBe(10000);
      expect(config.timeout).toBe(30000);
      expect(config.normalizeWeights).toBe(true);
    });

    it('should merge partial configuration with defaults', () => {
      const customAnalyzer = new MinCutAnalyzer({
        maxNodes: 500,
        timeout: 5000,
      });
      const config = customAnalyzer.getConfig();

      expect(config.algorithm).toBe('stoer-wagner'); // Default
      expect(config.maxNodes).toBe(500); // Custom
      expect(config.timeout).toBe(5000); // Custom
      expect(config.normalizeWeights).toBe(true); // Default
    });

    it('should allow checking native availability', () => {
      const isAvailable = analyzer.isNativeAvailable();
      expect(typeof isAvailable).toBe('boolean');
    });
  });
});

describe('JsMinCut (Stoer-Wagner)', () => {
  let jsMinCut: JsMinCut;

  beforeEach(() => {
    jsMinCut = new JsMinCut();
  });

  describe('algorithm correctness', () => {
    it('should find correct min cut for known graph', () => {
      // Example from Stoer-Wagner paper
      const graph: MinCutGraphInput = {
        nodes: [
          { id: '1', label: '1' },
          { id: '2', label: '2' },
          { id: '3', label: '3' },
          { id: '4', label: '4' },
          { id: '5', label: '5' },
          { id: '6', label: '6' },
        ],
        edges: [
          { source: '1', target: '2', weight: 2 },
          { source: '1', target: '5', weight: 3 },
          { source: '2', target: '3', weight: 3 },
          { source: '2', target: '5', weight: 2 },
          { source: '2', target: '6', weight: 2 },
          { source: '3', target: '4', weight: 4 },
          { source: '3', target: '6', weight: 2 },
          { source: '4', target: '6', weight: 2 },
          { source: '5', target: '6', weight: 3 },
        ],
        directed: false,
      };

      const result = jsMinCut.computeMinCut(graph, false);

      // Known min cut value is 4
      expect(result.cutValue).toBe(4);
      expect(result.algorithmUsed).toBe('stoer-wagner');
    });

    it('should handle bridge edges correctly', () => {
      // Graph with a bridge: A-B-C where B-C is the only connection
      const graph: MinCutGraphInput = {
        nodes: [
          { id: 'A', label: 'A' },
          { id: 'B', label: 'B' },
          { id: 'C', label: 'C' },
        ],
        edges: [
          { source: 'A', target: 'B', weight: 10 },
          { source: 'B', target: 'C', weight: 1 }, // Bridge
        ],
        directed: false,
      };

      const result = jsMinCut.computeMinCut(graph, true);

      // Min cut should be the bridge with normalized weight 1/10 = 0.1
      expect(result.cutValue).toBeCloseTo(0.1, 2);
      expect(result.cutEdges.length).toBe(1);
    });

    it('should handle equal weight edges', () => {
      // Triangle with equal weights
      const graph: MinCutGraphInput = {
        nodes: [
          { id: 'A', label: 'A' },
          { id: 'B', label: 'B' },
          { id: 'C', label: 'C' },
        ],
        edges: [
          { source: 'A', target: 'B', weight: 5 },
          { source: 'B', target: 'C', weight: 5 },
          { source: 'C', target: 'A', weight: 5 },
        ],
        directed: false,
      };

      const result = jsMinCut.computeMinCut(graph, false);

      // For a triangle with equal weights, min cut is 5 (any single edge)
      expect(result.cutValue).toBe(5);
    });

    it('should handle star graph correctly', () => {
      // Star graph: center connected to 4 outer nodes
      const graph: MinCutGraphInput = {
        nodes: [
          { id: 'center', label: 'Center' },
          { id: '1', label: '1' },
          { id: '2', label: '2' },
          { id: '3', label: '3' },
          { id: '4', label: '4' },
        ],
        edges: [
          { source: 'center', target: '1', weight: 1 },
          { source: 'center', target: '2', weight: 1 },
          { source: 'center', target: '3', weight: 1 },
          { source: 'center', target: '4', weight: 1 },
        ],
        directed: false,
      };

      const result = jsMinCut.computeMinCut(graph, false);

      // Min cut is 1 (any single edge to an outer node)
      expect(result.cutValue).toBe(1);
      expect(result.cutEdges.length).toBe(1);
    });

    it('should handle bipartite graph correctly', () => {
      // Complete bipartite graph K_{2,2}
      const graph: MinCutGraphInput = {
        nodes: [
          { id: 'A1', label: 'A1' },
          { id: 'A2', label: 'A2' },
          { id: 'B1', label: 'B1' },
          { id: 'B2', label: 'B2' },
        ],
        edges: [
          { source: 'A1', target: 'B1', weight: 1 },
          { source: 'A1', target: 'B2', weight: 1 },
          { source: 'A2', target: 'B1', weight: 1 },
          { source: 'A2', target: 'B2', weight: 1 },
        ],
        directed: false,
      };

      const result = jsMinCut.computeMinCut(graph, false);

      // Min cut is 2 (separating the two partitions)
      expect(result.cutValue).toBe(2);
      expect(result.cutEdges.length).toBe(2);
    });
  });

  describe('edge cases for JsMinCut', () => {
    it('should handle empty graph', () => {
      const graph: MinCutGraphInput = {
        nodes: [],
        edges: [],
        directed: false,
      };

      const result = jsMinCut.computeMinCut(graph, true);

      expect(result.cutValue).toBe(0);
      expect(result.partition1).toEqual([]);
      expect(result.partition2).toEqual([]);
    });

    it('should handle single node', () => {
      const graph: MinCutGraphInput = {
        nodes: [{ id: 'A', label: 'A' }],
        edges: [],
        directed: false,
      };

      const result = jsMinCut.computeMinCut(graph, true);

      expect(result.cutValue).toBe(0);
      expect(result.partition1).toEqual(['A']);
      expect(result.partition2).toEqual([]);
    });

    it('should handle two nodes with single edge', () => {
      const graph: MinCutGraphInput = {
        nodes: [
          { id: 'A', label: 'A' },
          { id: 'B', label: 'B' },
        ],
        edges: [
          { source: 'A', target: 'B', weight: 42 },
        ],
        directed: false,
      };

      const result = jsMinCut.computeMinCut(graph, false);

      expect(result.cutValue).toBe(42);
      expect(result.partition1.length).toBe(1);
      expect(result.partition2.length).toBe(1);
    });
  });

  describe('performance tracking', () => {
    it('should track computation time', () => {
      const graph: MinCutGraphInput = {
        nodes: [
          { id: 'A', label: 'A' },
          { id: 'B', label: 'B' },
          { id: 'C', label: 'C' },
        ],
        edges: [
          { source: 'A', target: 'B', weight: 1 },
          { source: 'B', target: 'C', weight: 1 },
        ],
        directed: false,
      };

      const result = jsMinCut.computeMinCut(graph, true);

      expect(result.computationTimeMs).toBeGreaterThan(0);
      expect(result.computationTimeMs).toBeLessThan(1000); // Should be fast
    });
  });
});
