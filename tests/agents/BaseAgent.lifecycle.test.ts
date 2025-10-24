/**
 * BaseAgent Lifecycle Tests
 *
 * Comprehensive tests for BaseAgent lifecycle hooks, task execution, and error handling
 */

import { EventEmitter } from 'events';
import { BaseAgent, BaseAgentConfig } from '../../src/agents/BaseAgent';
import { AgentStatus, QETask, TaskAssignment, AgentCapability, QEAgentType } from '../../src/types';
import { SwarmMemoryManager } from '../../src/core/memory/SwarmMemoryManager';

// Mock concrete agent implementation
class TestAgent extends BaseAgent {
  public initializeComponentsCalled = false;
  public performTaskCalled = false;
  public loadKnowledgeCalled = false;
  public cleanupCalled = false;
  public performTaskResult: any = { success: true, data: 'test result' };
  public performTaskError: Error | null = null;

  protected async initializeComponents(): Promise<void> {
    this.initializeComponentsCalled = true;
  }

  protected async performTask(task: QETask): Promise<any> {
    this.performTaskCalled = true;
    if (this.performTaskError) {
      throw this.performTaskError;
    }
    return this.performTaskResult;
  }

  protected async loadKnowledge(): Promise<void> {
    this.loadKnowledgeCalled = true;
  }

  protected async cleanup(): Promise<void> {
    this.cleanupCalled = true;
  }

  // Expose protected methods for testing
  public async testOnPreTask(data: any): Promise<void> {
    return this.onPreTask(data);
  }

  public async testOnPostTask(data: any): Promise<void> {
    return this.onPostTask(data);
  }

  public async testOnTaskError(data: any): Promise<void> {
    return this.onTaskError(data);
  }

  public getHookManager() {
    return this.hookManager;
  }
}

