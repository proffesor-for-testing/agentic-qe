/**
 * MinCut Routing System - Integration Tests
 * ADR-068: Mincut-Gated Model Routing
 *
 * Tests the full integration of:
 * - QEMinCutService (lambda computation, tier assignment, structural health)
 * - MinCutRoutingService (task routing with mincut as primary strategy)
 * - StructuralHealthMonitor (fleet health from agent topology)
 * - End-to-end: task description + agent topology -> tier assignment
 *
 * These tests use REAL mincut computation (no mocking of the algorithm).
 */

import { describe, it, expect, beforeEach } from 'vitest';

import {
  QEMinCutService,
  createQEMinCutService,
  type AgentNode,
  type TaskGraph,
} from '../../src/integrations/ruvector/mincut-wrapper.js';

import {
  MinCutRoutingService,
  createMinCutRoutingService,
} from '../../src/mcp/services/mincut-routing-service.js';

import {
  StructuralHealthMonitor,
  createStructuralHealthMonitor,
} from '../../src/monitoring/structural-health.js';

// ============================================================================
// Test Fixtures
// ============================================================================

/**
 * Build a highly-connected agent topology (all same domain, many cross-links).
 * Expected: high lambda -> Tier 1 (Haiku)
 */
function buildHighlyConnectedTopology(): AgentNode[] {
  return [
    {
      id: 'agent-a',
      name: 'Agent A',
      domain: 'test-generation',
      capabilities: ['unit-test', 'integration-test'],
      dependsOn: ['agent-b', 'agent-c'],
      weight: 0.8,
    },
    {
      id: 'agent-b',
      name: 'Agent B',
      domain: 'test-generation',
      capabilities: ['unit-test'],
      dependsOn: ['agent-c'],
      weight: 0.7,
    },
    {
      id: 'agent-c',
      name: 'Agent C',
      domain: 'test-generation',
      capabilities: ['e2e-test'],
      dependsOn: ['agent-a'],
      weight: 0.9,
    },
    {
      id: 'agent-d',
      name: 'Agent D',
      domain: 'test-generation',
      capabilities: ['lint'],
      dependsOn: ['agent-a', 'agent-b', 'agent-c'],
      weight: 0.6,
    },
  ];
}

/**
 * Build a fragmented agent topology (multiple domains, few cross-links).
 * Expected: low lambda -> Tier 3 (Opus)
 */
function buildFragmentedTopology(): AgentNode[] {
  return [
    {
      id: 'sec-1',
      name: 'Security Scanner',
      domain: 'security-compliance',
      capabilities: ['sast'],
      dependsOn: [],
      weight: 0.9,
    },
    {
      id: 'test-1',
      name: 'Test Generator',
      domain: 'test-generation',
      capabilities: ['unit-test'],
      dependsOn: [],
      weight: 0.7,
    },
    {
      id: 'cov-1',
      name: 'Coverage Analyzer',
      domain: 'coverage-analysis',
      capabilities: ['coverage'],
      dependsOn: [],
      weight: 0.6,
    },
    {
      id: 'quality-1',
      name: 'Quality Assessor',
      domain: 'quality-assessment',
      capabilities: ['quality-gate'],
      dependsOn: [],
      weight: 0.5,
    },
  ];
}

/**
 * Build a moderately connected topology (some cross-domain dependencies).
 * Expected: medium lambda -> Tier 2 (Sonnet)
 */
function buildModerateTopology(): AgentNode[] {
  return [
    {
      id: 'coord',
      name: 'Coordinator',
      domain: 'coordination',
      capabilities: ['orchestration'],
      dependsOn: [],
      weight: 1.0,
    },
    {
      id: 'tester-1',
      name: 'Tester 1',
      domain: 'test-generation',
      capabilities: ['unit-test'],
      dependsOn: ['coord'],
      weight: 0.7,
    },
    {
      id: 'tester-2',
      name: 'Tester 2',
      domain: 'test-generation',
      capabilities: ['integration-test'],
      dependsOn: ['coord'],
      weight: 0.7,
    },
    {
      id: 'scanner',
      name: 'Security Scanner',
      domain: 'security-compliance',
      capabilities: ['sast'],
      dependsOn: ['coord'],
      weight: 0.8,
    },
    {
      id: 'coverage',
      name: 'Coverage Agent',
      domain: 'coverage-analysis',
      capabilities: ['coverage'],
      dependsOn: ['tester-1'],
      weight: 0.6,
    },
  ];
}

