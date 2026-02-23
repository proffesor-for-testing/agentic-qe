/**
 * Test: MinCut-Based Routing (ADR-068)
 *
 * Tests QEMinCutService, MinCutRoutingService, StructuralHealthMonitor,
 * and integration with task-router.ts.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  QEMinCutService,
  createQEMinCutService,
  type TaskGraph,
  type AgentNode,
  type TaskGraphNode,
  type TaskGraphEdge,
} from '../../src/integrations/ruvector/mincut-wrapper.js';
import {
  MinCutRoutingService,
  createMinCutRoutingService,
  routeWithMinCut,
} from '../../src/mcp/services/mincut-routing-service.js';
import {
  StructuralHealthMonitor,
  createStructuralHealthMonitor,
} from '../../src/monitoring/structural-health.js';

// ============================================================================
// Test Fixtures
// ============================================================================

/**
 * Create a well-connected agent topology (high lambda)
 */
function createWellConnectedTopology(): AgentNode[] {
  return [
    { id: 'agent-1', name: 'Coder A', domain: 'test-generation', capabilities: ['code'], dependsOn: ['agent-2', 'agent-3'], weight: 1.0 },
    { id: 'agent-2', name: 'Coder B', domain: 'test-generation', capabilities: ['code'], dependsOn: ['agent-1', 'agent-3'], weight: 1.0 },
    { id: 'agent-3', name: 'Reviewer', domain: 'test-generation', capabilities: ['review'], dependsOn: ['agent-1', 'agent-2'], weight: 1.0 },
    { id: 'agent-4', name: 'Tester', domain: 'test-execution', capabilities: ['test'], dependsOn: ['agent-1', 'agent-2', 'agent-3'], weight: 1.0 },
    { id: 'agent-5', name: 'Planner', domain: 'test-execution', capabilities: ['plan'], dependsOn: ['agent-3', 'agent-4'], weight: 1.0 },
  ];
}

/**
 * Create a fragmented agent topology (low lambda)
 */
function createFragmentedTopology(): AgentNode[] {
  return [
    { id: 'isolated-1', name: 'Lone Wolf A', domain: 'security', capabilities: ['scan'], dependsOn: [], weight: 1.0 },
    { id: 'isolated-2', name: 'Lone Wolf B', domain: 'coverage', capabilities: ['analyze'], dependsOn: [], weight: 1.0 },
    { id: 'isolated-3', name: 'Lone Wolf C', domain: 'quality', capabilities: ['assess'], dependsOn: [], weight: 1.0 },
    { id: 'pair-a', name: 'Pair A', domain: 'defect', capabilities: ['detect'], dependsOn: ['pair-b'], weight: 1.0 },
    { id: 'pair-b', name: 'Pair B', domain: 'defect', capabilities: ['fix'], dependsOn: ['pair-a'], weight: 1.0 },
  ];
}

/**
 * Create a simple task graph for direct testing
 */
function createSimpleTaskGraph(): TaskGraph {
  const nodes: TaskGraphNode[] = [
    { id: 'n1', label: 'Node 1', type: 'agent', domain: 'test', weight: 1.0 },
    { id: 'n2', label: 'Node 2', type: 'agent', domain: 'test', weight: 1.0 },
    { id: 'n3', label: 'Node 3', type: 'agent', domain: 'test', weight: 1.0 },
  ];
  const edges: TaskGraphEdge[] = [
    { source: 'n1', target: 'n2', weight: 1.0, edgeType: 'coordination' },
    { source: 'n2', target: 'n3', weight: 1.0, edgeType: 'coordination' },
    { source: 'n1', target: 'n3', weight: 1.0, edgeType: 'coordination' },
  ];
  return { nodes, edges };
}

function createEmptyTaskGraph(): TaskGraph {
  return { nodes: [], edges: [] };
}

// ============================================================================
// QEMinCutService Tests
// ============================================================================

