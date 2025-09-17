/**
 * Resilience Patterns for Agentic QE Framework
 * Inspired by Claude Flow's circuit breaker implementation
 * Provides circuit breaker, bulkhead, and rate limiting patterns
 */

import { EventEmitter } from 'events';

// === CIRCUIT BREAKER PATTERN ===

export interface CircuitBreakerConfig {
  failureThreshold: number; // Number of failures before opening
  successThreshold: number; // Number of successes before closing
  timeout: number; // Time in ms before attempting to close
  halfOpenLimit: number; // Max requests in half-open state
}

export enum CircuitState {
  CLOSED = 'closed',
  OPEN = 'open',
  HALF_OPEN = 'half-open'
}

export interface CircuitBreakerMetrics {
  state: CircuitState;
  failures: number;
  successes: number;
  lastFailureTime?: Date;
  lastSuccessTime?: Date;
  totalRequests: number;
  rejectedRequests: number;
  halfOpenRequests: number;
}

/**
 * Circuit breaker for protecting against cascading failures
 */
export class CircuitBreaker extends EventEmitter {
  private state: CircuitState = CircuitState.CLOSED;
  private failures = 0;
  private successes = 0;
  private lastFailureTime?: Date;
  private lastSuccessTime?: Date;
  private nextAttempt?: Date;
  private halfOpenRequests = 0;
  private totalRequests = 0;
  private rejectedRequests = 0;

  constructor(
    private name: string,
    private config: CircuitBreakerConfig
  ) {
    super();
  }

  /**
   * Execute a function with circuit breaker protection
   */
  async execute<T>(fn: () => Promise<T>): Promise<T> {
    this.totalRequests++;

    // Check if we should execute
    if (!this.canExecute()) {
      this.rejectedRequests++;
      const error = new Error(`Circuit breaker '${this.name}' is OPEN`);
      this.logStateChange('Request rejected');
      throw error;
    }

    try {
      // Execute the function
      const result = await fn();

      // Record success
      this.onSuccess();

      return result;
    } catch (error) {
      // Record failure
      this.onFailure();

      throw error;
    }
  }

  /**
   * Check if execution is allowed
   */
  private canExecute(): boolean {
    switch (this.state) {
      case CircuitState.CLOSED:
        return true;

      case CircuitState.OPEN:
        // Check if we should transition to half-open
        if (this.nextAttempt && new Date() >= this.nextAttempt) {
          this.transitionTo(CircuitState.HALF_OPEN);
          return true;
        }
        return false;

      case CircuitState.HALF_OPEN:
        // Allow limited requests in half-open state
        return this.halfOpenRequests < this.config.halfOpenLimit;

      default:
        return false;
    }
  }

  /**
   * Handle successful execution
   */
  private onSuccess(): void {
    this.lastSuccessTime = new Date();

    switch (this.state) {
      case CircuitState.CLOSED:
        this.failures = 0; // Reset failure count
        break;

      case CircuitState.HALF_OPEN:
        this.successes++;
        this.halfOpenRequests++;

        // Check if we should close the circuit
        if (this.successes >= this.config.successThreshold) {
          this.transitionTo(CircuitState.CLOSED);
        }
        break;

      case CircuitState.OPEN:
        // Shouldn't happen, but handle gracefully
        this.transitionTo(CircuitState.HALF_OPEN);
        break;
    }
  }

  /**
   * Handle failed execution
   */
  private onFailure(): void {
    this.lastFailureTime = new Date();

    switch (this.state) {
      case CircuitState.CLOSED:
        this.failures++;

        // Check if we should open the circuit
        if (this.failures >= this.config.failureThreshold) {
          this.transitionTo(CircuitState.OPEN);
        }
        break;

      case CircuitState.HALF_OPEN:
        // Single failure in half-open state reopens the circuit
        this.transitionTo(CircuitState.OPEN);
        break;

      case CircuitState.OPEN:
        // Already open, update next attempt time
        this.nextAttempt = new Date(Date.now() + this.config.timeout);
        break;
    }
  }

