/**
 * LLMProviderFactory - Factory for creating and managing LLM providers
 *
 * Provides centralized creation and routing of LLM providers with support for:
 * - Provider registration and discovery
 * - Automatic provider selection based on capabilities/cost
 * - Hybrid routing between local and cloud providers
 * - Fallback chains for reliability
 * - Health-based routing
 *
 * @module providers/LLMProviderFactory
 * @version 1.0.0
 */

import { ILLMProvider, LLMProviderMetadata, LLMHealthStatus, LLMCompletionOptions } from './ILLMProvider';
import { ClaudeProvider, ClaudeProviderConfig } from './ClaudeProvider';
import { RuvllmProvider, RuvllmProviderConfig } from './RuvllmProvider';
import { Logger } from '../utils/Logger';

/**
 * Provider type enumeration
 */
export type ProviderType = 'claude' | 'ruvllm' | 'auto';

/**
 * Provider selection criteria
 */
export interface ProviderSelectionCriteria {
  /** Prefer local providers */
  preferLocal?: boolean;
  /** Prefer low-cost providers */
  preferLowCost?: boolean;
  /** Required capabilities */
  requiredCapabilities?: Array<keyof LLMProviderMetadata['capabilities']>;
  /** Maximum cost per million tokens */
  maxCostPerMillion?: number;
  /** Required models */
  requiredModels?: string[];
}

/**
 * Provider health state
 */
interface ProviderHealthState {
  provider: ILLMProvider;
  metadata: LLMProviderMetadata;
  lastHealthCheck: LLMHealthStatus;
  consecutiveFailures: number;
  isAvailable: boolean;
}

/**
 * Factory configuration
 */
export interface LLMProviderFactoryConfig {
  /** Claude provider configuration */
  claude?: ClaudeProviderConfig;
  /** Ruvllm provider configuration */
  ruvllm?: RuvllmProviderConfig;
  /** Default provider to use */
  defaultProvider?: ProviderType;
  /** Enable automatic fallback */
  enableFallback?: boolean;
  /** Health check interval in milliseconds */
  healthCheckInterval?: number;
  /** Maximum consecutive failures before marking unhealthy */
  maxConsecutiveFailures?: number;
}

/**
 * Provider usage statistics
 */
export interface ProviderUsageStats {
  requestCount: number;
  successCount: number;
  failureCount: number;
  totalCost: number;
  averageLatency: number;
}

/**
 * LLMProviderFactory - Central factory for LLM provider management
 *
 * This factory provides:
 * - Unified provider creation and initialization
 * - Intelligent provider selection based on criteria
 * - Automatic health monitoring and fallback
 * - Cost and usage tracking
 * - Hybrid local/cloud routing
 */
export class LLMProviderFactory {
  private readonly logger: Logger;
  private config: LLMProviderFactoryConfig;
  private providers: Map<ProviderType, ProviderHealthState>;
  private usageStats: Map<ProviderType, ProviderUsageStats>;
  private healthCheckTimer?: NodeJS.Timeout;
  private isInitialized: boolean;

  constructor(config: LLMProviderFactoryConfig = {}) {
    this.logger = Logger.getInstance();
    this.config = {
      defaultProvider: config.defaultProvider || 'claude',
      enableFallback: config.enableFallback ?? true,
      healthCheckInterval: config.healthCheckInterval ?? 60000, // 1 minute
      maxConsecutiveFailures: config.maxConsecutiveFailures ?? 3,
      ...config
    };
    this.providers = new Map();
    this.usageStats = new Map();
    this.isInitialized = false;
  }

  /**
   * Initialize the factory and all configured providers
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) {
      this.logger.warn('LLMProviderFactory already initialized');
      return;
    }

    const initPromises: Promise<void>[] = [];

    // Initialize Claude provider if configured
    if (this.config.claude || process.env.ANTHROPIC_API_KEY) {
      initPromises.push(this.initializeProvider('claude', this.config.claude));
    }

    // Initialize ruvllm provider if configured
    if (this.config.ruvllm) {
      initPromises.push(this.initializeProvider('ruvllm', this.config.ruvllm));
    }

    await Promise.allSettled(initPromises);

    // Start health monitoring
    this.startHealthMonitoring();

    this.isInitialized = true;
    this.logger.info('LLMProviderFactory initialized', {
      providers: Array.from(this.providers.keys())
    });
  }

  /**
   * Get a provider by type
   */
  getProvider(type: ProviderType): ILLMProvider | undefined {
    if (type === 'auto') {
      return this.selectBestProvider();
    }

    const state = this.providers.get(type);
    return state?.isAvailable ? state.provider : undefined;
  }