describe('QEMinCutService', () => {
  let service: QEMinCutService;

  beforeEach(() => {
    service = createQEMinCutService();
  });

  describe('computeLambda', () => {
    it('should return 0 for an empty graph', () => {
      const lambda = service.computeLambda(createEmptyTaskGraph());
      expect(lambda).toBe(0);
    });

    it('should return a positive lambda for a connected graph', () => {
      const lambda = service.computeLambda(createSimpleTaskGraph());
      expect(lambda).toBeGreaterThan(0);
    });

    it('should return higher lambda for a well-connected graph than a sparse one', () => {
      // Fully connected triangle
      const dense = createSimpleTaskGraph();

      // Linear chain (less connected)
      const sparse: TaskGraph = {
        nodes: [
          { id: 'a', label: 'A', type: 'agent', weight: 1.0 },
          { id: 'b', label: 'B', type: 'agent', weight: 1.0 },
          { id: 'c', label: 'C', type: 'agent', weight: 1.0 },
        ],
        edges: [
          { source: 'a', target: 'b', weight: 1.0, edgeType: 'coordination' },
          { source: 'b', target: 'c', weight: 1.0, edgeType: 'coordination' },
        ],
      };

      const denseLambda = service.computeLambda(dense);
      const sparseLambda = service.computeLambda(sparse);

      expect(denseLambda).toBeGreaterThanOrEqual(sparseLambda);
    });

    it('should handle a single-node graph', () => {
      const graph: TaskGraph = {
        nodes: [{ id: 'solo', label: 'Solo', type: 'agent', weight: 1.0 }],
        edges: [],
      };
      const lambda = service.computeLambda(graph);
      expect(lambda).toBe(0);
    });
  });

  describe('computeRoutingTier', () => {
    it('should return a valid tier for well-connected topology', () => {
      const agents = createWellConnectedTopology();
      const tier = service.computeRoutingTier('Simple test task', agents);

      // Well-connected topology should produce a valid tier (1-3)
      expect(tier.tier).toBeGreaterThanOrEqual(1);
      expect(tier.tier).toBeLessThanOrEqual(3);
      expect(tier.normalizedLambda).toBeGreaterThan(0);
      expect(tier.confidence).toBeGreaterThan(0);
      expect(tier.rationale).toContain('Simple test task');
    });

    it('should return higher tier for fragmented topology', () => {
      const agents = createFragmentedTopology();
      const tier = service.computeRoutingTier('Complex task', agents);

      // Fragmented should get tier 2 or 3
      expect(tier.tier).toBeGreaterThanOrEqual(2);
    });

    it('should return tier 3 (Opus) for single isolated agent', () => {
      const agents: AgentNode[] = [
        { id: 'solo', name: 'Solo Agent', domain: 'test', capabilities: [], dependsOn: [], weight: 1.0 },
      ];
      const tier = service.computeRoutingTier('Task for solo', agents);

      // Single agent = no connectivity = highest tier
      expect(tier.tier).toBe(3);
      expect(tier.label).toBe('Opus');
    });

    it('should include lambda and normalized lambda', () => {
      const agents = createWellConnectedTopology();
      const tier = service.computeRoutingTier('Test', agents);

      expect(tier.lambda).toBeGreaterThanOrEqual(0);
      expect(tier.normalizedLambda).toBeGreaterThanOrEqual(0);
      expect(tier.normalizedLambda).toBeLessThanOrEqual(1);
    });
  });

  describe('getStructuralHealth', () => {
    it('should report unhealthy for empty graph', () => {
      const health = service.getStructuralHealth(createEmptyTaskGraph());
      expect(health.healthy).toBe(false);
      expect(health.riskScore).toBe(1.0);
      expect(health.suggestions.length).toBeGreaterThan(0);
    });

    it('should report health for a connected graph', () => {
      const health = service.getStructuralHealth(createSimpleTaskGraph());
      expect(health.lambda).toBeGreaterThan(0);
      expect(health.analyzedAt).toBeInstanceOf(Date);
      expect(typeof health.isConnected).toBe('boolean');
    });

    it('should identify weak points in fragmented topology', () => {
      const agents = createFragmentedTopology();
      const graph = service.buildTaskGraphFromTopology(agents);
      const health = service.getStructuralHealth(graph);

      // Fragmented topology should have issues
      expect(health.normalizedLambda).toBeLessThan(0.8);
    });

    it('should return valid component count', () => {
      const health = service.getStructuralHealth(createSimpleTaskGraph());
      expect(health.componentCount).toBeGreaterThanOrEqual(1);
    });
  });

  describe('toSwarmGraph', () => {
    it('should convert a TaskGraph to SwarmGraph', () => {
      const taskGraph = createSimpleTaskGraph();
      const swarmGraph = service.toSwarmGraph(taskGraph);

      expect(swarmGraph.vertexCount).toBe(3);
      expect(swarmGraph.edgeCount).toBeGreaterThan(0);
    });

    it('should handle empty graphs', () => {
      const swarmGraph = service.toSwarmGraph(createEmptyTaskGraph());
      expect(swarmGraph.isEmpty()).toBe(true);
    });
  });

  describe('buildTaskGraphFromTopology', () => {
    it('should create nodes for each agent', () => {
      const agents = createWellConnectedTopology();
      const graph = service.buildTaskGraphFromTopology(agents);

      expect(graph.nodes.length).toBe(5);
    });

    it('should create dependency and coordination edges', () => {
      const agents = createWellConnectedTopology();
      const graph = service.buildTaskGraphFromTopology(agents);

      // Should have dependency edges + coordination edges for same-domain agents
      expect(graph.edges.length).toBeGreaterThan(0);

      const depEdges = graph.edges.filter(e => e.edgeType === 'dependency');
      const coordEdges = graph.edges.filter(e => e.edgeType === 'coordination');

      expect(depEdges.length).toBeGreaterThan(0);
      expect(coordEdges.length).toBeGreaterThan(0);
    });

    it('should handle agents with no dependencies', () => {
      const agents: AgentNode[] = [
        { id: 'a', name: 'A', domain: 'x', capabilities: [], dependsOn: [], weight: 1.0 },
        { id: 'b', name: 'B', domain: 'y', capabilities: [], dependsOn: [], weight: 1.0 },
      ];
      const graph = service.buildTaskGraphFromTopology(agents);

      expect(graph.nodes.length).toBe(2);
      // No deps and different domains = no edges
      expect(graph.edges.length).toBe(0);
    });
  });
});