  /**
   * Transition to a new state
   */
  private transitionTo(newState: CircuitState): void {
    const oldState = this.state;
    this.state = newState;

    console.log(`Circuit breaker '${this.name}' state change`, {
      from: oldState,
      to: newState,
      failures: this.failures,
      successes: this.successes
    });

    // Reset counters based on new state
    switch (newState) {
      case CircuitState.CLOSED:
        this.failures = 0;
        this.successes = 0;
        this.halfOpenRequests = 0;
        delete this.nextAttempt;
        break;

      case CircuitState.OPEN:
        this.successes = 0;
        this.halfOpenRequests = 0;
        this.nextAttempt = new Date(Date.now() + this.config.timeout);
        break;

      case CircuitState.HALF_OPEN:
        this.successes = 0;
        this.failures = 0;
        this.halfOpenRequests = 0;
        break;
    }

    this.emit('state-change', {
      name: this.name,
      from: oldState,
      to: newState,
      metrics: this.getMetrics()
    });
  }

  /**
   * Force the circuit to a specific state
   */
  forceState(state: CircuitState): void {
    console.warn(`Forcing circuit breaker '${this.name}' to state`, { state });
    this.transitionTo(state);
  }

  /**
   * Get current state
   */
  getState(): CircuitState {
    return this.state;
  }

  /**
   * Get circuit breaker metrics
   */
  getMetrics(): CircuitBreakerMetrics {
    const metrics: CircuitBreakerMetrics = {
      state: this.state,
      failures: this.failures,
      successes: this.successes,
      totalRequests: this.totalRequests,
      rejectedRequests: this.rejectedRequests,
      halfOpenRequests: this.halfOpenRequests
    };

    if (this.lastFailureTime) {
      metrics.lastFailureTime = this.lastFailureTime;
    }

    if (this.lastSuccessTime) {
      metrics.lastSuccessTime = this.lastSuccessTime;
    }

    return metrics;
  }

  /**
   * Reset the circuit breaker
   */
  reset(): void {
    console.log(`Resetting circuit breaker '${this.name}'`);
    this.state = CircuitState.CLOSED;
    this.failures = 0;
    this.successes = 0;
    delete this.lastFailureTime;
    delete this.lastSuccessTime;
    delete this.nextAttempt;
    this.halfOpenRequests = 0;
    this.totalRequests = 0;
    this.rejectedRequests = 0;
  }

  /**
   * Log state change with consistent format
   */
  private logStateChange(message: string): void {
    console.debug(`Circuit breaker '${this.name}': ${message}`, {
      state: this.state,
      failures: this.failures,
      successes: this.successes,
      nextAttempt: this.nextAttempt
    });
  }
}

// === BULKHEAD PATTERN ===

export interface BulkheadConfig {
  maxConcurrent: number; // Maximum concurrent operations
  maxQueueSize: number; // Maximum queue size
  queueTimeout: number; // Timeout for queued operations (ms)
}

export interface BulkheadMetrics {
  activeCount: number;
  queueSize: number;
  totalAccepted: number;
  totalRejected: number;
  totalCompleted: number;
  totalFailed: number;
}

interface QueuedOperation<T> {
  id: string;
  execute: () => Promise<T>;
  resolve: (value: T) => void;
  reject: (error: any) => void;
  timestamp: number;
}

/**
 * Bulkhead pattern for isolating resources and preventing resource exhaustion
 */
export class Bulkhead extends EventEmitter {
  private activeOperations = new Set<string>();
  private queue: QueuedOperation<any>[] = [];
  private metrics: BulkheadMetrics;

  constructor(
    private name: string,
    private config: BulkheadConfig
  ) {
    super();
    this.metrics = {
      activeCount: 0,
      queueSize: 0,
      totalAccepted: 0,
      totalRejected: 0,
      totalCompleted: 0,
      totalFailed: 0
    };
  }

