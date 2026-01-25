/**
 * Unit tests for CircularDependencyDetector
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { CircularDependencyDetector } from '../../../../src/code-intelligence/analysis/mincut/CircularDependencyDetector.js';
import { CodeGraph, GraphNode, GraphEdge } from '../../../../src/code-intelligence/graph/types.js';

describe('CircularDependencyDetector', () => {
  let simpleCircleGraph: CodeGraph;
  let complexCircleGraph: CodeGraph;
  let acyclicGraph: CodeGraph;

  beforeEach(() => {
    // Simple 2-node circle: A -> B -> A
    simpleCircleGraph = createGraph([
      { id: 'A', label: 'A.ts', filePath: '/src/A.ts', type: 'file' },
      { id: 'B', label: 'B.ts', filePath: '/src/B.ts', type: 'file' },
    ], [
      { id: 'e1', source: 'A', target: 'B', type: 'imports', weight: 1.0 },
      { id: 'e2', source: 'B', target: 'A', type: 'imports', weight: 1.0 },
    ]);

    // Complex 4-node circle with different edge types
    complexCircleGraph = createGraph([
      { id: 'A', label: 'A.ts', filePath: '/src/A.ts', type: 'class' },
      { id: 'B', label: 'B.ts', filePath: '/src/B.ts', type: 'class' },
      { id: 'C', label: 'C.ts', filePath: '/src/C.ts', type: 'class' },
      { id: 'D', label: 'D.ts', filePath: '/src/D.ts', type: 'class' },
    ], [
      { id: 'e1', source: 'A', target: 'B', type: 'imports', weight: 1.0 },
      { id: 'e2', source: 'B', target: 'C', type: 'extends', weight: 1.0 },
      { id: 'e3', source: 'C', target: 'D', type: 'calls', weight: 1.0 },
      { id: 'e4', source: 'D', target: 'A', type: 'uses', weight: 1.0 },
    ]);

    // Acyclic graph (no cycles)
    acyclicGraph = createGraph([
      { id: 'A', label: 'A.ts', filePath: '/src/A.ts', type: 'file' },
      { id: 'B', label: 'B.ts', filePath: '/src/B.ts', type: 'file' },
      { id: 'C', label: 'C.ts', filePath: '/src/C.ts', type: 'file' },
    ], [
      { id: 'e1', source: 'A', target: 'B', type: 'imports', weight: 1.0 },
      { id: 'e2', source: 'B', target: 'C', type: 'imports', weight: 1.0 },
    ]);
  });

  describe('detectAll', () => {
    it('should detect simple 2-node circular dependency', async () => {
      const detector = new CircularDependencyDetector(simpleCircleGraph);
      const results = await detector.detectAll();

      expect(results).toHaveLength(1);
      expect(results[0].cycle).toHaveLength(2);
      expect(results[0].cycle).toContain('/src/A.ts');
      expect(results[0].cycle).toContain('/src/B.ts');
      expect(results[0].severity).toBe('low');
    });

    it('should detect complex 4-node circular dependency with inheritance', async () => {
      const detector = new CircularDependencyDetector(complexCircleGraph);
      const results = await detector.detectAll();

      expect(results).toHaveLength(1);
      expect(results[0].cycle).toHaveLength(4);
      expect(results[0].severity).toBe('high'); // Has 'extends' edge
    });

    it('should return empty array for acyclic graph', async () => {
      const detector = new CircularDependencyDetector(acyclicGraph);
      const results = await detector.detectAll();

      expect(results).toHaveLength(0);
    });

    it('should sort results by severity', async () => {
      // Create graph with multiple cycles of different severities
      const multiCycleGraph = createGraph([
        { id: 'A', label: 'A.ts', filePath: '/src/A.ts', type: 'file' },
        { id: 'B', label: 'B.ts', filePath: '/src/B.ts', type: 'file' },
        { id: 'C', label: 'C.ts', filePath: '/src/C.ts', type: 'class' },
        { id: 'D', label: 'D.ts', filePath: '/src/D.ts', type: 'class' },
      ], [
        // Low severity cycle: A <-> B (imports only, 2 nodes)
        { id: 'e1', source: 'A', target: 'B', type: 'imports', weight: 1.0 },
        { id: 'e2', source: 'B', target: 'A', type: 'imports', weight: 1.0 },
        // High severity cycle: C <-> D (extends, inheritance)
        { id: 'e3', source: 'C', target: 'D', type: 'extends', weight: 1.0 },
        { id: 'e4', source: 'D', target: 'C', type: 'extends', weight: 1.0 },
      ]);

      const detector = new CircularDependencyDetector(multiCycleGraph);
      const results = await detector.detectAll();

      expect(results).toHaveLength(2);
      expect(results[0].severity).toBe('high'); // Should be first
      expect(results[1].severity).toBe('low');  // Should be second
    });
  });

  describe('checkFile', () => {
    it('should find circular dependency for file in cycle', async () => {
      const detector = new CircularDependencyDetector(simpleCircleGraph);
      const result = await detector.checkFile('/src/A.ts');

      expect(result).not.toBeNull();
      expect(result?.cycle).toContain('/src/A.ts');
    });

    it('should return null for file not in cycle', async () => {
      const detector = new CircularDependencyDetector(acyclicGraph);
      const result = await detector.checkFile('/src/A.ts');

      expect(result).toBeNull();
    });
  });

  describe('break point suggestions', () => {
    it('should provide break points for circular dependency', async () => {
      const detector = new CircularDependencyDetector(simpleCircleGraph);
      const results = await detector.detectAll();

      expect(results[0].breakPoints.length).toBeGreaterThan(0);
      const bp = results[0].breakPoints[0];
      expect(bp).toHaveProperty('source');
      expect(bp).toHaveProperty('target');
      expect(bp).toHaveProperty('effort');
      expect(bp).toHaveProperty('suggestion');
    });

    it('should prioritize low effort break points', async () => {
      const detector = new CircularDependencyDetector(complexCircleGraph);
      const results = await detector.detectAll();

      const breakPoints = results[0].breakPoints;
      expect(breakPoints.length).toBeGreaterThan(0);

      // Should have effort levels assigned
      breakPoints.forEach(bp => {
        expect(['low', 'medium', 'high']).toContain(bp.effort);
      });
    });
  });

  describe('recommendations', () => {
    it('should generate actionable recommendations', async () => {
      const detector = new CircularDependencyDetector(simpleCircleGraph);
      const results = await detector.detectAll();

      expect(results[0].recommendations.length).toBeGreaterThan(0);
      expect(results[0].recommendations[0]).toContain('Circular dependency detected');
    });

    it('should suggest composition over inheritance for extends cycles', async () => {
      const detector = new CircularDependencyDetector(complexCircleGraph);
      const results = await detector.detectAll();

      const recommendations = results[0].recommendations.join(' ');
      expect(recommendations).toContain('composition');
    });
  });

  describe('getStats', () => {
    it('should return statistics about circular dependencies', async () => {
      const detector = new CircularDependencyDetector(simpleCircleGraph);
      const stats = await detector.getStats();

      expect(stats.totalCycles).toBe(1);
      expect(stats.bySeverity).toHaveProperty('high');
      expect(stats.bySeverity).toHaveProperty('medium');
      expect(stats.bySeverity).toHaveProperty('low');
      expect(stats.largestCycle).toBe(2);
      expect(stats.avgCycleSize).toBe(2);
    });

    it('should return zero stats for acyclic graph', async () => {
      const detector = new CircularDependencyDetector(acyclicGraph);
      const stats = await detector.getStats();

      expect(stats.totalCycles).toBe(0);
      expect(stats.largestCycle).toBe(0);
      expect(stats.avgCycleSize).toBe(0);
    });
  });
});

/**
 * Helper function to create a CodeGraph from nodes and edges
 */