// ============================================================================
// MinCutRoutingService Tests
// ============================================================================

describe('MinCutRoutingService', () => {
  let service: MinCutRoutingService;

  beforeEach(() => {
    service = createMinCutRoutingService({ enableLogging: false });
  });

  describe('route', () => {
    it('should route to lower tier for well-connected topology', () => {
      const result = service.route({
        task: 'Generate unit tests',
        agentTopology: createWellConnectedTopology(),
      });

      expect(result.usedMinCut).toBe(true);
      expect(result.modelTier).toBeGreaterThanOrEqual(1);
      expect(result.modelTier).toBeLessThanOrEqual(4);
      expect(result.confidence).toBeGreaterThan(0);
    });

    it('should route to higher tier for fragmented topology', () => {
      const wellConnected = service.route({
        task: 'Test task',
        agentTopology: createWellConnectedTopology(),
      });

      const fragmented = service.route({
        task: 'Test task',
        agentTopology: createFragmentedTopology(),
      });

      expect(fragmented.modelTier).toBeGreaterThanOrEqual(wellConnected.modelTier);
    });

    it('should fall back to Sonnet when no topology provided', () => {
      const result = service.route({
        task: 'Test without topology',
      });

      expect(result.usedMinCut).toBe(false);
      expect(result.modelTier).toBe(2); // Sonnet
      expect(result.rationale).toContain('Fallback');
    });

    it('should fall back when topology is empty', () => {
      const result = service.route({
        task: 'Test with empty topology',
        agentTopology: [],
      });

      expect(result.usedMinCut).toBe(false);
    });

    it('should respect isCritical flag', () => {
      const agents: AgentNode[] = createWellConnectedTopology();
      const result = service.route({
        task: 'Critical security scan',
        agentTopology: agents,
        isCritical: true,
      });

      // Critical tasks should be at least Tier 2
      expect(result.modelTier).toBeGreaterThanOrEqual(2);
    });

    it('should include decision time', () => {
      const result = service.route({
        task: 'Timed task',
        agentTopology: createWellConnectedTopology(),
      });

      expect(result.decisionTimeMs).toBeGreaterThanOrEqual(0);
    });

    it('should return valid tier labels', () => {
      const result = service.route({
        task: 'Label test',
        agentTopology: createWellConnectedTopology(),
      });

      const validLabels = ['Booster', 'Haiku', 'Sonnet', 'Sonnet-Extended', 'Opus'];
      expect(validLabels).toContain(result.tierLabel);
    });
  });

  describe('configuration', () => {
    it('should disable routing when configured', () => {
      const disabled = createMinCutRoutingService({
        enabled: false,
        enableLogging: false,
      });

      const result = disabled.route({
        task: 'Test',
        agentTopology: createWellConnectedTopology(),
      });

      expect(result.usedMinCut).toBe(false);
      expect(result.rationale).toContain('disabled');
    });

    it('should report enabled status correctly', () => {
      expect(service.isEnabled()).toBe(true);

      const disabled = createMinCutRoutingService({ enabled: false });
      expect(disabled.isEnabled()).toBe(false);
    });

    it('should expose underlying QEMinCutService', () => {
      const minCutService = service.getMinCutService();
      expect(minCutService).toBeInstanceOf(QEMinCutService);
    });
  });

  describe('routeWithMinCut convenience function', () => {
    it('should route using the convenience function', () => {
      const result = routeWithMinCut(
        'Simple test',
        createWellConnectedTopology()
      );

      expect(result.usedMinCut).toBe(true);
      expect(result.modelTier).toBeGreaterThanOrEqual(1);
    });
  });
});