  /**
   * Execute an operation with bulkhead isolation
   */
  async execute<T>(fn: () => Promise<T>): Promise<T> {
    // Check if we can execute immediately
    if (this.activeOperations.size < this.config.maxConcurrent) {
      return this.executeOperation(fn);
    }

    // Check if we can queue
    if (this.queue.length >= this.config.maxQueueSize) {
      this.metrics.totalRejected++;
      this.emit('rejected', {
        name: this.name,
        reason: 'Queue full',
        metrics: this.getMetrics()
      });
      throw new Error(`Bulkhead '${this.name}' queue is full`);
    }

    // Queue the operation
    return this.queueOperation(fn);
  }

  /**
   * Execute operation immediately
   */
  private async executeOperation<T>(fn: () => Promise<T>): Promise<T> {
    const operationId = this.generateId();
    this.activeOperations.add(operationId);
    this.metrics.activeCount = this.activeOperations.size;
    this.metrics.totalAccepted++;

    this.emit('operation-started', {
      name: this.name,
      operationId,
      metrics: this.getMetrics()
    });

    try {
      const result = await fn();
      this.metrics.totalCompleted++;
      return result;
    } catch (error) {
      this.metrics.totalFailed++;
      throw error;
    } finally {
      this.activeOperations.delete(operationId);
      this.metrics.activeCount = this.activeOperations.size;

      this.emit('operation-completed', {
        name: this.name,
        operationId,
        metrics: this.getMetrics()
      });

      // Process next queued operation
      this.processQueue();
    }
  }

  /**
   * Queue an operation for later execution
   */
  private queueOperation<T>(fn: () => Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const operation: QueuedOperation<T> = {
        id: this.generateId(),
        execute: fn,
        resolve,
        reject,
        timestamp: Date.now()
      };

      this.queue.push(operation);
      this.metrics.queueSize = this.queue.length;

      this.emit('operation-queued', {
        name: this.name,
        operationId: operation.id,
        queueSize: this.queue.length,
        metrics: this.getMetrics()
      });

      // Set timeout for queued operation
      setTimeout(() => {
        const index = this.queue.findIndex(op => op.id === operation.id);
        if (index !== -1) {
          this.queue.splice(index, 1);
          this.metrics.queueSize = this.queue.length;
          this.metrics.totalRejected++;
          reject(new Error(`Operation timed out in queue for bulkhead '${this.name}'`));
        }
      }, this.config.queueTimeout);
    });
  }

  /**
   * Process queued operations
   */
  private processQueue(): void {
    while (
      this.activeOperations.size < this.config.maxConcurrent &&
      this.queue.length > 0
    ) {
      const operation = this.queue.shift();
      if (operation) {
        this.metrics.queueSize = this.queue.length;

        // Check if operation has timed out
        if (Date.now() - operation.timestamp > this.config.queueTimeout) {
          this.metrics.totalRejected++;
          operation.reject(new Error('Operation timed out in queue'));
          continue;
        }

        // Execute the queued operation
        this.executeOperation(operation.execute)
          .then(operation.resolve)
          .catch(operation.reject);
      }
    }
  }

  /**
   * Get current metrics
   */
  getMetrics(): BulkheadMetrics {
    return { ...this.metrics };
  }

  /**
   * Reset the bulkhead
   */
  reset(): void {
    // Reject all queued operations
    while (this.queue.length > 0) {
      const operation = this.queue.shift();
      if (operation) {
        operation.reject(new Error('Bulkhead reset'));
      }
    }

    this.activeOperations.clear();
    this.metrics = {
      activeCount: 0,
      queueSize: 0,
      totalAccepted: 0,
      totalRejected: 0,
      totalCompleted: 0,
      totalFailed: 0
    };

    this.emit('reset', { name: this.name });
  }

  private generateId(): string {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }
}

// === RATE LIMITER PATTERN ===

export interface RateLimiterConfig {
  maxRequests: number; // Maximum requests
  windowMs: number; // Time window in milliseconds
  strategy: 'sliding' | 'fixed'; // Window strategy
}

export interface RateLimiterMetrics {
  currentRequests: number;
  totalAccepted: number;
  totalRejected: number;
  windowStart: Date;
  windowEnd: Date;
}

/**
 * Rate limiter for controlling request throughput
 */
export class RateLimiter extends EventEmitter {
  private requests: number[] = []; // Timestamps of requests
  private metrics: RateLimiterMetrics;
  private windowStart: number;

