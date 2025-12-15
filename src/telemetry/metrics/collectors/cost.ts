/**
 * Token and Cost Tracking Collector (Phase 2 - Action A5)
 *
 * Implements middleware for tracking LLM token usage and costs across agents,
 * tasks, and fleet operations. Supports multiple LLM providers with accurate
 * cost calculations based on pricing tables.
 *
 * Features:
 * - Token counting for input/output from all LLM API responses
 * - Per-agent cost tracking with attribution
 * - Fleet-wide cost aggregation
 * - Support for Anthropic, OpenRouter, ONNX (local), OpenAI
 * - Prometheus-compatible metric export
 * - Cache-aware cost calculation (write premium, read discount)
 *
 * @module telemetry/metrics/collectors/cost
 */

import { Counter, Histogram, Gauge, UpDownCounter } from '@opentelemetry/api';
import { getMeter } from '../../bootstrap';
import { METRIC_NAMES, HISTOGRAM_BOUNDARIES, MetricRecordOptions } from '../../types';

/**
 * LLM provider pricing configuration
 *
 * Prices are per million tokens (input/output).
 * Updated: January 2025
 */
export interface ProviderPricing {
  /** Provider name */
  provider: 'anthropic' | 'openrouter' | 'openai' | 'onnx';
  /** Model identifier */
  model: string;
  /** Input token cost per million */
  inputCostPerMillion: number;
  /** Output token cost per million */
  outputCostPerMillion: number;
  /** Cache write cost per million (if supported) */
  cacheWriteCostPerMillion?: number;
  /** Cache read cost per million (if supported) */
  cacheReadCostPerMillion?: number;
}

/**
 * Pricing table for supported LLM providers
 *
 * Anthropic pricing (January 2025):
 * - Claude Sonnet 4.5: $3.00 input / $15.00 output per 1M tokens
 * - Cache write: 25% premium ($3.75/M)
 * - Cache read: 90% discount ($0.30/M)
 *
 * OpenRouter: ~99% cost savings vs Anthropic
 * ONNX: $0 (local inference)
 */
export const PRICING_TABLE: ProviderPricing[] = [
  // Anthropic models
  {
    provider: 'anthropic',
    model: 'claude-sonnet-4-5-20250929',
    inputCostPerMillion: 3.0,
    outputCostPerMillion: 15.0,
    cacheWriteCostPerMillion: 3.75, // 25% premium
    cacheReadCostPerMillion: 0.3,   // 90% discount
  },
  {
    provider: 'anthropic',
    model: 'claude-sonnet-4',
    inputCostPerMillion: 3.0,
    outputCostPerMillion: 15.0,
    cacheWriteCostPerMillion: 3.75,
    cacheReadCostPerMillion: 0.3,
  },
  {
    provider: 'anthropic',
    model: 'claude-3-5-sonnet-20241022',
    inputCostPerMillion: 3.0,
    outputCostPerMillion: 15.0,
    cacheWriteCostPerMillion: 3.75,
    cacheReadCostPerMillion: 0.3,
  },
  {
    provider: 'anthropic',
    model: 'claude-3-5-haiku-20241022',
    inputCostPerMillion: 1.0,
    outputCostPerMillion: 5.0,
    cacheWriteCostPerMillion: 1.25,
    cacheReadCostPerMillion: 0.1,
  },
  {
    provider: 'anthropic',
    model: 'claude-3-opus-20240229',
    inputCostPerMillion: 15.0,
    outputCostPerMillion: 75.0,
    cacheWriteCostPerMillion: 18.75,
    cacheReadCostPerMillion: 1.5,
  },

  // OpenRouter (99% cost savings)
  {
    provider: 'openrouter',
    model: 'meta-llama/llama-3.1-8b-instruct',
    inputCostPerMillion: 0.03,  // ~99% cheaper than Claude
    outputCostPerMillion: 0.15,
  },
  {
    provider: 'openrouter',
    model: 'meta-llama/llama-3.1-70b-instruct',
    inputCostPerMillion: 0.18,
    outputCostPerMillion: 0.90,
  },
  {
    provider: 'openrouter',
    model: 'openai/gpt-3.5-turbo',
    inputCostPerMillion: 0.5,
    outputCostPerMillion: 1.5,
  },

  // OpenAI (for comparison)
  {
    provider: 'openai',
    model: 'gpt-4-turbo',
    inputCostPerMillion: 10.0,
    outputCostPerMillion: 30.0,
  },
  {
    provider: 'openai',
    model: 'gpt-3.5-turbo',
    inputCostPerMillion: 0.5,
    outputCostPerMillion: 1.5,
  },

  // ONNX (local, free)
  {
    provider: 'onnx',
    model: 'Xenova/gpt2',
    inputCostPerMillion: 0,
    outputCostPerMillion: 0,
  },
];

