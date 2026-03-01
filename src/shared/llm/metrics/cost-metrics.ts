/**
 * Agentic QE v3 - Cost Metrics Collector
 * ADR-043: Vendor-Independent LLM Support - Milestone 11
 *
 * Specialized cost tracking and analysis for LLM usage:
 * - Cost breakdown by provider, model, and agent type
 * - Cost trends over time periods
 * - Budget monitoring and alerts
 * - Cost optimization insights
 */

import { ExtendedProviderType, ALL_PROVIDER_TYPES } from '../router/types';
import { CostTracker, MODEL_PRICING } from '../cost-tracker';
import { LLMProviderType, TokenUsage, CostInfo } from '../interfaces';

// ============================================================================
// Types
// ============================================================================

/**
 * Cost record for detailed tracking
 */
export interface CostRecord {
  readonly timestamp: Date;
  readonly provider: ExtendedProviderType;
  readonly model: string;
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly inputCost: number;
  readonly outputCost: number;
  readonly totalCost: number;
  readonly agentType?: string;
  readonly requestId?: string;
}

/**
 * Cost trend data point
 */
export interface CostTrend {
  readonly timestamp: Date;
  readonly cost: number;
  readonly tokens: number;
  readonly requests: number;
}

/**
 * Cost summary by category
 */
export interface CostBreakdown {
  readonly totalCost: number;
  readonly totalTokens: number;
  readonly totalRequests: number;
  readonly avgCostPerRequest: number;
  readonly avgCostPerToken: number;
}

/**
 * Budget alert configuration
 */
export interface BudgetAlert {
  readonly threshold: number;
  readonly period: '1h' | '24h' | '7d' | '30d';
  readonly callback: (summary: CostBreakdown) => void;
  active: boolean;
}

/**
 * Cost optimization suggestion
 */
export interface CostOptimizationSuggestion {
  readonly type: 'model-switch' | 'provider-switch' | 'caching' | 'batching';
  readonly description: string;
  readonly estimatedSavings: number;
  readonly currentCost: number;
  readonly suggestedProvider?: ExtendedProviderType;
  readonly suggestedModel?: string;
}

// ============================================================================
// CostMetricsCollector Implementation
// ============================================================================

/**
 * Comprehensive cost metrics collector for LLM usage
 */
export class CostMetricsCollector {
  private records: CostRecord[] = [];
  private alerts: BudgetAlert[] = [];
  private readonly maxRecords: number;
  private alertCheckInterval?: NodeJS.Timeout;

  constructor(options: { maxRecords?: number } = {}) {
    this.maxRecords = options.maxRecords ?? 10000;
  }

  // ==========================================================================
  // Recording Methods
  // ==========================================================================

  /**
   * Record a cost event
   */
  recordCost(
    provider: ExtendedProviderType,
    model: string,
    inputTokens: number,
    outputTokens: number,
    options: {
      agentType?: string;
      requestId?: string;
    } = {}
  ): CostRecord {
    const cost = this.calculateCost(model, inputTokens, outputTokens);

    const record: CostRecord = {
      timestamp: new Date(),
      provider,
      model,
      inputTokens,
      outputTokens,
      inputCost: cost.inputCost,
      outputCost: cost.outputCost,
      totalCost: cost.totalCost,
      agentType: options.agentType,
      requestId: options.requestId,
    };

    this.records.push(record);
    this.trimRecords();
    this.checkAlerts();

    return record;
  }

  /**
   * Record cost from CostInfo object
   */
  recordCostFromInfo(
    provider: ExtendedProviderType,
    model: string,
    usage: TokenUsage,
    cost: CostInfo,
    options: {
      agentType?: string;
      requestId?: string;
    } = {}
  ): CostRecord {
    const record: CostRecord = {
      timestamp: new Date(),
      provider,
      model,
      inputTokens: usage.promptTokens,
      outputTokens: usage.completionTokens,
      inputCost: cost.inputCost,
      outputCost: cost.outputCost,
      totalCost: cost.totalCost,
      agentType: options.agentType,
      requestId: options.requestId,
    };

    this.records.push(record);
    this.trimRecords();
    this.checkAlerts();

    return record;
  }

  // ==========================================================================
  // Cost Breakdown Methods
  // ==========================================================================

