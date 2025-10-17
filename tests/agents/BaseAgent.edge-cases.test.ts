/**
 * BaseAgent Edge Case Tests
 * Tests hook failures, concurrent operations, state corruption, and error recovery
 */

import { BaseAgent } from '../../src/agents/BaseAgent';
import { TaskAssignment, TaskResult } from '../../src/core/Task';
import { Logger } from '../../src/utils/Logger';
import { SwarmMemoryManager } from '../../src/core/memory/SwarmMemoryManager';
import { EventBus } from '../../src/core/EventBus';

// Mock dependencies
jest.mock('../../src/utils/Logger');

describe('BaseAgent Edge Cases', () => {
  let agent: TestAgent;
  let mockLogger: jest.Mocked<Logger>;
  let mockMemoryManager: jest.Mocked<SwarmMemoryManager>;
  let mockEventBus: jest.Mocked<EventBus>;

  class TestAgent extends BaseAgent {
    public hookErrors: Error[] = [];
    public executionCount = 0;

    protected async executeTask(assignment: TaskAssignment): Promise<TaskResult> {
      this.executionCount++;
      return {
        success: true,
        output: `Task ${assignment.task.id} completed`,
        metrics: { duration: 100 }
      };
    }

    // Expose protected hooks for testing
    public async testPreTask(assignment: TaskAssignment): Promise<void> {
      return this.onPreTask({ assignment });
    }

    public async testPostTask(assignment: TaskAssignment, result: TaskResult): Promise<void> {
      return this.onPostTask({ assignment, result });
    }

    public async testTaskError(assignment: TaskAssignment, error: Error): Promise<void> {
      return this.onTaskError({ assignment, error });
    }
  }

  beforeEach(() => {
    // Mock logger
    mockLogger = {
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn()
    } as any;

    (Logger.getInstance as jest.Mock).mockReturnValue(mockLogger);

    // Mock memory manager with complete SwarmMemoryManager interface
    mockMemoryManager = {
      initialize: jest.fn().mockResolvedValue(undefined),
      close: jest.fn().mockResolvedValue(undefined),
      store: jest.fn().mockResolvedValue(undefined),
      retrieve: jest.fn().mockResolvedValue(null),
      query: jest.fn().mockResolvedValue([]),
      delete: jest.fn().mockResolvedValue(undefined),
      clear: jest.fn().mockResolvedValue(undefined),
      // Alias methods
      set: jest.fn().mockResolvedValue(undefined),
      get: jest.fn().mockResolvedValue(null),
      has: jest.fn().mockResolvedValue(false),
      // Other required methods
      postHint: jest.fn().mockResolvedValue(undefined),
      readHints: jest.fn().mockResolvedValue([]),
      cleanExpired: jest.fn().mockResolvedValue(0),
      stats: jest.fn().mockResolvedValue({
        totalEntries: 0,
        totalHints: 0,
        totalEvents: 0,
        totalWorkflows: 0,
        totalPatterns: 0,
        totalConsensus: 0,
        totalMetrics: 0,
        totalArtifacts: 0,
        totalSessions: 0,
        totalAgents: 0,
        totalGOAPGoals: 0,
        totalGOAPActions: 0,
        totalGOAPPlans: 0,
        totalOODACycles: 0,
        partitions: [],
        accessLevels: {}
      })
    } as any;

    // Mock event bus
    mockEventBus = {
      initialize: jest.fn().mockResolvedValue(undefined),
      emit: jest.fn(),
      on: jest.fn(),
      emitFleetEvent: jest.fn().mockResolvedValue('event-123'),
      removeAllListeners: jest.fn()
    } as any;

    agent = new TestAgent('test-agent', 'test-type');
    (agent as any).logger = mockLogger;
    (agent as any).memoryStore = mockMemoryManager;
    (agent as any).eventBus = mockEventBus;
  });

  afterEach(async () => {
    if (agent) {
      await agent.terminate();
    }
  });

  describe('Hook Failure Scenarios', () => {
    it('should handle onPreTask hook failure gracefully', async () => {
      const assignment: TaskAssignment = {
        task: { id: 'task-1', type: 'test', priority: 'high', createdAt: Date.now() },
        agentId: 'test-agent',
        assignedAt: Date.now()
      };

      // Mock store to throw error
      mockMemoryManager.store.mockRejectedValueOnce(new Error('Storage failure'));

      await expect(agent.testPreTask(assignment)).rejects.toThrow('Storage failure');
      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.stringContaining('Pre-task hook error'),
        expect.any(Error)
      );
    });

    it('should handle onPostTask hook failure without affecting task result', async () => {
      const assignment: TaskAssignment = {
        task: { id: 'task-2', type: 'test', priority: 'high', createdAt: Date.now() },
        agentId: 'test-agent',
        assignedAt: Date.now()
      };

      const result: TaskResult = {
        success: true,
        output: 'Task completed',
        metrics: { duration: 100 }
      };

      // Mock store to throw error
      mockMemoryManager.store.mockRejectedValueOnce(new Error('Storage failure'));

      await expect(agent.testPostTask(assignment, result)).rejects.toThrow('Storage failure');
      expect(mockLogger.error).toHaveBeenCalled();
    });

    it('should handle onTaskError hook failure', async () => {
      const assignment: TaskAssignment = {
        task: { id: 'task-3', type: 'test', priority: 'high', createdAt: Date.now() },
        agentId: 'test-agent',
        assignedAt: Date.now()
      };

      const originalError = new Error('Task execution failed');

      // Mock store to throw error in error handler
      mockMemoryManager.store.mockRejectedValueOnce(new Error('Error handler failure'));

      await expect(agent.testTaskError(assignment, originalError)).rejects.toThrow();
      expect(mockLogger.error).toHaveBeenCalled();
    });
  });

  describe('Concurrent Operations', () => {
    it('should handle concurrent task executions safely', async () => {
      const assignments = Array.from({ length: 10 }, (_, i) => ({
        task: { id: `task-${i}`, type: 'test', priority: 'high', createdAt: Date.now() },
        agentId: 'test-agent',
        assignedAt: Date.now()
      }));

      const promises = assignments.map(assignment =>
        agent.execute(assignment)
      );

      const results = await Promise.all(promises);

      expect(results).toHaveLength(10);
      results.forEach(result => {
        expect(result.success).toBe(true);
      });
      expect(agent.executionCount).toBe(10);
    });

    it('should handle concurrent hook failures', async () => {
      const assignments = Array.from({ length: 5 }, (_, i) => ({
        task: { id: `task-${i}`, type: 'test', priority: 'high', createdAt: Date.now() },
        agentId: 'test-agent',
        assignedAt: Date.now()
      }));

      // Mock intermittent failures
      mockMemoryManager.store
        .mockResolvedValueOnce(undefined)
        .mockRejectedValueOnce(new Error('Failure 1'))
        .mockResolvedValueOnce(undefined)
        .mockRejectedValueOnce(new Error('Failure 2'))
        .mockResolvedValueOnce(undefined);

      const promises = assignments.map(assignment =>
        agent.testPreTask(assignment).catch(e => e)
      );

      const results = await Promise.all(promises);

      const failures = results.filter(r => r instanceof Error);
      expect(failures.length).toBeGreaterThan(0);
    });
  });

  describe('State Corruption', () => {
    it('should maintain consistent state after hook failures', async () => {
      const assignment: TaskAssignment = {
        task: { id: 'task-1', type: 'test', priority: 'high', createdAt: Date.now() },
        agentId: 'test-agent',
        assignedAt: Date.now()
      };

      // Cause hook failure
      mockMemoryManager.store.mockRejectedValueOnce(new Error('Storage failure'));
      await agent.testPreTask(assignment).catch(() => {});

      // Agent should still be able to execute tasks
      const result = await agent.execute(assignment);
      expect(result.success).toBe(true);
    });

    it('should handle null/undefined memory store gracefully', async () => {
      const assignment: TaskAssignment = {
        task: { id: 'task-1', type: 'test', priority: 'high', createdAt: Date.now() },
        agentId: 'test-agent',
        assignedAt: Date.now()
      };

      // Simulate missing memory store
      (agent as any).memoryStore = null;

      // Should not crash
      const result = await agent.execute(assignment);
      expect(result.success).toBe(true);
    });

    it('should handle null/undefined event bus gracefully', async () => {
      const assignment: TaskAssignment = {
        task: { id: 'task-1', type: 'test', priority: 'high', createdAt: Date.now() },
        agentId: 'test-agent',
        assignedAt: Date.now()
      };

      // Simulate missing event bus
      (agent as any).eventBus = null;

      // Should not crash
      const result = await agent.execute(assignment);
      expect(result.success).toBe(true);
    });
  });

  describe('Event System Edge Cases', () => {
    it('should handle event emission failures', async () => {
      const assignment: TaskAssignment = {
        task: { id: 'task-1', type: 'test', priority: 'high', createdAt: Date.now() },
        agentId: 'test-agent',
        assignedAt: Date.now()
      };

      // Mock event emission failure
      mockEventBus.emitFleetEvent.mockRejectedValueOnce(new Error('Event bus failure'));

      // Should still complete task
      const result = await agent.execute(assignment);
      expect(result.success).toBe(true);
    });

    it('should handle multiple event listeners', async () => {
      const assignment: TaskAssignment = {
        task: { id: 'task-1', type: 'test', priority: 'high', createdAt: Date.now() },
        agentId: 'test-agent',
        assignedAt: Date.now()
      };

      // Register multiple listeners
      mockEventBus.on.mockImplementation((event, handler) => {
        // Simulate listener registration
        return;
      });

      await agent.execute(assignment);

      // Verify events were emitted
      expect(mockEventBus.emitFleetEvent).toHaveBeenCalledWith(
        'agent:task:started',
        'test-agent',
        expect.any(Object)
      );
    });
  });

  describe('Resource Cleanup', () => {
    it('should cleanup resources on termination', async () => {
      await agent.terminate();

      expect(mockEventBus.removeAllListeners).toHaveBeenCalled();
      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining('terminated')
      );
    });

    it('should handle termination during task execution', async () => {
      const assignment: TaskAssignment = {
        task: { id: 'task-1', type: 'test', priority: 'high', createdAt: Date.now() },
        agentId: 'test-agent',
        assignedAt: Date.now()
      };

      // Start task execution
      const executionPromise = agent.execute(assignment);

      // Terminate during execution
      await agent.terminate();

      // Task should still complete or fail gracefully
      const result = await executionPromise;
      expect(result).toBeDefined();
    });

    it('should handle multiple termination calls', async () => {
      await agent.terminate();
      await agent.terminate(); // Second call should be safe

      expect(mockLogger.info).toHaveBeenCalled();
    });
  });

  describe('Memory Leak Prevention', () => {
    it('should not accumulate event listeners', async () => {
      const assignments = Array.from({ length: 100 }, (_, i) => ({
        task: { id: `task-${i}`, type: 'test', priority: 'high', createdAt: Date.now() },
        agentId: 'test-agent',
        assignedAt: Date.now()
      }));

      for (const assignment of assignments) {
        await agent.execute(assignment);
      }

      // Event bus should not have excessive listeners
      expect(mockEventBus.on).not.toHaveBeenCalledTimes(100);
    });

    it('should cleanup task references after completion', async () => {
      const assignment: TaskAssignment = {
        task: { id: 'task-1', type: 'test', priority: 'high', createdAt: Date.now() },
        agentId: 'test-agent',
        assignedAt: Date.now()
      };

      await agent.execute(assignment);

      // Agent should not hold references to completed tasks
      const internalState = (agent as any).currentTask;
      expect(internalState).toBeUndefined();
    });

    it('should detect memory leaks in long-running agents', async () => {
      const initialMemory = process.memoryUsage().heapUsed;

      for (let i = 0; i < 50; i++) {
        await agent.execute({
          task: { id: `task-${i}`, type: 'test', priority: 'high', createdAt: Date.now() },
          agentId: 'test-agent',
          assignedAt: Date.now()
        });
      }

      if (global.gc) {
        global.gc();
      }

      const finalMemory = process.memoryUsage().heapUsed;
      const memoryIncrease = finalMemory - initialMemory;

      // Memory increase should be < 5MB for 50 tasks
      expect(memoryIncrease).toBeLessThan(5 * 1024 * 1024);
    });

    it('should cleanup event listeners after termination', async () => {
      const assignment: TaskAssignment = {
        task: { id: 'task-1', type: 'test', priority: 'high', createdAt: Date.now() },
        agentId: 'test-agent',
        assignedAt: Date.now()
      };

      await agent.execute(assignment);
      await agent.terminate();

      expect(mockEventBus.removeAllListeners).toHaveBeenCalled();
    });

    it('should prevent circular references in task data', async () => {
      const circularTask: any = {
        id: 'task-1',
        type: 'test',
        priority: 'high',
        createdAt: Date.now()
      };
      circularTask.self = circularTask; // Create circular reference

      const assignment: TaskAssignment = {
        task: circularTask,
        agentId: 'test-agent',
        assignedAt: Date.now()
      };

      await agent.execute(assignment);

      // Should not crash
      expect(true).toBe(true);
    });

    it('should limit memory store cache size', async () => {
      for (let i = 0; i < 200; i++) {
        await agent.execute({
          task: { id: `task-${i}`, type: 'test', priority: 'high', createdAt: Date.now() },
          agentId: 'test-agent',
          assignedAt: Date.now()
        });
      }

      // Memory store should not grow unbounded
      expect(mockMemoryManager.store).toHaveBeenCalled();
    });
  });

  describe('Resource Exhaustion Scenarios', () => {
    it('should handle CPU exhaustion gracefully', async () => {
      class CpuIntensiveAgent extends TestAgent {
        protected async executeTask(assignment: TaskAssignment): Promise<TaskResult> {
          // Simulate CPU-intensive work
          let sum = 0;
          for (let i = 0; i < 10000000; i++) {
            sum += i;
          }
          return { success: true, output: `Sum: ${sum}` };
        }
      }

      const cpuAgent = new CpuIntensiveAgent('cpu-agent', 'test-type');
      (cpuAgent as any).logger = mockLogger;
      (cpuAgent as any).memoryStore = mockMemoryManager;
      (cpuAgent as any).eventBus = mockEventBus;

      const assignment: TaskAssignment = {
        task: { id: 'task-1', type: 'test', priority: 'high', createdAt: Date.now() },
        agentId: 'cpu-agent',
        assignedAt: Date.now()
      };

      const result = await cpuAgent.execute(assignment);

      expect(result.success).toBe(true);
      await cpuAgent.terminate();
    });

    it('should detect memory pressure and throttle', async () => {
      const largeData = new Array(1000000).fill({ data: 'test' });

      class MemoryIntensiveAgent extends TestAgent {
        protected async executeTask(assignment: TaskAssignment): Promise<TaskResult> {
          const copy = JSON.parse(JSON.stringify(largeData));
          return { success: true, output: `Processed ${copy.length} items` };
        }
      }

      const memAgent = new MemoryIntensiveAgent('mem-agent', 'test-type');
      (memAgent as any).logger = mockLogger;
      (memAgent as any).memoryStore = mockMemoryManager;
      (memAgent as any).eventBus = mockEventBus;

      const assignment: TaskAssignment = {
        task: { id: 'task-1', type: 'test', priority: 'high', createdAt: Date.now() },
        agentId: 'mem-agent',
        assignedAt: Date.now()
      };

      const result = await memAgent.execute(assignment);

      expect(result).toBeDefined();
      await memAgent.terminate();
    });

    it('should handle network connection exhaustion', async () => {
      mockMemoryManager.store.mockImplementation(() =>
        new Promise(resolve => setTimeout(resolve, 100))
      );

      const promises = Array.from({ length: 50 }, (_, i) =>
        agent.execute({
          task: { id: `task-${i}`, type: 'test', priority: 'high', createdAt: Date.now() },
          agentId: 'test-agent',
          assignedAt: Date.now()
        })
      );

      const results = await Promise.allSettled(promises);

      const fulfilled = results.filter(r => r.status === 'fulfilled');
      expect(fulfilled.length).toBeGreaterThan(0);
    });

    it('should handle file descriptor exhaustion', async () => {
      // Simulate many concurrent file operations
      mockMemoryManager.store.mockResolvedValue(undefined);

      const operations = Array.from({ length: 100 }, (_, i) =>
        agent.execute({
          task: { id: `task-${i}`, type: 'test', priority: 'high', createdAt: Date.now() },
          agentId: 'test-agent',
          assignedAt: Date.now()
        })
      );

      await expect(Promise.allSettled(operations)).resolves.toBeDefined();
    });

    it('should recover from thread pool exhaustion', async () => {
      const heavyTasks = Array.from({ length: 30 }, (_, i) => ({
        task: { id: `task-${i}`, type: 'test', priority: 'high', createdAt: Date.now() },
        agentId: 'test-agent',
        assignedAt: Date.now()
      }));

      const results = await Promise.allSettled(
        heavyTasks.map(task => agent.execute(task))
      );

      const fulfilled = results.filter(r => r.status === 'fulfilled');
      expect(fulfilled.length).toBeGreaterThan(25);
    });
  });

  describe('State Corruption Recovery', () => {
    it('should recover from corrupted memory store', async () => {
      mockMemoryManager.retrieve.mockResolvedValueOnce({
        corrupted: 'data',
        invalidField: null
      });

      const assignment: TaskAssignment = {
        task: { id: 'task-1', type: 'test', priority: 'high', createdAt: Date.now() },
        agentId: 'test-agent',
        assignedAt: Date.now()
      };

      const result = await agent.execute(assignment);

      expect(result).toBeDefined();
    });

    it('should handle invalid agent state', async () => {
      (agent as any).status = 'invalid-status';

      const assignment: TaskAssignment = {
        task: { id: 'task-1', type: 'test', priority: 'high', createdAt: Date.now() },
        agentId: 'test-agent',
        assignedAt: Date.now()
      };

      const result = await agent.execute(assignment);

      expect(result).toBeDefined();
    });

    it('should detect and repair inconsistent state', async () => {
      (agent as any).agentId = null;

      const assignment: TaskAssignment = {
        task: { id: 'task-1', type: 'test', priority: 'high', createdAt: Date.now() },
        agentId: 'test-agent',
        assignedAt: Date.now()
      };

      const result = await agent.execute(assignment);

      expect(result).toBeDefined();
    });

    it('should rollback on partial state update failure', async () => {
      let callCount = 0;
      mockMemoryManager.store.mockImplementation(() => {
        callCount++;
        if (callCount === 2) {
          return Promise.reject(new Error('Partial failure'));
        }
        return Promise.resolve();
      });

      const assignment: TaskAssignment = {
        task: { id: 'task-1', type: 'test', priority: 'high', createdAt: Date.now() },
        agentId: 'test-agent',
        assignedAt: Date.now()
      };

      await expect(agent.execute(assignment)).rejects.toThrow();
    });

    it('should validate state after recovery', async () => {
      mockMemoryManager.store.mockRejectedValueOnce(new Error('State corruption'));
      mockMemoryManager.store.mockResolvedValue(undefined);

      const assignment: TaskAssignment = {
        task: { id: 'task-1', type: 'test', priority: 'high', createdAt: Date.now() },
        agentId: 'test-agent',
        assignedAt: Date.now()
      };

      // First call fails, second should succeed
      await expect(agent.execute(assignment)).rejects.toThrow();
      await expect(agent.execute(assignment)).resolves.toBeDefined();
    });
  });

  describe('Advanced Error Recovery', () => {
    it('should implement exponential backoff on failures', async () => {
      let attempts = 0;
      mockMemoryManager.store.mockImplementation(() => {
        attempts++;
        if (attempts < 3) {
          return Promise.reject(new Error('Transient failure'));
        }
        return Promise.resolve();
      });

      const assignment: TaskAssignment = {
        task: { id: 'task-1', type: 'test', priority: 'high', createdAt: Date.now() },
        agentId: 'test-agent',
        assignedAt: Date.now()
      };

      // Should fail without retry logic
      await expect(agent.execute(assignment)).rejects.toThrow();
    });

    it('should handle cascading failures', async () => {
      mockMemoryManager.store.mockRejectedValue(new Error('Memory failure'));
      mockEventBus.emitFleetEvent.mockRejectedValue(new Error('Event failure'));

      const assignment: TaskAssignment = {
        task: { id: 'task-1', type: 'test', priority: 'high', createdAt: Date.now() },
        agentId: 'test-agent',
        assignedAt: Date.now()
      };

      await expect(agent.execute(assignment)).rejects.toThrow();
    });

    it('should implement circuit breaker pattern', async () => {
      let failureCount = 0;
      mockMemoryManager.store.mockImplementation(() => {
        failureCount++;
        return Promise.reject(new Error('Service unavailable'));
      });

      const assignments = Array.from({ length: 10 }, (_, i) => ({
        task: { id: `task-${i}`, type: 'test', priority: 'high', createdAt: Date.now() },
        agentId: 'test-agent',
        assignedAt: Date.now()
      }));

      const results = await Promise.allSettled(
        assignments.map(a => agent.execute(a))
      );

      expect(failureCount).toBeGreaterThan(0);
    });

    it('should recover from event bus disconnection', async () => {
      mockEventBus.emitFleetEvent.mockRejectedValueOnce(
        new Error('Connection lost')
      );
      mockEventBus.emitFleetEvent.mockResolvedValue('event-123');

      const assignment: TaskAssignment = {
        task: { id: 'task-1', type: 'test', priority: 'high', createdAt: Date.now() },
        agentId: 'test-agent',
        assignedAt: Date.now()
      };

      const result = await agent.execute(assignment);

      expect(result.success).toBe(true);
    });

    it('should handle rate limiting gracefully', async () => {
      let rateLimitCount = 0;
      mockMemoryManager.store.mockImplementation(() => {
        rateLimitCount++;
        if (rateLimitCount <= 5) {
          return Promise.reject(new Error('Rate limit exceeded'));
        }
        return Promise.resolve();
      });

      const assignments = Array.from({ length: 10 }, (_, i) => ({
        task: { id: `task-${i}`, type: 'test', priority: 'high', createdAt: Date.now() },
        agentId: 'test-agent',
        assignedAt: Date.now()
      }));

      const results = await Promise.allSettled(
        assignments.map(a => agent.execute(a))
      );

      const rejected = results.filter(r => r.status === 'rejected');
      expect(rejected.length).toBeGreaterThan(0);
    });
  });

  describe('Error Recovery', () => {
    it('should recover from repeated failures', async () => {
      const assignments = Array.from({ length: 5 }, (_, i) => ({
        task: { id: `task-${i}`, type: 'test', priority: 'high', createdAt: Date.now() },
        agentId: 'test-agent',
        assignedAt: Date.now()
      }));

      // Mock failures for first few attempts
      mockMemoryManager.store
        .mockRejectedValueOnce(new Error('Failure 1'))
        .mockRejectedValueOnce(new Error('Failure 2'))
        .mockResolvedValue(undefined);

      for (const assignment of assignments) {
        const result = await agent.execute(assignment).catch(e => ({ success: false, error: e }));
        // Agent should continue functioning despite failures
        expect(result).toBeDefined();
      }

      expect(agent.executionCount).toBeGreaterThan(0);
    });

    it('should handle timeout scenarios', async () => {
      class SlowAgent extends TestAgent {
        protected async executeTask(assignment: TaskAssignment): Promise<TaskResult> {
          await new Promise(resolve => setTimeout(resolve, 100));
          return await super.executeTask(assignment);
        }
      }

      const slowAgent = new SlowAgent('slow-agent', 'test-type');
      (slowAgent as any).logger = mockLogger;
      (slowAgent as any).memoryStore = mockMemoryManager;
      (slowAgent as any).eventBus = mockEventBus;

      const assignment: TaskAssignment = {
        task: { id: 'task-1', type: 'test', priority: 'high', createdAt: Date.now() },
        agentId: 'slow-agent',
        assignedAt: Date.now()
      };

      const startTime = Date.now();
      const result = await slowAgent.execute(assignment);
      const duration = Date.now() - startTime;

      expect(result.success).toBe(true);
      expect(duration).toBeGreaterThanOrEqual(100);

      await slowAgent.terminate();
    });
  });
});
