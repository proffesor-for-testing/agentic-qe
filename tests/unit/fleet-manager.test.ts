import { jest } from '@jest/globals';
import { FleetManager } from '../../src/core/FleetManager';
import { Agent, AgentStatus } from '../../src/core/Agent';
import { Task, TaskStatus } from '../../src/core/Task';
import { Logger } from '../../src/utils/Logger';
import { Database } from '../../src/utils/Database';
import { EventBus } from '../../src/core/EventBus';
import { QEAgentType, FleetConfig } from '../../src/types';

// Mock the Database module before importing FleetManager
jest.mock('../../src/utils/Database');

// Mock the agents module before importing FleetManager
jest.mock('../../src/agents', () => ({
  createAgent: jest.fn()
}));

// Import the mock after jest.mock() is called
import { mockDatabase } from '../__mocks__/Database';

// Define AgentType enum for tests (mirrors QEAgentType)
enum AgentType {
  UNIT_TEST_GENERATOR = 'unit-test-generator',
  INTEGRATION_TEST_GENERATOR = 'integration-test-generator',
  TEST_EXECUTOR = 'test-executor',
  COVERAGE_ANALYZER = 'coverage-analyzer'
}

// Topology type constants (FleetConfig uses string literals, not enum)
const TopologyType = {
  MESH: 'mesh' as const,
  HIERARCHICAL: 'hierarchical' as const,
  RING: 'ring' as const,
  ADAPTIVE: 'adaptive' as const,
  STAR: 'ring' as const // Using 'ring' as fallback since 'star' isn't in FleetConfig
}

// London School TDD: Mock all dependencies
const mockLogger = {
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
  getInstance: jest.fn()
} as unknown as jest.Mocked<Logger>;

// Mock Logger.getInstance to return our mock
(Logger.getInstance as jest.Mock) = jest.fn(() => mockLogger);

const mockEventBus = {
  initialize: jest.fn().mockResolvedValue(undefined),
  emit: jest.fn(),
  on: jest.fn(),
  off: jest.fn(),
  once: jest.fn(),
  removeAllListeners: jest.fn()
} as unknown as jest.Mocked<EventBus>;

const mockMetricsCollector = {
  recordMetric: jest.fn().mockResolvedValue(undefined),
  getMetrics: jest.fn().mockReturnValue({}),
  incrementCounter: jest.fn(),
  recordHistogram: jest.fn(),
  recordGauge: jest.fn()
};

const mockAgentFactory = {
  createAgent: jest.fn().mockResolvedValue({
    id: 'test-agent-123',
    type: QEAgentType.TEST_GENERATOR,
    status: AgentStatus.IDLE,
    start: jest.fn().mockResolvedValue(true),
    stop: jest.fn().mockResolvedValue(true)
  })
};

const mockAgent = {
  id: 'test-agent-123',
  type: QEAgentType.TEST_GENERATOR,
  status: AgentStatus.IDLE,
  capabilities: ['jest', 'typescript'],
  start: jest.fn().mockResolvedValue(true),
  stop: jest.fn().mockResolvedValue(true),
  execute: jest.fn().mockResolvedValue({ success: true }),
  getStatus: jest.fn().mockReturnValue(AgentStatus.IDLE),
  getId: jest.fn().mockReturnValue('test-agent-123'),
  initialize: jest.fn().mockResolvedValue(undefined),
  assignTask: jest.fn().mockResolvedValue(undefined),
  canHandleTaskType: jest.fn().mockReturnValue(true)
} as unknown as jest.Mocked<Agent>;

describe('FleetManager - London School TDD', () => {
  let fleetManager: FleetManager;
  let mockConfig: FleetConfig;
  let createAgentMock: jest.Mock;

  beforeEach(async () => {
    jest.clearAllMocks();

    // Reset the mocks
    (mockDatabase.initialize as jest.Mock).mockResolvedValue(undefined);
    (mockEventBus.initialize as jest.Mock).mockResolvedValue(undefined);

    // Create a basic fleet config
    mockConfig = {
      agents: [
        { type: 'test-generator', count: 2, config: {} },
        { type: 'test-executor', count: 1, config: {} }
      ],
      topology: 'hierarchical' as const,
      maxAgents: 8
    };

    // Setup createAgent mock
    const agentsModule = await import('../../src/agents');
    createAgentMock = agentsModule.createAgent as jest.Mock;
    createAgentMock.mockResolvedValue(mockAgent);

    fleetManager = new FleetManager(mockConfig);

    // Replace internal dependencies with mocks
    (fleetManager as any).database = mockDatabase;
    (fleetManager as any).eventBus = mockEventBus;
    (fleetManager as any).logger = mockLogger;
  });

  describe('Fleet Initialization', () => {
    it('should initialize fleet with database and event bus', async () => {
      await fleetManager.initialize();

      // Verify database initialization
      expect(mockDatabase.initialize).toHaveBeenCalled();

      // Verify event bus initialization
      expect(mockEventBus.initialize).toHaveBeenCalled();

      // Verify logging
      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining('Initializing Fleet Manager')
      );
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Fleet Manager initialized successfully'
      );
    });

    it('should handle initialization failure gracefully', async () => {
      const initError = new Error('Database connection failed');
      (mockDatabase.initialize as jest.Mock).mockRejectedValueOnce(initError);

      await expect(fleetManager.initialize())
        .rejects.toThrow('Database connection failed');

      expect(mockLogger.error).toHaveBeenCalledWith(
        'Failed to initialize Fleet Manager:',
        initError
      );
    });

    it('should create initial agent pool from configuration', async () => {
      await fleetManager.initialize();

      // Verify createAgent was called for each agent in config
      // (2 test-generators + 1 test-executor = 3 agents)
      expect(createAgentMock).toHaveBeenCalledTimes(3);

      // Verify successful initialization
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Fleet Manager initialized successfully'
      );
    });
  });

  describe('Agent Spawning', () => {
    beforeEach(async () => {
      await fleetManager.initialize({
        topology: 'hierarchical' as const,
        maxAgents: 8,
        strategy: 'balanced'
      });
    });

    it('should spawn unit test generator agent with jest specialization', async () => {
      const agentConfig = {
        type: QEAgentType.TEST_GENERATOR,
        specialization: 'jest',
        capabilities: ['typescript', 'mocking', 'coverage'],
        resources: { cpu: 2, memory: 1024 }
      };

      const agentId = await fleetManager.spawnAgent(agentConfig);

      // Verify agent creation collaboration
      expect(mockAgentFactory.createAgent).toHaveBeenCalledWith(
        expect.objectContaining({
          type: QEAgentType.TEST_GENERATOR,
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