  /**
   * Get cost breakdown by provider
   */
  getCostByProvider(
    period: '1h' | '24h' | '7d' | '30d' | 'all' = 'all'
  ): Map<ExtendedProviderType, CostBreakdown> {
    const windowStart = this.getPeriodStart(period);
    const filtered = this.filterByTime(windowStart);

    const breakdown = new Map<ExtendedProviderType, CostBreakdown>();

    for (const provider of ALL_PROVIDER_TYPES) {
      const providerRecords = filtered.filter((r) => r.provider === provider);

      if (providerRecords.length === 0) {
        continue;
      }

      const totalCost = providerRecords.reduce((sum, r) => sum + r.totalCost, 0);
      const totalTokens = providerRecords.reduce(
        (sum, r) => sum + r.inputTokens + r.outputTokens,
        0
      );

      breakdown.set(provider, {
        totalCost,
        totalTokens,
        totalRequests: providerRecords.length,
        avgCostPerRequest: totalCost / providerRecords.length,
        avgCostPerToken: totalTokens > 0 ? totalCost / totalTokens : 0,
      });
    }

    return breakdown;
  }

  /**
   * Get cost breakdown by agent type
   */
  getCostByAgentType(
    period: '1h' | '24h' | '7d' | '30d' | 'all' = 'all'
  ): Map<string, CostBreakdown> {
    const windowStart = this.getPeriodStart(period);
    const filtered = this.filterByTime(windowStart);

    const agentTypes = new Set<string>();
    filtered.forEach((r) => r.agentType && agentTypes.add(r.agentType));

    const breakdown = new Map<string, CostBreakdown>();

    for (const agentType of agentTypes) {
      const agentRecords = filtered.filter((r) => r.agentType === agentType);

      const totalCost = agentRecords.reduce((sum, r) => sum + r.totalCost, 0);
      const totalTokens = agentRecords.reduce(
        (sum, r) => sum + r.inputTokens + r.outputTokens,
        0
      );

      breakdown.set(agentType, {
        totalCost,
        totalTokens,
        totalRequests: agentRecords.length,
        avgCostPerRequest: agentRecords.length > 0 ? totalCost / agentRecords.length : 0,
        avgCostPerToken: totalTokens > 0 ? totalCost / totalTokens : 0,
      });
    }

    // Add 'unknown' category for records without agent type
    const unknownRecords = filtered.filter((r) => !r.agentType);
    if (unknownRecords.length > 0) {
      const totalCost = unknownRecords.reduce((sum, r) => sum + r.totalCost, 0);
      const totalTokens = unknownRecords.reduce(
        (sum, r) => sum + r.inputTokens + r.outputTokens,
        0
      );

      breakdown.set('unknown', {
        totalCost,
        totalTokens,
        totalRequests: unknownRecords.length,
        avgCostPerRequest: totalCost / unknownRecords.length,
        avgCostPerToken: totalTokens > 0 ? totalCost / totalTokens : 0,
      });
    }

    return breakdown;
  }

  /**
   * Get cost breakdown by model
   */
  getCostByModel(
    period: '1h' | '24h' | '7d' | '30d' | 'all' = 'all'
  ): Map<string, CostBreakdown> {
    const windowStart = this.getPeriodStart(period);
    const filtered = this.filterByTime(windowStart);

    const models = new Set<string>();
    filtered.forEach((r) => models.add(r.model));

    const breakdown = new Map<string, CostBreakdown>();

    for (const model of models) {
      const modelRecords = filtered.filter((r) => r.model === model);

      const totalCost = modelRecords.reduce((sum, r) => sum + r.totalCost, 0);
      const totalTokens = modelRecords.reduce(
        (sum, r) => sum + r.inputTokens + r.outputTokens,
        0
      );

      breakdown.set(model, {
        totalCost,
        totalTokens,
        totalRequests: modelRecords.length,
        avgCostPerRequest: modelRecords.length > 0 ? totalCost / modelRecords.length : 0,
        avgCostPerToken: totalTokens > 0 ? totalCost / totalTokens : 0,
      });
    }

    return breakdown;
  }

  /**
   * Get total cost for a period
   */
  getTotalCost(period: '1h' | '24h' | '7d' | '30d' | 'all' = 'all'): number {
    const windowStart = this.getPeriodStart(period);
    const filtered = this.filterByTime(windowStart);
    return filtered.reduce((sum, r) => sum + r.totalCost, 0);
  }