  constructor(
    private name: string,
    private config: RateLimiterConfig
  ) {
    super();
    this.windowStart = Date.now();
    this.metrics = {
      currentRequests: 0,
      totalAccepted: 0,
      totalRejected: 0,
      windowStart: new Date(this.windowStart),
      windowEnd: new Date(this.windowStart + this.config.windowMs)
    };
  }

  /**
   * Check if request is allowed and record it
   */
  async execute<T>(fn: () => Promise<T>): Promise<T> {
    const now = Date.now();

    if (this.config.strategy === 'sliding') {
      this.cleanupSlidingWindow(now);
    } else {
      this.checkFixedWindow(now);
    }

    // Check if we're within rate limit
    if (this.requests.length >= this.config.maxRequests) {
      this.metrics.totalRejected++;
      this.emit('rate-limited', {
        name: this.name,
        metrics: this.getMetrics()
      });
      throw new Error(`Rate limit exceeded for '${this.name}'`);
    }

    // Record request
    this.requests.push(now);
    this.metrics.currentRequests = this.requests.length;
    this.metrics.totalAccepted++;

    this.emit('request-accepted', {
      name: this.name,
      metrics: this.getMetrics()
    });

    // Execute the function
    try {
      return await fn();
    } catch (error) {
      throw error;
    }
  }

  /**
   * Clean up old requests in sliding window
   */
  private cleanupSlidingWindow(now: number): void {
    const cutoff = now - this.config.windowMs;
    this.requests = this.requests.filter(timestamp => timestamp > cutoff);
    this.metrics.currentRequests = this.requests.length;
    this.metrics.windowStart = new Date(cutoff);
    this.metrics.windowEnd = new Date(now);
  }

  /**
   * Check and reset fixed window
   */
  private checkFixedWindow(now: number): void {
    if (now - this.windowStart >= this.config.windowMs) {
      // Reset window
      this.windowStart = now;
      this.requests = [];
      this.metrics.currentRequests = 0;
      this.metrics.windowStart = new Date(now);
      this.metrics.windowEnd = new Date(now + this.config.windowMs);
    }
  }

  /**
   * Get current metrics
   */
  getMetrics(): RateLimiterMetrics {
    return { ...this.metrics };
  }

  /**
   * Reset the rate limiter
   */
  reset(): void {
    this.requests = [];
    this.windowStart = Date.now();
    this.metrics = {
      currentRequests: 0,
      totalAccepted: 0,
      totalRejected: 0,
      windowStart: new Date(this.windowStart),
      windowEnd: new Date(this.windowStart + this.config.windowMs)
    };

    this.emit('reset', { name: this.name });
  }
}

// === RESILIENCE MANAGER ===

/**
 * Manager for all resilience patterns
 */
export class ResilienceManager extends EventEmitter {
  private circuitBreakers = new Map<string, CircuitBreaker>();
  private bulkheads = new Map<string, Bulkhead>();
  private rateLimiters = new Map<string, RateLimiter>();

  constructor() {
    super();
  }

  /**
   * Create or get a circuit breaker
   */
  getCircuitBreaker(name: string, config?: Partial<CircuitBreakerConfig>): CircuitBreaker {
    let breaker = this.circuitBreakers.get(name);

    if (!breaker) {
      const finalConfig: CircuitBreakerConfig = {
        failureThreshold: 5,
        successThreshold: 3,
        timeout: 60000,
        halfOpenLimit: 1,
        ...config
      };

      breaker = new CircuitBreaker(name, finalConfig);
      this.circuitBreakers.set(name, breaker);

      // Forward events
      breaker.on('state-change', data => {
        this.emit('circuit-breaker:state-change', data);
      });
    }

    return breaker;
  }