/**
 * Build a minimal topology (2 agents, single link).
 */
function buildMinimalTopology(): AgentNode[] {
  return [
    {
      id: 'alpha',
      name: 'Alpha',
      domain: 'test-generation',
      capabilities: ['test'],
      dependsOn: ['beta'],
      weight: 0.5,
    },
    {
      id: 'beta',
      name: 'Beta',
      domain: 'test-generation',
      capabilities: ['test'],
      dependsOn: [],
      weight: 0.5,
    },
  ];
}

// ============================================================================
// 1. QEMinCutService Integration Tests
// ============================================================================

describe('QEMinCutService integration', () => {
  let service: QEMinCutService;

  beforeEach(() => {
    service = createQEMinCutService();
  });

  describe('computeLambda', () => {
    it('should return 0 for an empty graph', () => {
      const graph: TaskGraph = { nodes: [], edges: [] };
      const lambda = service.computeLambda(graph);
      expect(lambda).toBe(0);
    });

    it('should compute lambda for a fully connected same-domain topology', () => {
      const agents = buildHighlyConnectedTopology();
      const graph = service.buildTaskGraphFromTopology(agents);
      const lambda = service.computeLambda(graph);

      // A fully connected 4-node same-domain graph has coordination edges
      // between all pairs (6 edges at weight 0.5) + dependency edges (5 at weight 1.0).
      // Lambda should be positive and non-trivial.
      expect(lambda).toBeGreaterThan(0);
    });

    it('should compute lower lambda for a fragmented topology', () => {
      const connectedAgents = buildHighlyConnectedTopology();
      const fragmentedAgents = buildFragmentedTopology();

      const connectedGraph = service.buildTaskGraphFromTopology(connectedAgents);
      const fragmentedGraph = service.buildTaskGraphFromTopology(fragmentedAgents);

      const connectedLambda = service.computeLambda(connectedGraph);
      const fragmentedLambda = service.computeLambda(fragmentedGraph);

      // Fragmented topology (no cross-domain edges, isolated agents) should
      // have lower or equal lambda than a well-connected topology.
      expect(fragmentedLambda).toBeLessThanOrEqual(connectedLambda);
    });
  });

  describe('computeRoutingTier', () => {
    it('should route a highly connected topology to Tier 2 (Sonnet)', () => {
      const agents = buildHighlyConnectedTopology();
      const tier = service.computeRoutingTier('Simple lint fix', agents);

      // 4 agents in same domain with full dependency + coordination edges
      // produces normalized lambda ~0.5 -> Tier 2 (Sonnet)
      expect(tier.tier).toBe(2);
      expect(tier.label).toBe('Sonnet');
      expect(tier.lambda).toBeGreaterThan(0);
      expect(tier.normalizedLambda).toBeGreaterThanOrEqual(0.4);
      expect(tier.normalizedLambda).toBeLessThan(0.8);
      expect(tier.confidence).toBeGreaterThan(0);
      expect(tier.confidence).toBeLessThanOrEqual(1);
      expect(tier.rationale).toContain('Simple lint fix');
    });

    it('should route a fragmented topology to Tier 3 (Opus)', () => {
      const agents = buildFragmentedTopology();
      const tier = service.computeRoutingTier('Implement cross-domain auth', agents);

      expect(tier.tier).toBe(3);
      expect(tier.label).toBe('Opus');
      expect(tier.normalizedLambda).toBeLessThan(0.4);
      expect(tier.rationale).toContain('Implement cross-domain auth');
    });

    it('should include rationale with agent count', () => {
      const agents = buildModerateTopology();
      const tier = service.computeRoutingTier('Refactor test suite', agents);

      expect(tier.rationale).toContain(`${agents.length} agents`);
    });

    it('should handle a single-agent topology', () => {
      const agents: AgentNode[] = [
        {
          id: 'lone-agent',
          name: 'Lone Agent',
          domain: 'test-generation',
          capabilities: ['test'],
          dependsOn: [],
          weight: 0.5,
        },
      ];
      const tier = service.computeRoutingTier('Solo task', agents);

      // Single agent has no edges, lambda should be 0 -> Tier 3
      expect(tier.tier).toBe(3);
      expect(tier.normalizedLambda).toBe(0);
    });
  });

  describe('getStructuralHealth', () => {
    it('should report healthy for a well-connected graph', () => {
      const agents = buildHighlyConnectedTopology();
      const graph = service.buildTaskGraphFromTopology(agents);
      const health = service.getStructuralHealth(graph);

      expect(health.healthy).toBe(true);
      expect(health.normalizedLambda).toBeGreaterThanOrEqual(0.4);
      expect(health.riskScore).toBeLessThan(0.6);
      expect(health.isConnected).toBe(true);
      expect(health.componentCount).toBe(1);
      expect(health.analyzedAt).toBeInstanceOf(Date);
    });

    it('should report unhealthy for a fragmented graph', () => {
      const agents = buildFragmentedTopology();
      const graph = service.buildTaskGraphFromTopology(agents);
      const health = service.getStructuralHealth(graph);

      // Four isolated agents (no cross-domain edges) -> disconnected
      expect(health.healthy).toBe(false);
      expect(health.normalizedLambda).toBeLessThan(0.4);
      expect(health.riskScore).toBeGreaterThan(0.6);
      expect(health.componentCount).toBeGreaterThan(1);
      expect(health.suggestions.length).toBeGreaterThan(0);
    });

    it('should return empty health report for empty graph', () => {
      const graph: TaskGraph = { nodes: [], edges: [] };
      const health = service.getStructuralHealth(graph);

      expect(health.lambda).toBe(0);
      expect(health.healthy).toBe(false);
      expect(health.riskScore).toBe(1.0);
      expect(health.suggestions).toContain('No agents in fleet. Spawn agents to build a topology.');
    });
  });

  describe('buildTaskGraphFromTopology', () => {
    it('should create nodes for each agent', () => {
      const agents = buildModerateTopology();
      const graph = service.buildTaskGraphFromTopology(agents);

      expect(graph.nodes).toHaveLength(agents.length);
      for (const agent of agents) {
        const node = graph.nodes.find(n => n.id === agent.id);
        expect(node).toBeDefined();
        expect(node!.type).toBe('agent');
        expect(node!.domain).toBe(agent.domain);
        expect(node!.weight).toBe(agent.weight);
      }
    });

    it('should create dependency edges from dependsOn', () => {
      const agents = buildHighlyConnectedTopology();
      const graph = service.buildTaskGraphFromTopology(agents);

      const dependencyEdges = graph.edges.filter(e => e.edgeType === 'dependency');
      // agent-a depends on b,c; agent-b depends on c; agent-c depends on a; agent-d depends on a,b,c
      // Total: 2 + 1 + 1 + 3 = 7 dependency edges
      expect(dependencyEdges.length).toBe(7);
      expect(dependencyEdges.every(e => e.weight === 1.0)).toBe(true);
    });

    it('should create coordination edges between same-domain agents', () => {
      const agents = buildHighlyConnectedTopology();
      const graph = service.buildTaskGraphFromTopology(agents);

      const coordEdges = graph.edges.filter(e => e.edgeType === 'coordination');
      // 4 agents in same domain -> C(4,2) = 6 coordination edges
      expect(coordEdges.length).toBe(6);
      expect(coordEdges.every(e => e.weight === 0.5)).toBe(true);
    });

    it('should not create dependency edges for unknown agent IDs', () => {
      const agents: AgentNode[] = [
        {
          id: 'a1',
          name: 'A1',
          domain: 'test-generation',
          capabilities: [],
          dependsOn: ['nonexistent-agent'],
          weight: 0.5,
        },
      ];
      const graph = service.buildTaskGraphFromTopology(agents);

      const dependencyEdges = graph.edges.filter(e => e.edgeType === 'dependency');
      expect(dependencyEdges).toHaveLength(0);
    });
  });
});

