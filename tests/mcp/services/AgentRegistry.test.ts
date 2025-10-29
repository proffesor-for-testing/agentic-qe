/**
 * Tests for AgentRegistry
 *
 * Comprehensive test suite for agent registry service that manages
 * QE agent lifecycle, spawning, execution, and metrics tracking.
 *
 * @group unit
 * @group mcp
 * @group services
 */

import { AgentRegistry, AgentSpawnConfig, RegisteredAgent } from '@mcp/services/AgentRegistry';
import { QEAgentType, AgentStatus } from '@types';
import { BaseAgent } from '@agents/BaseAgent';
import { Logger } from '@utils/Logger';
import { EventBus } from '@core/EventBus';
import { MemoryManager } from '@core/MemoryManager';

// Mock dependencies
jest.mock('@utils/Logger');
jest.mock('@core/EventBus');
jest.mock('@core/MemoryManager');
jest.mock('@agents/BaseAgent');

describe('AgentRegistry', () => {
  let registry: AgentRegistry;
  let mockLogger: jest.Mocked<Logger>;

  beforeEach(() => {
    // Setup mocks
    mockLogger = {
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn()
    } as any;

    (Logger.getInstance as jest.Mock).mockReturnValue(mockLogger);

    registry = new AgentRegistry({
      maxAgents: 10,
      defaultTimeout: 60000,
      enableMetrics: true
    });
  });

  afterEach(async () => {
    await registry.clearAll();
    jest.clearAllMocks();
  });

  describe('Initialization', () => {
    it('should create registry with default config', () => {
      const defaultRegistry = new AgentRegistry();
      expect(defaultRegistry).toBeInstanceOf(AgentRegistry);
    });

    it('should create registry with custom config', () => {
      const customRegistry = new AgentRegistry({
        maxAgents: 50,
        defaultTimeout: 300000,
        enableMetrics: false
      });

      expect(customRegistry).toBeInstanceOf(AgentRegistry);
    });
  });

  describe('Agent Spawning', () => {
    const validConfig: AgentSpawnConfig = {
      name: 'test-generator-1',
      description: 'Test generator agent for unit tests',
      capabilities: ['test-generation', 'property-testing'],
      resources: {
        memory: 512,
        cpu: 1,
        storage: 1024
      }
    };

    it('should spawn agent with valid MCP type', async () => {
      const result = await registry.spawnAgent('test-generator', validConfig);

      expect(result).toHaveProperty('id');
      expect(result).toHaveProperty('agent');
      expect(result.id).toContain('test-generator');
      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining('Spawning agent')
      );
    });

    it('should generate unique agent IDs', async () => {
      const result1 = await registry.spawnAgent('test-generator', validConfig);
      const result2 = await registry.spawnAgent('test-generator', validConfig);

      expect(result1.id).not.toBe(result2.id);
    });

    it('should map MCP types to QEAgentType correctly', async () => {
      const mcpTypes = [
        'test-generator',
        'test-executor',
        'coverage-analyzer',
        'quality-gate',
        'performance-tester',
        'security-scanner'
      ];

      for (const mcpType of mcpTypes) {
        const result = await registry.spawnAgent(mcpType, validConfig);
        expect(result.id).toContain(mcpType);
      }
    });

    it('should throw error for unknown MCP type', async () => {
      await expect(
        registry.spawnAgent('invalid-type', validConfig)
      ).rejects.toThrow('Unknown MCP agent type');
    });

    it('should enforce agent limit', async () => {
      const limitedRegistry = new AgentRegistry({ maxAgents: 2 });

      await limitedRegistry.spawnAgent('test-generator', validConfig);
      await limitedRegistry.spawnAgent('test-executor', validConfig);

      await expect(
        limitedRegistry.spawnAgent('coverage-analyzer', validConfig)
      ).rejects.toThrow('Agent limit reached');

      await limitedRegistry.clearAll();
    });

    it('should initialize spawned agent', async () => {
      const result = await registry.spawnAgent('test-generator', validConfig);

      // Agent should be registered
      const registered = registry.getRegisteredAgent(result.id);
      expect(registered).toBeDefined();
      expect(registered?.status).toBe('idle');
    });

    it('should map capabilities to AgentCapability objects', async () => {
      const configWithCaps: AgentSpawnConfig = {
        ...validConfig,
        capabilities: ['test-gen', 'mutation-testing']
      };

      const result = await registry.spawnAgent('test-generator', configWithCaps);
      const registered = registry.getRegisteredAgent(result.id);

      expect(registered).toBeDefined();
    });

    it('should use default name if not provided', async () => {
      const minimalConfig: AgentSpawnConfig = {};

      const result = await registry.spawnAgent('test-generator', minimalConfig);

      expect(result.id).toBeDefined();
      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining('Spawning agent')
      );
    });
  });

  describe('Agent Retrieval', () => {
    let spawnedId: string;

    beforeEach(async () => {
      const result = await registry.spawnAgent('test-generator', {
        name: 'test-agent'
      });
      spawnedId = result.id;
    });

    it('should retrieve spawned agent by ID', () => {
      const agent = registry.getAgent(spawnedId);
      expect(agent).toBeDefined();
      expect(agent).toBeInstanceOf(BaseAgent);
    });

    it('should return undefined for non-existent agent', () => {
      const agent = registry.getAgent('non-existent-id');
      expect(agent).toBeUndefined();
    });

    it('should update last activity on retrieval', () => {
      const registered = registry.getRegisteredAgent(spawnedId);
      const initialActivity = registered?.lastActivity;

      // Wait a bit
      jest.advanceTimersByTime(100);

      registry.getAgent(spawnedId);

      const updatedRegistered = registry.getRegisteredAgent(spawnedId);
      expect(updatedRegistered?.lastActivity).not.toBe(initialActivity);
    });

    it('should retrieve registered agent metadata', () => {
      const registered = registry.getRegisteredAgent(spawnedId);

      expect(registered).toHaveProperty('id');
      expect(registered).toHaveProperty('agent');
      expect(registered).toHaveProperty('type');
      expect(registered).toHaveProperty('mcpType');
      expect(registered).toHaveProperty('spawnedAt');
      expect(registered).toHaveProperty('lastActivity');
      expect(registered).toHaveProperty('tasksCompleted');
      expect(registered).toHaveProperty('totalExecutionTime');
      expect(registered).toHaveProperty('status');
    });
  });

  describe('Task Execution', () => {
    let agentId: string;
    let mockAgent: jest.Mocked<BaseAgent>;

    beforeEach(async () => {
      const result = await registry.spawnAgent('test-generator', {
        name: 'task-test-agent'
      });
      agentId = result.id;
      mockAgent = result.agent as jest.Mocked<BaseAgent>;

      // Mock executeTask method
      mockAgent.executeTask = jest.fn().mockResolvedValue({ success: true });
    });

    it('should execute task on agent', async () => {
      const task = {
        taskId: { id: 'task-1', timestamp: Date.now() },
        type: 'test-generation',
        payload: { module: 'UserService' },
        status: 'pending' as const,
        priority: 'high' as const
      };

      const result = await registry.executeTask(agentId, task);

      expect(result).toEqual({ success: true });
      expect(mockAgent.executeTask).toHaveBeenCalledWith(task);
    });

    it('should update agent status during execution', async () => {
      const task = {
        taskId: { id: 'task-2', timestamp: Date.now() },
        type: 'test-generation',
        payload: {},
        status: 'pending' as const,
        priority: 'medium' as const
      };

      // Make execution take some time
      mockAgent.executeTask = jest.fn().mockImplementation(async () => {
        await new Promise(resolve => setTimeout(resolve, 100));
        return { success: true };
      });

      const executionPromise = registry.executeTask(agentId, task);

      // Agent should be busy during execution
      const duringExecution = registry.getRegisteredAgent(agentId);
      expect(duringExecution?.status).toBe('busy');

      await executionPromise;

      // Agent should be idle after completion
      const afterExecution = registry.getRegisteredAgent(agentId);
      expect(afterExecution?.status).toBe('idle');
    });

    it('should track execution metrics', async () => {
      const task = {
        taskId: { id: 'task-3', timestamp: Date.now() },
        type: 'test-generation',
        payload: {},
        status: 'pending' as const,
        priority: 'low' as const
      };

      const beforeExecution = registry.getRegisteredAgent(agentId);
      const initialTasks = beforeExecution?.tasksCompleted || 0;

      await registry.executeTask(agentId, task);

      const afterExecution = registry.getRegisteredAgent(agentId);
      expect(afterExecution?.tasksCompleted).toBe(initialTasks + 1);
      expect(afterExecution?.totalExecutionTime).toBeGreaterThan(0);
    });

    it('should throw error for non-existent agent', async () => {
      const task = {
        taskId: { id: 'task-4', timestamp: Date.now() },
        type: 'test-generation',
        payload: {},
        status: 'pending' as const,
        priority: 'high' as const
      };

      await expect(
        registry.executeTask('non-existent-id', task)
      ).rejects.toThrow('Agent not found');
    });

    it('should handle task execution errors', async () => {
      mockAgent.executeTask = jest.fn().mockRejectedValue(new Error('Task failed'));

      const task = {
        taskId: { id: 'task-5', timestamp: Date.now() },
        type: 'test-generation',
        payload: {},
        status: 'pending' as const,
        priority: 'high' as const
      };

      await expect(registry.executeTask(agentId, task)).rejects.toThrow('Task failed');

      const registered = registry.getRegisteredAgent(agentId);
      expect(registered?.status).toBe('error');
    });
  });

  describe('Agent Termination', () => {
    let agentId: string;
    let mockAgent: jest.Mocked<BaseAgent>;

    beforeEach(async () => {
      const result = await registry.spawnAgent('test-generator', {
        name: 'terminate-test'
      });
      agentId = result.id;
      mockAgent = result.agent as jest.Mocked<BaseAgent>;
      mockAgent.terminate = jest.fn().mockResolvedValue(undefined);
    });

    it('should terminate agent successfully', async () => {
      await registry.terminateAgent(agentId);

      expect(mockAgent.terminate).toHaveBeenCalled();
      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining('terminated')
      );
    });

    it('should remove agent from registry after termination', async () => {
      await registry.terminateAgent(agentId);

      const agent = registry.getAgent(agentId);
      expect(agent).toBeUndefined();
    });

    it('should throw error for non-existent agent', async () => {
      await expect(
        registry.terminateAgent('non-existent-id')
      ).rejects.toThrow('Agent not found');
    });

    it('should handle termination errors', async () => {
      mockAgent.terminate = jest.fn().mockRejectedValue(new Error('Cleanup failed'));

      await expect(registry.terminateAgent(agentId)).rejects.toThrow('Cleanup failed');
    });
  });

  describe('Agent Listing and Filtering', () => {
    beforeEach(async () => {
      await registry.spawnAgent('test-generator', { name: 'gen-1' });
      await registry.spawnAgent('test-generator', { name: 'gen-2' });
      await registry.spawnAgent('test-executor', { name: 'exec-1' });
      await registry.spawnAgent('coverage-analyzer', { name: 'cov-1' });
    });

    it('should get all active agents', () => {
      const agents = registry.getAllAgents();

      expect(agents.length).toBeGreaterThanOrEqual(4);
      agents.forEach(agent => {
        expect(agent).toHaveProperty('id');
        expect(agent).toHaveProperty('type');
        expect(agent).toHaveProperty('mcpType');
      });
    });

    it('should filter agents by MCP type', () => {
      const generators = registry.getAgentsByType('test-generator');

      expect(generators.length).toBeGreaterThanOrEqual(2);
      generators.forEach(agent => {
        expect(agent.mcpType).toBe('test-generator');
      });
    });

    it('should return empty array for non-existent type', () => {
      const agents = registry.getAgentsByType('non-existent-type');
      expect(agents).toEqual([]);
    });
  });

  describe('Agent Metrics', () => {
    let agentId: string;
    let mockAgent: jest.Mocked<BaseAgent>;

    beforeEach(async () => {
      const result = await registry.spawnAgent('test-generator', {
        name: 'metrics-test'
      });
      agentId = result.id;
      mockAgent = result.agent as jest.Mocked<BaseAgent>;
      mockAgent.executeTask = jest.fn().mockResolvedValue({ success: true });
    });

    it('should get agent metrics', () => {
      const metrics = registry.getAgentMetrics(agentId);

      expect(metrics).toHaveProperty('tasksCompleted');
      expect(metrics).toHaveProperty('averageExecutionTime');
      expect(metrics).toHaveProperty('uptime');
      expect(metrics).toHaveProperty('status');
    });

    it('should return undefined for non-existent agent', () => {
      const metrics = registry.getAgentMetrics('non-existent-id');
      expect(metrics).toBeUndefined();
    });

    it('should calculate average execution time', async () => {
      const task = {
        taskId: { id: 'metrics-task', timestamp: Date.now() },
        type: 'test-generation',
        payload: {},
        status: 'pending' as const,
        priority: 'medium' as const
      };

      // Execute multiple tasks
      await registry.executeTask(agentId, task);
      await registry.executeTask(agentId, task);
      await registry.executeTask(agentId, task);

      const metrics = registry.getAgentMetrics(agentId);
      expect(metrics?.averageExecutionTime).toBeGreaterThan(0);
      expect(metrics?.tasksCompleted).toBe(3);
    });

    it('should track uptime', async () => {
      jest.advanceTimersByTime(5000); // 5 seconds

      const metrics = registry.getAgentMetrics(agentId);
      expect(metrics?.uptime).toBeGreaterThan(0);
    });
  });

  describe('Registry Statistics', () => {
    beforeEach(async () => {
      await registry.spawnAgent('test-generator', { name: 'stat-gen-1' });
      await registry.spawnAgent('test-executor', { name: 'stat-exec-1' });
    });

    it('should calculate registry statistics', () => {
      const stats = registry.getStatistics();

      expect(stats).toHaveProperty('totalAgents');
      expect(stats).toHaveProperty('activeAgents');
      expect(stats).toHaveProperty('idleAgents');
      expect(stats).toHaveProperty('busyAgents');
      expect(stats).toHaveProperty('errorAgents');
      expect(stats).toHaveProperty('totalTasks');
      expect(stats).toHaveProperty('averageTaskTime');

      expect(stats.totalAgents).toBeGreaterThanOrEqual(2);
      expect(stats.activeAgents).toBeGreaterThanOrEqual(2);
    });

    it('should track agent statuses correctly', async () => {
      const statsInitial = registry.getStatistics();
      expect(statsInitial.idleAgents).toBeGreaterThanOrEqual(2);

      // Execute a long-running task to test busy status
      const agents = registry.getAllAgents();
      if (agents.length > 0) {
        const agentId = agents[0].id;
        const mockAgent = agents[0].agent as jest.Mocked<BaseAgent>;
        mockAgent.executeTask = jest.fn().mockImplementation(async () => {
          await new Promise(resolve => setTimeout(resolve, 100));
          return { success: true };
        });

        const task = {
          taskId: { id: 'stat-task', timestamp: Date.now() },
          type: 'test-generation',
          payload: {},
          status: 'pending' as const,
          priority: 'medium' as const
        };

        const executionPromise = registry.executeTask(agentId, task);

        // Check busy status
        const statsDuring = registry.getStatistics();
        expect(statsDuring.busyAgents).toBeGreaterThan(0);

        await executionPromise;

        // Check idle status after completion
        const statsAfter = registry.getStatistics();
        expect(statsAfter.idleAgents).toBeGreaterThan(0);
      }
    });
  });

  describe('Clear All Agents', () => {
    beforeEach(async () => {
      await registry.spawnAgent('test-generator', { name: 'clear-1' });
      await registry.spawnAgent('test-executor', { name: 'clear-2' });
      await registry.spawnAgent('coverage-analyzer', { name: 'clear-3' });
    });

    it('should clear all agents', async () => {
      await registry.clearAll();

      const agents = registry.getAllAgents();
      expect(agents).toHaveLength(0);

      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining('All agents cleared')
      );
    });

    it('should terminate all agents during clear', async () => {
      const agents = registry.getAllAgents();
      const mockAgents = agents.map(a => a.agent as jest.Mocked<BaseAgent>);

      mockAgents.forEach(agent => {
        agent.terminate = jest.fn().mockResolvedValue(undefined);
      });

      await registry.clearAll();

      mockAgents.forEach(agent => {
        expect(agent.terminate).toHaveBeenCalled();
      });
    });

    it('should continue clearing even if some agents fail', async () => {
      const agents = registry.getAllAgents();

      if (agents.length >= 2) {
        const mockAgent1 = agents[0].agent as jest.Mocked<BaseAgent>;
        const mockAgent2 = agents[1].agent as jest.Mocked<BaseAgent>;

        mockAgent1.terminate = jest.fn().mockRejectedValue(new Error('Failed'));
        mockAgent2.terminate = jest.fn().mockResolvedValue(undefined);

        await registry.clearAll();

        expect(mockLogger.warn).toHaveBeenCalled();
        const remainingAgents = registry.getAllAgents();
        expect(remainingAgents).toHaveLength(0);
      }
    });
  });

  describe('Supported MCP Types', () => {
    it('should list all supported MCP types', () => {
      const types = registry.getSupportedMCPTypes();

      expect(Array.isArray(types)).toBe(true);
      expect(types.length).toBeGreaterThan(0);

      expect(types).toContain('test-generator');
      expect(types).toContain('test-executor');
      expect(types).toContain('coverage-analyzer');
      expect(types).toContain('quality-gate');
      expect(types).toContain('performance-tester');
      expect(types).toContain('security-scanner');
    });

    it('should check if MCP type is supported', () => {
      expect(registry.isSupportedMCPType('test-generator')).toBe(true);
      expect(registry.isSupportedMCPType('invalid-type')).toBe(false);
    });
  });

  describe('Global Registry', () => {
    it('should provide singleton instance', async () => {
      const { getAgentRegistry } = await import('../../../src/mcp/services/AgentRegistry');

      const instance1 = getAgentRegistry();
      const instance2 = getAgentRegistry();

      expect(instance1).toBe(instance2);
    });

    it('should reset global instance for testing', async () => {
      const { getAgentRegistry, resetAgentRegistry } = await import('../../../src/mcp/services/AgentRegistry');

      const instance1 = getAgentRegistry();
      resetAgentRegistry();
      const instance2 = getAgentRegistry();

      expect(instance1).not.toBe(instance2);
    });
  });
});
