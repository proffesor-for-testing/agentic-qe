/**
 * Agentic QE v3 - Causal Graph Tests
 * ADR-035: STDP-based spike timing correlation for root cause analysis
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { CausalGraphImpl } from '../../../src/causal-discovery/causal-graph';
import { CausalEdge, TestEventType } from '../../../src/causal-discovery/types';

describe('CausalGraphImpl', () => {
  const createEdge = (
    source: TestEventType,
    target: TestEventType,
    strength: number = 0.5
  ): CausalEdge => ({
    source,
    target,
    strength,
    relation: 'causes',
    observations: 10,
    lastObserved: Date.now(),
  });

  describe('construction', () => {
    it('should create an empty graph', () => {
      const graph = new CausalGraphImpl([], []);
      expect(graph.nodes).toHaveLength(0);
      expect(graph.edges).toHaveLength(0);
    });

    it('should create a graph with nodes and edges', () => {
      const nodes: TestEventType[] = ['code_changed', 'build_started', 'test_failed'];
      const edges: CausalEdge[] = [
        createEdge('code_changed', 'build_started'),
        createEdge('build_started', 'test_failed'),
      ];

      const graph = new CausalGraphImpl(nodes, edges);

      expect(graph.nodes).toHaveLength(3);
      expect(graph.edges).toHaveLength(2);
    });
  });

  describe('edgesFrom', () => {
    it('should return all edges originating from a node', () => {
      const nodes: TestEventType[] = ['code_changed', 'build_started', 'test_started', 'test_failed'];
      const edges: CausalEdge[] = [
        createEdge('code_changed', 'build_started'),
        createEdge('code_changed', 'test_started'),
        createEdge('build_started', 'test_failed'),
      ];

      const graph = new CausalGraphImpl(nodes, edges);
      const fromCodeChanged = graph.edgesFrom('code_changed');

      expect(fromCodeChanged).toHaveLength(2);
      expect(fromCodeChanged.map(e => e.target)).toContain('build_started');
      expect(fromCodeChanged.map(e => e.target)).toContain('test_started');
    });

    it('should return empty array for node with no outgoing edges', () => {
      const nodes: TestEventType[] = ['code_changed', 'test_failed'];
      const edges: CausalEdge[] = [createEdge('code_changed', 'test_failed')];

      const graph = new CausalGraphImpl(nodes, edges);
      const fromTestFailed = graph.edgesFrom('test_failed');

      expect(fromTestFailed).toHaveLength(0);
    });
  });

  describe('edgesTo', () => {
    it('should return all edges pointing to a node', () => {
      const nodes: TestEventType[] = ['code_changed', 'config_changed', 'test_failed'];
      const edges: CausalEdge[] = [
        createEdge('code_changed', 'test_failed', 0.7),
        createEdge('config_changed', 'test_failed', 0.5),
      ];

      const graph = new CausalGraphImpl(nodes, edges);
      const toTestFailed = graph.edgesTo('test_failed');

      expect(toTestFailed).toHaveLength(2);
      expect(toTestFailed.map(e => e.source)).toContain('code_changed');
      expect(toTestFailed.map(e => e.source)).toContain('config_changed');
    });
  });

  describe('reachableFrom', () => {
    it('should find all reachable nodes via BFS', () => {
      const nodes: TestEventType[] = [
        'code_changed',
        'build_started',
        'test_started',
        'test_failed',
        'alert_fired',
      ];
      const edges: CausalEdge[] = [
        createEdge('code_changed', 'build_started'),
        createEdge('build_started', 'test_started'),
        createEdge('test_started', 'test_failed'),
        createEdge('test_failed', 'alert_fired'),
      ];

      const graph = new CausalGraphImpl(nodes, edges);
      const reachable = graph.reachableFrom('code_changed');

      expect(reachable.size).toBe(5);
      expect(reachable.has('code_changed')).toBe(true);
      expect(reachable.has('build_started')).toBe(true);
      expect(reachable.has('test_failed')).toBe(true);
      expect(reachable.has('alert_fired')).toBe(true);
    });

    it('should handle isolated nodes', () => {
      const nodes: TestEventType[] = ['code_changed', 'test_failed'];
      const edges: CausalEdge[] = []; // No edges

      const graph = new CausalGraphImpl(nodes, edges);
      const reachable = graph.reachableFrom('code_changed');

      expect(reachable.size).toBe(1);
      expect(reachable.has('code_changed')).toBe(true);
    });
  });

  describe('reachableTo', () => {
    it('should find all nodes that can reach a target', () => {
      const nodes: TestEventType[] = [
        'code_changed',
        'config_changed',
        'build_started',
        'test_failed',
      ];
      const edges: CausalEdge[] = [
        createEdge('code_changed', 'build_started'),
        createEdge('config_changed', 'build_started'),
        createEdge('build_started', 'test_failed'),
      ];

      const graph = new CausalGraphImpl(nodes, edges);
      const canReach = (graph as CausalGraphImpl).reachableTo('test_failed');

      expect(canReach.size).toBe(4);
      expect(canReach.has('code_changed')).toBe(true);
      expect(canReach.has('config_changed')).toBe(true);
    });
  });

  describe('transitiveClosure', () => {
    it('should compute transitive closure', () => {
      const nodes: TestEventType[] = ['code_changed', 'build_started', 'test_failed'];
      const edges: CausalEdge[] = [
        createEdge('code_changed', 'build_started', 0.8),
        createEdge('build_started', 'test_failed', 0.6),
      ];

      const graph = new CausalGraphImpl(nodes, edges);
      const closed = graph.transitiveClosure();

      // Should now have direct edge from code_changed to test_failed
      const transitiveEdge = closed.edges.find(
        e => e.source === 'code_changed' && e.target === 'test_failed'
      );
      expect(transitiveEdge).toBeDefined();
      // Transitive strength should be min of path
      expect(transitiveEdge!.strength).toBe(0.6);
    });

    it('should handle empty graph', () => {
      const graph = new CausalGraphImpl([], []);
      const closed = graph.transitiveClosure();

      expect(closed.nodes).toHaveLength(0);
      expect(closed.edges).toHaveLength(0);
    });

    it('should preserve direct edges', () => {
      const nodes: TestEventType[] = ['code_changed', 'test_failed'];
      const edges: CausalEdge[] = [createEdge('code_changed', 'test_failed', 0.9)];

      const graph = new CausalGraphImpl(nodes, edges);
      const closed = graph.transitiveClosure();

      expect(closed.edges).toHaveLength(1);
      expect(closed.edges[0].strength).toBe(0.9);
    });
  });

  describe('findPaths', () => {
    it('should find all paths between two nodes', () => {
      const nodes: TestEventType[] = [
        'code_changed',
        'build_started',
        'test_started',
        'test_failed',
      ];
      const edges: CausalEdge[] = [
        createEdge('code_changed', 'build_started'),
        createEdge('build_started', 'test_failed'),
        createEdge('code_changed', 'test_started'),
        createEdge('test_started', 'test_failed'),
      ];

      const graph = new CausalGraphImpl(nodes, edges);
      const paths = graph.findPaths('code_changed', 'test_failed');

      expect(paths.length).toBe(2);
      // Both paths should start at code_changed and end at test_failed
      for (const path of paths) {
        expect(path[0]).toBe('code_changed');
        expect(path[path.length - 1]).toBe('test_failed');
      }
    });

    it('should return empty for unreachable targets', () => {
      const nodes: TestEventType[] = ['code_changed', 'test_failed'];
      const edges: CausalEdge[] = []; // No connection

      const graph = new CausalGraphImpl(nodes, edges);
      const paths = graph.findPaths('code_changed', 'test_failed');

      expect(paths).toHaveLength(0);
    });

    it('should handle cycles without infinite loops', () => {
      const nodes: TestEventType[] = ['test_started', 'test_failed', 'alert_fired'];
      const edges: CausalEdge[] = [
        createEdge('test_started', 'test_failed'),
        createEdge('test_failed', 'alert_fired'),
        createEdge('alert_fired', 'test_started'), // Cycle back
      ];

      const graph = new CausalGraphImpl(nodes, edges);
      const paths = graph.findPaths('test_started', 'alert_fired');

      // Should find path without getting stuck in cycle
      expect(paths.length).toBeGreaterThan(0);
      expect(paths[0]).toContain('test_started');
      expect(paths[0]).toContain('alert_fired');
    });
  });

  describe('getPathStrength', () => {
    it('should calculate path strength as product of edges', () => {
      const nodes: TestEventType[] = ['code_changed', 'build_started', 'test_failed'];
      const edges: CausalEdge[] = [
        createEdge('code_changed', 'build_started', 0.8),
        createEdge('build_started', 'test_failed', 0.5),
      ];

      const graph = new CausalGraphImpl(nodes, edges);
      const strength = graph.getPathStrength(['code_changed', 'build_started', 'test_failed']);

      expect(strength).toBeCloseTo(0.4, 5); // 0.8 * 0.5
    });

    it('should return 0 for broken paths', () => {
      const nodes: TestEventType[] = ['code_changed', 'test_failed'];
      const edges: CausalEdge[] = []; // No edges

      const graph = new CausalGraphImpl(nodes, edges);
      const strength = graph.getPathStrength(['code_changed', 'test_failed']);

      expect(strength).toBe(0);
    });
  });

  describe('stronglyConnectedComponents', () => {
    it('should find SCCs using Tarjan algorithm', () => {
      const nodes: TestEventType[] = [
        'test_started',
        'test_failed',
        'alert_fired',
        'code_changed',
      ];
      const edges: CausalEdge[] = [
        // Cycle: test_started -> test_failed -> alert_fired -> test_started
        createEdge('test_started', 'test_failed'),
        createEdge('test_failed', 'alert_fired'),
        createEdge('alert_fired', 'test_started'),
        // Isolated node
        createEdge('code_changed', 'test_started'),
      ];

      const graph = new CausalGraphImpl(nodes, edges);
      const sccs = graph.stronglyConnectedComponents();

      // Should have 2 SCCs: the cycle (3 nodes) and the isolated node
      expect(sccs).toHaveLength(2);

      // One SCC should have 3 nodes (the cycle)
      const largeScc = sccs.find(scc => scc.length === 3);
      expect(largeScc).toBeDefined();
      expect(largeScc).toContain('test_started');
      expect(largeScc).toContain('test_failed');
      expect(largeScc).toContain('alert_fired');
    });

    it('should handle DAG (no cycles)', () => {
      const nodes: TestEventType[] = ['code_changed', 'build_started', 'test_failed'];
      const edges: CausalEdge[] = [
        createEdge('code_changed', 'build_started'),
        createEdge('build_started', 'test_failed'),
      ];

      const graph = new CausalGraphImpl(nodes, edges);
      const sccs = graph.stronglyConnectedComponents();

      // Each node is its own SCC
      expect(sccs).toHaveLength(3);
      sccs.forEach(scc => expect(scc).toHaveLength(1));
    });
  });

  describe('hasCycles', () => {
    it('should detect cycles', () => {
      const nodes: TestEventType[] = ['test_started', 'test_failed', 'alert_fired'];
      const edges: CausalEdge[] = [
        createEdge('test_started', 'test_failed'),
        createEdge('test_failed', 'alert_fired'),
        createEdge('alert_fired', 'test_started'),
      ];

      const graph = new CausalGraphImpl(nodes, edges);
      expect(graph.hasCycles()).toBe(true);
    });

    it('should detect self-loops', () => {
      const nodes: TestEventType[] = ['test_flaky'];
      const edges: CausalEdge[] = [createEdge('test_flaky', 'test_flaky')];

      const graph = new CausalGraphImpl(nodes, edges);
      expect(graph.hasCycles()).toBe(true);
    });

    it('should return false for acyclic graphs', () => {
      const nodes: TestEventType[] = ['code_changed', 'test_failed'];
      const edges: CausalEdge[] = [createEdge('code_changed', 'test_failed')];

      const graph = new CausalGraphImpl(nodes, edges);
      expect(graph.hasCycles()).toBe(false);
    });
  });

  describe('getFeedbackLoops', () => {
    it('should return all feedback loops', () => {
      const nodes: TestEventType[] = [
        'test_started',
        'test_failed',
        'test_flaky',
        'code_changed',
      ];
      const edges: CausalEdge[] = [
        createEdge('test_started', 'test_failed'),
        createEdge('test_failed', 'test_started'), // Loop 1
        createEdge('test_flaky', 'test_flaky'), // Self-loop
        createEdge('code_changed', 'test_started'),
      ];

      const graph = new CausalGraphImpl(nodes, edges);
      const loops = graph.getFeedbackLoops();

      expect(loops.length).toBe(2);
    });
  });

  describe('degree analysis', () => {
    it('should find high out-degree nodes', () => {
      const nodes: TestEventType[] = [
        'code_changed',
        'build_started',
        'test_started',
        'test_failed',
        'alert_fired',
      ];
      const edges: CausalEdge[] = [
        createEdge('code_changed', 'build_started'),
        createEdge('code_changed', 'test_started'),
        createEdge('code_changed', 'test_failed'),
        createEdge('build_started', 'test_started'),
      ];

      const graph = new CausalGraphImpl(nodes, edges);
      const highOutDegree = graph.getHighOutDegreeNodes(3);

      expect(highOutDegree[0].node).toBe('code_changed');
      expect(highOutDegree[0].outDegree).toBe(3);
    });

    it('should find high in-degree nodes', () => {
      const nodes: TestEventType[] = [
        'code_changed',
        'config_changed',
        'timeout',
        'test_failed',
      ];
      const edges: CausalEdge[] = [
        createEdge('code_changed', 'test_failed'),
        createEdge('config_changed', 'test_failed'),
        createEdge('timeout', 'test_failed'),
      ];

      const graph = new CausalGraphImpl(nodes, edges);
      const highInDegree = graph.getHighInDegreeNodes(3);

      expect(highInDegree[0].node).toBe('test_failed');
      expect(highInDegree[0].inDegree).toBe(3);
    });
  });

  describe('intervention points', () => {
    it('should find optimal intervention points', () => {
      const nodes: TestEventType[] = [
        'code_changed',
        'build_started',
        'test_started',
        'test_failed',
      ];
      const edges: CausalEdge[] = [
        createEdge('code_changed', 'build_started'),
        createEdge('code_changed', 'test_started'),
        createEdge('build_started', 'test_failed'),
        createEdge('test_started', 'test_failed'),
      ];

      const graph = new CausalGraphImpl(nodes, edges);
      const interventions = graph.findInterventionPoints('test_failed', 3);

      // code_changed is a bottleneck - intervening there prevents test_failed
      expect(interventions.length).toBeGreaterThan(0);
    });
  });

  describe('subgraph extraction', () => {
    it('should extract subgraph to target', () => {
      const nodes: TestEventType[] = [
        'code_changed',
        'config_changed',
        'build_started',
        'test_failed',
        'alert_fired',
      ];
      const edges: CausalEdge[] = [
        createEdge('code_changed', 'build_started'),
        createEdge('build_started', 'test_failed'),
        createEdge('config_changed', 'test_failed'),
        createEdge('test_failed', 'alert_fired'),
      ];

      const graph = new CausalGraphImpl(nodes, edges);
      const subgraph = graph.getSubgraphTo('test_failed');

      // Should include nodes that can reach test_failed
      expect(subgraph.nodes).toContain('code_changed');
      expect(subgraph.nodes).toContain('build_started');
      expect(subgraph.nodes).toContain('config_changed');
      expect(subgraph.nodes).toContain('test_failed');
      // alert_fired cannot reach test_failed (it's downstream)
      expect(subgraph.nodes).not.toContain('alert_fired');
    });

    it('should extract subgraph from source', () => {
      const nodes: TestEventType[] = [
        'pr_opened',
        'code_changed',
        'build_started',
        'test_failed',
      ];
      const edges: CausalEdge[] = [
        createEdge('pr_opened', 'code_changed'),
        createEdge('code_changed', 'build_started'),
        createEdge('build_started', 'test_failed'),
      ];

      const graph = new CausalGraphImpl(nodes, edges);
      const subgraph = graph.getSubgraphFrom('code_changed');

      expect(subgraph.nodes).toContain('code_changed');
      expect(subgraph.nodes).toContain('build_started');
      expect(subgraph.nodes).toContain('test_failed');
      expect(subgraph.nodes).not.toContain('pr_opened'); // Upstream, not reachable from
    });
  });

  describe('statistics', () => {
    it('should compute graph statistics', () => {
      const nodes: TestEventType[] = ['code_changed', 'build_started', 'test_failed'];
      const edges: CausalEdge[] = [
        createEdge('code_changed', 'build_started'),
        createEdge('build_started', 'test_failed'),
      ];

      const graph = new CausalGraphImpl(nodes, edges);
      const stats = graph.getStats();

      expect(stats.nodes).toBe(3);
      expect(stats.edges).toBe(2);
      expect(stats.density).toBeCloseTo(2 / 6, 2); // 2 edges out of 6 possible
      expect(stats.hasCycles).toBe(false);
    });
  });
});
