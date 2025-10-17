/**
 * Comprehensive test suite for BaseAgent
 * Tests lifecycle hooks, event handling, memory operations, and error handling
 */

import { BaseAgent, BaseAgentConfig } from '../../src/agents/BaseAgent';
import { EventEmitter } from 'events';
import {
  AgentType,
  AgentCapability,
  AgentContext,
  QETask,
  TaskAssignment,
  MemoryStore
} from '../../src/types';

// Mock implementation of BaseAgent for testing
class TestAgent extends BaseAgent {
  private initializeComponentsCalled = false;
  private performTaskCalled = false;
  private loadKnowledgeCalled = false;
  private cleanupCalled = false;

  protected async initializeComponents(): Promise<void> {
    this.initializeComponentsCalled = true;
  }

  protected async performTask(task: QETask): Promise<any> {
    this.performTaskCalled = true;
    return { result: 'test-completed', taskId: task.id };
  }

  protected async loadKnowledge(): Promise<void> {
    this.loadKnowledgeCalled = true;
  }

  protected async cleanup(): Promise<void> {
    this.cleanupCalled = true;
  }

  // Test helpers
  public getInitializeComponentsCalled(): boolean { return this.initializeComponentsCalled; }
  public getPerformTaskCalled(): boolean { return this.performTaskCalled; }
  public getLoadKnowledgeCalled(): boolean { return this.loadKnowledgeCalled; }
  public getCleanupCalled(): boolean { return this.cleanupCalled; }
}

// Mock MemoryStore implementation
class MockMemoryStore implements MemoryStore {
  private data = new Map<string, any>();

  async store(key: string, value: any, ttl?: number): Promise<void> {
    this.data.set(key, { value, ttl, timestamp: Date.now() });
  }

  async retrieve(key: string): Promise<any> {
    const item = this.data.get(key);
    return item ? item.value : undefined;
  }

  async set(key: string, value: any, namespace?: string): Promise<void> {
    const fullKey = namespace ? `${namespace}:${key}` : key;
    this.data.set(fullKey, value);
  }

  async get(key: string, namespace?: string): Promise<any> {
    const fullKey = namespace ? `${namespace}:${key}` : key;
    const item = this.data.get(fullKey);
    return item && typeof item === 'object' && 'value' in item ? item.value : item;
  }

  async delete(key: string, namespace?: string): Promise<boolean> {
    const fullKey = namespace ? `${namespace}:${key}` : key;
    return this.data.delete(fullKey);
  }

  async clear(namespace?: string): Promise<void> {
    if (namespace) {
      const keysToDelete: string[] = [];
      for (const key of this.data.keys()) {
        if (key.startsWith(`${namespace}:`)) {
          keysToDelete.push(key);
        }
      }
      for (const key of keysToDelete) {
        this.data.delete(key);
      }
    } else {
      this.data.clear();
    }
  }

  // Test helper
  public getData(): Map<string, any> {
    return this.data;
  }
}

