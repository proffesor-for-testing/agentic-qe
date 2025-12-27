/**
 * Agent Test Suite - Core Module Priority #2
 * Tests base agent functionality, lifecycle, and task execution
 */

import { Agent } from '@core/Agent';
import { Task } from '@core/Task';
import { EventBus } from '@core/EventBus';
import { withFakeTimers } from '../helpers/timerTestUtils';

class TestAgent extends Agent {
  private timers: NodeJS.Timeout[] = [];

  constructor(id: string, type: string, eventBus: EventBus) {
    super(id, type, eventBus);
  }

  protected async onInitialize(): Promise<void> {
    // Test agent doesn't need special initialization
  }

  protected async onStart(): Promise<void> {
    // Test agent doesn't need special start logic
  }

  protected async onStop(): Promise<void> {
    // Test agent doesn't need special stop logic
    this.cleanup();
  }

  protected async executeTaskLogic(task: Task): Promise<any> {
    this.updateStatus('busy');
    const startTime = Date.now();

    try {
      await new Promise(resolve => {
        const timer = setTimeout(resolve, 10);
        this.timers.push(timer);
      }); // Simulate work

      this.updateStatus('idle');

      // Update metrics for success
      const executionTime = Date.now() - startTime;
      (this as any).updateMetrics(executionTime, true);

      return { status: 'completed', result: `Executed ${task.getType()}` };
    } catch (error) {
      // Update metrics for failure
      const executionTime = Date.now() - startTime;
      (this as any).updateMetrics(executionTime, false);
      throw error;
    }
  }

  protected async initializeCapabilities(): Promise<void> {
    // Test agent doesn't need capabilities setup
  }

  async executeTask(task: Task): Promise<any> {
    if (!this.isRunning()) {
      throw new Error(`Agent ${this.getId()} is not running`);
    }

    // Emit task started event
    const eventBus = (this as any).eventBus;
    eventBus.emit('agent:task-started', { agentId: this.getId(), taskId: task.getId() });

    const startTime = Date.now();

    try {
      const result = await this.executeTaskLogic(task);

      // Emit task completed event
      eventBus.emit('agent:task-completed', { agentId: this.getId(), taskId: task.getId(), result });

      return result;
    } catch (error) {
      // Update metrics for failure (in case subclass override throws before executeTaskLogic)
      const executionTime = Date.now() - startTime;
      (this as any).updateMetrics(executionTime, false);

      // Emit task failed event
      eventBus.emit('agent:task-failed', { agentId: this.getId(), taskId: task.getId(), error });
      throw error;
    }
  }

  cleanup() {
    // Clear all timers
    this.timers.forEach(timer => clearTimeout(timer));
    this.timers = [];
  }
}

