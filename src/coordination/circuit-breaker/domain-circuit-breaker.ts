/**
 * Agentic QE v3 - Domain Circuit Breaker
 * ADR-064 Phase 2D: Circuit breaker for a single DDD domain
 *
 * Implements the circuit breaker pattern to isolate failing QE domains
 * from the fleet. Follows the same state machine as the LLM circuit
 * breaker (closed -> open -> half-open) but with domain-specific
 * thresholds and cascade support.
 */

import { toErrorMessage, toError } from '../../shared/error-utils.js';
import type {
  DomainBreakerState,
  DomainBreakerStats,
  DomainBreakerEvent,
  DomainBreakerStateChangeHandler,
  DomainCircuitBreakerConfig,
} from './types.js';

// ============================================================================
// Default Configuration
// ============================================================================

/**
 * Default configuration for domain circuit breakers.
 * More conservative than LLM breakers since domain failures
 * can indicate systemic issues.
 */
export const DEFAULT_DOMAIN_BREAKER_CONFIG: DomainCircuitBreakerConfig = {
  failureThreshold: 3,
  resetTimeoutMs: 60_000,       // 1 minute
  halfOpenSuccessThreshold: 2,
  failureWindowMs: 120_000,     // 2 minutes
  cascadeEnabled: false,
  cascadeTargets: undefined,
};

// ============================================================================
// Custom Error
// ============================================================================

/**
 * Error thrown when a request is rejected because the domain circuit is open.
 */
export class DomainCircuitOpenError extends Error {
  /** The domain whose circuit is open */
  readonly domain: string;
  /** Estimated milliseconds until the circuit transitions to half-open */
  readonly retryAfterMs?: number;

  constructor(domain: string, retryAfterMs?: number) {
    const retryInfo = retryAfterMs != null ? ` (retry after ${retryAfterMs}ms)` : '';
    super(`Circuit breaker is open for domain '${domain}'${retryInfo}`);
    this.name = 'DomainCircuitOpenError';
    this.domain = domain;
    this.retryAfterMs = retryAfterMs;
  }
}

// ============================================================================
// Failure Record
// ============================================================================

interface FailureRecord {
  readonly timestamp: number;
  readonly message: string;
}

// ============================================================================
// Domain Circuit Breaker
// ============================================================================

/**
 * Circuit breaker for a single DDD domain.
 *
 * Protects the fleet from cascading failures by tracking domain-level
 * error rates and automatically isolating unhealthy domains.
 *
 * State transitions:
 * - closed -> open: when failures within the window exceed failureThreshold
 * - open -> half-open: after resetTimeoutMs elapses
 * - half-open -> closed: after halfOpenSuccessThreshold consecutive successes
 * - half-open -> open: on any failure
 */
export class DomainCircuitBreaker {
  private state: DomainBreakerState = 'closed';
  private failures: FailureRecord[] = [];
  private totalRequests: number = 0;
  private totalSuccesses: number = 0;
  private totalFailures: number = 0;
  private rejectedCount: number = 0;
  private lastFailureTime?: number;
  private lastSuccessTime?: number;
  private openedAt?: number;
  private halfOpenSuccesses: number = 0;
  private readonly config: DomainCircuitBreakerConfig;
  private readonly stateChangeHandlers: Set<DomainBreakerStateChangeHandler> = new Set();

  /** The domain this breaker protects */
  readonly domain: string;

  constructor(domain: string, config?: Partial<DomainCircuitBreakerConfig>) {
    this.domain = domain;
    this.config = { ...DEFAULT_DOMAIN_BREAKER_CONFIG, ...config };
  }

  // --------------------------------------------------------------------------
  // Public API
  // --------------------------------------------------------------------------

  /**
   * Check if requests are allowed through the circuit.
   * Automatically checks for open -> half-open time-based transition.
   */
  canExecute(): boolean {
    const currentState = this.getState();

    if (currentState === 'closed') {
      return true;
    }

    if (currentState === 'open') {
      return false;
    }

    // half-open: allow limited requests for probing
    return true;
  }

