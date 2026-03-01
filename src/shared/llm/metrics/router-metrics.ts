/**
 * Agentic QE v3 - Router Metrics Collector
 * ADR-043: Vendor-Independent LLM Support - Milestone 11
 *
 * Comprehensive metrics collection for LLM routing decisions:
 * - Per-provider latency, cost, and token metrics
 * - Routing decision audit log
 * - Percentile calculations (P50, P95, P99)
 * - Agent-type breakdown
 * - Time-windowed aggregations
 */

import { randomUUID } from 'crypto';
import {
  RoutingDecision,
  ExtendedProviderType,
  RoutingMode,
  ProviderRoutingMetrics,
  RouterMetrics,
  RoutingAuditEntry,
  SelectionReason,
  ALL_PROVIDER_TYPES,
} from '../router/types';
import { TokenUsage, CostInfo } from '../interfaces';

// ============================================================================
// Types
// ============================================================================

/**
 * Detailed routing decision record for metrics collection
 */
export interface RoutingDecisionRecord {
  readonly id: string;
  readonly timestamp: Date;
  readonly provider: ExtendedProviderType;
  readonly model: string;
  readonly mode: RoutingMode;
  readonly reason: string;
  readonly latencyMs: number;
  readonly decisionTimeMs: number;
  readonly agentType?: string;
  readonly success: boolean;
  readonly tokenUsage?: TokenUsage;
  readonly cost?: CostInfo;
  readonly wasFallback: boolean;
  readonly ruleId?: string;
}

/**
 * Provider call record
 */
export interface ProviderCallRecord {
  readonly timestamp: Date;
  readonly provider: ExtendedProviderType;
  readonly model: string;
  readonly latencyMs: number;
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly totalTokens: number;
  readonly success: boolean;
  readonly cost?: number;
  readonly agentType?: string;
}

/**
 * Fallback event record
 */
export interface FallbackRecord {
  readonly timestamp: Date;
  readonly fromProvider: ExtendedProviderType;
  readonly toProvider: ExtendedProviderType;
  readonly reason: string;
  readonly agentType?: string;
}

/**
 * Router metrics summary with detailed breakdowns
 */
export interface RouterMetricsSummary extends RouterMetrics {
  /** Metrics grouped by agent type */
  readonly byAgentType: Map<string, AgentMetrics>;
  /** Recent routing decisions for debugging */
  readonly recentDecisions: RoutingDecisionRecord[];
  /** Fallback chain statistics */
  readonly fallbackStats: {
    total: number;
    byProvider: Map<ExtendedProviderType, number>;
    byReason: Map<string, number>;
  };
}

/**
 * Metrics for a specific provider
 */
export interface ProviderMetrics extends ProviderRoutingMetrics {
  /** Latency histogram for percentile calculations */
  readonly latencyHistogram: number[];
  /** Decision time histogram */
  readonly decisionTimeHistogram: number[];
  /** Input tokens total */
  readonly totalInputTokens: number;
  /** Output tokens total */
  readonly totalOutputTokens: number;
  /** Error count */
  readonly errorCount: number;
  /** Last error timestamp */
  readonly lastError?: Date;
  /** Recent call records */
  readonly recentCalls: ProviderCallRecord[];
}

/**
 * Metrics for a specific agent type
 */
export interface AgentMetrics {
  /** Agent type identifier */
  readonly agentType: string;
  /** Total routing decisions for this agent */
  readonly totalDecisions: number;
  /** Provider distribution for this agent */
  readonly providerDistribution: Map<ExtendedProviderType, number>;
  /** Model distribution */
  readonly modelDistribution: Map<string, number>;
  /** Average latency */
  readonly avgLatencyMs: number;
  /** Total cost */
  readonly totalCost: number;
  /** Total tokens used */
  readonly totalTokens: number;
  /** Fallback rate */
  readonly fallbackRate: number;
  /** Success rate */
  readonly successRate: number;
}

/**
 * Time window for metrics aggregation
 */
export type MetricsTimeWindow = '1m' | '5m' | '15m' | '1h' | '24h' | '7d' | 'all';

// ============================================================================
// RouterMetricsCollector Implementation
// ============================================================================

/**
 * Comprehensive metrics collector for routing decisions
 */
