/**
 * Agentic QE v3 - LLM Cost Tracker
 * ADR-011: LLM Provider System for Quality Engineering
 *
 * Tracks token usage and costs across all LLM providers.
 * Supports cost limits, alerts, and detailed breakdowns.
 */

import {
  LLMProviderType,
  TokenUsage,
  CostInfo,
  CostPeriod,
  CostSummary,
  CostAlert,
} from './interfaces';

/**
 * Token pricing per model (cost per 1M tokens in USD)
 * Prices as of early 2025 - should be updated periodically
 */
export const MODEL_PRICING: Record<
  string,
  { input: number; output: number; provider: LLMProviderType }
> = {
  // Claude models
  'claude-opus-4-5-20251101': { input: 15.0, output: 75.0, provider: 'claude' },
  'claude-sonnet-4-20250514': { input: 3.0, output: 15.0, provider: 'claude' },
  'claude-3-5-haiku-20241022': { input: 1.0, output: 5.0, provider: 'claude' },
  // Legacy Claude models
  'claude-3-opus-20240229': { input: 15.0, output: 75.0, provider: 'claude' },
  'claude-3-sonnet-20240229': { input: 3.0, output: 15.0, provider: 'claude' },
  'claude-3-haiku-20240307': { input: 0.25, output: 1.25, provider: 'claude' },

  // OpenAI models
  'gpt-4o': { input: 5.0, output: 15.0, provider: 'openai' },
  'gpt-4o-mini': { input: 0.15, output: 0.6, provider: 'openai' },
  'gpt-4-turbo': { input: 10.0, output: 30.0, provider: 'openai' },
  'gpt-4': { input: 30.0, output: 60.0, provider: 'openai' },
  'gpt-3.5-turbo': { input: 0.5, output: 1.5, provider: 'openai' },

  // Ollama models (local, no cost)
  'llama3': { input: 0, output: 0, provider: 'ollama' },
  'llama3.1': { input: 0, output: 0, provider: 'ollama' },
  'codellama': { input: 0, output: 0, provider: 'ollama' },
  'mistral': { input: 0, output: 0, provider: 'ollama' },
  'mixtral': { input: 0, output: 0, provider: 'ollama' },
  'phi3': { input: 0, output: 0, provider: 'ollama' },
  'qwen2': { input: 0, output: 0, provider: 'ollama' },
};

/**
 * Usage record for a single request
 */
interface UsageRecord {
  timestamp: Date;
  provider: LLMProviderType;
  model: string;
  usage: TokenUsage;
  cost: CostInfo;
  requestId: string;
  metadata?: Record<string, unknown>;
}

/**
 * Cost tracker for LLM usage
 */
export class CostTracker {
  private records: UsageRecord[] = [];
  private alerts: CostAlert[] = [];
  private maxRecords: number;
  private alertCheckInterval?: NodeJS.Timeout;

  constructor(maxRecords: number = 10000) {
    this.maxRecords = maxRecords;
  }

  /**
   * Calculate cost for a given usage
   */
  static calculateCost(model: string, usage: TokenUsage): CostInfo {
    const pricing = MODEL_PRICING[model];

    if (!pricing) {
      // Unknown model - assume Ollama (local) for safety
      return {
        inputCost: 0,
        outputCost: 0,
        totalCost: 0,
        currency: 'USD',
      };
    }

    // Convert from per-million to actual cost
    const inputCost = (usage.promptTokens / 1_000_000) * pricing.input;
    const outputCost = (usage.completionTokens / 1_000_000) * pricing.output;

    return {
      inputCost,
      outputCost,
      totalCost: inputCost + outputCost,
      currency: 'USD',
    };
  }

  /**
   * Get cost per token for a model
   */
  static getCostPerToken(model: string): { input: number; output: number } {
    const pricing = MODEL_PRICING[model];

    if (!pricing) {
      return { input: 0, output: 0 };
    }

    return {
      input: pricing.input / 1_000_000,
      output: pricing.output / 1_000_000,
    };
  }

  /**
   * Record a usage event
   */
  recordUsage(
    provider: LLMProviderType,
    model: string,
    usage: TokenUsage,
    requestId: string,
    metadata?: Record<string, unknown>
  ): CostInfo {
    const cost = CostTracker.calculateCost(model, usage);

    const record: UsageRecord = {
      timestamp: new Date(),
      provider,
      model,
      usage,
      cost,
      requestId,
      metadata,
    };

    this.records.push(record);

    // Trim old records if over limit
    if (this.records.length > this.maxRecords) {
      this.records = this.records.slice(-this.maxRecords);
    }

    // Check alerts
    this.checkAlerts();

    return cost;
  }

  /**
   * Get cost summary for a period
   */
  getSummary(period: CostPeriod): CostSummary {
    const now = new Date();
    const periodStart = this.getPeriodStart(now, period);
    const periodEnd = now;

    const relevantRecords = this.records.filter(
      (r) => r.timestamp >= periodStart && r.timestamp <= periodEnd
    );

    const byProvider: Record<LLMProviderType, number> = {
      claude: 0,
      openai: 0,
      ollama: 0,
    };

    const byModel: Record<string, number> = {};

    let totalCost = 0;
    let totalTokens = 0;

    for (const record of relevantRecords) {
      totalCost += record.cost.totalCost;
      totalTokens += record.usage.totalTokens;
      byProvider[record.provider] += record.cost.totalCost;
      byModel[record.model] = (byModel[record.model] || 0) + record.cost.totalCost;
    }

    return {
      period,
      periodStart,
      periodEnd,
      totalCost,
      byProvider,
      byModel,
      totalTokens,
      totalRequests: relevantRecords.length,
    };
  }

  /**
   * Get current cost for a period
   */
  getCurrentCost(period: CostPeriod): number {
    return this.getSummary(period).totalCost;
  }

