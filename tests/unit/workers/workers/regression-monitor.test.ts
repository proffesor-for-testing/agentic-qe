/**
 * Agentic QE v3 - Regression Monitor Worker Unit Tests
 * ADR-014: Background Workers for QE Monitoring
 *
 * TDD Tests for RegressionMonitorWorker
 * Tests regression detection across test, performance, and coverage metrics
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { RegressionMonitorWorker } from '../../../../src/workers/workers/regression-monitor';
import { WorkerContext } from '../../../../src/workers/interfaces';

interface MetricSnapshot {
  timestamp: Date;
  testPassRate: number;
  coverage: {
    line: number;
    branch: number;
  };
  avgTestDuration: number;
  failedTests: string[];
  qualityScore: number;
}

function createMockContext(overrides: Partial<{
  baseline: MetricSnapshot | undefined;
  regressionHistory: unknown[];
}> = {}): WorkerContext {
  const { baseline, regressionHistory = [] } = overrides;

  return {
    eventBus: {
      publish: vi.fn().mockResolvedValue(undefined),
    },
    memory: {
      get: vi.fn().mockImplementation((key: string) => {
        if (key === 'regression:baseline') {
          return Promise.resolve(baseline);
        }
        if (key === 'regression:history') {
          return Promise.resolve(regressionHistory);
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

describe('RegressionMonitorWorker', () => {
  let worker: RegressionMonitorWorker;

  beforeEach(() => {
    worker = new RegressionMonitorWorker();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('instantiation', () => {
    it('should be instantiated with correct config', () => {
      expect(worker.config.id).toBe('regression-monitor');
      expect(worker.config.name).toBe('Regression Monitor');
      expect(worker.config.priority).toBe('high');
      expect(worker.config.targetDomains).toContain('test-execution');
      expect(worker.config.targetDomains).toContain('coverage-analysis');
      expect(worker.config.targetDomains).toContain('quality-assessment');
    });

    it('should have 10 minute interval', () => {
      expect(worker.config.intervalMs).toBe(10 * 60 * 1000);
    });

    it('should have correct timeout and retry settings', () => {
      expect(worker.config.timeoutMs).toBe(120000);
      expect(worker.config.retryCount).toBe(2);
    });

    it('should start in idle status', () => {
      expect(worker.status).toBe('idle');
    });
  });

  describe('execute - successful monitoring', () => {
    it('should execute successfully', async () => {
      const context = createMockContext();

      const result = await worker.execute(context);

      expect(result.success).toBe(true);
      expect(result.workerId).toBe('regression-monitor');
    });

    it('should return regression metrics', async () => {
      const context = createMockContext();

      const result = await worker.execute(context);

      expect(result.metrics.domainMetrics).toHaveProperty('regressionsDetected');
    });

    it('should store baseline in memory', async () => {
      const context = createMockContext();

      await worker.execute(context);

      expect(context.memory.set).toHaveBeenCalledWith('regression:baseline', expect.any(Object));
    });

    it('should publish worker.executed event', async () => {
      const context = createMockContext();

      await worker.execute(context);

      expect(context.eventBus.publish).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'worker.executed',
          workerId: 'regression-monitor',
        })
      );
    });
  });

  describe('execute - regression detection', () => {
    it('should detect regressions when baseline exists', async () => {
      const baseline: MetricSnapshot = {
        timestamp: new Date(Date.now() - 3600000),
        testPassRate: 0.95,
        coverage: { line: 85, branch: 75 },
        avgTestDuration: 100,
        failedTests: [],
        qualityScore: 90,
      };

      const context = createMockContext({ baseline });

      const result = await worker.execute(context);

      expect(result.success).toBe(true);
      // The comparison will be performed
      expect(context.memory.get).toHaveBeenCalledWith('regression:baseline');
    });

    it('should not detect regressions without baseline', async () => {
      const context = createMockContext({ baseline: undefined });

      const result = await worker.execute(context);

      expect(result.success).toBe(true);
      // No regressions since no baseline to compare
      expect(result.metrics.domainMetrics.regressionsDetected).toBe(0);
    });
  });

  describe('health score calculation', () => {
    it('should calculate health score between 0 and 100', async () => {
      const context = createMockContext();

      const result = await worker.execute(context);

      expect(result.metrics.healthScore).toBeGreaterThanOrEqual(0);
      expect(result.metrics.healthScore).toBeLessThanOrEqual(100);
    });

    it('should have high health score when no regressions', async () => {
      const context = createMockContext();

      const result = await worker.execute(context);

      // No regressions = high health score
      expect(result.metrics.healthScore).toBeGreaterThanOrEqual(80);
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