  /**
   * Execute a function with circuit breaker protection.
   * Automatically records success/failure and manages state transitions.
   *
   * @param fn - The async function to execute
   * @returns The result of the function
   * @throws {DomainCircuitOpenError} When the circuit is open
   * @throws Re-throws the original error on failure (after recording it)
   */
  async execute<T>(fn: () => Promise<T>): Promise<T> {
    this.totalRequests++;

    const currentState = this.getState();

    if (currentState === 'open') {
      this.rejectedCount++;
      this.emitEvent({
        type: 'request-rejected',
        domain: this.domain,
        timestamp: Date.now(),
        metadata: { retryAfterMs: this.getTimeUntilTransition() },
      });
      throw new DomainCircuitOpenError(
        this.domain,
        this.getTimeUntilTransition()
      );
    }

    try {
      const result = await fn();
      this.recordSuccess();
      return result;
    } catch (error) {
      this.recordFailure(
        toError(error)
      );
      throw error;
    }
  }

  /**
   * Record a successful domain operation.
   * In half-open state, consecutive successes eventually close the circuit.
   */
  recordSuccess(): void {
    this.totalSuccesses++;
    this.lastSuccessTime = Date.now();

    const currentState = this.getState();

    if (currentState === 'half-open') {
      this.halfOpenSuccesses++;
      console.log(
        `[DomainCircuitBreaker:${this.domain}] Half-open success ` +
        `${this.halfOpenSuccesses}/${this.config.halfOpenSuccessThreshold}`
      );
      if (this.halfOpenSuccesses >= this.config.halfOpenSuccessThreshold) {
        this.transitionTo('closed');
      }
    }
  }

  /**
   * Record a failed domain operation.
   * In closed state, accumulates failures; in half-open, immediately re-opens.
   */
  recordFailure(error: Error): void {
    this.totalFailures++;
    this.lastFailureTime = Date.now();

    this.failures.push({
      timestamp: Date.now(),
      message: error.message,
    });

    // Remove failures outside the sliding window
    this.cleanOldFailures();

    const currentState = this.getState();

    if (currentState === 'half-open') {
      // Any failure in half-open immediately re-opens
      console.log(
        `[DomainCircuitBreaker:${this.domain}] Failure in half-open state, re-opening`
      );
      this.transitionTo('open');
      return;
    }

    // In closed state, check if we exceeded the threshold
    if (
      currentState === 'closed' &&
      this.failures.length >= this.config.failureThreshold
    ) {
      console.log(
        `[DomainCircuitBreaker:${this.domain}] Failure threshold reached ` +
        `(${this.failures.length}/${this.config.failureThreshold}), opening circuit`
      );
      this.transitionTo('open');
    }
  }

  /**
   * Get the current state, checking for automatic time-based transitions.
   * If the circuit is open and the reset timeout has elapsed, transitions to half-open.
   */
  getState(): DomainBreakerState {
    if (this.state === 'open' && this.openedAt != null) {
      const elapsed = Date.now() - this.openedAt;
      if (elapsed >= this.config.resetTimeoutMs) {
        this.transitionTo('half-open');
      }
    }
    return this.state;
  }

  /**
   * Get runtime statistics for this domain circuit breaker.
   */
  getStats(): DomainBreakerStats {
    const currentState = this.getState();
    return {
      domain: this.domain,
      state: currentState,
      totalRequests: this.totalRequests,
      successCount: this.totalSuccesses,
      failureCount: this.totalFailures,
      rejectedCount: this.rejectedCount,
      lastFailureTime: this.lastFailureTime,
      lastSuccessTime: this.lastSuccessTime,
      openedAt: this.openedAt,
      timeUntilHalfOpen: currentState === 'open'
        ? this.getTimeUntilTransition()
        : undefined,
      consecutiveSuccesses: this.halfOpenSuccesses,
    };
  }

