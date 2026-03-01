/**
 * Agentic QE v3 - Cost Tracker Unit Tests
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import {
  CostTracker,
  MODEL_PRICING,
  getGlobalCostTracker,
  resetGlobalCostTracker,
} from '../../../../src/shared/llm/cost-tracker';

describe('CostTracker', () => {
  let tracker: CostTracker;

  beforeEach(() => {
    tracker = new CostTracker(1000);
  });

  afterEach(() => {
    tracker.dispose();
  });

  describe('cost calculation', () => {
    it('should calculate cost for Claude models', () => {
      const cost = CostTracker.calculateCost('claude-sonnet-4-20250514', {
        promptTokens: 1000,
        completionTokens: 500,
        totalTokens: 1500,
      });

      // $3.00 / 1M input + $15.00 / 1M output
      expect(cost.inputCost).toBeCloseTo(0.003, 5);
      expect(cost.outputCost).toBeCloseTo(0.0075, 5);
      expect(cost.totalCost).toBeCloseTo(0.0105, 5);
      expect(cost.currency).toBe('USD');
    });

    it('should calculate cost for OpenAI models', () => {
      const cost = CostTracker.calculateCost('gpt-4o', {
        promptTokens: 1000,
        completionTokens: 500,
        totalTokens: 1500,
      });

      // $5.00 / 1M input + $15.00 / 1M output
      expect(cost.inputCost).toBeCloseTo(0.005, 5);
      expect(cost.outputCost).toBeCloseTo(0.0075, 5);
      expect(cost.totalCost).toBeCloseTo(0.0125, 5);
    });

    it('should calculate zero cost for Ollama models', () => {
      const cost = CostTracker.calculateCost('llama3.1', {
        promptTokens: 10000,
        completionTokens: 5000,
        totalTokens: 15000,
      });

      expect(cost.inputCost).toBe(0);
      expect(cost.outputCost).toBe(0);
      expect(cost.totalCost).toBe(0);
    });

    it('should calculate zero cost for unknown models', () => {
      const cost = CostTracker.calculateCost('unknown-model', {
        promptTokens: 1000,
        completionTokens: 500,
        totalTokens: 1500,
      });

      expect(cost.totalCost).toBe(0);
    });

    it('should get cost per token', () => {
      const perToken = CostTracker.getCostPerToken('claude-opus-4-5-20251101');

      expect(perToken.input).toBeCloseTo(15 / 1_000_000, 10);
      expect(perToken.output).toBeCloseTo(75 / 1_000_000, 10);
    });
  });

  describe('usage recording', () => {
    it('should record usage and return cost', () => {
      const cost = tracker.recordUsage(
        'claude',
        'claude-sonnet-4-20250514',
        { promptTokens: 1000, completionTokens: 500, totalTokens: 1500 },
        'req-1'
      );

      expect(cost.totalCost).toBeGreaterThan(0);
    });

    it('should track multiple usages', () => {
      tracker.recordUsage(
        'claude',
        'claude-sonnet-4-20250514',
        { promptTokens: 1000, completionTokens: 500, totalTokens: 1500 },
        'req-1'
      );

      tracker.recordUsage(
        'openai',
        'gpt-4o',
        { promptTokens: 2000, completionTokens: 1000, totalTokens: 3000 },
        'req-2'
      );

      const summary = tracker.getSummary('all');

      expect(summary.totalRequests).toBe(2);
      expect(summary.totalCost).toBeGreaterThan(0);
    });
  });

  describe('summary by period', () => {
    beforeEach(() => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2025-01-15T12:00:00Z'));
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('should get summary for current hour', () => {
      tracker.recordUsage(
        'claude',
        'claude-sonnet-4-20250514',
        { promptTokens: 1000, completionTokens: 500, totalTokens: 1500 },
        'req-1'
      );

      const summary = tracker.getSummary('hour');

      expect(summary.period).toBe('hour');
      expect(summary.totalRequests).toBe(1);
    });

    it('should get summary for current day', () => {
      tracker.recordUsage(
        'claude',
        'claude-sonnet-4-20250514',
        { promptTokens: 1000, completionTokens: 500, totalTokens: 1500 },
        'req-1'
      );

      const summary = tracker.getSummary('day');

      expect(summary.period).toBe('day');
      expect(summary.periodStart.getHours()).toBe(0);
    });

    it('should break down by provider', () => {
      tracker.recordUsage(
        'claude',
        'claude-sonnet-4-20250514',
        { promptTokens: 1000, completionTokens: 500, totalTokens: 1500 },
        'req-1'
      );

      tracker.recordUsage(
        'openai',
        'gpt-4o',
        { promptTokens: 2000, completionTokens: 1000, totalTokens: 3000 },
        'req-2'
      );

      const summary = tracker.getSummary('all');

      expect(summary.byProvider.claude).toBeGreaterThan(0);
      expect(summary.byProvider.openai).toBeGreaterThan(0);
      expect(summary.byProvider.ollama).toBe(0);
    });

    it('should break down by model', () => {
      tracker.recordUsage(
        'claude',
        'claude-sonnet-4-20250514',
        { promptTokens: 1000, completionTokens: 500, totalTokens: 1500 },
        'req-1'
      );

      tracker.recordUsage(
        'claude',
        'claude-opus-4-5-20251101',
        { promptTokens: 1000, completionTokens: 500, totalTokens: 1500 },
        'req-2'
      );

      const summary = tracker.getSummary('all');

      expect(summary.byModel['claude-sonnet-4-20250514']).toBeGreaterThan(0);
      expect(summary.byModel['claude-opus-4-5-20251101']).toBeGreaterThan(0);
    });
  });

  describe('provider-specific usage', () => {
    it('should get usage by provider', () => {
      tracker.recordUsage(
        'claude',
        'claude-sonnet-4-20250514',
        { promptTokens: 1000, completionTokens: 500, totalTokens: 1500 },
        'req-1'
      );

      tracker.recordUsage(
        'claude',
        'claude-opus-4-5-20251101',
        { promptTokens: 2000, completionTokens: 1000, totalTokens: 3000 },
        'req-2'
      );

      const usage = tracker.getUsageByProvider('claude');

      expect(usage.totalRequests).toBe(2);
      expect(usage.totalTokens).toBe(4500);
      expect(Object.keys(usage.models).length).toBe(2);
    });
  });

  describe('cost estimation', () => {
    it('should estimate cost before request', () => {
      const estimate = tracker.estimateCost('gpt-4o', 1000, 500);

      expect(estimate.totalCost).toBeGreaterThan(0);
      expect(estimate.inputCost).toBeCloseTo(0.005, 5);
      expect(estimate.outputCost).toBeCloseTo(0.0075, 5);
    });

    it('should check if request would exceed limit', () => {
      // Record some usage
      tracker.recordUsage(
        'claude',
        'claude-sonnet-4-20250514',
        { promptTokens: 1000000, completionTokens: 500000, totalTokens: 1500000 },
        'req-1'
      );

      // Check if another large request would exceed $10 limit
      const wouldExceed = tracker.wouldExceedLimit(
        'claude-sonnet-4-20250514',
        1000000,
        500000,
        10, // $10 limit
        'all'
      );

      expect(wouldExceed).toBe(true);
    });

    it('should not exceed when under limit', () => {
      const wouldExceed = tracker.wouldExceedLimit(
        'claude-sonnet-4-20250514',
        1000,
        500,
        100, // $100 limit
        'all'
      );

      expect(wouldExceed).toBe(false);
    });
  });

  describe('alerts', () => {
    it('should add alerts', () => {
      const callback = vi.fn();
      tracker.addAlert(1.0, 'day', callback);

      // Record usage that exceeds $1
      tracker.recordUsage(
        'claude',
        'claude-opus-4-5-20251101',
        { promptTokens: 100000, completionTokens: 50000, totalTokens: 150000 },
        'req-1'
      );

      expect(callback).toHaveBeenCalled();
    });

    it('should only trigger alert once', () => {
      const callback = vi.fn();
      tracker.addAlert(0.001, 'all', callback);

      tracker.recordUsage(
        'claude',
        'claude-sonnet-4-20250514',
        { promptTokens: 1000, completionTokens: 500, totalTokens: 1500 },
        'req-1'
      );

      tracker.recordUsage(
        'claude',
        'claude-sonnet-4-20250514',
        { promptTokens: 1000, completionTokens: 500, totalTokens: 1500 },
        'req-2'
      );

      expect(callback).toHaveBeenCalledTimes(1);
    });

    it('should remove alerts', () => {
      const callback = vi.fn();
      tracker.addAlert(0.001, 'all', callback);
      tracker.removeAlert(0);

      tracker.recordUsage(
        'claude',
        'claude-sonnet-4-20250514',
        { promptTokens: 1000, completionTokens: 500, totalTokens: 1500 },
        'req-1'
      );

      expect(callback).not.toHaveBeenCalled();
    });
  });

  describe('recent requests', () => {
    it('should get recent requests', () => {
      tracker.recordUsage(
        'claude',
        'claude-sonnet-4-20250514',
        { promptTokens: 1000, completionTokens: 500, totalTokens: 1500 },
        'req-1'
      );

      tracker.recordUsage(
        'openai',
        'gpt-4o',
        { promptTokens: 2000, completionTokens: 1000, totalTokens: 3000 },
        'req-2'
      );

      const recent = tracker.getRecentRequests(5);

      expect(recent.length).toBe(2);
      expect(recent[0].requestId).toBe('req-1');
      expect(recent[1].requestId).toBe('req-2');
    });
  });

  describe('import/export', () => {
    it('should export records', () => {
      tracker.recordUsage(
        'claude',
        'claude-sonnet-4-20250514',
        { promptTokens: 1000, completionTokens: 500, totalTokens: 1500 },
        'req-1'
      );

      const records = tracker.getRecords();
      expect(records.length).toBe(1);
    });

    it('should import records', () => {
      const sourceTracker = new CostTracker();
      sourceTracker.recordUsage(
        'claude',
        'claude-sonnet-4-20250514',
        { promptTokens: 1000, completionTokens: 500, totalTokens: 1500 },
        'req-1'
      );

      const records = sourceTracker.getRecords();

      const targetTracker = new CostTracker();
      targetTracker.importRecords(records);

      expect(targetTracker.getSummary('all').totalRequests).toBe(1);

      sourceTracker.dispose();
      targetTracker.dispose();
    });

    it('should clear records', () => {
      tracker.recordUsage(
        'claude',
        'claude-sonnet-4-20250514',
        { promptTokens: 1000, completionTokens: 500, totalTokens: 1500 },
        'req-1'
      );

      tracker.clear();

      expect(tracker.getSummary('all').totalRequests).toBe(0);
    });
  });

  describe('global tracker', () => {
    it('should provide singleton global tracker', () => {
      const tracker1 = getGlobalCostTracker();
      const tracker2 = getGlobalCostTracker();

      expect(tracker1).toBe(tracker2);
    });

    it('should reset global tracker', () => {
      const tracker1 = getGlobalCostTracker();
      resetGlobalCostTracker();
      const tracker2 = getGlobalCostTracker();

      expect(tracker1).not.toBe(tracker2);
    });
  });
});

describe('MODEL_PRICING', () => {
  it('should have pricing for Claude models', () => {
    expect(MODEL_PRICING['claude-opus-4-5-20251101']).toBeDefined();
    expect(MODEL_PRICING['claude-sonnet-4-20250514']).toBeDefined();
    expect(MODEL_PRICING['claude-3-5-haiku-20241022']).toBeDefined();
  });

  it('should have pricing for OpenAI models', () => {
    expect(MODEL_PRICING['gpt-4o']).toBeDefined();
    expect(MODEL_PRICING['gpt-4o-mini']).toBeDefined();
    expect(MODEL_PRICING['gpt-4-turbo']).toBeDefined();
  });

  it('should have zero cost for Ollama models', () => {
    expect(MODEL_PRICING['llama3'].input).toBe(0);
    expect(MODEL_PRICING['llama3'].output).toBe(0);
    expect(MODEL_PRICING['codellama'].input).toBe(0);
  });

  it('should have correct provider assignments', () => {
    expect(MODEL_PRICING['claude-sonnet-4-20250514'].provider).toBe('claude');
    expect(MODEL_PRICING['gpt-4o'].provider).toBe('openai');
    expect(MODEL_PRICING['llama3'].provider).toBe('ollama');
  });
});