export class RouterMetricsCollector {
  private decisions: RoutingDecisionRecord[] = [];
  private providerCalls: ProviderCallRecord[] = [];
  private fallbacks: FallbackRecord[] = [];
  private cacheHits = 0;
  private cacheMisses = 0;
  private startTime = new Date();

  private readonly maxRecords: number;
  private readonly maxCallRecords: number;

  constructor(options: { maxRecords?: number; maxCallRecords?: number } = {}) {
    this.maxRecords = options.maxRecords ?? 10000;
    this.maxCallRecords = options.maxCallRecords ?? 5000;
  }

  // ==========================================================================
  // Recording Methods
  // ==========================================================================

  /**
   * Record a routing decision with latency
   */
  recordRoutingDecision(
    decision: RoutingDecision,
    latencyMs: number,
    options: {
      agentType?: string;
      success?: boolean;
      tokenUsage?: TokenUsage;
      cost?: CostInfo;
    } = {}
  ): void {
    const record: RoutingDecisionRecord = {
      id: `rd-${Date.now()}-${randomUUID().slice(0, 8)}`,
      timestamp: new Date(),
      provider: decision.providerType,
      model: decision.model,
      mode: this.inferMode(decision.reason),
      reason: decision.reason,
      latencyMs,
      decisionTimeMs: decision.metadata.decisionTimeMs,
      agentType: options.agentType,
      success: options.success ?? true,
      tokenUsage: options.tokenUsage,
      cost: options.cost,
      wasFallback: decision.reason === 'fallback',
      ruleId: decision.matchedRule?.id,
    };

    this.decisions.push(record);
    this.trimRecords();
  }

  /**
   * Record a provider call with detailed metrics
   */
  recordProviderCall(
    provider: ExtendedProviderType,
    model: string,
    latencyMs: number,
    tokens: number,
    options: {
      inputTokens?: number;
      outputTokens?: number;
      success?: boolean;
      cost?: number;
      agentType?: string;
    } = {}
  ): void {
    const inputTokens = options.inputTokens ?? Math.floor(tokens * 0.7);
    const outputTokens = options.outputTokens ?? (tokens - inputTokens);

    const record: ProviderCallRecord = {
      timestamp: new Date(),
      provider,
      model,
      latencyMs,
      inputTokens,
      outputTokens,
      totalTokens: tokens,
      success: options.success ?? true,
      cost: options.cost,
      agentType: options.agentType,
    };

    this.providerCalls.push(record);
    this.trimCallRecords();
  }

  /**
   * Record a fallback event
   */
  recordFallback(
    fromProvider: ExtendedProviderType,
    toProvider: ExtendedProviderType,
    reason: string,
    agentType?: string
  ): void {
    const record: FallbackRecord = {
      timestamp: new Date(),
      fromProvider,
      toProvider,
      reason,
      agentType,
    };

    this.fallbacks.push(record);

    // Keep only recent fallbacks
    if (this.fallbacks.length > 1000) {
      this.fallbacks = this.fallbacks.slice(-1000);
    }
  }

  /**
   * Record cache hit
   */
  recordCacheHit(): void {
    this.cacheHits++;
  }

  /**
   * Record cache miss
   */
  recordCacheMiss(): void {
    this.cacheMisses++;
  }

  // ==========================================================================
  // Retrieval Methods
  // ==========================================================================

