/**
 * Agentic QE v3 - MCP Security: Rate Limiter
 * Token bucket algorithm implementation (ADR-012)
 *
 * Features:
 * - Token bucket rate limiting (100 req/s, 200 burst)
 * - Per-client and global rate limiting
 * - Sliding window for smooth rate limiting
 * - Configurable limits per endpoint
 */

// ============================================================================
// Types and Interfaces
// ============================================================================

/**
 * Rate limiter configuration
 */
export interface RateLimiterConfig {
  /** Tokens per second (refill rate) */
  tokensPerSecond: number;
  /** Maximum burst capacity */
  maxBurst: number;
  /** Enable per-client limiting */
  perClient?: boolean;
  /** Cleanup interval in ms for expired buckets */
  cleanupInterval?: number;
  /** Maximum age for inactive buckets in ms */
  maxBucketAge?: number;
}

/**
 * Token bucket state
 */
export interface TokenBucket {
  /** Current token count */
  tokens: number;
  /** Last update timestamp */
  lastUpdate: number;
  /** Total requests made */
  totalRequests: number;
  /** Requests in current window */
  windowRequests: number;
  /** Window start time */
  windowStart: number;
}

/**
 * Rate limit result
 */
export interface RateLimitResult {
  /** Whether the request is allowed */
  allowed: boolean;
  /** Remaining tokens */
  remaining: number;
  /** Time until next token in ms */
  retryAfter?: number;
  /** Current request rate */
  currentRate?: number;
  /** Limit info for headers */
  headers: RateLimitHeaders;
}

/**
 * Rate limit headers for HTTP responses
 */
export interface RateLimitHeaders {
  'X-RateLimit-Limit': number;
  'X-RateLimit-Remaining': number;
  'X-RateLimit-Reset': number;
  'Retry-After'?: number;
}

/**
 * Rate limiter statistics
 */
export interface RateLimiterStats {
  totalRequests: number;
  allowedRequests: number;
  deniedRequests: number;
  activeBuckets: number;
  averageTokens: number;
}

/**
 * Endpoint-specific rate limit configuration
 */
export interface EndpointRateLimit {
  pattern: RegExp | string;
  tokensPerSecond: number;
  maxBurst: number;
}

// ============================================================================
// Token Bucket Implementation
// ============================================================================

/**
 * Token Bucket Rate Limiter
 * Implements the token bucket algorithm for rate limiting
 */
export class RateLimiter {
  private readonly config: Required<RateLimiterConfig>;
  private readonly globalBucket: TokenBucket;
  private readonly clientBuckets: Map<string, TokenBucket>;
  private readonly endpointLimits: EndpointRateLimit[];
  private cleanupTimer: ReturnType<typeof setInterval> | null = null;
  private stats: RateLimiterStats;

  constructor(config: RateLimiterConfig) {
    this.config = {
      tokensPerSecond: config.tokensPerSecond || 100,
      maxBurst: config.maxBurst || 200,
      perClient: config.perClient ?? true,
      cleanupInterval: config.cleanupInterval || 60000, // 1 minute
      maxBucketAge: config.maxBucketAge || 300000, // 5 minutes
    };

    this.globalBucket = this.createBucket();
    this.clientBuckets = new Map();
    this.endpointLimits = [];
    this.stats = {
      totalRequests: 0,
      allowedRequests: 0,
      deniedRequests: 0,
      activeBuckets: 1,
      averageTokens: this.config.maxBurst,
    };

    // Start cleanup timer
    this.startCleanup();
  }

