/**
 * Agentic QE v3 - Quality Gate Worker Unit Tests
 * ADR-014: Background Workers for QE Monitoring
 *
 * TDD Tests for QualityGateWorker
 * Tests quality gate evaluation and release readiness
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { QualityGateWorker } from '../../../../src/workers/workers/quality-gate';
import { WorkerContext } from '../../../../src/workers/interfaces';

function createMockContext(overrides: Partial<{
  gateHistory: unknown[];
}> = {}): WorkerContext {
  const { gateHistory = [] } = overrides;

  return {
    eventBus: {
      publish: vi.fn().mockResolvedValue(undefined),
    },
    memory: {
      get: vi.fn().mockImplementation((key: string) => {
        if (key === 'quality-gate:history') {
          return Promise.resolve(gateHistory);
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

describe('QualityGateWorker', () => {
  let worker: QualityGateWorker;

  beforeEach(() => {
    worker = new QualityGateWorker();
  });

  describe('instantiation', () => {
    it('should be instantiated with correct config', () => {
      expect(worker.config.id).toBe('quality-gate');
      expect(worker.config.name).toBe('Quality Gate Evaluator');
      expect(worker.config.priority).toBe('critical');
      expect(worker.config.targetDomains).toContain('quality-assessment');
    });

    it('should have 5 minute interval', () => {
      expect(worker.config.intervalMs).toBe(5 * 60 * 1000);
    });

    it('should be marked as critical priority', () => {
      expect(worker.config.priority).toBe('critical');
    });

    it('should have correct timeout and retry settings', () => {
      expect(worker.config.timeoutMs).toBe(120000);
      expect(worker.config.retryCount).toBe(2);
    });

    it('should start in idle status', () => {
      expect(worker.status).toBe('idle');
    });
  });

  describe('execute - successful evaluation', () => {
    it('should execute successfully', async () => {
      const context = createMockContext();

      const result = await worker.execute(context);

      expect(result.success).toBe(true);
      expect(result.workerId).toBe('quality-gate');
    });

    it('should return quality gate metrics', async () => {
      const context = createMockContext();

      const result = await worker.execute(context);

      expect(result.metrics.domainMetrics).toHaveProperty('passedRules');
      expect(result.metrics.domainMetrics).toHaveProperty('failedRules');
      expect(result.metrics.domainMetrics).toHaveProperty('blockers');
      expect(result.metrics.domainMetrics).toHaveProperty('releaseReady');
    });

    it('should store gate status in memory', async () => {
      const context = createMockContext();

      await worker.execute(context);

      expect(context.memory.set).toHaveBeenCalledWith('quality-gate:current', expect.any(Object));
      expect(context.memory.set).toHaveBeenCalledWith('quality-gate:lastCheck', expect.any(String));
      expect(context.memory.set).toHaveBeenCalledWith('quality-gate:history', expect.any(Array));
    });

    it('should publish worker.executed event', async () => {
      const context = createMockContext();

      await worker.execute(context);

      expect(context.eventBus.publish).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'worker.executed',
          workerId: 'quality-gate',
        })
      );
    });
  });

  describe('execute - gate evaluation', () => {
    it('should include release readiness status', async () => {
      const context = createMockContext();

      const result = await worker.execute(context);

      expect(result.metrics.domainMetrics.releaseReady).toBeDefined();
    });

    it('should detect blocking issues', async () => {
      const context = createMockContext();

      const result = await worker.execute(context);

      // Blockers count should be a number
      expect(typeof result.metrics.domainMetrics.blockers).toBe('number');
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
