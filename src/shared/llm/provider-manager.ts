/**
 * Agentic QE v3 - LLM Provider Manager
 * ADR-011: LLM Provider System for Quality Engineering
 *
 * Manages multiple LLM providers with:
 * - Load balancing (round-robin, least-cost, least-latency, random)
 * - Automatic failover
 * - Circuit breaker integration
 * - Response caching
 * - Cost tracking
 */

import {
  LLMProvider,
  LLMProviderType,
  ProviderManagerConfig,
  ProviderSelection,
  ProviderMetrics,
  Message,
  GenerateOptions,
  EmbedOptions,
  CompleteOptions,
  LLMResponse,
  EmbeddingResponse,
  CompletionResponse,
  HealthCheckResult,
  CircuitBreakerConfig,
  LLMCacheConfig,
  createLLMError,
} from './interfaces';
import { secureRandomInt } from '../utils/crypto-random.js';
import { CircuitBreaker, CircuitBreakerManager } from './circuit-breaker';
import { LLMResponseCache } from './cache';
import { CostTracker, getGlobalCostTracker } from './cost-tracker';
import { ClaudeProvider } from './providers/claude';
import { OpenAIProvider } from './providers/openai';
import { OllamaProvider } from './providers/ollama';
import { OpenRouterProvider } from './providers/openrouter';
import { GeminiProvider } from './providers/gemini';
import { AzureOpenAIProvider } from './providers/azure-openai';
import { BedrockProvider } from './providers/bedrock';
import { toError } from '../error-utils.js';

/**
 * Default provider manager configuration
 */
export const DEFAULT_PROVIDER_MANAGER_CONFIG: ProviderManagerConfig = {
  primary: 'claude',
  fallbacks: ['openai', 'ollama'],
  loadBalancing: 'round-robin',
  providers: {},
  global: {
    enableCostTracking: true,
    enableMetrics: true,
  },
};

/**
 * Metrics tracking for providers
 */
interface ProviderMetricsInternal {
  totalRequests: number;
  successCount: number;
  failureCount: number;
  latencies: number[];
  totalCost: number;
  totalTokens: number;
}

/**
 * LLM Provider Manager
 * Coordinates multiple LLM providers with load balancing and failover
 */
export class ProviderManager {
  private providers: Map<LLMProviderType, LLMProvider> = new Map();
  private circuitBreakers: CircuitBreakerManager;
  private cache: LLMResponseCache;
  private costTracker: CostTracker;
  private config: ProviderManagerConfig;
  private metrics: Map<LLMProviderType, ProviderMetricsInternal> = new Map();
  private roundRobinIndex: number = 0;
  private initialized: boolean = false;

  constructor(
    config: Partial<ProviderManagerConfig> = {},
    options?: {
      circuitBreakerConfig?: Partial<CircuitBreakerConfig>;
      cacheConfig?: Partial<LLMCacheConfig>;
      costTracker?: CostTracker;
    }
  ) {
    this.config = { ...DEFAULT_PROVIDER_MANAGER_CONFIG, ...config };
    this.circuitBreakers = new CircuitBreakerManager(options?.circuitBreakerConfig);
    this.cache = new LLMResponseCache(options?.cacheConfig);
    this.costTracker = options?.costTracker ?? getGlobalCostTracker();
  }

  /**
   * Initialize the provider manager
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    // Create provider instances based on config
    await this.createProviders();

    // Initialize metrics for each provider
    for (const type of this.providers.keys()) {
      this.initializeMetrics(type);
    }

    this.initialized = true;
  }

  /**
   * Generate text using the best available provider
   */
  async generate(
    input: string | Message[],
    options?: GenerateOptions
  ): Promise<LLMResponse> {
    await this.ensureInitialized();

    // Check cache first
    if (!options?.skipCache) {
      const inputStr = typeof input === 'string' ? input : JSON.stringify(input);
      const cached = this.cache.getGeneration(inputStr, {
        model: options?.model,
        temperature: options?.temperature,
        maxTokens: options?.maxTokens,
        systemPrompt: options?.systemPrompt,
      });

      if (cached) {
        return { ...cached, cached: true };
      }
    }

    // Select provider and execute with failover
    const response = await this.executeWithFailover(
      'generate',
      async (provider) => provider.generate(input, options),
      options?.preferredProvider
    );

    // Cache the response
    if (!options?.skipCache) {
      const inputStr = typeof input === 'string' ? input : JSON.stringify(input);
      this.cache.setGeneration(inputStr, response, {
        model: options?.model,
        temperature: options?.temperature,
        maxTokens: options?.maxTokens,
        systemPrompt: options?.systemPrompt,
      });
    }

    // Track cost
    this.costTracker.recordUsage(
      response.provider,
      response.model,
      response.usage,
      response.requestId
    );

    return response;
  }

