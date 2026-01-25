/**
 * HybridRouterHealthIntegration - Health-aware routing integration for HybridRouter
 *
 * Integrates ProviderHealthMonitor with HybridRouter for:
 * - Real-time health status-based routing decisions
 * - Automatic fallback chain when primary provider is unhealthy
 * - Circuit breaker coordination
 * - Provider ranking by health score
 *
 * @module providers/HybridRouterHealthIntegration
 * @version 1.0.0
 */

import { EventEmitter } from 'events';
import { Logger } from '../utils/Logger';
import {
  ProviderHealthMonitor,
  ProviderHealthState,
  HealthCheckResult,
  ProviderHealthConfig
} from '../monitoring/ProviderHealthMonitor';
import {
  ILLMProvider,
  LLMCompletionOptions,
  LLMCompletionResponse,
  LLMHealthStatus,
  LLMProviderError
} from './ILLMProvider';

/**
 * Fallback strategy configuration
 */
export interface FallbackConfig {
  /** Enable automatic fallback to next healthy provider */
  enabled: boolean;
  /** Maximum number of fallback attempts */
  maxAttempts: number;
  /** Delay between fallback attempts (ms) */
  retryDelay: number;
  /** Prefer providers with lower latency in fallback chain */
  preferLowLatency: boolean;
  /** Prefer providers with higher availability in fallback chain */
  preferHighAvailability: boolean;
  /** Minimum health score (0-1) to consider provider for fallback */
  minHealthScore: number;
}

/**
 * Provider with priority and health info
 */
export interface RankedProvider {
  providerId: string;
  provider: ILLMProvider;
  healthScore: number;
  latency: number;
  availability: number;
  isHealthy: boolean;
  circuitState: 'closed' | 'open' | 'half-open';
}

/**
 * Fallback result
 */
export interface FallbackResult {
  success: boolean;
  providerId: string;
  attemptCount: number;
  response?: LLMCompletionResponse;
  error?: string;
  fallbackChain: string[];
}

/**
 * Default fallback configuration
 */
const DEFAULT_FALLBACK_CONFIG: FallbackConfig = {
  enabled: true,
  maxAttempts: 3,
  retryDelay: 100,
  preferLowLatency: true,
  preferHighAvailability: true,
  minHealthScore: 0.3
};

/**
 * HybridRouterHealthIntegration - Coordinates health monitoring with routing
 *
 * This class sits between HybridRouter and ProviderHealthMonitor to provide:
 * 1. Health-aware provider selection
 * 2. Intelligent fallback chain based on health metrics
 * 3. Event coordination for health/routing decisions
 *
 * @example
 * ```typescript
 * const healthMonitor = new ProviderHealthMonitor();
 * const integration = new HybridRouterHealthIntegration(healthMonitor);
 *
 * // Register providers
 * integration.registerProvider('claude', claudeProvider);
 * integration.registerProvider('groq', groqProvider);
 * integration.registerProvider('github-models', githubModelsProvider);
 *
 * // Get ranked providers for routing
 * const ranked = integration.getRankedProviders();
 *
 * // Execute with automatic fallback
 * const result = await integration.executeWithFallback(options);
 * ```
 */
export class HybridRouterHealthIntegration extends EventEmitter {
  private readonly logger: Logger;
  private readonly healthMonitor: ProviderHealthMonitor;
  private readonly fallbackConfig: FallbackConfig;
  private readonly providers: Map<string, ILLMProvider>;
  private lastRoutingDecision?: {
    primaryProvider: string;
    fallbackChain: string[];
    timestamp: Date;
  };

  constructor(
    healthMonitor: ProviderHealthMonitor,
    fallbackConfig?: Partial<FallbackConfig>
  ) {
    super();
    this.logger = Logger.getInstance();
    this.healthMonitor = healthMonitor;
    this.fallbackConfig = { ...DEFAULT_FALLBACK_CONFIG, ...fallbackConfig };
    this.providers = new Map();

    // Listen to health monitor events
    this.setupHealthEventListeners();

    this.logger.debug('HybridRouterHealthIntegration initialized', {
      fallbackConfig: this.fallbackConfig
    });
  }

  /**
   * Register a provider for health-aware routing
   *
   * @param providerId - Unique identifier for the provider
   * @param provider - LLM provider instance
   */
  registerProvider(providerId: string, provider: ILLMProvider): void {
    this.providers.set(providerId, provider);

    // Register with health monitor
    this.healthMonitor.registerProvider(
      providerId,
      () => provider.healthCheck()
    );

    this.logger.info(`Provider ${providerId} registered for health-aware routing`);
  }

  /**
   * Unregister a provider
   *
   * @param providerId - Provider to unregister
   */
  unregisterProvider(providerId: string): void {
    this.providers.delete(providerId);
    this.healthMonitor.unregisterProvider(providerId);
    this.logger.info(`Provider ${providerId} unregistered`);
  }

