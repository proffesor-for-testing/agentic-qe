/**
 * Inference Cost Tracker - Local vs Cloud Inference Cost Monitoring
 *
 * Tracks and analyzes inference costs across different providers:
 * - Local inference (ruvllm): $0 cost
 * - Cloud inference (Claude, OpenRouter): Token-based pricing
 *
 * Features:
 * - Request counting by provider
 * - Token usage tracking
 * - Cost estimation with current pricing
 * - Savings calculation from local inference
 * - Time-series data with TTL support
 * - Memory-backed storage for persistence
 *
 * Performance:
 * - O(1) request tracking
 * - O(n) reporting where n = number of tracked requests
 * - Memory TTL: 24 hours default
 *
 * @module core/metrics/InferenceCostTracker
 * @version 1.0.0
 */

import { PRICING_TABLE, type ProviderPricing, type TokenUsage } from '../../telemetry/metrics/collectors/cost.js';
import { Logger } from '../../utils/Logger.js';

/**
 * Provider type classification
 */
export type ProviderType = 'local' | 'cloud';

/**
 * Inference provider identifiers
 */
export type InferenceProvider = 'ruvllm' | 'anthropic' | 'openrouter' | 'openai' | 'onnx';

/**
 * Single inference request record
 */
export interface InferenceRequest {
  /** Unique request ID */
  id: string;
  /** Provider used */
  provider: InferenceProvider;
  /** Provider type (local/cloud) */
  providerType: ProviderType;
  /** Model identifier */
  model: string;
  /** Timestamp */
  timestamp: number;
  /** Token usage */
  tokens: TokenUsage;
  /** Estimated cost in USD */
  cost: number;
  /** Agent that made the request */
  agentId?: string;
  /** Task context */
  taskId?: string;
  /** Additional metadata */
  metadata?: Record<string, any>;
}

/**
 * Aggregated cost metrics per provider
 */
export interface ProviderCostMetrics {
  /** Provider name */
  provider: InferenceProvider;
  /** Provider type */
  providerType: ProviderType;
  /** Total requests */
  requestCount: number;
  /** Total input tokens */
  inputTokens: number;
  /** Total output tokens */
  outputTokens: number;
  /** Total tokens */
  totalTokens: number;
  /** Estimated total cost in USD */
  totalCost: number;
  /** Average cost per request */
  avgCostPerRequest: number;
  /** Most used model */
  topModel: string;
  /** Model usage counts */
  modelCounts: Record<string, number>;
}

/**
 * Cost savings analysis
 */
export interface CostSavingsAnalysis {
  /** Total cost with current provider mix */
  actualCost: number;
  /** Estimated cost if all were cloud (Claude baseline) */
  cloudBaselineCost: number;
  /** Total savings from using local inference */
  totalSavings: number;
  /** Savings percentage */
  savingsPercentage: number;
  /** Local request percentage */
  localRequestPercentage: number;
  /** Cloud request percentage */
  cloudRequestPercentage: number;
  /** Local requests count */
  localRequests: number;
  /** Cloud requests count */
  cloudRequests: number;
  /** Total requests */
  totalRequests: number;
}

/**
 * Cost report summary
 */
export interface CostReport {
  /** Report timestamp */
  timestamp: number;
  /** Time range start */
  periodStart: number;
  /** Time range end */
  periodEnd: number;
  /** Per-provider metrics */
  byProvider: Map<InferenceProvider, ProviderCostMetrics>;
  /** Savings analysis */
  savings: CostSavingsAnalysis;
  /** Total requests */
  totalRequests: number;
  /** Total cost */
  totalCost: number;
  /** Total tokens */
  totalTokens: number;
  /** Requests per hour */
  requestsPerHour: number;
  /** Cost per hour */
  costPerHour: number;
}

/**
 * Tracker configuration
 */