  /**
   * Get cost trends over time
   */
  getCostTrend(period: '1h' | '24h' | '7d'): CostTrend[] {
    const now = new Date();
    const trends: CostTrend[] = [];

    let bucketSize: number;
    let bucketCount: number;

    switch (period) {
      case '1h':
        bucketSize = 5 * 60 * 1000; // 5 minutes
        bucketCount = 12;
        break;
      case '24h':
        bucketSize = 60 * 60 * 1000; // 1 hour
        bucketCount = 24;
        break;
      case '7d':
        bucketSize = 24 * 60 * 60 * 1000; // 1 day
        bucketCount = 7;
        break;
    }

    for (let i = bucketCount - 1; i >= 0; i--) {
      const bucketEnd = new Date(now.getTime() - i * bucketSize);
      const bucketStart = new Date(bucketEnd.getTime() - bucketSize);

      const bucketRecords = this.records.filter(
        (r) => r.timestamp >= bucketStart && r.timestamp < bucketEnd
      );

      trends.push({
        timestamp: bucketEnd,
        cost: bucketRecords.reduce((sum, r) => sum + r.totalCost, 0),
        tokens: bucketRecords.reduce(
          (sum, r) => sum + r.inputTokens + r.outputTokens,
          0
        ),
        requests: bucketRecords.length,
      });
    }

    return trends;
  }

  // ==========================================================================
  // Budget Alerts
  // ==========================================================================

  /**
   * Add a budget alert
   */
  addBudgetAlert(
    threshold: number,
    period: '1h' | '24h' | '7d' | '30d',
    callback: (summary: CostBreakdown) => void
  ): string {
    const alert: BudgetAlert = {
      threshold,
      period,
      callback,
      active: true,
    };

    this.alerts.push(alert);

    // Start checking alerts if not already
    if (!this.alertCheckInterval) {
      this.alertCheckInterval = setInterval(() => this.checkAlerts(), 60000);
    }

    return `alert-${this.alerts.length - 1}`;
  }

  /**
   * Remove a budget alert
   */
  removeBudgetAlert(index: number): boolean {
    if (index >= 0 && index < this.alerts.length) {
      this.alerts.splice(index, 1);

      if (this.alerts.length === 0 && this.alertCheckInterval) {
        clearInterval(this.alertCheckInterval);
        this.alertCheckInterval = undefined;
      }

      return true;
    }
    return false;
  }

  // ==========================================================================
  // Cost Optimization
  // ==========================================================================

  /**
   * Get cost optimization suggestions
   */
  getOptimizationSuggestions(): CostOptimizationSuggestion[] {
    const suggestions: CostOptimizationSuggestion[] = [];
    const byModel = this.getCostByModel('24h');

    // Check for expensive models that could use cheaper alternatives
    for (const [model, breakdown] of byModel) {
      const pricing = MODEL_PRICING[model];

      if (pricing && breakdown.totalCost > 1) {
        // Suggest cheaper alternatives
        if (model.includes('opus')) {
          suggestions.push({
            type: 'model-switch',
            description: `Consider using Sonnet instead of Opus for non-critical tasks`,
            estimatedSavings: breakdown.totalCost * 0.5,
            currentCost: breakdown.totalCost,
            suggestedModel: 'claude-sonnet-4-20250514',
          });
        }

        if (model === 'gpt-4o') {
          suggestions.push({
            type: 'model-switch',
            description: `Consider using GPT-4o-mini for simpler tasks`,
            estimatedSavings: breakdown.totalCost * 0.7,
            currentCost: breakdown.totalCost,
            suggestedModel: 'gpt-4o-mini',
          });
        }
      }
    }

    // Check for providers with free alternatives
    const byProvider = this.getCostByProvider('24h');
    const totalPaidCost = [...byProvider.values()].reduce(
      (sum, b) => sum + b.totalCost,
      0
    );

    if (totalPaidCost > 10 && !byProvider.has('ollama')) {
      suggestions.push({
        type: 'provider-switch',
        description: `Consider using Ollama for development/testing workloads`,
        estimatedSavings: totalPaidCost * 0.3,
        currentCost: totalPaidCost,
        suggestedProvider: 'ollama',
      });
    }

    // Check for high request volume (potential caching opportunity)
    const totalRequests = [...byModel.values()].reduce(
      (sum, b) => sum + b.totalRequests,
      0
    );

    if (totalRequests > 100) {
      suggestions.push({
        type: 'caching',
        description: `Enable response caching to reduce redundant API calls`,
        estimatedSavings: totalPaidCost * 0.15,
        currentCost: totalPaidCost,
      });
    }

    return suggestions;
  }

