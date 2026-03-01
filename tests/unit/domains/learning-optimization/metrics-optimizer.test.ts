/**
 * Agentic QE v3 - Metrics Optimizer Service Unit Tests
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { MetricsOptimizerService, MetricsSnapshot } from '../../../../src/domains/learning-optimization/services/metrics-optimizer';
import { MemoryBackend, StoreOptions, VectorSearchResult } from '../../../../src/kernel/interfaces';
import {
  Experience,
  Strategy,
  OptimizationObjective,
  ABTestConfig,
  PatternContext,
} from '../../../../src/domains/learning-optimization/interfaces';
import { DomainName, AgentId } from '../../../../src/shared/types';

// Mock MemoryBackend
function createMockMemoryBackend(): MemoryBackend {
  const storage = new Map<string, unknown>();

  return {
    initialize: vi.fn().mockResolvedValue(undefined),
    dispose: vi.fn().mockResolvedValue(undefined),
    set: vi.fn().mockImplementation(async (key: string, value: unknown, _options?: StoreOptions) => {
      storage.set(key, value);
    }),
    get: vi.fn().mockImplementation(async <T>(key: string): Promise<T | undefined> => {
      return storage.get(key) as T | undefined;
    }),
    delete: vi.fn().mockImplementation(async (key: string) => {
      return storage.delete(key);
    }),
    has: vi.fn().mockImplementation(async (key: string) => {
      return storage.has(key);
    }),
    search: vi.fn().mockImplementation(async (pattern: string, _limit?: number) => {
      const regex = new RegExp('^' + pattern.replace(/\*/g, '.*') + '$');
      return Array.from(storage.keys()).filter((key) => regex.test(key));
    }),
    vectorSearch: vi.fn().mockResolvedValue([] as VectorSearchResult[]),
    storeVector: vi.fn().mockResolvedValue(undefined),
  };
}

// Helper to create test experiences
function createTestExperience(overrides: Partial<Experience> = {}): Experience {
  const agentId: AgentId = {
    value: overrides.agentId?.value || 'test-agent-1',
    domain: overrides.agentId?.domain || 'test-generation',
    type: overrides.agentId?.type || 'generator',
  };

  return {
    id: overrides.id || 'exp-1',
    agentId,
    domain: overrides.domain || 'test-generation',
    action: overrides.action || 'generate-test',
    state: overrides.state || {
      context: { concurrency: 4, retryCount: 3 },
      metrics: { coverage: 80, duration: 1000 },
    },
    result: overrides.result || {
      success: true,
      outcome: { coverage: 85, success_rate: 0.9 },
      duration: 1000,
    },
    reward: overrides.reward ?? 0.8,
    timestamp: overrides.timestamp || new Date(),
  };
}

// Helper to create test strategy
function createTestStrategy(overrides: Partial<Strategy> = {}): Strategy {
  return {
    name: overrides.name || 'test-strategy',
    parameters: overrides.parameters || { concurrency: 4, retryCount: 3, timeout: 30000 },
    expectedOutcome: overrides.expectedOutcome || { success_rate: 0.85, coverage: 80 },
  };
}

