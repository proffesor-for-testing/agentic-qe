/**
 * Agentic QE v3 - Circuit Breaker
 * ADR-011: Resilient LLM Provider System
 *
 * Implements the circuit breaker pattern to prevent cascading failures
 * when LLM providers become unavailable or unreliable.
 *
 * States:
 * - CLOSED: Normal operation, requests pass through
 * - OPEN: Failures exceeded threshold, requests rejected immediately
 * - HALF-OPEN: Testing recovery, limited requests allowed
 */

import {
  CircuitBreakerConfig,
  CircuitBreakerState,
  CircuitBreakerStats,
  LLMProviderType,
  createLLMError,
} from './interfaces';

/**
 * Default circuit breaker configuration
 */
export const DEFAULT_CIRCUIT_BREAKER_CONFIG: CircuitBreakerConfig = {
  failureThreshold: 5,
  resetTimeoutMs: 30000, // 30 seconds
  halfOpenSuccessThreshold: 2,
  failureWindowMs: 60000, // 1 minute
  includeTimeouts: true,
};

/**
 * Failure record for tracking
 */
interface FailureRecord {
  timestamp: Date;
  error: Error;
}

/**
 * Circuit breaker for protecting LLM provider calls
 */
export class CircuitBreaker {
  private state: CircuitBreakerState = 'closed';
  private failures: FailureRecord[] = [];
  private successCount: number = 0;
  private totalRequests: number = 0;
  private totalSuccesses: number = 0;
  private totalFailures: number = 0;
  private rejectedCount: number = 0;
  private lastFailureTime?: Date;
  private lastSuccessTime?: Date;
  private openedAt?: Date;
  private halfOpenSuccesses: number = 0;
  private readonly config: CircuitBreakerConfig;
  private readonly providerType: LLMProviderType;

  constructor(
    providerType: LLMProviderType,
    config: Partial<CircuitBreakerConfig> = {}
  ) {
    this.providerType = providerType;
    this.config = { ...DEFAULT_CIRCUIT_BREAKER_CONFIG, ...config };
  }

  /**
   * Get current circuit breaker state
   */
  getState(): CircuitBreakerState {
    // Check if we should transition from open to half-open
    if (this.state === 'open' && this.openedAt) {
      const elapsed = Date.now() - this.openedAt.getTime();
      if (elapsed >= this.config.resetTimeoutMs) {
        this.transitionTo('half-open');
      }
    }
    return this.state;
  }

  /**
   * Check if requests are allowed through
   */
  canExecute(): boolean {
    const currentState = this.getState();

    if (currentState === 'closed') {
      return true;
    }

    if (currentState === 'open') {
      return false;
    }

    // Half-open: allow limited requests
    return true;
  }

  /**
   * Execute a function with circuit breaker protection
   */
  async execute<T>(fn: () => Promise<T>): Promise<T> {
    this.totalRequests++;

    const currentState = this.getState();

    if (currentState === 'open') {
      this.rejectedCount++;
      throw createLLMError(
        `Circuit breaker is open for provider ${this.providerType}`,
        'CIRCUIT_OPEN',
        {
          provider: this.providerType,
          retryable: true,
          retryAfterMs: this.getTimeUntilTransition(),
        }
      );
    }

    try {
      const result = await fn();
      this.recordSuccess();
      return result;
    } catch (error) {
      this.recordFailure(error instanceof Error ? error : new Error(String(error)));
      throw error;
    }
  }

  /**
   * Record a successful request
   */
  recordSuccess(): void {
    this.successCount++;
    this.totalSuccesses++;
    this.lastSuccessTime = new Date();

    const currentState = this.getState();

    if (currentState === 'half-open') {
      this.halfOpenSuccesses++;
      if (this.halfOpenSuccesses >= this.config.halfOpenSuccessThreshold) {
        this.transitionTo('closed');
      }
    }
  }

  /**
   * Record a failed request
   */
  recordFailure(error: Error): void {
    this.totalFailures++;
    this.lastFailureTime = new Date();

    // Check if this is a timeout error
    const isTimeout =
      error.message.toLowerCase().includes('timeout') ||
      error.name === 'TimeoutError' ||
      error.name === 'AbortError';

    // Skip recording if timeouts shouldn't count
    if (isTimeout && !this.config.includeTimeouts) {
      return;
    }

    this.failures.push({
      timestamp: new Date(),
      error,
    });

    // Clean old failures outside the window
    this.cleanOldFailures();

    const currentState = this.getState();

    if (currentState === 'half-open') {
      // Any failure in half-open returns to open
      this.transitionTo('open');
      return;
    }

    // Check if we should open the circuit
    if (
      currentState === 'closed' &&
      this.failures.length >= this.config.failureThreshold
    ) {
      this.transitionTo('open');
    }
  }