  /**
   * Generate embedding using the best available provider
   */
  async embed(text: string, options?: EmbedOptions): Promise<EmbeddingResponse> {
    await this.ensureInitialized();

    // Check cache first
    if (!options?.skipCache) {
      const cached = this.cache.getEmbedding(text, { model: options?.model });
      if (cached) {
        return { ...cached, cached: true };
      }
    }

    // For embeddings, prefer providers that support them
    const embeddingProviders: LLMProviderType[] = ['openai', 'ollama'];

    const response = await this.executeWithFailover(
      'embed',
      async (provider) => provider.embed(text, options),
      embeddingProviders.find((p) => this.providers.has(p))
    );

    // Cache the response
    if (!options?.skipCache) {
      this.cache.setEmbedding(text, response, { model: options?.model });
    }

    return response;
  }

  /**
   * Complete text using the best available provider
   */
  async complete(
    prompt: string,
    options?: CompleteOptions
  ): Promise<CompletionResponse> {
    await this.ensureInitialized();

    // Check cache first
    if (!options?.skipCache) {
      const cached = this.cache.getCompletion(prompt, {
        model: options?.model,
        temperature: options?.temperature,
        maxTokens: options?.maxTokens,
      });

      if (cached) {
        return { ...cached, cached: true };
      }
    }

    const response = await this.executeWithFailover(
      'complete',
      async (provider) => provider.complete(prompt, options)
    );

    // Cache the response
    if (!options?.skipCache) {
      this.cache.setCompletion(prompt, response, {
        model: options?.model,
        temperature: options?.temperature,
        maxTokens: options?.maxTokens,
      });
    }

    return response;
  }

  /**
   * Health check all providers
   */
  async healthCheck(): Promise<Record<LLMProviderType, HealthCheckResult>> {
    await this.ensureInitialized();

    const results: Partial<Record<LLMProviderType, HealthCheckResult>> = {};

    for (const [type, provider] of this.providers) {
      results[type] = await provider.healthCheck();
    }

    return results as Record<LLMProviderType, HealthCheckResult>;
  }

  /**
   * Get a specific provider
   */
  getProvider(type: LLMProviderType): LLMProvider | undefined {
    return this.providers.get(type);
  }

  /**
   * Get all available providers
   */
  getAvailableProviders(): LLMProviderType[] {
    const available: LLMProviderType[] = [];

    for (const [type, _provider] of this.providers) {
      const breaker = this.circuitBreakers.getBreaker(type);
      if (breaker.canExecute()) {
        available.push(type);
      }
    }

    return available;
  }

  /**
   * Get metrics for all providers
   */
  getMetrics(): Record<LLMProviderType, ProviderMetrics> {
    const result: Partial<Record<LLMProviderType, ProviderMetrics>> = {};

    for (const [type, internal] of this.metrics) {
      const breaker = this.circuitBreakers.getBreaker(type);
      const latencies = internal.latencies.slice(-100); // Last 100 for percentiles

      result[type] = {
        provider: type,
        totalRequests: internal.totalRequests,
        successCount: internal.successCount,
        failureCount: internal.failureCount,
        avgLatencyMs: this.calculateAverage(latencies),
        p95LatencyMs: this.calculatePercentile(latencies, 95),
        p99LatencyMs: this.calculatePercentile(latencies, 99),
        totalCost: internal.totalCost,
        totalTokens: internal.totalTokens,
        circuitState: breaker.getState(),
      };
    }

    return result as Record<LLMProviderType, ProviderMetrics>;
  }

  /**
   * Get cache statistics
   */
  getCacheStats() {
    return this.cache.getStats();
  }

  /**
   * Get cost summary
   */
  getCostSummary(period: 'hour' | 'day' | 'week' | 'month' | 'all' = 'day') {
    return this.costTracker.getSummary(period);
  }

  /**
   * Clear cache
   */
  clearCache(): void {
    this.cache.clear();
  }

  /**
   * Reset circuit breakers
   */
  resetCircuitBreakers(): void {
    this.circuitBreakers.resetAll();
  }

  /**
   * Dispose all resources
   */
  async dispose(): Promise<void> {
    for (const provider of this.providers.values()) {
      await provider.dispose();
    }
    this.providers.clear();
    this.metrics.clear();
    this.cache.clear();
    this.initialized = false;
  }

