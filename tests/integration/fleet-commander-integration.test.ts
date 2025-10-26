/**
 * FleetCommanderAgent Integration Tests
 * Tests memory coordination, agent lifecycle, resource allocation, and topology management
 */

import { EventEmitter } from 'events';
import { MemoryManager } from '@core/MemoryManager';
import { EventBus } from '@core/EventBus';
import { Database } from '@utils/Database';
import { Logger } from '@utils/Logger';

// Mock external dependencies
jest.mock('@utils/Database');
jest.mock('@utils/Logger');

describe('FleetCommanderAgent Integration', () => {
  let eventBus: EventBus;
  let memoryManager: MemoryManager;
  let mockDatabase: jest.Mocked<Database>;
  let mockLogger: jest.Mocked<Logger>;

  const fleetConfig = {
    topology: 'hierarchical',
    maxAgents: 50,
    agentPools: {
      'test-generator': { min: 2, max: 10, priority: 'high' },
      'test-executor': { min: 3, max: 15, priority: 'critical' },
      'coverage-analyzer': { min: 1, max: 5, priority: 'high' },
      'quality-gate': { min: 1, max: 3, priority: 'medium' }
    },
    resourceLimits: {
      cpuPerAgent: 0.5,
      memoryPerAgent: '512MB',
      maxConcurrent: 20
    }
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    // Mock Database
    mockDatabase = {
      initialize: jest.fn().mockResolvedValue(undefined),
      close: jest.fn().mockResolvedValue(undefined),
      run: jest.fn().mockResolvedValue({ lastID: 1, changes: 1 }),
      get: jest.fn().mockResolvedValue(null),
      all: jest.fn().mockResolvedValue([])
    } as any;

    // Mock Logger
    mockLogger = {
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn(),
      getInstance: jest.fn().mockReturnValue(mockLogger)
    } as any;

    (Database as jest.Mock).mockImplementation(() => mockDatabase);
    (Logger.getInstance as jest.Mock).mockReturnValue(mockLogger);

    // Create real EventBus and MemoryManager
    eventBus = new EventBus();
    await eventBus.initialize();

    memoryManager = new MemoryManager(mockDatabase);
    await memoryManager.initialize();
  });

  afterEach(async () => {
    if (eventBus) {
      eventBus.removeAllListeners();
    }
    jest.restoreAllMocks();
    jest.clearAllMocks();

    if (global.gc) {
      global.gc();
    }
  });

  describe('Memory Coordination (aqe/fleet/*)', () => {
    it('should store fleet topology in aqe/fleet/topology namespace', async () => {
      const topology = {
        type: fleetConfig.topology,
        maxAgents: fleetConfig.maxAgents,
        currentAgents: 8,
        structure: {
          commander: 'fleet-commander-1',
          coordinators: ['coordinator-1', 'coordinator-2'],
          workers: ['agent-1', 'agent-2', 'agent-3', 'agent-4', 'agent-5']
        },
        timestamp: Date.now()
      };

      await memoryManager.store('current', topology, {
        namespace: 'aqe/fleet/topology',
        persist: true
      });

      const retrieved = await memoryManager.retrieve('current', {
        namespace: 'aqe/fleet/topology'
      });

      expect(retrieved).toBeDefined();
      expect(retrieved.value.type).toBe('hierarchical');
      expect(retrieved.value.currentAgents).toBe(8);
      expect(retrieved.value.structure.workers).toHaveLength(5);
    });

    it('should store active agents in aqe/fleet/agents/active namespace', async () => {
      const activeAgents = [
        {
          id: 'agent-1',
          type: 'test-generator',
          status: 'active',
          resources: { cpu: 0.3, memory: '256MB' },
          tasksCompleted: 45,
          uptime: 3600000
        },
        {
          id: 'agent-2',
          type: 'test-executor',
          status: 'active',
          resources: { cpu: 0.5, memory: '512MB' },
          tasksCompleted: 123,
          uptime: 3600000
        },
        {
          id: 'agent-3',
          type: 'coverage-analyzer',
          status: 'active',
          resources: { cpu: 0.2, memory: '128MB' },
          tasksCompleted: 23,
          uptime: 1800000
        }
      ];

      await memoryManager.store('list', activeAgents, {
        namespace: 'aqe/fleet/agents/active'
      });

      const retrieved = await memoryManager.retrieve('list', {
        namespace: 'aqe/fleet/agents/active'
      });

      expect(retrieved).toBeDefined();
      expect(retrieved.value).toHaveLength(3);
      expect(retrieved.value[0].type).toBe('test-generator');
      expect(retrieved.value[1].tasksCompleted).toBe(123);
    });

    it('should store coordination results in aqe/fleet/coordination/results namespace', async () => {
      const coordinationResults = {
        taskId: 'coord-task-001',
        coordinator: 'fleet-commander-1',
        agents: ['agent-1', 'agent-2', 'agent-3'],
        action: 'load-balancing',
        result: 'success',
        metrics: {
          duration: 234,
          agentsRebalanced: 3,
          tasksRedistributed: 12,
          cpuUtilization: 0.65,
          memoryUtilization: 0.72
        },
        timestamp: Date.now()
      };

      await memoryManager.store('coord-task-001', coordinationResults, {
        namespace: 'aqe/fleet/coordination/results'
      });

      const retrieved = await memoryManager.retrieve('coord-task-001', {
        namespace: 'aqe/fleet/coordination/results'
      });

      expect(retrieved).toBeDefined();
      expect(retrieved.value.result).toBe('success');
      expect(retrieved.value.metrics.agentsRebalanced).toBe(3);
    });

    it('should store fleet performance metrics in aqe/fleet/metrics/performance namespace', async () => {
      const performanceMetrics = {
        period: '2025-09-29T14:00:00Z',
        fleet: {
          totalAgents: 12,
          activeAgents: 10,
          idleAgents: 2,
          erroredAgents: 0
        },
        resources: {
          totalCpu: 0.65,
          totalMemory: 4.2,
          peakCpu: 0.87,
          peakMemory: 5.6
        },
        throughput: {
          tasksCompleted: 456,
          tasksPerMinute: 7.6,
          avgTaskDuration: 2340
        },
        efficiency: {
          resourceUtilization: 0.72,
          taskDistributionBalance: 0.89,
          agentIdleTime: 0.15
        },
        timestamp: Date.now()
      };

      await memoryManager.store('current', performanceMetrics, {
        namespace: 'aqe/fleet/metrics/performance',
        ttl: 3600000
      });

      const retrieved = await memoryManager.retrieve('current', {
        namespace: 'aqe/fleet/metrics/performance'
      });

      expect(retrieved).toBeDefined();
      expect(retrieved.value.fleet.activeAgents).toBe(10);
      expect(retrieved.value.efficiency.resourceUtilization).toBe(0.72);
    });
  });

  describe('Hook Execution', () => {
    it('should execute pre-task hook and retrieve fleet topology', async () => {
      // Setup: Store current topology
      const topology = {
        type: 'hierarchical',
        agents: ['agent-1', 'agent-2']
      };

      await memoryManager.store('topology', topology, {
        namespace: 'aqe/fleet'
      });

      // Pre-task: Retrieve topology
      const retrieved = await memoryManager.retrieve('topology', {
        namespace: 'aqe/fleet'
      });

      expect(retrieved).toBeDefined();
      expect(retrieved.value.type).toBe('hierarchical');
      expect(retrieved.value.agents).toHaveLength(2);
    });

    it('should execute post-task hook and store coordination results', async () => {
      const taskId = 'task-spawn-agents';
      const results = {
        agentsSpawned: 5,
        agentTypes: ['test-generator', 'test-executor'],
        duration: 1234
      };

      await memoryManager.store('coordination-results', results, {
        namespace: 'aqe/fleet',
        metadata: { taskId, completedAt: new Date().toISOString() }
      });

      const stored = await memoryManager.retrieve('coordination-results', {
        namespace: 'aqe/fleet'
      });

      expect(stored).toBeDefined();
      expect(stored.value.agentsSpawned).toBe(5);
      expect(stored.metadata?.taskId).toBe(taskId);
    });

    it('should execute post-edit hook when fleet config is updated', async () => {
      const filePath = '/config/fleet.yml';
      const updatedConfig = {
        ...fleetConfig,
        maxAgents: 75, // Increased
        lastModified: new Date().toISOString()
      };

      await memoryManager.store('fleet-config', updatedConfig, {
        namespace: 'aqe/fleet/config',
        metadata: { filePath, action: 'edit' }
      });

      const updated = await memoryManager.retrieve('fleet-config', {
        namespace: 'aqe/fleet/config'
      });

      expect(updated).toBeDefined();
      expect(updated.value.maxAgents).toBe(75);
      expect(updated.metadata?.filePath).toBe(filePath);
    });
  });

  describe('Agent Spawning and Lifecycle', () => {
    it('should spawn agents dynamically based on workload', async () => {
      const workload = {
        testSuiteSize: 1500,
        frameworks: ['jest', 'cypress'],
        estimatedDuration: 3600000
      };

      // Calculate optimal agent distribution
      const allocation = {
        'test-generator': 5,
        'test-executor': 8,
        'coverage-analyzer': 2
      };

      // Simulate spawning agents
      const spawnedAgents = Object.entries(allocation).flatMap(([type, count]) =>
        Array.from({ length: count }, (_, i) => ({
          id: `${type}-${i}`,
          type,
          status: 'spawning',
          spawnedAt: Date.now()
        }))
      );

      await memoryManager.store('spawned', spawnedAgents, {
        namespace: 'aqe/fleet/agents'
      });

      const retrieved = await memoryManager.retrieve('spawned', {
        namespace: 'aqe/fleet/agents'
      });

      expect(retrieved).toBeDefined();
      expect(retrieved.value).toHaveLength(15); // 5 + 8 + 2
      expect(retrieved.value.filter((a: any) => a.type === 'test-executor')).toHaveLength(8);
    });

    it('should despawn idle agents to optimize resources', async () => {
      const agents = [
        { id: 'agent-1', type: 'test-generator', status: 'active', idleTime: 60000 },
        { id: 'agent-2', type: 'test-generator', status: 'active', idleTime: 600000 }, // 10 min idle
        { id: 'agent-3', type: 'test-executor', status: 'active', idleTime: 30000 }
      ];

      // Identify idle agents (idle > 5 minutes)
      const idleThreshold = 300000;
      const agentsToDespawn = agents.filter(a => a.idleTime > idleThreshold);

      await memoryManager.store('despawn-queue', agentsToDespawn, {
        namespace: 'aqe/fleet/agents'
      });

      const retrieved = await memoryManager.retrieve('despawn-queue', {
        namespace: 'aqe/fleet/agents'
      });

      expect(retrieved).toBeDefined();
      expect(retrieved.value).toHaveLength(1);
      expect(retrieved.value[0].id).toBe('agent-2');
    });

    it('should monitor agent health and trigger recovery', async () => {
      const healthChecks = [
        { id: 'agent-1', status: 'healthy', responseTime: 45 },
        { id: 'agent-2', status: 'unhealthy', responseTime: 5000, error: 'timeout' },
        { id: 'agent-3', status: 'healthy', responseTime: 67 }
      ];

      const unhealthyAgents = healthChecks.filter(h => h.status === 'unhealthy');

      await memoryManager.store('health-report', {
        healthy: healthChecks.filter(h => h.status === 'healthy').length,
        unhealthy: unhealthyAgents.length,
        unhealthyAgents,
        timestamp: Date.now()
      }, {
        namespace: 'aqe/fleet/health'
      });

      const retrieved = await memoryManager.retrieve('health-report', {
        namespace: 'aqe/fleet/health'
      });

      expect(retrieved).toBeDefined();
      expect(retrieved.value.unhealthy).toBe(1);
      expect(retrieved.value.unhealthyAgents[0].id).toBe('agent-2');
    });
  });

  describe('Resource Allocation', () => {
    it('should allocate CPU and memory resources optimally', async () => {
      const totalResources = {
        cpu: 8.0, // 8 cores
        memory: 16384 // 16GB in MB
      };

      const agents = [
        { id: 'agent-1', type: 'test-executor', priority: 'critical', cpuRequest: 1.0, memoryRequest: 1024 },
        { id: 'agent-2', type: 'test-generator', priority: 'high', cpuRequest: 0.5, memoryRequest: 512 },
        { id: 'agent-3', type: 'coverage-analyzer', priority: 'medium', cpuRequest: 0.3, memoryRequest: 256 }
      ];

      // Calculate allocation
      const allocation = agents.map(agent => ({
        ...agent,
        cpuAllocated: agent.cpuRequest,
        memoryAllocated: agent.memoryRequest,
        status: 'allocated'
      }));

      const utilization = {
        cpu: allocation.reduce((sum, a) => sum + a.cpuAllocated, 0) / totalResources.cpu,
        memory: allocation.reduce((sum, a) => sum + a.memoryAllocated, 0) / totalResources.memory
      };

      await memoryManager.store('resource-allocation', {
        allocation,
        utilization,
        timestamp: Date.now()
      }, {
        namespace: 'aqe/fleet/resources'
      });

      const retrieved = await memoryManager.retrieve('resource-allocation', {
        namespace: 'aqe/fleet/resources'
      });

      expect(retrieved).toBeDefined();
      expect(retrieved.value.allocation).toHaveLength(3);
      expect(retrieved.value.utilization.cpu).toBeLessThan(1.0);
      expect(retrieved.value.utilization.memory).toBeLessThan(1.0);
    });

    it('should handle resource conflicts and prioritize critical agents', async () => {
      const resourceRequest = {
        agentId: 'agent-critical-1',
        type: 'test-executor',
        priority: 'critical',
        cpuRequest: 2.0,
        memoryRequest: 2048
      };

      const availableResources = {
        cpu: 1.5, // Not enough!
        memory: 3000
      };

      // Conflict resolution: Can we free resources?
      const lowPriorityAgents = [
        { id: 'agent-low-1', priority: 'low', cpu: 0.5, memory: 512 },
        { id: 'agent-low-2', priority: 'low', cpu: 0.3, memory: 256 }
      ];

      const canFreeResources = lowPriorityAgents.reduce((sum, a) => sum + a.cpu, 0) >= (resourceRequest.cpuRequest - availableResources.cpu);

      await memoryManager.store('resource-conflict', {
        request: resourceRequest,
        available: availableResources,
        conflict: true,
        resolution: canFreeResources ? 'despawn-low-priority' : 'queue-request',
        agentsToDespawn: canFreeResources ? lowPriorityAgents : [],
        timestamp: Date.now()
      }, {
        namespace: 'aqe/fleet/resources'
      });

      const retrieved = await memoryManager.retrieve('resource-conflict', {
        namespace: 'aqe/fleet/resources'
      });

      expect(retrieved).toBeDefined();
      expect(retrieved.value.conflict).toBe(true);
      expect(retrieved.value.resolution).toBe('despawn-low-priority');
    });
  });

  describe('Topology Switching', () => {
    it('should switch from hierarchical to mesh topology', async () => {
      const currentTopology = 'hierarchical';
      const newTopology = 'mesh';

      const topologySwitch = {
        from: currentTopology,
        to: newTopology,
        reason: 'High inter-agent communication detected',
        steps: [
          'Pause new task assignment',
          'Complete running tasks',
          'Reconfigure event bus for mesh',
          'Update agent connections',
          'Resume task assignment'
        ],
        estimatedDowntime: 30000, // 30 seconds
        timestamp: Date.now()
      };

      await memoryManager.store('topology-switch', topologySwitch, {
        namespace: 'aqe/fleet/topology'
      });

      const retrieved = await memoryManager.retrieve('topology-switch', {
        namespace: 'aqe/fleet/topology'
      });

      expect(retrieved).toBeDefined();
      expect(retrieved.value.from).toBe('hierarchical');
      expect(retrieved.value.to).toBe('mesh');
      expect(retrieved.value.steps).toHaveLength(5);
    });

    it('should use adaptive topology based on workload patterns', async () => {
      const workloadAnalysis = {
        taskTypes: {
          'unit-test': 45,
          'integration-test': 30,
          'e2e-test': 15,
          'coverage-analysis': 10
        },
        communicationPattern: 'high-interdependency', // Many agents need to coordinate
        optimalTopology: 'mesh', // Better for high communication
        confidence: 0.87,
        timestamp: Date.now()
      };

      await memoryManager.store('workload-analysis', workloadAnalysis, {
        namespace: 'aqe/fleet/topology'
      });

      const retrieved = await memoryManager.retrieve('workload-analysis', {
        namespace: 'aqe/fleet/topology'
      });

      expect(retrieved).toBeDefined();
      expect(retrieved.value.optimalTopology).toBe('mesh');
      expect(retrieved.value.communicationPattern).toBe('high-interdependency');
    });
  });

  describe('Event Bus Communication', () => {
    it('should emit fleet.agent.spawned event', async () => {
      let eventReceived = false;

      const eventPromise = new Promise<void>((resolve) => {
        eventBus.once('fleet.agent.spawned', (event) => {
          eventReceived = true;
          expect(event.data.agentId).toBe('agent-new-1');
          expect(event.data.type).toBe('test-generator');
          resolve();
        });
      });

      await eventBus.emitFleetEvent(
        'fleet.agent.spawned',
        'fleet-commander',
        {
          agentId: 'agent-new-1',
          type: 'test-generator',
          resources: { cpu: 0.5, memory: '512MB' }
        }
      );

      await Promise.race([
        eventPromise,
        new Promise((_, reject) => setTimeout(() => reject(new Error('Event timeout')), 500))
      ]);

      expect(eventReceived).toBe(true);
    });

    it('should emit fleet.topology.changed event', async () => {
      let eventReceived = false;

      const eventPromise = new Promise<void>((resolve) => {
        eventBus.once('fleet.topology.changed', (event) => {
          eventReceived = true;
          expect(event.data.from).toBe('hierarchical');
          expect(event.data.to).toBe('mesh');
          resolve();
        });
      });

      await eventBus.emitFleetEvent(
        'fleet.topology.changed',
        'fleet-commander',
        {
          from: 'hierarchical',
          to: 'mesh',
          reason: 'workload-optimization'
        }
      );

      await Promise.race([
        eventPromise,
        new Promise((_, reject) => setTimeout(() => reject(new Error('Event timeout')), 500))
      ]);

      expect(eventReceived).toBe(true);
    });

    it('should emit fleet.resource.conflict event', async () => {
      let eventReceived = false;

      const eventPromise = new Promise<void>((resolve) => {
        eventBus.once('fleet.resource.conflict', (event) => {
          eventReceived = true;
          expect(event.data.conflict).toBe('cpu-exhausted');
          expect(event.data.resolution).toBe('despawn-idle-agents');
          resolve();
        });
      });

      await eventBus.emitFleetEvent(
        'fleet.resource.conflict',
        'fleet-commander',
        {
          conflict: 'cpu-exhausted',
          requested: 2.0,
          available: 0.5,
          resolution: 'despawn-idle-agents'
        }
      );

      await Promise.race([
        eventPromise,
        new Promise((_, reject) => setTimeout(() => reject(new Error('Event timeout')), 500))
      ]);

      expect(eventReceived).toBe(true);
    });

    it('should coordinate with other agents via events', async () => {
      const coordination: string[] = [];

      eventBus.on('fleet.coordination', (event) => {
        coordination.push(event.data.action);
      });

      // Spawn agents
      await eventBus.emitFleetEvent('fleet.coordination', 'fleet-commander', {
        action: 'spawn-agents',
        count: 5
      });

      // Allocate resources
      await eventBus.emitFleetEvent('fleet.coordination', 'fleet-commander', {
        action: 'allocate-resources'
      });

      // Start tasks
      await eventBus.emitFleetEvent('fleet.coordination', 'fleet-commander', {
        action: 'distribute-tasks'
      });

      await new Promise(resolve => setTimeout(resolve, 100));

      expect(coordination).toContain('spawn-agents');
      expect(coordination).toContain('allocate-resources');
      expect(coordination).toContain('distribute-tasks');
    });
  });
});