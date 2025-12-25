/**
 * ProviderHealthMonitor - Health monitoring and circuit breaker for LLM providers
 *
 * Monitors provider health with circuit breaker pattern to prevent cascading failures.
 * Tracks response time, error rate, availability, and manages circuit state transitions.
 *
 * @module monitoring/ProviderHealthMonitor
 * @version 1.0.0
 */

import { EventEmitter } from 'events';
import { Logger } from '../utils/Logger';
import { LLMHealthStatus } from '../providers/ILLMProvider';

/**
 * Configuration for health monitoring
 */
export interface ProviderHealthConfig {
  /** How often to check health (default: 30000ms) */
  checkIntervalMs: number;
  /** Health check timeout (default: 5000ms) */
  timeoutMs: number;
  /** Failures before circuit opens (default: 3) */
  failureThreshold: number;
  /** Time before retry after circuit opens (default: 60000ms) */
  recoveryTimeMs: number;
  /** Max latency considered healthy (default: 3000ms) */
  healthyLatencyThresholdMs: number;
}

/**
 * Current health state of a provider
 */
export interface ProviderHealthState {
  providerId: string;
  healthy: boolean;
  latency: number;
  errorRate: number;          // 0-1 scale
  availability: number;       // 0-1 scale
  consecutiveFailures: number;
  circuitState: 'closed' | 'open' | 'half-open';
  lastCheck: Date;
  lastError?: string;
  checkCount: number;
  successCount: number;
}

/**
 * Result of a single health check
 */
export interface HealthCheckResult {
  providerId: string;
  healthy: boolean;
  latency: number;
  timestamp: Date;
  error?: string;
}

/**
 * Registered provider with health check function
 */
interface RegisteredProvider {
  providerId: string;
  healthCheckFn: () => Promise<LLMHealthStatus>;
  state: ProviderHealthState;
  circuitOpenedAt?: Date;
}

/**
 * Default configuration values
 */
const DEFAULT_CONFIG: ProviderHealthConfig = {
  checkIntervalMs: 30000,
  timeoutMs: 5000,
  failureThreshold: 3,
  recoveryTimeMs: 60000,
  healthyLatencyThresholdMs: 3000
};

/**
 * ProviderHealthMonitor - Monitors LLM provider health with circuit breaker pattern
 *
 * Features:
 * - Automatic health checks at configurable intervals
 * - Circuit breaker pattern (closed → open → half-open → closed)
 * - Error rate and availability tracking with sliding window
 * - Event emission for health changes and circuit state transitions
 * - Concurrent health checks with timeout protection
 * - Manual circuit control (force open, reset)
 *
 * @example
 * ```typescript
 * const monitor = new ProviderHealthMonitor({
 *   checkIntervalMs: 30000,
 *   failureThreshold: 3
 * });
 *
 * monitor.registerProvider('ollama', async () => {
 *   return await ollamaProvider.healthCheck();
 * });
 *
 * monitor.on('health-change', (data) => {
 *   console.log(`Provider ${data.providerId} health: ${data.healthy}`);
 * });
 *
 * monitor.startMonitoring();
 * ```
 */
export class ProviderHealthMonitor extends EventEmitter {
  private readonly logger: Logger;
  private readonly config: ProviderHealthConfig;
  private providers: Map<string, RegisteredProvider>;
  private monitoringInterval?: NodeJS.Timeout;
  private isMonitoring: boolean;

  constructor(config?: Partial<ProviderHealthConfig>) {
    super();
    this.logger = Logger.getInstance();
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.providers = new Map();
    this.isMonitoring = false;

    this.logger.debug('ProviderHealthMonitor initialized', { config: this.config });
  }

  /**
   * Register a provider for health monitoring
   *
   * @param providerId - Unique identifier for the provider
   * @param healthCheckFn - Function that returns provider health status
   */
  registerProvider(
    providerId: string,
    healthCheckFn: () => Promise<LLMHealthStatus>
  ): void {
    if (this.providers.has(providerId)) {
      this.logger.warn(`Provider ${providerId} already registered, replacing`);
    }

    const state: ProviderHealthState = {
      providerId,
      healthy: true,
      latency: 0,
      errorRate: 0,
      availability: 1.0,
      consecutiveFailures: 0,
      circuitState: 'closed',
      lastCheck: new Date(),
      checkCount: 0,
      successCount: 0
    };

    this.providers.set(providerId, {
      providerId,
      healthCheckFn,
      state
    });

    this.logger.info(`Provider ${providerId} registered for health monitoring`);
  }

  /**
   * Unregister a provider from health monitoring
   *
   * @param providerId - Provider to unregister
   */
  unregisterProvider(providerId: string): void {
    if (!this.providers.has(providerId)) {
      this.logger.warn(`Provider ${providerId} not registered`);
      return;
    }

    this.providers.delete(providerId);
    this.logger.info(`Provider ${providerId} unregistered from health monitoring`);
  }

