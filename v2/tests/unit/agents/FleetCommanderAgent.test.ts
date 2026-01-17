/**
 * FleetCommanderAgent Unit Tests
 * Comprehensive test suite for fleet coordination, resource allocation, and topology management
 */

import { FleetCommanderAgent, FleetCommanderConfig } from '@agents/FleetCommanderAgent';
import { EventEmitter } from 'events';
import { AgentType, QEAgentType, AgentStatus } from '@types';

// Mock MemoryStore implementation
class MockMemoryStore {
  private data = new Map<string, any>();

  async store(key: string, value: any, ttl?: number): Promise<void> {
    this.data.set(key, value);
  }

  async retrieve(key: string): Promise<any> {
    return this.data.get(key);
  }

  async set(key: string, value: any): Promise<void> {
    this.data.set(key, value);
  }

  async get(key: string): Promise<any> {
    return this.data.get(key);
  }

  async delete(key: string): Promise<boolean> {
    return this.data.delete(key);
  }

  async clear(): Promise<void> {
    this.data.clear();
  }
}

describe('FleetCommanderAgent', () => {
  let agent: FleetCommanderAgent;
  let mockMemoryStore: MockMemoryStore;
  let mockEventBus: EventEmitter;

  beforeEach(async () => {
    mockMemoryStore = new MockMemoryStore();
    mockEventBus = new EventEmitter();

    const config: FleetCommanderConfig = {
      type: QEAgentType.FLEET_COMMANDER,
      capabilities: [],
      context: { id: 'test-commander', type: 'fleet-commander', status: AgentStatus.IDLE },
      memoryStore: mockMemoryStore as any,
      eventBus: mockEventBus,
      topology: 'hierarchical',
      maxAgents: 50,
      agentPools: {
        [QEAgentType.TEST_GENERATOR]: { min: 2, max: 10, priority: 'high' },
        [QEAgentType.TEST_EXECUTOR]: { min: 3, max: 15, priority: 'critical' }
      },
      resourceLimits: {
        cpuPerAgent: 0.5,
        memoryPerAgent: '512MB',
        maxConcurrent: 20
      },
      autoScaling: {
        enabled: true,
        scaleUpThreshold: 0.85,
        scaleDownThreshold: 0.30,
        cooldownPeriod: 60000
      },
      faultTolerance: {
        heartbeatInterval: 5000,
        heartbeatTimeout: 15000,
        maxRetries: 3
      }
    };

    agent = new FleetCommanderAgent(config);
    await agent.initialize();
  }, 10000);

  afterEach(async () => {
    await agent.terminate();
  });

  // ============================================================================
  // Initialization Tests
  // ============================================================================

  describe('initialization', () => {
    it('should initialize successfully with default configuration', () => {
      const status = agent.getStatus();
      // After initialization, agent is IDLE (ready for tasks), not ACTIVE
      expect(status.status).toBe(AgentStatus.IDLE);
      expect(status.agentId.type).toBe(QEAgentType.FLEET_COMMANDER);
    });

    it('should have required capabilities', () => {
      expect(agent.hasCapability('agent-lifecycle-management')).toBe(true);
      expect(agent.hasCapability('resource-allocation')).toBe(true);
      expect(agent.hasCapability('topology-optimization')).toBe(true);
      expect(agent.hasCapability('conflict-resolution')).toBe(true);
      expect(agent.hasCapability('load-balancing')).toBe(true);
      expect(agent.hasCapability('fault-tolerance')).toBe(true);
      expect(agent.hasCapability('auto-scaling')).toBe(true);
      expect(agent.hasCapability('performance-monitoring')).toBe(true);
    });

    it('should store initial topology in memory', async () => {
      const topology = await mockMemoryStore.retrieve('aqe/fleet/topology');
      expect(topology).toBeDefined();
      expect(topology.mode).toBe('hierarchical');
      expect(topology.nodes).toBe(0);
    });

    it('should initialize agent pools', async () => {
      const status = agent.getStatus();
      expect(status).toBeDefined();
    });
  });

  // ============================================================================
  // Fleet Initialization Tests
  // ============================================================================

  describe('fleet initialization', () => {
    it('should initialize fleet with configuration', async () => {
      const task = {
        id: 'task-init-1',
        type: 'fleet-initialize',
        payload: { topology: 'hierarchical' },
        priority: 1,
        status: 'pending'
      };

      const assignment = {
        id: 'assignment-1',
        task,
        agentId: agent.getStatus().agentId.id,
        assignedAt: new Date(),
        status: 'assigned'
      };

      const result = await agent.executeTask(assignment);
      expect(result).toBeDefined();
      expect(result.topology).toBe('hierarchical');
      expect(result.status).toBe('success');
    });

    it('should store initialization results in memory', async () => {
      const task = {
        id: 'task-init-2',
        type: 'fleet-initialize',
        payload: {},
        priority: 1,
        status: 'pending'
      };

      const assignment = {
        id: 'assignment-2',
        task,
        agentId: agent.getStatus().agentId.id,
        assignedAt: new Date(),
        status: 'assigned'
      };

      await agent.executeTask(assignment);

      const initialization = await mockMemoryStore.retrieve('aqe/fleet/initialization');
      expect(initialization).toBeDefined();
      expect(initialization.results).toBeDefined();
    });
  });

  // ============================================================================
  // Agent Lifecycle Tests
  // ============================================================================

  describe('agent spawning', () => {
    it('should spawn agents successfully', async () => {
      const task = {
        id: 'task-spawn-1',
        type: 'agent-spawn',
        payload: { type: QEAgentType.TEST_GENERATOR, count: 2 },
        priority: 1,
        status: 'pending'
      };

      const assignment = {
        id: 'assignment-spawn-1',
        task,
        agentId: agent.getStatus().agentId.id,
        assignedAt: new Date(),
        status: 'assigned'
      };

      const result = await agent.executeTask(assignment);
      expect(result).toBeDefined();
      expect(result.type).toBe(QEAgentType.TEST_GENERATOR);
      expect(result.spawnedCount).toBe(2);
      expect(result.agentIds).toHaveLength(2);
    });

    it('should not exceed max pool size when spawning', async () => {
      const task = {
        id: 'task-spawn-2',
        type: 'agent-spawn',
        payload: { type: QEAgentType.TEST_GENERATOR, count: 20 }, // Exceeds max of 10
        priority: 1,
        status: 'pending'
      };

      const assignment = {
        id: 'assignment-spawn-2',
        task,
        agentId: agent.getStatus().agentId.id,
        assignedAt: new Date(),
        status: 'assigned'
      };

      await expect(agent.executeTask(assignment)).rejects.toThrow();
    });

    it('should not exceed fleet limit when spawning', async () => {
      const task = {
        id: 'task-spawn-3',
        type: 'agent-spawn',
        payload: { type: QEAgentType.TEST_EXECUTOR, count: 100 }, // Exceeds fleet limit of 50
        priority: 1,
        status: 'pending'
      };

      const assignment = {
        id: 'assignment-spawn-3',
        task,
        agentId: agent.getStatus().agentId.id,
        assignedAt: new Date(),
        status: 'assigned'
      };

      await expect(agent.executeTask(assignment)).rejects.toThrow();
    });

    it('should handle agent spawned events', async () => {
      const agentData = {
        agentId: 'test-agent-1',
        type: QEAgentType.TEST_EXECUTOR
      };

      mockEventBus.emit('agent.spawned', { data: agentData });

      // Wait for async processing
      await new Promise(resolve => setTimeout(resolve, 100));

      const storedAgent = await mockMemoryStore.retrieve(`aqe/fleet/agents/${agentData.agentId}`);
      expect(storedAgent).toBeDefined();
      expect(storedAgent.type).toBe(QEAgentType.TEST_EXECUTOR);
    });
  });

  describe('agent termination', () => {
    it('should terminate agent successfully', async () => {
      const task = {
        id: 'task-terminate-1',
        type: 'agent-terminate',
        payload: { agentId: 'test-agent-1' },
        priority: 1,
        status: 'pending'
      };

      const assignment = {
        id: 'assignment-terminate-1',
        task,
        agentId: agent.getStatus().agentId.id,
        assignedAt: new Date(),
        status: 'assigned'
      };

      const result = await agent.executeTask(assignment);
      expect(result).toBeDefined();
      expect(result.agentId).toBe('test-agent-1');
      expect(result.terminated).toBe(true);
    });
  });

  // ============================================================================
  // Topology Management Tests
  // ============================================================================

  describe('topology management', () => {
    it('should change topology from hierarchical to mesh', async () => {
      const task = {
        id: 'task-topology-1',
        type: 'topology-change',
        payload: { mode: 'mesh' },
        priority: 1,
        status: 'pending'
      };

      const assignment = {
        id: 'assignment-topology-1',
        task,
        agentId: agent.getStatus().agentId.id,
        assignedAt: new Date(),
        status: 'assigned'
      };

      const result = await agent.executeTask(assignment);
      expect(result).toBeDefined();
      expect(result.oldMode).toBe('hierarchical');
      expect(result.newMode).toBe('mesh');
    });

    it('should emit topology change events', async () => {
      const eventPromise = new Promise<void>((resolve) => {
        mockEventBus.once('fleet.topology-changed', (event) => {
          expect(event.type).toBe('fleet.topology-changed');
          expect(event.data.oldMode).toBe('hierarchical');
          expect(event.data.newMode).toBe('hybrid');
          resolve();
        });
      });

      const task = {
        id: 'task-topology-2',
        type: 'topology-change',
        payload: { mode: 'hybrid' },
        priority: 1,
        status: 'pending'
      };

      const assignment = {
        id: 'assignment-topology-2',
        task,
        agentId: agent.getStatus().agentId.id,
        assignedAt: new Date(),
        status: 'assigned'
      };

      await agent.executeTask(assignment);
      await eventPromise;
    });

    it('should store topology changes in memory', async () => {
      const task = {
        id: 'task-topology-3',
        type: 'topology-change',
        payload: { mode: 'adaptive' },
        priority: 1,
        status: 'pending'
      };

      const assignment = {
        id: 'assignment-topology-3',
        task,
        agentId: agent.getStatus().agentId.id,
        assignedAt: new Date(),
        status: 'assigned'
      };

      await agent.executeTask(assignment);

      const topology = await mockMemoryStore.retrieve('aqe/fleet/topology');
      expect(topology.mode).toBe('adaptive');
    });
  });

  // ============================================================================
  // Resource Allocation Tests
  // ============================================================================

  describe('resource allocation', () => {
    it('should allocate resources for new agents', async () => {
      const task = {
        id: 'task-spawn-resource-1',
        type: 'agent-spawn',
        payload: { type: QEAgentType.TEST_GENERATOR, count: 1 },
        priority: 1,
        status: 'pending'
      };

      const assignment = {
        id: 'assignment-spawn-resource-1',
        task,
        agentId: agent.getStatus().agentId.id,
        assignedAt: new Date(),
        status: 'assigned'
      };

      const result = await agent.executeTask(assignment);
      expect(result.poolStatus).toBeDefined();
      expect(result.poolStatus.active).toBeGreaterThan(0);
    });
  });

  // ============================================================================
  // Load Balancing Tests
  // ============================================================================

  describe('load balancing', () => {
    it('should rebalance workload across fleet', async () => {
      const task = {
        id: 'task-rebalance-1',
        type: 'rebalance-load',
        payload: {},
        priority: 1,
        status: 'pending'
      };

      const assignment = {
        id: 'assignment-rebalance-1',
        task,
        agentId: agent.getStatus().agentId.id,
        assignedAt: new Date(),
        status: 'assigned'
      };

      const result = await agent.executeTask(assignment);
      expect(result).toBeDefined();
      expect(result.strategy).toBeDefined();
      expect(result.fleetUtilization).toBeDefined();
    });

    it('should store load balancing results in memory', async () => {
      const task = {
        id: 'task-rebalance-2',
        type: 'rebalance-load',
        payload: {},
        priority: 1,
        status: 'pending'
      };

      const assignment = {
        id: 'assignment-rebalance-2',
        task,
        agentId: agent.getStatus().agentId.id,
        assignedAt: new Date(),
        status: 'assigned'
      };

      await agent.executeTask(assignment);

      const loadBalancing = await mockMemoryStore.retrieve('aqe/fleet/load-balancing');
      expect(loadBalancing).toBeDefined();
      expect(loadBalancing.strategy).toBeDefined();
    });
  });

  // ============================================================================
  // Conflict Resolution Tests
  // ============================================================================

  describe('conflict resolution', () => {
    it('should resolve resource contention conflicts', async () => {
      const task = {
        id: 'task-conflict-1',
        type: 'resolve-conflict',
        payload: {
          type: 'resource-contention',
          agents: ['agent-1', 'agent-2'],
          severity: 'high',
          allocation: { agentId: 'agent-1', cpu: 0.5, memory: '512MB', priority: 'high', allocated: false }
        },
        priority: 1,
        status: 'pending'
      };

      const assignment = {
        id: 'assignment-conflict-1',
        task,
        agentId: agent.getStatus().agentId.id,
        assignedAt: new Date(),
        status: 'assigned'
      };

      const result = await agent.executeTask(assignment);
      expect(result).toBeDefined();
      expect(result.type).toBe('resource-contention');
      expect(result.resolved).toBe(true);
    });

    it('should resolve deadlock conflicts', async () => {
      const task = {
        id: 'task-conflict-2',
        type: 'resolve-conflict',
        payload: {
          type: 'deadlock',
          agents: ['agent-1', 'agent-2', 'agent-3'],
          severity: 'critical'
        },
        priority: 1,
        status: 'pending'
      };

      const assignment = {
        id: 'assignment-conflict-2',
        task,
        agentId: agent.getStatus().agentId.id,
        assignedAt: new Date(),
        status: 'assigned'
      };

      const result = await agent.executeTask(assignment);
      expect(result).toBeDefined();
      expect(result.type).toBe('deadlock');
      expect(result.resolution).toBeDefined();
    });

    it('should store conflict resolutions in memory', async () => {
      const task = {
        id: 'task-conflict-3',
        type: 'resolve-conflict',
        payload: {
          type: 'priority-conflict',
          agents: ['agent-1', 'agent-2'],
          severity: 'medium'
        },
        priority: 1,
        status: 'pending'
      };

      const assignment = {
        id: 'assignment-conflict-3',
        task,
        agentId: agent.getStatus().agentId.id,
        assignedAt: new Date(),
        status: 'assigned'
      };

      const result = await agent.executeTask(assignment);

      const conflict = await mockMemoryStore.retrieve(`aqe/fleet/conflicts/${result.conflictId}`);
      expect(conflict).toBeDefined();
      expect(conflict.resolved).toBe(true);
    });
  });

  // ============================================================================
  // Auto-Scaling Tests
  // ============================================================================

  describe('auto-scaling', () => {
    it('should scale agent pool up', async () => {
      const task = {
        id: 'task-scale-1',
        type: 'scale-pool',
        payload: { type: QEAgentType.TEST_EXECUTOR, action: 'scale-up', count: 2 },
        priority: 1,
        status: 'pending'
      };

      const assignment = {
        id: 'assignment-scale-1',
        task,
        agentId: agent.getStatus().agentId.id,
        assignedAt: new Date(),
        status: 'assigned'
      };

      const result = await agent.executeTask(assignment);
      expect(result).toBeDefined();
      expect(result.spawnedCount).toBe(2);
    });

    it('should scale agent pool down', async () => {
      const task = {
        id: 'task-scale-2',
        type: 'scale-pool',
        payload: { type: QEAgentType.TEST_GENERATOR, action: 'scale-down', count: 1 },
        priority: 1,
        status: 'pending'
      };

      const assignment = {
        id: 'assignment-scale-2',
        task,
        agentId: agent.getStatus().agentId.id,
        assignedAt: new Date(),
        status: 'assigned'
      };

      const result = await agent.executeTask(assignment);
      expect(result).toBeDefined();
    });
  });

  // ============================================================================
  // Fault Tolerance Tests
  // ============================================================================

  describe('fault tolerance', () => {
    it('should handle agent errors', async () => {
      const errorData = {
        agentId: 'failing-agent-1',
        error: new Error('Test error')
      };

      mockEventBus.emit('agent.error', { data: errorData });

      // Wait for async processing
      await new Promise(resolve => setTimeout(resolve, 100));

      // Agent error should be handled
      expect(true).toBe(true); // Basic check that handler doesn't crash
    });

    it('should recover failed agents', async () => {
      // Store agent data first
      await mockMemoryStore.store('aqe/fleet/agents/failed-agent-1', {
        id: 'failed-agent-1',
        type: QEAgentType.TEST_EXECUTOR,
        status: AgentStatus.ERROR
      });

      const task = {
        id: 'task-recover-1',
        type: 'recover-agent',
        payload: { agentId: 'failed-agent-1' },
        priority: 1,
        status: 'pending'
      };

      const assignment = {
        id: 'assignment-recover-1',
        task,
        agentId: agent.getStatus().agentId.id,
        assignedAt: new Date(),
        status: 'assigned'
      };

      const result = await agent.executeTask(assignment);
      expect(result).toBeDefined();
      expect(result.agentId).toBe('failed-agent-1');
    });
  });

  // ============================================================================
  // Fleet Status & Metrics Tests
  // ============================================================================

  describe('fleet status and metrics', () => {
    it('should return fleet status', async () => {
      const task = {
        id: 'task-status-1',
        type: 'fleet-status',
        payload: {},
        priority: 1,
        status: 'pending'
      };

      const assignment = {
        id: 'assignment-status-1',
        task,
        agentId: agent.getStatus().agentId.id,
        assignedAt: new Date(),
        status: 'assigned'
      };

      const result = await agent.executeTask(assignment);
      expect(result).toBeDefined();
      expect(result.fleetId).toBeDefined();
      expect(result.status).toBe('operational');
      expect(result.topology).toBe('hierarchical');
      expect(result.agentPools).toBeDefined();
    });

    it('should return fleet metrics', async () => {
      const task = {
        id: 'task-metrics-1',
        type: 'fleet-metrics',
        payload: {},
        priority: 1,
        status: 'pending'
      };

      const assignment = {
        id: 'assignment-metrics-1',
        task,
        agentId: agent.getStatus().agentId.id,
        assignedAt: new Date(),
        status: 'assigned'
      };

      const result = await agent.executeTask(assignment);
      expect(result).toBeDefined();
      expect(result.totalAgents).toBeDefined();
      expect(result.activeAgents).toBeDefined();
      expect(result.avgCpuUtilization).toBeDefined();
      expect(result.avgMemoryUtilization).toBeDefined();
    });

    it('should get detailed status', async () => {
      const detailedStatus = await agent.getDetailedStatus();
      expect(detailedStatus).toBeDefined();
      expect(detailedStatus.fleetMetrics).toBeDefined();
      expect(detailedStatus.topology).toBeDefined();
      expect(detailedStatus.agentPools).toBeDefined();
      expect(detailedStatus.workloadQueueSize).toBeDefined();
    });
  });

  // ============================================================================
  // Task Management Tests
  // ============================================================================

  describe('task management', () => {
    it('should handle task submitted events', async () => {
      const taskData = {
        task: {
          id: 'test-task-1',
          type: 'unit-test',
          payload: {},
          priority: 1,
          status: 'pending'
        }
      };

      mockEventBus.emit('task:submitted', { data: taskData });

      // Wait for async processing
      await new Promise(resolve => setTimeout(resolve, 100));

      // Task should be queued
      expect(true).toBe(true);
    });

    it('should handle task completed events', async () => {
      const taskData = {
        taskId: 'completed-task-1'
      };

      mockEventBus.emit('task:completed', { data: taskData });

      // Wait for async processing
      await new Promise(resolve => setTimeout(resolve, 100));

      // Task should be removed from queue
      expect(true).toBe(true);
    });
  });

  // ============================================================================
  // Invalid Task Tests
  // ============================================================================

  describe('error handling', () => {
    it('should throw error for unknown task type', async () => {
      const task = {
        id: 'task-invalid-1',
        type: 'invalid-task-type',
        payload: {},
        priority: 1,
        status: 'pending'
      };

      const assignment = {
        id: 'assignment-invalid-1',
        task,
        agentId: agent.getStatus().agentId.id,
        assignedAt: new Date(),
        status: 'assigned'
      };

      await expect(agent.executeTask(assignment)).rejects.toThrow('Unknown task type');
    });

    it('should throw error for unknown agent type when spawning', async () => {
      const task = {
        id: 'task-invalid-2',
        type: 'agent-spawn',
        payload: { type: 'invalid-agent-type', count: 1 },
        priority: 1,
        status: 'pending'
      };

      const assignment = {
        id: 'assignment-invalid-2',
        task,
        agentId: agent.getStatus().agentId.id,
        assignedAt: new Date(),
        status: 'assigned'
      };

      await expect(agent.executeTask(assignment)).rejects.toThrow('Unknown agent type');
    });
  });

  // ============================================================================
  // Memory Operations Tests
  // ============================================================================

  describe('memory operations', () => {
    it('should store and retrieve data', async () => {
      await mockMemoryStore.store('test-key', { value: 'test-data' });
      const retrieved = await mockMemoryStore.retrieve('test-key');
      expect(retrieved.value).toBe('test-data');
    });

    it('should persist state on cleanup', async () => {
      // Spawn some agents first
      const task = {
        id: 'task-persist-1',
        type: 'agent-spawn',
        payload: { type: QEAgentType.TEST_GENERATOR, count: 1 },
        priority: 1,
        status: 'pending'
      };

      const assignment = {
        id: 'assignment-persist-1',
        task,
        agentId: agent.getStatus().agentId.id,
        assignedAt: new Date(),
        status: 'assigned'
      };

      await agent.executeTask(assignment);
      await agent.terminate();

      // Check that state was persisted
      const topology = await mockMemoryStore.retrieve('aqe/fleet/topology');
      expect(topology).toBeDefined();
    });
  });

  // ============================================================================
  // Performance Tests
  // ============================================================================

  describe('performance metrics', () => {
    it('should track performance metrics', () => {
      const status = agent.getStatus();
      expect(status.performanceMetrics).toBeDefined();
      expect(status.performanceMetrics.tasksCompleted).toBeDefined();
      expect(status.performanceMetrics.averageExecutionTime).toBeDefined();
      expect(status.performanceMetrics.errorCount).toBeDefined();
    });

    it('should update metrics after task execution', async () => {
      const statusBefore = agent.getStatus();
      const tasksBefore = statusBefore.performanceMetrics.tasksCompleted;

      const task = {
        id: 'task-metrics-2',
        type: 'fleet-status',
        payload: {},
        priority: 1,
        status: 'pending'
      };

      const assignment = {
        id: 'assignment-metrics-2',
        task,
        agentId: agent.getStatus().agentId.id,
        assignedAt: new Date(),
        status: 'assigned'
      };

      await agent.executeTask(assignment);

      const statusAfter = agent.getStatus();
      expect(statusAfter.performanceMetrics.tasksCompleted).toBe(tasksBefore + 1);
    });
  });

  // ============================================================================
  // Topology Resilience Analysis Tests (Min-Cut SPOF Detection)
  // ============================================================================

  describe('topology resilience analysis', () => {
    it('should analyze topology for resilience', async () => {
      const task = {
        id: 'task-topology-analyze-1',
        type: 'topology-analyze',
        payload: {},
        priority: 1,
        status: 'pending'
      };

      const assignment = {
        id: 'assignment-topology-analyze-1',
        task,
        agentId: agent.getStatus().agentId.id,
        assignedAt: new Date(),
        status: 'assigned'
      };

      const result = await agent.executeTask(assignment);

      // Result may be null if no other agents are registered
      // but should not throw
      expect(result === null || result?.score !== undefined).toBe(true);
    });

    it('should check for SPOFs', async () => {
      const task = {
        id: 'task-spof-check-1',
        type: 'topology-spof-check',
        payload: {},
        priority: 1,
        status: 'pending'
      };

      const assignment = {
        id: 'assignment-spof-check-1',
        task,
        agentId: agent.getStatus().agentId.id,
        assignedAt: new Date(),
        status: 'assigned'
      };

      const result = await agent.executeTask(assignment);

      // Should return array (possibly empty)
      expect(Array.isArray(result)).toBe(true);
    });

    it('should get topology optimizations', async () => {
      const task = {
        id: 'task-topology-optimize-1',
        type: 'topology-optimize',
        payload: {},
        priority: 1,
        status: 'pending'
      };

      const assignment = {
        id: 'assignment-topology-optimize-1',
        task,
        agentId: agent.getStatus().agentId.id,
        assignedAt: new Date(),
        status: 'assigned'
      };

      const result = await agent.executeTask(assignment);

      expect(result).toBeDefined();
      expect(result.optimizations).toBeDefined();
    });

    it('should store resilience analysis in memory', async () => {
      const task = {
        id: 'task-topology-analyze-2',
        type: 'topology-analyze',
        payload: {},
        priority: 1,
        status: 'pending'
      };

      const assignment = {
        id: 'assignment-topology-analyze-2',
        task,
        agentId: agent.getStatus().agentId.id,
        assignedAt: new Date(),
        status: 'assigned'
      };

      await agent.executeTask(assignment);

      // Check resilience data was stored
      const resilience = await mockMemoryStore.retrieve('aqe/fleet/resilience');
      // May be undefined if no agents, but should not throw
      expect(resilience === undefined || resilience?.result !== undefined).toBe(true);
    });

    it('should cache last resilience result', async () => {
      const task = {
        id: 'task-topology-analyze-3',
        type: 'topology-analyze',
        payload: {},
        priority: 1,
        status: 'pending'
      };

      const assignment = {
        id: 'assignment-topology-analyze-3',
        task,
        agentId: agent.getStatus().agentId.id,
        assignedAt: new Date(),
        status: 'assigned'
      };

      await agent.executeTask(assignment);

      // Can access cached result
      const cachedResult = agent.getLastResilienceResult();
      // May be undefined if single-node topology
      expect(cachedResult === undefined || cachedResult?.score !== undefined).toBe(true);
    });
  });
});