  /**
   * Get total tokens used in a period
   */
  getTotalTokens(period: CostPeriod): number {
    return this.getSummary(period).totalTokens;
  }

  /**
   * Get usage by provider
   */
  getUsageByProvider(
    provider: LLMProviderType,
    period: CostPeriod = 'all'
  ): {
    totalCost: number;
    totalTokens: number;
    totalRequests: number;
    models: Record<string, { cost: number; tokens: number; requests: number }>;
  } {
    const periodStart = this.getPeriodStart(new Date(), period);

    const providerRecords = this.records.filter(
      (r) => r.provider === provider && r.timestamp >= periodStart
    );

    const models: Record<string, { cost: number; tokens: number; requests: number }> = {};

    let totalCost = 0;
    let totalTokens = 0;

    for (const record of providerRecords) {
      totalCost += record.cost.totalCost;
      totalTokens += record.usage.totalTokens;

      if (!models[record.model]) {
        models[record.model] = { cost: 0, tokens: 0, requests: 0 };
      }

      models[record.model].cost += record.cost.totalCost;
      models[record.model].tokens += record.usage.totalTokens;
      models[record.model].requests += 1;
    }

    return {
      totalCost,
      totalTokens,
      totalRequests: providerRecords.length,
      models,
    };
  }

  /**
   * Add a cost alert
   */
  addAlert(
    threshold: number,
    period: CostPeriod,
    onThreshold: (summary: CostSummary) => void
  ): string {
    const alertId = `alert-${Date.now()}-${Math.random().toString(36).slice(2)}`;

    this.alerts.push({
      threshold,
      period,
      onThreshold,
      active: true,
    });

    // Start checking alerts if not already
    if (!this.alertCheckInterval) {
      this.alertCheckInterval = setInterval(() => this.checkAlerts(), 60000);
    }

    return alertId;
  }

  /**
   * Remove a cost alert by index
   */
  removeAlert(index: number): boolean {
    if (index >= 0 && index < this.alerts.length) {
      this.alerts.splice(index, 1);

      // Stop checking if no more alerts
      if (this.alerts.length === 0 && this.alertCheckInterval) {
        clearInterval(this.alertCheckInterval);
        this.alertCheckInterval = undefined;
      }

      return true;
    }
    return false;
  }

  /**
   * Get all records (for export/persistence)
   */
  getRecords(): UsageRecord[] {
    return [...this.records];
  }

  /**
   * Import records (from persistence)
   */
  importRecords(records: UsageRecord[]): void {
    for (const record of records) {
      // Reconstruct date
      record.timestamp = new Date(record.timestamp);
      this.records.push(record);
    }

    // Trim if over limit
    if (this.records.length > this.maxRecords) {
      this.records = this.records.slice(-this.maxRecords);
    }
  }

  /**
   * Clear all records
   */
  clear(): void {
    this.records = [];
  }

  /**
   * Get recent requests
   */
  getRecentRequests(count: number = 10): UsageRecord[] {
    return this.records.slice(-count);
  }

  /**
   * Estimate cost for a request (before making it)
   */
  estimateCost(
    model: string,
    estimatedPromptTokens: number,
    estimatedCompletionTokens: number
  ): CostInfo {
    return CostTracker.calculateCost(model, {
      promptTokens: estimatedPromptTokens,
      completionTokens: estimatedCompletionTokens,
      totalTokens: estimatedPromptTokens + estimatedCompletionTokens,
    });
  }

  /**
   * Check if making a request would exceed cost limits
   */
  wouldExceedLimit(
    model: string,
    estimatedPromptTokens: number,
    estimatedCompletionTokens: number,
    limitUSD: number,
    period: CostPeriod
  ): boolean {
    const currentCost = this.getCurrentCost(period);
    const estimatedCost = this.estimateCost(
      model,
      estimatedPromptTokens,
      estimatedCompletionTokens
    );

    return currentCost + estimatedCost.totalCost > limitUSD;
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

  /**
   * Get the start of a period
   */
  private getPeriodStart(from: Date, period: CostPeriod): Date {
    const start = new Date(from);

    switch (period) {
      case 'minute':
        start.setSeconds(0, 0);
        start.setMinutes(start.getMinutes() - 1);
        break;
      case 'hour':
        start.setMinutes(0, 0, 0);
        start.setHours(start.getHours() - 1);
        break;
      case 'day':
        start.setHours(0, 0, 0, 0);
        break;
      case 'week':
        start.setHours(0, 0, 0, 0);
        start.setDate(start.getDate() - 7);
        break;
      case 'month':
        start.setHours(0, 0, 0, 0);
        start.setDate(1);
        break;
      case 'all':
        return new Date(0);
    }

    return start;
  }

  /**
   * Check all alerts against current costs
   */
  private checkAlerts(): void {
    for (const alert of this.alerts) {
      if (!alert.active) continue;

      const summary = this.getSummary(alert.period);

      if (summary.totalCost >= alert.threshold) {
        alert.active = false; // Prevent repeated alerts
        try {
          alert.onThreshold(summary);
        } catch (error) {
          // Ignore callback errors
          console.error('Cost alert callback error:', error);
        }
      }
    }
  }
}

/**
 * Singleton cost tracker for global usage
 */
let globalCostTracker: CostTracker | undefined;

/**
 * Get the global cost tracker instance
 */
export function getGlobalCostTracker(): CostTracker {
  if (!globalCostTracker) {
    globalCostTracker = new CostTracker();
  }
  return globalCostTracker;
}

/**
 * Reset the global cost tracker (for testing)
 */
export function resetGlobalCostTracker(): void {
  if (globalCostTracker) {
    globalCostTracker.dispose();
    globalCostTracker = undefined;
  }
}