  /**
   * Get comprehensive metrics summary
   */
  getMetrics(timeWindow: MetricsTimeWindow = 'all'): RouterMetricsSummary {
    const windowStart = this.getWindowStart(timeWindow);
    const filteredDecisions = this.filterByTime(this.decisions, windowStart);
    const filteredCalls = this.filterByTime(this.providerCalls, windowStart);
    const filteredFallbacks = this.filterByTime(this.fallbacks, windowStart);

    const byProvider = this.calculateProviderMetrics(filteredDecisions, filteredCalls);
    const byAgentType = this.calculateAgentMetrics(filteredDecisions, filteredCalls);
    const decisionTimes = filteredDecisions.map((d) => d.decisionTimeMs);

    const totalDecisions = filteredDecisions.length;
    const modeCount = this.countByMode(filteredDecisions);
    const fallbackCount = filteredDecisions.filter((d) => d.wasFallback).length;
    const ruleMatchCount = filteredDecisions.filter((d) => d.ruleId).length;

    return {
      byProvider: Object.fromEntries(byProvider) as Partial<Record<ExtendedProviderType, ProviderRoutingMetrics>>,
      byAgentType,
      totalDecisions,
      decisionsByMode: modeCount,
      avgDecisionTimeMs: this.average(decisionTimes),
      p95DecisionTimeMs: this.percentile(decisionTimes, 95),
      p99DecisionTimeMs: this.percentile(decisionTimes, 99),
      fallbackRate: totalDecisions > 0 ? fallbackCount / totalDecisions : 0,
      ruleMatchRate: totalDecisions > 0 ? ruleMatchCount / totalDecisions : 0,
      estimatedCostSavings: this.calculateCostSavings(filteredDecisions),
      ruleStats: {
        totalEvaluated: filteredDecisions.reduce((sum, d) => sum + 1, 0), // Simplified
        matched: ruleMatchCount,
        avgRulesPerDecision: 1, // Simplified for now
      },
      cacheStats: {
        hits: this.cacheHits,
        misses: this.cacheMisses,
        hitRate: this.cacheHits + this.cacheMisses > 0
          ? this.cacheHits / (this.cacheHits + this.cacheMisses)
          : 0,
      },
      period: {
        start: windowStart,
        end: new Date(),
      },
      recentDecisions: filteredDecisions.slice(-50),
      fallbackStats: this.calculateFallbackStats(filteredFallbacks),
    };
  }

  /**
   * Get metrics for a specific provider
   */
  getMetricsByProvider(provider: ExtendedProviderType): ProviderMetrics {
    const providerDecisions = this.decisions.filter((d) => d.provider === provider);
    const providerCalls = this.providerCalls.filter((c) => c.provider === provider);

    const latencies = providerCalls.map((c) => c.latencyMs);
    const decisionTimes = providerDecisions.map((d) => d.decisionTimeMs);
    const successfulCalls = providerCalls.filter((c) => c.success);
    const errors = providerCalls.filter((c) => !c.success);

    return {
      provider,
      selectionCount: providerDecisions.length,
      ruleMatchCount: providerDecisions.filter((d) => d.ruleId).length,
      fallbackCount: providerDecisions.filter((d) => d.wasFallback).length,
      avgDecisionTimeMs: this.average(decisionTimes),
      successRate: providerCalls.length > 0
        ? successfulCalls.length / providerCalls.length
        : 1,
      avgLatencyMs: this.average(latencies),
      p95LatencyMs: this.percentile(latencies, 95),
      p99LatencyMs: this.percentile(latencies, 99),
      totalCost: providerCalls.reduce((sum, c) => sum + (c.cost ?? 0), 0),
      totalTokens: providerCalls.reduce((sum, c) => sum + c.totalTokens, 0),
      totalInputTokens: providerCalls.reduce((sum, c) => sum + c.inputTokens, 0),
      totalOutputTokens: providerCalls.reduce((sum, c) => sum + c.outputTokens, 0),
      circuitState: 'closed', // Simplified - would need circuit breaker integration
      latencyHistogram: latencies.slice(-100),
      decisionTimeHistogram: decisionTimes.slice(-100),
      errorCount: errors.length,
      lastError: errors.length > 0 ? errors[errors.length - 1].timestamp : undefined,
      recentCalls: providerCalls.slice(-20),
    };
  }

  /**
   * Get metrics for a specific agent type
   */
  getMetricsByAgentType(agentType: string): AgentMetrics {
    const agentDecisions = this.decisions.filter((d) => d.agentType === agentType);
    const agentCalls = this.providerCalls.filter((c) => c.agentType === agentType);

    const providerDistribution = new Map<ExtendedProviderType, number>();
    const modelDistribution = new Map<string, number>();

    for (const decision of agentDecisions) {
      providerDistribution.set(
        decision.provider,
        (providerDistribution.get(decision.provider) ?? 0) + 1
      );
      modelDistribution.set(
        decision.model,
        (modelDistribution.get(decision.model) ?? 0) + 1
      );
    }

    const latencies = agentCalls.map((c) => c.latencyMs);
    const fallbackCount = agentDecisions.filter((d) => d.wasFallback).length;
    const successCount = agentDecisions.filter((d) => d.success).length;

    return {
      agentType,
      totalDecisions: agentDecisions.length,
      providerDistribution,
      modelDistribution,
      avgLatencyMs: this.average(latencies),
      totalCost: agentCalls.reduce((sum, c) => sum + (c.cost ?? 0), 0),
      totalTokens: agentCalls.reduce((sum, c) => sum + c.totalTokens, 0),
      fallbackRate: agentDecisions.length > 0
        ? fallbackCount / agentDecisions.length
        : 0,
      successRate: agentDecisions.length > 0
        ? successCount / agentDecisions.length
        : 1,
    };
  }

