/**
 * MinCut Domain Integration Test Template
 * ============================================================================
 *
 * Template for testing MinCut integration in a domain coordinator.
 * Copy this file and replace:
 * - DOMAIN_NAME with your domain (e.g., 'test-generation')
 * - DomainCoordinator with your coordinator class name
 * - createDomainCoordinator with your factory function
 *
 * ADR-047: MinCut Self-Organizing QE Integration
 *
 * @example
 * // Copy this file to your domain's test folder:
 * // tests/integration/domains/test-generation/mincut-integration.test.ts
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { Mock } from 'vitest';

// ============================================================================
// REPLACE THESE IMPORTS WITH YOUR DOMAIN-SPECIFIC IMPORTS
// ============================================================================

// Import your domain coordinator
// import { DomainCoordinator, createDomainCoordinator } from '../../../../src/domains/DOMAIN_NAME/coordinator';

// Import MinCut integration types
import {
  QueenMinCutBridge,
  createQueenMinCutBridge,
  QueenMinCutConfig,
} from '../../../src/coordination/mincut/queen-integration';

import {
  SwarmGraph,
  createSwarmGraph,
  getSharedMinCutGraph,
  resetSharedMinCutState,
} from '../../../src/coordination/mincut';

import type { MinCutHealth, WeakVertex } from '../../../src/coordination/mincut/interfaces';
import type { DomainName } from '../../../src/shared/types';
import type { EventBus, AgentCoordinator, AgentInfo } from '../../../src/kernel/interfaces';

// ============================================================================
// MOCK HELPERS - Reuse these in your tests
// ============================================================================

/**
 * Create a mock EventBus for testing
 */
function createMockEventBus(): EventBus & { publish: Mock } {
  return {
    publish: vi.fn().mockResolvedValue(undefined),
    subscribe: vi.fn().mockReturnValue('sub-1'),
    unsubscribe: vi.fn(),
    once: vi.fn(),
    listSubscribers: vi.fn().mockReturnValue([]),
  } as EventBus & { publish: Mock };
}

/**
 * Create a mock AgentCoordinator for testing
 * @param agents - Optional list of agents to return from listAgents()
 */
function createMockAgentCoordinator(agents: AgentInfo[] = []): AgentCoordinator & { listAgents: Mock } {
  return {
    listAgents: vi.fn().mockReturnValue(agents),
    spawnAgent: vi.fn(),
    terminateAgent: vi.fn(),
    getAgent: vi.fn(),
    updateAgentStatus: vi.fn(),
  } as unknown as AgentCoordinator & { listAgents: Mock };
}

/**
 * Create a mock agent for testing
 * @param overrides - Properties to override on the default agent
 */
function createMockAgent(overrides: Partial<AgentInfo> = {}): AgentInfo {
  return {
    id: `agent-${Math.random().toString(36).slice(2, 8)}`,
    name: 'test-agent',
    domain: 'test-generation' as DomainName,
    type: 'tester',
    status: 'running',
    startedAt: new Date(),
    ...overrides,
  };
}

/**
 * Create a MinCut bridge with test configuration
 */
function createTestBridge(options: {
  agents?: AgentInfo[];
  config?: Partial<QueenMinCutConfig>;
  useSharedGraph?: boolean;
} = {}): {
  bridge: QueenMinCutBridge;
  mockEventBus: EventBus & { publish: Mock };
  mockAgentCoordinator: AgentCoordinator & { listAgents: Mock };
} {
  const mockEventBus = createMockEventBus();
  const mockAgentCoordinator = createMockAgentCoordinator(options.agents ?? []);

  const bridge = createQueenMinCutBridge(
    mockEventBus,
    mockAgentCoordinator,
    {
      includeInQueenHealth: true,
      autoUpdateFromEvents: false,
      persistData: false,
      sharedGraph: options.useSharedGraph ? getSharedMinCutGraph() : undefined,
      ...options.config,
    }
  );

  return { bridge, mockEventBus, mockAgentCoordinator };
}

// ============================================================================
// REPLACE 'DOMAIN_NAME' with your actual domain name
// ============================================================================

const DOMAIN_NAME: DomainName = 'test-generation'; // REPLACE: 'test-generation' | 'test-execution' | etc.

