/**
 * Tests for InferenceCostTracker
 *
 * Validates cost tracking, savings calculations, and reporting functionality.
 */

import {
  InferenceCostTracker,
  getInferenceCostTracker,
  resetInferenceCostTracker,
  formatCostReport,
  formatCostReportJSON,
  type InferenceProvider,
  type TokenUsage,
} from '../../../../src/core/metrics/InferenceCostTracker.js';

describe('InferenceCostTracker', () => {
  let tracker: InferenceCostTracker;

  beforeEach(() => {
    tracker = new InferenceCostTracker({
      ttl: 3600000, // 1 hour for testing
      autoPrune: false, // Disable for testing
    });
  });

  afterEach(() => {
    tracker.destroy();
  });

  describe('Request Tracking', () => {
    it('should track local inference request with zero cost', () => {
      const requestId = tracker.trackRequest({
        provider: 'ruvllm',
        model: 'meta-llama/llama-3.1-8b-instruct',
        tokens: {
          inputTokens: 1000,
          outputTokens: 500,
          totalTokens: 1500,
        },
        agentId: 'test-agent-001',
      });

      expect(requestId).toMatch(/^inf-/);

      const requests = tracker.getRequests();
      expect(requests).toHaveLength(1);
      expect(requests[0].id).toBe(requestId);
      expect(requests[0].provider).toBe('ruvllm');
      expect(requests[0].providerType).toBe('local');
      expect(requests[0].cost).toBe(0);
      expect(requests[0].tokens.totalTokens).toBe(1500);
    });

    it('should track cloud inference request with calculated cost', () => {
      const requestId = tracker.trackRequest({
        provider: 'anthropic',
        model: 'claude-sonnet-4-5-20250929',
        tokens: {
          inputTokens: 1000000, // 1M tokens
          outputTokens: 1000000, // 1M tokens
          totalTokens: 2000000,
        },
        agentId: 'test-agent-002',
      });

      const requests = tracker.getRequests();
      expect(requests).toHaveLength(1);
      expect(requests[0].provider).toBe('anthropic');
      expect(requests[0].providerType).toBe('cloud');
      // Cost should be: (1M / 1M) * $3 + (1M / 1M) * $15 = $18
      expect(requests[0].cost).toBeCloseTo(18, 2);
    });

    it('should track multiple requests from different providers', () => {
      tracker.trackRequest({
        provider: 'ruvllm',
        model: 'meta-llama/llama-3.1-8b-instruct',
        tokens: { inputTokens: 500, outputTokens: 250, totalTokens: 750 },
      });

      tracker.trackRequest({
        provider: 'anthropic',
        model: 'claude-3-5-haiku-20241022',
        tokens: { inputTokens: 1000, outputTokens: 500, totalTokens: 1500 },
      });

      tracker.trackRequest({
        provider: 'openrouter',
        model: 'meta-llama/llama-3.1-8b-instruct',
        tokens: { inputTokens: 2000, outputTokens: 1000, totalTokens: 3000 },
      });

      const requests = tracker.getRequests();
      expect(requests).toHaveLength(3);

      const providers = requests.map(r => r.provider);
      expect(providers).toContain('ruvllm');
      expect(providers).toContain('anthropic');
      expect(providers).toContain('openrouter');
    });

    it('should track request with agent and task context', () => {
      tracker.trackRequest({
        provider: 'ruvllm',
        model: 'meta-llama/llama-3.1-8b-instruct',
        tokens: { inputTokens: 1000, outputTokens: 500, totalTokens: 1500 },
        agentId: 'qe-test-generator',
        taskId: 'task-123',
        metadata: { testSuite: 'unit-tests' },
      });

      const requests = tracker.getRequests();
      expect(requests[0].agentId).toBe('qe-test-generator');
      expect(requests[0].taskId).toBe('task-123');
      expect(requests[0].metadata).toEqual({ testSuite: 'unit-tests' });
    });

    it('should handle cache tokens in cost calculation', () => {
      tracker.trackRequest({
        provider: 'anthropic',
        model: 'claude-sonnet-4-5-20250929',
        tokens: {
          inputTokens: 1000000,
          outputTokens: 1000000,
          totalTokens: 2000000,
          cacheCreationTokens: 500000,
          cacheReadTokens: 200000,
        },
      });

      const requests = tracker.getRequests();
      // The calculation includes all input tokens in base cost
      // Input cost: 1M * $3 = $3
      // Output cost: 1M * $15 = $15
      // Cache write: 0.5M * $3.75 = $1.875
      // Cache read: 0.2M * $0.30 = $0.06
      // Total: $3 + $15 + $1.875 + $0.06 = $19.935
      expect(requests[0].cost).toBeCloseTo(19.935, 2);
    });
  });

  describe('Cost Reporting', () => {
    beforeEach(() => {
      // Setup test data
      tracker.trackRequest({
        provider: 'ruvllm',
        model: 'meta-llama/llama-3.1-8b-instruct',
        tokens: { inputTokens: 10000, outputTokens: 5000, totalTokens: 15000 },
        agentId: 'test-gen-001',
      });

      tracker.trackRequest({
        provider: 'ruvllm',
        model: 'meta-llama/llama-3.1-8b-instruct',
        tokens: { inputTokens: 8000, outputTokens: 4000, totalTokens: 12000 },
        agentId: 'test-gen-002',
      });

      tracker.trackRequest({
        provider: 'anthropic',
        model: 'claude-sonnet-4-5-20250929',
        tokens: { inputTokens: 5000, outputTokens: 2500, totalTokens: 7500 },
        agentId: 'quality-gate',
      });
    });

    it('should generate cost report with correct aggregations', () => {
      const report = tracker.getCostReport();

      expect(report.totalRequests).toBe(3);
      expect(report.totalTokens).toBe(15000 + 12000 + 7500);
      expect(report.totalCost).toBeGreaterThan(0);

      // Should have 2 providers
      expect(report.byProvider.size).toBe(2);
      expect(report.byProvider.has('ruvllm')).toBe(true);
      expect(report.byProvider.has('anthropic')).toBe(true);
    });

    it('should calculate provider metrics correctly', () => {
      const report = tracker.getCostReport();

      const ruvllmMetrics = report.byProvider.get('ruvllm')!;
      expect(ruvllmMetrics).toBeDefined();
      expect(ruvllmMetrics.requestCount).toBe(2);
      expect(ruvllmMetrics.totalTokens).toBe(27000);
      expect(ruvllmMetrics.totalCost).toBe(0);
      expect(ruvllmMetrics.providerType).toBe('local');
      expect(ruvllmMetrics.topModel).toBe('meta-llama/llama-3.1-8b-instruct');

      const anthropicMetrics = report.byProvider.get('anthropic')!;
      expect(anthropicMetrics).toBeDefined();
      expect(anthropicMetrics.requestCount).toBe(1);
      expect(anthropicMetrics.totalTokens).toBe(7500);
      expect(anthropicMetrics.totalCost).toBeGreaterThan(0);
      expect(anthropicMetrics.providerType).toBe('cloud');
    });

    it('should calculate savings correctly', () => {
      const report = tracker.getCostReport();
      const { savings } = report;

      expect(savings.localRequests).toBe(2);
      expect(savings.cloudRequests).toBe(1);
      expect(savings.totalRequests).toBe(3);
      expect(savings.localRequestPercentage).toBeCloseTo(66.67, 1);
      expect(savings.cloudRequestPercentage).toBeCloseTo(33.33, 1);

      // Should have savings from local inference
      expect(savings.totalSavings).toBeGreaterThan(0);
      expect(savings.cloudBaselineCost).toBeGreaterThan(savings.actualCost);
      expect(savings.savingsPercentage).toBeGreaterThan(0);
      expect(savings.savingsPercentage).toBeLessThanOrEqual(100);
    });

    it('should filter report by time range', () => {
      const now = Date.now();
      const oneHourAgo = now - 3600000;

      const report = tracker.getCostReport(oneHourAgo, now);
      expect(report.periodStart).toBe(oneHourAgo);
      expect(report.periodEnd).toBe(now);
      expect(report.totalRequests).toBe(3); // All requests within range
    });

    it('should calculate request and cost rates', () => {
      const report = tracker.getCostReport();

      expect(report.requestsPerHour).toBeGreaterThan(0);
      expect(report.costPerHour).toBeGreaterThanOrEqual(0);

      // For short test period (close to instant), rate should be high or equal
      // The rate extrapolates to per-hour, so for instant tests it should be >= total
      expect(report.requestsPerHour).toBeGreaterThanOrEqual(report.totalRequests);
    });
  });

  describe('Provider Metrics', () => {
    it('should get metrics for specific provider', () => {
      tracker.trackRequest({
        provider: 'ruvllm',
        model: 'meta-llama/llama-3.1-8b-instruct',
        tokens: { inputTokens: 1000, outputTokens: 500, totalTokens: 1500 },
      });

      const metrics = tracker.getProviderMetrics('ruvllm');
      expect(metrics).toBeDefined();
      expect(metrics!.provider).toBe('ruvllm');
      expect(metrics!.requestCount).toBe(1);
      expect(metrics!.totalCost).toBe(0);
    });

    it('should return null for unknown provider', () => {
      const metrics = tracker.getProviderMetrics('unknown' as InferenceProvider);
      expect(metrics).toBeNull();
    });

    it('should track model usage counts', () => {
      tracker.trackRequest({
        provider: 'anthropic',
        model: 'claude-sonnet-4-5-20250929',
        tokens: { inputTokens: 1000, outputTokens: 500, totalTokens: 1500 },
      });

      tracker.trackRequest({
        provider: 'anthropic',
        model: 'claude-sonnet-4-5-20250929',
        tokens: { inputTokens: 2000, outputTokens: 1000, totalTokens: 3000 },
      });

      tracker.trackRequest({
        provider: 'anthropic',
        model: 'claude-3-5-haiku-20241022',
        tokens: { inputTokens: 500, outputTokens: 250, totalTokens: 750 },
      });

      const metrics = tracker.getProviderMetrics('anthropic')!;
      expect(metrics.modelCounts['claude-sonnet-4-5-20250929']).toBe(2);
      expect(metrics.modelCounts['claude-3-5-haiku-20241022']).toBe(1);
      expect(metrics.topModel).toBe('claude-sonnet-4-5-20250929');
    });
  });

  describe('Request Filtering', () => {
    beforeEach(() => {
      tracker.trackRequest({
        provider: 'ruvllm',
        model: 'meta-llama/llama-3.1-8b-instruct',
        tokens: { inputTokens: 1000, outputTokens: 500, totalTokens: 1500 },
        agentId: 'agent-1',
      });

      tracker.trackRequest({
        provider: 'anthropic',
        model: 'claude-sonnet-4-5-20250929',
        tokens: { inputTokens: 2000, outputTokens: 1000, totalTokens: 3000 },
        agentId: 'agent-2',
      });

      tracker.trackRequest({
        provider: 'ruvllm',
        model: 'meta-llama/llama-3.1-8b-instruct',
        tokens: { inputTokens: 1500, outputTokens: 750, totalTokens: 2250 },
        agentId: 'agent-1',
      });
    });

    it('should get all requests without filter', () => {
      const requests = tracker.getRequests();
      expect(requests).toHaveLength(3);
    });

    it('should filter requests by provider', () => {
      const requests = tracker.getRequests(r => r.provider === 'ruvllm');
      expect(requests).toHaveLength(2);
      expect(requests.every(r => r.provider === 'ruvllm')).toBe(true);
    });

    it('should filter requests by agent', () => {
      const requests = tracker.getRequests(r => r.agentId === 'agent-1');
      expect(requests).toHaveLength(2);
      expect(requests.every(r => r.agentId === 'agent-1')).toBe(true);
    });

    it('should filter requests by provider type', () => {
      const localRequests = tracker.getRequests(r => r.providerType === 'local');
      expect(localRequests).toHaveLength(2);

      const cloudRequests = tracker.getRequests(r => r.providerType === 'cloud');
      expect(cloudRequests).toHaveLength(1);
    });
  });

  describe('Data Management', () => {
    it('should reset all data', () => {
      tracker.trackRequest({
        provider: 'ruvllm',
        model: 'meta-llama/llama-3.1-8b-instruct',
        tokens: { inputTokens: 1000, outputTokens: 500, totalTokens: 1500 },
      });

      expect(tracker.getRequests()).toHaveLength(1);

      tracker.reset();

      expect(tracker.getRequests()).toHaveLength(0);
      const report = tracker.getCostReport();
      expect(report.totalRequests).toBe(0);
    });

    it('should export data for persistence', () => {
      tracker.trackRequest({
        provider: 'ruvllm',
        model: 'meta-llama/llama-3.1-8b-instruct',
        tokens: { inputTokens: 1000, outputTokens: 500, totalTokens: 1500 },
        agentId: 'test-agent',
      });

      const exported = tracker.exportData();

      expect(exported.requests).toHaveLength(1);
      expect(exported.requests[0].provider).toBe('ruvllm');
      expect(exported.requests[0].agentId).toBe('test-agent');
      expect(exported.config).toBeDefined();
      expect(exported.timestamp).toBeGreaterThan(0);
    });

    it('should import data from persistence', () => {
      const testData = {
        requests: [
          {
            id: 'test-req-1',
            provider: 'ruvllm' as InferenceProvider,
            providerType: 'local' as const,
            model: 'meta-llama/llama-3.1-8b-instruct',
            timestamp: Date.now(),
            tokens: { inputTokens: 1000, outputTokens: 500, totalTokens: 1500 },
            cost: 0,
            agentId: 'test-agent',
          },
        ],
        timestamp: Date.now(),
      };

      tracker.importData(testData);

      const requests = tracker.getRequests();
      expect(requests).toHaveLength(1);
      expect(requests[0].id).toBe('test-req-1');
      expect(requests[0].provider).toBe('ruvllm');
    });

    it('should not import expired data', () => {
      const testData = {
        requests: [
          {
            id: 'expired-req',
            provider: 'ruvllm' as InferenceProvider,
            providerType: 'local' as const,
            model: 'meta-llama/llama-3.1-8b-instruct',
            timestamp: Date.now() - 7200000, // 2 hours ago (beyond 1 hour TTL)
            tokens: { inputTokens: 1000, outputTokens: 500, totalTokens: 1500 },
            cost: 0,
          },
        ],
        timestamp: Date.now() - 7200000,
      };

      tracker.importData(testData);

      const requests = tracker.getRequests();
      expect(requests).toHaveLength(0); // Should be filtered out by TTL
    });
  });

  describe('Report Formatting', () => {
    beforeEach(() => {
      tracker.trackRequest({
        provider: 'ruvllm',
        model: 'meta-llama/llama-3.1-8b-instruct',
        tokens: { inputTokens: 10000, outputTokens: 5000, totalTokens: 15000 },
      });

      tracker.trackRequest({
        provider: 'anthropic',
        model: 'claude-sonnet-4-5-20250929',
        tokens: { inputTokens: 5000, outputTokens: 2500, totalTokens: 7500 },
      });
    });

    it('should format report as text', () => {
      const report = tracker.getCostReport();
      const text = formatCostReport(report);

      expect(text).toContain('Inference Cost Report');
      expect(text).toContain('Overall Metrics');
      expect(text).toContain('Cost Savings Analysis');
      expect(text).toContain('By Provider');
      expect(text).toContain('ruvllm');
      expect(text).toContain('anthropic');
      expect(text).toContain('🏠'); // Local provider icon
      expect(text).toContain('☁️'); // Cloud provider icon
    });

    it('should format report as JSON', () => {
      const report = tracker.getCostReport();
      const json = formatCostReportJSON(report);

      const parsed = JSON.parse(json);
      expect(parsed.timestamp).toBeDefined();
      expect(parsed.period).toBeDefined();
      expect(parsed.overall).toBeDefined();
      expect(parsed.savings).toBeDefined();
      expect(parsed.byProvider).toBeDefined();
      expect(parsed.byProvider.ruvllm).toBeDefined();
      expect(parsed.byProvider.anthropic).toBeDefined();
    });
  });

  describe('Singleton Instance', () => {
    afterEach(() => {
      resetInferenceCostTracker();
    });

    it('should return same instance on multiple calls', () => {
      const instance1 = getInferenceCostTracker();
      const instance2 = getInferenceCostTracker();

      expect(instance1).toBe(instance2);
    });

    it('should create new instance after reset', () => {
      const instance1 = getInferenceCostTracker();
      resetInferenceCostTracker();
      const instance2 = getInferenceCostTracker();

      expect(instance1).not.toBe(instance2);
    });

    it('should share data across singleton calls', () => {
      const tracker1 = getInferenceCostTracker();
      tracker1.trackRequest({
        provider: 'ruvllm',
        model: 'meta-llama/llama-3.1-8b-instruct',
        tokens: { inputTokens: 1000, outputTokens: 500, totalTokens: 1500 },
      });

      const tracker2 = getInferenceCostTracker();
      const requests = tracker2.getRequests();

      expect(requests).toHaveLength(1);
    });
  });

  describe('Edge Cases', () => {
    it('should handle zero token request', () => {
      tracker.trackRequest({
        provider: 'ruvllm',
        model: 'meta-llama/llama-3.1-8b-instruct',
        tokens: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
      });

      const report = tracker.getCostReport();
      expect(report.totalRequests).toBe(1);
      expect(report.totalCost).toBe(0);
    });

    it('should handle unknown model gracefully', () => {
      tracker.trackRequest({
        provider: 'anthropic',
        model: 'unknown-model',
        tokens: { inputTokens: 1000, outputTokens: 500, totalTokens: 1500 },
      });

      const requests = tracker.getRequests();
      expect(requests).toHaveLength(1);
      expect(requests[0].cost).toBe(0); // Should default to 0 if pricing not found
    });

    it('should handle large token counts', () => {
      tracker.trackRequest({
        provider: 'anthropic',
        model: 'claude-sonnet-4-5-20250929',
        tokens: {
          inputTokens: 100000000, // 100M tokens
          outputTokens: 50000000, // 50M tokens
          totalTokens: 150000000,
        },
      });

      const requests = tracker.getRequests();
      expect(requests[0].cost).toBeGreaterThan(0);
      expect(Number.isFinite(requests[0].cost)).toBe(true);
    });

    it('should handle empty report', () => {
      const report = tracker.getCostReport();

      expect(report.totalRequests).toBe(0);
      expect(report.totalCost).toBe(0);
      expect(report.totalTokens).toBe(0);
      expect(report.byProvider.size).toBe(0);
      expect(report.savings.totalSavings).toBe(0);
    });
  });
});