  /**
   * Get audit log entries
   */
  getAuditLog(options: {
    limit?: number;
    since?: Date;
    provider?: ExtendedProviderType;
    agentType?: string;
  } = {}): RoutingAuditEntry[] {
    let filtered = this.decisions;

    if (options.since) {
      filtered = filtered.filter((d) => d.timestamp >= options.since!);
    }

    if (options.provider) {
      filtered = filtered.filter((d) => d.provider === options.provider);
    }

    if (options.agentType) {
      filtered = filtered.filter((d) => d.agentType === options.agentType);
    }

    const limit = options.limit ?? 100;
    return filtered.slice(-limit).map((d) => ({
      id: d.id,
      timestamp: d.timestamp,
      context: {
        agentType: d.agentType,
      },
      decision: {
        providerType: d.provider,
        model: d.model,
        providerModelId: d.model,
        reason: d.reason as SelectionReason,
        confidence: 1,
        metadata: {
          decisionTimeMs: d.decisionTimeMs,
          timestamp: d.timestamp,
        },
      },
      outcome: {
        success: d.success,
        latencyMs: d.latencyMs,
        tokenUsage: d.tokenUsage,
        cost: d.cost,
      },
    }));
  }

  /**
   * Reset all metrics
   */
  resetMetrics(): void {
    this.decisions = [];
    this.providerCalls = [];
    this.fallbacks = [];
    this.cacheHits = 0;
    this.cacheMisses = 0;
    this.startTime = new Date();
  }

  // ==========================================================================
  // Private Helper Methods
  // ==========================================================================

  private inferMode(reason: string): RoutingMode {
    switch (reason) {
      case 'manual':
        return 'manual';
      case 'rule-match':
        return 'rule-based';
      case 'cost-optimization':
        return 'cost-optimized';
      case 'performance-optimization':
        return 'performance-optimized';
      default:
        return 'rule-based';
    }
  }

  private trimRecords(): void {
    if (this.decisions.length > this.maxRecords) {
      this.decisions = this.decisions.slice(-this.maxRecords);
    }
  }

  private trimCallRecords(): void {
    if (this.providerCalls.length > this.maxCallRecords) {
      this.providerCalls = this.providerCalls.slice(-this.maxCallRecords);
    }
  }

  private getWindowStart(window: MetricsTimeWindow): Date {
    const now = new Date();
    switch (window) {
      case '1m':
        return new Date(now.getTime() - 60 * 1000);
      case '5m':
        return new Date(now.getTime() - 5 * 60 * 1000);
      case '15m':
        return new Date(now.getTime() - 15 * 60 * 1000);
      case '1h':
        return new Date(now.getTime() - 60 * 60 * 1000);
      case '24h':
        return new Date(now.getTime() - 24 * 60 * 60 * 1000);
      case '7d':
        return new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      case 'all':
      default:
        return this.startTime;
    }
  }

  private filterByTime<T extends { timestamp: Date }>(
    records: T[],
    windowStart: Date
  ): T[] {
    return records.filter((r) => r.timestamp >= windowStart);
  }

