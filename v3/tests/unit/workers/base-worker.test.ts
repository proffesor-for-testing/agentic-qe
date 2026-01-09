/**
 * Agentic QE v3 - Base Worker Unit Tests
 * ADR-014: Background Workers for QE Monitoring
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { BaseWorker } from '../../../src/workers/base-worker';
import {
  WorkerConfig,
  WorkerContext,
  WorkerResult,
  WorkerMetrics,
  WorkerFinding,
  WorkerRecommendation,
} from '../../../src/workers/interfaces';

// Test implementation of BaseWorker
class TestWorker extends BaseWorker {
  public executionCount = 0;
  public shouldFail = false;
  public executionDelay = 0;

  constructor(config?: Partial<WorkerConfig>) {
    super({
      id: 'test-worker',
      name: 'Test Worker',
      description: 'A test worker for unit testing',
      intervalMs: 60000,
      priority: 'normal',
      targetDomains: ['test-execution'],
      enabled: true,
      timeoutMs: 5000,
      retryCount: 2,
      retryDelayMs: 100,
      ...config,
    });
  }

  protected async doExecute(context: WorkerContext): Promise<WorkerResult> {
    this.executionCount++;

    if (this.executionDelay > 0) {
      await new Promise(resolve => setTimeout(resolve, this.executionDelay));
    }

    if (this.shouldFail) {
      throw new Error('Test execution failure');
    }

    const metrics: WorkerMetrics = {
      itemsAnalyzed: 10,
      issuesFound: 2,
      healthScore: 85,
      trend: 'stable',
      domainMetrics: { testMetric: 'value' },
    };

    const findings: WorkerFinding[] = [
      {
        type: 'test-finding',
        severity: 'medium',
        domain: 'test-execution',
        title: 'Test Finding',
        description: 'A test finding for unit testing',
      },
    ];

    const recommendations: WorkerRecommendation[] = [
      {
        priority: 'p2',
        domain: 'test-execution',
        action: 'Test Action',
        description: 'A test recommendation',
        estimatedImpact: 'medium',
        effort: 'low',
        autoFixable: true,
      },
    ];

    return this.createResult(100, metrics, findings, recommendations);
  }
}

function createMockContext(): WorkerContext {
  return {
    eventBus: {
      publish: vi.fn().mockResolvedValue(undefined),
    },
    memory: {
      get: vi.fn().mockResolvedValue(undefined),
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
      getDomainAPI: vi.fn().mockReturnValue(undefined),
      getDomainHealth: vi.fn().mockReturnValue({ status: 'healthy', errors: [] }),
    },
    signal: new AbortController().signal,
  };
}

describe('BaseWorker', () => {
  let worker: TestWorker;
  let context: WorkerContext;

  beforeEach(() => {
    worker = new TestWorker();
    context = createMockContext();
  });

  describe('initialization', () => {
    it('should have correct initial status', () => {
      expect(worker.status).toBe('idle');
      expect(worker.lastResult).toBeUndefined();
      expect(worker.lastRunAt).toBeUndefined();
    });

    it('should initialize successfully', async () => {
      await worker.initialize();
      expect(worker.status).toBe('idle');
      expect(worker.nextRunAt).toBeDefined();
    });

    it('should have correct config values', () => {
      expect(worker.config.id).toBe('test-worker');
      expect(worker.config.priority).toBe('normal');
      expect(worker.config.enabled).toBe(true);
    });
  });

  describe('execute', () => {
    it('should execute successfully', async () => {
      const result = await worker.execute(context);

      expect(result.success).toBe(true);
      expect(result.workerId).toBe('test-worker');
      expect(result.metrics.itemsAnalyzed).toBe(10);
      expect(result.findings).toHaveLength(1);
      expect(result.recommendations).toHaveLength(1);
    });

    it('should track execution count', async () => {
      await worker.execute(context);
      expect(worker.executionCount).toBe(1);

      await worker.execute(context);
      expect(worker.executionCount).toBe(2);
    });

    it('should update lastResult after execution', async () => {
      await worker.execute(context);

      expect(worker.lastResult).toBeDefined();
      expect(worker.lastResult?.success).toBe(true);
    });

    it('should update lastRunAt after execution', async () => {
      const before = Date.now();
      await worker.execute(context);
      const after = Date.now();

      expect(worker.lastRunAt).toBeDefined();
      expect(worker.lastRunAt!.getTime()).toBeGreaterThanOrEqual(before);
      expect(worker.lastRunAt!.getTime()).toBeLessThanOrEqual(after);
    });

    it('should schedule next run after execution', async () => {
      await worker.execute(context);

      expect(worker.nextRunAt).toBeDefined();
      expect(worker.nextRunAt!.getTime()).toBeGreaterThan(Date.now());
    });

    it('should publish event after execution', async () => {
      await worker.execute(context);

      expect(context.eventBus.publish).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'worker.executed',
          workerId: 'test-worker',
        })
      );
    });
  });

  describe('failure handling', () => {
    it('should handle execution failure', async () => {
      worker.shouldFail = true;

      const result = await worker.execute(context);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Test execution failure');
    });

    it('should retry on failure', async () => {
      let attemptCount = 0;
      worker.shouldFail = true;

      // Override to track attempts
      const originalDoExecute = worker['doExecute'].bind(worker);
      worker['doExecute'] = async (ctx: WorkerContext) => {
        attemptCount++;
        return originalDoExecute(ctx);
      };

      await worker.execute(context);

      // Initial attempt + 2 retries = 3 attempts
      expect(attemptCount).toBe(3);
    });

    it('should log warnings on retry', async () => {
      worker.shouldFail = true;

      await worker.execute(context);

      expect(context.logger.warn).toHaveBeenCalled();
    });

    it('should set status to error on failure', async () => {
      worker.shouldFail = true;

      await worker.execute(context);

      expect(worker.status).toBe('error');
    });
  });

  describe('timeout handling', () => {
    it('should timeout long-running executions', async () => {
      worker = new TestWorker({ timeoutMs: 50 });
      worker.executionDelay = 200;

      const result = await worker.execute(context);

      expect(result.success).toBe(false);
      expect(result.error).toContain('timed out');
    });
  });

  describe('abort handling', () => {
    it('should handle abort signal', async () => {
      const abortController = new AbortController();
      context = {
        ...context,
        signal: abortController.signal,
      };

      worker.executionDelay = 100;

      const executePromise = worker.execute(context);
      setTimeout(() => abortController.abort(), 20);

      const result = await executePromise;

      expect(result.success).toBe(false);
      expect(result.error).toContain('aborted');
    });
  });

  describe('pause/resume', () => {
    it('should pause worker', () => {
      worker.pause();
      expect(worker.status).toBe('paused');
    });

    it('should resume worker', () => {
      worker.pause();
      worker.resume();
      expect(worker.status).toBe('idle');
    });

    it('should not change status if stopped', async () => {
      await worker.stop();
      worker.pause();
      expect(worker.status).toBe('stopped');
    });
  });

  describe('stop', () => {
    it('should stop worker', async () => {
      await worker.stop();
      expect(worker.status).toBe('stopped');
    });
  });

  describe('health tracking', () => {
    it('should track health correctly after success', async () => {
      await worker.execute(context);

      const health = worker.getHealth();

      expect(health.status).toBe('idle');
      expect(health.totalExecutions).toBe(1);
      expect(health.successfulExecutions).toBe(1);
      expect(health.failedExecutions).toBe(0);
      expect(health.healthScore).toBe(100);
    });

    it('should track health correctly after failure', async () => {
      worker.shouldFail = true;
      await worker.execute(context);

      const health = worker.getHealth();

      expect(health.status).toBe('error');
      expect(health.totalExecutions).toBe(1);
      expect(health.successfulExecutions).toBe(0);
      expect(health.failedExecutions).toBe(1);
      expect(health.healthScore).toBe(0);
    });

    it('should track recent results', async () => {
      await worker.execute(context);
      await worker.execute(context);

      const health = worker.getHealth();

      expect(health.recentResults).toHaveLength(2);
      expect(health.recentResults[0].success).toBe(true);
    });

    it('should calculate average duration', async () => {
      await worker.execute(context);
      await worker.execute(context);

      const health = worker.getHealth();

      // Duration is tracked even if very fast (0ms is valid)
      expect(health.avgDurationMs).toBeGreaterThanOrEqual(0);
      expect(health.recentResults.length).toBe(2);
    });
  });
});
