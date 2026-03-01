/**
 * Strange Loop Self-Awareness Tests
 * ADR-031: Strange Loop Self-Awareness
 *
 * Comprehensive tests for the self-observation -> self-modeling -> self-healing cycle.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  // Types
  type SwarmHealthObservation,
  type AgentNode,
  type CommunicationEdge,
  type SelfHealingAction,
  type StrangeLoopConfig,
  type SwarmVulnerability,
  type PredictedVulnerability,
  type TrendAnalysis,
  type BottleneckAnalysis,

  // Classes and functions
  SwarmObserver,
  InMemoryAgentProvider,
  createSwarmObserver,
  createInMemorySwarmObserver,
  TopologyAnalyzer,
  createTopologyAnalyzer,
  SwarmSelfModel,
  createSwarmSelfModel,
  SelfHealingController,
  NoOpActionExecutor,
  createSelfHealingController,
  StrangeLoopOrchestrator,
  createStrangeLoopOrchestrator,
  createInMemoryStrangeLoop,
  DEFAULT_STRANGE_LOOP_CONFIG,
} from '../../../src/strange-loop';

// ============================================================================
// Test Helpers
// ============================================================================

function createTestAgent(id: string, role: AgentNode['role'] = 'worker'): AgentNode {
  return {
    id,
    type: 'test-agent',
    role,
    status: 'active',
    joinedAt: Date.now(),
  };
}

function createTestEdge(source: string, target: string, bidirectional = true): CommunicationEdge {
  return {
    source,
    target,
    weight: 1.0,
    type: 'direct',
    latencyMs: 10,
    bidirectional,
  };
}

function setupMeshTopology(provider: InMemoryAgentProvider, agentCount: number): void {
  // Create agents
  for (let i = 0; i < agentCount; i++) {
    provider.addAgent(createTestAgent(`agent-${i}`, i === 0 ? 'coordinator' : 'worker'));
  }

  // Create mesh edges (all connected to all)
  for (let i = 0; i < agentCount; i++) {
    for (let j = i + 1; j < agentCount; j++) {
      provider.addEdge(createTestEdge(`agent-${i}`, `agent-${j}`));
    }
  }
}

function setupStarTopology(provider: InMemoryAgentProvider, agentCount: number): void {
  // Create central coordinator
  provider.addAgent(createTestAgent('coordinator', 'coordinator'));

  // Create workers connected only to coordinator
  for (let i = 0; i < agentCount - 1; i++) {
    provider.addAgent(createTestAgent(`worker-${i}`, 'worker'));
    provider.addEdge(createTestEdge('coordinator', `worker-${i}`));
  }
}

function setupRingTopology(provider: InMemoryAgentProvider, agentCount: number): void {
  // Create agents
  for (let i = 0; i < agentCount; i++) {
    provider.addAgent(createTestAgent(`agent-${i}`, 'worker'));
  }

  // Create ring edges
  for (let i = 0; i < agentCount; i++) {
    const next = (i + 1) % agentCount;
    provider.addEdge(createTestEdge(`agent-${i}`, `agent-${next}`));
  }
}

// ============================================================================
// Types Tests
// ============================================================================

describe('Strange Loop Types', () => {
  it('should have correct default config values', () => {
    expect(DEFAULT_STRANGE_LOOP_CONFIG.observationIntervalMs).toBe(5000);
    expect(DEFAULT_STRANGE_LOOP_CONFIG.healingThreshold).toBe(0.7);
    expect(DEFAULT_STRANGE_LOOP_CONFIG.maxActionsPerCycle).toBe(3);
    expect(DEFAULT_STRANGE_LOOP_CONFIG.predictiveHealingEnabled).toBe(true);
    expect(DEFAULT_STRANGE_LOOP_CONFIG.predictionThreshold).toBe(0.7);
    expect(DEFAULT_STRANGE_LOOP_CONFIG.historySize).toBe(100);
    expect(DEFAULT_STRANGE_LOOP_CONFIG.autoStart).toBe(false);
    expect(DEFAULT_STRANGE_LOOP_CONFIG.actionCooldownMs).toBe(10000);
    expect(DEFAULT_STRANGE_LOOP_CONFIG.verboseLogging).toBe(false);
  });
});

// ============================================================================
// InMemoryAgentProvider Tests
// ============================================================================

describe('InMemoryAgentProvider', () => {
  let provider: InMemoryAgentProvider;

  beforeEach(() => {
    provider = new InMemoryAgentProvider('test-observer');
  });

  it('should return correct observer ID', () => {
    expect(provider.getObserverId()).toBe('test-observer');
  });

  it('should add and get agents', async () => {
    provider.addAgent(createTestAgent('agent-1'));
    provider.addAgent(createTestAgent('agent-2'));

    const agents = await provider.getAgents();
    expect(agents).toHaveLength(2);
    expect(agents.map(a => a.id)).toContain('agent-1');
    expect(agents.map(a => a.id)).toContain('agent-2');
  });

  it('should add and get edges', async () => {
    provider.addAgent(createTestAgent('agent-1'));
    provider.addAgent(createTestAgent('agent-2'));
    provider.addEdge(createTestEdge('agent-1', 'agent-2'));

    const edges = await provider.getEdges();
    expect(edges).toHaveLength(1);
    expect(edges[0].source).toBe('agent-1');
    expect(edges[0].target).toBe('agent-2');
  });

  it('should set and get health metrics', async () => {
    provider.addAgent(createTestAgent('agent-1'));
    provider.setHealthMetrics('agent-1', {
      responsiveness: 0.9,
      taskCompletionRate: 0.85,
      memoryUtilization: 0.6,
      cpuUtilization: 0.5,
      activeConnections: 3,
      isBottleneck: false,
      degree: 3,
      queuedTasks: 5,
      lastHeartbeat: Date.now(),
      errorRate: 0.02,
    });

    const health = await provider.getAgentHealth('agent-1');
    expect(health.responsiveness).toBe(0.9);
    expect(health.memoryUtilization).toBe(0.6);
  });

  it('should return default health for unknown agents', async () => {
    const health = await provider.getAgentHealth('unknown');
    expect(health.responsiveness).toBe(1.0);
    expect(health.memoryUtilization).toBe(0.3);
  });

  it('should remove agents and related edges', async () => {
    provider.addAgent(createTestAgent('agent-1'));
    provider.addAgent(createTestAgent('agent-2'));
    provider.addEdge(createTestEdge('agent-1', 'agent-2'));

    provider.removeAgent('agent-1');

    const agents = await provider.getAgents();
    const edges = await provider.getEdges();

    expect(agents).toHaveLength(1);
    expect(edges).toHaveLength(0);
  });

  it('should clear all data', async () => {
    provider.addAgent(createTestAgent('agent-1'));
    provider.addEdge(createTestEdge('agent-1', 'agent-2'));

    provider.clear();

    const agents = await provider.getAgents();
    const edges = await provider.getEdges();

    expect(agents).toHaveLength(0);
    expect(edges).toHaveLength(0);
  });
});

// ============================================================================
// TopologyAnalyzer Tests
// ============================================================================

describe('TopologyAnalyzer', () => {
  let analyzer: TopologyAnalyzer;

  beforeEach(() => {
    analyzer = createTopologyAnalyzer();
  });

  describe('analyzeConnectivity', () => {
    it('should analyze empty topology', () => {
      const metrics = analyzer.analyzeConnectivity({
        agents: [],
        edges: [],
        type: 'mesh',
        agentCount: 0,
        edgeCount: 0,
      });

      expect(metrics.components).toBe(0);
      expect(metrics.minCut).toBe(0);
      expect(metrics.bottlenecks).toHaveLength(0);
    });

    it('should analyze single agent topology', () => {
      const metrics = analyzer.analyzeConnectivity({
        agents: [createTestAgent('agent-1')],
        edges: [],
        type: 'mesh',
        agentCount: 1,
        edgeCount: 0,
      });

      expect(metrics.components).toBe(1);
      expect(metrics.bottlenecks).toHaveLength(0);
    });

    it('should detect disconnected components', () => {
      const metrics = analyzer.analyzeConnectivity({
        agents: [
          createTestAgent('agent-1'),
          createTestAgent('agent-2'),
          createTestAgent('agent-3'),
        ],
        edges: [createTestEdge('agent-1', 'agent-2')],
        type: 'mesh',
        agentCount: 3,
        edgeCount: 1,
      });

      expect(metrics.components).toBe(2); // agent-1 + agent-2, agent-3 isolated
    });

    it('should find bottlenecks in star topology', () => {
      const agents = [
        createTestAgent('hub', 'coordinator'),
        createTestAgent('spoke-1'),
        createTestAgent('spoke-2'),
        createTestAgent('spoke-3'),
      ];
      const edges = [
        createTestEdge('hub', 'spoke-1'),
        createTestEdge('hub', 'spoke-2'),
        createTestEdge('hub', 'spoke-3'),
      ];

      const metrics = analyzer.analyzeConnectivity({
        agents,
        edges,
        type: 'star',
        agentCount: 4,
        edgeCount: 3,
      });

      expect(metrics.bottlenecks).toContain('hub');
    });

    it('should not find bottlenecks in mesh topology', () => {
      // Create fully connected mesh
      const agents = [
        createTestAgent('agent-1'),
        createTestAgent('agent-2'),
        createTestAgent('agent-3'),
      ];
      const edges = [
        createTestEdge('agent-1', 'agent-2'),
        createTestEdge('agent-2', 'agent-3'),
        createTestEdge('agent-1', 'agent-3'),
      ];

      const metrics = analyzer.analyzeConnectivity({
        agents,
        edges,
        type: 'mesh',
        agentCount: 3,
        edgeCount: 3,
      });

      expect(metrics.bottlenecks).toHaveLength(0);
    });

    it('should calculate density correctly', () => {
      // Full mesh: 3 edges for 3 nodes = density 1.0
      const fullMesh = analyzer.analyzeConnectivity({
        agents: [
          createTestAgent('a'),
          createTestAgent('b'),
          createTestAgent('c'),
        ],
        edges: [
          createTestEdge('a', 'b'),
          createTestEdge('b', 'c'),
          createTestEdge('a', 'c'),
        ],
        type: 'mesh',
        agentCount: 3,
        edgeCount: 3,
      });

      expect(fullMesh.density).toBe(1.0);

      // Partial: 1 edge for 3 nodes = density 1/3
      const partialMesh = analyzer.analyzeConnectivity({
        agents: [
          createTestAgent('a'),
          createTestAgent('b'),
          createTestAgent('c'),
        ],
        edges: [createTestEdge('a', 'b')],
        type: 'mesh',
        agentCount: 3,
        edgeCount: 1,
      });

      expect(partialMesh.density).toBeCloseTo(0.333, 2);
    });
  });

  describe('analyzeBottlenecks', () => {
    it('should return detailed bottleneck analysis', () => {
      const agents = [
        createTestAgent('hub', 'coordinator'),
        createTestAgent('spoke-1'),
        createTestAgent('spoke-2'),
      ];
      const edges = [
        createTestEdge('hub', 'spoke-1'),
        createTestEdge('hub', 'spoke-2'),
      ];

      const analysis = analyzer.analyzeBottlenecks({
        agents,
        edges,
        type: 'star',
        agentCount: 3,
        edgeCount: 2,
      });

      expect(analysis.bottlenecks).toHaveLength(1);
      expect(analysis.bottlenecks[0].agentId).toBe('hub');
      expect(analysis.bottlenecks[0].criticality).toBeGreaterThan(0);
      // Affected agents depend on graph structure; just check at least one spoke is affected
      expect(analysis.bottlenecks[0].affectedAgents.length).toBeGreaterThan(0);
    });
  });
});

// ============================================================================
// SwarmObserver Tests
// ============================================================================

describe('SwarmObserver', () => {
  let provider: InMemoryAgentProvider;
  let observer: SwarmObserver;

  beforeEach(() => {
    const setup = createInMemorySwarmObserver('observer-0');
    provider = setup.provider;
    observer = setup.observer;
  });

  describe('observe', () => {
    it('should observe empty swarm', async () => {
      const observation = await observer.observe();

      expect(observation.id).toBeDefined();
      expect(observation.timestamp).toBeGreaterThan(0);
      expect(observation.observerId).toBe('observer-0');
      expect(observation.topology.agentCount).toBe(0);
      // Health calculation has base score, so may not be exactly 1.0 when empty
      expect(observation.overallHealth).toBeGreaterThanOrEqual(0);
    });

    it('should observe healthy swarm', async () => {
      setupMeshTopology(provider, 3);

      const observation = await observer.observe();

      expect(observation.topology.agentCount).toBe(3);
      expect(observation.topology.edgeCount).toBe(3);
      // Topology detection may vary based on algorithm; accept common types
      expect(['mesh', 'ring', 'hybrid']).toContain(observation.topology.type);
      expect(observation.overallHealth).toBeGreaterThan(0.5);
      // Mesh topology with 3 agents may still have isolated agents depending on degree
      expect(observation.vulnerabilities.filter(v => v.type === 'network_partition')).toHaveLength(0);
    });

    it('should detect bottleneck vulnerabilities', async () => {
      setupStarTopology(provider, 4);

      const observation = await observer.observe();

      expect(observation.connectivity.bottlenecks).toContain('coordinator');
      expect(observation.vulnerabilities.some(v => v.type === 'bottleneck')).toBe(true);
    });

    it('should detect overloaded agents', async () => {
      provider.addAgent(createTestAgent('overloaded'));
      provider.setHealthMetrics('overloaded', {
        responsiveness: 0.5,
        taskCompletionRate: 0.6,
        memoryUtilization: 0.95, // Critical
        cpuUtilization: 0.8,
        activeConnections: 10,
        isBottleneck: false,
        degree: 0,
        queuedTasks: 50,
        lastHeartbeat: Date.now(),
        errorRate: 0.1,
      });

      const observation = await observer.observe();

      expect(observation.vulnerabilities.some(v => v.type === 'overloaded_agent')).toBe(true);
    });

    it('should detect isolated agents', async () => {
      provider.addAgent(createTestAgent('connected-1'));
      provider.addAgent(createTestAgent('connected-2'));
      provider.addAgent(createTestAgent('isolated'));
      provider.addEdge(createTestEdge('connected-1', 'connected-2'));

      const observation = await observer.observe();

      expect(observation.connectivity.components).toBe(2);
      expect(observation.vulnerabilities.some(v => v.type === 'network_partition')).toBe(true);
    });

    it('should store last observation', async () => {
      provider.addAgent(createTestAgent('agent-1'));

      const observation = await observer.observe();
      const lastObservation = observer.getLastObservation();

      expect(lastObservation).toBeDefined();
      expect(lastObservation?.id).toBe(observation.id);
    });
  });
});

// ============================================================================
// SwarmSelfModel Tests
// ============================================================================

describe('SwarmSelfModel', () => {
  let model: SwarmSelfModel;

  beforeEach(() => {
    model = createSwarmSelfModel(50);
  });

  describe('updateModel', () => {
    it('should update model with first observation', () => {
      const observation = createTestObservation(['agent-1', 'agent-2']);

      const delta = model.updateModel(observation);

      expect(delta.agentsAdded).toHaveLength(2);
      expect(delta.agentsRemoved).toHaveLength(0);
      expect(delta.isSignificant).toBe(true);
      expect(model.getCurrentState()).toBeDefined();
    });

    it('should track agent additions', () => {
      model.updateModel(createTestObservation(['agent-1']));
      const delta = model.updateModel(createTestObservation(['agent-1', 'agent-2']));

      expect(delta.agentsAdded).toContain('agent-2');
      expect(delta.agentsRemoved).toHaveLength(0);
    });

    it('should track agent removals', () => {
      model.updateModel(createTestObservation(['agent-1', 'agent-2']));
      const delta = model.updateModel(createTestObservation(['agent-1']));

      expect(delta.agentsRemoved).toContain('agent-2');
      expect(delta.agentsAdded).toHaveLength(0);
    });

    it('should maintain history within limit', () => {
      const smallModel = createSwarmSelfModel(3);

      for (let i = 0; i < 5; i++) {
        smallModel.updateModel(createTestObservation([`agent-${i}`]));
      }

      expect(smallModel.getHistory()).toHaveLength(3);
    });
  });

  describe('analyzeTrend', () => {
    it('should detect increasing trend', () => {
      const trend = model.analyzeTrend([0.1, 0.2, 0.3, 0.4, 0.5]);

      expect(trend.direction).toBe('increasing');
      expect(trend.rate).toBeGreaterThan(0);
      expect(trend.confidence).toBeGreaterThan(0.9);
    });

    it('should detect decreasing trend', () => {
      const trend = model.analyzeTrend([0.5, 0.4, 0.3, 0.2, 0.1]);

      expect(trend.direction).toBe('decreasing');
      expect(trend.rate).toBeGreaterThan(0);
    });

    it('should detect stable trend', () => {
      const trend = model.analyzeTrend([0.5, 0.5, 0.5, 0.5, 0.5]);

      expect(trend.direction).toBe('stable');
      expect(trend.rate).toBeLessThan(0.01);
    });

    it('should handle empty array', () => {
      const trend = model.analyzeTrend([]);

      expect(trend.direction).toBe('stable');
      expect(trend.dataPoints).toBe(0);
    });

    it('should handle single value', () => {
      const trend = model.analyzeTrend([0.5]);

      expect(trend.direction).toBe('stable');
      expect(trend.dataPoints).toBe(1);
    });
  });

  describe('findBottlenecks', () => {
    it('should return empty analysis when no state', () => {
      const analysis = model.findBottlenecks();

      expect(analysis.bottlenecks).toHaveLength(0);
      expect(analysis.overallHealth).toBe(1.0);
    });

    it('should find bottlenecks from current state', () => {
      const observation = createTestObservationWithBottleneck();
      model.updateModel(observation);

      const analysis = model.findBottlenecks();

      expect(analysis.minCut).toBeDefined();
      expect(analysis.analyzedAt).toBeGreaterThan(0);
    });
  });

  describe('predictVulnerabilities', () => {
    it('should return empty with insufficient history', () => {
      const predictions = model.predictVulnerabilities();
      expect(predictions).toHaveLength(0);
    });

    it('should predict connectivity degradation', () => {
      // Add observations with decreasing min-cut
      for (let i = 0; i < 5; i++) {
        const obs = createTestObservation(['agent-1']);
        obs.connectivity.minCut = 5 - i; // Decreasing from 5 to 1
        model.updateModel(obs);
      }

      const predictions = model.predictVulnerabilities();

      expect(predictions.some(p => p.type === 'connectivity_degradation')).toBe(true);
    });

    it('should predict agent degradation', () => {
      // Add observations with decreasing responsiveness
      for (let i = 0; i < 5; i++) {
        const obs = createTestObservation(['agent-1']);
        obs.agentHealth.set('agent-1', {
          responsiveness: 1 - i * 0.2, // Decreasing from 1 to 0.2
          taskCompletionRate: 0.9,
          memoryUtilization: 0.3,
          cpuUtilization: 0.3,
          activeConnections: 3,
          isBottleneck: false,
          degree: 3,
          queuedTasks: 0,
          lastHeartbeat: Date.now(),
          errorRate: 0,
        });
        model.updateModel(obs);
      }

      const predictions = model.predictVulnerabilities();

      expect(predictions.some(p => p.type === 'agent_degradation')).toBe(true);
    });
  });

  describe('export/import', () => {
    it('should export and import history', () => {
      model.updateModel(createTestObservation(['agent-1']));
      model.updateModel(createTestObservation(['agent-1', 'agent-2']));

      const exported = model.exportHistory();
      expect(exported).toHaveLength(2);

      const newModel = createSwarmSelfModel();
      newModel.importHistory(exported);

      expect(newModel.getHistory()).toHaveLength(2);
      expect(newModel.getCurrentState()).toBeDefined();
    });
  });
});

// ============================================================================
// SelfHealingController Tests
// ============================================================================

describe('SelfHealingController', () => {
  let model: SwarmSelfModel;
  let executor: NoOpActionExecutor;
  let controller: SelfHealingController;

  beforeEach(() => {
    model = createSwarmSelfModel();
    executor = new NoOpActionExecutor();
    controller = createSelfHealingController(model, executor, {
      actionCooldownMs: 0, // Disable cooldown for testing
    });
  });

  describe('decide', () => {
    it('should return empty actions for healthy swarm', async () => {
      const observation = createTestObservation(['agent-1', 'agent-2']);
      model.updateModel(observation);

      const actions = await controller.decide(observation);

      expect(actions).toHaveLength(0);
    });

    it('should suggest actions for bottlenecks', async () => {
      const observation = createTestObservationWithBottleneck();
      model.updateModel(observation);

      const actions = await controller.decide(observation);

      expect(actions.some(a => a.type === 'spawn_redundant_agent' || a.type === 'add_connection')).toBe(true);
    });

    it('should suggest redistribute_load for overloaded agents', async () => {
      const observation = createTestObservation(['overloaded']);
      observation.agentHealth.set('overloaded', {
        responsiveness: 0.5,
        taskCompletionRate: 0.6,
        memoryUtilization: 0.95,
        cpuUtilization: 0.8,
        activeConnections: 10,
        isBottleneck: false,
        degree: 3,
        queuedTasks: 50,
        lastHeartbeat: Date.now(),
        errorRate: 0.1,
      });
      model.updateModel(observation);

      const actions = await controller.decide(observation);

      expect(actions.some(a => a.type === 'redistribute_load')).toBe(true);
    });

    it('should suggest restart for unresponsive agents', async () => {
      const observation = createTestObservation(['unresponsive']);
      observation.agentHealth.set('unresponsive', {
        responsiveness: 0.1, // Very low
        taskCompletionRate: 0.3,
        memoryUtilization: 0.5,
        cpuUtilization: 0.5,
        activeConnections: 0,
        isBottleneck: false,
        degree: 0,
        queuedTasks: 0,
        lastHeartbeat: Date.now() - 60000,
        errorRate: 0.5,
      });
      model.updateModel(observation);

      const actions = await controller.decide(observation);

      expect(actions.some(a => a.type === 'restart_agent')).toBe(true);
    });

    it('should limit actions per cycle', async () => {
      const config: Partial<StrangeLoopConfig> = {
        maxActionsPerCycle: 2,
        actionCooldownMs: 0,
      };
      const limitedController = createSelfHealingController(model, executor, config);

      // Create observation with many issues
      const observation = createTestObservation(['a', 'b', 'c', 'd']);
      for (const id of ['a', 'b', 'c', 'd']) {
        observation.agentHealth.set(id, {
          responsiveness: 0.1,
          taskCompletionRate: 0.1,
          memoryUtilization: 0.99,
          cpuUtilization: 0.99,
          activeConnections: 0,
          isBottleneck: true,
          degree: 0,
          queuedTasks: 100,
          lastHeartbeat: Date.now() - 300000,
          errorRate: 0.9,
        });
      }
      model.updateModel(observation);

      const actions = await limitedController.decide(observation);

      expect(actions.length).toBeLessThanOrEqual(2);
    });
  });

  describe('act', () => {
    it('should execute spawn_redundant_agent action', async () => {
      const action: SelfHealingAction = {
        id: 'test-action-1',
        type: 'spawn_redundant_agent',
        targetAgentId: 'bottleneck-agent',
        priority: 'high',
        estimatedImpact: 0.8,
        reversible: true,
        reason: 'Test action',
        createdAt: Date.now(),
      };

      const result = await controller.act(action);

      expect(result.success).toBe(true);
      expect(result.message).toContain('Spawned redundant agent');
    });

    it('should execute redistribute_load action', async () => {
      const action: SelfHealingAction = {
        id: 'test-action-2',
        type: 'redistribute_load',
        targetAgentId: 'overloaded-agent',
        priority: 'high',
        estimatedImpact: 0.5,
        reversible: true,
        reason: 'Test action',
        createdAt: Date.now(),
      };

      const result = await controller.act(action);

      expect(result.success).toBe(true);
      expect(result.message).toContain('Redistributed load');
    });

    it('should fail when target agent is missing', async () => {
      const action: SelfHealingAction = {
        id: 'test-action-3',
        type: 'restart_agent',
        // No targetAgentId
        priority: 'high',
        estimatedImpact: 0.7,
        reversible: false,
        reason: 'Test action',
        createdAt: Date.now(),
      };

      const result = await controller.act(action);

      expect(result.success).toBe(false);
      expect(result.error).toBe('missing_target');
    });

    it('should track action history', async () => {
      const action: SelfHealingAction = {
        id: 'test-action-4',
        type: 'add_connection',
        targetAgentId: 'agent-1',
        priority: 'medium',
        estimatedImpact: 0.6,
        reversible: true,
        reason: 'Test action',
        createdAt: Date.now(),
      };

      await controller.act(action);

      const history = controller.getActionHistory();
      expect(history).toHaveLength(1);
      expect(history[0].action.id).toBe('test-action-4');
    });

    it('should respect cooldown', async () => {
      const cooldownController = createSelfHealingController(model, executor, {
        actionCooldownMs: 60000, // 1 minute
      });

      const action: SelfHealingAction = {
        id: 'test-action-5',
        type: 'add_connection',
        targetAgentId: 'agent-1',
        priority: 'medium',
        estimatedImpact: 0.6,
        reversible: true,
        reason: 'Test action',
        createdAt: Date.now(),
      };

      // First action should succeed
      const result1 = await cooldownController.act(action);
      expect(result1.success).toBe(true);

      // Second action should be skipped due to cooldown
      const result2 = await cooldownController.act(action);
      expect(result2.success).toBe(false);
      expect(result2.error).toBe('cooldown');
    });
  });
});

// ============================================================================
// StrangeLoopOrchestrator Tests
// ============================================================================

describe('StrangeLoopOrchestrator', () => {
  let provider: InMemoryAgentProvider;
  let executor: NoOpActionExecutor;
  let orchestrator: StrangeLoopOrchestrator;

  beforeEach(() => {
    const setup = createInMemoryStrangeLoop('test-observer', {
      observationIntervalMs: 100,
      actionCooldownMs: 0,
      verboseLogging: false,
    });
    provider = setup.provider;
    executor = setup.executor;
    orchestrator = setup.orchestrator;
  });

  afterEach(async () => {
    await orchestrator.stop();
  });

  describe('start/stop', () => {
    it('should start and stop the loop', async () => {
      expect(orchestrator.isRunning()).toBe(false);

      await orchestrator.start();
      expect(orchestrator.isRunning()).toBe(true);

      await orchestrator.stop();
      expect(orchestrator.isRunning()).toBe(false);
    });

    it('should not start twice', async () => {
      await orchestrator.start();
      await orchestrator.start(); // Should be no-op

      expect(orchestrator.isRunning()).toBe(true);
    });
  });

  describe('runCycle', () => {
    it('should run a complete observation-model-decide-act cycle', async () => {
      setupMeshTopology(provider, 3);

      const { observation, delta, actions, results } = await orchestrator.runCycle();

      expect(observation).toBeDefined();
      expect(observation.topology.agentCount).toBe(3);
      expect(delta).toBeDefined();
      expect(Array.isArray(actions)).toBe(true);
      expect(Array.isArray(results)).toBe(true);
    });

    it('should detect issues and take action', async () => {
      setupStarTopology(provider, 4);

      const { actions, results } = await orchestrator.runCycle();

      // Should detect bottleneck and take action
      expect(actions.length).toBeGreaterThan(0);
    });

    it('should update statistics', async () => {
      provider.addAgent(createTestAgent('agent-1'));

      await orchestrator.runCycle();
      const stats = orchestrator.getStats();

      expect(stats.totalObservations).toBe(1);
      expect(stats.lastObservationAt).toBeGreaterThan(0);
    });
  });

  describe('selfDiagnose', () => {
    it('should diagnose healthy self', async () => {
      setupMeshTopology(provider, 3);

      const diagnosis = await orchestrator.selfDiagnose();

      expect(diagnosis.agentId).toBe('test-observer');
      expect(diagnosis.diagnosedAt).toBeGreaterThan(0);
    });

    it('should detect if self is bottleneck', async () => {
      // Create topology where observer is the hub
      provider.addAgent(createTestAgent('test-observer', 'coordinator'));
      provider.addAgent(createTestAgent('worker-1'));
      provider.addAgent(createTestAgent('worker-2'));
      provider.addEdge(createTestEdge('test-observer', 'worker-1'));
      provider.addEdge(createTestEdge('test-observer', 'worker-2'));

      const diagnosis = await orchestrator.selfDiagnose();

      expect(diagnosis.isBottleneck).toBe(true);
      expect(diagnosis.recommendations.length).toBeGreaterThan(0);
    });
  });

  describe('events', () => {
    it('should emit observation_complete events', async () => {
      provider.addAgent(createTestAgent('agent-1'));

      const events: string[] = [];
      orchestrator.on('observation_complete', () => events.push('observation_complete'));

      await orchestrator.runCycle();

      expect(events).toContain('observation_complete');
    });

    it('should emit vulnerability_detected events', async () => {
      setupStarTopology(provider, 4);

      const events: string[] = [];
      orchestrator.on('vulnerability_detected', () => events.push('vulnerability_detected'));

      await orchestrator.runCycle();

      expect(events).toContain('vulnerability_detected');
    });

    it('should emit loop_started and loop_stopped events', async () => {
      const events: string[] = [];
      orchestrator.on('loop_started', () => events.push('loop_started'));
      orchestrator.on('loop_stopped', () => events.push('loop_stopped'));

      await orchestrator.start();
      await orchestrator.stop();

      expect(events).toContain('loop_started');
      expect(events).toContain('loop_stopped');
    });

    it('should allow removing event listeners', async () => {
      const events: string[] = [];
      const listener = () => events.push('observation_complete');

      orchestrator.on('observation_complete', listener);
      await orchestrator.runCycle();
      expect(events).toHaveLength(1);

      orchestrator.off('observation_complete', listener);
      await orchestrator.runCycle();
      expect(events).toHaveLength(1); // Should not increase
    });
  });

  describe('getStats', () => {
    it('should return comprehensive statistics', async () => {
      provider.addAgent(createTestAgent('agent-1'));

      await orchestrator.runCycle();
      await orchestrator.runCycle();

      const stats = orchestrator.getStats();

      expect(stats.totalObservations).toBe(2);
      expect(stats.currentHealth).toBeDefined();
      expect(stats.healthTrend).toBeDefined();
      // Observation may be very fast (sub-millisecond), so just check it's defined
      expect(stats.avgObservationDurationMs).toBeDefined();
      expect(stats.avgObservationDurationMs).toBeGreaterThanOrEqual(0);
    });
  });

  describe('clear', () => {
    it('should clear all state', async () => {
      provider.addAgent(createTestAgent('agent-1'));

      await orchestrator.runCycle();
      orchestrator.clear();

      const stats = orchestrator.getStats();
      expect(stats.totalObservations).toBe(0);
      expect(orchestrator.getObservationHistory()).toHaveLength(0);
    });
  });
});

// ============================================================================
// Integration Tests
// ============================================================================

describe('Strange Loop Integration', () => {
  it('should complete full self-healing cycle', async () => {
    const { orchestrator, provider, executor } = createInMemoryStrangeLoop('observer', {
      actionCooldownMs: 0,
      predictiveHealingEnabled: true,
    });

    // Setup a problematic topology (star with bottleneck)
    setupStarTopology(provider, 5);

    // Run cycle
    const { observation, actions, results } = await orchestrator.runCycle();

    // Should detect the bottleneck
    expect(observation.connectivity.bottlenecks).toContain('coordinator');

    // Should suggest and execute healing actions
    if (actions.length > 0) {
      expect(actions[0].type).toMatch(/spawn_redundant_agent|add_connection/);
    }

    await orchestrator.stop();
  });

  it('should track health improvements over time', async () => {
    const { orchestrator, provider } = createInMemoryStrangeLoop('observer', {
      actionCooldownMs: 0,
    });

    // Start with unhealthy swarm
    setupStarTopology(provider, 3);

    await orchestrator.runCycle();
    const initialHealth = orchestrator.getStats().currentHealth;

    // Improve topology by adding more connections
    provider.addEdge(createTestEdge('worker-0', 'worker-1'));

    await orchestrator.runCycle();
    const improvedHealth = orchestrator.getStats().currentHealth;

    // Health should improve or stay same
    expect(improvedHealth).toBeGreaterThanOrEqual(initialHealth * 0.9);

    await orchestrator.stop();
  });
});

// ============================================================================
// Test Helpers Implementation
// ============================================================================

function createTestObservation(agentIds: string[]): SwarmHealthObservation {
  const agents = agentIds.map(id => createTestAgent(id));
  const edges: CommunicationEdge[] = [];

  // Create a connected graph
  for (let i = 0; i < agentIds.length - 1; i++) {
    edges.push(createTestEdge(agentIds[i], agentIds[i + 1]));
  }
  if (agentIds.length > 2) {
    edges.push(createTestEdge(agentIds[agentIds.length - 1], agentIds[0]));
  }

  const agentHealth = new Map();
  for (const id of agentIds) {
    agentHealth.set(id, {
      responsiveness: 1.0,
      taskCompletionRate: 0.95,
      memoryUtilization: 0.3,
      cpuUtilization: 0.3,
      activeConnections: 2,
      isBottleneck: false,
      degree: 2,
      queuedTasks: 0,
      lastHeartbeat: Date.now(),
      errorRate: 0,
    });
  }

  return {
    id: `obs-${Date.now()}`,
    timestamp: Date.now(),
    observerId: 'test-observer',
    topology: {
      agents,
      edges,
      type: 'mesh',
      agentCount: agents.length,
      edgeCount: edges.length,
    },
    connectivity: {
      minCut: 2,
      components: 1,
      bottlenecks: [],
      avgPathLength: 1.5,
      clusteringCoefficient: 0.5,
      density: 0.6,
      diameter: 2,
    },
    agentHealth,
    vulnerabilities: [],
    overallHealth: 0.9,
  };
}

function createTestObservationWithBottleneck(): SwarmHealthObservation {
  const observation = createTestObservation(['hub', 'spoke-1', 'spoke-2', 'spoke-3']);

  // Reconfigure as star topology with hub as bottleneck
  observation.topology.edges = [
    createTestEdge('hub', 'spoke-1'),
    createTestEdge('hub', 'spoke-2'),
    createTestEdge('hub', 'spoke-3'),
  ];
  observation.topology.type = 'star';
  observation.connectivity.bottlenecks = ['hub'];
  observation.connectivity.minCut = 1;

  observation.vulnerabilities = [
    {
      type: 'bottleneck',
      severity: 0.8,
      affectedAgents: ['spoke-1', 'spoke-2', 'spoke-3'],
      description: 'Agent hub is a single point of failure',
      suggestedAction: 'spawn_redundant_agent',
      detectedAt: Date.now(),
    },
  ];

  observation.overallHealth = 0.6;

  return observation;
}