  /**
   * Get circuit breaker statistics
   */
  getStats(): CircuitBreakerStats {
    return {
      state: this.getState(),
      totalRequests: this.totalRequests,
      successCount: this.totalSuccesses,
      failureCount: this.totalFailures,
      rejectedCount: this.rejectedCount,
      lastFailureTime: this.lastFailureTime,
      lastSuccessTime: this.lastSuccessTime,
      timeUntilTransitionMs: this.getTimeUntilTransition(),
    };
  }

  /**
   * Manually reset the circuit breaker to closed state
   */
  reset(): void {
    this.state = 'closed';
    this.failures = [];
    this.successCount = 0;
    this.halfOpenSuccesses = 0;
    this.openedAt = undefined;
  }

  /**
   * Force the circuit to open (for testing or manual intervention)
   */
  forceOpen(): void {
    this.transitionTo('open');
  }

  /**
   * Force the circuit to half-open (for testing)
   */
  forceHalfOpen(): void {
    this.transitionTo('half-open');
  }

  /**
   * Get recent failure messages
   */
  getRecentFailures(count: number = 5): string[] {
    return this.failures
      .slice(-count)
      .map((f) => `[${f.timestamp.toISOString()}] ${f.error.message}`);
  }

  /**
   * Transition to a new state
   */
  private transitionTo(newState: CircuitBreakerState): void {
    const oldState = this.state;

    if (oldState === newState) {
      return;
    }

    this.state = newState;

    switch (newState) {
      case 'open':
        this.openedAt = new Date();
        this.halfOpenSuccesses = 0;
        break;
      case 'half-open':
        this.halfOpenSuccesses = 0;
        break;
      case 'closed':
        this.failures = [];
        this.openedAt = undefined;
        this.halfOpenSuccesses = 0;
        break;
    }
  }

  /**
   * Clean failures outside the time window
   */
  private cleanOldFailures(): void {
    const cutoff = Date.now() - this.config.failureWindowMs;
    this.failures = this.failures.filter(
      (f) => f.timestamp.getTime() > cutoff
    );
  }

  /**
   * Get time until next state transition
   */
  private getTimeUntilTransition(): number | undefined {
    if (this.state === 'open' && this.openedAt) {
      const elapsed = Date.now() - this.openedAt.getTime();
      const remaining = this.config.resetTimeoutMs - elapsed;
      return Math.max(0, remaining);
    }
    return undefined;
  }
}

/**
 * Circuit breaker manager for multiple providers
 */
export class CircuitBreakerManager {
  private breakers: Map<LLMProviderType, CircuitBreaker> = new Map();
  private readonly defaultConfig: CircuitBreakerConfig;

  constructor(defaultConfig: Partial<CircuitBreakerConfig> = {}) {
    this.defaultConfig = { ...DEFAULT_CIRCUIT_BREAKER_CONFIG, ...defaultConfig };
  }

  /**
   * Get or create a circuit breaker for a provider
   */
  getBreaker(
    providerType: LLMProviderType,
    config?: Partial<CircuitBreakerConfig>
  ): CircuitBreaker {
    let breaker = this.breakers.get(providerType);

    if (!breaker) {
      breaker = new CircuitBreaker(providerType, {
        ...this.defaultConfig,
        ...config,
      });
      this.breakers.set(providerType, breaker);
    }

    return breaker;
  }

  /**
   * Get all circuit breaker statistics
   */
  getAllStats(): Record<LLMProviderType, CircuitBreakerStats> {
    const stats: Partial<Record<LLMProviderType, CircuitBreakerStats>> = {};

    for (const [provider, breaker] of this.breakers) {
      stats[provider] = breaker.getStats();
    }

    return stats as Record<LLMProviderType, CircuitBreakerStats>;
  }

  /**
   * Get providers that are currently available (circuit not open)
   */
  getAvailableProviders(): LLMProviderType[] {
    const available: LLMProviderType[] = [];

    for (const [provider, breaker] of this.breakers) {
      if (breaker.canExecute()) {
        available.push(provider);
      }
    }

    return available;
  }

  /**
   * Reset all circuit breakers
   */
  resetAll(): void {
    for (const breaker of this.breakers.values()) {
      breaker.reset();
    }
  }

  /**
   * Reset a specific provider's circuit breaker
   */
  reset(providerType: LLMProviderType): void {
    const breaker = this.breakers.get(providerType);
    if (breaker) {
      breaker.reset();
    }
  }
}