  /**
   * Create provider instances based on configuration
   */
  private async createProviders(): Promise<void> {
    // Always try to create all providers that are configured or in the fallback list
    const providerTypes = new Set<LLMProviderType>([
      this.config.primary,
      ...this.config.fallbacks,
    ]);

    for (const type of providerTypes) {
      try {
        const provider = this.createProvider(type);
        this.providers.set(type, provider);
      } catch (error) {
        console.warn(
          `Failed to create ${type} provider: ${error instanceof Error ? error.message : 'Unknown'}`
        );
      }
    }

    if (this.providers.size === 0) {
      throw createLLMError(
        'No LLM providers could be initialized',
        'PROVIDER_UNAVAILABLE',
        { retryable: false }
      );
    }
  }

  /**
   * Create a single provider instance
   * ADR-043: Extended to support 7 providers
   */
  private createProvider(type: LLMProviderType): LLMProvider {
    switch (type) {
      case 'claude':
        return new ClaudeProvider(this.config.providers.claude);
      case 'openai':
        return new OpenAIProvider(this.config.providers.openai);
      case 'ollama':
        return new OllamaProvider(this.config.providers.ollama);
      case 'openrouter':
        return new OpenRouterProvider(this.config.providers.openrouter);
      case 'gemini':
        return new GeminiProvider(this.config.providers.gemini);
      case 'azure-openai': {
        const azureConfig = this.config.providers['azure-openai'];
        if (!azureConfig) {
          throw new Error('Azure OpenAI provider requires configuration with deploymentId');
        }
        return new AzureOpenAIProvider(azureConfig);
      }
      case 'bedrock':
        return new BedrockProvider(this.config.providers.bedrock);
      default:
        throw new Error(`Unknown provider type: ${type}`);
    }
  }

  /**
   * Initialize metrics for a provider
   */
  private initializeMetrics(type: LLMProviderType): void {
    this.metrics.set(type, {
      totalRequests: 0,
      successCount: 0,
      failureCount: 0,
      latencies: [],
      totalCost: 0,
      totalTokens: 0,
    });
  }

  /**
   * Execute a provider operation with failover
   */
  private async executeWithFailover<T>(
    operation: string,
    fn: (provider: LLMProvider) => Promise<T>,
    preferredProvider?: LLMProviderType
  ): Promise<T> {
    const selection = this.selectProvider(preferredProvider);
    const triedProviders = new Set<LLMProviderType>();
    let lastError: Error | undefined;

    // Try the selected provider first, then fallbacks
    const providersToTry = [
      selection.provider.type,
      ...this.config.fallbacks.filter((p) => p !== selection.provider.type),
    ];

    for (const providerType of providersToTry) {
      if (triedProviders.has(providerType)) {
        continue;
      }
      triedProviders.add(providerType);

      const provider = this.providers.get(providerType);
      if (!provider) {
        continue;
      }

      const breaker = this.circuitBreakers.getBreaker(providerType);

      if (!breaker.canExecute()) {
        continue;
      }

      try {
        const start = Date.now();
        const result = await breaker.execute(() => fn(provider));
        const latencyMs = Date.now() - start;

        // Update metrics
        this.recordSuccess(providerType, latencyMs, result);

        return result;
      } catch (error) {
        lastError = toError(error);

        // Update metrics
        this.recordFailure(providerType, lastError);

        // Check if error is retryable
        if ('retryable' in lastError && !(lastError as { retryable: boolean }).retryable) {
          throw lastError;
        }
      }
    }

    throw createLLMError(
      `All providers failed for ${operation}: ${lastError?.message ?? 'Unknown error'}`,
      'PROVIDER_UNAVAILABLE',
      { retryable: false, cause: lastError }
    );
  }

  /**
   * Select the best provider based on load balancing strategy
   */
  private selectProvider(preferred?: LLMProviderType): ProviderSelection {
    // If preferred provider is specified and available, use it
    if (preferred) {
      const provider = this.providers.get(preferred);
      const breaker = this.circuitBreakers.getBreaker(preferred);

      if (provider && breaker.canExecute()) {
        return { provider, reason: 'primary' };
      }
    }

    const availableProviders = this.getAvailableProviders();

    if (availableProviders.length === 0) {
      // Fall back to primary even if circuit is open
      const primary = this.providers.get(this.config.primary);
      if (primary) {
        return { provider: primary, reason: 'fallback' };
      }
      throw createLLMError(
        'No providers available',
        'PROVIDER_UNAVAILABLE',
        { retryable: false }
      );
    }

    // Select based on load balancing strategy
    switch (this.config.loadBalancing) {
      case 'round-robin':
        return this.selectRoundRobin(availableProviders);
      case 'least-cost':
        return this.selectLeastCost(availableProviders);
      case 'least-latency':
        return this.selectLeastLatency(availableProviders);
      case 'random':
        return this.selectRandom(availableProviders);
      default:
        return this.selectRoundRobin(availableProviders);
    }
  }