describe('BaseAgent', () => {
  let mockMemoryStore: MockMemoryStore;
  let mockEventBus: EventEmitter;
  let baseAgentConfig: BaseAgentConfig;
  let testAgent: TestAgent;

  const testCapabilities: AgentCapability[] = [
    {
      name: 'test-execution',
      version: '1.0.0',
      description: 'Execute test cases',
      parameters: { framework: 'jest' }
    },
    {
      name: 'test-analysis',
      version: '1.0.0',
      description: 'Analyze test results',
      parameters: { format: 'json' }
    }
  ];

  const testContext: AgentContext = {
    id: 'test-context',
    type: 'test-executor' as AgentType,
    status: 'idle',
    metadata: { environment: 'test' }
  };

  beforeEach(() => {
    mockMemoryStore = new MockMemoryStore();
    mockEventBus = new EventEmitter();

    baseAgentConfig = {
      id: 'test-agent-1',
      type: 'test-executor' as AgentType,
      capabilities: testCapabilities,
      context: testContext,
      memoryStore: mockMemoryStore,
      eventBus: mockEventBus
    };

    testAgent = new TestAgent(baseAgentConfig);
  });

  afterEach(async () => {
    if (testAgent.getStatus().status !== 'terminated') {
      await testAgent.terminate();
    }
  });

  describe('Construction and Initialization', () => {
    test('should construct agent with proper configuration', () => {
      const status = testAgent.getStatus();

      expect(status.agentId.id).toBe('test-agent-1');
      expect(status.agentId.type).toBe('test-executor');
      expect(status.status).toBe('initializing');
      expect(status.capabilities).toContain('test-execution');
      expect(status.capabilities).toContain('test-analysis');
    });

    test('should initialize agent successfully', async () => {
      await testAgent.initialize();

      const status = testAgent.getStatus();
      expect(status.status).toBe('active');
      expect(testAgent.getInitializeComponentsCalled()).toBe(true);
      expect(testAgent.getLoadKnowledgeCalled()).toBe(true);
    });

    test('should handle initialization errors', async () => {
      class FailingAgent extends BaseAgent {
        protected async initializeComponents(): Promise<void> {
          throw new Error('Initialization failed');
        }
        protected async performTask(): Promise<any> { return {}; }
        protected async loadKnowledge(): Promise<void> {}
        protected async cleanup(): Promise<void> {}
      }

      const failingAgent = new FailingAgent(baseAgentConfig);

      await expect(failingAgent.initialize()).rejects.toThrow('Initialization failed');
      expect(failingAgent.getStatus().status).toBe('error');

      await failingAgent.terminate();
    });
  });

  describe('Task Execution', () => {
    beforeEach(async () => {
      await testAgent.initialize();
    });

    test('should execute task successfully', async () => {
      const task: QETask = {
        id: 'task-1',
        type: 'test-execution',
        payload: { testFile: 'example.test.js' },
        priority: 1,
        status: 'pending',
        requirements: {
          capabilities: ['test-execution']
        }
      };

      const assignment: TaskAssignment = {
        id: 'assignment-1',
        task,
        agentId: testAgent.getStatus().agentId,
        assignedAt: new Date(),
        status: 'assigned'
      };

      const result = await testAgent.executeTask(assignment);

      expect(result.result).toBe('test-completed');
      expect(result.taskId).toBe('task-1');
      expect(testAgent.getPerformTaskCalled()).toBe(true);
    });

    test('should validate task assignment capabilities', async () => {
      const task: QETask = {
        id: 'task-2',
        type: 'unknown-task',
        payload: {},
        priority: 1,
        status: 'pending',
        requirements: {
          capabilities: ['non-existent-capability']
        }
      };

      const assignment: TaskAssignment = {
        id: 'assignment-2',
        task,
        agentId: testAgent.getStatus().agentId,
        assignedAt: new Date(),
        status: 'assigned'
      };

      await expect(testAgent.executeTask(assignment)).rejects.toThrow(
        'missing required capability: non-existent-capability'
      );
    });

    test('should handle task execution errors', async () => {
      class ErrorAgent extends TestAgent {
        protected async performTask(): Promise<any> {
          throw new Error('Task execution failed');
        }
      }

      const errorAgent = new ErrorAgent(baseAgentConfig);
      await errorAgent.initialize();

      const task: QETask = {
        id: 'task-3',
        type: 'test-execution',
        payload: {},
        priority: 1,
        status: 'pending'
      };

      const assignment: TaskAssignment = {
        id: 'assignment-3',
        task,
        agentId: errorAgent.getStatus().agentId,
        assignedAt: new Date(),
        status: 'assigned'
      };

      await expect(errorAgent.executeTask(assignment)).rejects.toThrow('Task execution failed');
      expect(errorAgent.getStatus().status).toBe('error');

      await errorAgent.terminate();
    });
  });

  describe('Memory Operations', () => {
    beforeEach(async () => {
      await testAgent.initialize();
    });

    test('should store and retrieve agent memory', async () => {
      const testData = { key: 'value', number: 42 };

      // Use reflection to access protected method
      await (testAgent as any).storeMemory('test-key', testData);
      const retrieved = await (testAgent as any).retrieveMemory('test-key');

      expect(retrieved).toEqual(testData);
    });

    test('should store and retrieve shared memory', async () => {
      const sharedData = { shared: 'data' };

      await (testAgent as any).storeSharedMemory('shared-key', sharedData);
      const retrieved = await (testAgent as any).retrieveSharedMemory('test-executor', 'shared-key');

      expect(retrieved).toEqual(sharedData);
    });

    test('should handle memory errors gracefully', async () => {
      // Mock memory store that fails
      const failingStore = {
        store: jest.fn().mockRejectedValue(new Error('Storage failed')),
        retrieve: jest.fn().mockRejectedValue(new Error('Retrieval failed')),
        set: jest.fn().mockRejectedValue(new Error('Set failed')),
        get: jest.fn().mockRejectedValue(new Error('Get failed')),
        delete: jest.fn().mockRejectedValue(new Error('Deletion failed')),
        clear: jest.fn().mockRejectedValue(new Error('Clear failed'))
      };

      const agentWithFailingStore = new TestAgent({
        ...baseAgentConfig,
        memoryStore: failingStore
      });

      await agentWithFailingStore.initialize();

      // Memory operations should not throw but should handle errors gracefully
      await expect((agentWithFailingStore as any).storeMemory('key', 'value')).rejects.toThrow('Storage failed');

      await agentWithFailingStore.terminate();
    });
  });

  describe('Event System', () => {
    beforeEach(async () => {
      await testAgent.initialize();
    });

    test('should emit events correctly', (done) => {
      const eventData = { test: 'data' };

      mockEventBus.on('test-event', (event) => {
        expect(event.type).toBe('test-event');
        expect(event.source).toBe(testAgent.getStatus().agentId);
        expect(event.data).toEqual(eventData);
        expect(event.priority).toBe('high');
        done();
      });

      (testAgent as any).emitEvent('test-event', eventData, 'high');
    });

    test('should broadcast messages correctly', (done) => {
      const messagePayload = { message: 'test' };

      mockEventBus.on('agent.message', (message) => {
        expect(message.from).toBe(testAgent.getStatus().agentId);
        expect(message.type).toBe('test-broadcast');
        expect(message.payload).toEqual(messagePayload);
        done();
      });

      (testAgent as any).broadcastMessage('test-broadcast', messagePayload);
    });

    test('should respond to ping events', (done) => {
      mockEventBus.on('agent.pong', (event) => {
        expect(event.data.agentId).toBe(testAgent.getStatus().agentId);
        done();
      });

      mockEventBus.emit('agent.ping', {
        target: { id: testAgent.getStatus().agentId.id }
      });
    });
  });

  describe('Capabilities', () => {
    beforeEach(async () => {
      await testAgent.initialize();
    });

    test('should check capabilities correctly', () => {
      expect(testAgent.hasCapability('test-execution')).toBe(true);
      expect(testAgent.hasCapability('test-analysis')).toBe(true);
      expect(testAgent.hasCapability('non-existent')).toBe(false);
    });

    test('should return capability details', () => {
      const capability = testAgent.getCapability('test-execution');

      expect(capability).toBeDefined();
      expect(capability!.name).toBe('test-execution');
      expect(capability!.version).toBe('1.0.0');
      expect(capability!.parameters).toEqual({ framework: 'jest' });
    });
  });

  describe('Lifecycle Management', () => {
    test('should terminate agent gracefully', async () => {
      await testAgent.initialize();

      let terminatedEventEmitted = false;
      mockEventBus.on('agent.terminated', () => {
        terminatedEventEmitted = true;
      });

      await testAgent.terminate();

      expect(testAgent.getStatus().status).toBe('terminated');
      expect(testAgent.getCleanupCalled()).toBe(true);
      expect(terminatedEventEmitted).toBe(true);
    });

    test('should handle fleet shutdown event', async () => {
      await testAgent.initialize();

      let terminatedEventEmitted = false;
      mockEventBus.on('agent.terminated', () => {
        terminatedEventEmitted = true;
      });

      mockEventBus.emit('fleet.shutdown', {});

      // Give event time to process
      await new Promise(resolve => setTimeout(resolve, 10));

      expect(terminatedEventEmitted).toBe(true);
    });
  });

  describe('Performance Metrics', () => {
    beforeEach(async () => {
      await testAgent.initialize();
    });

    test('should track performance metrics', async () => {
      const task: QETask = {
        id: 'perf-task',
        type: 'test-execution',
        payload: {},
        priority: 1,
        status: 'pending'
      };

      const assignment: TaskAssignment = {
        id: 'perf-assignment',
        task,
        agentId: testAgent.getStatus().agentId,
        assignedAt: new Date(),
        status: 'assigned'
      };

      const initialMetrics = testAgent.getStatus().performanceMetrics;
      expect(initialMetrics.tasksCompleted).toBe(0);

      await testAgent.executeTask(assignment);

      const updatedMetrics = testAgent.getStatus().performanceMetrics;
      expect(updatedMetrics.tasksCompleted).toBe(1);
      expect(updatedMetrics.averageExecutionTime).toBeGreaterThanOrEqual(0);
      expect(updatedMetrics.errorCount).toBe(0);
    });

    test('should track error metrics', async () => {
      class ErrorAgent extends TestAgent {
        protected async performTask(): Promise<any> {
          throw new Error('Task failed');
        }
      }

      const errorAgent = new ErrorAgent(baseAgentConfig);
      await errorAgent.initialize();

      const task: QETask = {
        id: 'error-task',
        type: 'test-execution',
        payload: {},
        priority: 1,
        status: 'pending'
      };

      const assignment: TaskAssignment = {
        id: 'error-assignment',
        task,
        agentId: errorAgent.getStatus().agentId,
        assignedAt: new Date(),
        status: 'assigned'
      };

      try {
        await errorAgent.executeTask(assignment);
      } catch (error) {
        // Expected to fail
      }

      const metrics = errorAgent.getStatus().performanceMetrics;
      expect(metrics.errorCount).toBe(1);
      expect(metrics.tasksCompleted).toBe(0);

      await errorAgent.terminate();
    });
  });
});