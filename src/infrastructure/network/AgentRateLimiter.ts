/**
 * Agent Rate Limiter for Network Policy Enforcement
 *
 * Token bucket rate limiter with per-agent tracking.
 * Supports both per-minute and per-hour limits.
 *
 * @module infrastructure/network/AgentRateLimiter
 * @see Issue #146 - Security Hardening: SP-3 Network Policy Enforcement
 */

import type { RateLimitConfig, RateLimitStatus, IRateLimiter } from './types.js';

/**
 * Token bucket state for an agent
 */
interface TokenBucket {
  /** Current tokens available */
  tokens: number;

  /** Last refill timestamp */
  lastRefill: number;

  /** Request count in current minute */
  minuteCount: number;

  /** Minute window start */
  minuteWindowStart: number;

  /** Request count in current hour */
  hourCount: number;

  /** Hour window start */
  hourWindowStart: number;
}

/**
 * Agent rate limiter using token bucket algorithm
 *
 * Features:
 * - Per-agent rate limiting
 * - Burst allowance via token bucket
 * - Per-minute and per-hour limits
 * - Automatic token refill
 */
export class AgentRateLimiter implements IRateLimiter {
  private config: RateLimitConfig;
  private buckets: Map<string, TokenBucket>;
  private cleanupInterval: ReturnType<typeof setInterval> | null = null;

  constructor(config: RateLimitConfig) {
    this.config = config;
    this.buckets = new Map();

    // Cleanup stale buckets every 10 minutes
    this.cleanupInterval = setInterval(() => this.cleanup(), 10 * 60 * 1000);
  }

  /**
   * Check if request is allowed without consuming
   */
  check(agentId: string): RateLimitStatus {
    const bucket = this.getOrCreateBucket(agentId);
    this.refillBucket(bucket);
    this.updateWindows(bucket);

    return this.calculateStatus(bucket, false);
  }

  /**
   * Consume a request token
   */
  consume(agentId: string): RateLimitStatus {
    const bucket = this.getOrCreateBucket(agentId);
    this.refillBucket(bucket);
    this.updateWindows(bucket);

    const status = this.calculateStatus(bucket, true);

    if (!status.limited) {
      // Consume token
      bucket.tokens -= 1;
      bucket.minuteCount += 1;
      bucket.hourCount += 1;
    }

    return status;
  }

  /**
   * Reset rate limit for an agent
   */
  reset(agentId: string): void {
    this.buckets.delete(agentId);
  }

  /**
   * Get current status for agent
   */
  getStatus(agentId: string): RateLimitStatus {
    return this.check(agentId);
  }

  /**
   * Get all agent IDs being tracked
   */
  getTrackedAgents(): string[] {
    return Array.from(this.buckets.keys());
  }

  /**
   * Stop the cleanup interval
   */
  close(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
  }

  // ============================================
  // Private Methods
  // ============================================

  private getOrCreateBucket(agentId: string): TokenBucket {
    let bucket = this.buckets.get(agentId);

    if (!bucket) {
      const now = Date.now();
      bucket = {
        tokens: this.config.burstSize,
        lastRefill: now,
        minuteCount: 0,
        minuteWindowStart: now,
        hourCount: 0,
        hourWindowStart: now,
      };
      this.buckets.set(agentId, bucket);
    }

    return bucket;
  }

  private refillBucket(bucket: TokenBucket): void {
    const now = Date.now();
    const elapsed = now - bucket.lastRefill;

    // Refill rate: requests per minute / 60 seconds
    const refillRate = this.config.requestsPerMinute / 60;
    const refillAmount = (elapsed / 1000) * refillRate;

    bucket.tokens = Math.min(this.config.burstSize, bucket.tokens + refillAmount);
    bucket.lastRefill = now;
  }

  private updateWindows(bucket: TokenBucket): void {
    const now = Date.now();

    // Reset minute window
    if (now - bucket.minuteWindowStart >= 60000) {
      bucket.minuteCount = 0;
      bucket.minuteWindowStart = now;
    }

    // Reset hour window
    if (now - bucket.hourWindowStart >= 3600000) {
      bucket.hourCount = 0;
      bucket.hourWindowStart = now;
    }
  }

  private calculateStatus(bucket: TokenBucket, forConsume: boolean): RateLimitStatus {
    const now = Date.now();

    // Check per-minute limit
    const minuteRemaining = this.config.requestsPerMinute - bucket.minuteCount;
    const minuteResetIn = 60000 - (now - bucket.minuteWindowStart);

    // Check per-hour limit
    const hourRemaining = this.config.requestsPerHour - bucket.hourCount;
    const hourResetIn = 3600000 - (now - bucket.hourWindowStart);

    // Check token bucket
    const tokensAvailable = bucket.tokens >= 1;

    // Determine if limited
    // For check(): report if we're AT the limit (next request would fail)
    // For consume(): report if we're OVER the limit (this request fails)
    let limited = false;
    let retryAfter = 0;

    // Check minute limit
    if (bucket.minuteCount >= this.config.requestsPerMinute) {
      limited = true;
      retryAfter = Math.max(retryAfter, minuteResetIn);
    }

    // Check hour limit
    if (bucket.hourCount >= this.config.requestsPerHour) {
      limited = true;
      retryAfter = Math.max(retryAfter, hourResetIn);
    }

    // Check token bucket (only for consume to allow burst)
    if (forConsume && !tokensAvailable) {
      limited = true;
      // Estimate time to refill one token
      const refillRate = this.config.requestsPerMinute / 60;
      retryAfter = Math.max(retryAfter, Math.ceil(1000 / refillRate));
    }

    return {
      limited,
      currentRate: bucket.minuteCount,
      remaining: Math.min(minuteRemaining, hourRemaining, Math.floor(bucket.tokens)),
      resetIn: Math.min(minuteResetIn, hourResetIn),
      retryAfter: limited ? retryAfter : undefined,
    };
  }

  private cleanup(): void {
    const now = Date.now();
    const staleThreshold = 3600000; // 1 hour

    for (const [agentId, bucket] of this.buckets) {
      // Remove buckets that haven't been used in an hour
      if (now - bucket.lastRefill > staleThreshold) {
        this.buckets.delete(agentId);
      }
    }
  }
}

/**
 * Create a rate limiter with default configuration
 */
export function createDefaultRateLimiter(): AgentRateLimiter {
  return new AgentRateLimiter({
    requestsPerMinute: 60,
    requestsPerHour: 1000,
    burstSize: 10,
  });
}
