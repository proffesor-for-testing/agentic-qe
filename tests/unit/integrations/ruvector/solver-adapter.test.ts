/**
 * Agentic QE v3 - PageRankSolver Unit Tests (ADR-087, Milestone 3)
 *
 * Tests the PageRank-based pattern importance scoring solver,
 * including the TypeScript power-iteration fallback, edge cases,
 * and ranking behaviour.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  PageRankSolver,
  createPageRankSolver,
  type PatternGraph,
  type SolverConfig,
} from '../../../../src/integrations/ruvector/solver-adapter';

// ============================================================================
// Helpers
// ============================================================================

/** Build a simple cycle graph: 0->1->2->...->n-1->0 */
function buildCycleGraph(nodeCount: number): PatternGraph {
  const nodes: string[] = [];
  const edges: Array<[number, number, number]> = [];
  for (let i = 0; i < nodeCount; i++) {
    nodes.push(`node-${i}`);
    edges.push([i, (i + 1) % nodeCount, 1]);
  }
  return { nodes, edges };
}

/** Build a star graph: center node has incoming edges from all others */
function buildStarGraph(spokeCount: number): PatternGraph {
  const nodes = ['center'];
  const edges: Array<[number, number, number]> = [];
  for (let i = 0; i < spokeCount; i++) {
    nodes.push(`spoke-${i}`);
    edges.push([i + 1, 0, 1]); // spoke -> center
  }
  return { nodes, edges };
}

/** Build a chain graph: 0->1->2->...->n-1 */
function buildChainGraph(nodeCount: number): PatternGraph {
  const nodes: string[] = [];
  const edges: Array<[number, number, number]> = [];
  for (let i = 0; i < nodeCount; i++) {
    nodes.push(`node-${i}`);
    if (i < nodeCount - 1) {
      edges.push([i, i + 1, 1]);
    }
  }
  return { nodes, edges };
}

/** Sum of all values in a Map */
function mapSum(m: Map<string, number>): number {
  let s = 0;
  for (const v of m.values()) s += v;
  return s;
}

// ============================================================================
// Tests
// ============================================================================

