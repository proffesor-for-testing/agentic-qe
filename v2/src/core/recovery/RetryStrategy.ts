/**
 * Retry Strategy with Multiple Backoff Algorithms
 * Provides configurable retry logic for transient failures
 */

import { createSeededRandom, SeededRandom } from '../../utils/SeededRandom';

/**
 * Backoff strategy types
 */
export type BackoffType = 'exponential' | 'linear' | 'constant' | 'fibonacci' | 'decorrelated-jitter';

/**
 * Retry configuration
 */
export interface RetryConfig {
  /** Maximum number of retry attempts */
  maxAttempts: number;
  /** Initial delay in milliseconds */
  initialDelay: number;
  /** Maximum delay in milliseconds */
  maxDelay: number;
  /** Backoff strategy */
  backoffType: BackoffType;
  /** Multiplier for exponential backoff */
  multiplier: number;
  /** Add randomization to delays */
  jitter: boolean;
  /** Jitter factor (0-1) */
  jitterFactor: number;
  /** Errors that should trigger retry */
  retryableErrors?: string[];
  /** Errors that should NOT trigger retry */
  nonRetryableErrors?: string[];
  /** Custom function to determine if error is retryable */
  isRetryable?: (error: Error) => boolean;
  /** Callback on each retry attempt */
  onRetry?: (attempt: number, error: Error, delay: number) => void;
}

/**
 * Retry result with metadata
 */
export interface RetryResult<T> {
  success: boolean;
  result?: T;
  error?: Error;
  attempts: number;
  totalDelay: number;
  retryHistory: { attempt: number; delay: number; error: string }[];
}

/**
 * Retry context for tracking state
 */
export interface RetryContext {
  attempt: number;
  totalAttempts: number;
  lastDelay: number;
  totalDelay: number;
  startTime: number;
  errors: Error[];
}

/**
 * Default retryable error patterns (transient failures)
 */
const DEFAULT_RETRYABLE_PATTERNS = [
  'ECONNRESET',
  'ECONNREFUSED',
  'ETIMEDOUT',
  'ENOTFOUND',
  'EAI_AGAIN',
  'ENETUNREACH',
  'EHOSTUNREACH',
  'timeout',
  'rate limit',
  'too many requests',
  '429',
  '502',
  '503',
  '504',
];

/**
 * Default non-retryable error patterns (permanent failures)
 */
const DEFAULT_NON_RETRYABLE_PATTERNS = [
  '400',
  '401',
  '403',
  '404',
  '405',
  '422',
  'validation',
  'invalid',
  'unauthorized',
  'forbidden',
  'not found',
];

/**
 * Retry Strategy Implementation
 */
export class RetryStrategy {
  private config: RetryConfig;
  private fibonacciCache: number[] = [1, 1];
  private rng: SeededRandom;

  constructor(config: Partial<RetryConfig> = {}, seed?: number) {
    this.config = {
      maxAttempts: 3,
      initialDelay: 1000,
      maxDelay: 30000,
      backoffType: 'exponential',
      multiplier: 2,
      jitter: true,
      jitterFactor: 0.25,
      retryableErrors: DEFAULT_RETRYABLE_PATTERNS,
      nonRetryableErrors: DEFAULT_NON_RETRYABLE_PATTERNS,
      ...config,
    };
    // Use provided seed or time-based seed for production randomness
    this.rng = createSeededRandom(seed ?? Date.now());
  }

  /**
   * Execute operation with retry logic
   */
  async execute<T>(operation: () => Promise<T>): Promise<RetryResult<T>> {
    const context: RetryContext = {
      attempt: 0,
      totalAttempts: this.config.maxAttempts,
      lastDelay: 0,
      totalDelay: 0,
      startTime: Date.now(),
      errors: [],
    };

    const retryHistory: { attempt: number; delay: number; error: string }[] = [];

    while (context.attempt < this.config.maxAttempts) {
      context.attempt++;

      try {
        const result = await operation();
        return {
          success: true,
          result,
          attempts: context.attempt,
          totalDelay: context.totalDelay,
          retryHistory,
        };
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        context.errors.push(err);

        // Check if we should retry
        if (!this.shouldRetry(err, context)) {
          return {
            success: false,
            error: err,
            attempts: context.attempt,
            totalDelay: context.totalDelay,
            retryHistory,
          };
        }

        // Check if we've exhausted attempts
        if (context.attempt >= this.config.maxAttempts) {
          return {
            success: false,
            error: err,
            attempts: context.attempt,
            totalDelay: context.totalDelay,
            retryHistory,
          };
        }

        // Calculate delay
        const delay = this.calculateDelay(context);
        context.lastDelay = delay;
        context.totalDelay += delay;

        retryHistory.push({
          attempt: context.attempt,
          delay,
          error: err.message,
        });

        // Notify callback
        if (this.config.onRetry) {
          this.config.onRetry(context.attempt, err, delay);
        }

        // Wait before retry
        await this.sleep(delay);
      }
    }

    // Should not reach here, but just in case
    return {
      success: false,
      error: context.errors[context.errors.length - 1],
      attempts: context.attempt,
      totalDelay: context.totalDelay,
      retryHistory,
    };
  }

