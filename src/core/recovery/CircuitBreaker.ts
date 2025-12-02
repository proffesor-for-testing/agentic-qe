/**
 * Circuit Breaker Implementation
 * Prevents cascading failures by breaking the circuit when error threshold is exceeded
 *
 * States:
 * - CLOSED: Normal operation, requests pass through
 * - OPEN: Circuit is broken, requests fail immediately
 * - HALF_OPEN: Testing if service has recovered
 */

import { EventEmitter } from 'events';

/**
 * Circuit breaker states
 */
export enum CircuitState {
  CLOSED = 'CLOSED',
  OPEN = 'OPEN',
  HALF_OPEN = 'HALF_OPEN',
}

/**
 * Circuit breaker configuration
 */
export interface CircuitBreakerConfig {
  /** Number of failures before opening circuit */
  failureThreshold: number;
  /** Number of successes in HALF_OPEN before closing circuit */
  successThreshold: number;
  /** Time in ms before attempting recovery (OPEN -> HALF_OPEN) */
  resetTimeout: number;
  /** Time window in ms for counting failures */
  failureWindow: number;
  /** Optional timeout for individual operations */
  operationTimeout?: number;
  /** Name for identification in logs/metrics */
  name: string;
}

/**
 * Circuit breaker metrics
 */
export interface CircuitBreakerMetrics {
  state: CircuitState;
  failures: number;
  successes: number;
  consecutiveFailures: number;
  consecutiveSuccesses: number;
  totalRequests: number;
  totalFailures: number;
  totalSuccesses: number;
  lastFailureTime: Date | null;
  lastSuccessTime: Date | null;
  lastStateChange: Date;
  openedCount: number;
}

/**
 * Failure record for windowed counting
 */
interface FailureRecord {
  timestamp: number;
  error: Error;
}

/**
 * Circuit Breaker Error
 */
export class CircuitBreakerOpenError extends Error {
  constructor(
    public readonly circuitName: string,
    public readonly state: CircuitState
  ) {
    super(`Circuit breaker '${circuitName}' is ${state}`);
    this.name = 'CircuitBreakerOpenError';
  }
}

/**
 * Circuit Breaker Implementation
 */
export class CircuitBreaker extends EventEmitter {
  private state: CircuitState = CircuitState.CLOSED;
  private failures: FailureRecord[] = [];
  private consecutiveSuccesses: number = 0;
  private metrics: CircuitBreakerMetrics;
  private resetTimer: NodeJS.Timeout | null = null;
  private config: CircuitBreakerConfig;

  constructor(config: Partial<CircuitBreakerConfig> & { name: string }) {
    super();
    this.config = {
      failureThreshold: 5,
      successThreshold: 3,
      resetTimeout: 30000, // 30 seconds
      failureWindow: 60000, // 1 minute
      ...config,
    };

    this.metrics = {
      state: CircuitState.CLOSED,
      failures: 0,
      successes: 0,
      consecutiveFailures: 0,
      consecutiveSuccesses: 0,
      totalRequests: 0,
      totalFailures: 0,
      totalSuccesses: 0,
      lastFailureTime: null,
      lastSuccessTime: null,
      lastStateChange: new Date(),
      openedCount: 0,
    };
  }

  /**
   * Execute an operation through the circuit breaker
   */
  async execute<T>(operation: () => Promise<T>): Promise<T> {
    // Check if circuit allows request
    if (!this.canExecute()) {
      throw new CircuitBreakerOpenError(this.config.name, this.state);
    }

    this.metrics.totalRequests++;

    try {
      // Execute with optional timeout
      const result = this.config.operationTimeout
        ? await this.executeWithTimeout(operation, this.config.operationTimeout)
        : await operation();

      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure(error instanceof Error ? error : new Error(String(error)));
      throw error;
    }
  }

  /**
   * Check if circuit allows execution
   */
  canExecute(): boolean {
    this.pruneOldFailures();

    switch (this.state) {
      case CircuitState.CLOSED:
        return true;
      case CircuitState.OPEN:
        return false;
      case CircuitState.HALF_OPEN:
        return true; // Allow test requests
      default:
        return false;
    }
  }

  /**
   * Get current state
   */
  getState(): CircuitState {
    return this.state;
  }

  /**
   * Get current metrics
   */
  getMetrics(): CircuitBreakerMetrics {
    this.pruneOldFailures();
    return {
      ...this.metrics,
      state: this.state,
      failures: this.failures.length,
      consecutiveSuccesses: this.consecutiveSuccesses,
    };
  }

  /**
   * Manually reset circuit to CLOSED
   */
  reset(): void {
    this.transitionTo(CircuitState.CLOSED);
    this.failures = [];
    this.consecutiveSuccesses = 0;
    this.metrics.consecutiveFailures = 0;
    this.clearResetTimer();
    this.emit('reset', { name: this.config.name });
  }

  /**
   * Manually open circuit
   */
  forceOpen(): void {
    this.transitionTo(CircuitState.OPEN);
    this.startResetTimer();
    this.emit('force-open', { name: this.config.name });
  }

  /**
   * Handle successful operation
   */
  private onSuccess(): void {
    this.metrics.totalSuccesses++;
    this.metrics.successes++;
    this.metrics.lastSuccessTime = new Date();
    this.metrics.consecutiveFailures = 0;
    this.consecutiveSuccesses++;

    if (this.state === CircuitState.HALF_OPEN) {
      if (this.consecutiveSuccesses >= this.config.successThreshold) {
        this.transitionTo(CircuitState.CLOSED);
        this.failures = [];
        this.emit('close', {
          name: this.config.name,
          reason: 'Success threshold reached in HALF_OPEN',
        });
      }
    }

    this.emit('success', { name: this.config.name, state: this.state });
  }