export interface InferenceCostTrackerConfig {
  /** Memory TTL in milliseconds (default: 24 hours) */
  ttl: number;
  /** Auto-prune interval in milliseconds (default: 1 hour) */
  pruneInterval: number;
  /** Enable automatic pruning */
  autoPrune: boolean;
  /** Baseline provider for savings calculation */
  baselineProvider: 'anthropic' | 'openai';
  /** Baseline model for savings calculation */
  baselineModel: string;
}

/**
 * Inference Cost Tracker Implementation
 *
 * Tracks inference requests and calculates costs across local and cloud providers.
 *
 * @example
 * ```typescript
 * const tracker = new InferenceCostTracker();
 *
 * // Track local inference (free)
 * tracker.trackRequest({
 *   provider: 'ruvllm',
 *   model: 'meta-llama/llama-3.1-8b-instruct',
 *   tokens: { inputTokens: 1000, outputTokens: 500, totalTokens: 1500 },
 *   agentId: 'test-gen-001',
 * });
 *
 * // Track cloud inference
 * tracker.trackRequest({
 *   provider: 'anthropic',
 *   model: 'claude-sonnet-4-5-20250929',
 *   tokens: { inputTokens: 1000, outputTokens: 500, totalTokens: 1500 },
 *   agentId: 'test-gen-002',
 * });
 *
 * // Get cost report
 * const report = tracker.getCostReport();
 * console.log(`Total cost: $${report.totalCost.toFixed(4)}`);
 * console.log(`Savings: $${report.savings.totalSavings.toFixed(4)}`);
 * ```
 */
export class InferenceCostTracker {
  private readonly logger: Logger;
  private readonly config: InferenceCostTrackerConfig;
  private readonly requests: Map<string, InferenceRequest> = new Map();
  private pruneTimer?: NodeJS.Timeout;

  constructor(config?: Partial<InferenceCostTrackerConfig>) {
    this.logger = Logger.getInstance();
    this.config = {
      ttl: 86400000, // 24 hours
      pruneInterval: 3600000, // 1 hour
      autoPrune: true,
      baselineProvider: 'anthropic',
      baselineModel: 'claude-sonnet-4-5-20250929',
      ...config,
    };

    if (this.config.autoPrune) {
      this.startAutoPrune();
    }
  }

  /**
   * Track an inference request
   *
   * @param params - Request parameters
   * @returns Request ID
   */
  trackRequest(params: {
    provider: InferenceProvider;
    model: string;
    tokens: TokenUsage;
    agentId?: string;
    taskId?: string;
    metadata?: Record<string, any>;
  }): string {
    const { provider, model, tokens, agentId, taskId, metadata } = params;

    // Determine provider type
    const providerType = this.getProviderType(provider);

    // Calculate cost
    const cost = this.calculateCost(provider, model, tokens);

    // Create request record
    const request: InferenceRequest = {
      id: this.generateRequestId(),
      provider,
      providerType,
      model,
      timestamp: Date.now(),
      tokens,
      cost,
      agentId,
      taskId,
      metadata,
    };

    // Store request
    this.requests.set(request.id, request);

    this.logger.debug(`Tracked inference request: ${request.id}`, {
      provider,
      model,
      cost,
      tokens: tokens.totalTokens,
    });

    return request.id;
  }

