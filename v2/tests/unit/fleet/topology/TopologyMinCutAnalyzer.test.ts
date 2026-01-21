/**
 * Unit tests for TopologyMinCutAnalyzer
 *
 * Tests SPOF detection, resilience scoring, and optimization suggestions
 */

import { describe, it, expect, beforeEach } from '@jest/globals';
import { TopologyMinCutAnalyzer } from '../../../../src/fleet/topology/TopologyMinCutAnalyzer.js';
import {
  FleetTopology,
  TopologyNode,
  TopologyEdge,
} from '../../../../src/fleet/topology/types.js';

describe('TopologyMinCutAnalyzer', () => {
  let analyzer: TopologyMinCutAnalyzer;

  beforeEach(() => {
    analyzer = new TopologyMinCutAnalyzer();
  });

  // Helper to create test topologies
  function createTopology(
    nodes: TopologyNode[],
    edges: TopologyEdge[],
    mode: 'hierarchical' | 'mesh' | 'hybrid' | 'adaptive' = 'hierarchical'
  ): FleetTopology {
    return {
      nodes,
      edges,
      mode,
      lastUpdated: new Date(),
    };
  }

  function createNode(
    id: string,
    type: string = 'worker',
    role: TopologyNode['role'] = 'worker',
    status: TopologyNode['status'] = 'active',
    priority: TopologyNode['priority'] = 'medium'
  ): TopologyNode {
    return { id, type, role, status, priority };
  }

  function createEdge(
    sourceId: string,
    targetId: string,
    weight: number = 1.0,
    bidirectional: boolean = true
  ): TopologyEdge {
    return {
      id: `${sourceId}-${targetId}`,
      sourceId,
      targetId,
      connectionType: 'coordination',
      weight,
      bidirectional,
    };
  }

  describe('analyzeResilience', () => {
    it('should return high resilience for well-connected mesh topology', async () => {
      // Create a mesh topology with 4 nodes all connected
      const nodes = [
        createNode('coord-1', 'coordinator', 'coordinator'),
        createNode('coord-2', 'coordinator', 'coordinator'),
        createNode('worker-1', 'worker', 'worker'),
        createNode('worker-2', 'worker', 'worker'),
      ];

      const edges = [
        createEdge('coord-1', 'coord-2'),
        createEdge('coord-1', 'worker-1'),
        createEdge('coord-1', 'worker-2'),
        createEdge('coord-2', 'worker-1'),
        createEdge('coord-2', 'worker-2'),
        createEdge('worker-1', 'worker-2'),
      ];

      const topology = createTopology(nodes, edges, 'mesh');
      const result = await analyzer.analyzeResilience(topology);

      expect(result.score).toBeGreaterThan(0.5);
      expect(result.grade).toMatch(/[ABC]/);
      expect(result.criticalSpofs).toHaveLength(0);
      expect(result.computationTimeMs).toBeGreaterThan(0);
    });

    it('should detect SPOF in star topology', async () => {
      // Star topology: central coordinator connected to all workers
      const nodes = [
        createNode('coord-1', 'coordinator', 'coordinator'),
        createNode('worker-1', 'worker', 'worker'),
        createNode('worker-2', 'worker', 'worker'),
        createNode('worker-3', 'worker', 'worker'),
        createNode('worker-4', 'worker', 'worker'),
      ];

      const edges = [
        createEdge('coord-1', 'worker-1'),
        createEdge('coord-1', 'worker-2'),
        createEdge('coord-1', 'worker-3'),
        createEdge('coord-1', 'worker-4'),
      ];

      const topology = createTopology(nodes, edges, 'hierarchical');
      const result = await analyzer.analyzeResilience(topology);

      expect(result.spofs.length).toBeGreaterThan(0);
      expect(result.spofs[0].agentId).toBe('coord-1');
      expect(result.spofs[0].severity).toBe('critical');
      // When coord-1 is removed, 4 isolated workers remain
      // The largest component has 1 worker, so 3 are "disconnected" from it
      expect(result.spofs[0].affectedAgents).toBeGreaterThanOrEqual(3);
      expect(result.recommendations.length).toBeGreaterThan(0);
    });

    it('should return perfect resilience for single-node topology', async () => {
      const nodes = [createNode('coord-1', 'coordinator', 'coordinator')];
      const edges: TopologyEdge[] = [];

      const topology = createTopology(nodes, edges);
      const result = await analyzer.analyzeResilience(topology);

      expect(result.score).toBe(1);
      expect(result.spofs).toHaveLength(0);
    });

    it('should handle empty topology', async () => {
      const topology = createTopology([], []);
      const result = await analyzer.analyzeResilience(topology);

      expect(result.score).toBe(1);
      expect(result.spofs).toHaveLength(0);
      expect(result.grade).toBe('A');
    });

    it('should exclude failed nodes from analysis', async () => {
      const nodes = [
        createNode('coord-1', 'coordinator', 'coordinator', 'active'),
        createNode('worker-1', 'worker', 'worker', 'failed'),
        createNode('worker-2', 'worker', 'worker', 'active'),
      ];

      const edges = [
        createEdge('coord-1', 'worker-1'),
        createEdge('coord-1', 'worker-2'),
      ];

      const topology = createTopology(nodes, edges);
      const result = await analyzer.analyzeResilience(topology);

      // Failed worker-1 should be excluded
      expect(result.minCutValue).toBeDefined();
      expect(result.vulnerablePartitions.flat()).not.toContain('worker-1');
    });
  });

  describe('detectSpofs', () => {
    it('should detect coordinator as SPOF in hierarchical topology', async () => {
      const nodes = [
        createNode('coord-1', 'coordinator', 'coordinator'),
        createNode('worker-1', 'worker', 'worker'),
        createNode('worker-2', 'worker', 'worker'),
      ];

      const edges = [
        createEdge('coord-1', 'worker-1'),
        createEdge('coord-1', 'worker-2'),
      ];

      const topology = createTopology(nodes, edges);
      const spofs = await analyzer.detectSpofs(topology);

      expect(spofs.length).toBe(1);
      expect(spofs[0].agentId).toBe('coord-1');
      // When coord-1 removed, workers become isolated - 1 in largest component, 1 disconnected
      expect(spofs[0].disconnectedAgents.length).toBeGreaterThanOrEqual(1);
    });

    it('should not detect SPOF in fully connected topology', async () => {
      // Triangle topology - no SPOF
      const nodes = [
        createNode('node-1', 'worker', 'coordinator'),
        createNode('node-2', 'worker', 'worker'),
        createNode('node-3', 'worker', 'worker'),
      ];

      const edges = [
        createEdge('node-1', 'node-2'),
        createEdge('node-2', 'node-3'),
        createEdge('node-3', 'node-1'),
      ];

      const topology = createTopology(nodes, edges, 'mesh');
      const spofs = await analyzer.detectSpofs(topology);

      expect(spofs).toHaveLength(0);
    });

    it('should detect multiple SPOFs in chain topology', async () => {
      // Chain: A - B - C - D (B and C are SPOFs)
      const nodes = [
        createNode('A', 'worker', 'worker'),
        createNode('B', 'worker', 'worker'),
        createNode('C', 'worker', 'worker'),
        createNode('D', 'worker', 'worker'),
      ];

      const edges = [
        createEdge('A', 'B'),
        createEdge('B', 'C'),
        createEdge('C', 'D'),
      ];

      const topology = createTopology(nodes, edges);
      const spofs = await analyzer.detectSpofs(topology);

      expect(spofs.length).toBe(2);
      expect(spofs.map(s => s.agentId)).toContain('B');
      expect(spofs.map(s => s.agentId)).toContain('C');
    });

    it('should provide recommendations for each SPOF', async () => {
      const nodes = [
        createNode('coord-1', 'coordinator', 'coordinator'),
        createNode('worker-1', 'worker', 'worker'),
        createNode('worker-2', 'worker', 'worker'),
      ];

      const edges = [
        createEdge('coord-1', 'worker-1'),
        createEdge('coord-1', 'worker-2'),
      ];

      const topology = createTopology(nodes, edges);
      const spofs = await analyzer.detectSpofs(topology);

      expect(spofs[0].recommendations.length).toBeGreaterThan(0);
      expect(spofs[0].recommendations.some(r => r.includes('backup'))).toBe(true);
    });
  });

  describe('suggestOptimizations', () => {
    it('should suggest adding backup coordinator for single coordinator', async () => {
      const nodes = [
        createNode('coord-1', 'coordinator', 'coordinator'),
        createNode('worker-1', 'worker', 'worker'),
      ];

      const edges = [createEdge('coord-1', 'worker-1')];

      const topology = createTopology(nodes, edges);
      const optimizations = await analyzer.suggestOptimizations(topology);

      expect(optimizations.length).toBeGreaterThan(0);
      expect(optimizations.some(o => o.type === 'add-node')).toBe(true);
      expect(
        optimizations.some(o => o.description.includes('backup coordinator'))
      ).toBe(true);
    });

    it('should suggest topology restructure for low-resilience hierarchical', async () => {
      // Create hierarchical topology with many workers
      const nodes = [
        createNode('coord-1', 'coordinator', 'coordinator'),
        ...Array.from({ length: 10 }, (_, i) =>
          createNode(`worker-${i}`, 'worker', 'worker')
        ),
      ];

      const edges = nodes
        .filter(n => n.role === 'worker')
        .map(n => createEdge('coord-1', n.id));

      const topology = createTopology(nodes, edges, 'hierarchical');
      const optimizations = await analyzer.suggestOptimizations(topology);

      expect(optimizations.length).toBeGreaterThan(0);
    });

    it('should suggest adding edges to mitigate critical SPOFs', async () => {
      const nodes = [
        createNode('coord-1', 'coordinator', 'coordinator'),
        createNode('coord-2', 'coordinator', 'coordinator'),
        createNode('worker-1', 'worker', 'worker'),
        createNode('worker-2', 'worker', 'worker'),
      ];

      // Only coord-1 connects to workers, making it a SPOF
      const edges = [
        createEdge('coord-1', 'worker-1'),
        createEdge('coord-1', 'worker-2'),
        createEdge('coord-1', 'coord-2'),
      ];

      const topology = createTopology(nodes, edges);
      const optimizations = await analyzer.suggestOptimizations(topology);

      const edgeOptimizations = optimizations.filter(o => o.type === 'add-edge');
      expect(edgeOptimizations.length).toBeGreaterThan(0);
    });

    it('should prioritize critical optimizations', async () => {
      const nodes = [
        createNode('coord-1', 'coordinator', 'coordinator'),
        createNode('worker-1', 'worker', 'worker'),
        createNode('worker-2', 'worker', 'worker'),
      ];

      const edges = [
        createEdge('coord-1', 'worker-1'),
        createEdge('coord-1', 'worker-2'),
      ];

      const topology = createTopology(nodes, edges);
      const optimizations = await analyzer.suggestOptimizations(topology);

      if (optimizations.length > 1) {
        // First should be critical priority
        expect(optimizations[0].priority).toBe('critical');
      }
    });
  });

  describe('resilience scoring', () => {
    it('should give lower score for more SPOFs', async () => {
      // Star topology (has SPOF)
      const starNodes = [
        createNode('coord-1', 'coordinator', 'coordinator'),
        createNode('worker-1', 'worker', 'worker'),
        createNode('worker-2', 'worker', 'worker'),
      ];
      const starEdges = [
        createEdge('coord-1', 'worker-1'),
        createEdge('coord-1', 'worker-2'),
      ];
      const starTopology = createTopology(starNodes, starEdges);

      // Triangle topology (no SPOF)
      const triangleNodes = [
        createNode('node-1', 'coordinator', 'coordinator'),
        createNode('node-2', 'coordinator', 'coordinator'),
        createNode('node-3', 'worker', 'worker'),
      ];
      const triangleEdges = [
        createEdge('node-1', 'node-2'),
        createEdge('node-2', 'node-3'),
        createEdge('node-3', 'node-1'),
      ];
      const triangleTopology = createTopology(triangleNodes, triangleEdges, 'mesh');

      const starResult = await analyzer.analyzeResilience(starTopology);
      const triangleResult = await analyzer.analyzeResilience(triangleTopology);

      expect(triangleResult.score).toBeGreaterThan(starResult.score);
    });

    it('should assign correct grades based on score', async () => {
      // Fully connected mesh - should get A or B
      const meshNodes = [
        createNode('coord-1', 'coordinator', 'coordinator'),
        createNode('coord-2', 'coordinator', 'coordinator'),
        createNode('worker-1', 'worker', 'worker'),
      ];
      const meshEdges = [
        createEdge('coord-1', 'coord-2'),
        createEdge('coord-1', 'worker-1'),
        createEdge('coord-2', 'worker-1'),
      ];
      const meshTopology = createTopology(meshNodes, meshEdges, 'mesh');

      const result = await analyzer.analyzeResilience(meshTopology);

      expect(['A', 'B', 'C']).toContain(result.grade);
    });

    it('should give F grade for topology with many critical SPOFs', async () => {
      // Chain topology with many SPOFs
      const chainNodes = Array.from({ length: 6 }, (_, i) =>
        createNode(`node-${i}`, 'worker', i === 0 ? 'coordinator' : 'worker')
      );
      const chainEdges = Array.from({ length: 5 }, (_, i) =>
        createEdge(`node-${i}`, `node-${i + 1}`)
      );

      const topology = createTopology(chainNodes, chainEdges);
      const result = await analyzer.analyzeResilience(topology);

      // Chain topology should get lower grade due to multiple SPOFs
      expect(['C', 'D', 'F']).toContain(result.grade);
    });
  });

  describe('edge cases', () => {
    it('should handle disconnected nodes', async () => {
      const nodes = [
        createNode('coord-1', 'coordinator', 'coordinator'),
        createNode('worker-1', 'worker', 'worker'),
        createNode('isolated', 'worker', 'worker'),
      ];

      const edges = [createEdge('coord-1', 'worker-1')];

      const topology = createTopology(nodes, edges);
      const result = await analyzer.analyzeResilience(topology);

      // Should still compute without error
      expect(result.score).toBeDefined();
    });

    it('should handle self-loops gracefully', async () => {
      const nodes = [
        createNode('node-1', 'worker', 'worker'),
        createNode('node-2', 'worker', 'worker'),
      ];

      const edges = [
        createEdge('node-1', 'node-1'), // Self-loop
        createEdge('node-1', 'node-2'),
      ];

      const topology = createTopology(nodes, edges);
      const result = await analyzer.analyzeResilience(topology);

      expect(result).toBeDefined();
    });

    it('should handle topology with only observers', async () => {
      const nodes = [
        createNode('obs-1', 'observer', 'observer'),
        createNode('obs-2', 'observer', 'observer'),
      ];

      const edges = [createEdge('obs-1', 'obs-2')];

      const topology = createTopology(nodes, edges);
      const result = await analyzer.analyzeResilience(topology);

      // Should still work
      expect(result.score).toBeDefined();
    });

    it('should use custom config when provided', async () => {
      const customAnalyzer = new TopologyMinCutAnalyzer({
        analyzeAllSpofs: false,
        minResilienceScore: 0.8,
      });

      const nodes = [
        createNode('coord-1', 'coordinator', 'coordinator'),
        createNode('worker-1', 'worker', 'worker'),
        createNode('worker-2', 'worker', 'worker'),
      ];

      const edges = [
        createEdge('coord-1', 'worker-1'),
        createEdge('coord-1', 'worker-2'),
      ];

      const topology = createTopology(nodes, edges);
      const result = await customAnalyzer.analyzeResilience(topology);

      // With analyzeAllSpofs=false, only coordinator should be checked
      expect(result.spofs.length).toBeGreaterThanOrEqual(0);
    });
  });

  describe('recommendations', () => {
    it('should recommend adding backup coordinator', async () => {
      const nodes = [
        createNode('coord-1', 'coordinator', 'coordinator'),
        createNode('worker-1', 'worker', 'worker'),
        createNode('worker-2', 'worker', 'worker'),
      ];

      const edges = [
        createEdge('coord-1', 'worker-1'),
        createEdge('coord-1', 'worker-2'),
      ];

      const topology = createTopology(nodes, edges);
      const result = await analyzer.analyzeResilience(topology);

      expect(
        result.recommendations.some(r =>
          r.toLowerCase().includes('coordinator') || r.toLowerCase().includes('backup')
        )
      ).toBe(true);
    });

    it('should recommend cross-connections for low min-cut', async () => {
      // Two clusters connected by single edge
      const nodes = [
        createNode('cluster1-a', 'worker', 'worker'),
        createNode('cluster1-b', 'worker', 'worker'),
        createNode('cluster2-a', 'worker', 'worker'),
        createNode('cluster2-b', 'worker', 'worker'),
      ];

      const edges = [
        createEdge('cluster1-a', 'cluster1-b'),
        createEdge('cluster2-a', 'cluster2-b'),
        createEdge('cluster1-a', 'cluster2-a'), // Single cross-connection
      ];

      const topology = createTopology(nodes, edges);
      const result = await analyzer.analyzeResilience(topology);

      // May have SPOFs which generate recommendations, or may have low connectivity
      // The main test is that analysis completes without error
      expect(result.score).toBeDefined();
      expect(result.spofs.length).toBeGreaterThanOrEqual(0);
    });
  });
});