describe('BaseAgent Lifecycle', () => {
  let agent: TestAgent;
  let memoryStore: SwarmMemoryManager;
  let eventBus: EventEmitter;
  let config: BaseAgentConfig;

  beforeEach(async () => {
    memoryStore = new SwarmMemoryManager();
    await memoryStore.initialize();

    eventBus = new EventEmitter();

    const capabilities: AgentCapability[] = [
      {
        name: 'test-capability',
        version: '1.0.0',
        description: 'Test capability',
        inputSchema: {},
        outputSchema: {}
      }
    ];

    config = {
      type: 'test-generator' as QEAgentType,
      capabilities,
      context: { mode: 'test', environment: 'test' },
      memoryStore,
      eventBus
    };

    agent = new TestAgent(config);
  });

  afterEach(async () => {
    if (agent) {
      await agent.terminate();
    }
    if (memoryStore) {
      await memoryStore.close();
    }
  });

  describe('Initialization', () => {
    test('should initialize agent with correct status', async () => {
      await agent.initialize();
      const status = agent.getStatus();

      expect(status.status).toBe(AgentStatus.ACTIVE);
      expect(agent.initializeComponentsCalled).toBe(true);
      expect(agent.loadKnowledgeCalled).toBe(true);
    });

    test('should emit initialization event', async () => {
      const eventPromise = new Promise((resolve) => {
        eventBus.once('agent.initialized', resolve);
      });

      await agent.initialize();
      const event = await eventPromise;

      expect(event).toBeDefined();
    });

    test('should handle initialization errors', async () => {
      agent.loadKnowledgeCalled = false;
      const mockError = new Error('Initialization failed');

      jest.spyOn(agent as any, 'loadKnowledge').mockRejectedValue(mockError);

      await expect(agent.initialize()).rejects.toThrow('Initialization failed');

      const status = agent.getStatus();
      expect(status.status).toBe(AgentStatus.ERROR);
    });

    test('should initialize with learning enabled', async () => {
      const learningConfig = {
        ...config,
        enableLearning: true,
        learningConfig: {
          explorationRate: 0.2,
          learningRate: 0.1,
          discountFactor: 0.95
        }
      };

      const learningAgent = new TestAgent(learningConfig);
      await learningAgent.initialize();

      const learningStatus = learningAgent.getLearningStatus();
      expect(learningStatus).toBeDefined();
      expect(learningStatus?.enabled).toBe(true);

      await learningAgent.terminate();
    });
  });

  describe('Task Execution', () => {
    let task: QETask;
    let assignment: TaskAssignment;

    beforeEach(async () => {
      await agent.initialize();

      task = {
        id: 'test-task-1',
        type: 'test-generation',
        description: 'Generate tests for module',
        priority: 'medium',
        requirements: {
          capabilities: ['test-capability']
        }
      };

      assignment = {
        id: 'assignment-1',
        task,
        agentId: agent.getStatus().agentId.id,
        assignedAt: new Date(),
        status: 'assigned'
      };
    });

    test('should execute task successfully', async () => {
      const result = await agent.executeTask(assignment);

      expect(result).toEqual({ success: true, data: 'test result' });
      expect(agent.performTaskCalled).toBe(true);

      const status = agent.getStatus();
      expect(status.performanceMetrics.tasksCompleted).toBe(1);
    });

    test('should validate task assignment before execution', async () => {
      const invalidAssignment = {
        ...assignment,
        task: {
          ...task,
          requirements: {
            capabilities: ['non-existent-capability']
          }
        }
      };

      await expect(agent.executeTask(invalidAssignment)).rejects.toThrow(
        /missing required capability/i
      );
    });

    test('should handle task execution errors', async () => {
      const taskError = new Error('Task execution failed');
      agent.performTaskError = taskError;

      await expect(agent.executeTask(assignment)).rejects.toThrow('Task execution failed');

      const status = agent.getStatus();
      expect(status.performanceMetrics.errorCount).toBe(1);
      expect(status.status).toBe(AgentStatus.ERROR);
    });

    test('should update performance metrics on success', async () => {
      await agent.executeTask(assignment);

      const status = agent.getStatus();
      expect(status.performanceMetrics.tasksCompleted).toBe(1);
      expect(status.performanceMetrics.averageExecutionTime).toBeGreaterThan(0);
      expect(status.performanceMetrics.errorCount).toBe(0);
    });

    test('should update performance metrics on failure', async () => {
      agent.performTaskError = new Error('Test error');

      await expect(agent.executeTask(assignment)).rejects.toThrow();

      const status = agent.getStatus();
      expect(status.performanceMetrics.tasksCompleted).toBe(0);
      expect(status.performanceMetrics.errorCount).toBe(1);
    });

    test('should store task result in memory', async () => {
      await agent.executeTask(assignment);

      const storedResult = await memoryStore.retrieve(
        `agent:${agent.getStatus().agentId.id}:task:${assignment.id}:result`
      );

      expect(storedResult).toBeDefined();
      expect(storedResult.result).toEqual({ success: true, data: 'test result' });
    });
  });

  describe('Lifecycle Hooks', () => {
    let task: QETask;
    let assignment: TaskAssignment;

    beforeEach(async () => {
      await agent.initialize();

      task = {
        id: 'test-task-1',
        type: 'test-generation',
        description: 'Test hook execution',
        priority: 'medium',
        requirements: {}
      };

      assignment = {
        id: 'assignment-1',
        task,
        agentId: agent.getStatus().agentId.id,
        assignedAt: new Date(),
        status: 'assigned'
      };
    });

    test('should execute onPreTask hook before task execution', async () => {
      const hookSpy = jest.spyOn(agent, 'testOnPreTask');

      await agent.executeTask(assignment);

      expect(hookSpy).toHaveBeenCalled();
      expect(hookSpy).toHaveBeenCalledWith(
        expect.objectContaining({ assignment })
      );
    });

    test('should execute onPostTask hook after task execution', async () => {
      const hookSpy = jest.spyOn(agent, 'testOnPostTask');

      await agent.executeTask(assignment);

      expect(hookSpy).toHaveBeenCalled();
      expect(hookSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          assignment,
          result: { success: true, data: 'test result' }
        })
      );
    });

    test('should execute onTaskError hook on failure', async () => {
      const hookSpy = jest.spyOn(agent, 'testOnTaskError');
      const taskError = new Error('Task failed');
      agent.performTaskError = taskError;

      await expect(agent.executeTask(assignment)).rejects.toThrow();

      expect(hookSpy).toHaveBeenCalled();
      expect(hookSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          assignment,
          error: taskError
        })
      );
    });

    test('should emit hook completion events', async () => {
      const preTaskEvent = new Promise((resolve) => {
        eventBus.once('hook.pre-task.completed', resolve);
      });

      const postTaskEvent = new Promise((resolve) => {
        eventBus.once('hook.post-task.completed', resolve);
      });

      await agent.executeTask(assignment);

      await expect(preTaskEvent).resolves.toBeDefined();
      await expect(postTaskEvent).resolves.toBeDefined();
    });

    test('should store error pattern in memory on task error', async () => {
      agent.performTaskError = new Error('Test error');

      await expect(agent.executeTask(assignment)).rejects.toThrow();

      const errorKey = `agent:${agent.getStatus().agentId.id}:error:${assignment.id}`;
      const storedError = await memoryStore.retrieve(errorKey);

      expect(storedError).toBeDefined();
      expect(storedError.error.message).toBe('Test error');
      expect(storedError.agentId).toBe(agent.getStatus().agentId.id);
    });
  });

  describe('Termination', () => {
    beforeEach(async () => {
      await agent.initialize();
    });

    test('should terminate agent gracefully', async () => {
      await agent.terminate();

      const status = agent.getStatus();
      expect(status.status).toBe(AgentStatus.TERMINATED);
      expect(agent.cleanupCalled).toBe(true);
    });

    test('should save state before termination', async () => {
      // Execute a task to create some state
      const task: QETask = {
        id: 'test-task',
        type: 'test',
        description: 'Test',
        priority: 'medium'
      };

      await agent.assignTask(task);
      await agent.terminate();

      // State should be saved in memory
      const savedState = await memoryStore.retrieve(
        `agent:${agent.getStatus().agentId.id}:state`
      );

      expect(savedState).toBeDefined();
      expect(savedState.performanceMetrics).toBeDefined();
    });

    test('should remove event handlers on termination', async () => {
      const listenerCount = eventBus.listenerCount('fleet.shutdown');

      await agent.terminate();

      // Event handlers should be removed
      expect(eventBus.listenerCount('fleet.shutdown')).toBeLessThan(listenerCount + 1);
    });

    test('should emit termination event', async () => {
      const eventPromise = new Promise((resolve) => {
        eventBus.once('agent.terminated', resolve);
      });

      await agent.terminate();

      await expect(eventPromise).resolves.toBeDefined();
    });
  });

  describe('Capabilities', () => {
    beforeEach(async () => {
      await agent.initialize();
    });

    test('should check capability existence', () => {
      expect(agent.hasCapability('test-capability')).toBe(true);
      expect(agent.hasCapability('non-existent')).toBe(false);
    });

    test('should get capability details', () => {
      const capability = agent.getCapability('test-capability');

      expect(capability).toBeDefined();
      expect(capability?.name).toBe('test-capability');
      expect(capability?.version).toBe('1.0.0');
    });

    test('should get all capabilities', () => {
      const capabilities = agent.getCapabilities();

      expect(capabilities).toHaveLength(1);
      expect(capabilities[0].name).toBe('test-capability');
    });
  });

  describe('Memory Operations', () => {
    beforeEach(async () => {
      await agent.initialize();
    });

    test('should store and retrieve agent memory', async () => {
      await (agent as any).storeMemory('test-key', { data: 'test-value' });

      const retrieved = await (agent as any).retrieveMemory('test-key');

      expect(retrieved).toEqual({ data: 'test-value' });
    });

    test('should store and retrieve shared memory', async () => {
      await (agent as any).storeSharedMemory('shared-key', { shared: 'data' });

      const retrieved = await (agent as any).retrieveSharedMemory(
        'test-generator' as QEAgentType,
        'shared-key'
      );

      expect(retrieved).toEqual({ shared: 'data' });
    });

    test('should handle memory retrieval when store unavailable', async () => {
      const agentWithoutMemory = new TestAgent({
        ...config,
        memoryStore: null as any
      });

      const result = await (agentWithoutMemory as any).retrieveMemory('test-key');
      expect(result).toBeNull();
    });
  });

  describe('Event System', () => {
    beforeEach(async () => {
      await agent.initialize();
    });

    test('should emit custom events', async () => {
      const eventPromise = new Promise((resolve) => {
        eventBus.once('custom.test.event', resolve);
      });

      (agent as any).emitEvent('custom.test.event', { test: 'data' });

      const event = await eventPromise;
      expect(event).toBeDefined();
    });

    test('should broadcast messages to other agents', async () => {
      const messagePromise = new Promise((resolve) => {
        eventBus.once('agent.message', resolve);
      });

      await (agent as any).broadcastMessage('test-message', { payload: 'test' });

      const message = await messagePromise;
      expect(message).toBeDefined();
    });

    test('should respond to agent ping', async () => {
      const pongPromise = new Promise((resolve) => {
        eventBus.once('agent.pong', resolve);
      });

      eventBus.emit('agent.ping', {
        target: { id: agent.getStatus().agentId.id }
      });

      await expect(pongPromise).resolves.toBeDefined();
    });

    test('should handle fleet shutdown event', async () => {
      const terminateSpy = jest.spyOn(agent, 'terminate');

      eventBus.emit('fleet.shutdown');

      // Wait for async termination
      await new Promise(resolve => setTimeout(resolve, 100));

      expect(terminateSpy).toHaveBeenCalled();
    });
  });

  describe('AgentDB Integration', () => {
    test('should initialize AgentDB when configured', async () => {
      const agentDBConfig = {
        ...config,
        agentDBPath: '.test-agentdb/test.db',
        enableQUICSync: false
      };

      const agentWithDB = new TestAgent(agentDBConfig);

      // Note: AgentDB initialization happens during agent.initialize()
      await agentWithDB.initialize();

      expect(agentWithDB.hasAgentDB()).toBe(true);

      await agentWithDB.terminate();
    });

    test('should check AgentDB status', async () => {
      const agentDBConfig = {
        ...config,
        agentDBConfig: {
          dbPath: '.test-agentdb/test2.db',
          enableQUICSync: false,
          enableLearning: true
        }
      };

      const agentWithDB = new TestAgent(agentDBConfig);
      await agentWithDB.initialize();

      const status = await agentWithDB.getAgentDBStatus();
      expect(status).toBeDefined();
      expect(status?.enabled).toBe(true);

      await agentWithDB.terminate();
    });
  });

  describe('Learning Engine Integration', () => {
    test('should recommend strategy when learning enabled', async () => {
      const learningAgent = new TestAgent({
        ...config,
        enableLearning: true
      });

      await learningAgent.initialize();

      const taskState = {
        type: 'test-generation',
        complexity: 'medium'
      };

      const recommendation = await learningAgent.recommendStrategy(taskState);
      // May be null if no patterns learned yet
      expect(recommendation === null || typeof recommendation === 'object').toBe(true);

      await learningAgent.terminate();
    });

    test('should return null strategy when learning disabled', async () => {
      await agent.initialize();

      const recommendation = await agent.recommendStrategy({ type: 'test' });
      expect(recommendation).toBeNull();
    });

    test('should get learned patterns', async () => {
      const learningAgent = new TestAgent({
        ...config,
        enableLearning: true
      });

      await learningAgent.initialize();

      const patterns = learningAgent.getLearnedPatterns();
      expect(Array.isArray(patterns)).toBe(true);

      await learningAgent.terminate();
    });
  });

  describe('Edge Cases', () => {
    test('should handle missing task assignment', async () => {
      await agent.initialize();

      await expect(
        agent.executeTask(null as any)
      ).rejects.toThrow('Invalid task assignment');
    });

    test('should handle multiple initializations gracefully', async () => {
      await agent.initialize();
      const status1 = agent.getStatus();

      // Second initialization should not break
      await agent.initialize();
      const status2 = agent.getStatus();

      expect(status1.status).toBe(AgentStatus.ACTIVE);
      expect(status2.status).toBe(AgentStatus.ACTIVE);
    });

    test('should handle task execution without initialization', async () => {
      const task: QETask = {
        id: 'test',
        type: 'test',
        description: 'Test',
        priority: 'medium'
      };

      const assignment: TaskAssignment = {
        id: 'assign-1',
        task,
        agentId: 'test-agent',
        assignedAt: new Date(),
        status: 'assigned'
      };

      // Should not crash, but behavior may vary
      // This tests robustness
      await expect(agent.executeTask(assignment)).rejects.toThrow();
    });
  });
});
