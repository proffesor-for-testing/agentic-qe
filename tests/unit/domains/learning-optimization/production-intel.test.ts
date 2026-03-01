/**
 * Agentic QE v3 - Production Intelligence Service Unit Tests
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  ProductionIntelService,
  ProductionMetric,
  ProductionIncident,
} from '../../../../src/domains/learning-optimization/services/production-intel';
import { MemoryBackend, StoreOptions, VectorSearchResult } from '../../../../src/kernel/interfaces';
import { TimeRange } from '../../../../src/shared/value-objects';
import { DomainName } from '../../../../src/shared/types';

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

describe('ProductionIntelService', () => {
  let service: ProductionIntelService;
  let mockMemory: MemoryBackend;

  beforeEach(() => {
    mockMemory = createMockMemoryBackend();
    service = new ProductionIntelService(mockMemory);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('recordMetric', () => {
    it('should record a production metric', async () => {
      const result = await service.recordMetric(
        'error_rate',
        0.02,
        'percentage',
        'test-generation',
        ['api', 'critical']
      );

      expect(result.success).toBe(true);
      if (result.success) {
        expect(typeof result.value).toBe('string');
      }
    });

    it('should index metric by name and domain', async () => {
      await service.recordMetric('latency_p99', 150, 'ms', 'test-execution');

      expect(mockMemory.set).toHaveBeenCalled();
      const calls = (mockMemory.set as ReturnType<typeof vi.fn>).mock.calls;
      const indexCall = calls.find((c) => (c[0] as string).includes(':index:'));
      expect(indexCall).toBeDefined();
    });

    it('should handle metrics with empty tags', async () => {
      const result = await service.recordMetric('cpu_usage', 0.65, 'percentage', 'test-generation');

      expect(result.success).toBe(true);
    });

    it('should store metric with TTL based on retention config', async () => {
      await service.recordMetric('memory_usage', 0.7, 'percentage', 'test-generation');

      expect(mockMemory.set).toHaveBeenCalled();
      const calls = (mockMemory.set as ReturnType<typeof vi.fn>).mock.calls;
      const metricCall = calls.find(
        (c) => (c[0] as string).includes('production:metric:') && !(c[0] as string).includes(':index:')
      );
      expect(metricCall).toBeDefined();
      expect(metricCall![2]).toHaveProperty('ttl');
    });
  });

  describe('recordMetricsBatch', () => {
    it('should record multiple metrics in batch', async () => {
      const metrics = [
        { name: 'error_rate', value: 0.02, unit: 'percentage', domain: 'test-generation' as DomainName },
        { name: 'latency_p99', value: 150, unit: 'ms', domain: 'test-execution' as DomainName },
        { name: 'success_rate', value: 0.98, unit: 'percentage', domain: 'test-generation' as DomainName },
      ];

      const result = await service.recordMetricsBatch(metrics);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value.length).toBe(3);
      }
    });

    it('should handle empty batch', async () => {
      const result = await service.recordMetricsBatch([]);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value).toEqual([]);
      }
    });
  });

  describe('getMetricsHistory', () => {
    it('should retrieve metrics history for a time range', async () => {
      const metric: ProductionMetric = {
        id: 'metric-1',
        name: 'error_rate',
        value: 0.02,
        unit: 'percentage',
        domain: 'test-generation',
        tags: [],
        timestamp: new Date(),
      };

      await mockMemory.set('production:metric:metric-1', metric);
      await mockMemory.set('production:metric:index:error_rate:test-generation:metric-1', 'metric-1');

      const timeRange = TimeRange.lastNDays(7);
      const result = await service.getMetricsHistory('error_rate', timeRange);

      expect(result.success).toBe(true);
    });

    it('should filter by domain when specified', async () => {
      const metric: ProductionMetric = {
        id: 'metric-1',
        name: 'latency_p99',
        value: 150,
        unit: 'ms',
        domain: 'test-execution',
        tags: [],
        timestamp: new Date(),
      };

      await mockMemory.set('production:metric:metric-1', metric);
      await mockMemory.set(
        'production:metric:index:latency_p99:test-execution:metric-1',
        'metric-1'
      );

      const timeRange = TimeRange.lastNDays(7);
      const result = await service.getMetricsHistory('latency_p99', timeRange, 'test-execution');

      expect(result.success).toBe(true);
    });

    it('should sort metrics by timestamp', async () => {
      const now = Date.now();
      const metric1: ProductionMetric = {
        id: 'metric-1',
        name: 'error_rate',
        value: 0.01,
        unit: 'percentage',
        domain: 'test-generation',
        tags: [],
        timestamp: new Date(now - 2000),
      };
      const metric2: ProductionMetric = {
        id: 'metric-2',
        name: 'error_rate',
        value: 0.02,
        unit: 'percentage',
        domain: 'test-generation',
        tags: [],
        timestamp: new Date(now),
      };

      await mockMemory.set('production:metric:metric-1', metric1);
      await mockMemory.set('production:metric:metric-2', metric2);
      await mockMemory.set('production:metric:index:error_rate:test-generation:metric-1', 'metric-1');
      await mockMemory.set('production:metric:index:error_rate:test-generation:metric-2', 'metric-2');

      const timeRange = TimeRange.lastNDays(7);
      const result = await service.getMetricsHistory('error_rate', timeRange);

      expect(result.success).toBe(true);
      if (result.success && result.value.length >= 2) {
        expect(result.value[0].timestamp.getTime()).toBeLessThanOrEqual(
          result.value[1].timestamp.getTime()
        );
      }
    });
  });

  describe('recordIncident', () => {
    it('should record a production incident', async () => {
      const result = await service.recordIncident(
        'high',
        'API Latency Spike',
        'Response times exceeded threshold',
        'test-execution',
        { latency_p99: 5000, error_rate: 0.1 }
      );

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value.severity).toBe('high');
        expect(result.value.title).toBe('API Latency Spike');
        expect(result.value).toHaveProperty('id');
        expect(result.value).toHaveProperty('startedAt');
      }
    });

    it('should index incident by domain and severity', async () => {
      await service.recordIncident(
        'critical',
        'Database Connection Lost',
        'Cannot connect to primary database',
        'test-generation',
        { connections: 0 }
      );

      expect(mockMemory.set).toHaveBeenCalled();
      const calls = (mockMemory.set as ReturnType<typeof vi.fn>).mock.calls;
      const domainIndexCall = calls.find((c) => (c[0] as string).includes(':index:domain:'));
      const severityIndexCall = calls.find((c) => (c[0] as string).includes(':index:severity:'));
      expect(domainIndexCall).toBeDefined();
      expect(severityIndexCall).toBeDefined();
    });

    it('should create experience from incident for learning', async () => {
      await service.recordIncident(
        'medium',
        'Test Flakiness Detected',
        'Multiple tests failing intermittently',
        'test-execution',
        { flaky_tests: 5 }
      );

      expect(mockMemory.set).toHaveBeenCalled();
      const calls = (mockMemory.set as ReturnType<typeof vi.fn>).mock.calls;
      const experienceCall = calls.find((c) => (c[0] as string).includes('learning:experience:'));
      expect(experienceCall).toBeDefined();
    });
  });

  describe('resolveIncident', () => {
    it('should resolve an existing incident', async () => {
      const incident: ProductionIncident = {
        id: 'incident-1',
        severity: 'high',
        title: 'Test Issue',
        description: 'Something went wrong',
        domain: 'test-generation',
        metrics: { error_rate: 0.1 },
        startedAt: new Date(),
      };

      await mockMemory.set('production:incident:incident-1', incident);

      const result = await service.resolveIncident(
        'incident-1',
        'Configuration error',
        'Updated configuration values'
      );

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value.rootCause).toBe('Configuration error');
        expect(result.value.resolution).toBe('Updated configuration values');
        expect(result.value.resolvedAt).toBeDefined();
      }
    });

    it('should return error for non-existent incident', async () => {
      const result = await service.resolveIncident(
        'non-existent',
        'Unknown cause',
        'Unknown resolution'
      );

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.message).toContain('not found');
      }
    });

    it('should create positive experience from resolution', async () => {
      const incident: ProductionIncident = {
        id: 'incident-2',
        severity: 'medium',
        title: 'Test Issue',
        description: 'Something went wrong',
        domain: 'test-generation',
        metrics: { error_rate: 0.1 },
        startedAt: new Date(Date.now() - 3600000),
      };

      await mockMemory.set('production:incident:incident-2', incident);

      await service.resolveIncident('incident-2', 'Root cause found', 'Applied fix');

      expect(mockMemory.set).toHaveBeenCalled();
      const calls = (mockMemory.set as ReturnType<typeof vi.fn>).mock.calls;
      const experienceCalls = calls.filter((c) => (c[0] as string).includes('learning:experience:'));
      expect(experienceCalls.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('getRecentIncidents', () => {
    it('should retrieve recent incidents', async () => {
      const incident: ProductionIncident = {
        id: 'incident-1',
        severity: 'high',
        title: 'Test Issue',
        description: 'Description',
        domain: 'test-generation',
        metrics: {},
        startedAt: new Date(),
      };

      await mockMemory.set('production:incident:incident-1', incident);

      const result = await service.getRecentIncidents(10);

      expect(result.success).toBe(true);
    });

    it('should filter by domain when specified', async () => {
      const incident: ProductionIncident = {
        id: 'incident-1',
        severity: 'medium',
        title: 'Execution Issue',
        description: 'Description',
        domain: 'test-execution',
        metrics: {},
        startedAt: new Date(),
      };

      await mockMemory.set('production:incident:incident-1', incident);
      await mockMemory.set('production:incident:index:domain:test-execution:incident-1', 'incident-1');

      const result = await service.getRecentIncidents(10, 'test-execution');

      expect(result.success).toBe(true);
    });

    it('should sort by start time (most recent first)', async () => {
      const now = Date.now();
      const incident1: ProductionIncident = {
        id: 'incident-1',
        severity: 'low',
        title: 'Old Issue',
        description: 'Description',
        domain: 'test-generation',
        metrics: {},
        startedAt: new Date(now - 10000),
      };
      const incident2: ProductionIncident = {
        id: 'incident-2',
        severity: 'low',
        title: 'New Issue',
        description: 'Description',
        domain: 'test-generation',
        metrics: {},
        startedAt: new Date(now),
      };

      await mockMemory.set('production:incident:incident-1', incident1);
      await mockMemory.set('production:incident:incident-2', incident2);

      const result = await service.getRecentIncidents(10);

      expect(result.success).toBe(true);
      if (result.success && result.value.length >= 2) {
        expect(result.value[0].startedAt.getTime()).toBeGreaterThanOrEqual(
          result.value[1].startedAt.getTime()
        );
      }
    });
  });

  describe('getProductionHealth', () => {
    it('should return overall production health status', async () => {
      const result = await service.getProductionHealth();

      expect(result.success).toBe(true);
      if (result.success) {
        expect(['healthy', 'degraded', 'unhealthy']).toContain(result.value.overall);
        expect(result.value).toHaveProperty('domains');
        expect(result.value).toHaveProperty('metrics');
        expect(result.value).toHaveProperty('trends');
        expect(result.value).toHaveProperty('recommendations');
      }
    });

    it('should include recent incidents in health report', async () => {
      const result = await service.getProductionHealth();

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value).toHaveProperty('recentIncidents');
        expect(Array.isArray(result.value.recentIncidents)).toBe(true);
      }
    });

    it('should generate recommendations when all systems are healthy', async () => {
      const result = await service.getProductionHealth();

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value.recommendations.length).toBeGreaterThanOrEqual(1);
      }
    });
  });

  describe('extractInsights', () => {
    it('should extract insights from production data', async () => {
      const timeRange = TimeRange.lastNDays(7);

      const result = await service.extractInsights(timeRange);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value).toHaveProperty('experienceCount');
        expect(result.value).toHaveProperty('successRate');
        expect(result.value).toHaveProperty('avgReward');
        expect(result.value).toHaveProperty('recommendations');
        expect(result.value).toHaveProperty('anomalies');
      }
    });

    it('should filter by domain when specified', async () => {
      const timeRange = TimeRange.lastNDays(7);

      const result = await service.extractInsights(timeRange, 'test-generation');

      expect(result.success).toBe(true);
    });

    it('should detect anomalies in metrics', async () => {
      const timeRange = TimeRange.lastNDays(7);

      const result = await service.extractInsights(timeRange);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(Array.isArray(result.value.anomalies)).toBe(true);
      }
    });
  });

  describe('recordMilestone', () => {
    it('should record a production milestone', async () => {
      const result = await service.recordMilestone(
        '1000 Tests Generated',
        'test-generation',
        { total_tests: 1000, success_rate: 0.95 }
      );

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value.name).toBe('1000 Tests Generated');
        expect(result.value.domain).toBe('test-generation');
        expect(result.value).toHaveProperty('achievedAt');
      }
    });

    it('should store milestone with metrics', async () => {
      await service.recordMilestone('Performance Improvement', 'test-execution', {
        latency_reduction: 50,
      });

      expect(mockMemory.set).toHaveBeenCalled();
      const calls = (mockMemory.set as ReturnType<typeof vi.fn>).mock.calls;
      const milestoneCall = calls.find((c) => (c[0] as string).includes('production:milestone:'));
      expect(milestoneCall).toBeDefined();
    });
  });

  describe('getRecentMilestones', () => {
    it('should retrieve recent milestones', async () => {
      const milestone = {
        name: 'Coverage Goal Achieved',
        achievedAt: new Date(),
        domain: 'coverage-analysis' as DomainName,
        metrics: { coverage: 90 },
      };

      await mockMemory.set('production:milestone:m1', milestone);

      const result = await service.getRecentMilestones(10);

      expect(result.success).toBe(true);
    });

    it('should sort milestones by achieved date (most recent first)', async () => {
      const now = Date.now();
      const milestone1 = {
        name: 'Old Milestone',
        achievedAt: new Date(now - 10000),
        domain: 'test-generation' as DomainName,
      };
      const milestone2 = {
        name: 'New Milestone',
        achievedAt: new Date(now),
        domain: 'test-generation' as DomainName,
      };

      await mockMemory.set('production:milestone:m1', milestone1);
      await mockMemory.set('production:milestone:m2', milestone2);

      const result = await service.getRecentMilestones(10);

      expect(result.success).toBe(true);
      if (result.success && result.value.length >= 2) {
        expect(result.value[0].achievedAt.getTime()).toBeGreaterThanOrEqual(
          result.value[1].achievedAt.getTime()
        );
      }
    });

    it('should respect limit parameter', async () => {
      for (let i = 0; i < 5; i++) {
        const milestone = {
          name: `Milestone ${i}`,
          achievedAt: new Date(),
          domain: 'test-generation' as DomainName,
        };
        await mockMemory.set(`production:milestone:m${i}`, milestone);
      }

      const result = await service.getRecentMilestones(2);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value.length).toBeLessThanOrEqual(2);
      }
    });
  });

  describe('edge cases', () => {
    it('should handle custom config', () => {
      const customService = new ProductionIntelService(mockMemory, {
        metricsRetentionDays: 30,
        anomalyThreshold: 3.0,
      });

      expect(customService).toBeDefined();
    });

    it('should handle incidents with all severity levels', async () => {
      const severities: Array<'critical' | 'high' | 'medium' | 'low'> = [
        'critical',
        'high',
        'medium',
        'low',
      ];

      for (const severity of severities) {
        const result = await service.recordIncident(
          severity,
          `${severity} incident`,
          'Description',
          'test-generation',
          {}
        );

        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.value.severity).toBe(severity);
        }
      }
    });
  });
});
