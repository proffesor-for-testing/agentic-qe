/**
 * Agentic QE v3 - Test Health Worker Unit Tests
 * ADR-014: Background Workers for QE Monitoring
 *
 * TDD Tests for TestHealthWorker
 * Tests test suite health monitoring
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { TestHealthWorker } from '../../../../src/workers/workers/test-health';
import { WorkerContext } from '../../../../src/workers/interfaces';

interface TestHealthMetrics {
  totalTests: number;
  passingTests: number;
  failingTests: number;
  skippedTests: number;
  avgExecutionTimeMs: number;
  reliability: number;
  growth: {
    testsAddedLast7Days: number;
    testsRemovedLast7Days: number;
  };
}

function createMockContext(overrides: Partial<{
  previousMetrics: TestHealthMetrics | undefined;
  testRunData: Array<{
    total: number;
    passed: number;
    failed: number;
    skipped: number;
    duration: number;
  }>;
  domainAPIAvailable: boolean;
}> = {}): WorkerContext {
  const { previousMetrics, testRunData = [], domainAPIAvailable = true } = overrides;

  // Create test run keys based on data
  const testRunKeys = testRunData.map((_, i) => `test-health:run-result:${i}`);

  return {
    eventBus: {
      publish: vi.fn().mockResolvedValue(undefined),
    },
    memory: {
      get: vi.fn().mockImplementation((key: string) => {
        if (key === 'test-health:previous-metrics') {
          return Promise.resolve(previousMetrics);
        }
        if (key === 'test-health:growth-metrics') {
          return Promise.resolve({ testsAddedLast7Days: 5, testsRemovedLast7Days: 1 });
        }
        // Match test run result keys
        const runMatch = key.match(/test-health:run-result:(\d+)/);
        if (runMatch) {
          const idx = parseInt(runMatch[1], 10);
          return Promise.resolve(testRunData[idx]);
        }
        return Promise.resolve(undefined);
      }),
      set: vi.fn().mockResolvedValue(undefined),
      search: vi.fn().mockImplementation((pattern: string) => {
        if (pattern.includes('test-health:run-result:')) {
          return Promise.resolve(testRunKeys);
        }
        return Promise.resolve([]);
      }),
    },
    logger: {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    },
    domains: {
      getDomainAPI: vi.fn().mockReturnValue(domainAPIAvailable ? {} : undefined),
      getDomainHealth: vi.fn().mockReturnValue({ status: 'healthy', errors: [] }),
    },
    signal: new AbortController().signal,
  };
}

describe('TestHealthWorker', () => {
  let worker: TestHealthWorker;

  beforeEach(() => {
    worker = new TestHealthWorker();
  });

  describe('instantiation', () => {
    it('should be instantiated with correct config', () => {
      expect(worker.config.id).toBe('test-health');
      expect(worker.config.name).toBe('Test Health Monitor');
      expect(worker.config.priority).toBe('high');
      expect(worker.config.targetDomains).toContain('test-execution');
      expect(worker.config.targetDomains).toContain('test-generation');
    });

    it('should have 5 minute interval', () => {
      expect(worker.config.intervalMs).toBe(5 * 60 * 1000);
    });

    it('should have correct timeout and retry settings', () => {
      expect(worker.config.timeoutMs).toBe(60000);
      expect(worker.config.retryCount).toBe(2);
    });

    it('should start in idle status', () => {
      expect(worker.status).toBe('idle');
    });
  });

  describe('execute - successful monitoring', () => {
    it('should execute successfully', async () => {
      const context = createMockContext({
        testRunData: [
          { total: 100, passed: 95, failed: 3, skipped: 2, duration: 5000 },
          { total: 100, passed: 97, failed: 2, skipped: 1, duration: 4800 },
        ],
      });

      const result = await worker.execute(context);

      expect(result.success).toBe(true);
      expect(result.workerId).toBe('test-health');
    });

    it('should return test health metrics', async () => {
      const context = createMockContext({
        testRunData: [
          { total: 100, passed: 95, failed: 3, skipped: 2, duration: 5000 },
        ],
      });

      const result = await worker.execute(context);

      expect(result.metrics.domainMetrics).toHaveProperty('passRate');
      expect(result.metrics.domainMetrics).toHaveProperty('avgExecutionTime');
      expect(result.metrics.domainMetrics).toHaveProperty('reliability');
      expect(result.metrics.domainMetrics).toHaveProperty('totalTests');
    });

    it('should store current metrics in memory', async () => {
      const context = createMockContext({
        testRunData: [
          { total: 100, passed: 95, failed: 3, skipped: 2, duration: 5000 },
        ],
      });

      await worker.execute(context);

      expect(context.memory.set).toHaveBeenCalledWith('test-health:previous-metrics', expect.any(Object));
    });

    it('should publish worker.executed event', async () => {
      const context = createMockContext({
        testRunData: [
          { total: 100, passed: 95, failed: 3, skipped: 2, duration: 5000 },
        ],
      });

      await worker.execute(context);

      expect(context.eventBus.publish).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'worker.executed',
          workerId: 'test-health',
        })
      );
    });
  });

  describe('execute - pass rate analysis', () => {
    it('should report pass rate percentage', async () => {
      const context = createMockContext({
        testRunData: [
          { total: 100, passed: 90, failed: 8, skipped: 2, duration: 5000 },
        ],
      });

      const result = await worker.execute(context);

      const passRate = result.metrics.domainMetrics.passRate as string;
      expect(passRate).toContain('%');
    });

    it('should generate findings for low pass rate', async () => {
      const context = createMockContext({
        testRunData: [
          { total: 100, passed: 85, failed: 12, skipped: 3, duration: 5000 },
        ],
      });

      const result = await worker.execute(context);

      // 85% pass rate is below 95% threshold
      expect(result.findings.length).toBeGreaterThan(0);
    });
  });

  describe('execute - reliability analysis', () => {
    it('should report reliability metric', async () => {
      const context = createMockContext({
        testRunData: [
          { total: 100, passed: 95, failed: 3, skipped: 2, duration: 5000 },
        ],
      });

      const result = await worker.execute(context);

      const reliability = result.metrics.domainMetrics.reliability as string;
      expect(reliability).toContain('%');
    });
  });

  describe('execute - trend detection', () => {
    it('should return trend status', async () => {
      const context = createMockContext({
        testRunData: [
          { total: 100, passed: 95, failed: 3, skipped: 2, duration: 5000 },
        ],
      });

      const result = await worker.execute(context);

      expect(['improving', 'stable', 'degrading']).toContain(result.metrics.trend);
    });

    it('should compare to previous metrics when available', async () => {
      const previousMetrics: TestHealthMetrics = {
        totalTests: 100,
        passingTests: 95,
        failingTests: 3,
        skippedTests: 2,
        avgExecutionTimeMs: 100,
        reliability: 95,
        growth: {
          testsAddedLast7Days: 5,
          testsRemovedLast7Days: 1,
        },
      };

      const context = createMockContext({
        previousMetrics,
        testRunData: [
          { total: 100, passed: 97, failed: 2, skipped: 1, duration: 4800 },
        ],
      });

      const result = await worker.execute(context);

      expect(result.success).toBe(true);
      expect(context.memory.get).toHaveBeenCalledWith('test-health:previous-metrics');
    });
  });

  describe('health score calculation', () => {
    it('should calculate health score between 0 and 100', async () => {
      const context = createMockContext({
        testRunData: [
          { total: 100, passed: 95, failed: 3, skipped: 2, duration: 5000 },
        ],
      });

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
      const context = createMockContext({
        testRunData: [
          { total: 100, passed: 95, failed: 3, skipped: 2, duration: 5000 },
        ],
      });

      await worker.execute(context);
      const health = worker.getHealth();

      expect(health.totalExecutions).toBe(1);
      expect(health.successfulExecutions).toBe(1);
      expect(health.failedExecutions).toBe(0);
    });
  });
});