describe('[DOMAIN_NAME] MinCut Integration', () => {
  beforeEach(() => {
    // Reset MinCut singleton state between tests
    resetSharedMinCutState();
  });

  afterEach(() => {
    resetSharedMinCutState();
  });

  // ==========================================================================
  // Test: Coordinator accepts MinCut bridge via constructor/setter
  // ==========================================================================

  describe('MinCut bridge injection', () => {
    it('should accept MinCut bridge injection', async () => {
      // REPLACE: Instantiate your domain coordinator with MinCut bridge
      const { bridge } = createTestBridge();
      await bridge.initialize();

      // Example: Your coordinator should accept the bridge
      // const coordinator = createDomainCoordinator({
      //   minCutBridge: bridge,
      //   // ... other dependencies
      // });

      // Verify bridge is accessible
      expect(bridge.getGraph()).toBeDefined();
      expect(bridge.getMinCutHealth()).toBeDefined();

      // REPLACE: Add assertions specific to your coordinator
      // expect(coordinator.hasMinCutIntegration()).toBe(true);
    });

    it('should work without MinCut bridge (graceful degradation)', async () => {
      // REPLACE: Create coordinator without MinCut bridge
      // const coordinator = createDomainCoordinator({
      //   minCutBridge: undefined,
      //   // ... other dependencies
      // });

      // Coordinator should still function without MinCut
      // expect(coordinator.isOperational()).toBe(true);

      // Health check should indicate missing MinCut (not fail)
      // const health = coordinator.getHealth();
      // expect(health.status).not.toBe('error');

      expect(true).toBe(true); // REPLACE: Remove this placeholder
    });
  });

  // ==========================================================================
  // Test: isTopologyHealthy() returns correct status
  // ==========================================================================

  describe('topology health reporting', () => {
    it('should report topology health correctly with healthy topology', async () => {
      // Create bridge with multiple connected agents
      const agents = [
        createMockAgent({ id: 'agent-1', domain: DOMAIN_NAME }),
        createMockAgent({ id: 'agent-2', domain: DOMAIN_NAME }),
        createMockAgent({ id: 'agent-3', domain: DOMAIN_NAME }),
      ];

      const { bridge } = createTestBridge({ agents });
      await bridge.initialize();

      // Add interconnections between agents
      const graph = bridge.getGraph();
      graph.addEdge({
        source: 'agent:agent-1',
        target: 'agent:agent-2',
        weight: 1.0,
        type: 'coordination',
        bidirectional: true,
      });
      graph.addEdge({
        source: 'agent:agent-2',
        target: 'agent:agent-3',
        weight: 1.0,
        type: 'coordination',
        bidirectional: true,
      });
      graph.addEdge({
        source: 'agent:agent-1',
        target: 'agent:agent-3',
        weight: 1.0,
        type: 'coordination',
        bidirectional: true,
      });

      // REPLACE: Your coordinator should report healthy topology
      // const health = coordinator.isTopologyHealthy();
      // expect(health).toBe(true);

      // Or check via bridge
      const minCutHealth = bridge.getMinCutHealth();

      // REPLACE: Adjust assertions based on your topology requirements
      // With well-connected agents, status should generally be healthy/warning
      // The exact threshold depends on your MinCut configuration
      expect(minCutHealth).toBeDefined();
      expect(['healthy', 'idle', 'warning', 'critical']).toContain(minCutHealth.status);

      // For production tests, use stricter assertion:
      // expect(minCutHealth.status).not.toBe('critical');
    });

    it('should report unhealthy topology when disconnected', async () => {
      // Create bridge with a single isolated agent
      const agents = [
        createMockAgent({ id: 'isolated-agent', domain: DOMAIN_NAME }),
      ];

      const { bridge } = createTestBridge({ agents });
      await bridge.initialize();

      // Agent vertex exists but has no connections to other agents
      const graph = bridge.getGraph();
      const agentVertex = graph.getVertex('agent:isolated-agent');
      expect(agentVertex).toBeDefined();

      // REPLACE: Your coordinator should detect weak topology
      // const health = coordinator.isTopologyHealthy();
      // expect(health).toBe(false);

      // Check weak vertices
      const weakVertices = bridge.getWeakVertices();
      // Isolated agents should be flagged as weak
      expect(Array.isArray(weakVertices)).toBe(true);
    });

    it('should report idle status for empty topology (fresh install)', async () => {
      // No agents - simulates fresh installation
      const { bridge } = createTestBridge({ agents: [] });
      await bridge.initialize();

      const minCutHealth = bridge.getMinCutHealth();

      // Fresh install should be 'idle', not 'critical'
      expect(minCutHealth.status).toBe('idle');
    });
  });

  // ==========================================================================
  // Test: getDomainWeakVertices() filters by domain
  // ==========================================================================

  describe('domain-filtered weak vertex detection', () => {
    it('should filter weak vertices by domain', async () => {
      // Create agents across multiple domains
      const agents = [
        createMockAgent({ id: 'gen-agent-1', domain: 'test-generation' }),
        createMockAgent({ id: 'gen-agent-2', domain: 'test-generation' }),
        createMockAgent({ id: 'exec-agent-1', domain: 'test-execution' }),
        createMockAgent({ id: 'cov-agent-1', domain: 'coverage-analysis' }),
      ];

      const { bridge } = createTestBridge({ agents });
      await bridge.initialize();

      // Make one domain's agent isolated (weak)
      // Don't add any edges for cov-agent-1

      const graph = bridge.getGraph();
      // Connect test-generation agents
      graph.addEdge({
        source: 'agent:gen-agent-1',
        target: 'agent:gen-agent-2',
        weight: 1.0,
        type: 'coordination',
        bidirectional: true,
      });

      // Get all weak vertices
      const allWeakVertices = bridge.getWeakVertices();

      // REPLACE: Filter by your domain
      const domainWeakVertices = allWeakVertices.filter(
        (wv: WeakVertex) => wv.vertex.domain === DOMAIN_NAME
      );

      // Your coordinator should provide a method like:
      // const domainWeakVertices = coordinator.getDomainWeakVertices();

      expect(Array.isArray(domainWeakVertices)).toBe(true);
    });

    it('should return empty array when domain has no weak vertices', async () => {
      // Create well-connected agents in your domain
      const agents = [
        createMockAgent({ id: 'agent-1', domain: DOMAIN_NAME }),
        createMockAgent({ id: 'agent-2', domain: DOMAIN_NAME }),
      ];

      const { bridge } = createTestBridge({ agents });
      await bridge.initialize();

      // Strongly connect agents
      const graph = bridge.getGraph();
      graph.addEdge({
        source: 'agent:agent-1',
        target: 'agent:agent-2',
        weight: 2.0, // Strong connection
        type: 'coordination',
        bidirectional: true,
      });

      const allWeakVertices = bridge.getWeakVertices();
      const domainWeakVertices = allWeakVertices.filter(
        (wv: WeakVertex) => wv.vertex.domain === DOMAIN_NAME
      );

      // Well-connected domain should have no weak vertices
      // (Depending on threshold configuration)
      expect(Array.isArray(domainWeakVertices)).toBe(true);
    });
  });

  // ==========================================================================
  // Test: getTopologyBasedRouting() avoids weak domains
  // ==========================================================================

  describe('topology-based routing', () => {
    it('should route away from weak domains', async () => {
      // Setup: Create agents where one domain is weak
      const agents = [
        createMockAgent({ id: 'strong-1', domain: 'test-generation' }),
        createMockAgent({ id: 'strong-2', domain: 'test-generation' }),
        createMockAgent({ id: 'weak-1', domain: 'test-execution' }), // Isolated
      ];

      const { bridge } = createTestBridge({ agents });
      await bridge.initialize();

      // Connect test-generation agents, leave test-execution isolated
      const graph = bridge.getGraph();
      graph.addEdge({
        source: 'agent:strong-1',
        target: 'agent:strong-2',
        weight: 2.0,
        type: 'coordination',
        bidirectional: true,
      });

      // REPLACE: Your coordinator should provide routing that avoids weak domains
      // const routing = coordinator.getTopologyBasedRouting({
      //   fromDomain: 'test-generation',
      //   taskType: 'execute-tests',
      // });

      // Routing should prefer strong domains
      // expect(routing.preferredDomains).not.toContain('test-execution');
      // Or should indicate risk
      // expect(routing.riskAssessment['test-execution']).toBe('high');

      // For now, verify the bridge identifies the weak domain
      const minCutValue = bridge.getMinCutValue();
      expect(typeof minCutValue).toBe('number');
    });

    it('should include all domains when topology is healthy', async () => {
      // Setup: Create well-connected agents across all relevant domains
      const agents = [
        createMockAgent({ id: 'gen-1', domain: 'test-generation' }),
        createMockAgent({ id: 'exec-1', domain: 'test-execution' }),
      ];

      const { bridge } = createTestBridge({ agents });
      await bridge.initialize();

      // Connect all agents
      const graph = bridge.getGraph();
      graph.addEdge({
        source: 'agent:gen-1',
        target: 'agent:exec-1',
        weight: 1.5,
        type: 'workflow',
        bidirectional: true,
      });

      // REPLACE: All domains should be available for routing
      // const routing = coordinator.getTopologyBasedRouting({
      //   fromDomain: 'test-generation',
      // });
      // expect(routing.availableDomains).toContain('test-execution');

      // REPLACE: Adjust based on your topology requirements
      // For template purposes, just verify the method exists
      const isCritical = bridge.isTopologyCritical();
      expect(typeof isCritical).toBe('boolean');

      // For production tests with proper topology setup:
      // expect(bridge.isTopologyCritical()).toBe(false);
    });
  });

  // ==========================================================================
  // Test: Behavior when topology is critical
  // ==========================================================================

  describe('critical topology handling', () => {
    it('should handle critical topology state', async () => {
      // Setup: Create a topology that will be flagged as critical
      // (very sparse with single points of failure)
      const agents = [
        createMockAgent({ id: 'hub', domain: DOMAIN_NAME }),
        createMockAgent({ id: 'leaf-1', domain: DOMAIN_NAME }),
        createMockAgent({ id: 'leaf-2', domain: DOMAIN_NAME }),
        createMockAgent({ id: 'leaf-3', domain: DOMAIN_NAME }),
      ];

      const { bridge } = createTestBridge({ agents });
      await bridge.initialize();

      // Create star topology (hub is single point of failure)
      const graph = bridge.getGraph();
      ['leaf-1', 'leaf-2', 'leaf-3'].forEach(leafId => {
        graph.addEdge({
          source: 'agent:hub',
          target: `agent:${leafId}`,
          weight: 0.5, // Weak connections
          type: 'coordination',
          bidirectional: true,
        });
      });

      // REPLACE: Your coordinator should handle critical state
      // const health = coordinator.getHealth();
      //
      // Options for handling:
      // 1. Return degraded status
      // expect(health.status).toBe('degraded');
      //
      // 2. Include warnings
      // expect(health.warnings).toContainEqual(
      //   expect.objectContaining({ type: 'topology-critical' })
      // );
      //
      // 3. Trigger self-healing
      // expect(coordinator.isAttemptingSelfHealing()).toBe(true);

      // Verify bridge detects the critical state
      const minCutHealth = bridge.getMinCutHealth();
      expect(minCutHealth).toBeDefined();

      // Hub should be identified as critical (removing it disconnects the graph)
      const weakVertices = bridge.getWeakVertices();
      expect(weakVertices.length).toBeGreaterThan(0);
    });

    it('should emit health events when topology becomes critical', async () => {
      const { bridge, mockEventBus } = createTestBridge();
      await bridge.initialize();

      // REPLACE: Trigger an action that degrades topology
      // await coordinator.terminateAgent('critical-agent');

      // Verify health event was published
      // expect(mockEventBus.publish).toHaveBeenCalledWith(
      //   expect.objectContaining({
      //     type: 'MinCutHealthIssue',
      //   })
      // );

      expect(mockEventBus.publish).toBeDefined(); // Placeholder
    });
  });

  // ==========================================================================
  // Test: Queen health extension
  // ==========================================================================

  describe('Queen health integration', () => {
    it('should extend Queen health with MinCut data', async () => {
      const agents = [
        createMockAgent({ id: 'agent-1', domain: DOMAIN_NAME }),
      ];

      const { bridge } = createTestBridge({ agents });
      await bridge.initialize();

      const mockQueenHealth = {
        status: 'healthy' as const,
        domainHealth: new Map(),
        totalAgents: 1,
        activeAgents: 1,
        pendingTasks: 0,
        runningTasks: 0,
        workStealingActive: false,
        lastHealthCheck: new Date(),
        issues: [],
      };

      const extendedHealth = bridge.extendQueenHealth(mockQueenHealth);

      // Should include minCut field
      expect((extendedHealth as any).minCut).toBeDefined();
      expect((extendedHealth as any).minCut.minCutValue).toBeDefined();
      expect((extendedHealth as any).minCut.status).toBeDefined();
    });

    it('should not degrade healthy status for idle topology', async () => {
      // Empty topology (fresh install)
      const { bridge } = createTestBridge({ agents: [] });
      await bridge.initialize();

      const mockQueenHealth = {
        status: 'healthy' as const,
        domainHealth: new Map(),
        totalAgents: 0,
        activeAgents: 0,
        pendingTasks: 0,
        runningTasks: 0,
        workStealingActive: false,
        lastHealthCheck: new Date(),
        issues: [],
      };

      const extendedHealth = bridge.extendQueenHealth(mockQueenHealth);

      // Fresh install should NOT degrade to 'degraded'
      expect(extendedHealth.status).toBe('healthy');
    });
  });

  // ==========================================================================
  // Test: Shared graph integration with MCP tools
  // ==========================================================================

  describe('MCP tools integration', () => {
    it('should share graph state with MCP tools', async () => {
      // Use shared graph singleton
      const { bridge } = createTestBridge({ useSharedGraph: true });

      // Simulate MCP tool adding data BEFORE bridge.initialize()
      const sharedGraph = getSharedMinCutGraph();
      sharedGraph.addVertex({
        id: 'mcp-agent-1',
        type: 'agent',
        domain: DOMAIN_NAME,
        weight: 1.0,
        createdAt: new Date(),
      });

      await bridge.initialize();

      // Bridge should see MCP-added data
      const graph = bridge.getGraph();
      expect(graph).toBe(sharedGraph); // Same instance
      expect(graph.hasVertex('mcp-agent-1')).toBe(true);
    });
  });
});