/**
 * Token usage from LLM API response
 */
export interface TokenUsage {
  /** Input tokens (prompt) */
  inputTokens: number;
  /** Output tokens (completion) */
  outputTokens: number;
  /** Cache creation tokens (Anthropic only) */
  cacheCreationTokens?: number;
  /** Cache read tokens (Anthropic only) */
  cacheReadTokens?: number;
  /** Total tokens */
  totalTokens: number;
}

/**
 * Cost breakdown for an LLM call
 */
export interface CostBreakdown {
  /** Input cost in USD */
  inputCost: number;
  /** Output cost in USD */
  outputCost: number;
  /** Cache write cost in USD (if applicable) */
  cacheWriteCost?: number;
  /** Cache read cost in USD (if applicable) */
  cacheReadCost?: number;
  /** Total cost in USD */
  totalCost: number;
  /** Cost savings from caching in USD (if applicable) */
  cacheSavings?: number;
}

/**
 * Token and cost metrics for an agent or task
 */
export interface TokenMetrics {
  /** Agent or task identifier */
  id: string;
  /** Type (agent or task) */
  type: 'agent' | 'task' | 'fleet';
  /** Token usage */
  tokens: TokenUsage;
  /** Cost breakdown */
  cost: CostBreakdown;
  /** Provider and model used */
  provider: string;
  model: string;
  /** Timestamp */
  timestamp: number;
}

/**
 * CostTracker
 *
 * Middleware for tracking LLM token usage and costs with OpenTelemetry metrics.
 *
 * Usage:
 * 1. Wrap LLM calls with trackTokens()
 * 2. Extract usage from API response
 * 3. Metrics automatically exported to OTEL collector
 *
 * @example
 * ```typescript
 * const costTracker = new CostTracker();
 *
 * // Track Anthropic call
 * const response = await anthropic.messages.create({...});
 * costTracker.trackTokens({
 *   agentId: 'test-gen-001',
 *   taskId: 'task-123',
 *   provider: 'anthropic',
 *   model: 'claude-sonnet-4',
 *   usage: {
 *     inputTokens: response.usage.input_tokens,
 *     outputTokens: response.usage.output_tokens,
 *     cacheCreationTokens: response.usage.cache_creation_input_tokens,
 *     cacheReadTokens: response.usage.cache_read_input_tokens,
 *     totalTokens: response.usage.input_tokens + response.usage.output_tokens,
 *   },
 * });
 * ```
 */
export class CostTracker {
  // OpenTelemetry metrics
  private tokenCounter: Counter;
  private costCounter: Counter;
  private tokenHistogram: Histogram;
  private costHistogram: Histogram;
  private activeAgentsGauge: UpDownCounter;

  // In-memory aggregations
  private agentMetrics: Map<string, TokenMetrics> = new Map();
  private taskMetrics: Map<string, TokenMetrics> = new Map();
  private fleetMetrics: TokenMetrics | null = null;

  constructor() {
    const meter = getMeter('agentic-qe-cost-tracker', '1.0.0');

    // Token counters
    this.tokenCounter = meter.createCounter('aqe.agent.token.count', {
      description: 'Total tokens consumed by agents',
      unit: 'tokens',
    });

    // Cost counters
    this.costCounter = meter.createCounter('aqe.agent.cost.total', {
      description: 'Total cost incurred by agents',
      unit: 'usd',
    });

    // Token histograms (distribution)
    this.tokenHistogram = meter.createHistogram('aqe.agent.token.distribution', {
      description: 'Distribution of token usage per call',
      unit: 'tokens',
    });

    // Cost histograms
    this.costHistogram = meter.createHistogram('aqe.agent.cost.distribution', {
      description: 'Distribution of costs per call',
      unit: 'usd',
    });

    // Active agents counter (using UpDownCounter instead of Gauge)
    this.activeAgentsGauge = meter.createUpDownCounter('aqe.agent.cost_tracking.active', {
      description: 'Number of agents with active cost tracking',
    });

    // Initialize fleet metrics
    this.initializeFleetMetrics();
  }

