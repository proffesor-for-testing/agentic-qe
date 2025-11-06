/**
 * Enhanced BaseAgent Test Suite - Targeting High-Risk Areas (Lines 76-157)
 * Focus: Uncovered code paths, edge cases, and high-defect-risk function2
 *
 * Target Coverage: >80% (currently 62.84%)
 * High-Risk Area: Lines 76-157 (57.4% defect risk)
 */

import { BaseAgent, BaseAgentConfig } from '../../../src/agents/BaseAgent';
import { SwarmMemoryManager } from '../../../src/core/memory/SwarmMemoryManager';
import { EventEmitter } from 'events';
import {
  QEAgentType as AgentType,
  AgentStatus,
  AgentCapability,
  AgentContext,
  QETask,
  TaskAssignment,
  MemoryStore
} from '../../../src/types';
import * as path from 'path';
import * as fs from 'fs-extra';

// Mock Database to use the manual mock from __mocks__ directory
jest.mock('../../../src/utils/Database', () => {
  const actualMock = jest.requireActual<typeof import('../../../src/utils/__mocks__/Database')>('../../../src/utils/__mocks__/Database');
  return actualMock;
});

// Mock LearningEngine to avoid database initialization issues
jest.mock('../../../src/learning/LearningEngine');

// Mock MemoryStore implementation for null memory scenarios
class NullMemoryStore implements MemoryStore {
  async initialize(): Promise<void> {}
  async store(key: string, value: any, ttl?: number): Promise<void> {}
  async retrieve(key: string): Promise<any> {
    return null;
  }
  async delete(key: string): Promise<void> {}
  async query(pattern: string): Promise<any[]> {
    return [];
  }
  async close(): Promise<void> {}

  // Required by MemoryStoreAdapter
  async set(key: string, value: any, ttl?: number): Promise<void> {}
  async get(key: string): Promise<any> {
    return null;
  }
  async clear(): Promise<void> {}
}

// Test agent implementation
class EnhancedTestAgent extends BaseAgent {
  public shouldFailInit = false;
  public shouldFailTask = false;
  public shouldFailCleanup = false;
  public taskResult: any = { success: true };

  protected async initializeComponents(): Promise<void> {
    if (this.shouldFailInit) throw new Error('Init component failed');
  }

  protected async performTask(task: QETask): Promise<any> {
    if (this.shouldFailTask) throw new Error('Task perform failed');
    return { ...this.taskResult, taskId: task.id };
  }

  protected async loadKnowledge(): Promise<void> {}

  protected async cleanup(): Promise<void> {
    if (this.shouldFailCleanup) throw new Error('Cleanup failed');
  }

  // Expose protected methods for testing
  public exposeStoreMemory(key: string, value: any, ttl?: number) {
    return this.storeMemory(key, value, ttl);
  }

  public exposeRetrieveMemory(key: string) {
    return this.retrieveMemory(key);
  }

  public exposeStoreSharedMemory(key: string, value: any, ttl?: number) {
    return this.storeSharedMemory(key, value, ttl);
  }

  public exposeRetrieveSharedMemory(agentType: AgentType, key: string) {
    return this.retrieveSharedMemory(agentType, key);
  }

  public exposeEmitEvent(type: string, data: any, priority?: any) {
    return this.emitEvent(type, data, priority);
  }

  public exposeBroadcastMessage(type: string, payload: any) {
    return this.broadcastMessage(type, payload);
  }

  // Access protected properties
  public getAgentDBConfig() {
    return (this as any).agentDBConfig;
  }

  public getPerformanceTracker() {
    return (this as any).performanceTracker;
  }

  public getLearningEngineInternal() {
    return (this as any).learningEngine;
  }
}

