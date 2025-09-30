import { jest } from '@jest/globals';
import { FleetManager, AgentType, TopologyType } from '../../src/core/fleet-manager';
import { Agent } from '../../src/core/agent';
import { Logger } from '../../src/utils/logger';
import { MetricsCollector } from '../../src/utils/metrics';

// London School TDD: Mock all dependencies
const mockLogger = {
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn()
} as jest.Mocked<Logger>;

const mockMetricsCollector = {
  recordMetric: jest.fn(),
  getMetrics: jest.fn(),
  clearMetrics: jest.fn()
} as jest.Mocked<MetricsCollector>;

const mockAgent = {
  id: 'test-agent-123',
  type: AgentType.UNIT_TEST_GENERATOR,
  status: 'idle',
  capabilities: ['jest', 'typescript'],
  start: jest.fn().mockResolvedValue(true),
  stop: jest.fn().mockResolvedValue(true),
  execute: jest.fn().mockResolvedValue({ success: true }),
  getStatus: jest.fn().mockReturnValue('idle')
} as jest.Mocked<Agent>;

// Mock agent factory
const mockAgentFactory = {
  createAgent: jest.fn().mockReturnValue(mockAgent)
};

describe('FleetManager - London School TDD', () => {
  let fleetManager: FleetManager;
  
  beforeEach(() => {
    jest.clearAllMocks();
    fleetManager = new FleetManager({
      logger: mockLogger,
      metricsCollector: mockMetricsCollector,
      agentFactory: mockAgentFactory
    });
  });

  describe('Fleet Initialization', () => {
    it('should initialize fleet with hierarchical topology', async () => {
      const initConfig = {
        topology: TopologyType.HIERARCHICAL,
        maxAgents: 8,
        strategy: 'balanced'
      };

      await fleetManager.initialize(initConfig);

      // Verify interactions (London School focus)
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Initializing QE fleet with hierarchical topology'
      );
      expect(mockMetricsCollector.recordMetric).toHaveBeenCalledWith(
        'fleet.initialization',
        expect.objectContaining({ topology: 'hierarchical' })
      );
      
      // Verify state change through behavior
      expect(fleetManager.getTopology()).toBe(TopologyType.HIERARCHICAL);
      expect(fleetManager.getMaxAgents()).toBe(8);
    });

    it('should initialize fleet with mesh topology for complex integration', async () => {
      const initConfig = {
        topology: TopologyType.MESH,
        maxAgents: 12,
        strategy: 'specialized'
      };

      await fleetManager.initialize(initConfig);

      expect(mockLogger.info).toHaveBeenCalledWith(
        'Initializing QE fleet with mesh topology'
      );
      expect(fleetManager.getTopology()).toBe(TopologyType.MESH);
    });

    it('should reject initialization with invalid configuration', async () => {
      const invalidConfig = {
        topology: 'invalid' as TopologyType,
        maxAgents: -1,
        strategy: 'unknown'
      };

      await expect(fleetManager.initialize(invalidConfig))
        .rejects.toThrow('Invalid fleet configuration');
      
      expect(mockLogger.error).toHaveBeenCalledWith(
        'Fleet initialization failed: Invalid configuration'
      );
    });
  });

  describe('Agent Spawning', () => {
    beforeEach(async () => {
      await fleetManager.initialize({
        topology: TopologyType.HIERARCHICAL,
        maxAgents: 8,
        strategy: 'balanced'
      });
    });

    it('should spawn unit test generator agent with jest specialization', async () => {
      const agentConfig = {
        type: AgentType.UNIT_TEST_GENERATOR,
        specialization: 'jest',
        capabilities: ['typescript', 'mocking', 'coverage'],
        resources: { cpu: 2, memory: 1024 }
      };

      const agentId = await fleetManager.spawnAgent(agentConfig);

      // Verify agent creation collaboration
      expect(mockAgentFactory.createAgent).toHaveBeenCalledWith(
        expect.objectContaining({
          type: AgentType.UNIT_TEST_GENERATOR,
          specialization: 'jest'
        })
      );
      
      // Verify agent startup sequence
      expect(mockAgent.start).toHaveBeenCalled();
      
      // Verify logging interactions
      expect(mockLogger.info).toHaveBeenCalledWith(
        `Spawned agent ${agentId} of type unit-test-generator`
      );
      
      // Verify metrics recording
      expect(mockMetricsCollector.recordMetric).toHaveBeenCalledWith(
        'agent.spawned',
        expect.objectContaining({ type: 'unit-test-generator' })
      );
      
      expect(agentId).toBe('test-agent-123');
    });

    it('should spawn integration test generator with api specialization', async () => {
      const agentConfig = {
        type: AgentType.INTEGRATION_TEST_GENERATOR,
        specialization: 'api',
        capabilities: ['rest', 'graphql', 'contract-testing']
      };

      const agentId = await fleetManager.spawnAgent(agentConfig);

      expect(mockAgentFactory.createAgent).toHaveBeenCalledWith(
        expect.objectContaining({
          type: AgentType.INTEGRATION_TEST_GENERATOR,
          specialization: 'api'
        })
      );
      expect(agentId).toBeTruthy();
    });

    it('should reject spawning when fleet is at capacity', async () => {
      // Fill fleet to capacity
      const promises = [];
      for (let i = 0; i < 8; i++) {
        promises.push(fleetManager.spawnAgent({
          type: AgentType.UNIT_TEST_GENERATOR,
          specialization: 'jest'
        }));
      }
      await Promise.all(promises);

      // Attempt to spawn one more
      await expect(fleetManager.spawnAgent({
        type: AgentType.UNIT_TEST_GENERATOR,
        specialization: 'jest'
      })).rejects.toThrow('Fleet at maximum capacity');
      
      expect(mockLogger.warn).toHaveBeenCalledWith(
        'Cannot spawn agent: fleet at maximum capacity (8)'
      );
    });

    it('should handle agent startup failure gracefully', async () => {
      mockAgent.start.mockRejectedValueOnce(new Error('Startup failed'));
      
      await expect(fleetManager.spawnAgent({
        type: AgentType.UNIT_TEST_GENERATOR,
        specialization: 'jest'
      })).rejects.toThrow('Agent startup failed');
      
      expect(mockLogger.error).toHaveBeenCalledWith(
        'Agent startup failed: Startup failed'
      );
    });
  });

  describe('Fleet Coordination', () => {
    beforeEach(async () => {
      await fleetManager.initialize({
        topology: TopologyType.MESH,
        maxAgents: 6,
        strategy: 'adaptive'
      });
    });

    it('should coordinate task distribution across available agents', async () => {
      // Spawn multiple agents
      await fleetManager.spawnAgent({ type: AgentType.UNIT_TEST_GENERATOR, specialization: 'jest' });
      await fleetManager.spawnAgent({ type: AgentType.INTEGRATION_TEST_GENERATOR, specialization: 'api' });
      
      const task = {
        id: 'task-123',
        type: 'test-generation',
        target: 'user-service',
        requirements: { coverage: 90 }
      };

      await fleetManager.distributeTask(task);
      
      // Verify task distribution behavior
      expect(mockLogger.info).toHaveBeenCalledWith(
        `Distributing task ${task.id} across mesh topology`
      );
      expect(mockMetricsCollector.recordMetric).toHaveBeenCalledWith(
        'task.distributed',
        expect.objectContaining({ taskId: 'task-123' })
      );
    });

    it('should handle agent failure during task execution', async () => {
      await fleetManager.spawnAgent({ type: AgentType.UNIT_TEST_GENERATOR, specialization: 'jest' });
      
      // Mock agent failure
      mockAgent.execute.mockRejectedValueOnce(new Error('Agent crashed'));
      
      const task = { id: 'task-456', type: 'test-execution' };
      
      const result = await fleetManager.distributeTask(task);
      
      expect(result.success).toBe(false);
      expect(mockLogger.error).toHaveBeenCalledWith(
        'Task execution failed on agent test-agent-123: Agent crashed'
      );
    });
  });

  describe('Fleet Status and Metrics', () => {
    it('should provide comprehensive fleet status', () => {
      const status = fleetManager.getFleetStatus();
      
      expect(status).toEqual({
        topology: expect.any(String),
        totalAgents: expect.any(Number),
        activeAgents: expect.any(Number),
        idleAgents: expect.any(Number),
        health: expect.any(String)
      });
      
      expect(mockMetricsCollector.getMetrics).toHaveBeenCalled();
    });

    it('should calculate fleet efficiency metrics', () => {
      const efficiency = fleetManager.calculateEfficiency();
      
      expect(efficiency).toEqual({
        resourceUtilization: expect.any(Number),
        taskCompletionRate: expect.any(Number),
        coordinationOverhead: expect.any(Number),
        qualityScore: expect.any(Number)
      });
    });
  });

  describe('Fleet Shutdown', () => {
    it('should gracefully shutdown all agents', async () => {
      await fleetManager.initialize({ topology: TopologyType.RING, maxAgents: 4 });
      await fleetManager.spawnAgent({ type: AgentType.UNIT_TEST_GENERATOR, specialization: 'jest' });
      
      await fleetManager.shutdown();
      
      // Verify shutdown sequence
      expect(mockAgent.stop).toHaveBeenCalled();
      expect(mockLogger.info).toHaveBeenCalledWith('Fleet shutdown completed');
      expect(mockMetricsCollector.recordMetric).toHaveBeenCalledWith(
        'fleet.shutdown',
        expect.objectContaining({ graceful: true })
      );
    });

    it('should handle agent shutdown failures', async () => {
      await fleetManager.initialize({ topology: TopologyType.STAR, maxAgents: 2 });
      await fleetManager.spawnAgent({ type: AgentType.UNIT_TEST_GENERATOR, specialization: 'jest' });
      
      mockAgent.stop.mockRejectedValueOnce(new Error('Shutdown timeout'));
      
      await fleetManager.shutdown();
      
      expect(mockLogger.warn).toHaveBeenCalledWith(
        'Agent test-agent-123 failed to shutdown gracefully: Shutdown timeout'
      );
    });
  });
});

// Contract tests for fleet manager interfaces
describe('FleetManager Contracts', () => {
  it('should satisfy IFleetManager interface contract', () => {
    const fleetManager = new FleetManager({
      logger: mockLogger,
      metricsCollector: mockMetricsCollector,
      agentFactory: mockAgentFactory
    });
    
    // Verify interface compliance
    expect(typeof fleetManager.initialize).toBe('function');
    expect(typeof fleetManager.spawnAgent).toBe('function');
    expect(typeof fleetManager.distributeTask).toBe('function');
    expect(typeof fleetManager.getFleetStatus).toBe('function');
    expect(typeof fleetManager.shutdown).toBe('function');
  });
});