  // ==========================================================================
  // Utility Methods
  // ==========================================================================

  /**
   * Get all records (for export)
   */
  getRecords(): CostRecord[] {
    return [...this.records];
  }

  /**
   * Clear all records
   */
  clear(): void {
    this.records = [];
  }

  /**
   * Reset metrics
   */
  reset(): void {
    this.records = [];
    this.alerts = [];
    if (this.alertCheckInterval) {
      clearInterval(this.alertCheckInterval);
      this.alertCheckInterval = undefined;
    }
  }

  /**
   * Dispose resources
   */
  dispose(): void {
    if (this.alertCheckInterval) {
      clearInterval(this.alertCheckInterval);
      this.alertCheckInterval = undefined;
    }
  }

  // ==========================================================================
  // Private Helper Methods
  // ==========================================================================

  private calculateCost(
    model: string,
    inputTokens: number,
    outputTokens: number
  ): CostInfo {
    const pricing = MODEL_PRICING[model];

    if (!pricing) {
      return {
        inputCost: 0,
        outputCost: 0,
        totalCost: 0,
        currency: 'USD',
      };
    }

    const inputCost = (inputTokens / 1_000_000) * pricing.input;
    const outputCost = (outputTokens / 1_000_000) * pricing.output;

    return {
      inputCost,
      outputCost,
      totalCost: inputCost + outputCost,
      currency: 'USD',
    };
  }

  private trimRecords(): void {
    if (this.records.length > this.maxRecords) {
      this.records = this.records.slice(-this.maxRecords);
    }
  }

  private getPeriodStart(period: '1h' | '24h' | '7d' | '30d' | 'all'): Date {
    const now = new Date();
    switch (period) {
      case '1h':
        return new Date(now.getTime() - 60 * 60 * 1000);
      case '24h':
        return new Date(now.getTime() - 24 * 60 * 60 * 1000);
      case '7d':
        return new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      case '30d':
        return new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      case 'all':
      default:
        return new Date(0);
    }
  }

  private filterByTime(windowStart: Date): CostRecord[] {
    return this.records.filter((r) => r.timestamp >= windowStart);
  }

  private checkAlerts(): void {
    for (const alert of this.alerts) {
      if (!alert.active) continue;

      const totalCost = this.getTotalCost(alert.period);

      if (totalCost >= alert.threshold) {
        alert.active = false;

        const windowStart = this.getPeriodStart(alert.period);
        const filtered = this.filterByTime(windowStart);
        const totalTokens = filtered.reduce(
          (sum, r) => sum + r.inputTokens + r.outputTokens,
          0
        );

        try {
          alert.callback({
            totalCost,
            totalTokens,
            totalRequests: filtered.length,
            avgCostPerRequest: filtered.length > 0 ? totalCost / filtered.length : 0,
            avgCostPerToken: totalTokens > 0 ? totalCost / totalTokens : 0,
          });
        } catch (error) {
          console.error('Budget alert callback error:', error);
        }
      }
    }
  }
}

// ============================================================================
// Factory Functions
// ============================================================================

/**
 * Create a new CostMetricsCollector instance
 */
export function createCostMetricsCollector(
  options?: { maxRecords?: number }
): CostMetricsCollector {
  return new CostMetricsCollector(options);
}

/**
 * Global cost metrics collector singleton
 */
let globalCostMetrics: CostMetricsCollector | undefined;

/**
 * Get the global cost metrics collector instance
 */
export function getGlobalCostMetrics(): CostMetricsCollector {
  if (!globalCostMetrics) {
    globalCostMetrics = new CostMetricsCollector();
  }
  return globalCostMetrics;
}

/**
 * Reset the global cost metrics collector (for testing)
 */
export function resetGlobalCostMetrics(): void {
  if (globalCostMetrics) {
    globalCostMetrics.dispose();
  }
  globalCostMetrics = undefined;
}
