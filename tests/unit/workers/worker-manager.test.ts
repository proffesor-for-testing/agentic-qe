/**
 * Agentic QE v3 - Worker Manager Unit Tests
 * ADR-014: Background Workers for QE Monitoring
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { WorkerManagerImpl } from '../../../src/workers/worker-manager';
import { BaseWorker } from '../../../src/workers/base-worker';
import {
  WorkerConfig,
  WorkerContext,
  WorkerResult,
} from '../../../src/workers/interfaces';

// Test worker implementation
class TestWorker extends BaseWorker {
  public executeCount = 0;

  constructor(id: string, config?: Partial<WorkerConfig>) {
    super({
      id,
      name: `Test Worker ${id}`,
      description: 'A test worker',
      intervalMs: 1000,
      priority: 'normal',
      targetDomains: ['test-execution'],
      enabled: true,
      timeoutMs: 5000,
      retryCount: 0,
      retryDelayMs: 100,
      ...config,
    });
  }

  protected async doExecute(_context: WorkerContext): Promise<WorkerResult> {
    this.executeCount++;
    return this.createResult(
      50,
      {
        itemsAnalyzed: 5,
        issuesFound: 1,
        healthScore: 90,
        trend: 'stable',
        domainMetrics: {},
      },
      [],
      []
    );
  }
}

describe('WorkerManager', () => {
  let manager: WorkerManagerImpl;

  beforeEach(() => {
    manager = new WorkerManagerImpl();
    vi.useFakeTimers();
  });

  afterEach(async () => {
    await manager.stopAll();
    vi.useRealTimers();
  });

  describe('register', () => {
    it('should register a worker', () => {
      const worker = new TestWorker('worker-1');
      manager.register(worker);

      expect(manager.get('worker-1')).toBe(worker);
    });

    it('should throw when registering duplicate worker', () => {
      const worker1 = new TestWorker('worker-1');
      const worker2 = new TestWorker('worker-1');

      manager.register(worker1);

      expect(() => manager.register(worker2)).toThrow('already registered');
    });
  });

  describe('unregister', () => {
    it('should unregister a worker', () => {
      const worker = new TestWorker('worker-1');
      manager.register(worker);
      manager.unregister('worker-1');

      expect(manager.get('worker-1')).toBeUndefined();
    });

    it('should handle unregistering non-existent worker', () => {
      expect(() => manager.unregister('non-existent')).not.toThrow();
    });
  });

  describe('get', () => {
    it('should return registered worker', () => {
      const worker = new TestWorker('worker-1');
      manager.register(worker);

      expect(manager.get('worker-1')).toBe(worker);
    });

    it('should return undefined for non-existent worker', () => {
      expect(manager.get('non-existent')).toBeUndefined();
    });
  });

  describe('list', () => {
    it('should return empty array when no workers registered', () => {
      expect(manager.list()).toHaveLength(0);
    });

    it('should return all registered workers', () => {
      manager.register(new TestWorker('worker-1'));
      manager.register(new TestWorker('worker-2'));
      manager.register(new TestWorker('worker-3'));

      expect(manager.list()).toHaveLength(3);
    });
  });

  describe('startAll', () => {
    it('should start all enabled workers', async () => {
      const worker1 = new TestWorker('worker-1');
      const worker2 = new TestWorker('worker-2');

      manager.register(worker1);
      manager.register(worker2);

      await manager.startAll();

      // Workers execute immediately on start
      expect(worker1.executeCount).toBe(1);
      expect(worker2.executeCount).toBe(1);
    });

    it('should not start disabled workers', async () => {
      const enabledWorker = new TestWorker('enabled');
      const disabledWorker = new TestWorker('disabled', { enabled: false });

      manager.register(enabledWorker);
      manager.register(disabledWorker);

      await manager.startAll();

      expect(enabledWorker.executeCount).toBe(1);
      expect(disabledWorker.executeCount).toBe(0);
    });
  });

  describe('stopAll', () => {
    it('should stop all workers', async () => {
      const worker1 = new TestWorker('worker-1');
      const worker2 = new TestWorker('worker-2');

      manager.register(worker1);
      manager.register(worker2);

      await manager.startAll();
      await manager.stopAll();

      expect(worker1.status).toBe('stopped');
      expect(worker2.status).toBe('stopped');
    });
  });

  describe('runNow', () => {
    it('should run a worker immediately', async () => {
      const worker = new TestWorker('worker-1');
      manager.register(worker);

      const result = await manager.runNow('worker-1');

      expect(result.success).toBe(true);
      expect(worker.executeCount).toBe(1);
    });

    it('should throw for non-existent worker', async () => {
      await expect(manager.runNow('non-existent')).rejects.toThrow('not found');
    });
  });

  describe('getHealth', () => {
    it('should return health status', async () => {
      manager.register(new TestWorker('worker-1'));
      manager.register(new TestWorker('worker-2'));

      const health = manager.getHealth();

      expect(health.totalWorkers).toBe(2);
      expect(health.runningWorkers).toBe(0);
      expect(health.healthScore).toBe(100); // All workers at 100% before first run
    });

    it('should track running workers', async () => {
      manager.register(new TestWorker('worker-1'));

      await manager.startAll();

      // After execution, worker goes back to idle
      const health = manager.getHealth();
      expect(health.totalWorkers).toBe(1);
    });

    it('should include individual worker health', async () => {
      manager.register(new TestWorker('worker-1'));
      await manager.runNow('worker-1');

      const health = manager.getHealth();

      expect(health.workers['worker-1']).toBeDefined();
      expect(health.workers['worker-1'].totalExecutions).toBe(1);
    });
  });

  describe('scheduling', () => {
    it('should schedule workers at intervals', async () => {
      const worker = new TestWorker('worker-1', { intervalMs: 1000 });
      manager.register(worker);

      await manager.startAll();
      expect(worker.executeCount).toBe(1);

      // Advance time by interval
      await vi.advanceTimersByTimeAsync(1000);
      expect(worker.executeCount).toBe(2);

      // Advance again
      await vi.advanceTimersByTimeAsync(1000);
      expect(worker.executeCount).toBe(3);
    });

    it('should stop scheduling after stopAll', async () => {
      const worker = new TestWorker('worker-1', { intervalMs: 1000 });
      manager.register(worker);

      await manager.startAll();
      await manager.stopAll();

      const countAfterStop = worker.executeCount;

      // Advance time
      await vi.advanceTimersByTimeAsync(3000);

      // Should not have executed more
      expect(worker.executeCount).toBe(countAfterStop);
    });
  });

  describe('event handling', () => {
    it('should allow subscribing to worker events', async () => {
      const eventHandler = vi.fn();
      manager.onWorkerEvent(eventHandler);

      manager.register(new TestWorker('worker-1'));
      await manager.runNow('worker-1');

      expect(eventHandler).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'worker.executed',
          workerId: 'worker-1',
        })
      );
    });

    it('should allow unsubscribing from events', async () => {
      const eventHandler = vi.fn();
      const unsubscribe = manager.onWorkerEvent(eventHandler);

      manager.register(new TestWorker('worker-1'));
      await manager.runNow('worker-1');

      expect(eventHandler).toHaveBeenCalledTimes(1);

      unsubscribe();
      await manager.runNow('worker-1');

      // Should not be called again
      expect(eventHandler).toHaveBeenCalledTimes(1);
    });
  });
});
