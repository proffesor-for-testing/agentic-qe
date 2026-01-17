/**
 * GraphAdapter Unit Tests
 *
 * Tests for converting CodeGraph to MinCut input format
 */

import { describe, it, expect, beforeEach } from '@jest/globals';
import { GraphAdapter } from '../../../../../src/code-intelligence/analysis/mincut/GraphAdapter.js';
import { GraphNode, GraphEdge, EdgeType } from '../../../../../src/code-intelligence/graph/types.js';

describe('GraphAdapter', () => {
  let sampleNodes: GraphNode[];
  let sampleEdges: GraphEdge[];

  beforeEach(() => {
    sampleNodes = [
      {
        id: 'node1',
        type: 'file',
        label: 'auth.ts',
        filePath: '/src/auth.ts',
        startLine: 1,
        endLine: 50,
        language: 'typescript',
        properties: {},
      },
      {
        id: 'node2',
        type: 'class',
        label: 'UserService',
        filePath: '/src/user.ts',
        startLine: 1,
        endLine: 100,
        language: 'typescript',
        properties: {},
      },
      {
        id: 'node3',
        type: 'function',
        label: 'login',
        filePath: '/src/auth.ts',
        startLine: 10,
        endLine: 30,
        language: 'typescript',
        properties: {},
      },
    ];

    sampleEdges = [
      {
        id: 'edge1',
        source: 'node1',
        target: 'node2',
        type: 'imports',
        weight: 1.0,
        properties: {},
      },
      {
        id: 'edge2',
        source: 'node2',
        target: 'node3',
        type: 'calls',
        weight: 0.5,
        properties: {},
      },
    ];
  });

  describe('toMinCutFormat', () => {
    it('should convert basic graph correctly', () => {
      const graph = { nodes: sampleNodes, edges: sampleEdges };
      const result = GraphAdapter.toMinCutFormat(graph);

      expect(result.nodes).toHaveLength(3);
      expect(result.edges).toHaveLength(2);
      expect(result.directed).toBe(false);
    });

    it('should handle empty graph', () => {
      const graph = { nodes: [], edges: [] };
      const result = GraphAdapter.toMinCutFormat(graph);

      expect(result.nodes).toHaveLength(0);
      expect(result.edges).toHaveLength(0);
    });

    it('should handle graph with no edges', () => {
      const graph = { nodes: sampleNodes, edges: [] };
      const result = GraphAdapter.toMinCutFormat(graph);

      expect(result.nodes).toHaveLength(3);
      expect(result.edges).toHaveLength(0);
    });

    it('should filter nodes when nodeFilter provided', () => {
      const graph = { nodes: sampleNodes, edges: sampleEdges };
      const result = GraphAdapter.toMinCutFormat(graph, {
        nodeFilter: (node) => node.type === 'file',
      });

      expect(result.nodes).toHaveLength(1);
      expect(result.nodes[0].label).toBe('auth.ts');
    });

    it('should filter edges when edgeFilter provided', () => {
      const graph = { nodes: sampleNodes, edges: sampleEdges };
      const result = GraphAdapter.toMinCutFormat(graph, {
        edgeFilter: (edge) => edge.type === 'imports',
      });

      expect(result.edges).toHaveLength(1);
      expect(result.edges[0].edgeType).toBe('imports');
    });

    it('should skip self-loops', () => {
      const selfLoopEdge: GraphEdge = {
        id: 'edge_self',
        source: 'node1',
        target: 'node1',
        type: 'uses',
        weight: 1.0,
        properties: {},
      };

      const graph = {
        nodes: sampleNodes,
        edges: [...sampleEdges, selfLoopEdge],
      };

      const result = GraphAdapter.toMinCutFormat(graph);

      // Should not include the self-loop
      expect(result.edges).toHaveLength(2);
      expect(result.edges.every(e => e.source !== e.target)).toBe(true);
    });

    it('should skip edges with missing nodes', () => {
      const invalidEdge: GraphEdge = {
        id: 'edge_invalid',
        source: 'node1',
        target: 'nonexistent',
        type: 'imports',
        weight: 1.0,
        properties: {},
      };

      const graph = {
        nodes: sampleNodes,
        edges: [...sampleEdges, invalidEdge],
      };

      const result = GraphAdapter.toMinCutFormat(graph);

      // Should not include the invalid edge
      expect(result.edges).toHaveLength(2);
    });

    it('should handle duplicate edges by keeping highest weight', () => {
      const duplicateEdge: GraphEdge = {
        id: 'edge_dup',
        source: 'node1',
        target: 'node2',
        type: 'uses',
        weight: 2.0, // Higher weight
        properties: {},
      };

      const graph = {
        nodes: sampleNodes,
        edges: [...sampleEdges, duplicateEdge],
      };

      const result = GraphAdapter.toMinCutFormat(graph);

      // Should have 2 edges (duplicate merged)
      expect(result.edges).toHaveLength(2);

      // Find the edge between node1 and node2
      const edge = result.edges.find(
        e =>
          (e.source === 'node1' && e.target === 'node2') ||
          (e.source === 'node2' && e.target === 'node1')
      );

      // Should keep the higher weight
      expect(edge?.weight).toBe(2.0);
    });

    it('should set directed flag correctly', () => {
      const graph = { nodes: sampleNodes, edges: sampleEdges };

      const undirected = GraphAdapter.toMinCutFormat(graph, { directed: false });
      expect(undirected.directed).toBe(false);

      const directed = GraphAdapter.toMinCutFormat(graph, { directed: true });
      expect(directed.directed).toBe(true);
    });

    it('should preserve node metadata', () => {
      const graph = { nodes: sampleNodes, edges: sampleEdges };
      const result = GraphAdapter.toMinCutFormat(graph);

      const node = result.nodes[0];
      expect(node.properties?.type).toBeDefined();
      expect(node.properties?.filePath).toBeDefined();
      expect(node.properties?.language).toBeDefined();
    });

    it('should preserve edge type in metadata', () => {
      const graph = { nodes: sampleNodes, edges: sampleEdges };
      const result = GraphAdapter.toMinCutFormat(graph);

      const edge = result.edges[0];
      expect(edge.edgeType).toBeDefined();
    });
  });

  describe('normalizeWeight', () => {
    it('should normalize extends edge to 1.0', () => {
      const edge: GraphEdge = {
        id: 'e1',
        source: 'n1',
        target: 'n2',
        type: 'extends',
        weight: 1.0,
        properties: {},
      };

      const normalized = GraphAdapter.normalizeWeight(edge);
      expect(normalized).toBe(1.0);
    });

    it('should normalize imports edge to 0.8', () => {
      const edge: GraphEdge = {
        id: 'e1',
        source: 'n1',
        target: 'n2',
        type: 'imports',
        weight: 1.0,
        properties: {},
      };

      const normalized = GraphAdapter.normalizeWeight(edge);
      expect(normalized).toBe(0.8);
    });

    it('should apply weight multiplier', () => {
      const edge: GraphEdge = {
        id: 'e1',
        source: 'n1',
        target: 'n2',
        type: 'imports',
        weight: 2.0,
        properties: {},
      };

      const normalized = GraphAdapter.normalizeWeight(edge);
      expect(normalized).toBe(1.6); // 0.8 * 2.0
    });

    it('should cap multiplier at 2.0', () => {
      const edge: GraphEdge = {
        id: 'e1',
        source: 'n1',
        target: 'n2',
        type: 'imports',
        weight: 5.0,
        properties: {},
      };

      const normalized = GraphAdapter.normalizeWeight(edge);
      expect(normalized).toBe(1.6); // 0.8 * 2.0 (capped)
    });

    it('should use normalized weights when option enabled', () => {
      const graph = { nodes: sampleNodes, edges: sampleEdges };
      const result = GraphAdapter.toMinCutFormat(graph, {
        normalizeWeights: true,
      });

      // First edge is 'imports' with weight 1.0 -> normalized to 0.8
      expect(result.edges[0].weight).toBe(0.8);

      // Second edge is 'calls' with weight 0.5 -> normalized to 0.3 (0.6 * 0.5)
      expect(result.edges[1].weight).toBe(0.3);
    });
  });

  describe('getEdgeTypeWeight', () => {
    it('should return correct weights for all edge types', () => {
      expect(GraphAdapter.getEdgeTypeWeight('extends')).toBe(1.0);
      expect(GraphAdapter.getEdgeTypeWeight('implements')).toBe(0.9);
      expect(GraphAdapter.getEdgeTypeWeight('imports')).toBe(0.8);
      expect(GraphAdapter.getEdgeTypeWeight('calls')).toBe(0.6);
      expect(GraphAdapter.getEdgeTypeWeight('uses')).toBe(0.5);
      expect(GraphAdapter.getEdgeTypeWeight('contains')).toBe(0.3);
      expect(GraphAdapter.getEdgeTypeWeight('tests')).toBe(0.2);
    });

    it('should return default weight for unknown type', () => {
      const unknownType = 'unknown' as EdgeType;
      expect(GraphAdapter.getEdgeTypeWeight(unknownType)).toBe(0.5);
    });
  });

  describe('extractFileSubgraph', () => {
    it('should extract nodes from specified files', () => {
      const graph = { nodes: sampleNodes, edges: sampleEdges };
      const subgraph = GraphAdapter.extractFileSubgraph(graph, ['/src/auth.ts']);

      expect(subgraph.nodes).toHaveLength(2); // file and function from auth.ts
      expect(subgraph.nodes.every(n => n.filePath === '/src/auth.ts')).toBe(true);
    });

    it('should only include edges between subgraph nodes', () => {
      const graph = { nodes: sampleNodes, edges: sampleEdges };
      const subgraph = GraphAdapter.extractFileSubgraph(graph, ['/src/auth.ts']);

      // No edges should remain since both endpoints must be in auth.ts
      expect(subgraph.edges).toHaveLength(0);
    });

    it('should handle empty file list', () => {
      const graph = { nodes: sampleNodes, edges: sampleEdges };
      const subgraph = GraphAdapter.extractFileSubgraph(graph, []);

      expect(subgraph.nodes).toHaveLength(0);
      expect(subgraph.edges).toHaveLength(0);
    });

    it('should handle empty graph', () => {
      const graph = { nodes: [], edges: [] };
      const subgraph = GraphAdapter.extractFileSubgraph(graph, ['/src/auth.ts']);

      expect(subgraph.nodes).toHaveLength(0);
      expect(subgraph.edges).toHaveLength(0);
    });
  });

  describe('aggregateByFile', () => {
    it('should create one node per file', () => {
      const graph = { nodes: sampleNodes, edges: sampleEdges };
      const fileGraph = GraphAdapter.aggregateByFile(graph);

      // 2 unique files: /src/auth.ts and /src/user.ts
      expect(fileGraph.nodes).toHaveLength(2);
      expect(fileGraph.nodes.every(n => n.type === 'file')).toBe(true);
    });

    it('should aggregate edges between files', () => {
      const graph = { nodes: sampleNodes, edges: sampleEdges };
      const fileGraph = GraphAdapter.aggregateByFile(graph);

      // One file-to-file edge (auth.ts -> user.ts -> auth.ts crosses files once)
      expect(fileGraph.edges.length).toBeGreaterThan(0);
    });

    it('should skip same-file edges', () => {
      const sameFileEdge: GraphEdge = {
        id: 'edge_same',
        source: 'node1',
        target: 'node3', // Both in /src/auth.ts
        type: 'calls',
        weight: 1.0,
        properties: {},
      };

      const graph = {
        nodes: sampleNodes,
        edges: [...sampleEdges, sameFileEdge],
      };

      const fileGraph = GraphAdapter.aggregateByFile(graph);

      // Should not include the same-file edge
      // Only cross-file edges should remain
      expect(fileGraph.edges.every(e => {
        const sourceNode = fileGraph.nodes.find(n => n.id === e.source);
        const targetNode = fileGraph.nodes.find(n => n.id === e.target);
        return sourceNode?.filePath !== targetNode?.filePath;
      })).toBe(true);
    });

    it('should aggregate weights for multiple edges between files', () => {
      const additionalEdge: GraphEdge = {
        id: 'edge_add',
        source: 'node1',
        target: 'node2',
        type: 'uses',
        weight: 0.5,
        properties: {},
      };

      const graph = {
        nodes: sampleNodes,
        edges: [...sampleEdges, additionalEdge],
      };

      const fileGraph = GraphAdapter.aggregateByFile(graph);

      // Find the aggregated edge
      const aggregatedEdge = fileGraph.edges.find(e =>
        e.properties?.aggregatedWeight !== undefined
      );

      // Should sum the weights
      expect(aggregatedEdge?.weight).toBeGreaterThan(1.0);
    });

    it('should handle empty graph', () => {
      const graph = { nodes: [], edges: [] };
      const fileGraph = GraphAdapter.aggregateByFile(graph);

      expect(fileGraph.nodes).toHaveLength(0);
      expect(fileGraph.edges).toHaveLength(0);
    });
  });

  describe('validateGraph', () => {
    it('should validate correct graph', () => {
      const graph = { nodes: sampleNodes, edges: sampleEdges };
      const validation = GraphAdapter.validateGraph(graph);

      expect(validation.valid).toBe(true);
      expect(validation.errors).toHaveLength(0);
    });

    it('should reject empty graph', () => {
      const graph = { nodes: [], edges: [] };
      const validation = GraphAdapter.validateGraph(graph);

      expect(validation.valid).toBe(false);
      expect(validation.errors).toContain('Graph has no nodes');
    });

    it('should reject single-node graph', () => {
      const graph = { nodes: [sampleNodes[0]], edges: [] };
      const validation = GraphAdapter.validateGraph(graph);

      expect(validation.valid).toBe(false);
      expect(validation.errors).toContain(
        'Graph must have at least 2 nodes for MinCut analysis'
      );
    });

    it('should warn about disconnected graph', () => {
      const graph = { nodes: sampleNodes, edges: [] };
      const validation = GraphAdapter.validateGraph(graph);

      expect(validation.valid).toBe(false);
      expect(validation.errors).toContain('Graph has no edges (completely disconnected)');
    });

    it('should detect invalid edge references', () => {
      const invalidEdge: GraphEdge = {
        id: 'edge_bad',
        source: 'nonexistent',
        target: 'node1',
        type: 'imports',
        weight: 1.0,
        properties: {},
      };

      const graph = {
        nodes: sampleNodes,
        edges: [invalidEdge],
      };

      const validation = GraphAdapter.validateGraph(graph);

      expect(validation.valid).toBe(false);
      expect(validation.errors.some(e => e.includes('non-existent source node'))).toBe(true);
    });
  });

  describe('Performance', () => {
    it('should handle large graph efficiently', () => {
      // Create 1000-node graph
      const nodes: GraphNode[] = [];
      const edges: GraphEdge[] = [];

      for (let i = 0; i < 1000; i++) {
        nodes.push({
          id: `node${i}`,
          type: 'class',
          label: `Class${i}`,
          filePath: `/src/file${i % 100}.ts`,
          startLine: 1,
          endLine: 10,
          language: 'typescript',
          properties: {},
        });
      }

      // Create edges (every node connects to next 3 nodes)
      for (let i = 0; i < 997; i++) {
        for (let j = 1; j <= 3; j++) {
          edges.push({
            id: `edge${i}_${j}`,
            source: `node${i}`,
            target: `node${i + j}`,
            type: 'imports',
            weight: 1.0,
            properties: {},
          });
        }
      }

      const graph = { nodes, edges };

      const startTime = Date.now();
      const result = GraphAdapter.toMinCutFormat(graph);
      const duration = Date.now() - startTime;

      expect(result.nodes).toHaveLength(1000);
      expect(result.edges).toHaveLength(2991); // 3 * 997
      expect(duration).toBeLessThan(100); // Should be < 100ms
    });
  });
});