  /**
   * Check if a request is allowed
   */
  check(clientId?: string, endpoint?: string): RateLimitResult {
    this.stats.totalRequests++;
    const now = Date.now();

    // Get configuration (endpoint-specific or default)
    const { tokensPerSecond, maxBurst } = this.getConfig(endpoint);

    // Get the appropriate bucket (separate buckets for different endpoint limits)
    const bucket = this.getBucket(clientId, tokensPerSecond, maxBurst, endpoint);

    // Refill tokens based on elapsed time
    this.refillBucket(bucket, tokensPerSecond, maxBurst, now);

    // Check if request is allowed
    if (bucket.tokens >= 1) {
      bucket.tokens -= 1;
      bucket.totalRequests++;
      bucket.windowRequests++;
      this.stats.allowedRequests++;

      return {
        allowed: true,
        remaining: Math.floor(bucket.tokens),
        headers: this.buildHeaders(bucket, maxBurst, now),
      };
    }

    // Request denied
    this.stats.deniedRequests++;
    const retryAfter = Math.ceil((1 - bucket.tokens) / tokensPerSecond * 1000);

    return {
      allowed: false,
      remaining: 0,
      retryAfter,
      currentRate: this.calculateRate(bucket, now),
      headers: {
        ...this.buildHeaders(bucket, maxBurst, now),
        'Retry-After': Math.ceil(retryAfter / 1000),
      },
    };
  }

  /**
   * Consume tokens (blocks if not available in sync mode)
   */
  consume(clientId?: string, endpoint?: string, tokens = 1): RateLimitResult {
    this.stats.totalRequests++;
    const now = Date.now();

    // Get configuration (endpoint-specific or default)
    const { tokensPerSecond, maxBurst } = this.getConfig(endpoint);

    // Get the appropriate bucket (separate buckets for different endpoint limits)
    const bucket = this.getBucket(clientId, tokensPerSecond, maxBurst, endpoint);

    // Refill tokens based on elapsed time
    this.refillBucket(bucket, tokensPerSecond, maxBurst, now);

    if (bucket.tokens >= tokens) {
      bucket.tokens -= tokens;
      bucket.totalRequests += tokens;
      bucket.windowRequests += tokens;
      this.stats.allowedRequests++;

      return {
        allowed: true,
        remaining: Math.floor(bucket.tokens),
        headers: this.buildHeaders(bucket, maxBurst, now),
      };
    }

    this.stats.deniedRequests++;
    const retryAfter = Math.ceil((tokens - bucket.tokens) / tokensPerSecond * 1000);
    return {
      allowed: false,
      remaining: Math.floor(bucket.tokens),
      retryAfter,
      headers: {
        ...this.buildHeaders(bucket, maxBurst, now),
        'Retry-After': Math.ceil(retryAfter / 1000),
      },
    };
  }

  /**
   * Wait until tokens are available (async)
   */
  async wait(clientId?: string, endpoint?: string, tokens = 1): Promise<RateLimitResult> {
    let result = this.consume(clientId, endpoint, tokens);

    while (!result.allowed && result.retryAfter) {
      await this.sleep(result.retryAfter);
      result = this.consume(clientId, endpoint, tokens);
    }

    return result;
  }

  /**
   * Add endpoint-specific rate limit
   */
  addEndpointLimit(limit: EndpointRateLimit): void {
    this.endpointLimits.push(limit);
  }

  /**
   * Remove all endpoint limits
   */
  clearEndpointLimits(): void {
    this.endpointLimits.length = 0;
  }

  /**
   * Reset a client's bucket
   */
  resetClient(clientId: string): void {
    this.clientBuckets.delete(clientId);
  }

  /**
   * Reset all buckets
   */
  reset(): void {
    this.clientBuckets.clear();
    Object.assign(this.globalBucket, this.createBucket());
    this.stats = {
      totalRequests: 0,
      allowedRequests: 0,
      deniedRequests: 0,
      activeBuckets: 1,
      averageTokens: this.config.maxBurst,
    };
  }

  /**
   * Get rate limiter statistics
   */
  getStats(): RateLimiterStats {
    // Calculate average tokens
    let totalTokens = this.globalBucket.tokens;
    this.clientBuckets.forEach(bucket => {
      totalTokens += bucket.tokens;
    });

    this.stats.activeBuckets = 1 + this.clientBuckets.size;
    this.stats.averageTokens = totalTokens / this.stats.activeBuckets;

    return { ...this.stats };
  }

  /**
   * Get client-specific statistics
   */
  getClientStats(clientId: string): TokenBucket | null {
    const bucket = this.clientBuckets.get(clientId);
    return bucket ? { ...bucket } : null;
  }

  /**
   * Dispose the rate limiter
   */
  dispose(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
    this.clientBuckets.clear();
  }

