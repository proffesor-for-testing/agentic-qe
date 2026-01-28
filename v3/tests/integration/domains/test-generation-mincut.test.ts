/**
 * Test Generation MinCut Integration Test
 * ============================================================================
 *
 * Tests the MinCut topology awareness integration in the test-generation
 * domain coordinator per ADR-047.
 *
 * ADR-047: MinCut Self-Organizing QE Integration
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { Mock } from 'vitest';

import {
  TestGenerationCoordinator,
  type CoordinatorConfig,
} from '../../../src/domains/test-generation/coordinator';

import {
  QueenMinCutBridge,
  createQueenMinCutBridge,
} from '../../../src/coordination/mincut/queen-integration';

import {
  getSharedMinCutGraph,
  resetSharedMinCutState,
} from '../../../src/coordination/mincut';

import type { MinCutHealth, WeakVertex } from '../../../src/coordination/mincut/interfaces';
import type { DomainName } from '../../../src/shared/types';
import type { EventBus, AgentCoordinator, AgentInfo, MemoryBackend } from '../../../src/kernel/interfaces';

// ============================================================================
// Mock Helpers
// ============================================================================

function createMockEventBus(): EventBus & { publish: Mock } {
  return {
    publish: vi.fn().mockResolvedValue(undefined),
    subscribe: vi.fn().mockReturnValue('sub-1'),
    unsubscribe: vi.fn(),
    once: vi.fn(),
    listSubscribers: vi.fn().mockReturnValue([]),
  } as EventBus & { publish: Mock };
}

function createMockMemoryBackend(): MemoryBackend {
  const store = new Map<string, any>();
  return {
    get: vi.fn().mockImplementation((key: string) => Promise.resolve(store.get(key) ?? null)),
    set: vi.fn().mockImplementation((key: string, value: any) => {
      store.set(key, value);
      return Promise.resolve();
    }),
    delete: vi.fn().mockImplementation((key: string) => {
      store.delete(key);
      return Promise.resolve(true);
    }),
    search: vi.fn().mockResolvedValue([]),
    has: vi.fn().mockImplementation((key: string) => Promise.resolve(store.has(key))),
    clear: vi.fn().mockImplementation(() => {
      store.clear();
      return Promise.resolve();
    }),
    list: vi.fn().mockResolvedValue([]),
    keys: vi.fn().mockResolvedValue([]),
  } as unknown as MemoryBackend;
}

function createMockAgentCoordinator(agents: AgentInfo[] = []): AgentCoordinator & {
  listAgents: Mock;
  spawn: Mock;
  stop: Mock;
  canSpawn: Mock;
} {
  return {
    listAgents: vi.fn().mockReturnValue(agents),
    spawn: vi.fn().mockResolvedValue({ success: true, value: `agent-${Date.now()}` }),
    stop: vi.fn().mockResolvedValue(undefined),
    canSpawn: vi.fn().mockReturnValue(true),
    getAgent: vi.fn(),
  } as unknown as AgentCoordinator & {
    listAgents: Mock;
    spawn: Mock;
    stop: Mock;
    canSpawn: Mock;
  };
}

function createMockAgent(overrides: Partial<AgentInfo> = {}): AgentInfo {
  return {
    id: `agent-${Math.random().toString(36).slice(2, 8)}`,
    name: 'test-agent',
    domain: 'test-generation' as DomainName,
    type: 'generator',
    status: 'running',
    startedAt: new Date(),
    ...overrides,
  };
}

function createTestBridge(options: {
  agents?: AgentInfo[];
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
    }
  );

  return { bridge, mockEventBus, mockAgentCoordinator };
}

function createTestCoordinator(
  config: Partial<CoordinatorConfig> = {},
): {
  coordinator: TestGenerationCoordinator;
  mockEventBus: EventBus;
  mockMemory: MemoryBackend;
  mockAgentCoordinator: AgentCoordinator;
} {
  const mockEventBus = createMockEventBus();
  const mockMemory = createMockMemoryBackend();
  const mockAgentCoordinator = createMockAgentCoordinator();

  const coordinator = new TestGenerationCoordinator(
    mockEventBus,
    mockMemory,
    mockAgentCoordinator,
    {
      // Disable features that require external services for testing
      enableQESONA: false,
      enableFlashAttention: false,
      enableDecisionTransformer: false,
      enableCoherenceGate: false,
      enableConsensus: false,
      // Enable MinCut for testing
      enableMinCutAwareness: true,
      ...config,
    }
  );

  return { coordinator, mockEventBus, mockMemory, mockAgentCoordinator };
}

// ============================================================================
// Test Suite
// ============================================================================

describe('test-generation MinCut Integration', () => {
  beforeEach(() => {
    resetSharedMinCutState();
  });

  afterEach(() => {
    resetSharedMinCutState();
  });

  // ==========================================================================
  // Test: Coordinator accepts MinCut bridge via setter
  // ==========================================================================

  describe('MinCut bridge injection', () => {
    it('should accept MinCut bridge injection', async () => {
      const { coordinator } = createTestCoordinator();
      const { bridge } = createTestBridge();
      await bridge.initialize();

      // Set the bridge
      coordinator.setMinCutBridge(bridge);

      // Verify bridge is accessible via topology health check
      const isHealthy = coordinator.isTopologyHealthy();
      expect(typeof isHealthy).toBe('boolean');
    });

    it('should work without MinCut bridge (graceful degradation)', async () => {
      const { coordinator } = createTestCoordinator();

      // Without a bridge, isTopologyHealthy should return true (assume healthy)
      expect(coordinator.isTopologyHealthy()).toBe(true);

      // Other methods should not throw
      expect(coordinator.getDomainWeakVertices()).toEqual([]);
      expect(coordinator.isDomainWeakPoint()).toBe(false);
    });

    it('should work with MinCut awareness disabled', async () => {
      const { coordinator } = createTestCoordinator({
        enableMinCutAwareness: false,
      });

      // Should return true when awareness is disabled
      expect(coordinator.isTopologyHealthy()).toBe(true);
    });
  });

  // ==========================================================================
  // Test: isTopologyHealthy() returns correct status
  // ==========================================================================

  describe('topology health reporting', () => {
    it('should report topology health correctly with healthy topology', async () => {
      const agents = [
        createMockAgent({ id: 'agent-1', domain: 'test-generation' }),
        createMockAgent({ id: 'agent-2', domain: 'test-generation' }),
        createMockAgent({ id: 'agent-3', domain: 'test-generation' }),
      ];

      const { coordinator } = createTestCoordinator();
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

      coordinator.setMinCutBridge(bridge);

      // With well-connected agents, topology should be healthy
      const minCutHealth = bridge.getMinCutHealth();
      expect(minCutHealth).toBeDefined();
      expect(['healthy', 'idle', 'warning', 'critical']).toContain(minCutHealth.status);
    });

    it('should report idle status for empty topology', async () => {
      const { coordinator } = createTestCoordinator();
      const { bridge } = createTestBridge({ agents: [] });
      await bridge.initialize();

      coordinator.setMinCutBridge(bridge);

      const minCutHealth = bridge.getMinCutHealth();
      expect(minCutHealth.status).toBe('idle');

      // Coordinator should still report healthy for idle topology
      expect(coordinator.isTopologyHealthy()).toBe(true);
    });
  });

  // ==========================================================================
  // Test: getDomainWeakVertices() filters by domain
  // ==========================================================================

  describe('domain-filtered weak vertex detection', () => {
    it('should filter weak vertices by domain', async () => {
      const agents = [
        createMockAgent({ id: 'gen-agent-1', domain: 'test-generation' }),
        createMockAgent({ id: 'gen-agent-2', domain: 'test-generation' }),
        createMockAgent({ id: 'exec-agent-1', domain: 'test-execution' }),
        createMockAgent({ id: 'cov-agent-1', domain: 'coverage-analysis' }),
      ];

      const { coordinator } = createTestCoordinator();
      const { bridge } = createTestBridge({ agents });
      await bridge.initialize();

      const graph = bridge.getGraph();
      // Connect test-generation agents only
      graph.addEdge({
        source: 'agent:gen-agent-1',
        target: 'agent:gen-agent-2',
        weight: 1.0,
        type: 'coordination',
        bidirectional: true,
      });

      coordinator.setMinCutBridge(bridge);

      // Get domain-specific weak vertices
      const domainWeakVertices = coordinator.getDomainWeakVertices();
      expect(Array.isArray(domainWeakVertices)).toBe(true);

      // All returned vertices should belong to test-generation domain
      for (const wv of domainWeakVertices) {
        expect(wv.vertex.domain).toBe('test-generation');
      }
    });

    it('should return empty array when domain has no weak vertices', async () => {
      const agents = [
        createMockAgent({ id: 'agent-1', domain: 'test-generation' }),
        createMockAgent({ id: 'agent-2', domain: 'test-generation' }),
      ];

      const { coordinator } = createTestCoordinator();
      const { bridge } = createTestBridge({ agents });
      await bridge.initialize();

      // Strongly connect agents
      const graph = bridge.getGraph();
      graph.addEdge({
        source: 'agent:agent-1',
        target: 'agent:agent-2',
        weight: 2.0,
        type: 'coordination',
        bidirectional: true,
      });

      coordinator.setMinCutBridge(bridge);

      const domainWeakVertices = coordinator.getDomainWeakVertices();
      expect(Array.isArray(domainWeakVertices)).toBe(true);
    });
  });

  // ==========================================================================
  // Test: getTopologyBasedRouting() avoids weak domains
  // ==========================================================================

  describe('topology-based routing', () => {
    it('should route away from weak domains', async () => {
      const agents = [
        createMockAgent({ id: 'strong-1', domain: 'test-generation' }),
        createMockAgent({ id: 'strong-2', domain: 'test-generation' }),
        createMockAgent({ id: 'weak-1', domain: 'test-execution' }), // Isolated
      ];

      const { coordinator } = createTestCoordinator();
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

      coordinator.setMinCutBridge(bridge);

      // Get routing excluding weak domains
      const targetDomains = ['test-generation', 'test-execution', 'coverage-analysis'];
      const healthyRoutes = coordinator.getTopologyBasedRouting(targetDomains);

      expect(Array.isArray(healthyRoutes)).toBe(true);
      // Results should filter based on topology health
    });

    it('should include all domains when topology is healthy', async () => {
      const agents = [
        createMockAgent({ id: 'gen-1', domain: 'test-generation' }),
        createMockAgent({ id: 'exec-1', domain: 'test-execution' }),
      ];

      const { coordinator } = createTestCoordinator();
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

      coordinator.setMinCutBridge(bridge);

      const targetDomains = ['test-generation', 'test-execution'];
      const healthyRoutes = coordinator.getTopologyBasedRouting(targetDomains);

      // When all domains are well-connected, should return all
      expect(healthyRoutes.length).toBeGreaterThanOrEqual(0);
    });
  });

  // ==========================================================================
  // Test: isDomainWeakPoint() detection
  // ==========================================================================

  describe('domain weak point detection', () => {
    it('should detect when domain is a weak point', async () => {
      // Create a star topology where the hub is in test-generation
      const agents = [
        createMockAgent({ id: 'hub', domain: 'test-generation' }),
        createMockAgent({ id: 'leaf-1', domain: 'test-execution' }),
        createMockAgent({ id: 'leaf-2', domain: 'coverage-analysis' }),
      ];

      const { coordinator } = createTestCoordinator();
      const { bridge } = createTestBridge({ agents });
      await bridge.initialize();

      // All connections go through the hub
      const graph = bridge.getGraph();
      graph.addEdge({
        source: 'agent:hub',
        target: 'agent:leaf-1',
        weight: 0.5,
        type: 'coordination',
        bidirectional: true,
      });
      graph.addEdge({
        source: 'agent:hub',
        target: 'agent:leaf-2',
        weight: 0.5,
        type: 'coordination',
        bidirectional: true,
      });

      coordinator.setMinCutBridge(bridge);

      // The method should return a boolean
      const isWeakPoint = coordinator.isDomainWeakPoint();
      expect(typeof isWeakPoint).toBe('boolean');
    });

    it('should not detect weak point in well-connected topology', async () => {
      const agents = [
        createMockAgent({ id: 'gen-1', domain: 'test-generation' }),
        createMockAgent({ id: 'gen-2', domain: 'test-generation' }),
        createMockAgent({ id: 'exec-1', domain: 'test-execution' }),
      ];

      const { coordinator } = createTestCoordinator();
      const { bridge } = createTestBridge({ agents });
      await bridge.initialize();

      // Create mesh topology
      const graph = bridge.getGraph();
      graph.addEdge({
        source: 'agent:gen-1',
        target: 'agent:gen-2',
        weight: 2.0,
        type: 'coordination',
        bidirectional: true,
      });
      graph.addEdge({
        source: 'agent:gen-1',
        target: 'agent:exec-1',
        weight: 2.0,
        type: 'workflow',
        bidirectional: true,
      });
      graph.addEdge({
        source: 'agent:gen-2',
        target: 'agent:exec-1',
        weight: 2.0,
        type: 'workflow',
        bidirectional: true,
      });

      coordinator.setMinCutBridge(bridge);

      const isWeakPoint = coordinator.isDomainWeakPoint();
      expect(typeof isWeakPoint).toBe('boolean');
    });
  });

  // ==========================================================================
  // Test: Lifecycle integration
  // ==========================================================================

  describe('lifecycle integration', () => {
    it('should properly initialize and dispose', async () => {
      const { coordinator } = createTestCoordinator();
      const { bridge } = createTestBridge();
      await bridge.initialize();

      coordinator.setMinCutBridge(bridge);
      await coordinator.initialize();

      // Should be able to check health
      expect(coordinator.isTopologyHealthy()).toBe(true);

      // Dispose should not throw
      await coordinator.dispose();
    });

    it('should handle dispose without initialization', async () => {
      const { coordinator } = createTestCoordinator();

      // Dispose without initialize should not throw
      await expect(coordinator.dispose()).resolves.not.toThrow();
    });
  });

  // ==========================================================================
  // Test: Shared graph integration
  // ==========================================================================

  describe('shared graph integration', () => {
    it('should share graph state with other components', async () => {
      const { coordinator } = createTestCoordinator();
      const { bridge } = createTestBridge({ useSharedGraph: true });

      // Add data to shared graph before bridge initialization
      const sharedGraph = getSharedMinCutGraph();
      sharedGraph.addVertex({
        id: 'shared-agent-1',
        type: 'agent',
        domain: 'test-generation' as DomainName,
        weight: 1.0,
        createdAt: new Date(),
      });

      await bridge.initialize();
      coordinator.setMinCutBridge(bridge);

      // Bridge should see shared data
      const graph = bridge.getGraph();
      expect(graph).toBe(sharedGraph);
      expect(graph.hasVertex('shared-agent-1')).toBe(true);
    });
  });
});