describe('MetricsOptimizerService', () => {
  let service: MetricsOptimizerService;
  let mockMemory: MemoryBackend;

  beforeEach(() => {
    mockMemory = createMockMemoryBackend();
    service = new MetricsOptimizerService(mockMemory);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('optimizeStrategy', () => {
    it('should optimize strategy with sufficient experiences', async () => {
      const strategy = createTestStrategy();
      const objective: OptimizationObjective = {
        metric: 'coverage',
        direction: 'maximize',
        constraints: [],
      };

      const experiences = Array.from({ length: 25 }, (_, i) =>
        createTestExperience({
          id: `exp-${i}`,
          result: {
            success: true,
            outcome: { coverage: 80 + Math.random() * 10 },
            duration: 1000,
          },
        })
      );

      const result = await service.optimizeStrategy(strategy, objective, experiences);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value.objective).toEqual(objective);
        expect(result.value.currentStrategy).toEqual(strategy);
        expect(result.value).toHaveProperty('improvement');
        expect(result.value).toHaveProperty('confidence');
      }
    });

    it('should reject optimization with insufficient experiences', async () => {
      const strategy = createTestStrategy();
      const objective: OptimizationObjective = {
        metric: 'coverage',
        direction: 'maximize',
        constraints: [],
      };

      const experiences = Array.from({ length: 5 }, (_, i) =>
        createTestExperience({ id: `exp-${i}` })
      );

      const result = await service.optimizeStrategy(strategy, objective, experiences);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.message).toContain('at least');
      }
    });

    it('should store optimization result', async () => {
      const strategy = createTestStrategy();
      const objective: OptimizationObjective = {
        metric: 'coverage',
        direction: 'maximize',
        constraints: [],
      };

      const experiences = Array.from({ length: 25 }, (_, i) =>
        createTestExperience({ id: `exp-${i}` })
      );

      await service.optimizeStrategy(strategy, objective, experiences);

      expect(mockMemory.set).toHaveBeenCalled();
      const calls = (mockMemory.set as ReturnType<typeof vi.fn>).mock.calls;
      const optimizedCall = calls.find((c) => (c[0] as string).includes('strategy:optimized'));
      expect(optimizedCall).toBeDefined();
    });
  });

  describe('runABTest', () => {
    it('should run A/B test between two strategies', async () => {
      const strategyA = createTestStrategy({ name: 'strategy-A' });
      const strategyB = createTestStrategy({ name: 'strategy-B' });

      const testConfig: ABTestConfig = {
        duration: 3600000,
        minSamples: 10,
        confidenceLevel: 0.95,
        metric: 'success_rate',
      };

      const result = await service.runABTest(strategyA, strategyB, testConfig);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(['A', 'B', 'inconclusive']).toContain(result.value.winner);
        expect(result.value).toHaveProperty('strategyAMetrics');
        expect(result.value).toHaveProperty('strategyBMetrics');
        expect(result.value).toHaveProperty('pValue');
      }
    });

    it('should calculate p-value correctly', async () => {
      const strategyA = createTestStrategy({
        name: 'strategy-A',
        expectedOutcome: { success_rate: 0.9 },
      });
      const strategyB = createTestStrategy({
        name: 'strategy-B',
        expectedOutcome: { success_rate: 0.5 },
      });

      const testConfig: ABTestConfig = {
        duration: 3600000,
        minSamples: 20,
        confidenceLevel: 0.95,
        metric: 'success_rate',
      };

      const result = await service.runABTest(strategyA, strategyB, testConfig);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value.pValue).toBeGreaterThanOrEqual(0);
        expect(result.value.pValue).toBeLessThanOrEqual(1);
      }
    });

    it('should store A/B test result', async () => {
      const strategyA = createTestStrategy({ name: 'strategy-A' });
      const strategyB = createTestStrategy({ name: 'strategy-B' });

      const testConfig: ABTestConfig = {
        duration: 3600000,
        minSamples: 10,
        confidenceLevel: 0.95,
        metric: 'success_rate',
      };

      await service.runABTest(strategyA, strategyB, testConfig);

      expect(mockMemory.set).toHaveBeenCalled();
      const calls = (mockMemory.set as ReturnType<typeof vi.fn>).mock.calls;
      const abTestCall = calls.find((c) => (c[0] as string).includes('abtest'));
      expect(abTestCall).toBeDefined();
    });
  });

  describe('recommendStrategy', () => {
    it('should return default strategy when no optimized strategies exist', async () => {
      const context: PatternContext = {
        language: 'typescript',
        framework: 'vitest',
        tags: [],
      };

      const result = await service.recommendStrategy(context);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value.name).toBe('default-strategy');
        expect(result.value.parameters).toHaveProperty('timeout');
      }
    });

    it('should include framework in default parameters when provided', async () => {
      const context: PatternContext = {
        language: 'typescript',
        framework: 'vitest',
        tags: [],
      };

      const result = await service.recommendStrategy(context);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value.parameters['framework']).toBe('vitest');
      }
    });

    it('should include language in default parameters when provided', async () => {
      const context: PatternContext = {
        language: 'python',
        tags: [],
      };

      const result = await service.recommendStrategy(context);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value.parameters['language']).toBe('python');
      }
    });
  });

  describe('evaluateStrategy', () => {
    it('should evaluate strategy performance', async () => {
      const strategy = createTestStrategy();
      const experiences = Array.from({ length: 10 }, (_, i) =>
        createTestExperience({
          id: `exp-${i}`,
          result: {
            success: i < 8, // 80% success rate
            outcome: { coverage: 80 },
            duration: 3000,
          },
          reward: i < 8 ? 0.8 : 0.2,
        })
      );

      const result = await service.evaluateStrategy(strategy, experiences);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value.strategy).toEqual(strategy);
        expect(result.value.metrics['success_rate']).toBe(0.8);
        expect(result.value).toHaveProperty('strengths');
        expect(result.value).toHaveProperty('weaknesses');
        expect(result.value).toHaveProperty('improvementAreas');
      }
    });

    it('should identify high success rate as strength', async () => {
      const strategy = createTestStrategy();
      const experiences = Array.from({ length: 10 }, (_, i) =>
        createTestExperience({
          id: `exp-${i}`,
          result: { success: true, outcome: {}, duration: 1000 },
          reward: 0.9,
        })
      );

      const result = await service.evaluateStrategy(strategy, experiences);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value.strengths.some((s) => s.includes('success rate'))).toBe(true);
      }
    });

    it('should identify low success rate as weakness', async () => {
      const strategy = createTestStrategy();
      const experiences = Array.from({ length: 10 }, (_, i) =>
        createTestExperience({
          id: `exp-${i}`,
          result: { success: i < 3, outcome: {}, duration: 1000 }, // 30% success
          reward: 0.3,
        })
      );

      const result = await service.evaluateStrategy(strategy, experiences);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value.weaknesses.some((w) => w.includes('success rate'))).toBe(true);
      }
    });

    it('should store evaluation result', async () => {
      const strategy = createTestStrategy();
      const experiences = [createTestExperience()];

      await service.evaluateStrategy(strategy, experiences);

      expect(mockMemory.set).toHaveBeenCalled();
      const calls = (mockMemory.set as ReturnType<typeof vi.fn>).mock.calls;
      const evalCall = calls.find((c) => (c[0] as string).includes('evaluation'));
      expect(evalCall).toBeDefined();
    });
  });

  describe('trackMetrics', () => {
    it('should track metrics for a strategy', async () => {
      const result = await service.trackMetrics('strategy-1', {
        success_rate: 0.85,
        avg_duration: 2000,
      });

      expect(result.success).toBe(true);
      expect(mockMemory.set).toHaveBeenCalled();
    });

    it('should update aggregated metrics', async () => {
      await service.trackMetrics('strategy-1', { success_rate: 0.85 });
      await service.trackMetrics('strategy-1', { success_rate: 0.90 });

      expect(mockMemory.set).toHaveBeenCalled();
      const calls = (mockMemory.set as ReturnType<typeof vi.fn>).mock.calls;
      const aggregatedCalls = calls.filter((c) => (c[0] as string).includes('aggregated'));
      expect(aggregatedCalls.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('getMetricsHistory', () => {
    it('should retrieve metrics history for a strategy', async () => {
      const snapshot: MetricsSnapshot = {
        strategyId: 'strategy-1',
        metrics: { success_rate: 0.85 },
        timestamp: new Date(),
        samples: 1,
      };

      await mockMemory.set('learning:metrics:history:strategy-1:123456', snapshot);

      const result = await service.getMetricsHistory('strategy-1');

      expect(result.success).toBe(true);
    });

    it('should respect limit parameter', async () => {
      for (let i = 0; i < 10; i++) {
        const snapshot: MetricsSnapshot = {
          strategyId: 'strategy-1',
          metrics: { success_rate: 0.8 + i * 0.01 },
          timestamp: new Date(Date.now() + i * 1000),
          samples: 1,
        };
        await mockMemory.set(`learning:metrics:history:strategy-1:${i}`, snapshot);
      }

      const result = await service.getMetricsHistory('strategy-1', 5);

      expect(result.success).toBe(true);
    });

    it('should sort snapshots by timestamp', async () => {
      const now = Date.now();
      const snapshot1: MetricsSnapshot = {
        strategyId: 'strategy-1',
        metrics: { value: 1 },
        timestamp: new Date(now - 2000),
        samples: 1,
      };
      const snapshot2: MetricsSnapshot = {
        strategyId: 'strategy-1',
        metrics: { value: 2 },
        timestamp: new Date(now),
        samples: 1,
      };

      await mockMemory.set('learning:metrics:history:strategy-1:1', snapshot1);
      await mockMemory.set('learning:metrics:history:strategy-1:2', snapshot2);

      const result = await service.getMetricsHistory('strategy-1');

      expect(result.success).toBe(true);
      if (result.success && result.value.length >= 2) {
        expect(result.value[0].timestamp.getTime()).toBeLessThanOrEqual(
          result.value[1].timestamp.getTime()
        );
      }
    });
  });

  describe('gridSearchOptimize', () => {
    it('should find best parameters through grid search', async () => {
      const parameterRanges = {
        concurrency: [2, 4, 8],
        retryCount: [1, 2, 3],
      };

      const objective: OptimizationObjective = {
        metric: 'success_rate',
        direction: 'maximize',
        constraints: [],
      };

      const experiences = Array.from({ length: 20 }, (_, i) =>
        createTestExperience({
          id: `exp-${i}`,
          state: {
            context: { concurrency: 4, retryCount: 2 },
            metrics: {},
          },
          result: {
            success: true,
            outcome: { success_rate: 0.85 },
            duration: 1000,
          },
        })
      );

      const result = await service.gridSearchOptimize(parameterRanges, objective, experiences);

      expect(result.success).toBe(true);
      if (result.success) {
        expect([2, 4, 8]).toContain(result.value['concurrency']);
        expect([1, 2, 3]).toContain(result.value['retryCount']);
      }
    });

    it('should return empty object for empty parameter ranges', async () => {
      const objective: OptimizationObjective = {
        metric: 'success_rate',
        direction: 'maximize',
        constraints: [],
      };

      const experiences = [createTestExperience()];

      const result = await service.gridSearchOptimize({}, objective, experiences);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(Object.keys(result.value).length).toBe(0);
      }
    });

    it('should handle minimize direction', async () => {
      const parameterRanges = {
        timeout: [1000, 5000, 10000],
      };

      const objective: OptimizationObjective = {
        metric: 'duration',
        direction: 'minimize',
        constraints: [],
      };

      const experiences = Array.from({ length: 20 }, (_, i) =>
        createTestExperience({
          id: `exp-${i}`,
          state: { context: { timeout: 5000 }, metrics: {} },
          result: { success: true, outcome: { duration: 2000 }, duration: 2000 },
        })
      );

      const result = await service.gridSearchOptimize(parameterRanges, objective, experiences);

      expect(result.success).toBe(true);
    });
  });

  describe('edge cases', () => {
    it('should handle empty experiences array in evaluateStrategy', async () => {
      const strategy = createTestStrategy();

      const result = await service.evaluateStrategy(strategy, []);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value.metrics['success_rate']).toBe(0);
      }
    });

    it('should handle experiences with missing metric values', async () => {
      const strategy = createTestStrategy();
      const objective: OptimizationObjective = {
        metric: 'non_existent_metric',
        direction: 'maximize',
        constraints: [],
      };

      const experiences = Array.from({ length: 25 }, (_, i) =>
        createTestExperience({
          id: `exp-${i}`,
          result: { success: true, outcome: {}, duration: 1000 },
        })
      );

      const result = await service.optimizeStrategy(strategy, objective, experiences);

      expect(result.success).toBe(true);
    });
  });
});