describe('Agent', () => {
  let agent: TestAgent;
  let eventBus: EventBus;

  beforeEach(() => {
    jest.clearAllMocks();
    eventBus = new EventBus();
    agent = new TestAgent('test-agent-1', 'test-agent', eventBus);
  });

  afterEach(async () => {
    // Stop agent if running
    if (agent && agent.isRunning()) {
      await agent.stop();
    }

    // Clean up agent timers
    if (agent && (agent as any).cleanup) {
      (agent as any).cleanup();
    }

    // Wait for all async operations
    await new Promise(resolve => setImmediate(resolve));

    // Clean up event listeners
    if (eventBus) {
      eventBus.removeAllListeners();
    }

    // Clear all timers
    jest.clearAllTimers();

    // Clear references
    agent = null as any;
    eventBus = null as any;
  });

  describe('initialization', () => {
    it('should initialize with correct properties', () => {
      expect(agent.getId()).toBe('test-agent-1');
      expect(agent.getType()).toBe('test-agent');
      expect(agent.getStatus()).toBe('idle');
      expect(agent.isRunning()).toBe(false);
    });

    it('should start and stop correctly', async () => {
      await agent.start();
      expect(agent.isRunning()).toBe(true);
      expect(agent.getStatus()).toBe('idle');

      await agent.stop();
      expect(agent.isRunning()).toBe(false);
      expect(agent.getStatus()).toBe('stopped');
    });

    it('should handle multiple start/stop cycles', async () => {
      for (let i = 0; i < 3; i++) {
        await agent.start();
        expect(agent.isRunning()).toBe(true);

        await agent.stop();
        expect(agent.isRunning()).toBe(false);
      }
    });
  });

  describe('task execution', () => {
    beforeEach(async () => {
      await agent.start();
    });

    it('should execute tasks successfully', async () => {
      const task = new Task('test-task', 'test-type', { data: 'test' });
      const result = await agent.executeTask(task);

      expect(result.status).toBe('completed');
      expect(result.result).toContain('Executed test-type');
    });

    it('should update status during task execution', async () => {
      await withFakeTimers(async (timers) => {
        const task = new Task('test-task', 'test-type', { data: 'test' });

        let statusWasBusy = false;
        const checkTimer = setInterval(() => {
          if (agent.getStatus() === 'busy') {
            statusWasBusy = true;
            clearInterval(checkTimer);
          }
        }, 1);

        const executePromise = agent.executeTask(task);

        // Advance timers to allow the interval and setTimeout to fire
        await timers.advanceAsync(1); // Check interval fires
        await timers.advanceAsync(10); // Task completion setTimeout fires

        await executePromise;
        clearInterval(checkTimer);

        expect(statusWasBusy).toBe(true); // Status was busy during execution
      });
    });

    it('should handle task execution errors', async () => {
      const failingAgent = new class extends TestAgent {
        async executeTask(task: Task): Promise<any> {
          throw new Error('Task execution failed');
        }
      }('failing-agent', 'test-agent', eventBus);

      await failingAgent.start();
      const task = new Task('test-task', 'test-type', { data: 'test' });

      await expect(failingAgent.executeTask(task)).rejects.toThrow('Task execution failed');
      await failingAgent.stop();
    });

    it('should reject tasks when not running', async () => {
      await agent.stop();
      const task = new Task('test-task', 'test-type', { data: 'test' });

      await expect(agent.executeTask(task)).rejects.toThrow();
    });
  });

  describe('capabilities management', () => {
    beforeEach(async () => {
      await agent.start();
    });

    it('should add and remove capabilities', () => {
      agent.addCapability('test-capability');
      expect(agent.hasCapability('test-capability')).toBe(true);

      agent.removeCapability('test-capability');
      expect(agent.hasCapability('test-capability')).toBe(false);
    });

    it('should check multiple capabilities', () => {
      agent.addCapability('capability-1');
      agent.addCapability('capability-2');

      expect(agent.hasCapabilities(['capability-1', 'capability-2'])).toBe(true);
      expect(agent.hasCapabilities(['capability-1', 'nonexistent'])).toBe(false);
    });

    it('should return all capabilities', () => {
      const capabilities = ['cap1', 'cap2', 'cap3'];
      capabilities.forEach(cap => agent.addCapability(cap));

      const agentCapabilities = agent.getCapabilities();
      expect(agentCapabilities).toEqual(expect.arrayContaining(capabilities));
    });
  });

  describe('performance tracking', () => {
    beforeEach(async () => {
      await agent.start();
    });

    it('should track task completion metrics', async () => {
      const tasks = Array.from({ length: 5 }, (_, i) =>
        new Task(`task-${i}`, 'test-type', { data: i })
      );

      for (const task of tasks) {
        await agent.executeTask(task);
      }

      const performance = agent.getPerformance();
      expect(performance.tasksCompleted).toBe(5);
      expect(performance.successRate).toBe(1.0);
      expect(performance.averageExecutionTime).toBeGreaterThan(0);
    });

    it('should track failure rates', async () => {
      const failingAgent = new class extends TestAgent {
        private shouldFail = true;

        protected async executeTaskLogic(task: Task): Promise<any> {
          if (this.shouldFail) {
            this.shouldFail = false;
            throw new Error('Simulated failure');
          }
          return super.executeTaskLogic(task);
        }
      }('failing-agent', 'test-agent', eventBus);

      await failingAgent.start();

      // First task should fail
      try {
        await failingAgent.executeTask(new Task('task-1', 'test', {}));
      } catch {}

      // Second task should succeed
      await failingAgent.executeTask(new Task('task-2', 'test', {}));

      const performance = failingAgent.getPerformance();
      expect(performance.tasksCompleted).toBe(1);
      expect(performance.tasksFailed).toBe(1);
      expect(performance.successRate).toBe(0.5);

      await failingAgent.stop();
    });
  });

  describe('event handling', () => {
    beforeEach(async () => {
      await agent.start();
    });

    it('should emit events during lifecycle', async () => {
      const events: string[] = [];

      eventBus.on('agent:started', () => events.push('started'));
      eventBus.on('agent:stopped', () => events.push('stopped'));
      eventBus.on('agent:status-changed', () => events.push('status-changed'));

      await agent.stop();
      await agent.start();
      await agent.stop();

      expect(events).toContain('started');
      expect(events).toContain('stopped');
      expect(events).toContain('status-changed');
    });

    it('should emit task-related events', async () => {
      const taskEvents: string[] = [];

      eventBus.on('agent:task-started', () => taskEvents.push('task-started'));
      eventBus.on('agent:task-completed', () => taskEvents.push('task-completed'));

      const task = new Task('test-task', 'test-type', { data: 'test' });
      await agent.executeTask(task);

      expect(taskEvents).toContain('task-started');
      expect(taskEvents).toContain('task-completed');
    });
  });
});