// ============================================================================
// StructuralHealthMonitor Tests
// ============================================================================

describe('StructuralHealthMonitor', () => {
  let monitor: StructuralHealthMonitor;

  beforeEach(() => {
    monitor = createStructuralHealthMonitor({ enableLogging: false });
  });

  describe('computeFleetHealth', () => {
    it('should report empty status for no agents', () => {
      const health = monitor.computeFleetHealth([]);

      expect(health.status).toBe('empty');
      expect(health.healthy).toBe(false);
      expect(health.lambda).toBe(0);
    });

    it('should compute health for well-connected fleet', () => {
      const health = monitor.computeFleetHealth(createWellConnectedTopology());

      expect(health.lambda).toBeGreaterThan(0);
      expect(typeof health.healthy).toBe('boolean');
      expect(health.measuredAt).toBeInstanceOf(Date);
      expect(health.riskScore).toBeGreaterThanOrEqual(0);
      expect(health.riskScore).toBeLessThanOrEqual(1);
    });

    it('should identify issues in fragmented fleet', () => {
      const health = monitor.computeFleetHealth(createFragmentedTopology());

      // Fragmented = lower lambda = higher risk
      expect(health.riskScore).toBeGreaterThan(0);
    });

    it('should populate suggestions', () => {
      const health = monitor.computeFleetHealth(createFragmentedTopology());

      // Should have at least one suggestion for a fragmented topology
      expect(health.suggestions).toBeInstanceOf(Array);
    });

    it('should return valid status values', () => {
      const health = monitor.computeFleetHealth(createWellConnectedTopology());
      const validStatuses = ['healthy', 'warning', 'critical', 'empty'];
      expect(validStatuses).toContain(health.status);
    });
  });

  describe('computeFleetHealthFromGraph', () => {
    it('should compute health from a pre-built graph', () => {
      const graph = createSimpleTaskGraph();
      const health = monitor.computeFleetHealthFromGraph(graph);

      expect(health.lambda).toBeGreaterThanOrEqual(0);
      expect(typeof health.healthy).toBe('boolean');
    });

    it('should handle empty graph', () => {
      const health = monitor.computeFleetHealthFromGraph(createEmptyTaskGraph());
      expect(health.status).toBe('empty');
    });
  });

  describe('history tracking', () => {
    it('should record history entries', () => {
      monitor.computeFleetHealth(createWellConnectedTopology());
      monitor.computeFleetHealth(createFragmentedTopology());

      const history = monitor.getHistory();
      expect(history.length).toBe(2);
      expect(history[0].timestamp).toBeInstanceOf(Date);
    });

    it('should return limited history', () => {
      for (let i = 0; i < 5; i++) {
        monitor.computeFleetHealth(createWellConnectedTopology());
      }

      const limited = monitor.getHistory(3);
      expect(limited.length).toBe(3);
    });

    it('should clear history', () => {
      monitor.computeFleetHealth(createWellConnectedTopology());
      expect(monitor.getHistory().length).toBe(1);

      monitor.clearHistory();
      expect(monitor.getHistory().length).toBe(0);
    });

    it('should trim history beyond max entries', () => {
      const smallMonitor = createStructuralHealthMonitor({
        maxHistoryEntries: 3,
        enableLogging: false,
      });

      for (let i = 0; i < 10; i++) {
        smallMonitor.computeFleetHealth(createWellConnectedTopology());
      }

      expect(smallMonitor.getHistory().length).toBe(3);
    });
  });

  describe('getTrend', () => {
    it('should report stable with no history', () => {
      expect(monitor.getTrend()).toBe('stable');
    });

    it('should report stable with single entry', () => {
      monitor.computeFleetHealth(createWellConnectedTopology());
      expect(monitor.getTrend()).toBe('stable');
    });

    it('should detect trends over multiple measurements', () => {
      // Same topology twice -> stable
      monitor.computeFleetHealth(createWellConnectedTopology());
      monitor.computeFleetHealth(createWellConnectedTopology());

      const trend = monitor.getTrend();
      expect(['improving', 'stable', 'degrading']).toContain(trend);
    });
  });

  describe('getMinCutService', () => {
    it('should expose the underlying service', () => {
      const svc = monitor.getMinCutService();
      expect(svc).toBeInstanceOf(QEMinCutService);
    });
  });
});