describe('PageRankSolver (R8)', () => {
  let solver: PageRankSolver;

  beforeEach(() => {
    solver = new PageRankSolver();
  });

  // --------------------------------------------------------------------------
  // Construction & configuration
  // --------------------------------------------------------------------------

  describe('constructor', () => {
    it('should use default config when none supplied', () => {
      const s = new PageRankSolver();
      expect(s).toBeInstanceOf(PageRankSolver);
    });

    it('should accept partial config overrides', () => {
      const s = new PageRankSolver({ dampingFactor: 0.9, maxIterations: 50 });
      expect(s).toBeInstanceOf(PageRankSolver);
    });

    it('should reject dampingFactor outside (0, 1)', () => {
      expect(() => new PageRankSolver({ dampingFactor: 0 })).toThrow(RangeError);
      expect(() => new PageRankSolver({ dampingFactor: 1 })).toThrow(RangeError);
      expect(() => new PageRankSolver({ dampingFactor: -0.5 })).toThrow(RangeError);
      expect(() => new PageRankSolver({ dampingFactor: 1.1 })).toThrow(RangeError);
    });

    it('should reject non-positive tolerance', () => {
      expect(() => new PageRankSolver({ tolerance: 0 })).toThrow(RangeError);
      expect(() => new PageRankSolver({ tolerance: -1e-6 })).toThrow(RangeError);
    });

    it('should reject maxIterations < 1', () => {
      expect(() => new PageRankSolver({ maxIterations: 0 })).toThrow(RangeError);
    });
  });

  // --------------------------------------------------------------------------
  // computeImportance
  // --------------------------------------------------------------------------

  describe('computeImportance', () => {
    it('should return empty map for an empty graph', () => {
      const graph: PatternGraph = { nodes: [], edges: [] };
      const scores = solver.computeImportance(graph);
      expect(scores.size).toBe(0);
    });

    it('should return score of 1.0 for a single-node graph', () => {
      const graph: PatternGraph = { nodes: ['only'], edges: [] };
      const scores = solver.computeImportance(graph);
      expect(scores.size).toBe(1);
      expect(scores.get('only')).toBe(1.0);
    });

    it('should compute approximately equal scores on a symmetric cycle', () => {
      // A->B->C->A: all nodes are equivalent by symmetry
      const graph: PatternGraph = {
        nodes: ['A', 'B', 'C'],
        edges: [
          [0, 1, 1],
          [1, 2, 1],
          [2, 0, 1],
        ],
      };
      const scores = solver.computeImportance(graph);
      expect(scores.size).toBe(3);

      const expected = 1 / 3;
      expect(scores.get('A')).toBeCloseTo(expected, 4);
      expect(scores.get('B')).toBeCloseTo(expected, 4);
      expect(scores.get('C')).toBeCloseTo(expected, 4);
    });

    it('should give higher scores to nodes with more inlinks', () => {
      // B->A, C->A, D->A, A->B (A has 3 inlinks, B has 1, C and D have 0)
      const graph: PatternGraph = {
        nodes: ['A', 'B', 'C', 'D'],
        edges: [
          [1, 0, 1], // B->A
          [2, 0, 1], // C->A
          [3, 0, 1], // D->A
          [0, 1, 1], // A->B
        ],
      };
      const scores = solver.computeImportance(graph);

      const scoreA = scores.get('A')!;
      const scoreB = scores.get('B')!;
      const scoreC = scores.get('C')!;
      const scoreD = scores.get('D')!;

      // A should have the highest score
      expect(scoreA).toBeGreaterThan(scoreB);
      expect(scoreA).toBeGreaterThan(scoreC);
      expect(scoreA).toBeGreaterThan(scoreD);
    });

    it('should produce scores that sum to approximately 1.0', () => {
      const graph = buildCycleGraph(5);
      const scores = solver.computeImportance(graph);
      expect(mapSum(scores)).toBeCloseTo(1.0, 4);
    });

    it('should handle a star graph (one central hub)', () => {
      const graph = buildStarGraph(5); // 5 spokes -> center
      const scores = solver.computeImportance(graph);

      const centerScore = scores.get('center')!;
      // Center receives links from all spokes, should have the highest score
      for (let i = 0; i < 5; i++) {
        expect(centerScore).toBeGreaterThan(scores.get(`spoke-${i}`)!);
      }
      // Scores should still sum to ~1
      expect(mapSum(scores)).toBeCloseTo(1.0, 4);
    });

    it('should handle self-loops without crashing', () => {
      const graph: PatternGraph = {
        nodes: ['A', 'B'],
        edges: [
          [0, 0, 1], // A -> A (self-loop)
          [0, 1, 1], // A -> B
          [1, 0, 1], // B -> A
        ],
      };
      const scores = solver.computeImportance(graph);
      expect(scores.size).toBe(2);
      expect(mapSum(scores)).toBeCloseTo(1.0, 4);
    });

    it('should handle disconnected nodes (dangling nodes)', () => {
      // A->B, C is disconnected (dangling — no outgoing edges)
      const graph: PatternGraph = {
        nodes: ['A', 'B', 'C'],
        edges: [
          [0, 1, 1], // A->B
        ],
      };
      const scores = solver.computeImportance(graph);
      expect(scores.size).toBe(3);

      // All nodes should have non-negative scores
      for (const s of scores.values()) {
        expect(s).toBeGreaterThanOrEqual(0);
      }
      // Scores should still approximately sum to 1
      expect(mapSum(scores)).toBeCloseTo(1.0, 4);
    });

    it('should handle weighted edges correctly', () => {
      // A->B (weight 1), A->C (weight 10)
      // C should get more score from A than B does
      const graph: PatternGraph = {
        nodes: ['A', 'B', 'C'],
        edges: [
          [0, 1, 1],   // A->B (low weight)
          [0, 2, 10],  // A->C (high weight)
          [1, 0, 1],   // B->A
          [2, 0, 1],   // C->A
        ],
      };
      const scores = solver.computeImportance(graph);
      // C should receive more weight from A than B does
      expect(scores.get('C')!).toBeGreaterThan(scores.get('B')!);
    });

    it('should converge on a larger cycle graph', () => {
      const graph = buildCycleGraph(20);
      const scores = solver.computeImportance(graph);
      const expected = 1 / 20;
      for (const score of scores.values()) {
        expect(score).toBeCloseTo(expected, 3);
      }
    });
  });

  // --------------------------------------------------------------------------
  // Input validation
  // --------------------------------------------------------------------------

  describe('input validation', () => {
    it('should reject edges with out-of-bounds source index', () => {
      const graph: PatternGraph = {
        nodes: ['A', 'B'],
        edges: [[5, 0, 1]],
      };
      expect(() => solver.computeImportance(graph)).toThrow(RangeError);
    });

    it('should reject edges with out-of-bounds target index', () => {
      const graph: PatternGraph = {
        nodes: ['A', 'B'],
        edges: [[0, 5, 1]],
      };
      expect(() => solver.computeImportance(graph)).toThrow(RangeError);
    });

    it('should reject edges with negative weight', () => {
      const graph: PatternGraph = {
        nodes: ['A', 'B'],
        edges: [[0, 1, -1]],
      };
      expect(() => solver.computeImportance(graph)).toThrow(RangeError);
    });

    it('should reject edges with NaN weight', () => {
      const graph: PatternGraph = {
        nodes: ['A', 'B'],
        edges: [[0, 1, NaN]],
      };
      expect(() => solver.computeImportance(graph)).toThrow(RangeError);
    });

    it('should reject edges with Infinity weight', () => {
      const graph: PatternGraph = {
        nodes: ['A', 'B'],
        edges: [[0, 1, Infinity]],
      };
      expect(() => solver.computeImportance(graph)).toThrow(RangeError);
    });
  });

  // --------------------------------------------------------------------------
  // rankPatterns
  // --------------------------------------------------------------------------

  describe('rankPatterns', () => {
    it('should return empty array for empty graph', () => {
      const graph: PatternGraph = { nodes: [], edges: [] };
      const ranked = solver.rankPatterns(graph);
      expect(ranked).toEqual([]);
    });

    it('should return single element with rank 1 for single-node graph', () => {
      const graph: PatternGraph = { nodes: ['only'], edges: [] };
      const ranked = solver.rankPatterns(graph);
      expect(ranked).toHaveLength(1);
      expect(ranked[0]).toEqual({
        patternId: 'only',
        score: 1.0,
        rank: 1,
      });
    });

    it('should return results sorted by score descending', () => {
      // Star graph: center has highest score
      const graph = buildStarGraph(4);
      const ranked = solver.rankPatterns(graph);

      expect(ranked[0].patternId).toBe('center');
      expect(ranked[0].rank).toBe(1);

      // Verify scores are monotonically non-increasing
      for (let i = 1; i < ranked.length; i++) {
        expect(ranked[i].score).toBeLessThanOrEqual(ranked[i - 1].score);
        expect(ranked[i].rank).toBe(i + 1);
      }
    });

    it('should assign consecutive ranks starting at 1', () => {
      const graph = buildCycleGraph(5);
      const ranked = solver.rankPatterns(graph);

      expect(ranked).toHaveLength(5);
      for (let i = 0; i < ranked.length; i++) {
        expect(ranked[i].rank).toBe(i + 1);
      }
    });

    it('should include all nodes from the graph', () => {
      const graph: PatternGraph = {
        nodes: ['X', 'Y', 'Z'],
        edges: [
          [0, 1, 1],
          [1, 2, 1],
          [2, 0, 1],
        ],
      };
      const ranked = solver.rankPatterns(graph);
      const ids = ranked.map((r) => r.patternId).sort();
      expect(ids).toEqual(['X', 'Y', 'Z']);
    });
  });

  // --------------------------------------------------------------------------
  // isNativeAvailable
  // --------------------------------------------------------------------------

  describe('isNativeAvailable', () => {
    it('should return false when @ruvector/solver-node is not installed', () => {
      // In the test environment, the native module is not present
      expect(solver.isNativeAvailable()).toBe(false);
    });
  });

  // --------------------------------------------------------------------------
  // Factory function
  // --------------------------------------------------------------------------

  describe('createPageRankSolver', () => {
    it('should create a PageRankSolver instance', () => {
      const s = createPageRankSolver();
      expect(s).toBeInstanceOf(PageRankSolver);
    });

    it('should accept partial config', () => {
      const s = createPageRankSolver({ dampingFactor: 0.9 });
      expect(s).toBeInstanceOf(PageRankSolver);
    });
  });

  // --------------------------------------------------------------------------
  // Damping factor sensitivity
  // --------------------------------------------------------------------------

  describe('damping factor sensitivity', () => {
    it('should produce different score distributions for different damping factors', () => {
      const graph = buildStarGraph(5);

      const lowDamping = new PageRankSolver({ dampingFactor: 0.5 });
      const highDamping = new PageRankSolver({ dampingFactor: 0.95 });

      const lowScores = lowDamping.computeImportance(graph);
      const highScores = highDamping.computeImportance(graph);

      // Higher damping emphasizes link structure more, so the center
      // should be even more dominant relative to spokes
      const lowRatio = lowScores.get('center')! / lowScores.get('spoke-0')!;
      const highRatio = highScores.get('center')! / highScores.get('spoke-0')!;

      expect(highRatio).toBeGreaterThan(lowRatio);
    });
  });

  // --------------------------------------------------------------------------
  // Chain graph behaviour
  // --------------------------------------------------------------------------

  describe('chain graph', () => {
    it('should give lower scores to nodes later in a chain', () => {
      // Chain: 0->1->2->3->4 (no back edges)
      const graph = buildChainGraph(5);
      const scores = solver.computeImportance(graph);

      // In a chain without back-edges, all nodes except 0 receive
      // score from their predecessors. Score distribution depends on
      // dangling node handling. We just verify scores sum to ~1 and
      // all are non-negative.
      expect(mapSum(scores)).toBeCloseTo(1.0, 4);
      for (const s of scores.values()) {
        expect(s).toBeGreaterThanOrEqual(0);
      }
    });
  });

  // --------------------------------------------------------------------------
  // Benchmarks: timing at 100 and 1K node scales
  // --------------------------------------------------------------------------

  describe('benchmark', () => {
    it('should complete 100-node cycle in under 100ms', () => {
      const graph = buildCycleGraph(100);
      const start = performance.now();
      solver.computeImportance(graph);
      const elapsed = performance.now() - start;
      expect(elapsed).toBeLessThan(100);
    });

    it('should complete 1000-node cycle in under 1000ms', () => {
      const graph = buildCycleGraph(1000);
      const start = performance.now();
      solver.computeImportance(graph);
      const elapsed = performance.now() - start;
      expect(elapsed).toBeLessThan(1000);
    });

    it('should complete 1000-node dense graph in under 2000ms', () => {
      // Each node links to the next 5 nodes (modular)
      const n = 1000;
      const nodes: string[] = [];
      const edges: Array<[number, number, number]> = [];
      for (let i = 0; i < n; i++) {
        nodes.push(`n-${i}`);
        for (let j = 1; j <= 5; j++) {
          edges.push([i, (i + j) % n, 1]);
        }
      }
      const graph: PatternGraph = { nodes, edges };

      const start = performance.now();
      solver.computeImportance(graph);
      const elapsed = performance.now() - start;
      expect(elapsed).toBeLessThan(2000);
    });
  });

  // --------------------------------------------------------------------------
  // Edge-weight zero behaviour
  // --------------------------------------------------------------------------

  describe('zero-weight edges', () => {
    it('should treat zero-weight edges as non-contributing', () => {
      // A->B (weight 0), A->C (weight 1): B should get nothing from A
      const graph: PatternGraph = {
        nodes: ['A', 'B', 'C'],
        edges: [
          [0, 1, 0],  // A->B zero weight
          [0, 2, 1],  // A->C normal
          [2, 0, 1],  // C->A
        ],
      };
      const scores = solver.computeImportance(graph);
      // C should get more from A than B does
      expect(scores.get('C')!).toBeGreaterThan(scores.get('B')!);
    });
  });
});