  /**
   * Get all providers ranked by health score
   *
   * Providers are ranked considering:
   * - Current health status
   * - Circuit breaker state
   * - Latency (if preferLowLatency enabled)
   * - Availability (if preferHighAvailability enabled)
   *
   * @returns Array of providers sorted by priority (best first)
   */
  getRankedProviders(): RankedProvider[] {
    const ranked: RankedProvider[] = [];

    for (const [providerId, provider] of this.providers.entries()) {
      const healthState = this.healthMonitor.getProviderHealth(providerId);

      if (!healthState) {
        // Provider not monitored, add with default values
        ranked.push({
          providerId,
          provider,
          healthScore: 0.5,
          latency: 1000,
          availability: 0.5,
          isHealthy: true,
          circuitState: 'closed'
        });
        continue;
      }

      // Calculate composite health score
      const healthScore = this.calculateHealthScore(healthState);

      ranked.push({
        providerId,
        provider,
        healthScore,
        latency: healthState.latency,
        availability: healthState.availability,
        isHealthy: healthState.healthy,
        circuitState: healthState.circuitState
      });
    }

    // Sort by health score (descending)
    return ranked.sort((a, b) => b.healthScore - a.healthScore);
  }

  /**
   * Get the best available provider based on health
   *
   * @returns Best provider or undefined if none available
   */
  getBestProvider(): RankedProvider | undefined {
    const ranked = this.getRankedProviders();

    // Find first healthy provider with closed circuit
    const healthy = ranked.find(
      p => p.isHealthy &&
           p.circuitState === 'closed' &&
           p.healthScore >= this.fallbackConfig.minHealthScore
    );

    if (healthy) {
      return healthy;
    }

    // Fallback: find first provider with half-open circuit (recovery attempt)
    const recovering = ranked.find(
      p => p.circuitState === 'half-open'
    );

    if (recovering) {
      this.logger.debug('Using recovering provider for best selection', {
        providerId: recovering.providerId
      });
      return recovering;
    }

    return undefined;
  }

  /**
   * Build fallback chain for a primary provider
   *
   * @param excludeProviderId - Provider ID to exclude (primary)
   * @returns Array of provider IDs in fallback order
   */
  buildFallbackChain(excludeProviderId?: string): string[] {
    const ranked = this.getRankedProviders()
      .filter(p => p.providerId !== excludeProviderId)
      .filter(p => p.healthScore >= this.fallbackConfig.minHealthScore)
      .filter(p => p.circuitState !== 'open');

    return ranked.map(p => p.providerId);
  }

  /**
   * Execute a completion request with automatic fallback
   *
   * Attempts to execute with the best provider, falling back to
   * alternatives if the primary fails.
   *
   * @param options - Completion options
   * @param preferredProviderId - Optional preferred provider to try first
   * @returns Fallback result with response or error
   */
  async executeWithFallback(
    options: LLMCompletionOptions,
    preferredProviderId?: string
  ): Promise<FallbackResult> {
    if (!this.fallbackConfig.enabled) {
      // Fallback disabled, just try the preferred or best provider
      const provider = preferredProviderId
        ? this.providers.get(preferredProviderId)
        : this.getBestProvider()?.provider;

      if (!provider) {
        return {
          success: false,
          providerId: 'none',
          attemptCount: 0,
          error: 'No provider available',
          fallbackChain: []
        };
      }

      try {
        const response = await provider.complete(options);
        return {
          success: true,
          providerId: preferredProviderId || 'best',
          attemptCount: 1,
          response,
          fallbackChain: []
        };
      } catch (error) {
        return {
          success: false,
          providerId: preferredProviderId || 'best',
          attemptCount: 1,
          error: (error as Error).message,
          fallbackChain: []
        };
      }
    }

    // Build execution chain
    let chain: string[] = [];

    if (preferredProviderId && this.isProviderAvailable(preferredProviderId)) {
      chain = [preferredProviderId, ...this.buildFallbackChain(preferredProviderId)];
    } else {
      chain = this.buildFallbackChain();
    }

    if (chain.length === 0) {
      return {
        success: false,
        providerId: 'none',
        attemptCount: 0,
        error: 'No healthy providers available',
        fallbackChain: []
      };
    }

    // Track the decision
    this.lastRoutingDecision = {
      primaryProvider: chain[0],
      fallbackChain: chain.slice(1),
      timestamp: new Date()
    };

    // Execute with fallback
    const attemptedChain: string[] = [];
    let lastError: string | undefined;

    for (let i = 0; i < Math.min(chain.length, this.fallbackConfig.maxAttempts); i++) {
      const providerId = chain[i];
      const provider = this.providers.get(providerId);

      if (!provider) {
        continue;
      }

      attemptedChain.push(providerId);

      try {
        this.logger.debug(`Attempting provider ${providerId}`, {
          attemptNumber: i + 1,
          totalInChain: chain.length
        });

        const response = await provider.complete(options);

        // Success - emit event
        this.emit('fallback-success', {
          providerId,
          attemptNumber: i + 1,
          fallbackChain: attemptedChain,
          timestamp: new Date()
        });

        return {
          success: true,
          providerId,
          attemptCount: i + 1,
          response,
          fallbackChain: attemptedChain
        };

      } catch (error) {
        lastError = (error as Error).message;

        this.logger.warn(`Provider ${providerId} failed, attempting fallback`, {
          error: lastError,
          attemptNumber: i + 1,
          remainingProviders: chain.length - i - 1
        });

        // Emit failure event
        this.emit('provider-failed', {
          providerId,
          error: lastError,
          attemptNumber: i + 1,
          timestamp: new Date()
        });

        // Wait before retry (except for last attempt)
        if (i < chain.length - 1 && this.fallbackConfig.retryDelay > 0) {
          await this.delay(this.fallbackConfig.retryDelay);
        }
      }
    }

    // All attempts failed
    this.emit('fallback-exhausted', {
      attemptedProviders: attemptedChain,
      lastError,
      timestamp: new Date()
    });

    return {
      success: false,
      providerId: attemptedChain[attemptedChain.length - 1] || 'none',
      attemptCount: attemptedChain.length,
      error: lastError || 'All providers failed',
      fallbackChain: attemptedChain
    };
  }