  /**
   * Handle failed operation
   */
  private onFailure(error: Error): void {
    this.metrics.totalFailures++;
    this.metrics.lastFailureTime = new Date();
    this.metrics.consecutiveFailures++;
    this.consecutiveSuccesses = 0;

    this.failures.push({
      timestamp: Date.now(),
      error,
    });

    this.emit('failure', {
      name: this.config.name,
      state: this.state,
      error: error.message,
    });

    if (this.state === CircuitState.HALF_OPEN) {
      // Any failure in HALF_OPEN reopens circuit
      this.transitionTo(CircuitState.OPEN);
      this.startResetTimer();
      this.emit('open', {
        name: this.config.name,
        reason: 'Failure in HALF_OPEN state',
      });
    } else if (this.state === CircuitState.CLOSED) {
      this.pruneOldFailures();
      if (this.failures.length >= this.config.failureThreshold) {
        this.transitionTo(CircuitState.OPEN);
        this.startResetTimer();
        this.metrics.openedCount++;
        this.emit('open', {
          name: this.config.name,
          reason: `Failure threshold (${this.config.failureThreshold}) exceeded`,
          failures: this.failures.length,
        });
      }
    }
  }

  /**
   * Transition to new state
   */
  private transitionTo(newState: CircuitState): void {
    const oldState = this.state;
    this.state = newState;
    this.metrics.state = newState;
    this.metrics.lastStateChange = new Date();

    if (newState === CircuitState.HALF_OPEN) {
      this.consecutiveSuccesses = 0;
    }

    this.emit('state-change', {
      name: this.config.name,
      from: oldState,
      to: newState,
    });
  }

  /**
   * Start reset timer for OPEN -> HALF_OPEN transition
   */
  private startResetTimer(): void {
    this.clearResetTimer();

    this.resetTimer = setTimeout(() => {
      if (this.state === CircuitState.OPEN) {
        this.transitionTo(CircuitState.HALF_OPEN);
        this.emit('half-open', {
          name: this.config.name,
          reason: 'Reset timeout elapsed',
        });
      }
    }, this.config.resetTimeout);
  }

  /**
   * Clear reset timer
   */
  private clearResetTimer(): void {
    if (this.resetTimer) {
      clearTimeout(this.resetTimer);
      this.resetTimer = null;
    }
  }

  /**
   * Remove failures outside the window
   */
  private pruneOldFailures(): void {
    const cutoff = Date.now() - this.config.failureWindow;
    this.failures = this.failures.filter(f => f.timestamp > cutoff);
  }

  /**
   * Execute operation with timeout
   */
  private async executeWithTimeout<T>(
    operation: () => Promise<T>,
    timeout: number
  ): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`Operation timed out after ${timeout}ms`));
      }, timeout);

      operation()
        .then(result => {
          clearTimeout(timer);
          resolve(result);
        })
        .catch(error => {
          clearTimeout(timer);
          reject(error);
        });
    });
  }

  /**
   * Cleanup resources
   */
  destroy(): void {
    this.clearResetTimer();
    this.removeAllListeners();
  }
}

/**
 * Circuit Breaker Manager for managing multiple circuit breakers
 */
export class CircuitBreakerManager {
  private breakers: Map<string, CircuitBreaker> = new Map();
  private defaultConfig: Partial<CircuitBreakerConfig>;

  constructor(defaultConfig: Partial<CircuitBreakerConfig> = {}) {
    this.defaultConfig = defaultConfig;
  }

  /**
   * Get or create a circuit breaker
   */
  getBreaker(name: string, config?: Partial<CircuitBreakerConfig>): CircuitBreaker {
    let breaker = this.breakers.get(name);

    if (!breaker) {
      breaker = new CircuitBreaker({
        ...this.defaultConfig,
        ...config,
        name,
      });
      this.breakers.set(name, breaker);
    }

    return breaker;
  }

  /**
   * Execute operation through named circuit breaker
   */
  async execute<T>(name: string, operation: () => Promise<T>): Promise<T> {
    const breaker = this.getBreaker(name);
    return breaker.execute(operation);
  }

  /**
   * Get all circuit breaker metrics
   */
  getAllMetrics(): Map<string, CircuitBreakerMetrics> {
    const metrics = new Map<string, CircuitBreakerMetrics>();
    for (const [name, breaker] of this.breakers) {
      metrics.set(name, breaker.getMetrics());
    }
    return metrics;
  }

  /**
   * Get summary of all circuit states
   */
  getSummary(): { total: number; closed: number; open: number; halfOpen: number } {
    let closed = 0, open = 0, halfOpen = 0;

    for (const breaker of this.breakers.values()) {
      switch (breaker.getState()) {
        case CircuitState.CLOSED: closed++; break;
        case CircuitState.OPEN: open++; break;
        case CircuitState.HALF_OPEN: halfOpen++; break;
      }
    }

    return { total: this.breakers.size, closed, open, halfOpen };
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
   * Cleanup all circuit breakers
   */
  destroy(): void {
    for (const breaker of this.breakers.values()) {
      breaker.destroy();
    }
    this.breakers.clear();
  }
}

/**
 * Default circuit breaker manager instance
 */
let defaultManager: CircuitBreakerManager | null = null;

/**
 * Get default circuit breaker manager
 */
export function getCircuitBreakerManager(
  config?: Partial<CircuitBreakerConfig>
): CircuitBreakerManager {
  if (!defaultManager) {
    defaultManager = new CircuitBreakerManager(config);
  }
  return defaultManager;
}

/**
 * Reset default manager (for testing)
 */
export function resetCircuitBreakerManager(): void {
  if (defaultManager) {
    defaultManager.destroy();
    defaultManager = null;
  }
}