  /**
   * Create or get a bulkhead
   */
  getBulkhead(name: string, config?: Partial<BulkheadConfig>): Bulkhead {
    let bulkhead = this.bulkheads.get(name);

    if (!bulkhead) {
      const finalConfig: BulkheadConfig = {
        maxConcurrent: 10,
        maxQueueSize: 100,
        queueTimeout: 30000,
        ...config
      };

      bulkhead = new Bulkhead(name, finalConfig);
      this.bulkheads.set(name, bulkhead);

      // Forward events
      bulkhead.on('rejected', data => {
        this.emit('bulkhead:rejected', data);
      });
    }

    return bulkhead;
  }

  /**
   * Create or get a rate limiter
   */
  getRateLimiter(name: string, config?: Partial<RateLimiterConfig>): RateLimiter {
    let rateLimiter = this.rateLimiters.get(name);

    if (!rateLimiter) {
      const finalConfig: RateLimiterConfig = {
        maxRequests: 100,
        windowMs: 60000,
        strategy: 'sliding',
        ...config
      };

      rateLimiter = new RateLimiter(name, finalConfig);
      this.rateLimiters.set(name, rateLimiter);

      // Forward events
      rateLimiter.on('rate-limited', data => {
        this.emit('rate-limiter:limited', data);
      });
    }

    return rateLimiter;
  }

  /**
   * Execute with combined resilience patterns
   */
  async executeWithResilience<T>(
    name: string,
    fn: () => Promise<T>,
    options?: {
      circuitBreaker?: Partial<CircuitBreakerConfig>;
      bulkhead?: Partial<BulkheadConfig>;
      rateLimiter?: Partial<RateLimiterConfig>;
    }
  ): Promise<T> {
    // Apply rate limiting first
    if (options?.rateLimiter) {
      const rateLimiter = this.getRateLimiter(`${name}-rate`, options.rateLimiter);
      await rateLimiter.execute(async () => undefined);
    }

    // Apply bulkhead isolation
    let executor = fn;
    if (options?.bulkhead) {
      const bulkhead = this.getBulkhead(`${name}-bulkhead`, options.bulkhead);
      const originalExecutor = executor;
      executor = () => bulkhead.execute(originalExecutor);
    }

    // Apply circuit breaker
    if (options?.circuitBreaker) {
      const breaker = this.getCircuitBreaker(`${name}-circuit`, options.circuitBreaker);
      return breaker.execute(executor);
    }

    return executor();
  }

  /**
   * Get metrics for all patterns
   */
  getAllMetrics(): {
    circuitBreakers: Map<string, CircuitBreakerMetrics>;
    bulkheads: Map<string, BulkheadMetrics>;
    rateLimiters: Map<string, RateLimiterMetrics>;
  } {
    const circuitBreakerMetrics = new Map<string, CircuitBreakerMetrics>();
    for (const [name, breaker] of this.circuitBreakers) {
      circuitBreakerMetrics.set(name, breaker.getMetrics());
    }

    const bulkheadMetrics = new Map<string, BulkheadMetrics>();
    for (const [name, bulkhead] of this.bulkheads) {
      bulkheadMetrics.set(name, bulkhead.getMetrics());
    }

    const rateLimiterMetrics = new Map<string, RateLimiterMetrics>();
    for (const [name, limiter] of this.rateLimiters) {
      rateLimiterMetrics.set(name, limiter.getMetrics());
    }

    return {
      circuitBreakers: circuitBreakerMetrics,
      bulkheads: bulkheadMetrics,
      rateLimiters: rateLimiterMetrics
    };
  }

  /**
   * Reset all patterns
   */
  resetAll(): void {
    for (const breaker of this.circuitBreakers.values()) {
      breaker.reset();
    }

    for (const bulkhead of this.bulkheads.values()) {
      bulkhead.reset();
    }

    for (const limiter of this.rateLimiters.values()) {
      limiter.reset();
    }

    this.emit('reset-all');
  }

  /**
   * Reset a specific pattern
   */
  reset(type: 'circuit' | 'bulkhead' | 'rate', name: string): void {
    switch (type) {
      case 'circuit':
        this.circuitBreakers.get(name)?.reset();
        break;
      case 'bulkhead':
        this.bulkheads.get(name)?.reset();
        break;
      case 'rate':
        this.rateLimiters.get(name)?.reset();
        break;
    }
  }
}

export default ResilienceManager;