  /**
   * Check if a specific provider is available for use
   *
   * @param providerId - Provider to check
   * @returns True if provider can be used
   */
  isProviderAvailable(providerId: string): boolean {
    if (!this.providers.has(providerId)) {
      return false;
    }

    const health = this.healthMonitor.getProviderHealth(providerId);
    if (!health) {
      return true; // Not monitored, assume available
    }

    // Provider is available if:
    // 1. Circuit is closed and it's healthy
    // 2. Circuit is half-open (recovery attempt)
    return (
      (health.circuitState === 'closed' && health.healthy) ||
      health.circuitState === 'half-open'
    );
  }

  /**
   * Get health summary for all providers
   *
   * @returns Map of provider IDs to health status
   */
  getHealthSummary(): Map<string, {
    healthy: boolean;
    circuitState: string;
    healthScore: number;
    lastCheck: Date;
  }> {
    const summary = new Map();

    for (const providerId of this.providers.keys()) {
      const health = this.healthMonitor.getProviderHealth(providerId);

      if (health) {
        summary.set(providerId, {
          healthy: health.healthy,
          circuitState: health.circuitState,
          healthScore: this.calculateHealthScore(health),
          lastCheck: health.lastCheck
        });
      } else {
        summary.set(providerId, {
          healthy: true,
          circuitState: 'unknown',
          healthScore: 0.5,
          lastCheck: new Date()
        });
      }
    }

    return summary;
  }

  /**
   * Force health check on all providers
   *
   * @returns Array of health check results
   */
  async forceHealthCheck(): Promise<HealthCheckResult[]> {
    return this.healthMonitor.checkAllProviders();
  }

  /**
   * Get the last routing decision
   */
  getLastRoutingDecision(): typeof this.lastRoutingDecision {
    return this.lastRoutingDecision;
  }

  /**
   * Calculate composite health score
   *
   * Score is based on:
   * - Base health status (40%)
   * - Availability (30%)
   * - Latency score (20%)
   * - Circuit state (10%)
   */
  private calculateHealthScore(health: ProviderHealthState): number {
    let score = 0;

    // Base health (40%)
    if (health.healthy) {
      score += 0.4;
    }

    // Availability (30%)
    score += health.availability * 0.3;

    // Latency score (20%) - lower is better, max 5000ms
    const latencyScore = Math.max(0, 1 - health.latency / 5000);
    score += latencyScore * 0.2;

    // Circuit state (10%)
    switch (health.circuitState) {
      case 'closed':
        score += 0.1;
        break;
      case 'half-open':
        score += 0.05;
        break;
      case 'open':
        score += 0;
        break;
    }

    return Math.min(1, Math.max(0, score));
  }

  /**
   * Setup listeners for health monitor events
   */
  private setupHealthEventListeners(): void {
    this.healthMonitor.on('health-change', (data) => {
      this.logger.debug('Provider health changed', {
        providerId: data.providerId,
        healthy: data.healthy,
        errorRate: data.errorRate
      });

      // Re-emit for consumers
      this.emit('health-change', data);
    });

    this.healthMonitor.on('circuit-change', (data) => {
      this.logger.info('Circuit state changed', {
        providerId: data.providerId,
        state: data.circuitState,
        previousState: data.previousState
      });

      // Re-emit for consumers
      this.emit('circuit-change', data);
    });
  }

  /**
   * Delay helper
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

/**
 * Factory function to create integration with default config
 */
export function createHealthAwareRouter(
  healthConfig?: Partial<ProviderHealthConfig>,
  fallbackConfig?: Partial<FallbackConfig>
): {
  healthMonitor: ProviderHealthMonitor;
  integration: HybridRouterHealthIntegration;
} {
  const healthMonitor = new ProviderHealthMonitor(healthConfig);
  const integration = new HybridRouterHealthIntegration(healthMonitor, fallbackConfig);

  return { healthMonitor, integration };
}
