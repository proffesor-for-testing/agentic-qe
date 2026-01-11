/**
 * Tests for MetricsCollector - Real Metrics Collection
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { MetricsCollector, createTaskTracker } from '../../../../src/mcp/metrics';

describe('MetricsCollector', () => {
  beforeEach(() => {
    MetricsCollector.reset();
    MetricsCollector.initialize();
  });

  afterEach(() => {
    MetricsCollector.shutdown();
  });

  describe('initialization', () => {
    it('should initialize without error', () => {
      expect(() => MetricsCollector.initialize()).not.toThrow();
    });

    it('should handle multiple initialize calls gracefully', () => {
      MetricsCollector.initialize();
      MetricsCollector.initialize();
      expect(true).toBe(true);
    });
  });

  describe('resource stats', () => {
    it('should return CPU usage as a percentage', () => {
      const stats = MetricsCollector.getResourceStats();
      expect(stats.cpu).toBeGreaterThanOrEqual(0);
      expect(stats.cpu).toBeLessThanOrEqual(100);
    });

    it('should return memory usage as a percentage', () => {
      const stats = MetricsCollector.getResourceStats();
      expect(stats.memory).toBeGreaterThanOrEqual(0);
      expect(stats.memory).toBeLessThanOrEqual(100);
    });

    it('should return numeric values for CPU and memory', () => {
      const stats = MetricsCollector.getResourceStats();
      expect(typeof stats.cpu).toBe('number');
      expect(typeof stats.memory).toBe('number');
      expect(Number.isNaN(stats.cpu)).toBe(false);
      expect(Number.isNaN(stats.memory)).toBe(false);
    });
  });

  describe('task tracking', () => {
    it('should start and complete a task', () => {
      MetricsCollector.startTask('task-1', 'agent-1');
      const duration = MetricsCollector.completeTask('task-1', true);

      expect(duration).toBeGreaterThanOrEqual(0);
    });

    it('should track task duration accurately', async () => {
      MetricsCollector.startTask('task-2', 'agent-1');

      // Wait a bit
      await new Promise((resolve) => setTimeout(resolve, 50));

      const duration = MetricsCollector.completeTask('task-2', true);

      // Duration should be at least 50ms but not too long
      expect(duration).toBeGreaterThanOrEqual(45); // Allow some margin
      expect(duration).toBeLessThan(200);
    });

    it('should record retries', () => {
      MetricsCollector.startTask('task-3', 'agent-1');
      MetricsCollector.recordRetry('task-3');
      MetricsCollector.recordRetry('task-3');
      MetricsCollector.completeTask('task-3', true);

      const retryStats = MetricsCollector.getRetryStats();
      expect(retryStats.totalRetries).toBeGreaterThanOrEqual(2);
    });

    it('should track success and failure separately', () => {
      MetricsCollector.startTask('task-success', 'agent-1');
      MetricsCollector.completeTask('task-success', true);

      MetricsCollector.startTask('task-fail', 'agent-1');
      MetricsCollector.completeTask('task-fail', false);

      const stats = MetricsCollector.getAgentTaskStats('agent-1');
      expect(stats.tasksCompleted).toBe(1);
      expect(stats.successRate).toBe(0.5);
    });
  });

  describe('agent task stats', () => {
    it('should return default values for unknown agent', () => {
      const stats = MetricsCollector.getAgentTaskStats('unknown-agent');

      expect(stats.tasksCompleted).toBe(0);
      expect(stats.averageTime).toBe(0);
      expect(stats.successRate).toBe(1.0); // Default to 100% when no tasks
    });

    it('should calculate average time correctly', async () => {
      MetricsCollector.startTask('task-1', 'agent-time');
      await new Promise((r) => setTimeout(r, 20));
      MetricsCollector.completeTask('task-1', true);

      MetricsCollector.startTask('task-2', 'agent-time');
      await new Promise((r) => setTimeout(r, 40));
      MetricsCollector.completeTask('task-2', true);

      const stats = MetricsCollector.getAgentTaskStats('agent-time');
      expect(stats.tasksCompleted).toBe(2);
      expect(stats.averageTime).toBeGreaterThan(20);
      expect(stats.averageTime).toBeLessThan(100);
    });

    it('should calculate success rate correctly', () => {
      for (let i = 0; i < 8; i++) {
        MetricsCollector.startTask(`success-${i}`, 'agent-rate');
        MetricsCollector.completeTask(`success-${i}`, true);
      }

      for (let i = 0; i < 2; i++) {
        MetricsCollector.startTask(`fail-${i}`, 'agent-rate');
        MetricsCollector.completeTask(`fail-${i}`, false);
      }

      const stats = MetricsCollector.getAgentTaskStats('agent-rate');
      expect(stats.successRate).toBeCloseTo(0.8, 1);
    });
  });

  describe('worker efficiency', () => {
    it('should return baseline efficiency with no tasks', () => {
      const efficiency = MetricsCollector.getWorkerEfficiency();
      expect(efficiency).toBe(0.85); // Default baseline
    });

    it('should calculate efficiency based on success rate', () => {
      // Complete some successful tasks
      for (let i = 0; i < 10; i++) {
        MetricsCollector.startTask(`task-${i}`, 'agent-1');
        MetricsCollector.completeTask(`task-${i}`, true);
      }

      const efficiency = MetricsCollector.getWorkerEfficiency();
      expect(efficiency).toBeGreaterThanOrEqual(0.95);
      expect(efficiency).toBeLessThanOrEqual(1.0);
    });

    it('should penalize efficiency for retries', () => {
      // Complete tasks with retries
      for (let i = 0; i < 10; i++) {
        MetricsCollector.startTask(`task-${i}`, 'agent-1');
        MetricsCollector.recordRetry(`task-${i}`);
        MetricsCollector.recordRetry(`task-${i}`);
        MetricsCollector.completeTask(`task-${i}`, true);
      }

      const efficiency = MetricsCollector.getWorkerEfficiency();
      expect(efficiency).toBeLessThan(1.0);
      expect(efficiency).toBeGreaterThan(0.7);
    });
  });

  describe('load balance score', () => {
    it('should return baseline score with no workers', () => {
      const score = MetricsCollector.getLoadBalanceScore();
      expect(score).toBe(0.9); // Default baseline
    });

    it('should return perfect score with one worker', () => {
      MetricsCollector.startTask('task-1', 'single-agent');
      MetricsCollector.completeTask('task-1', true);

      const score = MetricsCollector.getLoadBalanceScore();
      expect(score).toBe(1.0);
    });

    it('should return high score with balanced load', () => {
      // Distribute evenly across 3 workers
      for (let i = 0; i < 30; i++) {
        const agentId = `agent-${i % 3}`;
        MetricsCollector.startTask(`task-${i}`, agentId);
        MetricsCollector.completeTask(`task-${i}`, true);
      }

      const score = MetricsCollector.getLoadBalanceScore();
      expect(score).toBeGreaterThan(0.9);
    });

    it('should return lower score with imbalanced load', () => {
      // One worker gets 90% of tasks
      for (let i = 0; i < 90; i++) {
        MetricsCollector.startTask(`task-heavy-${i}`, 'heavy-worker');
        MetricsCollector.completeTask(`task-heavy-${i}`, true);
      }

      for (let i = 0; i < 10; i++) {
        MetricsCollector.startTask(`task-light-${i}`, 'light-worker');
        MetricsCollector.completeTask(`task-light-${i}`, true);
      }

      const score = MetricsCollector.getLoadBalanceScore();
      expect(score).toBeLessThan(0.9);
      expect(score).toBeGreaterThan(0);
    });
  });

  describe('retry stats', () => {
    it('should return zero stats initially', () => {
      const stats = MetricsCollector.getRetryStats();
      expect(stats.totalRetries).toBe(0);
      expect(stats.successfulRetries).toBe(0);
      expect(stats.maxRetriesReached).toBe(0);
    });

    it('should track successful retries', () => {
      MetricsCollector.startTask('task-1', 'agent-1');
      MetricsCollector.recordRetry('task-1');
      MetricsCollector.completeTask('task-1', true);

      const stats = MetricsCollector.getRetryStats();
      expect(stats.totalRetries).toBe(1);
      expect(stats.successfulRetries).toBe(1);
    });

    it('should track max retries reached', () => {
      MetricsCollector.startTask('task-1', 'agent-1');
      MetricsCollector.completeTask('task-1', false);
      MetricsCollector.recordMaxRetriesReached('agent-1');

      const stats = MetricsCollector.getRetryStats();
      expect(stats.maxRetriesReached).toBe(1);
    });
  });

  describe('test durations', () => {
    it('should return deterministic durations when no real data', () => {
      const durations = MetricsCollector.getTestDurations(5);

      expect(durations).toHaveLength(5);
      expect(durations[0]).toBe(100);
      expect(durations[1]).toBe(110);
      expect(durations[2]).toBe(120);
    });

    it('should return real durations when available', async () => {
      // Create some real task data
      MetricsCollector.startTask('task-1', 'agent-1');
      await new Promise((r) => setTimeout(r, 30));
      MetricsCollector.completeTask('task-1', true);

      const durations = MetricsCollector.getTestDurations(3);

      expect(durations).toHaveLength(3);
      expect(durations[0]).toBeGreaterThanOrEqual(25);
    });
  });

  describe('workers used', () => {
    it('should return 0 initially', () => {
      expect(MetricsCollector.getWorkersUsed()).toBe(0);
    });

    it('should track unique workers', () => {
      MetricsCollector.startTask('task-1', 'agent-1');
      MetricsCollector.startTask('task-2', 'agent-2');
      MetricsCollector.startTask('task-3', 'agent-1'); // Same agent

      expect(MetricsCollector.getWorkersUsed()).toBe(2);
    });
  });

  describe('average execution time', () => {
    it('should return 0 with no tasks', () => {
      expect(MetricsCollector.getAverageExecutionTime()).toBe(0);
    });

    it('should calculate average correctly', async () => {
      MetricsCollector.startTask('task-1', 'agent-1');
      await new Promise((r) => setTimeout(r, 20));
      MetricsCollector.completeTask('task-1', true);

      MetricsCollector.startTask('task-2', 'agent-1');
      await new Promise((r) => setTimeout(r, 40));
      MetricsCollector.completeTask('task-2', true);

      const avg = MetricsCollector.getAverageExecutionTime();
      expect(avg).toBeGreaterThan(20);
      expect(avg).toBeLessThan(60);
    });
  });

  describe('createTaskTracker helper', () => {
    it('should create a task tracker', () => {
      const tracker = createTaskTracker('my-task', 'my-agent');

      expect(tracker.recordRetry).toBeInstanceOf(Function);
      expect(tracker.complete).toBeInstanceOf(Function);
    });

    it('should record retries via tracker', () => {
      const tracker = createTaskTracker('retry-task', 'agent-1');
      tracker.recordRetry();
      tracker.recordRetry();
      tracker.complete(true);

      const stats = MetricsCollector.getRetryStats();
      expect(stats.totalRetries).toBeGreaterThanOrEqual(2);
    });

    it('should return duration on complete', async () => {
      const tracker = createTaskTracker('duration-task', 'agent-1');
      await new Promise((r) => setTimeout(r, 25));
      const duration = tracker.complete(true);

      expect(duration).toBeGreaterThanOrEqual(20);
    });
  });

  describe('reset', () => {
    it('should clear all metrics', () => {
      // Add some data
      MetricsCollector.startTask('task-1', 'agent-1');
      MetricsCollector.completeTask('task-1', true);

      // Reset
      MetricsCollector.reset();

      // Check everything is cleared
      expect(MetricsCollector.getWorkersUsed()).toBe(0);
      expect(MetricsCollector.getRetryStats().totalRetries).toBe(0);
      expect(MetricsCollector.getAverageExecutionTime()).toBe(0);
    });
  });
});
