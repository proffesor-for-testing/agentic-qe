/**
 * Task Test Suite - Core Module Priority #4
 * Tests task creation, lifecycle, and execution management
 */

import { Task } from '../../src/core/Task';

describe('Task', () => {
  describe('task creation', () => {
    it('should create task with required parameters', () => {
      const task = new Task('task-1', 'test-type', { key: 'value' });

      expect(task.getId()).toBe('task-1');
      expect(task.getType()).toBe('test-type');
      expect(task.getData()).toEqual({ key: 'value' });
      expect(task.getStatus()).toBe('pending');
      expect(task.getPriority()).toBe('medium');
    });

    it('should create task with all optional parameters', () => {
      const task = new Task('task-1', 'test-type', { key: 'value' }, {
        priority: 'high',
        timeout: 5000,
        retries: 3,
        dependencies: ['task-0'],
        metadata: { source: 'test' }
      });

      expect(task.getPriority()).toBe('high');
      expect(task.getTimeout()).toBe(5000);
      expect(task.getRetries()).toBe(3);
      expect(task.getDependencies()).toEqual(['task-0']);
      expect(task.getMetadata()).toEqual({ source: 'test' });
    });

    it('should generate unique IDs when not provided', () => {
      const task1 = new Task(undefined, 'test-type', {});
      const task2 = new Task(undefined, 'test-type', {});

      expect(task1.getId()).toBeDefined();
      expect(task2.getId()).toBeDefined();
      expect(task1.getId()).not.toBe(task2.getId());
    });
  });

  describe('task lifecycle', () => {
    let task: Task;

    beforeEach(() => {
      task = new Task('test-task', 'test-type', { data: 'test' });
    });

    it('should transition through status states correctly', () => {
      expect(task.getStatus()).toBe('pending');

      task.markAsRunning();
      expect(task.getStatus()).toBe('running');
      expect(task.getStartedAt()).toBeDefined();

      task.markAsCompleted({ result: 'success' });
      expect(task.getStatus()).toBe('completed');
      expect(task.getCompletedAt()).toBeDefined();
      expect(task.getResult()).toEqual({ result: 'success' });
    });

    it('should handle task failure', () => {
      task.markAsRunning();
      const error = new Error('Task failed');
      task.markAsFailed(error);

      expect(task.getStatus()).toBe('failed');
      expect(task.getError()).toBe(error);
      expect(task.getCompletedAt()).toBeDefined();
    });

    it('should calculate execution time', () => {
      task.markAsRunning();

      // Simulate some execution time
      const startTime = task.getStartedAt()!.getTime();
      const endTime = startTime + 100;

      // Mock the completion time
      task.markAsCompleted({ result: 'success' });
      const completed = task.getCompletedAt()!;
      completed.setTime(endTime);

      expect(task.getExecutionTime()).toBe(100);
    });

    it('should prevent invalid status transitions', () => {
      task.markAsCompleted({ result: 'success' });

      expect(() => task.markAsRunning()).toThrow('Invalid status transition');
      expect(() => task.markAsFailed(new Error('test'))).toThrow('Invalid status transition');
    });
  });

  describe('task priority', () => {
    it('should handle different priority levels', () => {
      const priorities = ['low', 'medium', 'high', 'critical'] as const;

      priorities.forEach(priority => {
        const task = new Task('task', 'test', {}, { priority });
        expect(task.getPriority()).toBe(priority);
      });
    });

    it('should compare task priorities correctly', () => {
      const lowTask = new Task('low', 'test', {}, { priority: 'low' });
      const highTask = new Task('high', 'test', {}, { priority: 'high' });
      const criticalTask = new Task('critical', 'test', {}, { priority: 'critical' });

      expect(Task.comparePriority(highTask, lowTask)).toBe(1);
      expect(Task.comparePriority(lowTask, highTask)).toBe(-1);
      expect(Task.comparePriority(criticalTask, highTask)).toBe(1);
    });

    it('should sort tasks by priority', () => {
      const tasks = [
        new Task('low', 'test', {}, { priority: 'low' }),
        new Task('critical', 'test', {}, { priority: 'critical' }),
        new Task('medium', 'test', {}, { priority: 'medium' }),
        new Task('high', 'test', {}, { priority: 'high' })
      ];

      tasks.sort(Task.comparePriority);

      expect(tasks.map(t => t.getPriority())).toEqual([
        'critical', 'high', 'medium', 'low'
      ]);
    });
  });

  describe('task dependencies', () => {
    it('should check if task has dependencies', () => {
      const taskWithDeps = new Task('task-1', 'test', {}, {
        dependencies: ['task-0']
      });
      const taskWithoutDeps = new Task('task-2', 'test', {});

      expect(taskWithDeps.hasDependencies()).toBe(true);
      expect(taskWithoutDeps.hasDependencies()).toBe(false);
    });

    it('should add and remove dependencies', () => {
      const task = new Task('task-1', 'test', {});

      task.addDependency('task-0');
      expect(task.getDependencies()).toContain('task-0');

      task.removeDependency('task-0');
      expect(task.getDependencies()).not.toContain('task-0');
    });

    it('should check dependency satisfaction', () => {
      const task = new Task('task-1', 'test', {}, {
        dependencies: ['task-0', 'task-1']
      });

      expect(task.areDependenciesSatisfied(['task-0'])).toBe(false);
      expect(task.areDependenciesSatisfied(['task-0', 'task-1'])).toBe(true);
      expect(task.areDependenciesSatisfied(['task-0', 'task-1', 'task-2'])).toBe(true);
    });
  });

  describe('task timeout', () => {
    it('should handle task timeout', async () => {
      const task = new Task('timeout-task', 'test', {}, { timeout: 50 });

      task.markAsRunning();

      // Wait longer than timeout
      await new Promise(resolve => setTimeout(resolve, 100));

      expect(task.isTimedOut()).toBe(true);
    });

    it('should not timeout completed tasks', async () => {
      const task = new Task('quick-task', 'test', {}, { timeout: 100 });

      task.markAsRunning();
      task.markAsCompleted({ result: 'quick' });

      // Wait longer than timeout
      await new Promise(resolve => setTimeout(resolve, 150));

      expect(task.isTimedOut()).toBe(false);
    });

    it('should calculate remaining time', () => {
      const task = new Task('timed-task', 'test', {}, { timeout: 1000 });

      task.markAsRunning();
      const remainingTime = task.getRemainingTime();

      expect(remainingTime).toBeLessThanOrEqual(1000);
      expect(remainingTime).toBeGreaterThan(900); // Allow some execution time
    });
  });

  describe('task retry logic', () => {
    it('should track retry attempts', () => {
      const task = new Task('retry-task', 'test', {}, { retries: 3 });

      expect(task.getRetryCount()).toBe(0);
      expect(task.canRetry()).toBe(true);

      for (let i = 1; i <= 3; i++) {
        task.incrementRetryCount();
        expect(task.getRetryCount()).toBe(i);
      }

      expect(task.canRetry()).toBe(false);
    });

    it('should handle retry with backoff', () => {
      const task = new Task('backoff-task', 'test', {}, { retries: 2 });

      const delay1 = task.getRetryDelay();
      task.incrementRetryCount();

      const delay2 = task.getRetryDelay();
      task.incrementRetryCount();

      const delay3 = task.getRetryDelay();

      expect(delay2).toBeGreaterThan(delay1);
      expect(delay3).toBeGreaterThan(delay2);
    });
  });

  describe('task serialization', () => {
    it('should serialize task to JSON', () => {
      const task = new Task('serial-task', 'test-type', { key: 'value' }, {
        priority: 'high',
        timeout: 5000,
        metadata: { source: 'test' }
      });

      task.markAsRunning();
      task.markAsCompleted({ result: 'success' });

      const serialized = task.toJSON();

      expect(serialized).toMatchObject({
        id: 'serial-task',
        type: 'test-type',
        status: 'completed',
        priority: 'high',
        timeout: 5000,
        data: { key: 'value' },
        metadata: { source: 'test' },
        result: { result: 'success' }
      });

      expect(serialized.startedAt).toBeDefined();
      expect(serialized.completedAt).toBeDefined();
    });

    it('should deserialize task from JSON', () => {
      const taskData = {
        id: 'deserial-task',
        type: 'test-type',
        status: 'pending',
        priority: 'high',
        data: { key: 'value' },
        timeout: 5000,
        retries: 3,
        dependencies: ['task-0'],
        metadata: { source: 'test' }
      };

      const task = Task.fromJSON(taskData);

      expect(task.getId()).toBe('deserial-task');
      expect(task.getType()).toBe('test-type');
      expect(task.getStatus()).toBe('pending');
      expect(task.getPriority()).toBe('high');
      expect(task.getData()).toEqual({ key: 'value' });
      expect(task.getTimeout()).toBe(5000);
      expect(task.getRetries()).toBe(3);
      expect(task.getDependencies()).toEqual(['task-0']);
      expect(task.getMetadata()).toEqual({ source: 'test' });
    });
  });
});