  /**
   * Get cost report for a time period
   *
   * @param startTime - Start timestamp (default: 24 hours ago)
   * @param endTime - End timestamp (default: now)
   * @returns Cost report
   */
  getCostReport(startTime?: number, endTime?: number): CostReport {
    const now = Date.now();
    const start = startTime || now - this.config.ttl;
    const end = endTime || now;

    // Filter requests by time range
    const requests = Array.from(this.requests.values()).filter(
      r => r.timestamp >= start && r.timestamp <= end
    );

    // Aggregate by provider
    const byProvider = new Map<InferenceProvider, ProviderCostMetrics>();

    for (const request of requests) {
      let metrics = byProvider.get(request.provider);

      if (!metrics) {
        metrics = {
          provider: request.provider,
          providerType: request.providerType,
          requestCount: 0,
          inputTokens: 0,
          outputTokens: 0,
          totalTokens: 0,
          totalCost: 0,
          avgCostPerRequest: 0,
          topModel: '',
          modelCounts: {},
        };
        byProvider.set(request.provider, metrics);
      }

      // Accumulate metrics
      metrics.requestCount++;
      metrics.inputTokens += request.tokens.inputTokens;
      metrics.outputTokens += request.tokens.outputTokens;
      metrics.totalTokens += request.tokens.totalTokens;
      metrics.totalCost += request.cost;

      // Track model usage
      metrics.modelCounts[request.model] = (metrics.modelCounts[request.model] || 0) + 1;
    }

    // Calculate averages and top models
    for (const metrics of byProvider.values()) {
      metrics.avgCostPerRequest = metrics.totalCost / metrics.requestCount;

      // Find most used model
      let maxCount = 0;
      for (const [model, count] of Object.entries(metrics.modelCounts)) {
        if (count > maxCount) {
          maxCount = count;
          metrics.topModel = model;
        }
      }
    }

    // Calculate savings
    const savings = this.calculateSavings(requests);

    // Calculate totals
    const totalRequests = requests.length;
    const totalCost = requests.reduce((sum, r) => sum + r.cost, 0);
    const totalTokens = requests.reduce((sum, r) => sum + r.tokens.totalTokens, 0);

    // Calculate rates
    const periodHours = (end - start) / 3600000;
    const requestsPerHour = totalRequests / periodHours;
    const costPerHour = totalCost / periodHours;

    return {
      timestamp: now,
      periodStart: start,
      periodEnd: end,
      byProvider,
      savings,
      totalRequests,
      totalCost,
      totalTokens,
      requestsPerHour,
      costPerHour,
    };
  }

  /**
   * Get metrics for a specific provider
   *
   * @param provider - Provider name
   * @returns Provider metrics or null if not found
   */
  getProviderMetrics(provider: InferenceProvider): ProviderCostMetrics | null {
    const report = this.getCostReport();
    return report.byProvider.get(provider) || null;
  }

  /**
   * Get all requests (optionally filtered)
   *
   * @param filter - Optional filter function
   * @returns Array of requests
   */
  getRequests(filter?: (request: InferenceRequest) => boolean): InferenceRequest[] {
    const requests = Array.from(this.requests.values());
    return filter ? requests.filter(filter) : requests;
  }

  /**
   * Clear all tracked requests
   */
  reset(): void {
    this.requests.clear();
    this.logger.info('Inference cost tracker reset');
  }

  /**
   * Get provider type classification
   */
  private getProviderType(provider: InferenceProvider): ProviderType {
    return provider === 'ruvllm' || provider === 'onnx' ? 'local' : 'cloud';
  }

  /**
   * Calculate cost for a request
   */
  private calculateCost(
    provider: InferenceProvider,
    model: string,
    tokens: TokenUsage
  ): number {
    // Local inference is free
    if (this.getProviderType(provider) === 'local') {
      return 0;
    }

    // Find pricing
    const pricing = this.findPricing(provider, model);
    if (!pricing) {
      this.logger.warn(`No pricing found for ${provider}/${model}, assuming $0`);
      return 0;
    }

    // Calculate cost
    const inputCost = (tokens.inputTokens / 1_000_000) * pricing.inputCostPerMillion;
    const outputCost = (tokens.outputTokens / 1_000_000) * pricing.outputCostPerMillion;

    let cacheWriteCost = 0;
    let cacheReadCost = 0;

    if (tokens.cacheCreationTokens && pricing.cacheWriteCostPerMillion) {
      cacheWriteCost = (tokens.cacheCreationTokens / 1_000_000) * pricing.cacheWriteCostPerMillion;
    }

    if (tokens.cacheReadTokens && pricing.cacheReadCostPerMillion) {
      cacheReadCost = (tokens.cacheReadTokens / 1_000_000) * pricing.cacheReadCostPerMillion;
    }

    return inputCost + outputCost + cacheWriteCost + cacheReadCost;
  }

