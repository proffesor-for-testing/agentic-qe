/**
 * BaseAgent AgentDB Integration Tests
 *
 * Tests for BaseAgent lifecycle with optional AgentDB features
 * Coverage target: 95%+
 *
 * Test scenarios:
 * 1. BaseAgent initialization with AgentDB enabled
 * 2. BaseAgent initialization with AgentDB disabled (backward compatibility)
 * 3. Neural training lifecycle hooks
 * 4. QUIC synchronization during agent operations
 * 5. Memory persistence and retrieval
 * 6. Error handling and graceful degradation
 */

import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import { BaseAgent } from '../../../src/agents/core/BaseAgent.js';
import { AgentDBManager } from '../../../src/core/memory/AgentDBManager.js';
import { AgentId, TaskAssignment } from '../../../src/types/agent.types.js';
import { EventBus } from '../../../src/core/EventBus.js';
import { MemoryManager } from '../../../src/core/MemoryManager.js';

// Mock AgentDB module
jest.mock('agentdb');

describe('BaseAgent AgentDB Integration', () => {
  let agent: BaseAgent;
  let eventBus: EventBus;
  let memoryManager: MemoryManager;
  let agentDBManager: AgentDBManager;

  beforeEach(() => {
    jest.clearAllMocks();
    eventBus = new EventBus();
    memoryManager = new MemoryManager();
  });

  afterEach(async () => {
    if (agent) {
      await agent.shutdown();
    }
    if (agentDBManager) {
      await agentDBManager.shutdown();
    }
  });

  describe('Initialization with AgentDB Enabled', () => {
    beforeEach(async () => {
      agentDBManager = new AgentDBManager({
        enabled: true,
        dbPath: ':memory:',
      });
      await agentDBManager.initialize();
    });

    it('should initialize BaseAgent with AgentDB support', async () => {
      // Arrange
      const agentId: AgentId = {
        type: 'test-agent',
        instanceId: 'test-001',
      };

      // Act
      agent = new BaseAgent(agentId, eventBus, memoryManager, {
        agentDBManager,
      });
      await agent.initialize();

      // Assert
      expect(agent.isInitialized()).toBe(true);
      expect(agentDBManager.isEnabled()).toBe(true);
    });

    it('should store neural training data during task execution', async () => {
      // Arrange
      const agentId: AgentId = {
        type: 'test-agent',
        instanceId: 'test-001',
      };

      agent = new BaseAgent(agentId, eventBus, memoryManager, {
        agentDBManager,
      });
      await agent.initialize();

      const task: TaskAssignment = {
        id: 'task-001',
        task: {
          id: 'task-001',
          description: 'Test task',
          priority: 'medium',
          metadata: {},
        },
        assignedAt: new Date(),
        status: 'assigned',
      };

      const storeSpy = jest.spyOn(agentDBManager, 'storeTrainingData');

      // Act
      await agent.executeTask(task);

      // Assert
      expect(storeSpy).toHaveBeenCalled();
      expect(storeSpy).toHaveBeenCalledWith(
        expect.stringContaining('test-agent'),
        expect.objectContaining({
          operation: expect.any(String),
          input: expect.any(Object),
          output: expect.any(Object),
        })
      );
    });

    it('should retrieve neural patterns before task execution', async () => {
      // Arrange
      const agentId: AgentId = {
        type: 'test-agent',
        instanceId: 'test-001',
      };

      agent = new BaseAgent(agentId, eventBus, memoryManager, {
        agentDBManager,
      });
      await agent.initialize();

      const task: TaskAssignment = {
        id: 'task-001',
        task: {
          id: 'task-001',
          description: 'Test task',
          priority: 'medium',
          metadata: {},
        },
        assignedAt: new Date(),
        status: 'assigned',
      };

      const retrieveSpy = jest.spyOn(agentDBManager, 'retrieveTrainingData');

      // Act
      await agent.executeTask(task);

      // Assert
      expect(retrieveSpy).toHaveBeenCalled();
    });

    it('should sync data via QUIC after task completion', async () => {
      // Arrange
      agentDBManager = new AgentDBManager({
        enabled: true,
        dbPath: ':memory:',
        quicSync: {
          enabled: true,
          peers: ['localhost:4433'],
        },
      });
      await agentDBManager.initialize();

      const agentId: AgentId = {
        type: 'test-agent',
        instanceId: 'test-001',
      };

      agent = new BaseAgent(agentId, eventBus, memoryManager, {
        agentDBManager,
      });
      await agent.initialize();

      const task: TaskAssignment = {
        id: 'task-001',
        task: {
          id: 'task-001',
          description: 'Test task',
          priority: 'medium',
          metadata: {},
        },
        assignedAt: new Date(),
        status: 'assigned',
      };

      const syncSpy = jest.spyOn(agentDBManager, 'syncToPeers');

      // Act
      await agent.executeTask(task);

      // Assert
      expect(syncSpy).toHaveBeenCalled();
    });

    it('should use neural patterns to optimize task execution', async () => {
      // Arrange
      const agentId: AgentId = {
        type: 'test-agent',
        instanceId: 'test-001',
      };

      // Mock historical patterns
      jest.spyOn(agentDBManager, 'searchPatterns').mockResolvedValue([
        {
          operation: 'test-execution',
          input: { complexity: 5 },
          output: { duration: 100 },
          confidence: 0.95,
        },
      ]);

      agent = new BaseAgent(agentId, eventBus, memoryManager, {
        agentDBManager,
      });
      await agent.initialize();

      const task: TaskAssignment = {
        id: 'task-001',
        task: {
          id: 'task-001',
          description: 'Test task with complexity 5',
          priority: 'medium',
          metadata: { complexity: 5 },
        },
        assignedAt: new Date(),
        status: 'assigned',
      };

      // Act
      const result = await agent.executeTask(task);

      // Assert
      expect(result).toBeDefined();
      expect(agentDBManager.searchPatterns).toHaveBeenCalled();
    });
  });

  describe('Initialization with AgentDB Disabled (Backward Compatibility)', () => {
    beforeEach(async () => {
      agentDBManager = new AgentDBManager({
        enabled: false,
      });
      await agentDBManager.initialize();
    });

    it('should initialize BaseAgent without AgentDB', async () => {
      // Arrange
      const agentId: AgentId = {
        type: 'test-agent',
        instanceId: 'test-001',
      };

      // Act
      agent = new BaseAgent(agentId, eventBus, memoryManager);
      await agent.initialize();

      // Assert
      expect(agent.isInitialized()).toBe(true);
    });

    it('should execute tasks normally without AgentDB', async () => {
      // Arrange
      const agentId: AgentId = {
        type: 'test-agent',
        instanceId: 'test-001',
      };

      agent = new BaseAgent(agentId, eventBus, memoryManager);
      await agent.initialize();

      const task: TaskAssignment = {
        id: 'task-001',
        task: {
          id: 'task-001',
          description: 'Test task',
          priority: 'medium',
          metadata: {},
        },
        assignedAt: new Date(),
        status: 'assigned',
      };

      // Act & Assert
      await expect(agent.executeTask(task)).resolves.toBeDefined();
    });

    it('should not attempt neural training when AgentDB is disabled', async () => {
      // Arrange
      const agentId: AgentId = {
        type: 'test-agent',
        instanceId: 'test-001',
      };

      agent = new BaseAgent(agentId, eventBus, memoryManager, {
        agentDBManager,
      });
      await agent.initialize();

      const task: TaskAssignment = {
        id: 'task-001',
        task: {
          id: 'task-001',
          description: 'Test task',
          priority: 'medium',
          metadata: {},
        },
        assignedAt: new Date(),
        status: 'assigned',
      };

      const storeSpy = jest.spyOn(agentDBManager, 'storeTrainingData');

      // Act
      await agent.executeTask(task);

      // Assert
      expect(storeSpy).not.toHaveBeenCalled();
    });

    it('should use standard memory manager when AgentDB is disabled', async () => {
      // Arrange
      const agentId: AgentId = {
        type: 'test-agent',
        instanceId: 'test-001',
      };

      agent = new BaseAgent(agentId, eventBus, memoryManager);
      await agent.initialize();

      const memorySpy = jest.spyOn(memoryManager, 'store');

      const task: TaskAssignment = {
        id: 'task-001',
        task: {
          id: 'task-001',
          description: 'Test task',
          priority: 'medium',
          metadata: {},
        },
        assignedAt: new Date(),
        status: 'assigned',
      };

      // Act
      await agent.executeTask(task);

      // Assert
      expect(memorySpy).toHaveBeenCalled();
    });
  });

  describe('Neural Training Lifecycle Hooks', () => {
    beforeEach(async () => {
      agentDBManager = new AgentDBManager({
        enabled: true,
        dbPath: ':memory:',
      });
      await agentDBManager.initialize();
    });

    it('should call onPreTask hook with neural context', async () => {
      // Arrange
      const agentId: AgentId = {
        type: 'test-agent',
        instanceId: 'test-001',
      };

      agent = new BaseAgent(agentId, eventBus, memoryManager, {
        agentDBManager,
      });

      const preTaskSpy = jest.spyOn(agent as any, 'onPreTask');
      await agent.initialize();

      const task: TaskAssignment = {
        id: 'task-001',
        task: {
          id: 'task-001',
          description: 'Test task',
          priority: 'medium',
          metadata: {},
        },
        assignedAt: new Date(),
        status: 'assigned',
      };

      // Act
      await agent.executeTask(task);

      // Assert
      expect(preTaskSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          assignment: task,
        })
      );
    });

    it('should call onPostTask hook with training data', async () => {
      // Arrange
      const agentId: AgentId = {
        type: 'test-agent',
        instanceId: 'test-001',
      };

      agent = new BaseAgent(agentId, eventBus, memoryManager, {
        agentDBManager,
      });

      const postTaskSpy = jest.spyOn(agent as any, 'onPostTask');
      await agent.initialize();

      const task: TaskAssignment = {
        id: 'task-001',
        task: {
          id: 'task-001',
          description: 'Test task',
          priority: 'medium',
          metadata: {},
        },
        assignedAt: new Date(),
        status: 'assigned',
      };

      // Act
      await agent.executeTask(task);

      // Assert
      expect(postTaskSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          assignment: task,
          result: expect.any(Object),
        })
      );
    });

    it('should call onTaskError hook on failure', async () => {
      // Arrange
      const agentId: AgentId = {
        type: 'test-agent',
        instanceId: 'test-001',
      };

      agent = new BaseAgent(agentId, eventBus, memoryManager, {
        agentDBManager,
      });

      const errorSpy = jest.spyOn(agent as any, 'onTaskError');

      // Mock task execution to throw error
      jest.spyOn(agent as any, 'execute').mockRejectedValue(new Error('Task failed'));

      await agent.initialize();

      const task: TaskAssignment = {
        id: 'task-001',
        task: {
          id: 'task-001',
          description: 'Test task',
          priority: 'medium',
          metadata: {},
        },
        assignedAt: new Date(),
        status: 'assigned',
      };

      // Act
      try {
        await agent.executeTask(task);
      } catch (error) {
        // Expected error
      }

      // Assert
      expect(errorSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          assignment: task,
          error: expect.any(Error),
        })
      );
    });

    it('should emit events during neural training', async () => {
      // Arrange
      const agentId: AgentId = {
        type: 'test-agent',
        instanceId: 'test-001',
      };

      agent = new BaseAgent(agentId, eventBus, memoryManager, {
        agentDBManager,
      });

      const eventSpy = jest.fn();
      eventBus.on('neural:pattern-learned', eventSpy);

      await agent.initialize();

      const task: TaskAssignment = {
        id: 'task-001',
        task: {
          id: 'task-001',
          description: 'Test task',
          priority: 'medium',
          metadata: {},
        },
        assignedAt: new Date(),
        status: 'assigned',
      };

      // Act
      await agent.executeTask(task);

      // Assert
      expect(eventSpy).toHaveBeenCalled();
    });
  });

  describe('Memory Persistence and Retrieval', () => {
    beforeEach(async () => {
      agentDBManager = new AgentDBManager({
        enabled: true,
        dbPath: ':memory:',
      });
      await agentDBManager.initialize();
    });

    it('should persist agent state to AgentDB', async () => {
      // Arrange
      const agentId: AgentId = {
        type: 'test-agent',
        instanceId: 'test-001',
      };

      agent = new BaseAgent(agentId, eventBus, memoryManager, {
        agentDBManager,
      });
      await agent.initialize();

      const state = {
        status: 'active',
        taskCount: 5,
        lastActivity: new Date(),
      };

      const storeSpy = jest.spyOn(agentDBManager, 'storeTrainingData');

      // Act
      await agent.saveState(state);

      // Assert
      expect(storeSpy).toHaveBeenCalled();
    });

    it('should retrieve agent state from AgentDB', async () => {
      // Arrange
      const agentId: AgentId = {
        type: 'test-agent',
        instanceId: 'test-001',
      };

      const expectedState = {
        status: 'active',
        taskCount: 5,
      };

      jest.spyOn(agentDBManager, 'retrieveTrainingData').mockResolvedValue(expectedState);

      agent = new BaseAgent(agentId, eventBus, memoryManager, {
        agentDBManager,
      });
      await agent.initialize();

      // Act
      const state = await agent.loadState();

      // Assert
      expect(state).toEqual(expectedState);
    });

    it('should handle state persistence failures gracefully', async () => {
      // Arrange
      const agentId: AgentId = {
        type: 'test-agent',
        instanceId: 'test-001',
      };

      jest.spyOn(agentDBManager, 'storeTrainingData').mockRejectedValue(
        new Error('Storage failed')
      );

      agent = new BaseAgent(agentId, eventBus, memoryManager, {
        agentDBManager,
      });
      await agent.initialize();

      const state = { status: 'active' };

      // Act & Assert
      await expect(agent.saveState(state)).rejects.toThrow('Storage failed');
    });
  });

  describe('Error Handling and Graceful Degradation', () => {
    it('should continue operating if AgentDB fails during initialization', async () => {
      // Arrange
      const agentId: AgentId = {
        type: 'test-agent',
        instanceId: 'test-001',
      };

      const failingDBManager = new AgentDBManager({
        enabled: true,
        dbPath: '/invalid/path/db.sqlite',
      });

      // Act & Assert
      agent = new BaseAgent(agentId, eventBus, memoryManager, {
        agentDBManager: failingDBManager,
      });

      // Should initialize without throwing
      await expect(agent.initialize()).resolves.not.toThrow();
    });

    it('should fall back to standard memory if AgentDB is unavailable', async () => {
      // Arrange
      const agentId: AgentId = {
        type: 'test-agent',
        instanceId: 'test-001',
      };

      agentDBManager = new AgentDBManager({
        enabled: true,
        dbPath: ':memory:',
      });

      // Mock AgentDB failure
      jest.spyOn(agentDBManager, 'storeTrainingData').mockRejectedValue(
        new Error('AgentDB unavailable')
      );

      agent = new BaseAgent(agentId, eventBus, memoryManager, {
        agentDBManager,
      });
      await agent.initialize();

      const memorySpy = jest.spyOn(memoryManager, 'store');

      const task: TaskAssignment = {
        id: 'task-001',
        task: {
          id: 'task-001',
          description: 'Test task',
          priority: 'medium',
          metadata: {},
        },
        assignedAt: new Date(),
        status: 'assigned',
      };

      // Act
      await agent.executeTask(task);

      // Assert - Should fall back to memory manager
      expect(memorySpy).toHaveBeenCalled();
    });

    it('should handle QUIC sync failures without affecting task execution', async () => {
      // Arrange
      agentDBManager = new AgentDBManager({
        enabled: true,
        dbPath: ':memory:',
        quicSync: {
          enabled: true,
          peers: ['localhost:4433'],
        },
      });
      await agentDBManager.initialize();

      jest.spyOn(agentDBManager, 'syncToPeers').mockRejectedValue(
        new Error('QUIC sync failed')
      );

      const agentId: AgentId = {
        type: 'test-agent',
        instanceId: 'test-001',
      };

      agent = new BaseAgent(agentId, eventBus, memoryManager, {
        agentDBManager,
      });
      await agent.initialize();

      const task: TaskAssignment = {
        id: 'task-001',
        task: {
          id: 'task-001',
          description: 'Test task',
          priority: 'medium',
          metadata: {},
        },
        assignedAt: new Date(),
        status: 'assigned',
      };

      // Act & Assert - Task should complete despite sync failure
      await expect(agent.executeTask(task)).resolves.toBeDefined();
    });

    it('should log errors when AgentDB operations fail', async () => {
      // Arrange
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

      agentDBManager = new AgentDBManager({
        enabled: true,
        dbPath: ':memory:',
      });
      await agentDBManager.initialize();

      jest.spyOn(agentDBManager, 'storeTrainingData').mockRejectedValue(
        new Error('Storage error')
      );

      const agentId: AgentId = {
        type: 'test-agent',
        instanceId: 'test-001',
      };

      agent = new BaseAgent(agentId, eventBus, memoryManager, {
        agentDBManager,
      });
      await agent.initialize();

      const task: TaskAssignment = {
        id: 'task-001',
        task: {
          id: 'task-001',
          description: 'Test task',
          priority: 'medium',
          metadata: {},
        },
        assignedAt: new Date(),
        status: 'assigned',
      };

      // Act
      await agent.executeTask(task);

      // Assert
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('AgentDB'),
        expect.any(Error)
      );

      consoleSpy.mockRestore();
    });
  });

  describe('Performance and Resource Management', () => {
    beforeEach(async () => {
      agentDBManager = new AgentDBManager({
        enabled: true,
        dbPath: ':memory:',
      });
      await agentDBManager.initialize();
    });

    it('should clean up AgentDB resources on shutdown', async () => {
      // Arrange
      const agentId: AgentId = {
        type: 'test-agent',
        instanceId: 'test-001',
      };

      agent = new BaseAgent(agentId, eventBus, memoryManager, {
        agentDBManager,
      });
      await agent.initialize();

      const shutdownSpy = jest.spyOn(agentDBManager, 'shutdown');

      // Act
      await agent.shutdown();

      // Assert
      expect(shutdownSpy).toHaveBeenCalled();
    });

    it('should not block task execution during neural training', async () => {
      // Arrange
      const agentId: AgentId = {
        type: 'test-agent',
        instanceId: 'test-001',
      };

      // Simulate slow training
      jest.spyOn(agentDBManager, 'storeTrainingData').mockImplementation(
        () => new Promise(resolve => setTimeout(resolve, 1000))
      );

      agent = new BaseAgent(agentId, eventBus, memoryManager, {
        agentDBManager,
      });
      await agent.initialize();

      const task: TaskAssignment = {
        id: 'task-001',
        task: {
          id: 'task-001',
          description: 'Test task',
          priority: 'medium',
          metadata: {},
        },
        assignedAt: new Date(),
        status: 'assigned',
      };

      // Act
      const startTime = Date.now();
      await agent.executeTask(task);
      const duration = Date.now() - startTime;

      // Assert - Should complete quickly (training is async)
      expect(duration).toBeLessThan(500);
    });
  });
});