  /**
   * Manually reset the circuit breaker to the closed state.
   * Clears all failure history and counters.
   */
  reset(): void {
    const previousState = this.state;
    this.state = 'closed';
    this.failures = [];
    this.halfOpenSuccesses = 0;
    this.openedAt = undefined;

    if (previousState !== 'closed') {
      console.log(
        `[DomainCircuitBreaker:${this.domain}] Manually reset from '${previousState}' to 'closed'`
      );
      this.emitEvent({
        type: 'state-change',
        domain: this.domain,
        previousState,
        newState: 'closed',
        timestamp: Date.now(),
        metadata: { trigger: 'manual-reset' },
      });
    }
  }

  /**
   * Force the circuit to open state (for testing or manual intervention).
   */
  forceOpen(): void {
    console.log(
      `[DomainCircuitBreaker:${this.domain}] Force-opening circuit`
    );
    this.transitionTo('open');
  }

  /**
   * Get recent failure messages for diagnostics.
   *
   * @param count - Maximum number of recent failures to return (default: 5)
   * @returns Array of formatted failure messages
   */
  getRecentFailures(count: number = 5): string[] {
    return this.failures
      .slice(-count)
      .map(
        (f) =>
          `[${new Date(f.timestamp).toISOString()}] ${f.message}`
      );
  }

  /**
   * Register a callback for state change events.
   *
   * @param handler - Callback invoked when the breaker state changes
   * @returns Unsubscribe function to remove the handler
   */
  onStateChange(handler: DomainBreakerStateChangeHandler): () => void {
    this.stateChangeHandlers.add(handler);
    return () => {
      this.stateChangeHandlers.delete(handler);
    };
  }

  /**
   * Get the resolved configuration (defaults merged with overrides).
   */
  getConfig(): Readonly<DomainCircuitBreakerConfig> {
    return this.config;
  }

  // --------------------------------------------------------------------------
  // Private Methods
  // --------------------------------------------------------------------------

  /**
   * Transition to a new state, updating internal bookkeeping and emitting events.
   */
  private transitionTo(newState: DomainBreakerState): void {
    const oldState = this.state;

    if (oldState === newState) {
      return;
    }

    this.state = newState;

    switch (newState) {
      case 'open':
        this.openedAt = Date.now();
        this.halfOpenSuccesses = 0;
        break;
      case 'half-open':
        this.halfOpenSuccesses = 0;
        console.log(
          `[DomainCircuitBreaker:${this.domain}] Transitioning to half-open, ` +
          `allowing probe requests`
        );
        break;
      case 'closed':
        this.failures = [];
        this.openedAt = undefined;
        this.halfOpenSuccesses = 0;
        console.log(
          `[DomainCircuitBreaker:${this.domain}] Circuit closed, domain is healthy`
        );
        break;
    }

    this.emitEvent({
      type: 'state-change',
      domain: this.domain,
      previousState: oldState,
      newState,
      timestamp: Date.now(),
    });
  }

  /**
   * Remove failure records that fall outside the sliding window.
   */
  private cleanOldFailures(): void {
    const cutoff = Date.now() - this.config.failureWindowMs;
    this.failures = this.failures.filter((f) => f.timestamp > cutoff);
  }

  /**
   * Calculate time remaining until the next automatic state transition.
   * Only meaningful when the circuit is open.
   */
  private getTimeUntilTransition(): number | undefined {
    if (this.state === 'open' && this.openedAt != null) {
      const elapsed = Date.now() - this.openedAt;
      const remaining = this.config.resetTimeoutMs - elapsed;
      return Math.max(0, remaining);
    }
    return undefined;
  }

  /**
   * Emit an event to all registered state change handlers.
   */
  private emitEvent(event: DomainBreakerEvent): void {
    for (const handler of this.stateChangeHandlers) {
      try {
        handler(event);
      } catch (err) {
        console.log(
          `[DomainCircuitBreaker:${this.domain}] State change handler error: ` +
          `${toErrorMessage(err)}`
        );
      }
    }
  }
}
