/**
 * Comprehensive BaseAgent Test Suite - Core Functionality
 * Target: >80% coverage of BaseAgent.ts
 *
 * Focus: Core agent lifecycle, task execution, memory, events, and error handling
 * Excludes: Complex integrations (AgentDB, Learning Engine) which have separate tests
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
  TaskAssignment
} from '../../../src/types';

// Mock Database to use the manual mock from __mocks__ directory
jest.mock('../../../src/utils/Database', () => {
  const actualMock = jest.requireActual<typeof import('../../../src/utils/__mocks__/Database')>('../../../src/utils/__mocks__/Database');
  return actualMock;
});

// Mock LearningEngine to avoid database initialization issues
jest.mock('../../../src/learning/LearningEngine');

// After the mock declaration, we'll configure it in beforeEach

// Mock implementation for testing
class MockAgent extends BaseAgent {
  public initCalled = false;
  public taskCalled = false;
  public knowledgeCalled = false;
  public cleanupCalled = false;
  public shouldFail = false;

  protected async initializeComponents(): Promise<void> {
    this.initCalled = true;
    if (this.shouldFail) throw new Error('Init failed');
  }

  protected async performTask(task: QETask): Promise<any> {
    this.taskCalled = true;
    if (this.shouldFail) throw new Error('Task failed');
    return { success: true, taskId: task.id, result: 'completed' };
  }

  protected async loadKnowledge(): Promise<void> {
    this.knowledgeCalled = true;
  }

  protected async cleanup(): Promise<void> {
    this.cleanupCalled = true;
    if (this.shouldFail) throw new Error('Cleanup failed');
  }

  // Expose protected methods
  public exposeStoreMemory(key: string, value: any, ttl?: number) {
    return (this as any).storeMemory(key, value, ttl);
  }

  public exposeRetrieveMemory(key: string) {
    return (this as any).retrieveMemory(key);
  }

  public exposeStoreSharedMemory(key: string, value: any, ttl?: number) {
    return (this as any).storeSharedMemory(key, value, ttl);
  }

  public exposeRetrieveSharedMemory(agentType: AgentType, key: string) {
    return (this as any).retrieveSharedMemory(agentType, key);
  }

  public exposeEmitEvent(type: string, data: any, priority?: any) {
    return (this as any).emitEvent(type, data, priority);
  }

  public exposeBroadcastMessage(type: string, payload: any) {
    return (this as any).broadcastMessage(type, payload);
  }
}

describe('BaseAgent - Comprehensive Test Suite', () => {
  let memoryStore: SwarmMemoryManager;
  let eventBus: EventEmitter;

  const capabilities: AgentCapability[] = [
    {
      name: 'test-generation',
      version: '1.0.0',
      description: 'Generate tests',
      taskTypes: ['unit', 'integration'],
      parameters: { framework: 'jest' }
    },
    {
      name: 'code-analysis',
      version: '1.0.0',
      description: 'Analyze code',
      taskTypes: ['lint', 'scan'],
      parameters: { tool: 'eslint' }
    }
  ];

  const context: AgentContext = {
    id: 'ctx-1',
    type: 'test-generator',
    status: AgentStatus.IDLE,
    metadata: { env: 'test' }
  };

  beforeEach(async () => {
    memoryStore = new SwarmMemoryManager(':memory:');
    await memoryStore.initialize();
    eventBus = new EventEmitter();
  });

  afterEach(async () => {
    if (memoryStore) {
      await memoryStore.close();
    }
  });

  describe('Construction', () => {
    it('should construct with custom ID', () => {
      const agent = new MockAgent({
        id: 'custom-123',
        type: 'test-generator' as AgentType,
        capabilities,
        context,
        memoryStore,
        eventBus
      });

      expect(agent.getStatus().agentId.id).toBe('custom-123');
      expect(agent.getStatus().agentId.type).toBe('test-generator');
    });

    it('should generate ID if not provided', () => {
      const agent = new MockAgent({
        type: 'test-executor' as AgentType,
        capabilities,
        context,
        memoryStore,
        eventBus
      });

      expect(agent.getStatus().agentId.id).toMatch(/^test-executor-\d+/);
    });

    it('should initialize with INITIALIZING status', () => {
      const agent = new MockAgent({
        type: 'test-generator' as AgentType,
        capabilities,
        context,
        memoryStore,
        eventBus
      });

      expect(agent.getStatus().status).toBe(AgentStatus.INITIALIZING);
    });

    it('should store capabilities', () => {
      const agent = new MockAgent({
        type: 'test-generator' as AgentType,
        capabilities,
        context,
        memoryStore,
        eventBus
      });

      const caps = agent.getCapabilities();
      expect(caps).toHaveLength(2);
      expect(caps[0].name).toBe('test-generation');
      expect(caps[1].name).toBe('code-analysis');
    });
  });

  describe('Initialization', () => {
    it('should initialize successfully', async () => {
      const agent = new MockAgent({
        type: 'test-generator' as AgentType,
        capabilities,
        context,
        memoryStore,
        eventBus
      });

      await agent.initialize();

      expect(agent.initCalled).toBe(true);
      expect(agent.knowledgeCalled).toBe(true);
      expect(agent.getStatus().status).toBe(AgentStatus.ACTIVE);
    });

    it('should emit initialization event', async () => {
      const agent = new MockAgent({
        id: 'init-agent',
        type: 'test-generator' as AgentType,
        capabilities,
        context,
        memoryStore,
        eventBus
      });

      let eventEmitted = false;
      eventBus.on('agent.initialized', () => {
        eventEmitted = true;
      });

      await agent.initialize();
      expect(eventEmitted).toBe(true);
    });

    it('should handle initialization errors', async () => {
      const agent = new MockAgent({
        type: 'test-generator' as AgentType,
        capabilities,
        context,
        memoryStore,
        eventBus
      });

      agent.shouldFail = true;

      await expect(agent.initialize()).rejects.toThrow('Init failed');
      expect(agent.getStatus().status).toBe(AgentStatus.ERROR);
    });

    it('should support start() alias', async () => {
      const agent = new MockAgent({
        type: 'test-generator' as AgentType,
        capabilities,
        context,
        memoryStore,
        eventBus
      });

      await agent.start();
      expect(agent.getStatus().status).toBe(AgentStatus.ACTIVE);
      await agent.terminate();
    });
  });

  describe('Task Execution', () => {
    let agent: MockAgent;

    beforeEach(async () => {
      agent = new MockAgent({
        id: 'task-agent',
        type: 'test-executor' as AgentType,
        capabilities,
        context,
        memoryStore,
        eventBus
      });
      await agent.initialize();
    });

    afterEach(async () => {
      agent.shouldFail = false; // Reset before cleanup to avoid termination errors
      await agent.terminate();
    });

    it('should execute task via executeTask', async () => {
      const task: QETask = {
        id: 'task-1',
        type: 'unit',
        description: 'Run unit tests',
        payload: { file: 'test.ts' },
        priority: 1,
        status: 'pending'
      };

      const assignment: TaskAssignment = {
        id: 'assign-1',
        task,
        agentId: 'task-agent',
        assignedAt: new Date(),
        status: 'assigned'
      };

      const result = await agent.executeTask(assignment);

      expect(agent.taskCalled).toBe(true);
      expect(result.success).toBe(true);
      expect(result.taskId).toBe('task-1');
    });

    it('should execute task via assignTask', async () => {
      const task: QETask = {
        id: 'task-2',
        type: 'unit',
        payload: {},
        priority: 1,
        status: 'pending'
      };

      await agent.assignTask(task);
      expect(agent.taskCalled).toBe(true);
    });

    it('should validate capabilities', async () => {
      const task: QETask = {
        id: 'task-3',
        type: 'unknown',
        payload: {},
        priority: 1,
        status: 'pending',
        requirements: {
          capabilities: ['non-existent']
        }
      };

      const assignment: TaskAssignment = {
        id: 'assign-3',
        task,
        agentId: 'task-agent',
        assignedAt: new Date(),
        status: 'assigned'
      };

      await expect(agent.executeTask(assignment)).rejects.toThrow('missing required capability');
    });

    it('should handle execution errors', async () => {
      agent.shouldFail = true;

      const task: QETask = {
        id: 'task-4',
        type: 'unit',
        payload: {},
        priority: 1,
        status: 'pending'
      };

      const assignment: TaskAssignment = {
        id: 'assign-4',
        task,
        agentId: 'task-agent',
        assignedAt: new Date(),
        status: 'assigned'
      };

      await expect(agent.executeTask(assignment)).rejects.toThrow('Task failed');
      expect(agent.getStatus().status).toBe(AgentStatus.ERROR);
    });

    it('should update performance metrics on success', async () => {
      const beforeMetrics = agent.getStatus().performanceMetrics;

      const task: QETask = {
        id: 'perf-task',
        type: 'unit',
        payload: {},
        priority: 1,
        status: 'pending'
      };

      await agent.assignTask(task);

      const afterMetrics = agent.getStatus().performanceMetrics;
      expect(afterMetrics.tasksCompleted).toBe(beforeMetrics.tasksCompleted + 1);
      expect(afterMetrics.averageExecutionTime).toBeGreaterThanOrEqual(0);
    });

    it('should track error metrics', async () => {
      agent.shouldFail = true;

      const task: QETask = {
        id: 'error-task',
        type: 'unit',
        payload: {},
        priority: 1,
        status: 'pending'
      };

      try {
        await agent.assignTask(task);
      } catch (e) {
        // Expected
      }

      const metrics = agent.getStatus().performanceMetrics;
      expect(metrics.errorCount).toBe(1);
    });

    it('should reject invalid assignment', async () => {
      await expect(agent.executeTask(null as any)).rejects.toThrow('Invalid task assignment');
    });

    it('should transition to IDLE after successful task', async () => {
      const task: QETask = {
        id: 'idle-task',
        type: 'unit',
        payload: {},
        priority: 1,
        status: 'pending'
      };

      await agent.assignTask(task);
      expect(agent.getStatus().status).toBe(AgentStatus.IDLE);
    });
  });

  describe('Memory Operations', () => {
    let agent: MockAgent;

    beforeEach(async () => {
      agent = new MockAgent({
        id: 'memory-agent',
        type: 'test-executor' as AgentType,
        capabilities,
        context,
        memoryStore,
        eventBus
      });
      await agent.initialize();
    });

    afterEach(async () => {
      await agent.terminate();
    });

    it('should store and retrieve memory', async () => {
      const data = { test: 'value', num: 42 };
      await agent.exposeStoreMemory('key-1', data);
      const retrieved = await agent.exposeRetrieveMemory('key-1');
      expect(retrieved).toEqual(data);
    });

    it('should store and retrieve shared memory', async () => {
      const data = { shared: 'data' };
      await agent.exposeStoreSharedMemory('shared-key', data);
      const retrieved = await agent.exposeRetrieveSharedMemory('test-executor', 'shared-key');
      expect(retrieved).toEqual(data);
    });

    it('should return undefined/null for non-existent key', async () => {
      const result = await agent.exposeRetrieveMemory('non-existent');
      // Memory store returns null for non-existent keys
      expect(result === undefined || result === null).toBe(true);
    });

    it('should namespace agent memory correctly', async () => {
      await agent.exposeStoreMemory('ns-key', 'value');
      const direct = await memoryStore.retrieve('agent:memory-agent:ns-key');
      expect(direct).toBe('value');
    });

    it('should namespace shared memory correctly', async () => {
      await agent.exposeStoreSharedMemory('shared-ns', 'shared-value');
      const direct = await memoryStore.retrieve('shared:test-executor:shared-ns');
      expect(direct).toBe('shared-value');
    });
  });

  describe('Event System', () => {
    let agent: MockAgent;

    beforeEach(async () => {
      agent = new MockAgent({
        id: 'event-agent',
        type: 'test-executor' as AgentType,
        capabilities,
        context,
        memoryStore,
        eventBus
      });
      await agent.initialize();
    });

    afterEach(async () => {
      await agent.terminate();
    });

    it('should emit events with proper structure', (done) => {
      const data = { msg: 'test' };

      eventBus.on('custom-event', (event) => {
        expect(event.type).toBe('custom-event');
        expect(event.source.id).toBe('event-agent');
        expect(event.data).toEqual(data);
        expect(event.priority).toBe('high');
        done();
      });

      agent.exposeEmitEvent('custom-event', data, 'high');
    });

    it('should use medium priority by default', (done) => {
      eventBus.on('default-event', (event) => {
        expect(event.priority).toBe('medium');
        done();
      });

      agent.exposeEmitEvent('default-event', {});
    });

    it('should broadcast messages', (done) => {
      const payload = { broadcast: 'msg' };

      eventBus.on('agent.message', (msg) => {
        expect(msg.from.id).toBe('event-agent');
        expect(msg.to.id).toBe('broadcast');
        expect(msg.payload).toEqual(payload);
        done();
      });

      agent.exposeBroadcastMessage('test-msg', payload);
    });

    it('should respond to ping', (done) => {
      eventBus.on('agent.pong', (event) => {
        expect(event.data.agentId.id).toBe('event-agent');
        done();
      });

      eventBus.emit('agent.ping', { target: { id: 'event-agent' } });
    });

    it('should handle fleet shutdown', async () => {
      let terminated = false;
      eventBus.on('agent.terminated', () => {
        terminated = true;
      });

      eventBus.emit('fleet.shutdown', {});
      await new Promise(r => setTimeout(r, 50));

      expect(terminated).toBe(true);
    });
  });

  describe('Capabilities', () => {
    let agent: MockAgent;

    beforeEach(() => {
      agent = new MockAgent({
        type: 'test-generator' as AgentType,
        capabilities,
        context,
        memoryStore,
        eventBus
      });
    });

    it('should check capability existence', () => {
      expect(agent.hasCapability('test-generation')).toBe(true);
      expect(agent.hasCapability('code-analysis')).toBe(true);
      expect(agent.hasCapability('unknown')).toBe(false);
    });

    it('should get capability details', () => {
      const cap = agent.getCapability('test-generation');
      expect(cap?.name).toBe('test-generation');
      expect(cap?.version).toBe('1.0.0');
      expect(cap?.parameters).toEqual({ framework: 'jest' });
    });

    it('should return undefined for unknown capability', () => {
      expect(agent.getCapability('unknown')).toBeUndefined();
    });

    it('should return all capabilities', () => {
      const caps = agent.getCapabilities();
      expect(caps).toHaveLength(2);
      expect(caps.map(c => c.name)).toContain('test-generation');
      expect(caps.map(c => c.name)).toContain('code-analysis');
    });
  });

  describe('Lifecycle', () => {
    it('should transition states correctly', async () => {
      const agent = new MockAgent({
        type: 'test-executor' as AgentType,
        capabilities,
        context,
        memoryStore,
        eventBus
      });

      expect(agent.getStatus().status).toBe(AgentStatus.INITIALIZING);

      await agent.initialize();
      expect(agent.getStatus().status).toBe(AgentStatus.ACTIVE);

      const task: QETask = {
        id: 'lifecycle-task',
        type: 'unit',
        payload: {},
        priority: 1,
        status: 'pending'
      };

      await agent.assignTask(task);
      expect(agent.getStatus().status).toBe(AgentStatus.IDLE);

      await agent.terminate();
      expect(agent.getStatus().status).toBe(AgentStatus.TERMINATED);
    });

    it('should terminate gracefully', async () => {
      const agent = new MockAgent({
        type: 'test-executor' as AgentType,
        capabilities,
        context,
        memoryStore,
        eventBus
      });

      await agent.initialize();

      let eventEmitted = false;
      eventBus.on('agent.terminated', () => {
        eventEmitted = true;
      });

      await agent.terminate();

      expect(agent.cleanupCalled).toBe(true);
      expect(agent.getStatus().status).toBe(AgentStatus.TERMINATED);
      expect(eventEmitted).toBe(true);
    });

    it('should handle termination errors', async () => {
      const agent = new MockAgent({
        type: 'test-executor' as AgentType,
        capabilities,
        context,
        memoryStore,
        eventBus
      });

      // Don't fail on init, only on cleanup
      await agent.initialize();
      agent.shouldFail = true; // Fail during cleanup

      await expect(agent.terminate()).rejects.toThrow();
      expect(agent.getStatus().status).toBe(AgentStatus.ERROR);
    });
  });

  describe('State Persistence', () => {
    it('should save state on termination', async () => {
      const agent = new MockAgent({
        id: 'persist-agent',
        type: 'test-executor' as AgentType,
        capabilities,
        context,
        memoryStore,
        eventBus
      });

      await agent.initialize();

      const task: QETask = {
        id: 'task',
        type: 'unit',
        payload: {},
        priority: 1,
        status: 'pending'
      };

      await agent.assignTask(task);
      await agent.terminate();

      const saved = await memoryStore.retrieve('agent:persist-agent:state');
      expect(saved).toBeDefined();
      expect(saved.performanceMetrics.tasksCompleted).toBe(1);
    });

    it('should restore state on init', async () => {
      const initialState = {
        performanceMetrics: {
          tasksCompleted: 5,
          averageExecutionTime: 100,
          errorCount: 1,
          lastActivity: new Date()
        }
      };

      await memoryStore.store('agent:restore-agent:state', initialState);

      const agent = new MockAgent({
        id: 'restore-agent',
        type: 'test-executor' as AgentType,
        capabilities,
        context,
        memoryStore,
        eventBus
      });

      await agent.initialize();

      const metrics = agent.getStatus().performanceMetrics;
      expect(metrics.tasksCompleted).toBe(5);
      expect(metrics.errorCount).toBe(1);

      await agent.terminate();
    });
  });

  describe('Status & Metrics', () => {
    let agent: MockAgent;

    beforeEach(async () => {
      agent = new MockAgent({
        id: 'status-agent',
        type: 'test-executor' as AgentType,
        capabilities,
        context,
        memoryStore,
        eventBus
      });
      await agent.initialize();
    });

    afterEach(async () => {
      await agent.terminate();
    });

    it('should return complete status', () => {
      const status = agent.getStatus();

      expect(status.agentId.id).toBe('status-agent');
      expect(status.status).toBe(AgentStatus.ACTIVE);
      expect(status.capabilities).toHaveLength(2);
      expect(status.performanceMetrics).toBeDefined();
    });

    it('should track tasks completed', async () => {
      const task1: QETask = {
        id: 't1',
        type: 'unit',
        payload: {},
        priority: 1,
        status: 'pending'
      };

      const task2: QETask = {
        id: 't2',
        type: 'unit',
        payload: {},
        priority: 1,
        status: 'pending'
      };

      await agent.assignTask(task1);
      await agent.assignTask(task2);

      expect(agent.getStatus().performanceMetrics.tasksCompleted).toBe(2);
    });

    it('should track last activity', async () => {
      const before = new Date();

      const task: QETask = {
        id: 'activity',
        type: 'unit',
        payload: {},
        priority: 1,
        status: 'pending'
      };

      await agent.assignTask(task);

      const lastActivity = agent.getStatus().performanceMetrics.lastActivity;
      expect(lastActivity.getTime()).toBeGreaterThanOrEqual(before.getTime());
    });
  });

  describe('Learning Integration', () => {
    it('should return null when learning disabled', () => {
      const agent = new MockAgent({
        type: 'test-executor' as AgentType,
        capabilities,
        context,
        memoryStore,
        eventBus,
        enableLearning: false
      });

      expect(agent.getLearningStatus()).toBeNull();
      expect(agent.getLearnedPatterns()).toEqual([]);
    });

    it('should return null for recommendations when disabled', async () => {
      const agent = new MockAgent({
        type: 'test-executor' as AgentType,
        capabilities,
        context,
        memoryStore,
        eventBus,
        enableLearning: false
      });

      await agent.initialize();

      const rec = await agent.recommendStrategy({ test: 'state' });
      expect(rec).toBeNull();

      await agent.terminate();
    });
  });

  describe('AgentDB Integration', () => {
    it('should return null when AgentDB not configured', async () => {
      const agent = new MockAgent({
        type: 'test-executor' as AgentType,
        capabilities,
        context,
        memoryStore,
        eventBus
      });

      await agent.initialize();

      expect(agent.hasAgentDB()).toBe(false);
      expect(await agent.getAgentDBStatus()).toBeNull();

      await agent.terminate();
    });
  });
});
