/**
 * Agent Unit Tests - Comprehensive TDD Implementation
 * Testing the base Agent class with full coverage including edge cases and error scenarios
 */

import { Agent, AgentStatus, AgentCapability, AgentMetrics } from '../../src/core/Agent';
import { Task, TaskStatus } from '../../src/core/Task';
import { EventBus } from '../../src/core/EventBus';
import { Logger } from '../../src/utils/Logger';

// Mock implementations
jest.mock('../../src/utils/Logger');
jest.mock('../../src/core/EventBus');

// Test Agent implementation
class TestAgent extends Agent {
  private initializationError: Error | null = null;
  private startError: Error | null = null;
  private stopError: Error | null = null;
  private taskExecutionError: Error | null = null;
  private taskExecutionResult: any = { success: true };

  setInitializationError(error: Error | null) {
    this.initializationError = error;
  }

  setStartError(error: Error | null) {
    this.startError = error;
  }

  setStopError(error: Error | null) {
    this.stopError = error;
  }

  setTaskExecutionError(error: Error | null) {
    this.taskExecutionError = error;
  }

  setTaskExecutionResult(result: any) {
    this.taskExecutionResult = result;
  }

  protected async onInitialize(): Promise<void> {
    if (this.initializationError) {
      throw this.initializationError;
    }
  }

  protected async onStart(): Promise<void> {
    if (this.startError) {
      throw this.startError;
    }
  }

  protected async onStop(): Promise<void> {
    if (this.stopError) {
      throw this.stopError;
    }
  }

  protected async executeTaskLogic(task: Task): Promise<any> {
    if (this.taskExecutionError) {
      throw this.taskExecutionError;
    }
    return this.taskExecutionResult;
  }

  protected async initializeCapabilities(): Promise<void> {
    this.capabilities = [
      {
        name: 'test-capability',
        version: '1.0.0',
        description: 'Test capability for unit testing',
        taskTypes: ['test-task', 'validation-task']
      }
    ];
  }
}

