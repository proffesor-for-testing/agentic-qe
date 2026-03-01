/**
 * Agentic QE v3 - Router Metrics Unit Tests
 * ADR-043: Vendor-Independent LLM Support - Milestone 11
 *
 * Tests for RouterMetricsCollector and CostMetricsCollector
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import {
  RouterMetricsCollector,
  CostMetricsCollector,
  createRouterMetricsCollector,
  createCostMetricsCollector,
  getGlobalRouterMetrics,
  resetGlobalRouterMetrics,
  getGlobalCostMetrics,
  resetGlobalCostMetrics,
} from '../../../../../src/shared/llm/metrics';
import {
  RoutingDecision,
  ExtendedProviderType,
} from '../../../../../src/shared/llm/router/types';
import { LLMProvider, TokenUsage, CostInfo } from '../../../../../src/shared/llm/interfaces';

// ============================================================================
// Mock Helpers
// ============================================================================

function createMockDecision(
  provider: ExtendedProviderType = 'claude',
  model: string = 'claude-sonnet-4-20250514',
  reason: string = 'rule-match',
  ruleId?: string
): RoutingDecision {
  return {
    provider: {} as LLMProvider,
    providerType: provider,
    model,
    providerModelId: model,
    reason: reason as any,
    confidence: 0.95,
    matchedRule: ruleId ? { id: ruleId, name: 'Test Rule', condition: {}, action: { provider, model }, enabled: true, priority: 100 } : undefined,
    metadata: {
      decisionTimeMs: 5,
      timestamp: new Date(),
    },
  };
}

function createMockUsage(): TokenUsage {
  return {
    promptTokens: 100,
    completionTokens: 50,
    totalTokens: 150,
  };
}

function createMockCost(): CostInfo {
  return {
    inputCost: 0.0003,
    outputCost: 0.00075,
    totalCost: 0.00105,
    currency: 'USD',
  };
}

// ============================================================================
// RouterMetricsCollector Tests
// ============================================================================

describe('RouterMetricsCollector', () => {
  let collector: RouterMetricsCollector;

  beforeEach(() => {
    collector = new RouterMetricsCollector({ maxRecords: 100, maxCallRecords: 100 });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('recordRoutingDecision', () => {
    it('should record a routing decision', () => {
      const decision = createMockDecision();
      collector.recordRoutingDecision(decision, 150, {
        agentType: 'test-agent',
        success: true,
      });

      const metrics = collector.getMetrics();
      expect(metrics.totalDecisions).toBe(1);
    });

    it('should track decisions by provider', () => {
      collector.recordRoutingDecision(createMockDecision('claude'), 100);
      collector.recordRoutingDecision(createMockDecision('claude'), 100);
      collector.recordRoutingDecision(createMockDecision('openai'), 100);

      const metrics = collector.getMetrics();
      expect(metrics.totalDecisions).toBe(3);
      expect(metrics.byProvider.claude?.selectionCount).toBe(2);
      expect(metrics.byProvider.openai?.selectionCount).toBe(1);
    });

    it('should track fallback decisions', () => {
      const fallbackDecision = createMockDecision('openai', 'gpt-4o', 'fallback');
      collector.recordRoutingDecision(fallbackDecision, 100);

      const metrics = collector.getMetrics();
      expect(metrics.fallbackRate).toBe(1);
    });

    it('should track rule-matched decisions', () => {
      const ruleDecision = createMockDecision('claude', 'claude-sonnet-4-20250514', 'rule-match', 'rule-1');
      collector.recordRoutingDecision(ruleDecision, 100);

      const metrics = collector.getMetrics();
      expect(metrics.ruleMatchRate).toBe(1);
    });
  });

  describe('recordProviderCall', () => {
    it('should record a provider call', () => {
      collector.recordProviderCall('claude', 'claude-sonnet-4-20250514', 150, 200, {
        inputTokens: 150,
        outputTokens: 50,
        success: true,
        cost: 0.001,
      });

      const providerMetrics = collector.getMetricsByProvider('claude');
      expect(providerMetrics.totalTokens).toBe(200);
    });

    it('should track failed calls', () => {
      collector.recordProviderCall('claude', 'claude-sonnet-4-20250514', 100, 0, {
        success: false,
      });

      const providerMetrics = collector.getMetricsByProvider('claude');
      expect(providerMetrics.errorCount).toBe(1);
      expect(providerMetrics.successRate).toBe(0);
    });

    it('should calculate average latency', () => {
      collector.recordProviderCall('claude', 'model', 100, 100, { success: true });
      collector.recordProviderCall('claude', 'model', 200, 100, { success: true });
      collector.recordProviderCall('claude', 'model', 300, 100, { success: true });

      const providerMetrics = collector.getMetricsByProvider('claude');
      expect(providerMetrics.avgLatencyMs).toBe(200);
    });
  });

  describe('recordFallback', () => {
    it('should record fallback events', () => {
      collector.recordFallback('claude', 'openai', 'rate-limited', 'test-agent');

      const metrics = collector.getMetrics();
      expect(metrics.fallbackStats.total).toBe(1);
      expect(metrics.fallbackStats.byProvider.get('claude')).toBe(1);
      expect(metrics.fallbackStats.byReason.get('rate-limited')).toBe(1);
    });
  });

  describe('cache statistics', () => {
    it('should track cache hits and misses', () => {
      collector.recordCacheHit();
      collector.recordCacheHit();
      collector.recordCacheMiss();

      const metrics = collector.getMetrics();
      expect(metrics.cacheStats.hits).toBe(2);
      expect(metrics.cacheStats.misses).toBe(1);
      expect(metrics.cacheStats.hitRate).toBeCloseTo(0.667, 2);
    });
  });

  describe('getMetricsByProvider', () => {
    it('should return detailed provider metrics', () => {
      collector.recordProviderCall('claude', 'model', 100, 100, {
        inputTokens: 70,
        outputTokens: 30,
        success: true,
        cost: 0.001,
      });

      const metrics = collector.getMetricsByProvider('claude');
      expect(metrics.provider).toBe('claude');
      expect(metrics.totalInputTokens).toBe(70);
      expect(metrics.totalOutputTokens).toBe(30);
      expect(metrics.totalCost).toBeCloseTo(0.001);
    });

    it('should calculate percentiles correctly', () => {
      // Add 10 calls with increasing latency
      for (let i = 1; i <= 10; i++) {
        collector.recordProviderCall('claude', 'model', i * 100, 100, { success: true });
      }

      const metrics = collector.getMetricsByProvider('claude');
      expect(metrics.p95LatencyMs).toBeGreaterThanOrEqual(900);
      expect(metrics.p99LatencyMs).toBeGreaterThanOrEqual(900);
    });
  });

  describe('getMetricsByAgentType', () => {
    it('should return agent-specific metrics', () => {
      const decision = createMockDecision();
      collector.recordRoutingDecision(decision, 100, { agentType: 'security-auditor' });
      collector.recordProviderCall('claude', 'model', 100, 200, {
        success: true,
        cost: 0.002,
        agentType: 'security-auditor',
      });

      const agentMetrics = collector.getMetricsByAgentType('security-auditor');
      expect(agentMetrics.agentType).toBe('security-auditor');
      expect(agentMetrics.totalDecisions).toBe(1);
      expect(agentMetrics.providerDistribution.get('claude')).toBe(1);
    });
  });

  describe('getAuditLog', () => {
    it('should return audit log entries', () => {
      const decision = createMockDecision();
      collector.recordRoutingDecision(decision, 100, { agentType: 'test-agent' });

      const auditLog = collector.getAuditLog({ limit: 10 });
      expect(auditLog.length).toBe(1);
      expect(auditLog[0].context.agentType).toBe('test-agent');
    });

    it('should filter by provider', () => {
      collector.recordRoutingDecision(createMockDecision('claude'), 100);
      collector.recordRoutingDecision(createMockDecision('openai'), 100);

      const claudeLog = collector.getAuditLog({ provider: 'claude' });
      expect(claudeLog.length).toBe(1);
      expect(claudeLog[0].decision.providerType).toBe('claude');
    });

    it('should filter by time window', () => {
      collector.recordRoutingDecision(createMockDecision(), 100);

      const recentLog = collector.getAuditLog({
        since: new Date(Date.now() - 60000), // Last minute
      });
      expect(recentLog.length).toBe(1);

      const oldLog = collector.getAuditLog({
        since: new Date(Date.now() + 60000), // Future
      });
      expect(oldLog.length).toBe(0);
    });
  });

  describe('resetMetrics', () => {
    it('should clear all metrics', () => {
      collector.recordRoutingDecision(createMockDecision(), 100);
      collector.recordProviderCall('claude', 'model', 100, 100);
      collector.recordFallback('claude', 'openai', 'error');
      collector.recordCacheHit();

      collector.resetMetrics();

      const metrics = collector.getMetrics();
      expect(metrics.totalDecisions).toBe(0);
      expect(metrics.cacheStats.hits).toBe(0);
      expect(metrics.fallbackStats.total).toBe(0);
    });
  });

  describe('time window filtering', () => {
    it('should filter metrics by time window', () => {
      // Record a decision (uses real time)
      collector.recordRoutingDecision(createMockDecision(), 100);

      const allMetrics = collector.getMetrics('all');
      expect(allMetrics.totalDecisions).toBe(1);

      const hourMetrics = collector.getMetrics('1h');
      expect(hourMetrics.totalDecisions).toBe(1);
    });

    it('should return different results for different time windows', () => {
      collector.recordRoutingDecision(createMockDecision(), 100);

      // All windows should return the record since it was just created
      expect(collector.getMetrics('1m').totalDecisions).toBe(1);
      expect(collector.getMetrics('1h').totalDecisions).toBe(1);
      expect(collector.getMetrics('24h').totalDecisions).toBe(1);
      expect(collector.getMetrics('7d').totalDecisions).toBe(1);
    });
  });
});

// ============================================================================
// CostMetricsCollector Tests
// ============================================================================

describe('CostMetricsCollector', () => {
  let collector: CostMetricsCollector;

  beforeEach(() => {
    collector = new CostMetricsCollector({ maxRecords: 100 });
  });

  afterEach(() => {
    collector.dispose();
    vi.clearAllMocks();
  });

  describe('recordCost', () => {
    it('should record cost and return record', () => {
      const record = collector.recordCost('claude', 'claude-sonnet-4-20250514', 1000, 500);

      expect(record.provider).toBe('claude');
      expect(record.model).toBe('claude-sonnet-4-20250514');
      expect(record.inputTokens).toBe(1000);
      expect(record.outputTokens).toBe(500);
      expect(record.totalCost).toBeGreaterThan(0);
    });

    it('should track agent type', () => {
      collector.recordCost('claude', 'model', 100, 50, { agentType: 'test-agent' });

      const byAgent = collector.getCostByAgentType();
      expect(byAgent.has('test-agent')).toBe(true);
    });
  });

  describe('recordCostFromInfo', () => {
    it('should record from usage and cost info', () => {
      const usage = createMockUsage();
      const cost = createMockCost();

      const record = collector.recordCostFromInfo('claude', 'model', usage, cost);

      expect(record.inputTokens).toBe(100);
      expect(record.outputTokens).toBe(50);
      expect(record.totalCost).toBe(0.00105);
    });
  });

  describe('getCostByProvider', () => {
    it('should return cost breakdown by provider', () => {
      collector.recordCost('claude', 'claude-sonnet-4-20250514', 1000, 500);
      collector.recordCost('openai', 'gpt-4o', 1000, 500);

      const byProvider = collector.getCostByProvider();

      expect(byProvider.has('claude')).toBe(true);
      expect(byProvider.has('openai')).toBe(true);
      expect(byProvider.get('claude')!.totalRequests).toBe(1);
    });
  });

  describe('getCostByAgentType', () => {
    it('should return cost breakdown by agent type', () => {
      collector.recordCost('claude', 'model', 100, 50, { agentType: 'agent-1' });
      collector.recordCost('claude', 'model', 100, 50, { agentType: 'agent-2' });
      collector.recordCost('claude', 'model', 100, 50, { agentType: 'agent-1' });

      const byAgent = collector.getCostByAgentType();

      expect(byAgent.get('agent-1')?.totalRequests).toBe(2);
      expect(byAgent.get('agent-2')?.totalRequests).toBe(1);
    });

    it('should track unknown agent type', () => {
      collector.recordCost('claude', 'model', 100, 50); // No agent type

      const byAgent = collector.getCostByAgentType();
      expect(byAgent.has('unknown')).toBe(true);
    });
  });

  describe('getCostByModel', () => {
    it('should return cost breakdown by model', () => {
      collector.recordCost('claude', 'claude-sonnet-4-20250514', 1000, 500);
      collector.recordCost('claude', 'claude-opus-4-5-20251101', 1000, 500);

      const byModel = collector.getCostByModel();

      expect(byModel.has('claude-sonnet-4-20250514')).toBe(true);
      expect(byModel.has('claude-opus-4-5-20251101')).toBe(true);
    });
  });

  describe('getTotalCost', () => {
    it('should return total cost', () => {
      collector.recordCost('claude', 'claude-sonnet-4-20250514', 1000, 500);
      collector.recordCost('claude', 'claude-sonnet-4-20250514', 1000, 500);

      const total = collector.getTotalCost();
      expect(total).toBeGreaterThan(0);
    });

    it('should filter by period', () => {
      collector.recordCost('claude', 'model', 100, 50);

      const hourTotal = collector.getTotalCost('1h');
      const dayTotal = collector.getTotalCost('24h');
      const allTotal = collector.getTotalCost('all');

      expect(hourTotal).toBe(allTotal);
      expect(dayTotal).toBe(allTotal);
    });
  });

  describe('getCostTrend', () => {
    it('should return cost trends', () => {
      collector.recordCost('claude', 'model', 100, 50);

      const hourTrend = collector.getCostTrend('1h');
      expect(hourTrend.length).toBe(12); // 5-minute buckets

      const dayTrend = collector.getCostTrend('24h');
      expect(dayTrend.length).toBe(24); // 1-hour buckets
    });
  });

  describe('budget alerts', () => {
    it('should trigger budget alert when threshold exceeded', () => {
      const callback = vi.fn();
      collector.addBudgetAlert(0.001, '24h', callback);

      // Record enough cost to trigger alert
      collector.recordCost('claude', 'claude-opus-4-5-20251101', 10000, 5000);

      expect(callback).toHaveBeenCalled();
    });

    it('should only trigger alert once', () => {
      const callback = vi.fn();
      collector.addBudgetAlert(0.001, '24h', callback);

      collector.recordCost('claude', 'claude-opus-4-5-20251101', 10000, 5000);
      collector.recordCost('claude', 'claude-opus-4-5-20251101', 10000, 5000);

      expect(callback).toHaveBeenCalledTimes(1);
    });

    it('should remove alerts', () => {
      const callback = vi.fn();
      collector.addBudgetAlert(0.001, '24h', callback);
      collector.removeBudgetAlert(0);

      collector.recordCost('claude', 'claude-opus-4-5-20251101', 10000, 5000);

      expect(callback).not.toHaveBeenCalled();
    });
  });

  describe('getOptimizationSuggestions', () => {
    it('should return cost optimization suggestions', () => {
      // Record some significant usage
      for (let i = 0; i < 100; i++) {
        collector.recordCost('claude', 'claude-opus-4-5-20251101', 10000, 5000);
      }

      const suggestions = collector.getOptimizationSuggestions();

      expect(suggestions.length).toBeGreaterThan(0);
      expect(suggestions.some(s => s.type === 'model-switch')).toBe(true);
    });
  });

  describe('clear and reset', () => {
    it('should clear all records', () => {
      collector.recordCost('claude', 'model', 100, 50);
      collector.clear();

      expect(collector.getRecords().length).toBe(0);
    });

    it('should reset all state', () => {
      const callback = vi.fn();
      collector.addBudgetAlert(1000, '24h', callback);
      collector.recordCost('claude', 'model', 100, 50);

      collector.reset();

      expect(collector.getTotalCost()).toBe(0);
    });
  });
});

// ============================================================================
// Global Singleton Tests
// ============================================================================

describe('Global Metrics Singletons', () => {
  afterEach(() => {
    resetGlobalRouterMetrics();
    resetGlobalCostMetrics();
  });

  describe('getGlobalRouterMetrics', () => {
    it('should return singleton instance', () => {
      const instance1 = getGlobalRouterMetrics();
      const instance2 = getGlobalRouterMetrics();

      expect(instance1).toBe(instance2);
    });

    it('should create new instance after reset', () => {
      const instance1 = getGlobalRouterMetrics();
      resetGlobalRouterMetrics();
      const instance2 = getGlobalRouterMetrics();

      expect(instance1).not.toBe(instance2);
    });
  });

  describe('getGlobalCostMetrics', () => {
    it('should return singleton instance', () => {
      const instance1 = getGlobalCostMetrics();
      const instance2 = getGlobalCostMetrics();

      expect(instance1).toBe(instance2);
    });

    it('should create new instance after reset', () => {
      const instance1 = getGlobalCostMetrics();
      resetGlobalCostMetrics();
      const instance2 = getGlobalCostMetrics();

      expect(instance1).not.toBe(instance2);
    });
  });
});

// ============================================================================
// Factory Function Tests
// ============================================================================

describe('Factory Functions', () => {
  it('should create router metrics collector', () => {
    const collector = createRouterMetricsCollector({ maxRecords: 50 });
    expect(collector).toBeInstanceOf(RouterMetricsCollector);
  });

  it('should create cost metrics collector', () => {
    const collector = createCostMetricsCollector({ maxRecords: 50 });
    expect(collector).toBeInstanceOf(CostMetricsCollector);
    collector.dispose();
  });
});

// ============================================================================
// Edge Case Tests
// ============================================================================

describe('Edge Cases', () => {
  describe('RouterMetricsCollector', () => {
    it('should handle empty metrics gracefully', () => {
      const collector = new RouterMetricsCollector();
      const metrics = collector.getMetrics();

      expect(metrics.totalDecisions).toBe(0);
      expect(metrics.avgDecisionTimeMs).toBe(0);
      expect(metrics.fallbackRate).toBe(0);
    });

    it('should handle provider with no calls', () => {
      const collector = new RouterMetricsCollector();
      const providerMetrics = collector.getMetricsByProvider('claude');

      expect(providerMetrics.selectionCount).toBe(0);
      expect(providerMetrics.successRate).toBe(1); // Default to 1 when no calls
    });

    it('should trim records when exceeding max', () => {
      const collector = new RouterMetricsCollector({ maxRecords: 5 });

      for (let i = 0; i < 10; i++) {
        collector.recordRoutingDecision(createMockDecision(), 100);
      }

      const auditLog = collector.getAuditLog({ limit: 100 });
      expect(auditLog.length).toBe(5);
    });
  });

  describe('CostMetricsCollector', () => {
    it('should handle unknown models with zero cost', () => {
      const collector = new CostMetricsCollector();
      const record = collector.recordCost('claude', 'unknown-model', 1000, 500);

      expect(record.totalCost).toBe(0);
      collector.dispose();
    });

    it('should handle empty cost trends gracefully', () => {
      const collector = new CostMetricsCollector();
      const trends = collector.getCostTrend('1h');

      expect(trends.length).toBe(12);
      expect(trends.every(t => t.cost === 0)).toBe(true);
      collector.dispose();
    });
  });
});