  // ============================================================================
  // Private Methods
  // ============================================================================

  private createBucket(): TokenBucket {
    const now = Date.now();
    return {
      tokens: this.config.maxBurst,
      lastUpdate: now,
      totalRequests: 0,
      windowRequests: 0,
      windowStart: now,
    };
  }

  private getBucket(
    clientId: string | undefined,
    tokensPerSecond: number,
    maxBurst: number,
    endpoint?: string
  ): TokenBucket {
    if (!this.config.perClient || !clientId) {
      return this.globalBucket;
    }

    // Create a composite key for client + endpoint-specific limits
    const endpointKey = this.getEndpointKey(endpoint);
    const bucketKey = endpointKey ? `${clientId}:${endpointKey}` : clientId;

    let bucket = this.clientBuckets.get(bucketKey);
    if (!bucket) {
      bucket = {
        tokens: maxBurst,
        lastUpdate: Date.now(),
        totalRequests: 0,
        windowRequests: 0,
        windowStart: Date.now(),
      };
      this.clientBuckets.set(bucketKey, bucket);
    }

    return bucket;
  }

  private getEndpointKey(endpoint?: string): string | null {
    if (!endpoint) return null;

    for (let i = 0; i < this.endpointLimits.length; i++) {
      const limit = this.endpointLimits[i];
      const pattern = typeof limit.pattern === 'string'
        ? new RegExp(limit.pattern)
        : limit.pattern;

      if (pattern.test(endpoint)) {
        return `ep${i}`;
      }
    }

    return null;
  }

  private getConfig(endpoint?: string): { tokensPerSecond: number; maxBurst: number } {
    if (endpoint) {
      for (const limit of this.endpointLimits) {
        const pattern = typeof limit.pattern === 'string'
          ? new RegExp(limit.pattern)
          : limit.pattern;

        if (pattern.test(endpoint)) {
          return {
            tokensPerSecond: limit.tokensPerSecond,
            maxBurst: limit.maxBurst,
          };
        }
      }
    }

    return {
      tokensPerSecond: this.config.tokensPerSecond,
      maxBurst: this.config.maxBurst,
    };
  }

  private refillBucket(
    bucket: TokenBucket,
    tokensPerSecond: number,
    maxBurst: number,
    now: number
  ): void {
    const elapsed = (now - bucket.lastUpdate) / 1000;
    const newTokens = elapsed * tokensPerSecond;

    bucket.tokens = Math.min(maxBurst, bucket.tokens + newTokens);
    bucket.lastUpdate = now;

    // Reset window if over 1 second
    if (now - bucket.windowStart >= 1000) {
      bucket.windowRequests = 0;
      bucket.windowStart = now;
    }
  }

  private buildHeaders(bucket: TokenBucket, maxBurst: number, now: number): RateLimitHeaders {
    return {
      'X-RateLimit-Limit': maxBurst,
      'X-RateLimit-Remaining': Math.floor(bucket.tokens),
      'X-RateLimit-Reset': Math.ceil((now + 1000) / 1000), // Unix timestamp
    };
  }

  private calculateRate(bucket: TokenBucket, now: number): number {
    const elapsed = (now - bucket.windowStart) / 1000;
    if (elapsed < 0.001) return 0;
    return bucket.windowRequests / elapsed;
  }

  private startCleanup(): void {
    this.cleanupTimer = setInterval(() => {
      this.cleanup();
    }, this.config.cleanupInterval);
  }