  /**
   * Find pricing for provider/model
   */
  private findPricing(provider: InferenceProvider, model: string): ProviderPricing | null {
    // Map inference provider to pricing provider
    const pricingProvider = provider === 'ruvllm' ? 'openrouter' : provider;

    return PRICING_TABLE.find(
      p => p.provider === pricingProvider && p.model === model
    ) || null;
  }

  /**
   * Calculate cost savings from using local inference
   */
  private calculateSavings(requests: InferenceRequest[]): CostSavingsAnalysis {
    const localRequests = requests.filter(r => r.providerType === 'local');
    const cloudRequests = requests.filter(r => r.providerType === 'cloud');

    const actualCost = requests.reduce((sum, r) => sum + r.cost, 0);

    // Calculate what local requests would cost if they were cloud
    const baselinePricing = this.findPricing(
      this.config.baselineProvider,
      this.config.baselineModel
    );

    let cloudBaselineCost = actualCost;

    if (baselinePricing) {
      const localAsCloudCost = localRequests.reduce((sum, r) => {
        const inputCost = (r.tokens.inputTokens / 1_000_000) * baselinePricing.inputCostPerMillion;
        const outputCost = (r.tokens.outputTokens / 1_000_000) * baselinePricing.outputCostPerMillion;
        return sum + inputCost + outputCost;
      }, 0);

      cloudBaselineCost = actualCost + localAsCloudCost;
    }

    const totalSavings = cloudBaselineCost - actualCost;
    const savingsPercentage = cloudBaselineCost > 0
      ? (totalSavings / cloudBaselineCost) * 100
      : 0;

    const totalRequests = requests.length;
    const localRequestPercentage = totalRequests > 0
      ? (localRequests.length / totalRequests) * 100
      : 0;
    const cloudRequestPercentage = totalRequests > 0
      ? (cloudRequests.length / totalRequests) * 100
      : 0;

    return {
      actualCost,
      cloudBaselineCost,
      totalSavings,
      savingsPercentage,
      localRequestPercentage,
      cloudRequestPercentage,
      localRequests: localRequests.length,
      cloudRequests: cloudRequests.length,
      totalRequests,
    };
  }