  private calculateProviderMetrics(
    decisions: RoutingDecisionRecord[],
    calls: ProviderCallRecord[]
  ): Map<ExtendedProviderType, ProviderRoutingMetrics> {
    const metrics = new Map<ExtendedProviderType, ProviderRoutingMetrics>();

    for (const provider of ALL_PROVIDER_TYPES) {
      const providerDecisions = decisions.filter((d) => d.provider === provider);
      const providerCalls = calls.filter((c) => c.provider === provider);

      if (providerDecisions.length === 0 && providerCalls.length === 0) {
        continue;
      }

      const latencies = providerCalls.map((c) => c.latencyMs);
      const decisionTimes = providerDecisions.map((d) => d.decisionTimeMs);
      const successfulCalls = providerCalls.filter((c) => c.success);

      metrics.set(provider, {
        provider,
        selectionCount: providerDecisions.length,
        ruleMatchCount: providerDecisions.filter((d) => d.ruleId).length,
        fallbackCount: providerDecisions.filter((d) => d.wasFallback).length,
        avgDecisionTimeMs: this.average(decisionTimes),
        successRate: providerCalls.length > 0
          ? successfulCalls.length / providerCalls.length
          : 1,
        avgLatencyMs: this.average(latencies),
        p95LatencyMs: this.percentile(latencies, 95),
        p99LatencyMs: this.percentile(latencies, 99),
        totalCost: providerCalls.reduce((sum, c) => sum + (c.cost ?? 0), 0),
        totalTokens: providerCalls.reduce((sum, c) => sum + c.totalTokens, 0),
        circuitState: 'closed',
      });
    }

    return metrics;
  }

  private calculateAgentMetrics(
    decisions: RoutingDecisionRecord[],
    calls: ProviderCallRecord[]
  ): Map<string, AgentMetrics> {
    const agentTypes = new Set<string>();
    decisions.forEach((d) => d.agentType && agentTypes.add(d.agentType));
    calls.forEach((c) => c.agentType && agentTypes.add(c.agentType));

    const metrics = new Map<string, AgentMetrics>();

    for (const agentType of agentTypes) {
      metrics.set(agentType, this.getMetricsByAgentType(agentType));
    }

    return metrics;
  }

  private countByMode(
    decisions: RoutingDecisionRecord[]
  ): Record<RoutingMode, number> {
    const counts: Record<RoutingMode, number> = {
      'manual': 0,
      'rule-based': 0,
      'cost-optimized': 0,
      'performance-optimized': 0,
    };

    for (const decision of decisions) {
      counts[decision.mode]++;
    }

    return counts;
  }

  private calculateFallbackStats(fallbacks: FallbackRecord[]): {
    total: number;
    byProvider: Map<ExtendedProviderType, number>;
    byReason: Map<string, number>;
  } {
    const byProvider = new Map<ExtendedProviderType, number>();
    const byReason = new Map<string, number>();

    for (const fb of fallbacks) {
      byProvider.set(
        fb.fromProvider,
        (byProvider.get(fb.fromProvider) ?? 0) + 1
      );
      byReason.set(fb.reason, (byReason.get(fb.reason) ?? 0) + 1);
    }

    return {
      total: fallbacks.length,
      byProvider,
      byReason,
    };
  }

  private calculateCostSavings(decisions: RoutingDecisionRecord[]): number {
    // Simplified cost savings calculation
    // In a full implementation, this would compare actual costs vs. theoretical costs
    // using the most expensive provider
    return decisions.reduce((sum, d) => {
      if (d.cost && d.mode === 'cost-optimized') {
        // Estimate 20% savings for cost-optimized routing
        return sum + d.cost.totalCost * 0.2;
      }
      return sum;
    }, 0);
  }

  private average(values: number[]): number {
    if (values.length === 0) return 0;
    return values.reduce((sum, v) => sum + v, 0) / values.length;
  }

  private percentile(values: number[], p: number): number {
    if (values.length === 0) return 0;

    const sorted = [...values].sort((a, b) => a - b);
    const index = Math.ceil((p / 100) * sorted.length) - 1;
    return sorted[Math.max(0, index)];
  }
}

// ============================================================================
// Factory Functions
// ============================================================================

/**
 * Create a new RouterMetricsCollector instance
 */
export function createRouterMetricsCollector(
  options?: { maxRecords?: number; maxCallRecords?: number }
): RouterMetricsCollector {
  return new RouterMetricsCollector(options);
}

/**
 * Global metrics collector singleton
 */
let globalMetricsCollector: RouterMetricsCollector | undefined;

/**
 * Get the global metrics collector instance
 */
export function getGlobalRouterMetrics(): RouterMetricsCollector {
  if (!globalMetricsCollector) {
    globalMetricsCollector = new RouterMetricsCollector();
  }
  return globalMetricsCollector;
}

/**
 * Reset the global metrics collector (for testing)
 */
export function resetGlobalRouterMetrics(): void {
  globalMetricsCollector = undefined;
}