describe('Agent', () => {
  let agent: TestAgent;
  let mockEventBus: jest.Mocked<EventBus>;
  let mockLogger: jest.Mocked<Logger>;
  let mockTask: jest.Mocked<Task>;

  beforeEach(() => {
    // Clear all mocks
    jest.clearAllMocks();

    // Create mock EventBus
    mockEventBus = {
      emit: jest.fn(),
      on: jest.fn(),
      off: jest.fn(),
      initialize: jest.fn().mockResolvedValue(undefined),
      emitFleetEvent: jest.fn().mockResolvedValue('event-id-123'),
      getEvent: jest.fn()
    } as any;

    // Create mock Logger
    mockLogger = {
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn(),
      getInstance: jest.fn().mockReturnValue(mockLogger)
    } as any;

    (Logger.getInstance as jest.Mock).mockReturnValue(mockLogger);

    // Create mock Task
    mockTask = {
      getId: jest.fn().mockReturnValue('task-123'),
      getType: jest.fn().mockReturnValue('test-task'),
      getStatus: jest.fn().mockReturnValue(TaskStatus.PENDING),
      setStatus: jest.fn(),
      setResult: jest.fn(),
      setError: jest.fn(),
      waitForCompletion: jest.fn().mockResolvedValue(undefined)
    } as any;

    // Create test agent
    agent = new TestAgent('agent-123', 'test-agent', { testConfig: true }, mockEventBus);
  });

  describe('Initialization', () => {
    it('should initialize agent successfully', async () => {
      await agent.initialize();

      expect(agent.getStatus()).toBe(AgentStatus.IDLE);
      expect(agent.getId()).toBe('agent-123');
      expect(agent.getType()).toBe('test-agent');
      expect(mockLogger.info).toHaveBeenCalledWith('Initializing agent test-agent (agent-123)');
      expect(mockLogger.info).toHaveBeenCalledWith('Agent test-agent (agent-123) initialized successfully');
    });

    it('should set agent status to ERROR on initialization failure', async () => {
      const initError = new Error('Initialization failed');
      agent.setInitializationError(initError);

      await expect(agent.initialize()).rejects.toThrow('Initialization failed');
      expect(agent.getStatus()).toBe(AgentStatus.ERROR);
      expect(mockLogger.error).toHaveBeenCalledWith('Failed to initialize agent agent-123:', initError);
    });

    it('should emit initialization events', async () => {
      const emitSpy = jest.spyOn(agent, 'emit');

      await agent.initialize();

      expect(emitSpy).toHaveBeenCalledWith('agent:initialized', {
        agentId: 'agent-123',
        type: 'test-agent'
      });
    });

    it('should initialize capabilities correctly', async () => {
      await agent.initialize();

      const capabilities = agent.getCapabilities();
      expect(capabilities).toHaveLength(1);
      expect(capabilities[0]).toEqual({
        name: 'test-capability',
        version: '1.0.0',
        description: 'Test capability for unit testing',
        taskTypes: ['test-task', 'validation-task']
      });
    });
  });

  describe('Agent Lifecycle', () => {
    beforeEach(async () => {
      await agent.initialize();
    });

    it('should start agent successfully', async () => {
      await agent.start();

      expect(agent.getStatus()).toBe(AgentStatus.ACTIVE);
      expect(mockLogger.info).toHaveBeenCalledWith('Agent test-agent (agent-123) started');
    });

    it('should reject start if not in IDLE status', async () => {
      await agent.start();

      await expect(agent.start()).rejects.toThrow('Agent agent-123 must be idle to start');
    });

    it('should handle start error', async () => {
      const startError = new Error('Start failed');
      agent.setStartError(startError);

      await expect(agent.start()).rejects.toThrow('Start failed');
    });

    it('should stop agent successfully', async () => {
      await agent.start();
      await agent.stop();

      expect(agent.getStatus()).toBe(AgentStatus.STOPPED);
      expect(mockLogger.info).toHaveBeenCalledWith('Agent test-agent (agent-123) stopped');
    });

    it('should wait for current task completion before stopping', async () => {
      await agent.start();

      // Assign a task
      await agent.assignTask(mockTask);

      // Mock task as running
      mockTask.getStatus.mockReturnValue(TaskStatus.RUNNING);

      const stopPromise = agent.stop();

      expect(mockTask.waitForCompletion).toHaveBeenCalled();
      await stopPromise;
    });

    it('should handle stop error gracefully', async () => {
      await agent.start();
      const stopError = new Error('Stop failed');
      agent.setStopError(stopError);

      await expect(agent.stop()).rejects.toThrow('Stop failed');
    });
  });

  describe('Task Assignment and Execution', () => {
    beforeEach(async () => {
      await agent.initialize();
      await agent.start();
    });

    it('should assign task successfully', async () => {
      await agent.assignTask(mockTask);

      expect(agent.getStatus()).toBe(AgentStatus.BUSY);
      expect(agent.getCurrentTask()).toBe(mockTask);
      expect(mockLogger.info).toHaveBeenCalledWith('Task task-123 assigned to agent agent-123');
    });

    it('should reject task assignment if agent not available', async () => {
      await agent.stop();

      await expect(agent.assignTask(mockTask)).rejects.toThrow(
        'Agent agent-123 is not available for task assignment'
      );
    });

    it('should reject task assignment if agent already has task', async () => {
      await agent.assignTask(mockTask);

      const anotherTask = { ...mockTask, getId: () => 'task-456' } as any;
      await expect(agent.assignTask(anotherTask)).rejects.toThrow(
        'Agent agent-123 already has an assigned task'
      );
    });

    it('should reject unsupported task type', async () => {
      mockTask.getType.mockReturnValue('unsupported-task');

      await expect(agent.assignTask(mockTask)).rejects.toThrow(
        'Agent agent-123 cannot handle task type unsupported-task'
      );
    });

    it('should execute task successfully', async () => {
      const taskResult = { data: 'test result', success: true };
      agent.setTaskExecutionResult(taskResult);

      await agent.assignTask(mockTask);

      // Wait for task execution to complete
      await new Promise(resolve => setTimeout(resolve, 10));

      expect(mockTask.setStatus).toHaveBeenCalledWith(TaskStatus.RUNNING);
      expect(mockTask.setResult).toHaveBeenCalledWith(taskResult);
      expect(mockTask.setStatus).toHaveBeenCalledWith(TaskStatus.COMPLETED);
      expect(agent.getStatus()).toBe(AgentStatus.ACTIVE);
      expect(agent.getCurrentTask()).toBeNull();
    });

    it('should handle task execution failure', async () => {
      const taskError = new Error('Task execution failed');
      agent.setTaskExecutionError(taskError);

      await agent.assignTask(mockTask);

      // Wait for task execution to complete
      await new Promise(resolve => setTimeout(resolve, 10));

      expect(mockTask.setError).toHaveBeenCalledWith(taskError);
      expect(mockTask.setStatus).toHaveBeenCalledWith(TaskStatus.FAILED);
      expect(agent.getStatus()).toBe(AgentStatus.ACTIVE);
      expect(agent.getCurrentTask()).toBeNull();
    });

    it('should emit task events during execution', async () => {
      await agent.assignTask(mockTask);

      // Wait for task execution to complete
      await new Promise(resolve => setTimeout(resolve, 10));

      expect(mockEventBus.emit).toHaveBeenCalledWith('task:started', {
        agentId: 'agent-123',
        taskId: 'task-123'
      });

      expect(mockEventBus.emit).toHaveBeenCalledWith('task:completed', expect.objectContaining({
        agentId: 'agent-123',
        taskId: 'task-123',
        result: { success: true },
        executionTime: expect.any(Number)
      }));
    });
  });

  describe('Capabilities and Task Type Handling', () => {
    beforeEach(async () => {
      await agent.initialize();
    });

    it('should correctly identify supported task types', () => {
      expect(agent.canHandleTaskType('test-task')).toBe(true);
      expect(agent.canHandleTaskType('validation-task')).toBe(true);
      expect(agent.canHandleTaskType('unsupported-task')).toBe(false);
    });

    it('should return agent capabilities', () => {
      const capabilities = agent.getCapabilities();
      expect(capabilities).toHaveLength(1);
      expect(capabilities[0].taskTypes).toContain('test-task');
      expect(capabilities[0].taskTypes).toContain('validation-task');
    });
  });

  describe('Metrics and Performance', () => {
    beforeEach(async () => {
      await agent.initialize();
      await agent.start();
    });

    it('should track task completion metrics', async () => {
      agent.setTaskExecutionResult({ success: true });

      await agent.assignTask(mockTask);
      await new Promise(resolve => setTimeout(resolve, 10));

      const metrics = agent.getMetrics();
      expect(metrics.tasksCompleted).toBe(1);
      expect(metrics.tasksFailured).toBe(0);
      expect(metrics.averageExecutionTime).toBeGreaterThan(0);
      expect(metrics.uptime).toBeGreaterThan(0);
    });

    it('should track task failure metrics', async () => {
      agent.setTaskExecutionError(new Error('Test failure'));

      await agent.assignTask(mockTask);
      await new Promise(resolve => setTimeout(resolve, 10));

      const metrics = agent.getMetrics();
      expect(metrics.tasksCompleted).toBe(0);
      expect(metrics.tasksFailured).toBe(1);
    });

    it('should calculate average execution time correctly', async () => {
      // Execute multiple tasks
      for (let i = 0; i < 3; i++) {
        const task = { ...mockTask, getId: () => `task-${i}` } as any;
        await agent.assignTask(task);
        await new Promise(resolve => setTimeout(resolve, 10));
      }

      const metrics = agent.getMetrics();
      expect(metrics.averageExecutionTime).toBeGreaterThan(0);
      expect(metrics.tasksCompleted).toBe(3);
    });
  });

  describe('Error Handling and Edge Cases', () => {
    it('should handle agent errors and set ERROR status', async () => {
      await agent.initialize();

      const error = new Error('Agent malfunction');
      agent.emit('error', error);

      expect(agent.getStatus()).toBe(AgentStatus.ERROR);
      expect(mockLogger.error).toHaveBeenCalledWith(
        'Agent agent-123 encountered an error:',
        error
      );
      expect(mockEventBus.emit).toHaveBeenCalledWith('agent:error', {
        agentId: 'agent-123',
        error
      });
    });

    it('should handle null task gracefully', async () => {
      await agent.initialize();
      await agent.start();

      expect(() => agent.getCurrentTask()).not.toThrow();
      expect(agent.getCurrentTask()).toBeNull();
    });

    it('should update last activity timestamp on task assignment', async () => {
      await agent.initialize();
      await agent.start();

      const beforeTime = new Date();
      await agent.assignTask(mockTask);

      const metrics = agent.getMetrics();
      expect(metrics.lastActivity).toBeInstanceOf(Date);
      expect(metrics.lastActivity.getTime()).toBeGreaterThanOrEqual(beforeTime.getTime());
    });
  });

  describe('Concurrent Task Handling', () => {
    beforeEach(async () => {
      await agent.initialize();
      await agent.start();
    });

    it('should handle rapid task assignments correctly', async () => {
      const tasks = Array.from({ length: 3 }, (_, i) => ({
        ...mockTask,
        getId: () => `task-${i}`,
        getType: () => 'test-task'
      } as any));

      // Try to assign multiple tasks rapidly
      await agent.assignTask(tasks[0]);

      await expect(agent.assignTask(tasks[1])).rejects.toThrow(
        'Agent agent-123 already has an assigned task'
      );
    });

    it('should be available for new tasks after completion', async () => {
      await agent.assignTask(mockTask);

      // Wait for task completion
      await new Promise(resolve => setTimeout(resolve, 20));

      expect(agent.getCurrentTask()).toBeNull();
      expect(agent.getStatus()).toBe(AgentStatus.ACTIVE);

      // Should be able to assign new task
      const newTask = { ...mockTask, getId: () => 'task-456' } as any;
      await expect(agent.assignTask(newTask)).resolves.not.toThrow();
    });
  });
});