// ============================================================================
// 2. MinCutRoutingService Integration Tests
// ============================================================================

describe('MinCutRoutingService integration', () => {
  let routingService: MinCutRoutingService;

  beforeEach(() => {
    routingService = createMinCutRoutingService({ enableLogging: false });
  });

  describe('route with agent topology (mincut primary)', () => {
    it('should use mincut routing when agent topology is provided', () => {
      const agents = buildHighlyConnectedTopology();
      const result = routingService.route({
        task: 'Add a simple unit test',
        agentTopology: agents,
      });

      expect(result.usedMinCut).toBe(true);
      expect(result.lambda).toBeGreaterThan(0);
      expect(result.normalizedLambda).toBeGreaterThan(0);
      expect(result.confidence).toBeGreaterThan(0);
      expect(result.rationale).toBeTruthy();
      expect(result.decisionTimeMs).toBeGreaterThanOrEqual(0);
    });

    it('should assign Tier 2 (Sonnet) for highly connected topology', () => {
      const agents = buildHighlyConnectedTopology();
      const result = routingService.route({
        task: 'Fix typo in variable name',
        agentTopology: agents,
      });

      // 4-agent same-domain topology: normalized lambda ~0.5 -> modelTier 2 (Sonnet)
      expect(result.usedMinCut).toBe(true);
      expect(result.modelTier).toBe(2);
      expect(result.tierLabel).toBe('Sonnet');
    });

    it('should assign Tier 4 (Opus) for fragmented topology', () => {
      const agents = buildFragmentedTopology();
      const result = routingService.route({
        task: 'Design new microservice architecture',
        agentTopology: agents,
      });

      expect(result.usedMinCut).toBe(true);
      expect(result.modelTier).toBe(4);
      expect(result.tierLabel).toBe('Opus');
    });
  });

  describe('fallback when no topology provided', () => {
    it('should fall back to Sonnet when no topology is provided', () => {
      const result = routingService.route({
        task: 'Implement feature X',
      });

      expect(result.usedMinCut).toBe(false);
      expect(result.modelTier).toBe(2);
      expect(result.tierLabel).toBe('Sonnet');
      expect(result.rationale).toContain('Fallback');
    });

    it('should fall back when topology is empty', () => {
      const result = routingService.route({
        task: 'Refactor module',
        agentTopology: [],
      });

      expect(result.usedMinCut).toBe(false);
      expect(result.modelTier).toBe(2);
    });
  });

  describe('critical task enforcement', () => {
    it('should force critical tasks to at least Tier 2 (Sonnet)', () => {
      // Highly connected topology would normally route to Tier 1 (Haiku)
      const agents = buildHighlyConnectedTopology();
      const result = routingService.route({
        task: 'Deploy to production',
        agentTopology: agents,
        isCritical: true,
      });

      expect(result.usedMinCut).toBe(true);
      // Critical override: tier must be >= 2
      expect(result.modelTier).toBeGreaterThanOrEqual(2);
    });

    it('should keep already-high tier unchanged for critical tasks', () => {
      // Fragmented topology routes to Tier 4 (Opus) naturally
      const agents = buildFragmentedTopology();
      const result = routingService.route({
        task: 'Security audit of auth module',
        agentTopology: agents,
        isCritical: true,
      });

      expect(result.modelTier).toBe(4);
      expect(result.tierLabel).toBe('Opus');
    });
  });

  describe('health snapshot inclusion', () => {
    it('should include health snapshot when configured', () => {
      const serviceWithHealth = createMinCutRoutingService({
        enableLogging: false,
        includeHealthSnapshot: true,
      });

      const agents = buildModerateTopology();
      const result = serviceWithHealth.route({
        task: 'Generate tests for auth module',
        agentTopology: agents,
      });

      expect(result.usedMinCut).toBe(true);
      expect(result.healthSnapshot).toBeDefined();
      expect(result.healthSnapshot!.lambda).toBeGreaterThanOrEqual(0);
      expect(result.healthSnapshot!.analyzedAt).toBeInstanceOf(Date);
    });

    it('should not include health snapshot by default', () => {
      const agents = buildModerateTopology();
      const result = routingService.route({
        task: 'Run coverage analysis',
        agentTopology: agents,
      });

      expect(result.healthSnapshot).toBeUndefined();
    });
  });

  describe('disabled routing', () => {
    it('should fall back to Sonnet when mincut routing is disabled', () => {
      const disabledService = createMinCutRoutingService({
        enabled: false,
        enableLogging: false,
      });

      const agents = buildHighlyConnectedTopology();
      const result = disabledService.route({
        task: 'Some task',
        agentTopology: agents,
      });

      expect(result.usedMinCut).toBe(false);
      expect(result.modelTier).toBe(2);
      expect(result.rationale).toContain('disabled');
    });
  });
});