  /**
   * Select best provider based on criteria
   */
  selectBestProvider(criteria?: ProviderSelectionCriteria): ILLMProvider | undefined {
    const candidates: ProviderHealthState[] = [];

    for (const state of this.providers.values()) {
      if (!state.isAvailable) continue;

      // Check required capabilities
      if (criteria?.requiredCapabilities) {
        const hasAllCapabilities = criteria.requiredCapabilities.every(
          cap => state.metadata.capabilities[cap]
        );
        if (!hasAllCapabilities) continue;
      }

      // Check cost limit
      if (criteria?.maxCostPerMillion !== undefined) {
        if (state.metadata.costs.inputPerMillion > criteria.maxCostPerMillion) continue;
      }

      // Check required models
      if (criteria?.requiredModels) {
        const hasAllModels = criteria.requiredModels.every(
          model => state.metadata.models.includes(model)
        );
        if (!hasAllModels) continue;
      }

      candidates.push(state);
    }

    if (candidates.length === 0) {
      return undefined;
    }

    // Sort by preference
    candidates.sort((a, b) => {
      // Prefer local if requested
      if (criteria?.preferLocal) {
        if (a.metadata.location === 'local' && b.metadata.location !== 'local') return -1;
        if (b.metadata.location === 'local' && a.metadata.location !== 'local') return 1;
      }

      // Prefer low cost if requested
      if (criteria?.preferLowCost) {
        const costA = a.metadata.costs.inputPerMillion + a.metadata.costs.outputPerMillion;
        const costB = b.metadata.costs.inputPerMillion + b.metadata.costs.outputPerMillion;
        return costA - costB;
      }

      // Default: prefer by health (lower latency)
      const latencyA = a.lastHealthCheck.latency || Infinity;
      const latencyB = b.lastHealthCheck.latency || Infinity;
      return latencyA - latencyB;
    });

    return candidates[0].provider;
  }

  /**
   * Execute with automatic fallback
   */
  async executeWithFallback<T>(
    operation: (provider: ILLMProvider) => Promise<T>,
    preferredProvider?: ProviderType
  ): Promise<T> {
    const providerOrder = this.getProviderOrder(preferredProvider);

    let lastError: Error | undefined;

    for (const type of providerOrder) {
      const state = this.providers.get(type);
      if (!state?.isAvailable) continue;

      try {
        const result = await operation(state.provider);

        // Update success stats
        this.updateUsageStats(type, true);

        return result;

      } catch (error) {
        lastError = error as Error;
        this.logger.warn(`Provider ${type} failed`, { error: lastError.message });

        // Update failure stats
        this.updateUsageStats(type, false);
        state.consecutiveFailures++;

        if (state.consecutiveFailures >= this.config.maxConsecutiveFailures!) {
          state.isAvailable = false;
          this.logger.error(`Provider ${type} marked unavailable after consecutive failures`);
        }

        // Continue to next provider if fallback enabled
        if (!this.config.enableFallback) {
          throw lastError;
        }
      }
    }

    throw lastError || new Error('No available providers');
  }

  /**
   * Get all available provider types
   */
  getAvailableProviders(): ProviderType[] {
    const available: ProviderType[] = [];

    for (const [type, state] of this.providers.entries()) {
      if (state.isAvailable) {
        available.push(type);
      }
    }

    return available;
  }

  /**
   * Get provider metadata
   */
  getProviderMetadata(type: ProviderType): LLMProviderMetadata | undefined {
    return this.providers.get(type)?.metadata;
  }

  /**
   * Get usage statistics
   */
  getUsageStats(type?: ProviderType): Map<ProviderType, ProviderUsageStats> | ProviderUsageStats | undefined {
    if (type) {
      return this.usageStats.get(type);
    }
    return new Map(this.usageStats);
  }

  /**
   * Get combined usage cost
   */
  getTotalCost(): number {
    let total = 0;
    for (const stats of this.usageStats.values()) {
      total += stats.totalCost;
    }
    return total;
  }

  /**
   * Shutdown all providers
   */
  async shutdown(): Promise<void> {
    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
      this.healthCheckTimer = undefined;
    }

    const shutdownPromises: Promise<void>[] = [];

    for (const [type, state] of this.providers.entries()) {
      shutdownPromises.push(
        state.provider.shutdown()
          .catch(error => this.logger.warn(`Error shutting down ${type}`, { error }))
      );
    }

    await Promise.allSettled(shutdownPromises);

    this.providers.clear();
    this.isInitialized = false;

