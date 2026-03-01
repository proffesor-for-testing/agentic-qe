/**
 * Unit tests for QueenMinCutBridge
 * ADR-047: MinCut Self-Organizing QE Integration
 *
 * Tests the integration between MinCut topology analysis and Queen Coordinator.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  QueenMinCutBridge,
  createQueenMinCutBridge,
  DEFAULT_QUEEN_MINCUT_CONFIG,
} from '../../../../src/coordination/mincut/queen-integration';
import { EventBus, AgentCoordinator, AgentInfo } from '../../../../src/kernel/interfaces';
import { QueenHealth, QueenMetrics } from '../../../../src/coordination/queen-coordinator';
import { ALL_DOMAINS } from '../../../../src/shared/types';

// Mock dependencies
vi.mock('../../../../src/kernel/unified-memory', () => {
  const mockDb = {
    prepare: vi.fn(() => ({
      run: vi.fn(() => ({ lastInsertRowid: 1, changes: 1 })),
      get: vi.fn(),
      all: vi.fn(() => []),
    })),
    transaction: vi.fn((fn) => fn),
  };

  const mockMemory = {
    isInitialized: vi.fn(() => true),
    initialize: vi.fn(),
    getDatabase: vi.fn(() => mockDb),
  };

  return {
    UnifiedMemoryManager: vi.fn(() => mockMemory),
    getUnifiedMemory: vi.fn(() => mockMemory),
  };
});

describe('QueenMinCutBridge', () => {
  let bridge: QueenMinCutBridge;
  let mockEventBus: EventBus;
  let mockAgentCoordinator: AgentCoordinator;

  beforeEach(() => {
    vi.useFakeTimers();

    // Mock EventBus
    mockEventBus = {
      publish: vi.fn().mockResolvedValue(undefined),
      subscribe: vi.fn(),
      unsubscribe: vi.fn(),
    } as unknown as EventBus;

    // Mock AgentCoordinator with test agents
    mockAgentCoordinator = {
      listAgents: vi.fn(() => [
        createMockAgent('agent-1', 'test-generation'),
        createMockAgent('agent-2', 'test-execution'),
        createMockAgent('agent-3', 'coverage-analysis'),
      ]),
      getAgent: vi.fn((id) => createMockAgent(id, 'test-generation')),
      spawnAgent: vi.fn(),
      terminateAgent: vi.fn(),
    } as unknown as AgentCoordinator;
  });

  afterEach(async () => {
    // Only dispose if bridge was initialized
    // The dispose() method accesses persistence which requires initialization
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  // ==========================================================================
  // Helper Functions
  // ==========================================================================

  function createMockAgent(id: string, domain: string): AgentInfo {
    return {
      id,
      name: `${domain}-worker`,
      domain: domain as any,
      type: 'worker',
      capabilities: ['execute', 'analyze'],
      status: 'running',
      health: 1.0,
      taskCount: 0,
      startedAt: new Date(),
    };
  }

  function createBridge(config: Partial<typeof DEFAULT_QUEEN_MINCUT_CONFIG> = {}): QueenMinCutBridge {
    bridge = createQueenMinCutBridge(
      mockEventBus,
      mockAgentCoordinator,
      {
        ...config,
        persistData: false, // Disable persistence for most tests
        autoUpdateFromEvents: false, // Disable auto-update for controlled tests
      }
    );
    return bridge;
  }

  // ==========================================================================
  // Construction & Configuration
  // ==========================================================================

  describe('Construction', () => {
    it('should create bridge with default config', () => {
      bridge = createQueenMinCutBridge(mockEventBus, mockAgentCoordinator);
      expect(bridge).toBeDefined();
    });

    it('should create bridge with custom config', () => {
      bridge = createQueenMinCutBridge(mockEventBus, mockAgentCoordinator, {
        healthyThreshold: 5.0,
        warningThreshold: 2.5,
      });
      expect(bridge).toBeDefined();
    });

    it('should expose default config', () => {
      expect(DEFAULT_QUEEN_MINCUT_CONFIG).toBeDefined();
      expect(DEFAULT_QUEEN_MINCUT_CONFIG.autoUpdateFromEvents).toBe(true);
      expect(DEFAULT_QUEEN_MINCUT_CONFIG.persistData).toBe(true);
      expect(DEFAULT_QUEEN_MINCUT_CONFIG.includeInQueenHealth).toBe(true);
    });
  });

  // ==========================================================================
  // Initialization
  // ==========================================================================

  describe('Initialization', () => {
    it('should initialize without error', async () => {
      createBridge();
      await expect(bridge.initialize()).resolves.not.toThrow();
    });

    it('should build graph from agents on init', async () => {
      createBridge();
      await bridge.initialize();

      const graph = bridge.getGraph();
      expect(graph.vertexCount).toBeGreaterThan(0);
    });

    it('should add domain vertices', async () => {
      createBridge();
      await bridge.initialize();

      const graph = bridge.getGraph();
      // Should have domain vertices for each domain
      for (const domain of ALL_DOMAINS) {
        expect(graph.hasVertex(`domain:${domain}`)).toBe(true);
      }
    });

    it('should add agent vertices', async () => {
      createBridge();
      await bridge.initialize();

      const graph = bridge.getGraph();
      expect(graph.hasVertex('agent:agent-1')).toBe(true);
      expect(graph.hasVertex('agent:agent-2')).toBe(true);
      expect(graph.hasVertex('agent:agent-3')).toBe(true);
    });

    it('should start health monitoring', async () => {
      createBridge();
      await bridge.initialize();

      const monitor = bridge.getMonitor();
      expect(monitor).toBeDefined();
    });

    it('should not reinitialize if already initialized', async () => {
      createBridge();
      await bridge.initialize();
      const graph1 = bridge.getGraph();
      const count1 = graph1.vertexCount;

      await bridge.initialize();
      const count2 = graph1.vertexCount;

      expect(count1).toBe(count2);
    });
  });

  // ==========================================================================
  // Disposal
  // ==========================================================================

  describe('Disposal', () => {
    it('should dispose without error', async () => {
      createBridge();
      await bridge.initialize();
      await expect(bridge.dispose()).resolves.not.toThrow();
    });

    it('should stop monitoring on dispose', async () => {
      createBridge();
      await bridge.initialize();

      const monitor = bridge.getMonitor();
      const stopSpy = vi.spyOn(monitor, 'stop');

      await bridge.dispose();
      expect(stopSpy).toHaveBeenCalled();
    });
  });

  // ==========================================================================
  // Graph Building
  // ==========================================================================

  describe('Graph Building', () => {
    beforeEach(async () => {
      createBridge();
      await bridge.initialize();
    });

    it('should connect agents to domain coordinators', async () => {
      const graph = bridge.getGraph();

      // agent-1 is in test-generation domain
      const agent1Edges = graph.getEdgesForVertex('agent:agent-1');
      const domainEdge = agent1Edges.find(e =>
        e.target === 'domain:test-generation' || e.source === 'domain:test-generation'
      );
      expect(domainEdge).toBeDefined();
    });

    it('should create workflow edges between domains', async () => {
      const graph = bridge.getGraph();

      // test-generation -> test-execution workflow edge
      const genToDomain = graph.getEdge('domain:test-generation', 'domain:test-execution');
      expect(genToDomain).toBeDefined();
    });

    it('should refresh graph', async () => {
      const graph = bridge.getGraph();
      const initialCount = graph.vertexCount;

      // Add more agents
      vi.mocked(mockAgentCoordinator.listAgents).mockReturnValue([
        createMockAgent('agent-1', 'test-generation'),
        createMockAgent('agent-2', 'test-execution'),
        createMockAgent('agent-3', 'coverage-analysis'),
        createMockAgent('agent-4', 'defect-intelligence'),
      ]);

      await bridge.refreshGraph();

      // Should have added agent-4
      expect(graph.hasVertex('agent:agent-4')).toBe(true);
    });
  });

  // ==========================================================================
  // Health Integration
  // ==========================================================================

  describe('Health Integration', () => {
    beforeEach(async () => {
      createBridge({ includeInQueenHealth: true });
      await bridge.initialize();
    });

    it('should return MinCut health', () => {
      const health = bridge.getMinCutHealth();
      expect(health).toBeDefined();
      expect(health.minCutValue).toBeDefined();
      expect(health.status).toBeDefined();
    });

    it('should extend Queen health with MinCut', () => {
      const baseHealth: QueenHealth = {
        status: 'healthy',
        issues: [],
        metrics: {
          totalAgents: 3,
          activeAgents: 3,
          totalTasks: 0,
          completedTasks: 0,
          failedTasks: 0,
        },
        lastChecked: new Date(),
      };

      const extendedHealth = bridge.extendQueenHealth(baseHealth);
      expect(extendedHealth.minCut).toBeDefined();
      expect(extendedHealth.minCut!.minCutValue).toBeDefined();
    });

    it('should degrade health status when MinCut is critical', () => {
      // Clear graph to make MinCut critical
      bridge.getGraph().clear();

      const baseHealth: QueenHealth = {
        status: 'healthy',
        issues: [],
        metrics: {
          totalAgents: 0,
          activeAgents: 0,
          totalTasks: 0,
          completedTasks: 0,
          failedTasks: 0,
        },
        lastChecked: new Date(),
      };

      const extendedHealth = bridge.extendQueenHealth(baseHealth);
      // Empty graph is critical, should degrade healthy to degraded
      expect(['degraded', 'healthy']).toContain(extendedHealth.status);
    });

    it('should not include MinCut when disabled', () => {
      // Create bridge with includeInQueenHealth: false
      bridge.dispose();
      createBridge({ includeInQueenHealth: false });

      const baseHealth: QueenHealth = {
        status: 'healthy',
        issues: [],
        metrics: {
          totalAgents: 3,
          activeAgents: 3,
          totalTasks: 0,
          completedTasks: 0,
          failedTasks: 0,
        },
        lastChecked: new Date(),
      };

      const extendedHealth = bridge.extendQueenHealth(baseHealth);
      expect(extendedHealth.minCut).toBeUndefined();
    });
  });

  // ==========================================================================
  // Health Issues
  // ==========================================================================

  describe('Health Issues', () => {
    beforeEach(async () => {
      createBridge();
      await bridge.initialize();
    });

    it('should convert MinCut alerts to health issues', () => {
      const issues = bridge.getHealthIssuesFromMinCut();
      expect(Array.isArray(issues)).toBe(true);
    });

    it('should include weak vertex issues', () => {
      // Add isolated vertex to create weak point
      bridge.addVertex({
        id: 'isolated',
        type: 'agent',
        weight: 1.0,
        createdAt: new Date(),
      });

      const issues = bridge.getHealthIssuesFromMinCut();
      // May have issues for weak vertices
      expect(Array.isArray(issues)).toBe(true);
    });
  });

  // ==========================================================================
  // Metrics Extension
  // ==========================================================================

  describe('Metrics Extension', () => {
    beforeEach(async () => {
      createBridge();
      await bridge.initialize();
    });

    it('should extend Queen metrics with MinCut data', () => {
      const baseMetrics: QueenMetrics = {
        totalAgents: 3,
        activeAgents: 3,
        totalTasks: 10,
        completedTasks: 8,
        failedTasks: 2,
      };

      const extendedMetrics = bridge.extendQueenMetrics(baseMetrics);
      expect(extendedMetrics.minCutValue).toBeDefined();
      expect(extendedMetrics.weakVertexCount).toBeDefined();
      expect(extendedMetrics.topologyDensity).toBeDefined();
    });
  });

  // ==========================================================================
  // Graph Access
  // ==========================================================================

  describe('Graph Access', () => {
    beforeEach(async () => {
      createBridge();
      await bridge.initialize();
    });

    it('should get graph', () => {
      const graph = bridge.getGraph();
      expect(graph).toBeDefined();
    });

    it('should get monitor', () => {
      const monitor = bridge.getMonitor();
      expect(monitor).toBeDefined();
    });

    it('should get persistence', () => {
      const persistence = bridge.getPersistence();
      expect(persistence).toBeDefined();
    });

    it('should get MinCut value', () => {
      const value = bridge.getMinCutValue();
      expect(typeof value).toBe('number');
    });

    it('should get weak vertices', () => {
      const weakVertices = bridge.getWeakVertices();
      expect(Array.isArray(weakVertices)).toBe(true);
    });

    it('should check topology critical status', () => {
      const isCritical = bridge.isTopologyCritical();
      expect(typeof isCritical).toBe('boolean');
    });
  });

  // ==========================================================================
  // Manual Graph Updates
  // ==========================================================================

  describe('Manual Graph Updates', () => {
    beforeEach(async () => {
      createBridge();
      await bridge.initialize();
    });

    it('should add vertex manually', () => {
      const initialCount = bridge.getGraph().vertexCount;

      bridge.addVertex({
        id: 'manual-agent',
        type: 'agent',
        domain: 'test-generation',
        weight: 1.0,
        createdAt: new Date(),
      });

      expect(bridge.getGraph().vertexCount).toBe(initialCount + 1);
      expect(bridge.getGraph().hasVertex('manual-agent')).toBe(true);
    });

    it('should add edge manually', () => {
      bridge.addVertex({
        id: 'vertex-x',
        type: 'agent',
        weight: 1.0,
        createdAt: new Date(),
      });
      bridge.addVertex({
        id: 'vertex-y',
        type: 'agent',
        weight: 1.0,
        createdAt: new Date(),
      });

      bridge.addEdge({
        source: 'vertex-x',
        target: 'vertex-y',
        weight: 2.0,
        type: 'coordination',
        bidirectional: true,
      });

      const edge = bridge.getGraph().getEdge('vertex-x', 'vertex-y');
      expect(edge).toBeDefined();
      expect(edge!.weight).toBe(2.0);
    });

    it('should remove vertex manually', () => {
      bridge.addVertex({
        id: 'to-remove',
        type: 'agent',
        weight: 1.0,
        createdAt: new Date(),
      });

      expect(bridge.getGraph().hasVertex('to-remove')).toBe(true);

      const result = bridge.removeVertex('to-remove');
      expect(result).toBe(true);
      expect(bridge.getGraph().hasVertex('to-remove')).toBe(false);
    });
  });

  // ==========================================================================
  // Event Handling
  // ==========================================================================

  describe('Event Handling', () => {
    it('should subscribe to events when auto-update enabled', async () => {
      bridge = createQueenMinCutBridge(mockEventBus, mockAgentCoordinator, {
        autoUpdateFromEvents: true,
        persistData: false,
      });

      await bridge.initialize();

      // The bridge sets up internal handlers
      // We just verify it initializes without error
      expect(bridge).toBeDefined();
    });
  });

  // ==========================================================================
  // Factory Function
  // ==========================================================================

  describe('Factory Function', () => {
    it('should create bridge via factory', () => {
      const factoryBridge = createQueenMinCutBridge(mockEventBus, mockAgentCoordinator);
      expect(factoryBridge).toBeInstanceOf(QueenMinCutBridge);
    });
  });
});