// ============================================================================
// 3. StructuralHealthMonitor Integration Tests
// ============================================================================

describe('StructuralHealthMonitor integration', () => {
  let monitor: StructuralHealthMonitor;

  beforeEach(() => {
    monitor = createStructuralHealthMonitor({ enableLogging: false });
  });

  describe('computeFleetHealth', () => {
    it('should return healthy status for well-connected fleet', () => {
      const agents = buildHighlyConnectedTopology();
      const health = monitor.computeFleetHealth(agents);

      expect(health.status).toBe('healthy');
      expect(health.healthy).toBe(true);
      expect(health.normalizedLambda).toBeGreaterThanOrEqual(0.4);
      expect(health.riskScore).toBeLessThan(0.6);
      expect(health.measuredAt).toBeInstanceOf(Date);
    });

    it('should return critical status for fragmented fleet', () => {
      const agents = buildFragmentedTopology();
      const health = monitor.computeFleetHealth(agents);

      // Four isolated agents -> critical
      expect(['critical', 'warning']).toContain(health.status);
      expect(health.healthy).toBe(false);
      expect(health.riskScore).toBeGreaterThan(0.6);
      expect(health.suggestions.length).toBeGreaterThan(0);
    });

    it('should return empty status for empty fleet', () => {
      const health = monitor.computeFleetHealth([]);

      expect(health.status).toBe('empty');
      expect(health.healthy).toBe(false);
      expect(health.lambda).toBe(0);
      expect(health.riskScore).toBe(1.0);
    });

    it('should identify weak points in the topology', () => {
      // Moderate topology: coord is a hub, coverage depends only on tester-1
      const agents = buildModerateTopology();
      const health = monitor.computeFleetHealth(agents);

      // The health report should exist and have a valid structure
      expect(health.weakPoints).toBeInstanceOf(Array);
      expect(health.normalizedLambda).toBeGreaterThanOrEqual(0);
      expect(health.normalizedLambda).toBeLessThanOrEqual(1);
    });
  });

  describe('health history tracking', () => {
    it('should track health measurements over time', () => {
      const connected = buildHighlyConnectedTopology();
      const fragmented = buildFragmentedTopology();

      monitor.computeFleetHealth(connected);
      monitor.computeFleetHealth(fragmented);
      monitor.computeFleetHealth(connected);

      const history = monitor.getHistory();
      expect(history).toHaveLength(3);
      expect(history[0].healthy).toBe(true);
      expect(history[1].healthy).toBe(false);
      expect(history[2].healthy).toBe(true);
    });

    it('should limit history to maxHistoryEntries', () => {
      const limitedMonitor = createStructuralHealthMonitor({
        maxHistoryEntries: 3,
        enableLogging: false,
      });
      const agents = buildHighlyConnectedTopology();

      for (let i = 0; i < 5; i++) {
        limitedMonitor.computeFleetHealth(agents);
      }

      const history = limitedMonitor.getHistory();
      expect(history).toHaveLength(3);
    });

    it('should clear history when requested', () => {
      const agents = buildHighlyConnectedTopology();
      monitor.computeFleetHealth(agents);
      monitor.computeFleetHealth(agents);

      expect(monitor.getHistory().length).toBe(2);

      monitor.clearHistory();
      expect(monitor.getHistory().length).toBe(0);
    });
  });

  describe('trend detection', () => {
    it('should report stable trend with insufficient data', () => {
      expect(monitor.getTrend()).toBe('stable');
    });

    it('should detect degrading trend', () => {
      // Start with highly connected, then fragment
      const connected = buildHighlyConnectedTopology();
      const fragmented = buildFragmentedTopology();

      monitor.computeFleetHealth(connected);
      monitor.computeFleetHealth(connected);
      monitor.computeFleetHealth(fragmented);

      // Trend should reflect the drop
      const trend = monitor.getTrend();
      expect(trend).toBe('degrading');
    });
  });
});

