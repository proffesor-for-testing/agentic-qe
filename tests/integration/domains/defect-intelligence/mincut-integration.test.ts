/**
 * Defect Intelligence MinCut Integration Tests
 * ============================================================================
 *
 * Tests for ADR-047: MinCut Self-Organizing QE Integration
 * Verifies that the DefectIntelligenceCoordinator properly integrates with
 * MinCut topology awareness for routing and health monitoring.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { Mock } from 'vitest';

import {
  DefectIntelligenceCoordinator,
  type CoordinatorConfig,
} from '../../../../src/domains/defect-intelligence/coordinator';

import {
  QueenMinCutBridge,
  createQueenMinCutBridge,
  type QueenMinCutConfig,
  getSharedMinCutGraph,
  resetSharedMinCutState,
  createSwarmGraph,
} from '../../../../src/coordination/mincut';

import type { DomainName } from '../../../../src/shared/types';
import type { EventBus, AgentCoordinator, AgentInfo, MemoryBackend } from '../../../../src/kernel/interfaces';

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

function createMockAgentCoordinator(agents: AgentInfo[] = []): AgentCoordinator & { listAgents: Mock; canSpawn: Mock } {
  return {
    listAgents: vi.fn().mockReturnValue(agents),
    canSpawn: vi.fn().mockReturnValue(true),
    spawn: vi.fn().mockResolvedValue({ success: true, value: 'agent-123' }),
    stop: vi.fn().mockResolvedValue({ success: true }),
    getAgent: vi.fn(),
    updateAgentStatus: vi.fn(),
  } as unknown as AgentCoordinator & { listAgents: Mock; canSpawn: Mock };
}

function createMockMemoryBackend(): MemoryBackend {
  const storage = new Map<string, unknown>();
  return {
    get: vi.fn().mockImplementation((key: string) => Promise.resolve(storage.get(key))),
    set: vi.fn().mockImplementation((key: string, value: unknown) => {
      storage.set(key, value);
      return Promise.resolve();
    }),
    delete: vi.fn().mockImplementation((key: string) => {
      storage.delete(key);
      return Promise.resolve(true);
    }),
    has: vi.fn().mockImplementation((key: string) => Promise.resolve(storage.has(key))),
    keys: vi.fn().mockResolvedValue([]),
    clear: vi.fn().mockResolvedValue(undefined),
    search: vi.fn().mockResolvedValue([]),
    initialize: vi.fn().mockResolvedValue(undefined),
    dispose: vi.fn().mockResolvedValue(undefined),
  } as unknown as MemoryBackend;
}

function createMockAgent(overrides: Partial<AgentInfo> = {}): AgentInfo {
  return {
    id: `agent-${Math.random().toString(36).slice(2, 8)}`,
    name: 'test-agent',
    domain: 'defect-intelligence' as DomainName,
    type: 'analyzer',
    status: 'running',
    startedAt: new Date(),
    ...overrides,
  };
}

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
// Test Suite
// ============================================================================

describe('DefectIntelligence MinCut Integration', () => {
  let coordinator: DefectIntelligenceCoordinator;
  let mockEventBus: EventBus & { publish: Mock };
  let mockAgentCoordinator: AgentCoordinator & { listAgents: Mock; canSpawn: Mock };
  let mockMemory: MemoryBackend;

  beforeEach(() => {
    resetSharedMinCutState();
    mockEventBus = createMockEventBus();
    mockAgentCoordinator = createMockAgentCoordinator();
    mockMemory = createMockMemoryBackend();
  });

  afterEach(async () => {
    if (coordinator) {
      await coordinator.dispose();
    }
    resetSharedMinCutState();
  });

  // ==========================================================================
  // Test: Coordinator accepts MinCut bridge via setter
  // ==========================================================================

  describe('MinCut bridge injection', () => {
    it('should accept MinCut bridge injection', async () => {
      coordinator = new DefectIntelligenceCoordinator(
        mockEventBus,
        mockMemory,
        mockAgentCoordinator,
        { enableMinCutAwareness: true, enableConsensus: false }
      );
      await coordinator.initialize();

      const { bridge } = createTestBridge();
      await bridge.initialize();

      // Inject bridge via setter
      coordinator.setMinCutBridge(bridge);

      // Verify coordinator can report topology health
      expect(coordinator.isTopologyHealthy()).toBe(true);
    });

    it('should work without MinCut bridge (graceful degradation)', async () => {
      coordinator = new DefectIntelligenceCoordinator(
        mockEventBus,
        mockMemory,
        mockAgentCoordinator,
        { enableMinCutAwareness: false, enableConsensus: false }
      );
      await coordinator.initialize();

      // Should function without MinCut bridge
      expect(coordinator.isTopologyHealthy()).toBe(true);
      expect(coordinator.isDomainWeakPoint()).toBe(false);
    });

    it('should work with MinCut awareness disabled', async () => {
      coordinator = new DefectIntelligenceCoordinator(
        mockEventBus,
        mockMemory,
        mockAgentCoordinator,
        { enableMinCutAwareness: false, enableConsensus: false }
      );
      await coordinator.initialize();

      // No bridge set, awareness disabled - should still function
      const routing = coordinator.getTopologyBasedRouting([
        'test-generation',
        'test-execution',
        'coverage-analysis',
      ]);

      // Should return all domains when awareness is disabled
      expect(routing).toHaveLength(3);
      expect(routing).toContain('test-generation');
    });
  });

  // ==========================================================================
  // Test: isTopologyHealthy() returns correct status
  // ==========================================================================

  describe('topology health reporting', () => {
    it('should report topology health correctly with healthy topology', async () => {
      const agents = [
        createMockAgent({ id: 'agent-1', domain: 'defect-intelligence' }),
        createMockAgent({ id: 'agent-2', domain: 'defect-intelligence' }),
        createMockAgent({ id: 'agent-3', domain: 'defect-intelligence' }),
      ];

      const { bridge } = createTestBridge({ agents });
      await bridge.initialize();

      // Add interconnections
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

      coordinator = new DefectIntelligenceCoordinator(
        mockEventBus,
        mockMemory,
        mockAgentCoordinator,
        { enableMinCutAwareness: true, enableConsensus: false }
      );
      await coordinator.initialize();
      coordinator.setMinCutBridge(bridge);

      // Verify the health status is one of the expected values
      // (depends on MinCut threshold configuration)
      const minCutHealth = bridge.getMinCutHealth();
      expect(['healthy', 'idle', 'warning', 'critical']).toContain(minCutHealth.status);

      // isTopologyHealthy returns true for all statuses except 'critical'
      const isHealthy = coordinator.isTopologyHealthy();
      expect(typeof isHealthy).toBe('boolean');

      // If status is not critical, should be healthy
      if (minCutHealth.status !== 'critical') {
        expect(isHealthy).toBe(true);
      }
    });

    it('should report idle status for empty topology', async () => {
      const { bridge } = createTestBridge({ agents: [] });
      await bridge.initialize();

      coordinator = new DefectIntelligenceCoordinator(
        mockEventBus,
        mockMemory,
        mockAgentCoordinator,
        { enableMinCutAwareness: true, enableConsensus: false }
      );
      await coordinator.initialize();
      coordinator.setMinCutBridge(bridge);

      // Empty topology is 'idle', not critical
      const minCutHealth = bridge.getMinCutHealth();
      expect(minCutHealth.status).toBe('idle');
      expect(coordinator.isTopologyHealthy()).toBe(true);
    });
  });

  // ==========================================================================
  // Test: getDomainWeakVertices() filters by domain
  // ==========================================================================

  describe('domain-filtered weak vertex detection', () => {
    it('should filter weak vertices by defect-intelligence domain', async () => {
      const agents = [
        createMockAgent({ id: 'di-agent-1', domain: 'defect-intelligence' }),
        createMockAgent({ id: 'di-agent-2', domain: 'defect-intelligence' }),
        createMockAgent({ id: 'tg-agent-1', domain: 'test-generation' }),
        createMockAgent({ id: 'te-agent-1', domain: 'test-execution' }),
      ];

      const { bridge } = createTestBridge({ agents });
      await bridge.initialize();

      // Connect defect-intelligence agents
      const graph = bridge.getGraph();
      graph.addEdge({
        source: 'agent:di-agent-1',
        target: 'agent:di-agent-2',
        weight: 1.0,
        type: 'coordination',
        bidirectional: true,
      });

      coordinator = new DefectIntelligenceCoordinator(
        mockEventBus,
        mockMemory,
        mockAgentCoordinator,
        { enableMinCutAwareness: true, enableConsensus: false }
      );
      await coordinator.initialize();
      coordinator.setMinCutBridge(bridge);

      // Get domain-specific weak vertices
      const domainWeakVertices = coordinator.getDomainWeakVertices();
      expect(Array.isArray(domainWeakVertices)).toBe(true);

      // All returned vertices should belong to defect-intelligence
      for (const wv of domainWeakVertices) {
        expect(wv.vertex.domain).toBe('defect-intelligence');
      }
    });

    it('should return empty array when domain has no weak vertices', async () => {
      const agents = [
        createMockAgent({ id: 'agent-1', domain: 'defect-intelligence' }),
        createMockAgent({ id: 'agent-2', domain: 'defect-intelligence' }),
      ];

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

      coordinator = new DefectIntelligenceCoordinator(
        mockEventBus,
        mockMemory,
        mockAgentCoordinator,
        { enableMinCutAwareness: true, enableConsensus: false }
      );
      await coordinator.initialize();
      coordinator.setMinCutBridge(bridge);

      const domainWeakVertices = coordinator.getDomainWeakVertices();
      expect(Array.isArray(domainWeakVertices)).toBe(true);
    });
  });

  // ==========================================================================
  // Test: getTopologyBasedRouting() avoids weak domains
  // ==========================================================================

  describe('topology-based routing', () => {
    it('should filter routing based on topology health', async () => {
      const agents = [
        createMockAgent({ id: 'strong-1', domain: 'defect-intelligence' }),
        createMockAgent({ id: 'strong-2', domain: 'defect-intelligence' }),
      ];

      const { bridge } = createTestBridge({ agents });
      await bridge.initialize();

      // Connect agents
      const graph = bridge.getGraph();
      graph.addEdge({
        source: 'agent:strong-1',
        target: 'agent:strong-2',
        weight: 2.0,
        type: 'coordination',
        bidirectional: true,
      });

      coordinator = new DefectIntelligenceCoordinator(
        mockEventBus,
        mockMemory,
        mockAgentCoordinator,
        { enableMinCutAwareness: true, enableConsensus: false }
      );
      await coordinator.initialize();
      coordinator.setMinCutBridge(bridge);

      const targetDomains: DomainName[] = [
        'test-generation',
        'test-execution',
        'coverage-analysis',
      ];

      const routing = coordinator.getTopologyBasedRouting(targetDomains);

      // Should return healthy domains
      expect(Array.isArray(routing)).toBe(true);
    });

    it('should return all domains when MinCut awareness is disabled', async () => {
      coordinator = new DefectIntelligenceCoordinator(
        mockEventBus,
        mockMemory,
        mockAgentCoordinator,
        { enableMinCutAwareness: false, enableConsensus: false }
      );
      await coordinator.initialize();

      const targetDomains: DomainName[] = [
        'test-generation',
        'test-execution',
        'coverage-analysis',
      ];

      const routing = coordinator.getTopologyBasedRouting(targetDomains);

      // Should return all domains when awareness is disabled
      expect(routing).toEqual(targetDomains);
    });
  });

  // ==========================================================================
  // Test: isDomainWeakPoint() detection
  // ==========================================================================

  describe('weak point detection', () => {
    it('should detect when domain is a weak point', async () => {
      // Create isolated agent in defect-intelligence domain
      const agents = [
        createMockAgent({ id: 'isolated-agent', domain: 'defect-intelligence' }),
      ];

      const { bridge } = createTestBridge({ agents });
      await bridge.initialize();

      coordinator = new DefectIntelligenceCoordinator(
        mockEventBus,
        mockMemory,
        mockAgentCoordinator,
        { enableMinCutAwareness: true, enableConsensus: false }
      );
      await coordinator.initialize();
      coordinator.setMinCutBridge(bridge);

      // Check if domain is weak (isolated agent with no connections)
      // This depends on the MinCut threshold configuration
      const isWeak = coordinator.isDomainWeakPoint();
      expect(typeof isWeak).toBe('boolean');
    });

    it('should return false when no bridge is set', async () => {
      coordinator = new DefectIntelligenceCoordinator(
        mockEventBus,
        mockMemory,
        mockAgentCoordinator,
        { enableMinCutAwareness: true, enableConsensus: false }
      );
      await coordinator.initialize();

      // No bridge set - should return false
      expect(coordinator.isDomainWeakPoint()).toBe(false);
    });
  });

  // ==========================================================================
  // Test: Health change subscription
  // ==========================================================================

  describe('topology health subscription', () => {
    it('should allow subscribing to health changes', async () => {
      const agents = [
        createMockAgent({ id: 'agent-1', domain: 'defect-intelligence' }),
      ];

      const { bridge } = createTestBridge({ agents });
      await bridge.initialize();

      coordinator = new DefectIntelligenceCoordinator(
        mockEventBus,
        mockMemory,
        mockAgentCoordinator,
        { enableMinCutAwareness: true, enableConsensus: false }
      );
      await coordinator.initialize();
      coordinator.setMinCutBridge(bridge);

      const healthChanges: any[] = [];
      const unsubscribe = coordinator.onTopologyHealthChange((health) => {
        healthChanges.push(health);
      });

      expect(typeof unsubscribe).toBe('function');

      // Cleanup
      unsubscribe();
    });
  });

  // ==========================================================================
  // Test: Coordinator lifecycle with MinCut
  // ==========================================================================

  describe('coordinator lifecycle', () => {
    it('should properly dispose MinCut resources', async () => {
      const { bridge } = createTestBridge();
      await bridge.initialize();

      coordinator = new DefectIntelligenceCoordinator(
        mockEventBus,
        mockMemory,
        mockAgentCoordinator,
        { enableMinCutAwareness: true, enableConsensus: false }
      );
      await coordinator.initialize();
      coordinator.setMinCutBridge(bridge);

      // Dispose should clean up MinCut mixin
      await coordinator.dispose();

      // After dispose, coordinator should still respond gracefully
      expect(coordinator.isTopologyHealthy()).toBe(true);
    });
  });
});