  /**
   * Track token usage and costs for an LLM call
   *
   * Extracts token counts from API response, calculates costs using pricing table,
   * and records metrics to OpenTelemetry.
   *
   * @param params - Tracking parameters
   */
  trackTokens(params: {
    agentId: string;
    taskId?: string;
    provider: string;
    model: string;
    usage: TokenUsage;
    attributes?: Record<string, string | number>;
  }): void {
    const { agentId, taskId, provider, model, usage, attributes } = params;

    // Get pricing for this model
    const pricing = this.getPricing(provider as any, model);
    if (!pricing) {
      console.warn(`No pricing found for provider=${provider} model=${model}`);
      return;
    }

    // Calculate costs
    const cost = this.calculateCost(usage, pricing);

    // Create metrics object
    const metrics: TokenMetrics = {
      id: agentId,
      type: 'agent',
      tokens: usage,
      cost,
      provider,
      model,
      timestamp: Date.now(),
    };

    // Store agent metrics
    this.updateAgentMetrics(agentId, metrics);

    // Store task metrics if provided
    if (taskId) {
      this.updateTaskMetrics(taskId, metrics);
    }

    // Update fleet metrics
    this.updateFleetMetrics(metrics);

    // Record to OpenTelemetry
    this.recordMetrics(metrics, attributes);
  }

  /**
   * Get pricing configuration for a provider/model
   */
  private getPricing(
    provider: ProviderPricing['provider'],
    model: string
  ): ProviderPricing | null {
    return PRICING_TABLE.find(
      p => p.provider === provider && p.model === model
    ) || null;
  }

  /**
   * Calculate cost breakdown from token usage
   */
  private calculateCost(usage: TokenUsage, pricing: ProviderPricing): CostBreakdown {
    // Regular tokens (non-cached)
    const regularInputTokens = usage.inputTokens - (usage.cacheCreationTokens || 0) - (usage.cacheReadTokens || 0);
    const inputCost = (regularInputTokens / 1_000_000) * pricing.inputCostPerMillion;
    const outputCost = (usage.outputTokens / 1_000_000) * pricing.outputCostPerMillion;

    let cacheWriteCost: number | undefined;
    let cacheReadCost: number | undefined;
    let cacheSavings: number | undefined;

    // Cache write cost (25% premium)
    if (usage.cacheCreationTokens && pricing.cacheWriteCostPerMillion) {
      cacheWriteCost = (usage.cacheCreationTokens / 1_000_000) * pricing.cacheWriteCostPerMillion;
    }

    // Cache read cost (90% discount)
    if (usage.cacheReadTokens && pricing.cacheReadCostPerMillion) {
      cacheReadCost = (usage.cacheReadTokens / 1_000_000) * pricing.cacheReadCostPerMillion;

      // Calculate savings vs regular cost
      const regularCostWouldBe = (usage.cacheReadTokens / 1_000_000) * pricing.inputCostPerMillion;
      cacheSavings = regularCostWouldBe - cacheReadCost;
    }

    const totalCost = inputCost + outputCost + (cacheWriteCost || 0) + (cacheReadCost || 0);

    return {
      inputCost,
      outputCost,
      cacheWriteCost,
      cacheReadCost,
      totalCost,
      cacheSavings,
    };
  }

  /**
   * Update agent-level metrics (accumulate)
   */
  private updateAgentMetrics(agentId: string, metrics: TokenMetrics): void {
    const existing = this.agentMetrics.get(agentId);

    if (existing) {
      // Accumulate tokens
      existing.tokens.inputTokens += metrics.tokens.inputTokens;
      existing.tokens.outputTokens += metrics.tokens.outputTokens;
      existing.tokens.totalTokens += metrics.tokens.totalTokens;

      if (metrics.tokens.cacheCreationTokens) {
        existing.tokens.cacheCreationTokens = (existing.tokens.cacheCreationTokens || 0) + metrics.tokens.cacheCreationTokens;
      }
      if (metrics.tokens.cacheReadTokens) {
        existing.tokens.cacheReadTokens = (existing.tokens.cacheReadTokens || 0) + metrics.tokens.cacheReadTokens;
      }

      // Accumulate costs
      existing.cost.inputCost += metrics.cost.inputCost;
      existing.cost.outputCost += metrics.cost.outputCost;
      existing.cost.totalCost += metrics.cost.totalCost;

      if (metrics.cost.cacheWriteCost) {
        existing.cost.cacheWriteCost = (existing.cost.cacheWriteCost || 0) + metrics.cost.cacheWriteCost;
      }
      if (metrics.cost.cacheReadCost) {
        existing.cost.cacheReadCost = (existing.cost.cacheReadCost || 0) + metrics.cost.cacheReadCost;
      }
      if (metrics.cost.cacheSavings) {
        existing.cost.cacheSavings = (existing.cost.cacheSavings || 0) + metrics.cost.cacheSavings;
      }

      existing.timestamp = metrics.timestamp;
    } else {
      this.agentMetrics.set(agentId, { ...metrics });
      this.activeAgentsGauge.add(1, { agent_id: agentId });
    }
  }