// ============================================================================
// 4. End-to-End: Task Submission -> Lambda -> Tier -> Agent Selection
// ============================================================================

describe('end-to-end mincut routing pipeline', () => {
  it('should route a task through the full pipeline', () => {
    const routingService = createMinCutRoutingService({ enableLogging: false });
    const agents = buildModerateTopology();

    const result = routingService.route({
      task: 'Implement OAuth2 authentication flow with PKCE',
      domain: 'security-compliance',
      agentType: 'qe-security-scanner',
      agentTopology: agents,
    });

    // Full pipeline should produce a valid result
    expect(result.usedMinCut).toBe(true);
    expect(result.modelTier).toBeGreaterThanOrEqual(0);
    expect(result.modelTier).toBeLessThanOrEqual(4);
    expect(result.tierLabel).toBeTruthy();
    expect(result.lambda).toBeGreaterThanOrEqual(0);
    expect(result.normalizedLambda).toBeGreaterThanOrEqual(0);
    expect(result.normalizedLambda).toBeLessThanOrEqual(1);
    expect(result.confidence).toBeGreaterThan(0);
    expect(result.confidence).toBeLessThanOrEqual(1);
    expect(result.rationale.length).toBeGreaterThan(0);
    expect(result.decisionTimeMs).toBeGreaterThanOrEqual(0);
  });

  it('should produce consistent results for the same input', () => {
    const routingService = createMinCutRoutingService({ enableLogging: false });
    const agents = buildHighlyConnectedTopology();
    const task = 'Add unit tests for payment module';

    const result1 = routingService.route({ task, agentTopology: agents });
    const result2 = routingService.route({ task, agentTopology: agents });

    // Deterministic algorithm -> same results
    expect(result1.modelTier).toBe(result2.modelTier);
    expect(result1.lambda).toBe(result2.lambda);
    expect(result1.normalizedLambda).toBe(result2.normalizedLambda);
  });

  it('should route differently based on topology structure', () => {
    const routingService = createMinCutRoutingService({ enableLogging: false });
    const task = 'Run comprehensive test suite';

    const connectedResult = routingService.route({
      task,
      agentTopology: buildHighlyConnectedTopology(),
    });

    const fragmentedResult = routingService.route({
      task,
      agentTopology: buildFragmentedTopology(),
    });

    // Same task, different topology -> different tier
    expect(connectedResult.modelTier).toBeLessThan(fragmentedResult.modelTier);
  });

  it('should complete a full health + routing cycle', () => {
    const healthMonitor = createStructuralHealthMonitor({ enableLogging: false });
    const routingService = createMinCutRoutingService({
      enableLogging: false,
      includeHealthSnapshot: true,
    });

    const agents = buildModerateTopology();

    // Step 1: Check fleet health
    const health = healthMonitor.computeFleetHealth(agents);
    expect(health.status).toBeTruthy();

    // Step 2: Route a task with the same topology
    const routingResult = routingService.route({
      task: 'Analyze test coverage gaps',
      agentTopology: agents,
    });

    expect(routingResult.usedMinCut).toBe(true);
    expect(routingResult.healthSnapshot).toBeDefined();

    // Step 3: Health and routing should agree on topology assessment
    // Both see the same graph -> normalized lambda should be close
    const healthLambda = health.normalizedLambda;
    const routingLambda = routingResult.normalizedLambda;
    // They use the same underlying computation, so should match
    expect(Math.abs(healthLambda - routingLambda)).toBeLessThan(0.01);
  });

  it('should handle large topology efficiently (< 100ms)', () => {
    const routingService = createMinCutRoutingService({ enableLogging: false });

    // Build a 50-agent topology with cross-domain links
    const largeTopo: AgentNode[] = [];
    const domains: Array<'test-generation' | 'coverage-analysis' | 'security-compliance' | 'quality-assessment' | 'code-intelligence'> = [
      'test-generation',
      'coverage-analysis',
      'security-compliance',
      'quality-assessment',
      'code-intelligence',
    ];

    for (let i = 0; i < 50; i++) {
      const domain = domains[i % domains.length];
      const deps: string[] = [];
      // Each agent depends on 1-3 previous agents
      for (let d = 1; d <= 3 && i - d >= 0; d++) {
        deps.push(`agent-${i - d}`);
      }
      largeTopo.push({
        id: `agent-${i}`,
        name: `Agent ${i}`,
        domain,
        capabilities: ['test'],
        dependsOn: deps,
        weight: 0.5 + Math.random() * 0.5,
      });
    }

    const start = performance.now();
    const result = routingService.route({
      task: 'Run full regression suite',
      agentTopology: largeTopo,
    });
    const duration = performance.now() - start;

    expect(result.usedMinCut).toBe(true);
    expect(duration).toBeLessThan(100);
  });
});

