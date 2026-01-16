/**
 * Unit tests for SwarmGraph
 * ADR-047: MinCut Self-Organizing QE Integration
 *
 * Tests the graph data structure that represents swarm topology.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  SwarmGraph,
  createSwarmGraph,
  createSwarmGraphFrom,
} from '../../../../src/coordination/mincut/swarm-graph';
import {
  SwarmVertex,
  SwarmEdge,
} from '../../../../src/coordination/mincut/interfaces';

describe('SwarmGraph', () => {
  let graph: SwarmGraph;

  beforeEach(() => {
    graph = createSwarmGraph();
  });

  // ==========================================================================
  // Vertex Operations
  // ==========================================================================

  describe('Vertex Operations', () => {
    it('should add a vertex', () => {
      const vertex: SwarmVertex = {
        id: 'agent-1',
        type: 'agent',
        domain: 'test-generation',
        weight: 1.0,
        createdAt: new Date(),
      };

      graph.addVertex(vertex);

      expect(graph.hasVertex('agent-1')).toBe(true);
      expect(graph.vertexCount).toBe(1);
    });

    it('should get a vertex by ID', () => {
      const vertex: SwarmVertex = {
        id: 'agent-1',
        type: 'agent',
        domain: 'test-execution',
        capabilities: ['unit-tests', 'integration-tests'],
        weight: 1.0,
        createdAt: new Date(),
      };

      graph.addVertex(vertex);

      const retrieved = graph.getVertex('agent-1');
      expect(retrieved).toBeDefined();
      expect(retrieved?.id).toBe('agent-1');
      expect(retrieved?.domain).toBe('test-execution');
      expect(retrieved?.capabilities).toContain('unit-tests');
    });

    it('should update an existing vertex', () => {
      const vertex1: SwarmVertex = {
        id: 'agent-1',
        type: 'agent',
        weight: 1.0,
        createdAt: new Date(),
      };

      const vertex2: SwarmVertex = {
        id: 'agent-1',
        type: 'agent',
        weight: 2.0, // Updated weight
        createdAt: new Date(),
      };

      graph.addVertex(vertex1);
      graph.addVertex(vertex2);

      expect(graph.vertexCount).toBe(1);
      expect(graph.getVertex('agent-1')?.weight).toBe(2.0);
    });

    it('should remove a vertex', () => {
      const vertex: SwarmVertex = {
        id: 'agent-1',
        type: 'agent',
        weight: 1.0,
        createdAt: new Date(),
      };

      graph.addVertex(vertex);
      expect(graph.hasVertex('agent-1')).toBe(true);

      const removed = graph.removeVertex('agent-1');
      expect(removed).toBe(true);
      expect(graph.hasVertex('agent-1')).toBe(false);
    });

    it('should remove vertex edges when vertex is removed', () => {
      const v1: SwarmVertex = { id: 'a', type: 'agent', weight: 1, createdAt: new Date() };
      const v2: SwarmVertex = { id: 'b', type: 'agent', weight: 1, createdAt: new Date() };

      graph.addVertex(v1);
      graph.addVertex(v2);
      graph.addEdge({ source: 'a', target: 'b', weight: 1, type: 'coordination', bidirectional: true });

      expect(graph.edgeCount).toBe(1);

      graph.removeVertex('a');

      expect(graph.edgeCount).toBe(0);
      expect(graph.degree('b')).toBe(0);
    });

    it('should get all vertices', () => {
      graph.addVertex({ id: 'a', type: 'agent', weight: 1, createdAt: new Date() });
      graph.addVertex({ id: 'b', type: 'domain', weight: 2, createdAt: new Date() });
      graph.addVertex({ id: 'c', type: 'coordinator', weight: 3, createdAt: new Date() });

      const vertices = graph.getVertices();
      expect(vertices.length).toBe(3);
      expect(vertices.map(v => v.id)).toContain('a');
      expect(vertices.map(v => v.id)).toContain('b');
      expect(vertices.map(v => v.id)).toContain('c');
    });

    it('should get vertices by domain', () => {
      graph.addVertex({ id: 'a', type: 'agent', domain: 'test-generation', weight: 1, createdAt: new Date() });
      graph.addVertex({ id: 'b', type: 'agent', domain: 'test-generation', weight: 1, createdAt: new Date() });
      graph.addVertex({ id: 'c', type: 'agent', domain: 'test-execution', weight: 1, createdAt: new Date() });

      const testGenVertices = graph.getVerticesByDomain('test-generation');
      expect(testGenVertices.length).toBe(2);
      expect(testGenVertices.every(v => v.domain === 'test-generation')).toBe(true);
    });

    it('should get vertices by type', () => {
      graph.addVertex({ id: 'a', type: 'agent', weight: 1, createdAt: new Date() });
      graph.addVertex({ id: 'b', type: 'agent', weight: 1, createdAt: new Date() });
      graph.addVertex({ id: 'c', type: 'domain', weight: 1, createdAt: new Date() });

      const agents = graph.getVerticesByType('agent');
      expect(agents.length).toBe(2);
      expect(agents.every(v => v.type === 'agent')).toBe(true);
    });
  });

  // ==========================================================================
  // Edge Operations
  // ==========================================================================

  describe('Edge Operations', () => {
    beforeEach(() => {
      graph.addVertex({ id: 'a', type: 'agent', weight: 1, createdAt: new Date() });
      graph.addVertex({ id: 'b', type: 'agent', weight: 1, createdAt: new Date() });
      graph.addVertex({ id: 'c', type: 'agent', weight: 1, createdAt: new Date() });
    });

    it('should add an edge', () => {
      const edge: SwarmEdge = {
        source: 'a',
        target: 'b',
        weight: 1.0,
        type: 'coordination',
        bidirectional: false,
      };

      graph.addEdge(edge);

      expect(graph.hasEdge('a', 'b')).toBe(true);
      expect(graph.edgeCount).toBe(1);
    });

    it('should add a bidirectional edge', () => {
      graph.addEdge({
        source: 'a',
        target: 'b',
        weight: 1.0,
        type: 'coordination',
        bidirectional: true,
      });

      // Both directions should have neighbors
      expect(graph.neighborIds('a')).toContain('b');
      expect(graph.neighborIds('b')).toContain('a');
    });

    it('should get an edge', () => {
      graph.addEdge({
        source: 'a',
        target: 'b',
        weight: 2.5,
        type: 'workflow',
        bidirectional: false,
      });

      const edge = graph.getEdge('a', 'b');
      expect(edge).toBeDefined();
      expect(edge?.weight).toBe(2.5);
      expect(edge?.type).toBe('workflow');
    });

    it('should update an existing edge', () => {
      graph.addEdge({ source: 'a', target: 'b', weight: 1, type: 'coordination', bidirectional: true });
      graph.addEdge({ source: 'a', target: 'b', weight: 3, type: 'workflow', bidirectional: true });

      expect(graph.edgeCount).toBe(1);
      expect(graph.getEdge('a', 'b')?.weight).toBe(3);
    });

    it('should remove an edge', () => {
      graph.addEdge({ source: 'a', target: 'b', weight: 1, type: 'coordination', bidirectional: true });

      const removed = graph.removeEdge('a', 'b');
      expect(removed).toBe(true);
      expect(graph.hasEdge('a', 'b')).toBe(false);
    });

    it('should throw when adding edge with missing vertex', () => {
      expect(() => {
        graph.addEdge({ source: 'a', target: 'missing', weight: 1, type: 'coordination', bidirectional: false });
      }).toThrow();
    });

    it('should get all edges', () => {
      graph.addEdge({ source: 'a', target: 'b', weight: 1, type: 'coordination', bidirectional: false });
      graph.addEdge({ source: 'b', target: 'c', weight: 1, type: 'workflow', bidirectional: false });

      const edges = graph.getEdges();
      expect(edges.length).toBe(2);
    });

    it('should get edges for a vertex', () => {
      graph.addEdge({ source: 'a', target: 'b', weight: 1, type: 'coordination', bidirectional: true });
      graph.addEdge({ source: 'a', target: 'c', weight: 1, type: 'coordination', bidirectional: true });

      const edges = graph.getEdgesForVertex('a');
      expect(edges.length).toBe(2);
    });
  });

  // ==========================================================================
  // Degree Operations
  // ==========================================================================

  describe('Degree Operations', () => {
    beforeEach(() => {
      // Create a simple graph: a -- b -- c
      graph.addVertex({ id: 'a', type: 'agent', weight: 1, createdAt: new Date() });
      graph.addVertex({ id: 'b', type: 'agent', weight: 1, createdAt: new Date() });
      graph.addVertex({ id: 'c', type: 'agent', weight: 1, createdAt: new Date() });

      graph.addEdge({ source: 'a', target: 'b', weight: 1.0, type: 'coordination', bidirectional: true });
      graph.addEdge({ source: 'b', target: 'c', weight: 2.0, type: 'coordination', bidirectional: true });
    });

    it('should calculate degree correctly', () => {
      expect(graph.degree('a')).toBe(1);
      expect(graph.degree('b')).toBe(2);
      expect(graph.degree('c')).toBe(1);
    });

    it('should calculate weighted degree correctly', () => {
      expect(graph.weightedDegree('a')).toBe(1.0);
      expect(graph.weightedDegree('b')).toBe(3.0); // 1.0 + 2.0
      expect(graph.weightedDegree('c')).toBe(2.0);
    });

    it('should get neighbors', () => {
      const neighborsB = graph.neighbors('b');
      expect(neighborsB.length).toBe(2);
      expect(neighborsB.map(n => n.vertex.id)).toContain('a');
      expect(neighborsB.map(n => n.vertex.id)).toContain('c');
    });

    it('should get neighbor IDs', () => {
      const neighborIds = graph.neighborIds('b');
      expect(neighborIds).toContain('a');
      expect(neighborIds).toContain('c');
    });
  });

  // ==========================================================================
  // Graph Analysis
  // ==========================================================================

  describe('Graph Analysis', () => {
    it('should check if graph is empty', () => {
      expect(graph.isEmpty()).toBe(true);

      graph.addVertex({ id: 'a', type: 'agent', weight: 1, createdAt: new Date() });
      expect(graph.isEmpty()).toBe(false);
    });

    it('should check connectivity of empty graph', () => {
      expect(graph.isConnected()).toBe(true);
    });

    it('should check connectivity of single vertex', () => {
      graph.addVertex({ id: 'a', type: 'agent', weight: 1, createdAt: new Date() });
      expect(graph.isConnected()).toBe(true);
    });

    it('should detect connected graph', () => {
      graph.addVertex({ id: 'a', type: 'agent', weight: 1, createdAt: new Date() });
      graph.addVertex({ id: 'b', type: 'agent', weight: 1, createdAt: new Date() });
      graph.addVertex({ id: 'c', type: 'agent', weight: 1, createdAt: new Date() });

      graph.addEdge({ source: 'a', target: 'b', weight: 1, type: 'coordination', bidirectional: true });
      graph.addEdge({ source: 'b', target: 'c', weight: 1, type: 'coordination', bidirectional: true });

      expect(graph.isConnected()).toBe(true);
    });

    it('should detect disconnected graph', () => {
      graph.addVertex({ id: 'a', type: 'agent', weight: 1, createdAt: new Date() });
      graph.addVertex({ id: 'b', type: 'agent', weight: 1, createdAt: new Date() });
      graph.addVertex({ id: 'c', type: 'agent', weight: 1, createdAt: new Date() });

      graph.addEdge({ source: 'a', target: 'b', weight: 1, type: 'coordination', bidirectional: true });
      // c is not connected

      expect(graph.isConnected()).toBe(false);
    });

    it('should count connected components', () => {
      graph.addVertex({ id: 'a', type: 'agent', weight: 1, createdAt: new Date() });
      graph.addVertex({ id: 'b', type: 'agent', weight: 1, createdAt: new Date() });
      graph.addVertex({ id: 'c', type: 'agent', weight: 1, createdAt: new Date() });
      graph.addVertex({ id: 'd', type: 'agent', weight: 1, createdAt: new Date() });

      graph.addEdge({ source: 'a', target: 'b', weight: 1, type: 'coordination', bidirectional: true });
      graph.addEdge({ source: 'c', target: 'd', weight: 1, type: 'coordination', bidirectional: true });

      expect(graph.countConnectedComponents()).toBe(2);
    });

    it('should get connected component', () => {
      graph.addVertex({ id: 'a', type: 'agent', weight: 1, createdAt: new Date() });
      graph.addVertex({ id: 'b', type: 'agent', weight: 1, createdAt: new Date() });
      graph.addVertex({ id: 'c', type: 'agent', weight: 1, createdAt: new Date() });

      graph.addEdge({ source: 'a', target: 'b', weight: 1, type: 'coordination', bidirectional: true });

      const componentA = graph.getConnectedComponent('a');
      expect(componentA.length).toBe(2);
      expect(componentA).toContain('a');
      expect(componentA).toContain('b');

      const componentC = graph.getConnectedComponent('c');
      expect(componentC.length).toBe(1);
      expect(componentC).toContain('c');
    });

    it('should calculate graph statistics', () => {
      graph.addVertex({ id: 'a', type: 'agent', weight: 1, createdAt: new Date() });
      graph.addVertex({ id: 'b', type: 'agent', weight: 1, createdAt: new Date() });
      graph.addVertex({ id: 'c', type: 'agent', weight: 1, createdAt: new Date() });

      graph.addEdge({ source: 'a', target: 'b', weight: 1.5, type: 'coordination', bidirectional: true });
      graph.addEdge({ source: 'b', target: 'c', weight: 2.5, type: 'coordination', bidirectional: true });

      const stats = graph.getStats();

      expect(stats.vertexCount).toBe(3);
      expect(stats.edgeCount).toBe(2);
      expect(stats.totalWeight).toBe(4.0);
      expect(stats.isConnected).toBe(true);
      expect(stats.componentCount).toBe(1);
      expect(stats.averageDegree).toBeCloseTo(4 / 3, 2); // Total degree 4, 3 vertices
    });
  });

  // ==========================================================================
  // Snapshot & Cloning
  // ==========================================================================

  describe('Snapshot & Cloning', () => {
    beforeEach(() => {
      graph.addVertex({ id: 'a', type: 'agent', weight: 1, createdAt: new Date() });
      graph.addVertex({ id: 'b', type: 'agent', weight: 1, createdAt: new Date() });
      graph.addEdge({ source: 'a', target: 'b', weight: 1, type: 'coordination', bidirectional: true });
    });

    it('should create a snapshot', () => {
      const snapshot = graph.snapshot();

      expect(snapshot.vertices.length).toBe(2);
      expect(snapshot.edges.length).toBe(1);
      expect(snapshot.stats.vertexCount).toBe(2);
      expect(snapshot.timestamp).toBeInstanceOf(Date);
    });

    it('should clone the graph', () => {
      const clone = graph.clone();

      expect(clone.vertexCount).toBe(graph.vertexCount);
      expect(clone.edgeCount).toBe(graph.edgeCount);

      // Modify original
      graph.addVertex({ id: 'c', type: 'agent', weight: 1, createdAt: new Date() });

      // Clone should be unaffected
      expect(clone.vertexCount).toBe(2);
      expect(graph.vertexCount).toBe(3);
    });

    it('should create graph from snapshot', () => {
      const snapshot = graph.snapshot();
      const restored = SwarmGraph.fromSnapshot(snapshot);

      expect(restored.vertexCount).toBe(snapshot.vertices.length);
      expect(restored.edgeCount).toBe(snapshot.edges.length);
      expect(restored.hasVertex('a')).toBe(true);
      expect(restored.hasEdge('a', 'b')).toBe(true);
    });
  });

  // ==========================================================================
  // Factory Functions
  // ==========================================================================

  describe('Factory Functions', () => {
    it('should create empty graph with createSwarmGraph', () => {
      const g = createSwarmGraph();
      expect(g.isEmpty()).toBe(true);
    });

    it('should create graph with createSwarmGraphFrom', () => {
      const vertices: SwarmVertex[] = [
        { id: 'a', type: 'agent', weight: 1, createdAt: new Date() },
        { id: 'b', type: 'agent', weight: 1, createdAt: new Date() },
      ];
      const edges: SwarmEdge[] = [
        { source: 'a', target: 'b', weight: 1, type: 'coordination', bidirectional: true },
      ];

      const g = createSwarmGraphFrom(vertices, edges);

      expect(g.vertexCount).toBe(2);
      expect(g.edgeCount).toBe(1);
    });
  });

  // ==========================================================================
  // Clear
  // ==========================================================================

  describe('Clear', () => {
    it('should clear all data', () => {
      graph.addVertex({ id: 'a', type: 'agent', weight: 1, createdAt: new Date() });
      graph.addVertex({ id: 'b', type: 'agent', weight: 1, createdAt: new Date() });
      graph.addEdge({ source: 'a', target: 'b', weight: 1, type: 'coordination', bidirectional: true });

      expect(graph.vertexCount).toBe(2);

      graph.clear();

      expect(graph.vertexCount).toBe(0);
      expect(graph.edgeCount).toBe(0);
      expect(graph.isEmpty()).toBe(true);
    });
  });
});
