/**
 * Agentic QE v3 - Coverage Tracker Worker Unit Tests
 * ADR-014: Background Workers for QE Monitoring
 *
 * TDD Tests for CoverageTrackerWorker
 * Tests coverage trend tracking and gap analysis
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { CoverageTrackerWorker } from '../../../../src/workers/workers/coverage-tracker';
import { WorkerContext } from '../../../../src/workers/interfaces';

function createMockContext(overrides: Partial<{
  previousCoverage: {
    line: number;
    branch: number;
    function: number;
    statement: number;
    timestamp: Date;
  } | undefined;
}> = {}): WorkerContext {
  const { previousCoverage } = overrides;

  return {
    eventBus: {
      publish: vi.fn().mockResolvedValue(undefined),
    },
    memory: {
      get: vi.fn().mockImplementation((key: string) => {
        if (key === 'coverage:current' && previousCoverage) {
          return Promise.resolve(previousCoverage);
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

describe('CoverageTrackerWorker', () => {
  let worker: CoverageTrackerWorker;

  beforeEach(() => {
    worker = new CoverageTrackerWorker();
  });

  describe('instantiation', () => {
    it('should be instantiated with correct config', () => {
      expect(worker.config.id).toBe('coverage-tracker');
      expect(worker.config.name).toBe('Coverage Tracker');
      expect(worker.config.priority).toBe('high');
      expect(worker.config.targetDomains).toContain('coverage-analysis');
      expect(worker.config.targetDomains).toContain('test-generation');
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

  describe('execute - successful coverage tracking', () => {
    it('should execute successfully', async () => {
      const context = createMockContext();

      const result = await worker.execute(context);

      expect(result.success).toBe(true);
      expect(result.workerId).toBe('coverage-tracker');
    });

    it('should return coverage metrics', async () => {
      const context = createMockContext();

      const result = await worker.execute(context);

      expect(result.metrics.domainMetrics).toHaveProperty('lineCoverage');
      expect(result.metrics.domainMetrics).toHaveProperty('branchCoverage');
      expect(result.metrics.domainMetrics).toHaveProperty('functionCoverage');
      expect(result.metrics.domainMetrics).toHaveProperty('statementCoverage');
    });

    it('should track gaps count', async () => {
      const context = createMockContext();

      const result = await worker.execute(context);

      expect(result.metrics.domainMetrics).toHaveProperty('gapsCount');
    });

    it('should store current coverage in memory', async () => {
      const context = createMockContext();

      await worker.execute(context);

      expect(context.memory.set).toHaveBeenCalledWith('coverage:current', expect.objectContaining({
        line: expect.any(Number),
        branch: expect.any(Number),
        function: expect.any(Number),
        statement: expect.any(Number),
      }));
    });

    it('should store coverage gaps in memory', async () => {
      const context = createMockContext();

      await worker.execute(context);

      expect(context.memory.set).toHaveBeenCalledWith('coverage:gaps', expect.any(Array));
    });

    it('should publish worker.executed event', async () => {
      const context = createMockContext();

      await worker.execute(context);

      expect(context.eventBus.publish).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'worker.executed',
          workerId: 'coverage-tracker',
        })
      );
    });
  });

  describe('execute - threshold analysis', () => {
    it('should generate findings when line coverage is below threshold', async () => {
      const context = createMockContext();

      const result = await worker.execute(context);

      // The mock returns 78.5% line coverage which is below 80% threshold
      expect(result.findings.some(f => f.type === 'low-line-coverage')).toBe(true);
    });

    it('should generate findings when branch coverage is below threshold', async () => {
      const context = createMockContext();

      const result = await worker.execute(context);

      // The mock returns 65.2% branch coverage which is below 70% threshold
      expect(result.findings.some(f => f.type === 'low-branch-coverage')).toBe(true);
    });

    it('should generate recommendations for coverage improvement', async () => {
      const context = createMockContext();

      const result = await worker.execute(context);

      expect(result.recommendations.length).toBeGreaterThan(0);
    });
  });

  describe('execute - gap analysis', () => {
    it('should identify high-risk coverage gaps', async () => {
      const context = createMockContext();

      const result = await worker.execute(context);

      // The mock includes gaps with riskScore > 0.8
      expect(result.findings.some(f => f.type === 'high-risk-coverage-gap')).toBe(true);
    });

    it('should generate recommendations for high-risk gaps', async () => {
      const context = createMockContext();

      const result = await worker.execute(context);

      expect(result.recommendations.some(r =>
        r.action.includes('High-Risk Coverage Gaps')
      )).toBe(true);
    });
  });

  describe('execute - trend analysis', () => {
    it('should detect coverage regression', async () => {
      const context = createMockContext({
        previousCoverage: {
          line: 85,
          branch: 75,
          function: 90,
          statement: 85,
          timestamp: new Date(Date.now() - 3600000),
        },
      });

      const result = await worker.execute(context);

      // Current coverage (78.5, 65.2, 82.1, 79.3) is lower than previous
      expect(result.findings.some(f => f.type === 'coverage-regression')).toBe(true);
    });

    it('should return stable trend when no previous data', async () => {
      const context = createMockContext({
        previousCoverage: undefined,
      });

      const result = await worker.execute(context);

      expect(result.metrics.trend).toBe('stable');
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
    it('should track health after execution', async () => {
      const context = createMockContext();

      await worker.execute(context);
      const health = worker.getHealth();

      expect(health.totalExecutions).toBe(1);
      expect(health.successfulExecutions).toBe(1);
      expect(health.failedExecutions).toBe(0);
    });
  });
});