function createGraph(
  nodeData: Array<{ id: string; label: string; filePath: string; type: string }>,
  edgeData: Array<{ id: string; source: string; target: string; type: string; weight: number }>
): CodeGraph {
  const nodes = new Map<string, GraphNode>();
  const edges = new Map<string, GraphEdge>();
  const outgoingEdges = new Map<string, string[]>();
  const incomingEdges = new Map<string, string[]>();
  const fileNodes = new Map<string, string[]>();

  // Add nodes
  for (const n of nodeData) {
    const node: GraphNode = {
      id: n.id,
      type: n.type as any,
      label: n.label,
      filePath: n.filePath,
      startLine: 1,
      endLine: 10,
      language: 'typescript',
      properties: {},
    };
    nodes.set(n.id, node);

    // Index by file
    if (!fileNodes.has(n.filePath)) {
      fileNodes.set(n.filePath, []);
    }
    fileNodes.get(n.filePath)!.push(n.id);
  }

  // Add edges
  for (const e of edgeData) {
    const edge: GraphEdge = {
      id: e.id,
      source: e.source,
      target: e.target,
      type: e.type as any,
      weight: e.weight,
      properties: {},
    };
    edges.set(e.id, edge);

    // Index outgoing
    if (!outgoingEdges.has(e.source)) {
      outgoingEdges.set(e.source, []);
    }
    outgoingEdges.get(e.source)!.push(e.id);

    // Index incoming
    if (!incomingEdges.has(e.target)) {
      incomingEdges.set(e.target, []);
    }
    incomingEdges.get(e.target)!.push(e.id);
  }

  return {
    nodes,
    edges,
    outgoingEdges,
    incomingEdges,
    fileNodes,
  };
}