  private cleanup(): void {
    const now = Date.now();
    const maxAge = this.config.maxBucketAge;

    for (const [clientId, bucket] of this.clientBuckets) {
      if (now - bucket.lastUpdate > maxAge) {
        this.clientBuckets.delete(clientId);
      }
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// ============================================================================
// Sliding Window Rate Limiter
// ============================================================================

/**
 * Sliding window log for more accurate rate limiting
 */
export interface SlidingWindowEntry {
  timestamp: number;
  weight: number;
}

/**
 * Sliding Window Rate Limiter
 * More accurate but uses more memory
 */
export class SlidingWindowRateLimiter {
  private readonly windowMs: number;
  private readonly maxRequests: number;
  private readonly windows: Map<string, SlidingWindowEntry[]>;
  private readonly cleanupInterval: ReturnType<typeof setInterval>;

  constructor(windowMs = 1000, maxRequests = 100) {
    this.windowMs = windowMs;
    this.maxRequests = maxRequests;
    this.windows = new Map();

    // Cleanup old entries every minute
    this.cleanupInterval = setInterval(() => this.cleanup(), 60000);
  }

  check(clientId: string): RateLimitResult {
    const now = Date.now();
    const entries = this.getEntries(clientId);

    // Remove old entries
    const cutoff = now - this.windowMs;
    const validEntries = entries.filter(e => e.timestamp > cutoff);

    // Simple count for this window (no weighting for predictable behavior)
    const count = validEntries.length;
    const remaining = Math.max(0, this.maxRequests - count - 1);

    if (count < this.maxRequests) {
      validEntries.push({ timestamp: now, weight: 1 });
      this.windows.set(clientId, validEntries);

      return {
        allowed: true,
        remaining,
        headers: {
          'X-RateLimit-Limit': this.maxRequests,
          'X-RateLimit-Remaining': remaining,
          'X-RateLimit-Reset': Math.ceil((now + this.windowMs) / 1000),
        },
      };
    }

    const oldestValid = validEntries[0];
    const retryAfter = oldestValid
      ? Math.ceil((oldestValid.timestamp + this.windowMs - now) / 1000)
      : 1;

    return {
      allowed: false,
      remaining: 0,
      retryAfter: retryAfter * 1000,
      headers: {
        'X-RateLimit-Limit': this.maxRequests,
        'X-RateLimit-Remaining': 0,
        'X-RateLimit-Reset': Math.ceil((now + retryAfter * 1000) / 1000),
        'Retry-After': retryAfter,
      },
    };
  }

  reset(clientId?: string): void {
    if (clientId) {
      this.windows.delete(clientId);
    } else {
      this.windows.clear();
    }
  }

  dispose(): void {
    clearInterval(this.cleanupInterval);
    this.windows.clear();
  }

  private getEntries(clientId: string): SlidingWindowEntry[] {
    return this.windows.get(clientId) || [];
  }

  private cleanup(): void {
    const cutoff = Date.now() - this.windowMs * 2;
    for (const [clientId, entries] of this.windows) {
      const valid = entries.filter(e => e.timestamp > cutoff);
      if (valid.length === 0) {
        this.windows.delete(clientId);
      } else {
        this.windows.set(clientId, valid);
      }
    }
  }
}

// ============================================================================
// Factory Functions
// ============================================================================

/**
 * Create a new rate limiter with default configuration
 * Default: 100 requests/second, 200 burst capacity
 */
export function createRateLimiter(config?: Partial<RateLimiterConfig>): RateLimiter {
  return new RateLimiter({
    tokensPerSecond: 100,
    maxBurst: 200,
    perClient: true,
    ...config,
  });
}

/**
 * Create a strict rate limiter for sensitive endpoints
 * Default: 10 requests/second, 20 burst capacity
 */
export function createStrictRateLimiter(config?: Partial<RateLimiterConfig>): RateLimiter {
  return new RateLimiter({
    tokensPerSecond: 10,
    maxBurst: 20,
    perClient: true,
    ...config,
  });
}

/**
 * Create a sliding window rate limiter
 */
export function createSlidingWindowLimiter(
  windowMs = 1000,
  maxRequests = 100
): SlidingWindowRateLimiter {
  return new SlidingWindowRateLimiter(windowMs, maxRequests);
}

// ============================================================================
// Default Instance
// ============================================================================

let defaultRateLimiter: RateLimiter | null = null;

/**
 * Get the default rate limiter instance
 */
export function getRateLimiter(): RateLimiter {
  if (!defaultRateLimiter) {
    defaultRateLimiter = createRateLimiter();
  }
  return defaultRateLimiter;
}

/**
 * Reset the default rate limiter
 */
export function resetDefaultRateLimiter(): void {
  if (defaultRateLimiter) {
    defaultRateLimiter.dispose();
    defaultRateLimiter = null;
  }
}
