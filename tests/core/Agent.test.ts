/**
 * Agent Test Suite - Core Module Priority #2
 * Tests base agent functionality, lifecycle, and task execution
 */

import { Agent } from '../../src/core/Agent';
import { Task } from '../../src/core/Task';
import { EventBus } from '../../src/core/EventBus';

class TestAgent extends Agent {
  constructor(id: string, type: string, eventBus: EventBus) {
    super(id, type, eventBus);
  }

  async executeTask(task: Task): Promise<any> {
    this.updateStatus('busy');
    await new Promise(resolve => setTimeout(resolve, 10)); // Simulate work
    this.updateStatus('idle');
    return { status: 'completed', result: `Executed ${task.getType()}` };
  }
}

describe('Agent', () => {
  let agent: TestAgent;
  let eventBus: EventBus;

  beforeEach(() => {
    eventBus = new EventBus();
    agent = new TestAgent('test-agent-1', 'test-agent', eventBus);
  });

  afterEach(async () => {
    if (agent.isRunning()) {
      await agent.stop();
    }
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
      const task = new Task('test-task', 'test-type', { data: 'test' });

      const statusPromise = new Promise(resolve => {
        const checkStatus = () => {
          if (agent.getStatus() === 'busy') {
            resolve(true);
          } else {
            setTimeout(checkStatus, 1);
          }
        };
        checkStatus();
      });

      agent.executeTask(task);
      await statusPromise;
      expect(true).toBe(true); // Status was busy during execution
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

        async executeTask(task: Task): Promise<any> {
          if (this.shouldFail) {
            this.shouldFail = false;
            throw new Error('Simulated failure');
          }
          return super.executeTask(task);
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