  /**
   * Generate unique request ID
   */
  private generateRequestId(): string {
    return `inf-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
  }

  /**
   * Start automatic pruning of old requests
   */
  private startAutoPrune(): void {
    this.pruneTimer = setInterval(() => {
      this.pruneOldRequests();
    }, this.config.pruneInterval);
  }

  /**
   * Prune requests older than TTL
   */
  private pruneOldRequests(): void {
    const cutoff = Date.now() - this.config.ttl;
    let pruned = 0;

    for (const [id, request] of this.requests.entries()) {
      if (request.timestamp < cutoff) {
        this.requests.delete(id);
        pruned++;
      }
    }

    if (pruned > 0) {
      this.logger.debug(`Pruned ${pruned} old inference requests`);
    }
  }

  /**
   * Stop auto-pruning and cleanup
   */
  destroy(): void {
    if (this.pruneTimer) {
      clearInterval(this.pruneTimer);
      this.pruneTimer = undefined;
    }
    this.requests.clear();
  }

  /**
   * Export data for persistence (e.g., to memory store)
   */
  exportData(): {
    requests: InferenceRequest[];
    config: InferenceCostTrackerConfig;
    timestamp: number;
  } {
    return {
      requests: Array.from(this.requests.values()),
      config: this.config,
      timestamp: Date.now(),
    };
  }

  /**
   * Import data from persistence
   */
  importData(data: {
    requests: InferenceRequest[];
    timestamp: number;
  }): void {
    this.requests.clear();

    // Only import requests within TTL
    const cutoff = Date.now() - this.config.ttl;
    let imported = 0;

    for (const request of data.requests) {
      if (request.timestamp >= cutoff) {
        this.requests.set(request.id, request);
        imported++;
      }
    }

    this.logger.info(`Imported ${imported} inference requests from persistence`);
  }
}

/**
 * Global singleton instance
 */
let globalTracker: InferenceCostTracker | null = null;

/**
 * Get or create the global cost tracker
 */
export function getInferenceCostTracker(
  config?: Partial<InferenceCostTrackerConfig>
): InferenceCostTracker {
  if (!globalTracker) {
    globalTracker = new InferenceCostTracker(config);
  }
  return globalTracker;
}

/**
 * Reset global tracker (for testing)
 */
export function resetInferenceCostTracker(): void {
  if (globalTracker) {
    globalTracker.destroy();
    globalTracker = null;
  }
}

/**
 * Format cost report as human-readable text
 *
 * @param report - Cost report
 * @returns Formatted text
 */
export function formatCostReport(report: CostReport): string {
  const lines: string[] = [];

  lines.push('Inference Cost Report');
  lines.push('====================');
  lines.push('');

  // Time range
  const periodStart = new Date(report.periodStart).toISOString();
  const periodEnd = new Date(report.periodEnd).toISOString();
  lines.push(`Period: ${periodStart} to ${periodEnd}`);
  lines.push('');

  // Overall metrics
  lines.push('Overall Metrics:');
  lines.push(`  Total Requests: ${report.totalRequests.toLocaleString()}`);
  lines.push(`  Total Tokens: ${report.totalTokens.toLocaleString()}`);
  lines.push(`  Total Cost: $${report.totalCost.toFixed(4)}`);
  lines.push(`  Requests/Hour: ${report.requestsPerHour.toFixed(1)}`);
  lines.push(`  Cost/Hour: $${report.costPerHour.toFixed(4)}`);
  lines.push('');

  // Savings
  const { savings } = report;
  lines.push('Cost Savings Analysis:');
  lines.push(`  Actual Cost: $${savings.actualCost.toFixed(4)}`);
  lines.push(`  Cloud Baseline Cost: $${savings.cloudBaselineCost.toFixed(4)}`);
  lines.push(`  Total Savings: $${savings.totalSavings.toFixed(4)} (${savings.savingsPercentage.toFixed(1)}%)`);
  lines.push(`  Local Requests: ${savings.localRequests} (${savings.localRequestPercentage.toFixed(1)}%)`);
  lines.push(`  Cloud Requests: ${savings.cloudRequests} (${savings.cloudRequestPercentage.toFixed(1)}%)`);
  lines.push('');

  // Per-provider breakdown
  lines.push('By Provider:');
  for (const [provider, metrics] of report.byProvider.entries()) {
    const providerIcon = metrics.providerType === 'local' ? '🏠' : '☁️';
    lines.push(`  ${providerIcon} ${provider}:`);
    lines.push(`    Requests: ${metrics.requestCount.toLocaleString()}`);
    lines.push(`    Tokens: ${metrics.totalTokens.toLocaleString()}`);
    lines.push(`    Cost: $${metrics.totalCost.toFixed(4)}`);
    lines.push(`    Avg Cost/Request: $${metrics.avgCostPerRequest.toFixed(6)}`);
    lines.push(`    Top Model: ${metrics.topModel}`);
  }

  return lines.join('\n');
}

/**
 * Format cost report as JSON
 *
 * @param report - Cost report
 * @returns JSON string
 */
export function formatCostReportJSON(report: CostReport): string {
  const data = {
    timestamp: new Date(report.timestamp).toISOString(),
    period: {
      start: new Date(report.periodStart).toISOString(),
      end: new Date(report.periodEnd).toISOString(),
    },
    overall: {
      totalRequests: report.totalRequests,
      totalTokens: report.totalTokens,
      totalCost: report.totalCost,
      requestsPerHour: report.requestsPerHour,
      costPerHour: report.costPerHour,
    },
    savings: report.savings,
    byProvider: Object.fromEntries(report.byProvider.entries()),
  };

  return JSON.stringify(data, null, 2);
}