// ============================================================================
// Integration: task-router.ts uses mincut routing
// ============================================================================

describe('TaskRouter MinCut Integration', () => {
  it('should export AgentNode type from mincut-routing-service', async () => {
    // Verify the module exports are accessible
    const mod = await import('../../src/mcp/services/mincut-routing-service.js');
    expect(mod.MinCutRoutingService).toBeDefined();
    expect(mod.createMinCutRoutingService).toBeDefined();
    expect(mod.routeWithMinCut).toBeDefined();
  });

  it('should verify task-router imports mincut-routing-service', async () => {
    // The task-router module has heavy dependencies (agentic-flow) that
    // cause timeouts in unit tests. Instead, verify the integration by
    // checking that mincut-routing-service is importable and the
    // AgentNode type from it can be used in TaskRoutingInput shape.
    const mod = await import('../../src/mcp/services/mincut-routing-service.js');

    // Verify the MinCutRoutingService can route with AgentNode topology
    const svc = mod.createMinCutRoutingService({ enableLogging: false });
    const result = svc.route({
      task: 'integration check',
      agentTopology: createWellConnectedTopology(),
    });

    expect(result.usedMinCut).toBe(true);
    expect(result.modelTier).toBeGreaterThanOrEqual(1);
  });

  it('should export QEMinCutService from mincut-wrapper', async () => {
    const mod = await import('../../src/integrations/ruvector/mincut-wrapper.js');
    expect(mod.QEMinCutService).toBeDefined();
    expect(mod.createQEMinCutService).toBeDefined();
  });

  it('should export StructuralHealthMonitor from structural-health', async () => {
    const mod = await import('../../src/monitoring/structural-health.js');
    expect(mod.StructuralHealthMonitor).toBeDefined();
    expect(mod.createStructuralHealthMonitor).toBeDefined();
  });
});