  /**
   * Update task-level metrics
   */
  private updateTaskMetrics(taskId: string, metrics: TokenMetrics): void {
    const taskMetrics = { ...metrics, id: taskId, type: 'task' as const };
    this.taskMetrics.set(taskId, taskMetrics);
  }

  /**
   * Update fleet-wide metrics
   */
  private updateFleetMetrics(metrics: TokenMetrics): void {
    if (!this.fleetMetrics) {
      this.initializeFleetMetrics();
    }

    if (this.fleetMetrics) {
      // Accumulate fleet totals
      this.fleetMetrics.tokens.inputTokens += metrics.tokens.inputTokens;
      this.fleetMetrics.tokens.outputTokens += metrics.tokens.outputTokens;
      this.fleetMetrics.tokens.totalTokens += metrics.tokens.totalTokens;

      if (metrics.tokens.cacheCreationTokens) {
        this.fleetMetrics.tokens.cacheCreationTokens = (this.fleetMetrics.tokens.cacheCreationTokens || 0) + metrics.tokens.cacheCreationTokens;
      }
      if (metrics.tokens.cacheReadTokens) {
        this.fleetMetrics.tokens.cacheReadTokens = (this.fleetMetrics.tokens.cacheReadTokens || 0) + metrics.tokens.cacheReadTokens;
      }

      this.fleetMetrics.cost.inputCost += metrics.cost.inputCost;
      this.fleetMetrics.cost.outputCost += metrics.cost.outputCost;
      this.fleetMetrics.cost.totalCost += metrics.cost.totalCost;

      if (metrics.cost.cacheWriteCost) {
        this.fleetMetrics.cost.cacheWriteCost = (this.fleetMetrics.cost.cacheWriteCost || 0) + metrics.cost.cacheWriteCost;
      }
      if (metrics.cost.cacheReadCost) {
        this.fleetMetrics.cost.cacheReadCost = (this.fleetMetrics.cost.cacheReadCost || 0) + metrics.cost.cacheReadCost;
      }
      if (metrics.cost.cacheSavings) {
        this.fleetMetrics.cost.cacheSavings = (this.fleetMetrics.cost.cacheSavings || 0) + metrics.cost.cacheSavings;
      }

      this.fleetMetrics.timestamp = metrics.timestamp;
    }
  }

  /**
   * Initialize empty fleet metrics
   */
  private initializeFleetMetrics(): void {
    this.fleetMetrics = {
      id: 'fleet',
      type: 'fleet',
      tokens: {
        inputTokens: 0,
        outputTokens: 0,
        totalTokens: 0,
        cacheCreationTokens: 0,
        cacheReadTokens: 0,
      },
      cost: {
        inputCost: 0,
        outputCost: 0,
        totalCost: 0,
        cacheWriteCost: 0,
        cacheReadCost: 0,
        cacheSavings: 0,
      },
      provider: 'mixed',
      model: 'mixed',
      timestamp: Date.now(),
    };
  }

  /**
   * Record metrics to OpenTelemetry
   */
  private recordMetrics(
    metrics: TokenMetrics,
    attributes?: Record<string, string | number>
  ): void {
    const baseAttrs = {
      agent_id: metrics.id,
      provider: metrics.provider,
      model: metrics.model,
      type: metrics.type,
      ...attributes,
    };

    // Token counters
    this.tokenCounter.add(metrics.tokens.inputTokens, {
      ...baseAttrs,
      token_type: 'input',
    });
    this.tokenCounter.add(metrics.tokens.outputTokens, {
      ...baseAttrs,
      token_type: 'output',
    });

    if (metrics.tokens.cacheCreationTokens) {
      this.tokenCounter.add(metrics.tokens.cacheCreationTokens, {
        ...baseAttrs,
        token_type: 'cache_write',
      });
    }

    if (metrics.tokens.cacheReadTokens) {
      this.tokenCounter.add(metrics.tokens.cacheReadTokens, {
        ...baseAttrs,
        token_type: 'cache_read',
      });
    }

    // Cost counters
    this.costCounter.add(metrics.cost.totalCost, baseAttrs);

    // Token distribution histogram
    this.tokenHistogram.record(metrics.tokens.totalTokens, baseAttrs);

    // Cost distribution histogram
    this.costHistogram.record(metrics.cost.totalCost, baseAttrs);

    // Cache savings (if applicable)
    if (metrics.cost.cacheSavings && metrics.cost.cacheSavings > 0) {
      this.costCounter.add(-metrics.cost.cacheSavings, {
        ...baseAttrs,
        cost_type: 'cache_savings',
      });
    }
  }