    this.logger.info('LLMProviderFactory shutdown');
  }

  /**
   * Register a custom provider
   */
  async registerProvider(type: ProviderType, provider: ILLMProvider): Promise<void> {
    await provider.initialize();

    const metadata = provider.getMetadata();
    const healthStatus = await provider.healthCheck();

    this.providers.set(type, {
      provider,
      metadata,
      lastHealthCheck: healthStatus,
      consecutiveFailures: 0,
      isAvailable: healthStatus.healthy
    });

    this.usageStats.set(type, {
      requestCount: 0,
      successCount: 0,
      failureCount: 0,
      totalCost: 0,
      averageLatency: 0
    });

    this.logger.info(`Provider ${type} registered`, { healthy: healthStatus.healthy });
  }

  /**
   * Initialize a specific provider
   */
  private async initializeProvider(type: ProviderType, config?: any): Promise<void> {
    try {
      let provider: ILLMProvider;

      switch (type) {
        case 'claude':
          provider = new ClaudeProvider(config);
          break;
        case 'ruvllm':
          provider = new RuvllmProvider(config);
          break;
        default:
          throw new Error(`Unknown provider type: ${type}`);
      }

      await this.registerProvider(type, provider);

    } catch (error) {
      this.logger.warn(`Failed to initialize provider ${type}`, {
        error: (error as Error).message
      });
    }
  }

  /**
   * Start health monitoring
   */
  private startHealthMonitoring(): void {
    this.healthCheckTimer = setInterval(async () => {
      await this.performHealthChecks();
    }, this.config.healthCheckInterval!);
  }

  /**
   * Perform health checks on all providers
   */
  private async performHealthChecks(): Promise<void> {
    for (const [type, state] of this.providers.entries()) {
      try {
        const healthStatus = await state.provider.healthCheck();
        state.lastHealthCheck = healthStatus;

        if (healthStatus.healthy) {
          state.consecutiveFailures = 0;
          state.isAvailable = true;
        } else {
          state.consecutiveFailures++;
          if (state.consecutiveFailures >= this.config.maxConsecutiveFailures!) {
            state.isAvailable = false;
          }
        }

      } catch (error) {
        state.consecutiveFailures++;
        if (state.consecutiveFailures >= this.config.maxConsecutiveFailures!) {
          state.isAvailable = false;
        }
      }
    }
  }

  /**
   * Get provider order for fallback
   */
  private getProviderOrder(preferred?: ProviderType): ProviderType[] {
    const order: ProviderType[] = [];

    // Add preferred first
    if (preferred && preferred !== 'auto' && this.providers.has(preferred)) {
      order.push(preferred);
    }

    // Add default if different
    const defaultType = this.config.defaultProvider;
    if (defaultType && defaultType !== 'auto' && defaultType !== preferred && this.providers.has(defaultType)) {
      order.push(defaultType);
    }

    // Add remaining providers
    for (const type of this.providers.keys()) {
      if (!order.includes(type)) {
        order.push(type);
      }
    }

    return order;
  }

  /**
   * Update usage statistics
   */
  private updateUsageStats(type: ProviderType, success: boolean): void {
    const stats = this.usageStats.get(type);
    if (!stats) return;

    stats.requestCount++;
    if (success) {
      stats.successCount++;
    } else {
      stats.failureCount++;
    }
  }

  /**
   * Create a hybrid router that automatically selects the best provider
   */
  createHybridRouter(): ILLMProvider {
    const factory = this;

    return {
      async initialize() {
        await factory.initialize();
      },

      async complete(options: LLMCompletionOptions) {
        return factory.executeWithFallback(
          provider => provider.complete(options)
        );
      },

      async *streamComplete(options: LLMCompletionOptions) {
        const provider = factory.selectBestProvider();
        if (!provider) throw new Error('No available providers');
        yield* provider.streamComplete(options);
      },

      async embed(options) {
        return factory.executeWithFallback(
          provider => provider.embed(options),
          'ruvllm' // Prefer local for embeddings
        );
      },

      async countTokens(options) {
        const provider = factory.selectBestProvider();
        if (!provider) throw new Error('No available providers');
        return provider.countTokens(options);
      },

      async healthCheck() {
        const providers = factory.getAvailableProviders();
        return {
          healthy: providers.length > 0,
          timestamp: new Date(),
          metadata: { availableProviders: providers }
        };
      },

      getMetadata() {
        // Return aggregated metadata
        const allMeta = Array.from(factory.providers.values()).map(s => s.metadata);
        return {
          name: 'hybrid',
          version: '1.0.0',
          models: [...new Set(allMeta.flatMap(m => m.models))],
          capabilities: {
            streaming: allMeta.some(m => m.capabilities.streaming),
            caching: allMeta.some(m => m.capabilities.caching),
            embeddings: allMeta.some(m => m.capabilities.embeddings),
            vision: allMeta.some(m => m.capabilities.vision)
          },
          costs: {
            inputPerMillion: Math.min(...allMeta.map(m => m.costs.inputPerMillion)),
            outputPerMillion: Math.min(...allMeta.map(m => m.costs.outputPerMillion))
          },
          location: 'cloud' as const
        };
      },

      async shutdown() {
        await factory.shutdown();
      },

      trackCost(usage) {
        return 0; // Factory tracks this internally
      }
    };
  }
}

/**
 * Singleton instance for global access
 */
let globalFactory: LLMProviderFactory | undefined;

/**
 * Get the global LLM provider factory instance
 */
export function getGlobalLLMFactory(): LLMProviderFactory {
  if (!globalFactory) {
    globalFactory = new LLMProviderFactory();
  }
  return globalFactory;
}

/**
 * Set the global LLM provider factory instance
 */
export function setGlobalLLMFactory(factory: LLMProviderFactory): void {
  globalFactory = factory;
}