  /**
   * Round-robin selection
   */
  private selectRoundRobin(available: LLMProviderType[]): ProviderSelection {
    this.roundRobinIndex = (this.roundRobinIndex + 1) % available.length;
    const type = available[this.roundRobinIndex];
    const provider = this.providers.get(type)!;
    return { provider, reason: 'load-balance' };
  }

  /**
   * Select provider with least cost
   */
  private selectLeastCost(available: LLMProviderType[]): ProviderSelection {
    let lowestCost = Infinity;
    let selectedType: LLMProviderType = available[0];

    for (const type of available) {
      const provider = this.providers.get(type)!;
      const { input, output } = provider.getCostPerToken();
      const cost = input + output;

      if (cost < lowestCost) {
        lowestCost = cost;
        selectedType = type;
      }
    }

    return {
      provider: this.providers.get(selectedType)!,
      reason: 'cost-optimization',
      metadata: { estimatedCost: lowestCost },
    };
  }

  /**
   * Select provider with least average latency
   */
  private selectLeastLatency(available: LLMProviderType[]): ProviderSelection {
    let lowestLatency = Infinity;
    let selectedType: LLMProviderType = available[0];

    for (const type of available) {
      const metrics = this.metrics.get(type);
      if (metrics && metrics.latencies.length > 0) {
        const avgLatency = this.calculateAverage(metrics.latencies);
        if (avgLatency < lowestLatency) {
          lowestLatency = avgLatency;
          selectedType = type;
        }
      }
    }

    return {
      provider: this.providers.get(selectedType)!,
      reason: 'latency-optimization',
      metadata: { avgLatency: lowestLatency },
    };
  }

  /**
   * Random selection
   */
  private selectRandom(available: LLMProviderType[]): ProviderSelection {
    const index = secureRandomInt(0, available.length);
    const type = available[index];
    return { provider: this.providers.get(type)!, reason: 'load-balance' };
  }

  /**
   * Record a successful operation
   */
  private recordSuccess(type: LLMProviderType, latencyMs: number, result: unknown): void {
    const metrics = this.metrics.get(type);
    if (!metrics) return;

    metrics.totalRequests++;
    metrics.successCount++;
    metrics.latencies.push(latencyMs);

    // Keep only last 1000 latencies
    if (metrics.latencies.length > 1000) {
      metrics.latencies = metrics.latencies.slice(-1000);
    }

    // Extract cost and tokens if available
    if (result && typeof result === 'object') {
      const r = result as { cost?: { totalCost?: number }; usage?: { totalTokens?: number } };
      if (r.cost?.totalCost) {
        metrics.totalCost += r.cost.totalCost;
      }
      if (r.usage?.totalTokens) {
        metrics.totalTokens += r.usage.totalTokens;
      }
    }
  }

  /**
   * Record a failed operation
   */
  private recordFailure(type: LLMProviderType, _error: Error): void {
    const metrics = this.metrics.get(type);
    if (!metrics) return;

    metrics.totalRequests++;
    metrics.failureCount++;
  }

  /**
   * Ensure the manager is initialized
   */
  private async ensureInitialized(): Promise<void> {
    if (!this.initialized) {
      await this.initialize();
    }
  }

  /**
   * Calculate average of numbers
   */
  private calculateAverage(numbers: number[]): number {
    if (numbers.length === 0) return 0;
    return numbers.reduce((a, b) => a + b, 0) / numbers.length;
  }

  /**
   * Calculate percentile of numbers
   */
  private calculatePercentile(numbers: number[], percentile: number): number {
    if (numbers.length === 0) return 0;

    const sorted = [...numbers].sort((a, b) => a - b);
    const index = Math.ceil((percentile / 100) * sorted.length) - 1;
    return sorted[Math.max(0, index)];
  }
}

/**
 * Create a pre-configured provider manager
 */
export function createProviderManager(
  config?: Partial<ProviderManagerConfig>
): ProviderManager {
  return new ProviderManager(config);
}

/**
 * Create a provider manager with default settings for QE
 */
export function createQEProviderManager(): ProviderManager {
  return new ProviderManager({
    primary: 'claude',
    fallbacks: ['openai', 'ollama'],
    loadBalancing: 'least-cost',
    providers: {
      claude: {
        model: 'claude-sonnet-4-20250514',
        maxTokens: 8192,
        temperature: 0.3, // Lower for QE tasks
      },
      openai: {
        model: 'gpt-4o',
        maxTokens: 8192,
        temperature: 0.3,
      },
      ollama: {
        model: 'llama3.1',
        maxTokens: 4096,
        temperature: 0.3,
      },
    },
    global: {
      enableCostTracking: true,
      enableMetrics: true,
      maxCostPerDay: 100, // $100/day limit
    },
  });
}