  /**
   * Get metrics for a specific agent
   */
  getAgentMetrics(agentId: string): TokenMetrics | null {
    return this.agentMetrics.get(agentId) || null;
  }

  /**
   * Get metrics for a specific task
   */
  getTaskMetrics(taskId: string): TokenMetrics | null {
    return this.taskMetrics.get(taskId) || null;
  }

  /**
   * Get fleet-wide metrics
   */
  getFleetMetrics(): TokenMetrics | null {
    return this.fleetMetrics;
  }

  /**
   * Get all agent metrics
   */
  getAllAgentMetrics(): Map<string, TokenMetrics> {
    return new Map(this.agentMetrics);
  }

  /**
   * Reset all metrics (for testing)
   */
  reset(): void {
    this.agentMetrics.clear();
    this.taskMetrics.clear();
    this.initializeFleetMetrics();
  }

  /**
   * Export metrics in Prometheus format
   */
  exportPrometheusMetrics(): string {
    const lines: string[] = [];

    // Fleet metrics
    if (this.fleetMetrics) {
      lines.push('# HELP aqe_fleet_tokens_total Total tokens consumed by fleet');
      lines.push('# TYPE aqe_fleet_tokens_total counter');
      lines.push(`aqe_fleet_tokens_total{type="input"} ${this.fleetMetrics.tokens.inputTokens}`);
      lines.push(`aqe_fleet_tokens_total{type="output"} ${this.fleetMetrics.tokens.outputTokens}`);
      lines.push('');

      lines.push('# HELP aqe_fleet_cost_total Total cost incurred by fleet');
      lines.push('# TYPE aqe_fleet_cost_total counter');
      lines.push(`aqe_fleet_cost_total ${this.fleetMetrics.cost.totalCost}`);
      lines.push('');

      if (this.fleetMetrics.cost.cacheSavings) {
        lines.push('# HELP aqe_fleet_cache_savings_total Total cache savings');
        lines.push('# TYPE aqe_fleet_cache_savings_total counter');
        lines.push(`aqe_fleet_cache_savings_total ${this.fleetMetrics.cost.cacheSavings}`);
        lines.push('');
      }
    }

    // Per-agent metrics
    this.agentMetrics.forEach((metrics, agentId) => {
      const labels = `agent_id="${agentId}",provider="${metrics.provider}",model="${metrics.model}"`;

      lines.push(`aqe_agent_tokens_total{${labels},type="input"} ${metrics.tokens.inputTokens}`);
      lines.push(`aqe_agent_tokens_total{${labels},type="output"} ${metrics.tokens.outputTokens}`);
      lines.push(`aqe_agent_cost_total{${labels}} ${metrics.cost.totalCost}`);
    });

    return lines.join('\n');
  }
}

/**
 * Singleton instance for global cost tracking
 */
let globalCostTracker: CostTracker | null = null;

/**
 * Get or create the global CostTracker instance
 */
export function getCostTracker(): CostTracker {
  if (!globalCostTracker) {
    globalCostTracker = new CostTracker();
  }
  return globalCostTracker;
}

/**
 * Middleware wrapper for LLM calls with automatic token tracking
 *
 * @example
 * ```typescript
 * const callLLM = withTokenTracking(
 *   async (prompt: string) => {
 *     const response = await anthropic.messages.create({
 *       model: 'claude-sonnet-4',
 *       messages: [{ role: 'user', content: prompt }],
 *     });
 *     return response;
 *   },
 *   {
 *     agentId: 'test-gen-001',
 *     taskId: 'task-123',
 *     provider: 'anthropic',
 *     model: 'claude-sonnet-4',
 *   }
 * );
 *
 * const result = await callLLM('Generate tests for...');
 * ```
 */
export function withTokenTracking<T extends { usage: any }>(
  fn: (...args: any[]) => Promise<T>,
  context: {
    agentId: string;
    taskId?: string;
    provider: string;
    model: string;
  }
): (...args: any[]) => Promise<T> {
  return async (...args: any[]) => {
    const tracker = getCostTracker();
    const result = await fn(...args);

    // Extract usage from response
    const usage = result.usage;
    if (usage) {
      tracker.trackTokens({
        ...context,
        usage: {
          inputTokens: usage.input_tokens || 0,
          outputTokens: usage.output_tokens || 0,
          cacheCreationTokens: usage.cache_creation_input_tokens,
          cacheReadTokens: usage.cache_read_input_tokens,
          totalTokens: (usage.input_tokens || 0) + (usage.output_tokens || 0),
        },
      });
    }

    return result;
  };
}
