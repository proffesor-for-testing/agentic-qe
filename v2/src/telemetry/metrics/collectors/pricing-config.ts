/**
 * LLM Provider Pricing Configuration
 *
 * Centralized pricing tables for all supported LLM providers.
 * Prices are updated as of January 2025.
 *
 * Storage: This configuration is stored in memory namespace:
 * - `aqe/phase2/instrumentation/token-metrics/pricing`
 *
 * @module telemetry/metrics/collectors/pricing-config
 */

import { ProviderPricing } from './cost';

/**
 * Pricing update metadata
 */
export interface PricingMetadata {
  /** Last updated timestamp */
  lastUpdated: string;
  /** Pricing version */
  version: string;
  /** Source of pricing data */
  source: string;
}

/**
 * Extended pricing configuration with metadata
 */
export interface PricingConfig {
  /** Pricing metadata */
  metadata: PricingMetadata;
  /** Provider pricing tables */
  providers: ProviderPricing[];
}

/**
 * Current pricing configuration (January 2025)
 *
 * Sources:
 * - Anthropic: https://docs.anthropic.com/claude/pricing
 * - OpenRouter: https://openrouter.ai/models
 * - OpenAI: https://openai.com/pricing
 */
export const PRICING_CONFIG: PricingConfig = {
  metadata: {
    lastUpdated: '2025-01-20',
    version: '1.0.0',
    source: 'Provider official documentation',
  },
  providers: [
    // Anthropic Claude Models
    {
      provider: 'anthropic',
      model: 'claude-sonnet-4-5-20250929',
      inputCostPerMillion: 3.0,
      outputCostPerMillion: 15.0,
      cacheWriteCostPerMillion: 3.75,  // 25% premium
      cacheReadCostPerMillion: 0.3,    // 90% discount
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

    // OpenRouter Models (99% cost savings)
    {
      provider: 'openrouter',
      model: 'meta-llama/llama-3.1-8b-instruct',
      inputCostPerMillion: 0.03,   // 99% cheaper than Claude
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
    {
      provider: 'openrouter',
      model: 'openai/gpt-4',
      inputCostPerMillion: 5.0,
      outputCostPerMillion: 15.0,
    },
    {
      provider: 'openrouter',
      model: 'google/gemini-pro',
      inputCostPerMillion: 0.25,
      outputCostPerMillion: 0.5,
    },

    // OpenAI Models
    {
      provider: 'openai',
      model: 'gpt-4-turbo',
      inputCostPerMillion: 10.0,
      outputCostPerMillion: 30.0,
    },
    {
      provider: 'openai',
      model: 'gpt-4',
      inputCostPerMillion: 30.0,
      outputCostPerMillion: 60.0,
    },
    {
      provider: 'openai',
      model: 'gpt-3.5-turbo',
      inputCostPerMillion: 0.5,
      outputCostPerMillion: 1.5,
    },
    {
      provider: 'openai',
      model: 'gpt-3.5-turbo-16k',
      inputCostPerMillion: 3.0,
      outputCostPerMillion: 4.0,
    },

    // ONNX (local, free)
    {
      provider: 'onnx',
      model: 'Xenova/gpt2',
      inputCostPerMillion: 0,
      outputCostPerMillion: 0,
    },
    {
      provider: 'onnx',
      model: 'Xenova/distilbert-base-uncased',
      inputCostPerMillion: 0,
      outputCostPerMillion: 0,
    },
    {
      provider: 'onnx',
      model: 'Xenova/bert-base-uncased',
      inputCostPerMillion: 0,
      outputCostPerMillion: 0,
    },
  ],
};

/**
 * Get pricing for a specific provider and model
 *
 * @param provider - Provider name
 * @param model - Model identifier
 * @returns Pricing configuration or null if not found
 */
export function getPricing(
  provider: string,
  model: string
): ProviderPricing | null {
  return PRICING_CONFIG.providers.find(
    p => p.provider === provider && p.model === model
  ) || null;
}

/**
 * Get all pricing for a provider
 *
 * @param provider - Provider name
 * @returns Array of pricing configurations
 */
export function getProviderPricing(
  provider: string
): ProviderPricing[] {
  return PRICING_CONFIG.providers.filter(p => p.provider === provider);
}

/**
 * Calculate cost savings percentage comparing two models
 *
 * @param baseModel - Base model for comparison (e.g., Claude)
 * @param compareModel - Model to compare against
 * @param tokenCount - Number of tokens to calculate savings for
 * @returns Savings percentage (0-1)
 */
export function calculateSavingsPercentage(
  baseModel: { provider: string; model: string },
  compareModel: { provider: string; model: string },
  tokenCount: { input: number; output: number }
): number | null {
  const basePricing = getPricing(baseModel.provider, baseModel.model);
  const comparePricing = getPricing(compareModel.provider, compareModel.model);

  if (!basePricing || !comparePricing) {
    return null;
  }

  const baseCost =
    (tokenCount.input / 1_000_000) * basePricing.inputCostPerMillion +
    (tokenCount.output / 1_000_000) * basePricing.outputCostPerMillion;

  const compareCost =
    (tokenCount.input / 1_000_000) * comparePricing.inputCostPerMillion +
    (tokenCount.output / 1_000_000) * comparePricing.outputCostPerMillion;

  if (baseCost === 0) return 0;

  return (baseCost - compareCost) / baseCost;
}

/**
 * Export pricing configuration as JSON for memory storage
 */
export function exportPricingConfig(): string {
  return JSON.stringify(PRICING_CONFIG, null, 2);
}

/**
 * Memory namespace for pricing configuration
 */
export const PRICING_MEMORY_NAMESPACE = 'aqe/phase2/instrumentation/token-metrics';

/**
 * Memory key for pricing data
 */
export const PRICING_MEMORY_KEY = 'pricing';