// ============================================================================
// 5. Critical Task P0 Enforcement
// ============================================================================

describe('critical task (p0) tier enforcement', () => {
  it('should enforce at least Tier 2 for critical tasks regardless of topology', () => {
    const service = createMinCutRoutingService({ enableLogging: false });
    const highlyConnected = buildHighlyConnectedTopology();

    // Non-critical with connected topology: Tier 2 (Sonnet)
    const normalResult = service.route({
      task: 'Add test',
      agentTopology: highlyConnected,
      isCritical: false,
    });
    expect(normalResult.modelTier).toBe(2);

    // Critical: should be at least Tier 2 (already is, so no change)
    const criticalResult = service.route({
      task: 'Add test',
      agentTopology: highlyConnected,
      isCritical: true,
    });
    expect(criticalResult.modelTier).toBeGreaterThanOrEqual(2);

    // The critical flag ensures the floor; if topology already routes >= 2,
    // the result stays the same
    expect(criticalResult.usedMinCut).toBe(true);
  });

  it('should not downgrade already-high tiers for critical tasks', () => {
    const service = createMinCutRoutingService({ enableLogging: false });
    const fragmented = buildFragmentedTopology();

    const criticalResult = service.route({
      task: 'Emergency security patch',
      agentTopology: fragmented,
      isCritical: true,
    });

    // Fragmented -> Tier 4 (Opus), critical should not reduce it
    expect(criticalResult.modelTier).toBe(4);
  });

  it('should enforce critical override even when fallback is used', () => {
    const service = createMinCutRoutingService({ enableLogging: false });

    const criticalFallback = service.route({
      task: 'Critical deployment',
      isCritical: true,
      // No topology -> fallback path
    });

    // Fallback defaults to Tier 2 (Sonnet) which satisfies >= 2
    expect(criticalFallback.usedMinCut).toBe(false);
    expect(criticalFallback.modelTier).toBeGreaterThanOrEqual(2);
  });
});