  /**
   * Start automatic health monitoring
   *
   * Begins periodic health checks for all registered providers.
   */
  startMonitoring(): void {
    if (this.isMonitoring) {
      this.logger.warn('Health monitoring already started');
      return;
    }

    this.isMonitoring = true;

    // Perform immediate check on start
    this.checkAllProviders().catch(error => {
      this.logger.error('Initial health check failed', { error: error.message });
    });

    // Schedule periodic checks
    this.monitoringInterval = setInterval(() => {
      this.checkAllProviders().catch(error => {
        this.logger.error('Periodic health check failed', { error: error.message });
      });
    }, this.config.checkIntervalMs);

    this.logger.info('Health monitoring started', {
      interval: this.config.checkIntervalMs,
      providers: Array.from(this.providers.keys())
    });
  }

  /**
   * Stop automatic health monitoring
   */
  stopMonitoring(): void {
    if (!this.isMonitoring) {
      this.logger.warn('Health monitoring not started');
      return;
    }

    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = undefined;
    }

    this.isMonitoring = false;
    this.logger.info('Health monitoring stopped');
  }

  /**
   * Check health of a specific provider
   *
   * @param providerId - Provider to check
   * @returns Health check result
   */
  async checkProviderHealth(providerId: string): Promise<HealthCheckResult> {
    const provider = this.providers.get(providerId);
    if (!provider) {
      throw new Error(`Provider ${providerId} not registered`);
    }

    const startTime = Date.now();
    let result: HealthCheckResult;

    try {
      // Check if circuit is open and recovery time has passed
      if (provider.state.circuitState === 'open') {
        const timeSinceOpen = Date.now() - (provider.circuitOpenedAt?.getTime() || 0);
        if (timeSinceOpen >= this.config.recoveryTimeMs) {
          // Transition to half-open for retry
          this.transitionCircuitState(provider, 'half-open');
        } else {
          // Circuit still open, fail fast
          result = {
            providerId,
            healthy: false,
            latency: 0,
            timestamp: new Date(),
            error: 'Circuit breaker is open'
          };
          this.updateProviderState(provider, result);
          return result;
        }
      }

      // Perform health check with timeout
      const healthStatus = await this.withTimeout(
        provider.healthCheckFn(),
        this.config.timeoutMs,
        `Health check timeout for ${providerId}`
      );

      const latency = Date.now() - startTime;

      // Evaluate health based on response and latency
      const healthy = healthStatus.healthy &&
        latency < this.config.healthyLatencyThresholdMs;

      result = {
        providerId,
        healthy,
        latency,
        timestamp: new Date(),
        error: healthStatus.error
      };

      // Update state and handle circuit breaker logic
      this.updateProviderState(provider, result);

      if (result.healthy) {
        this.handleSuccessfulCheck(provider);
      } else {
        this.handleFailedCheck(provider, result.error);
      }

      return result;

    } catch (error) {
      const latency = Date.now() - startTime;
      const errorMessage = (error as Error).message;

      result = {
        providerId,
        healthy: false,
        latency,
        timestamp: new Date(),
        error: errorMessage
      };

      this.updateProviderState(provider, result);
      this.handleFailedCheck(provider, errorMessage);

      return result;
    }
  }

  /**
   * Check health of all registered providers concurrently
   *
   * @returns Array of health check results
   */
  async checkAllProviders(): Promise<HealthCheckResult[]> {
    if (this.providers.size === 0) {
      this.logger.warn('No providers registered for health check');
      return [];
    }

    const providerIds = Array.from(this.providers.keys());

    const results = await Promise.all(
      providerIds.map(id => this.checkProviderHealth(id))
    );

    this.logger.debug('Completed health check for all providers', {
      total: results.length,
      healthy: results.filter(r => r.healthy).length,
      unhealthy: results.filter(r => !r.healthy).length
    });

    return results;
  }

  /**
   * Get current health state of a provider
   *
   * @param providerId - Provider to query
   * @returns Current health state or undefined if not registered
   */
  getProviderHealth(providerId: string): ProviderHealthState | undefined {
    const provider = this.providers.get(providerId);
    return provider ? { ...provider.state } : undefined;
  }

  /**
   * Get health state of all registered providers
   *
   * @returns Map of provider IDs to health states
   */
  getAllProviderHealth(): Map<string, ProviderHealthState> {
    const healthMap = new Map<string, ProviderHealthState>();

    for (const [id, provider] of this.providers.entries()) {
      healthMap.set(id, { ...provider.state });
    }

    return healthMap;
  }

  /**
   * Get list of healthy providers
   *
   * @returns Array of provider IDs that are currently healthy
   */
  getHealthyProviders(): string[] {
    return Array.from(this.providers.entries())
      .filter(([_, provider]) =>
        provider.state.healthy && provider.state.circuitState === 'closed'
      )
      .map(([id, _]) => id);
  }

  /**
   * Check if a specific provider is healthy
   *
   * @param providerId - Provider to check
   * @returns True if provider is healthy and circuit is closed
   */
  isProviderHealthy(providerId: string): boolean {
    const provider = this.providers.get(providerId);
    if (!provider) {
      return false;
    }

    return provider.state.healthy && provider.state.circuitState === 'closed';
  }

  /**
   * Get current circuit breaker state for a provider
   *
   * @param providerId - Provider to query
   * @returns Circuit state or 'closed' if not registered
   */
  getCircuitState(providerId: string): 'closed' | 'open' | 'half-open' {
    const provider = this.providers.get(providerId);
    return provider?.state.circuitState || 'closed';
  }

  /**
   * Manually force a circuit to open
   *
   * Useful for maintenance or emergency situations.
   *
   * @param providerId - Provider to open circuit for
   */
  forceCircuitOpen(providerId: string): void {
    const provider = this.providers.get(providerId);
    if (!provider) {
      throw new Error(`Provider ${providerId} not registered`);
    }

    const previousState = provider.state.circuitState;
    this.transitionCircuitState(provider, 'open');
    provider.circuitOpenedAt = new Date();

    this.logger.warn(`Circuit manually forced open for provider ${providerId}`, {
      previousState
    });
  }

  /**
   * Reset circuit breaker to closed state
   *
   * Useful for manual recovery or testing.
   *
   * @param providerId - Provider to reset
   */
  resetCircuit(providerId: string): void {
    const provider = this.providers.get(providerId);
    if (!provider) {
      throw new Error(`Provider ${providerId} not registered`);
    }

    const previousState = provider.state.circuitState;
    provider.state.consecutiveFailures = 0;
    provider.circuitOpenedAt = undefined;
    this.transitionCircuitState(provider, 'closed');

    this.logger.info(`Circuit reset for provider ${providerId}`, {
      previousState
    });
  }

  /**
   * Update provider state based on health check result
   */
  private updateProviderState(
    provider: RegisteredProvider,
    result: HealthCheckResult
  ): void {
    const prevHealthy = provider.state.healthy;

    provider.state.healthy = result.healthy;
    provider.state.latency = result.latency;
    provider.state.lastCheck = result.timestamp;
    provider.state.lastError = result.error;
    provider.state.checkCount++;

    if (result.healthy) {
      provider.state.successCount++;
    }

    // Calculate error rate (last 100 checks)
    const recentWindow = Math.min(provider.state.checkCount, 100);
    const recentSuccesses = Math.min(provider.state.successCount, recentWindow);
    provider.state.errorRate = 1 - (recentSuccesses / recentWindow);

    // Calculate availability (all-time)
    provider.state.availability = provider.state.successCount / provider.state.checkCount;

    // Emit health change event if status changed
    if (prevHealthy !== result.healthy) {
      this.emit('health-change', {
        providerId: provider.providerId,
        healthy: result.healthy,
        previousHealthy: prevHealthy,
        errorRate: provider.state.errorRate,
        availability: provider.state.availability,
        latency: result.latency,
        timestamp: result.timestamp
      });
    }
  }

  /**
   * Handle successful health check
   */
  private handleSuccessfulCheck(provider: RegisteredProvider): void {
    // Reset consecutive failures on success
    provider.state.consecutiveFailures = 0;

    // If circuit was half-open, close it
    if (provider.state.circuitState === 'half-open') {
      this.transitionCircuitState(provider, 'closed');
      provider.circuitOpenedAt = undefined;
      this.logger.info(`Circuit closed for provider ${provider.providerId} after successful recovery`);
    }
  }

  /**
   * Handle failed health check
   */
  private handleFailedCheck(provider: RegisteredProvider, error?: string): void {
    provider.state.consecutiveFailures++;

    this.logger.warn(`Health check failed for provider ${provider.providerId}`, {
      consecutiveFailures: provider.state.consecutiveFailures,
      failureThreshold: this.config.failureThreshold,
      error
    });

    // Open circuit if failure threshold exceeded
    if (
      provider.state.consecutiveFailures >= this.config.failureThreshold &&
      provider.state.circuitState !== 'open'
    ) {
      this.transitionCircuitState(provider, 'open');
      provider.circuitOpenedAt = new Date();

      this.logger.error(`Circuit opened for provider ${provider.providerId}`, {
        consecutiveFailures: provider.state.consecutiveFailures,
        failureThreshold: this.config.failureThreshold
      });
    }
  }

  /**
   * Transition circuit breaker state
   */
  private transitionCircuitState(
    provider: RegisteredProvider,
    newState: 'closed' | 'open' | 'half-open'
  ): void {
    const prevState = provider.state.circuitState;
    provider.state.circuitState = newState;

    // Emit circuit change event
    this.emit('circuit-change', {
      providerId: provider.providerId,
      circuitState: newState,
      previousState: prevState,
      consecutiveFailures: provider.state.consecutiveFailures,
      timestamp: new Date()
    });
  }

  /**
   * Execute a promise with timeout
   */
  private async withTimeout<T>(
    promise: Promise<T>,
    timeoutMs: number,
    errorMessage: string
  ): Promise<T> {
    let timeoutHandle: NodeJS.Timeout;

    const timeoutPromise = new Promise<never>((_, reject) => {
      timeoutHandle = setTimeout(() => {
        reject(new Error(errorMessage));
      }, timeoutMs);
    });

    try {
      return await Promise.race([promise, timeoutPromise]);
    } finally {
      clearTimeout(timeoutHandle!);
    }
  }
}
