/**
 * Agentic QE v3 - Heartbeat Scheduler Worker Unit Tests
 * Imp-10: Token-Free Heartbeat Scheduling
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { WorkerContext } from '../../../src/workers/interfaces';

// Mock dependencies before importing the worker
vi.mock('../../../src/kernel/unified-memory.js', () => ({
  getUnifiedMemory: vi.fn(),
}));

vi.mock('../../../src/learning/pattern-lifecycle.js', () => ({
  createPatternLifecycleManager: vi.fn(),
}));

const mockDailyLoggerInstance = {
  log: vi.fn(),
  flush: vi.fn(),
  dispose: vi.fn(),
};

vi.mock('../../../src/learning/daily-log.js', () => {
  return {
    DailyLogger: class MockDailyLogger {
      log = mockDailyLoggerInstance.log;
      flush = mockDailyLoggerInstance.flush;
      dispose = mockDailyLoggerInstance.dispose;
    },
  };
});

import { HeartbeatSchedulerWorker } from '../../../src/workers/workers/heartbeat-scheduler';
import { getUnifiedMemory } from '../../../src/kernel/unified-memory.js';
import { createPatternLifecycleManager } from '../../../src/learning/pattern-lifecycle.js';

// ============================================================================
// Helpers
// ============================================================================

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

function createMockLifecycleManager() {
  return {
    promoteEligiblePatterns: vi.fn().mockReturnValue({ promoted: 2, checked: 10 }),
    deprecateStalePatterns: vi.fn().mockReturnValue({ deprecated: 1, checked: 10 }),
    applyConfidenceDecay: vi.fn().mockReturnValue({ updated: 3, decayed: 3 }),
    getStats: vi.fn().mockReturnValue({
      totalPatterns: 20,
      activePatterns: 15,
      deprecatedPatterns: 5,
      promotedPatterns: 8,
      shortTermPatterns: 7,
      longTermPatterns: 8,
      avgConfidence: 0.75,
      avgSuccessRate: 0.82,
      patternsNearDeprecation: 2,
    }),
  };
}

function createMockDb() {
  return {
    prepare: vi.fn().mockReturnValue({
      get: vi.fn().mockReturnValue({ pending: 5 }),
      run: vi.fn(),
      all: vi.fn().mockReturnValue([]),
    }),
    exec: vi.fn(),
  };
}

// ============================================================================
// Tests
// ============================================================================

describe('HeartbeatSchedulerWorker', () => {
  let worker: HeartbeatSchedulerWorker;
  let context: WorkerContext;
  let mockLifecycleManager: ReturnType<typeof createMockLifecycleManager>;
  let mockDb: ReturnType<typeof createMockDb>;

  beforeEach(() => {
    vi.clearAllMocks();

    worker = new HeartbeatSchedulerWorker();
    context = createMockContext();
    mockLifecycleManager = createMockLifecycleManager();
    mockDb = createMockDb();

    // Wire up mocks
    const mockUnifiedMemory = {
      initialize: vi.fn().mockResolvedValue(undefined),
      getDatabase: vi.fn().mockReturnValue(mockDb),
    };
    vi.mocked(getUnifiedMemory).mockReturnValue(mockUnifiedMemory as any);
    vi.mocked(createPatternLifecycleManager).mockReturnValue(
      mockLifecycleManager as any
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // --------------------------------------------------------------------------
  // Config
  // --------------------------------------------------------------------------

  describe('config', () => {
    it('should have correct worker id', () => {
      expect(worker.config.id).toBe('heartbeat-scheduler');
    });

    it('should run every 30 minutes', () => {
      expect(worker.config.intervalMs).toBe(30 * 60 * 1000);
    });

    it('should have 1 minute timeout', () => {
      expect(worker.config.timeoutMs).toBe(60000);
    });

    it('should target learning-optimization domain', () => {
      expect(worker.config.targetDomains).toEqual(['learning-optimization']);
    });

    it('should be enabled by default', () => {
      expect(worker.config.enabled).toBe(true);
    });

    it('should have normal priority', () => {
      expect(worker.config.priority).toBe('normal');
    });

    it('should retry once', () => {
      expect(worker.config.retryCount).toBe(1);
    });
  });

  // --------------------------------------------------------------------------
  // Execution
  // --------------------------------------------------------------------------

  describe('doExecute', () => {
    it('should return a successful result with correct structure', async () => {
      const result = await worker.execute(context);

      expect(result.success).toBe(true);
      expect(result.workerId).toBe('heartbeat-scheduler');
      expect(result.metrics).toBeDefined();
      expect(result.metrics.domainMetrics).toBeDefined();
      expect(result.findings).toBeDefined();
      expect(result.recommendations).toBeDefined();
    });

    it('should include promotion metrics in domainMetrics', async () => {
      const result = await worker.execute(context);

      expect(result.metrics.domainMetrics.promoted).toBe(2);
    });

    it('should include deprecation metrics in domainMetrics', async () => {
      const result = await worker.execute(context);

      expect(result.metrics.domainMetrics.deprecated).toBe(1);
    });

    it('should include decay metrics in domainMetrics', async () => {
      const result = await worker.execute(context);

      expect(result.metrics.domainMetrics.decayed).toBe(3);
    });

    it('should include pending experiences in domainMetrics', async () => {
      const result = await worker.execute(context);

      expect(result.metrics.domainMetrics.pendingExperiences).toBe(5);
    });

    it('should include confidence and success rate', async () => {
      const result = await worker.execute(context);

      expect(result.metrics.domainMetrics.avgConfidence).toBe(0.75);
      expect(result.metrics.domainMetrics.avgSuccessRate).toBe(0.82);
    });

    it('should include stale patterns count', async () => {
      const result = await worker.execute(context);

      expect(result.metrics.domainMetrics.stalePatterns).toBe(2);
    });

    it('should call promoteEligiblePatterns', async () => {
      await worker.execute(context);

      expect(mockLifecycleManager.promoteEligiblePatterns).toHaveBeenCalled();
    });

    it('should call deprecateStalePatterns', async () => {
      await worker.execute(context);

      expect(mockLifecycleManager.deprecateStalePatterns).toHaveBeenCalled();
    });

    it('should call applyConfidenceDecay', async () => {
      await worker.execute(context);

      expect(mockLifecycleManager.applyConfidenceDecay).toHaveBeenCalled();
    });

    it('should call getStats', async () => {
      await worker.execute(context);

      expect(mockLifecycleManager.getStats).toHaveBeenCalled();
    });

    it('should add finding when patterns are promoted', async () => {
      const result = await worker.execute(context);

      const promotionFinding = result.findings.find(
        (f) => f.type === 'heartbeat-promotion'
      );
      expect(promotionFinding).toBeDefined();
      expect(promotionFinding?.severity).toBe('info');
    });

    it('should add finding when patterns are deprecated', async () => {
      const result = await worker.execute(context);

      const deprecationFinding = result.findings.find(
        (f) => f.type === 'heartbeat-deprecation'
      );
      expect(deprecationFinding).toBeDefined();
      expect(deprecationFinding?.severity).toBe('low');
    });

    it('should not add promotion finding when none promoted', async () => {
      mockLifecycleManager.promoteEligiblePatterns.mockReturnValue({
        promoted: 0,
        checked: 10,
      });

      const result = await worker.execute(context);

      const promotionFinding = result.findings.find(
        (f) => f.type === 'heartbeat-promotion'
      );
      expect(promotionFinding).toBeUndefined();
    });
  });

  // --------------------------------------------------------------------------
  // Daily Log
  // --------------------------------------------------------------------------

  describe('daily log', () => {
    it('should write a daily log entry', async () => {
      await worker.execute(context);

      expect(mockDailyLoggerInstance.log).toHaveBeenCalled();
      expect(mockDailyLoggerInstance.flush).toHaveBeenCalled();
    });

    it('should include heartbeat summary in log entry', async () => {
      await worker.execute(context);

      const logCall = mockDailyLoggerInstance.log.mock.calls[0]?.[0];
      expect(logCall.type).toBe('pattern-promoted');
      expect(logCall.summary).toContain('Heartbeat');
      expect(logCall.summary).toContain('promoted');
      expect(logCall.summary).toContain('deprecated');
    });
  });

  // --------------------------------------------------------------------------
  // Graceful Degradation
  // --------------------------------------------------------------------------

  describe('graceful degradation', () => {
    it('should return zero metrics when unified memory is unavailable', async () => {
      vi.mocked(getUnifiedMemory).mockImplementation(() => {
        throw new Error('Database not available');
      });

      // Create a fresh worker so it does not reuse a cached lifecycleManager
      const freshWorker = new HeartbeatSchedulerWorker();
      const result = await freshWorker.execute(context);

      expect(result.success).toBe(true);
      expect(result.metrics.itemsAnalyzed).toBe(0);
      expect(result.metrics.issuesFound).toBe(0);
      expect(result.metrics.healthScore).toBe(50);
      expect(result.metrics.domainMetrics.promoted).toBe(0);
      expect(result.metrics.domainMetrics.deprecated).toBe(0);
    });
  });

  // --------------------------------------------------------------------------
  // Health Score
  // --------------------------------------------------------------------------

  describe('health score', () => {
    it('should produce a score between 0 and 100', async () => {
      const result = await worker.execute(context);

      expect(result.metrics.healthScore).toBeGreaterThanOrEqual(0);
      expect(result.metrics.healthScore).toBeLessThanOrEqual(100);
    });

    it('should increase score when patterns are promoted', async () => {
      mockLifecycleManager.promoteEligiblePatterns.mockReturnValue({
        promoted: 3,
        checked: 10,
      });

      const result = await worker.execute(context);

      // Base 70 + promotion bonus + confidence bonus
      expect(result.metrics.healthScore).toBeGreaterThan(70);
    });

    it('should decrease score when deprecation rate is high', async () => {
      mockLifecycleManager.deprecateStalePatterns.mockReturnValue({
        deprecated: 10,
        checked: 15,
      });
      mockLifecycleManager.getStats.mockReturnValue({
        totalPatterns: 15,
        activePatterns: 15,
        deprecatedPatterns: 0,
        promotedPatterns: 0,
        shortTermPatterns: 15,
        longTermPatterns: 0,
        avgConfidence: 0.4,
        avgSuccessRate: 0.4,
        patternsNearDeprecation: 10,
      });
      mockLifecycleManager.promoteEligiblePatterns.mockReturnValue({
        promoted: 0,
        checked: 15,
      });

      const result = await worker.execute(context);

      // High deprecation rate and low confidence should pull score down
      expect(result.metrics.healthScore).toBeLessThan(70);
    });
  });

  // --------------------------------------------------------------------------
  // Recommendations
  // --------------------------------------------------------------------------

  describe('recommendations', () => {
    it('should recommend review when >50% patterns near deprecation', async () => {
      mockLifecycleManager.getStats.mockReturnValue({
        totalPatterns: 10,
        activePatterns: 10,
        deprecatedPatterns: 0,
        promotedPatterns: 0,
        shortTermPatterns: 10,
        longTermPatterns: 0,
        avgConfidence: 0.5,
        avgSuccessRate: 0.5,
        patternsNearDeprecation: 6,
      });

      const result = await worker.execute(context);

      const recommendation = result.recommendations.find(
        (r) => r.action === 'Review At-Risk Patterns'
      );
      expect(recommendation).toBeDefined();
      expect(recommendation?.priority).toBe('p2');
    });

    it('should not recommend review when patterns are healthy', async () => {
      mockLifecycleManager.getStats.mockReturnValue({
        totalPatterns: 20,
        activePatterns: 15,
        deprecatedPatterns: 5,
        promotedPatterns: 8,
        shortTermPatterns: 7,
        longTermPatterns: 8,
        avgConfidence: 0.85,
        avgSuccessRate: 0.9,
        patternsNearDeprecation: 1,
      });

      const result = await worker.execute(context);

      const recommendation = result.recommendations.find(
        (r) => r.action === 'Review At-Risk Patterns'
      );
      expect(recommendation).toBeUndefined();
    });
  });

  // --------------------------------------------------------------------------
  // Trend
  // --------------------------------------------------------------------------

  describe('trend', () => {
    it('should report improving when promotions exceed deprecations', async () => {
      mockLifecycleManager.promoteEligiblePatterns.mockReturnValue({
        promoted: 5,
        checked: 10,
      });
      mockLifecycleManager.deprecateStalePatterns.mockReturnValue({
        deprecated: 1,
        checked: 10,
      });

      const result = await worker.execute(context);

      expect(result.metrics.trend).toBe('improving');
    });

    it('should report stable when no changes', async () => {
      mockLifecycleManager.promoteEligiblePatterns.mockReturnValue({
        promoted: 0,
        checked: 10,
      });
      mockLifecycleManager.deprecateStalePatterns.mockReturnValue({
        deprecated: 0,
        checked: 10,
      });

      const result = await worker.execute(context);

      expect(result.metrics.trend).toBe('stable');
    });
  });
});
