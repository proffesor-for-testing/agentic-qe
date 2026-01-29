/**
 * Agentic QE v3 - Performance Baseline Worker Unit Tests
 * ADR-014: Background Workers for QE Monitoring
 *
 * TDD Tests for PerformanceBaselineWorker
 * Tests performance baseline tracking and anomaly detection
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { PerformanceBaselineWorker } from '../../../../src/workers/workers/performance-baseline';
import { WorkerContext } from '../../../../src/workers/interfaces';

function createMockContext(overrides: Partial<{
  previousBaseline: unknown;
}> = {}): WorkerContext {
  const { previousBaseline } = overrides;

  return {
    eventBus: {
      publish: vi.fn().mockResolvedValue(undefined),
    },
    memory: {
      get: vi.fn().mockImplementation((key: string) => {
        if (key === 'perf:baseline' && previousBaseline) {
          return Promise.resolve(previousBaseline);
        }
        return Promise.resolve(undefined);
      }),
      set: vi.fn().mockResolvedValue(undefined),
      search: vi.fn().mockResolvedValue([]),
    },
    logger: {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    },
    domains: {
      getDomainAPI: vi.fn().mockReturnValue({}),
      getDomainHealth: vi.fn().mockReturnValue({ status: 'healthy', errors: [] }),
    },
    signal: new AbortController().signal,
  };
}

describe('PerformanceBaselineWorker', () => {
  let worker: PerformanceBaselineWorker;

  beforeEach(() => {
    worker = new PerformanceBaselineWorker();
  });

  describe('instantiation', () => {
    it('should be instantiated with correct config', () => {
      expect(worker.config.id).toBe('performance-baseline');
      expect(worker.config.name).toBe('Performance Baseline Tracker');
      expect(worker.config.priority).toBe('normal');
      expect(worker.config.targetDomains).toContain('test-execution');
      expect(worker.config.targetDomains).toContain('chaos-resilience');
    });

    it('should have 1 hour interval', () => {
      expect(worker.config.intervalMs).toBe(60 * 60 * 1000);
    });

    it('should have correct timeout and retry settings', () => {
      expect(worker.config.timeoutMs).toBe(300000);
      expect(worker.config.retryCount).toBe(2);
    });

    it('should start in idle status', () => {
      expect(worker.status).toBe('idle');
    });
  });

  describe('execute - successful tracking', () => {
    it('should execute successfully', async () => {
      const context = createMockContext();

      const result = await worker.execute(context);

      expect(result.success).toBe(true);
      expect(result.workerId).toBe('performance-baseline');
    });

    it('should return performance metrics', async () => {
      const context = createMockContext();

      const result = await worker.execute(context);

      expect(result.metrics.domainMetrics).toBeDefined();
      expect(Object.keys(result.metrics.domainMetrics).length).toBeGreaterThan(0);
    });

    it('should store baseline in memory', async () => {
      const context = createMockContext();

      await worker.execute(context);

      expect(context.memory.set).toHaveBeenCalled();
    });

    it('should publish worker.executed event', async () => {
      const context = createMockContext();

      await worker.execute(context);

      expect(context.eventBus.publish).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'worker.executed',
          workerId: 'performance-baseline',
        })
      );
    });
  });

  describe('health score calculation', () => {
    it('should calculate health score between 0 and 100', async () => {
      const context = createMockContext();

      const result = await worker.execute(context);

      expect(result.metrics.healthScore).toBeGreaterThanOrEqual(0);
      expect(result.metrics.healthScore).toBeLessThanOrEqual(100);
    });
  });

  describe('lifecycle methods', () => {
    it('should initialize correctly', async () => {
      await worker.initialize();
      expect(worker.status).toBe('idle');
      expect(worker.nextRunAt).toBeDefined();
    });

    it('should pause and resume', () => {
      worker.pause();
      expect(worker.status).toBe('paused');

      worker.resume();
      expect(worker.status).toBe('idle');
    });

    it('should stop', async () => {
      await worker.stop();
      expect(worker.status).toBe('stopped');
    });
  });

  describe('health tracking', () => {
    it('should track health after successful execution', async () => {
      const context = createMockContext();

      await worker.execute(context);
      const health = worker.getHealth();

      expect(health.totalExecutions).toBe(1);
      expect(health.successfulExecutions).toBe(1);
      expect(health.failedExecutions).toBe(0);
    });
  });
});