describe('BaseAgent - Enhanced Coverage (High-Risk Lines 76-157)', () => {
  let memoryStore: SwarmMemoryManager;
  let eventBus: EventEmitter;
  let testDbPath: string;

  const capabilities: AgentCapability[] = [
    {
      name: 'test-capability',
      version: '1.0.0',
      description: 'Test capability',
      taskTypes: ['test'],
      parameters: {}
    }
  ];

  const context: AgentContext = {
    id: 'ctx',
    type: 'test-generator',
    status: AgentStatus.IDLE,
    metadata: {}
  };

  beforeEach(async () => {
    testDbPath = ':memory:';
    memoryStore = new SwarmMemoryManager(testDbPath);
    await memoryStore.initialize();
    eventBus = new EventEmitter();
  });

  afterEach(async () => {
    if (memoryStore) {
      await memoryStore.close();
    }
  });

  describe('Constructor - AgentDB Config Building (Lines 101-115)', () => {
    it('should build AgentDB config from agentDBConfig parameter', () => {
      const agentDBConfig = {
        dbPath: '/custom/path.db',
        enableQUICSync: true,
        syncPort: 5000,
        syncPeers: ['peer1:4433', 'peer2:4433'],
        enableLearning: true,
        enableReasoning: false,
        cacheSize: 2000,
        quantizationType: 'binary' as const
      };

      const agent = new EnhancedTestAgent({
        type: 'test-generator' as AgentType,
        capabilities,
        context,
        memoryStore,
        eventBus,
        agentDBConfig
      });

      const config = agent.getAgentDBConfig();
      expect(config).toEqual(agentDBConfig);
      expect(config?.dbPath).toBe('/custom/path.db');
      expect(config?.enableQUICSync).toBe(true);
      expect(config?.syncPort).toBe(5000);
      expect(config?.quantizationType).toBe('binary');
    });

    it('should build AgentDB config from shorthand properties (agentDBPath)', () => {
      const agent = new EnhancedTestAgent({
        type: 'test-generator' as AgentType,
        capabilities,
        context,
        memoryStore,
        eventBus,
        agentDBPath: '/shorthand/path.db'
      });

      const config = agent.getAgentDBConfig();
      expect(config?.dbPath).toBe('/shorthand/path.db');
      expect(config?.enableQUICSync).toBe(false);
      expect(config?.syncPort).toBe(4433); // default
      expect(config?.quantizationType).toBe('scalar'); // default
    });

    it('should build AgentDB config from shorthand properties (enableQUICSync)', () => {
      const agent = new EnhancedTestAgent({
        type: 'test-generator' as AgentType,
        capabilities,
        context,
        memoryStore,
        eventBus,
        enableQUICSync: true,
        syncPort: 9000,
        syncPeers: ['peer1:9000']
      });

      const config = agent.getAgentDBConfig();
      expect(config?.enableQUICSync).toBe(true);
      expect(config?.syncPort).toBe(9000);
      expect(config?.syncPeers).toEqual(['peer1:9000']);
      expect(config?.dbPath).toBe('.agentdb/reasoningbank.db'); // default
    });

    it('should build AgentDB config with custom quantization type', () => {
      const agent = new EnhancedTestAgent({
        type: 'test-generator' as AgentType,
        capabilities,
        context,
        memoryStore,
        eventBus,
        agentDBPath: '/path.db',
        quantizationType: 'product'
      });

      const config = agent.getAgentDBConfig();
      expect(config?.quantizationType).toBe('product');
    });

    it('should not build AgentDB config when no AgentDB params provided', () => {
      const agent = new EnhancedTestAgent({
        type: 'test-generator' as AgentType,
        capabilities,
        context,
        memoryStore,
        eventBus
      });

      const config = agent.getAgentDBConfig();
      expect(config).toBeUndefined();
    });

    it('should enable learning in AgentDB config from enableLearning flag', () => {
      const agent = new EnhancedTestAgent({
        type: 'test-generator' as AgentType,
        capabilities,
        context,
        memoryStore,
        eventBus,
        enableLearning: true,
        agentDBPath: '/learning.db'
      });

      const config = agent.getAgentDBConfig();
      expect(config?.enableLearning).toBe(true);
    });
  });

  describe('Initialization - Learning Engine Integration (Lines 146-160)', () => {
    it('should initialize PerformanceTracker when learning enabled with SwarmMemoryManager', async () => {
      const agent = new EnhancedTestAgent({
        type: 'test-generator' as AgentType,
        capabilities,
        context,
        memoryStore, // SwarmMemoryManager instance
        eventBus,
        enableLearning: true
      });

      await agent.initialize();

      const tracker = agent.getPerformanceTracker();
      expect(tracker).toBeDefined();

      const learningEngine = agent.getLearningEngineInternal();
      expect(learningEngine).toBeDefined();

      await agent.terminate();
    });

    it('should not initialize PerformanceTracker when learning disabled', async () => {
      const agent = new EnhancedTestAgent({
        type: 'test-generator' as AgentType,
        capabilities,
        context,
        memoryStore,
        eventBus,
        enableLearning: false
      });

      await agent.initialize();

      const tracker = agent.getPerformanceTracker();
      expect(tracker).toBeUndefined();

      await agent.terminate();
    });

    it('should initialize with custom learning config', async () => {
      const learningConfig = {
        alpha: 0.2,
        gamma: 0.8,
        epsilon: 0.3,
        epsilonDecay: 0.95,
        minEpsilon: 0.05
      };

      const agent = new EnhancedTestAgent({
        type: 'test-generator' as AgentType,
        capabilities,
        context,
        memoryStore,
        eventBus,
        enableLearning: true,
        learningConfig
      });

      await agent.initialize();

      const learningStatus = agent.getLearningStatus();
      expect(learningStatus).not.toBeNull();
      expect(learningStatus?.enabled).toBe(true);

      await agent.terminate();
    });
  });

  describe('AgentDB Integration Methods (Lines 371-422)', () => {
    it('should initialize AgentDB with full config', async () => {
      const agentDBPath = path.join(__dirname, '../../../.agentdb-test', `full-${Date.now()}.db`);

      const agent = new EnhancedTestAgent({
        type: 'test-generator' as AgentType,
        capabilities,
        context,
        memoryStore,
        eventBus
      });

      await agent.initialize();

      const agentDBConfig = {
        dbPath: agentDBPath,
        enableQUICSync: false,
        syncPort: 4433,
        enableLearning: true,
        enableReasoning: true,
        cacheSize: 500
      };

      await agent.initializeAgentDB(agentDBConfig);

      expect(agent.hasAgentDB()).toBe(true);

      const status = await agent.getAgentDBStatus();
      expect(status).not.toBeNull();
      expect(status?.enabled).toBe(true);

      await agent.terminate();
      await fs.remove(path.dirname(agentDBPath));
    });

    it('should warn if AgentDB already initialized', async () => {
      const agentDBPath = path.join(__dirname, '../../../.agentdb-test', `warn-${Date.now()}.db`);

      const agent = new EnhancedTestAgent({
        type: 'test-generator' as AgentType,
        capabilities,
        context,
        memoryStore,
        eventBus,
        agentDBPath
      });

      await agent.initialize(); // Initializes AgentDB

      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();

      // Try to initialize again
      await agent.initializeAgentDB({ dbPath: agentDBPath });

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('AgentDB already initialized')
      );

      consoleSpy.mockRestore();
      await agent.terminate();
      await fs.remove(path.dirname(agentDBPath));
    });

    it('should handle AgentDB initialization errors', async () => {
      const agent = new EnhancedTestAgent({
        type: 'test-generator' as AgentType,
        capabilities,
        context,
        memoryStore,
        eventBus
      });

      await agent.initialize();

      // Invalid config that will cause AgentDB to fail
      const invalidConfig = {
        dbPath: '/invalid/\0/path.db' // Null byte in path
      };

      await expect(agent.initializeAgentDB(invalidConfig)).rejects.toThrow();

      await agent.terminate();
    });

    it('should return AgentDB status with stats', async () => {
      const agentDBPath = path.join(__dirname, '../../../.agentdb-test', `stats-${Date.now()}.db`);

      const agent = new EnhancedTestAgent({
        type: 'test-generator' as AgentType,
        capabilities,
        context,
        memoryStore,
        eventBus,
        agentDBPath
      });

      await agent.initialize();

      const status = await agent.getAgentDBStatus();
      expect(status).not.toBeNull();
      expect(status?.enabled).toBe(true);
      expect(status?.stats).toBeDefined();

      await agent.terminate();
      await fs.remove(path.dirname(agentDBPath));
    });

    it('should return null for AgentDB status when not initialized', async () => {
      const agent = new EnhancedTestAgent({
        type: 'test-generator' as AgentType,
        capabilities,
        context,
        memoryStore,
        eventBus
      });

      await agent.initialize();

      const status = await agent.getAgentDBStatus();
      expect(status).toBeNull();

      await agent.terminate();
    });
  });

  describe('Memory Operations with Null Store (Lines 528-571)', () => {
    it('should handle undefined memory store in storeMemory', async () => {
      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();

      const agent = new EnhancedTestAgent({
        type: 'test-generator' as AgentType,
        capabilities,
        context,
        memoryStore,
        eventBus
      });

      // Force memoryStore to undefined to test the warning path
      (agent as any).memoryStore = undefined;

      // Should warn but not throw
      await agent.exposeStoreMemory('key', 'value');

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Memory store not available')
      );

      consoleSpy.mockRestore();
    });

    it('should handle undefined memory store in retrieveMemory', async () => {
      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();

      const agent = new EnhancedTestAgent({
        type: 'test-generator' as AgentType,
        capabilities,
        context,
        memoryStore,
        eventBus
      });

      // Force memoryStore to undefined
      (agent as any).memoryStore = undefined;

      const result = await agent.exposeRetrieveMemory('key');
      expect(result).toBeNull();

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Memory store not available')
      );

      consoleSpy.mockRestore();
    });

    it('should handle undefined memory store in storeSharedMemory', async () => {
      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();

      const agent = new EnhancedTestAgent({
        type: 'test-generator' as AgentType,
        capabilities,
        context,
        memoryStore,
        eventBus
      });

      // Force memoryStore to undefined
      (agent as any).memoryStore = undefined;

      await agent.exposeStoreSharedMemory('shared', 'data');

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Memory store not available')
      );

      consoleSpy.mockRestore();
    });

    it('should handle undefined memory store in retrieveSharedMemory', async () => {
      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();

      const agent = new EnhancedTestAgent({
        type: 'test-generator' as AgentType,
        capabilities,
        context,
        memoryStore,
        eventBus
      });

      // Force memoryStore to undefined
      (agent as any).memoryStore = undefined;

      const result = await agent.exposeRetrieveSharedMemory('test-generator', 'key');
      expect(result).toBeNull();

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Memory store not available')
      );

      consoleSpy.mockRestore();
    });

    it('should work normally with valid memory store', async () => {
      const agent = new EnhancedTestAgent({
        id: 'memory-normal',
        type: 'test-generator' as AgentType,
        capabilities,
        context,
        memoryStore,
        eventBus
      });

      await agent.initialize();

      // Normal operations should work
      await agent.exposeStoreMemory('test', { data: 'value' });
      const result = await agent.exposeRetrieveMemory('test');
      expect(result).toEqual({ data: 'value' });

      await agent.terminate();
    });
  });

  describe('Task Lifecycle - Performance Metrics Edge Cases (Lines 1003-1016)', () => {
    it('should calculate average execution time correctly for multiple tasks', async () => {
      const agent = new EnhancedTestAgent({
        id: 'metrics-agent',
        type: 'test-executor' as AgentType,
        capabilities,
        context,
        memoryStore,
        eventBus
      });

      await agent.initialize();

      // Execute multiple tasks
      for (let i = 0; i < 5; i++) {
        const task: QETask = {
          id: `task-${i}`,
          type: 'test',
          payload: {},
          priority: 1,
          status: 'pending'
        };
        await agent.assignTask(task);
      }

      const metrics = agent.getStatus().performanceMetrics;
      expect(metrics.tasksCompleted).toBe(5);
      expect(metrics.averageExecutionTime).toBeGreaterThanOrEqual(0);

      await agent.terminate();
    });

    it('should handle mixed success and error metrics', async () => {
      const agent = new EnhancedTestAgent({
        id: 'mixed-agent',
        type: 'test-executor' as AgentType,
        capabilities,
        context,
        memoryStore,
        eventBus
      });

      await agent.initialize();

      // Successful task
      await agent.assignTask({
        id: 'success',
        type: 'test',
        payload: {},
        priority: 1,
        status: 'pending'
      });

      // Failed task
      agent.shouldFailTask = true;
      try {
        await agent.assignTask({
          id: 'fail',
          type: 'test',
          payload: {},
          priority: 1,
          status: 'pending'
        });
      } catch (e) {
        // Expected
      }

      const metrics = agent.getStatus().performanceMetrics;
      expect(metrics.tasksCompleted).toBe(1);
      expect(metrics.errorCount).toBe(1);

      await agent.terminate();
    });
  });

  describe('State Persistence Edge Cases (Lines 1026-1060)', () => {
    it('should handle missing state gracefully during restore', async () => {
      const agent = new EnhancedTestAgent({
        id: 'restore-missing',
        type: 'test-executor' as AgentType,
        capabilities,
        context,
        memoryStore,
        eventBus
      });

      // No state exists - should initialize with default metrics
      await agent.initialize();

      const metrics = agent.getStatus().performanceMetrics;
      expect(metrics.tasksCompleted).toBe(0);
      expect(metrics.errorCount).toBe(0);
      expect(metrics.averageExecutionTime).toBe(0);

      await agent.terminate();
    });

    it('should handle save state errors gracefully', async () => {
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();

      const agent = new EnhancedTestAgent({
        id: 'save-fail',
        type: 'test-executor' as AgentType,
        capabilities,
        context,
        memoryStore,
        eventBus
      });

      await agent.initialize();

      // Mock store to fail
      jest.spyOn(memoryStore, 'store').mockRejectedValueOnce(new Error('Store failed'));

      // Termination should handle save error gracefully
      await agent.terminate();

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('Could not save state'),
        expect.any(Error)
      );

      consoleErrorSpy.mockRestore();
    });

    it('should handle reportStatus errors gracefully', async () => {
      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();

      const agent = new EnhancedTestAgent({
        id: 'report-fail',
        type: 'test-executor' as AgentType,
        capabilities,
        context,
        memoryStore,
        eventBus
      });

      // Mock store to fail for reportStatus during initialization
      jest.spyOn(memoryStore, 'store').mockRejectedValueOnce(new Error('Report failed'));

      // Should handle error during initialization's reportStatus call
      await agent.initialize();

      // The actual error message format is "[agentId] Failed to report status:"
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Failed to report status'),
        expect.any(Error)
      );

      consoleSpy.mockRestore();
      await agent.terminate();
    });
  });

  describe('Event Priority Variations (Lines 488-500)', () => {
    it('should emit event with critical priority', (done) => {
      const agent = new EnhancedTestAgent({
        type: 'test-executor' as AgentType,
        capabilities,
        context,
        memoryStore,
        eventBus
      });

      eventBus.on('critical-event', (event) => {
        expect(event.priority).toBe('critical');
        done();
      });

      agent.exposeEmitEvent('critical-event', { urgent: true }, 'critical');
    });

    it('should emit event with low priority', (done) => {
      const agent = new EnhancedTestAgent({
        type: 'test-executor' as AgentType,
        capabilities,
        context,
        memoryStore,
        eventBus
      });

      eventBus.on('low-event', (event) => {
        expect(event.priority).toBe('low');
        done();
      });

      agent.exposeEmitEvent('low-event', { info: 'data' }, 'low');
    });

    it('should generate unique event IDs', () => {
      const agent = new EnhancedTestAgent({
        type: 'test-executor' as AgentType,
        capabilities,
        context,
        memoryStore,
        eventBus
      });

      const eventIds = new Set<string>();

      eventBus.on('id-test', (event) => {
        eventIds.add(event.id);
      });

      // Emit multiple events
      for (let i = 0; i < 10; i++) {
        agent.exposeEmitEvent('id-test', { index: i });
      }

      expect(eventIds.size).toBe(10); // All unique
    });
  });

  describe('Task Assignment Generation (Lines 434-444)', () => {
    it('should generate unique assignment IDs', async () => {
      const agent = new EnhancedTestAgent({
        type: 'test-executor' as AgentType,
        capabilities,
        context,
        memoryStore,
        eventBus
      });

      await agent.initialize();

      const assignmentIds = new Set<string>();

      // Capture assignment IDs
      const originalExecute = agent.executeTask.bind(agent);
      agent.executeTask = jest.fn(async (assignment) => {
        assignmentIds.add(assignment.id);
        return originalExecute(assignment);
      });

      for (let i = 0; i < 5; i++) {
        await agent.assignTask({
          id: `task-${i}`,
          type: 'test',
          payload: {},
          priority: 1,
          status: 'pending'
        });
      }

      expect(assignmentIds.size).toBe(5); // All unique

      await agent.terminate();
    });

    it('should set correct assignment status', async () => {
      const agent = new EnhancedTestAgent({
        id: 'assign-status',
        type: 'test-executor' as AgentType,
        capabilities,
        context,
        memoryStore,
        eventBus
      });

      await agent.initialize();

      let capturedAssignment: TaskAssignment | undefined;

      const originalExecute = agent.executeTask.bind(agent);
      agent.executeTask = jest.fn(async (assignment) => {
        capturedAssignment = assignment;
        return originalExecute(assignment);
      });

      await agent.assignTask({
        id: 'task-status',
        type: 'test',
        payload: {},
        priority: 1,
        status: 'pending'
      });

      expect(capturedAssignment?.status).toBe('assigned');
      expect(capturedAssignment?.agentId).toBe('assign-status');
      expect(capturedAssignment?.assignedAt).toBeInstanceOf(Date);

      await agent.terminate();
    });
  });

  describe('Error Hook Edge Cases (Lines 947-956)', () => {
    it('should handle errors in executeHook gracefully', async () => {
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

      const agent = new EnhancedTestAgent({
        type: 'test-executor' as AgentType,
        capabilities,
        context,
        memoryStore,
        eventBus
      });

      // Trigger hook with non-existent method
      await (agent as any).executeHook('non-existent-hook', {});

      // Should not throw, just log error
      expect(consoleSpy).not.toHaveBeenCalled(); // No error if method doesn't exist

      consoleSpy.mockRestore();
    });
  });

  describe('ID Generation Methods (Lines 1062-1072)', () => {
    it('should generate unique agent IDs with timestamp and random component', () => {
      const ids = new Set<string>();

      for (let i = 0; i < 100; i++) {
        const agent = new EnhancedTestAgent({
          type: 'test-generator' as AgentType,
          capabilities,
          context,
          memoryStore,
          eventBus
        });
        ids.add(agent.getStatus().agentId.id);
      }

      expect(ids.size).toBe(100); // All unique
    });

    it('should generate message IDs with correct format', () => {
      const agent = new EnhancedTestAgent({
        type: 'test-executor' as AgentType,
        capabilities,
        context,
        memoryStore,
        eventBus
      });

      const messageIds = new Set<string>();

      eventBus.on('agent.message', (msg) => {
        messageIds.add(msg.id);
        expect(msg.id).toMatch(/^msg-\d+-\w+$/);
      });

      for (let i = 0; i < 10; i++) {
        agent.exposeBroadcastMessage('test', { index: i });
      }

      expect(messageIds.size).toBe(10);
    });
  });
});