  /**
   * Determine if error is retryable
   */
  shouldRetry(error: Error, context: RetryContext): boolean {
    // Check custom function first
    if (this.config.isRetryable) {
      return this.config.isRetryable(error);
    }

    const errorStr = error.message.toLowerCase();

    // Check non-retryable patterns (takes precedence)
    if (this.config.nonRetryableErrors) {
      for (const pattern of this.config.nonRetryableErrors) {
        if (errorStr.includes(pattern.toLowerCase())) {
          return false;
        }
      }
    }

    // Check retryable patterns
    if (this.config.retryableErrors) {
      for (const pattern of this.config.retryableErrors) {
        if (errorStr.includes(pattern.toLowerCase())) {
          return true;
        }
      }
    }

    // Default to retrying for unknown errors (safer for transient issues)
    return true;
  }

  /**
   * Calculate delay for next retry attempt
   */
  calculateDelay(context: RetryContext): number {
    let delay: number;

    switch (this.config.backoffType) {
      case 'constant':
        delay = this.config.initialDelay;
        break;

      case 'linear':
        delay = this.config.initialDelay * context.attempt;
        break;

      case 'exponential':
        delay = this.config.initialDelay * Math.pow(this.config.multiplier, context.attempt - 1);
        break;

      case 'fibonacci':
        delay = this.config.initialDelay * this.getFibonacci(context.attempt);
        break;

      case 'decorrelated-jitter':
        // AWS-style decorrelated jitter
        const prevDelay = context.lastDelay || this.config.initialDelay;
        delay = Math.min(
          this.config.maxDelay,
          this.randomBetween(this.config.initialDelay, prevDelay * 3)
        );
        break;

      default:
        delay = this.config.initialDelay;
    }

    // Apply max delay cap
    delay = Math.min(delay, this.config.maxDelay);

    // Apply jitter if enabled (except for decorrelated-jitter which has built-in randomization)
    if (this.config.jitter && this.config.backoffType !== 'decorrelated-jitter') {
      delay = this.applyJitter(delay);
    }

    return Math.round(delay);
  }

  /**
   * Apply jitter to delay
   */
  private applyJitter(delay: number): number {
    const jitterRange = delay * this.config.jitterFactor;
    const jitter = this.randomBetween(-jitterRange, jitterRange);
    return Math.max(0, delay + jitter);
  }

  /**
   * Get fibonacci number (cached for performance)
   */
  private getFibonacci(n: number): number {
    while (this.fibonacciCache.length <= n) {
      const len = this.fibonacciCache.length;
      this.fibonacciCache.push(this.fibonacciCache[len - 1] + this.fibonacciCache[len - 2]);
    }
    return this.fibonacciCache[n - 1];
  }

  /**
   * Random number between min and max
   */
  private randomBetween(min: number, max: number): number {
    return min + this.rng.random() * (max - min);
  }

  /**
   * Sleep for specified milliseconds
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Get current configuration
   */
  getConfig(): RetryConfig {
    return { ...this.config };
  }
}

/**
 * Retry decorator for async functions
 */
export function withRetry<T>(
  operation: () => Promise<T>,
  config?: Partial<RetryConfig>
): Promise<T> {
  const strategy = new RetryStrategy(config);
  return strategy.execute(operation).then(result => {
    if (result.success) {
      return result.result!;
    }
    throw result.error;
  });
}

/**
 * Create a retryable wrapper for a function
 */
export function createRetryable<TArgs extends any[], TResult>(
  fn: (...args: TArgs) => Promise<TResult>,
  config?: Partial<RetryConfig>
): (...args: TArgs) => Promise<RetryResult<TResult>> {
  const strategy = new RetryStrategy(config);
  return (...args: TArgs) => strategy.execute(() => fn(...args));
}

/**
 * Predefined retry strategies for common use cases
 */
export const RetryStrategies = {
  /** Fast retry for quick transient failures */
  fast: new RetryStrategy({
    maxAttempts: 3,
    initialDelay: 100,
    maxDelay: 1000,
    backoffType: 'exponential',
    multiplier: 2,
  }),

  /** Standard retry for most operations */
  standard: new RetryStrategy({
    maxAttempts: 5,
    initialDelay: 1000,
    maxDelay: 30000,
    backoffType: 'exponential',
    multiplier: 2,
    jitter: true,
  }),

  /** Aggressive retry for critical operations */
  aggressive: new RetryStrategy({
    maxAttempts: 10,
    initialDelay: 500,
    maxDelay: 60000,
    backoffType: 'decorrelated-jitter',
    jitter: true,
  }),

  /** Gentle retry for rate-limited APIs */
  rateLimited: new RetryStrategy({
    maxAttempts: 5,
    initialDelay: 5000,
    maxDelay: 120000,
    backoffType: 'fibonacci',
    jitter: true,
  }),

  /** Database retry for connection issues */
  database: new RetryStrategy({
    maxAttempts: 3,
    initialDelay: 500,
    maxDelay: 5000,
    backoffType: 'exponential',
    multiplier: 1.5,
    jitter: true,
    retryableErrors: ['SQLITE_BUSY', 'SQLITE_LOCKED', 'connection', 'timeout'],
  }),

  /** Network retry for HTTP calls */
  network: new RetryStrategy({
    maxAttempts: 4,
    initialDelay: 1000,
    maxDelay: 15000,
    backoffType: 'exponential',
    multiplier: 2,
    jitter: true,
  }),
};
