/**
 * Cache Invalidator - Lifecycle Management
 *
 * Manages cache lifecycle with:
 * - Event-based invalidation
 * - TTL-based expiration
 * - Background rebuild scheduling
 *
 * @module core/cache/CacheInvalidator
 * @version 1.0.0
 */

import type {
  CacheInvalidator,
  CacheInvalidation,
} from './BinaryMetadataCache';

/**
 * Implementation of CacheInvalidator interface
 *
 * Tracks cache staleness and schedules rebuilds based on:
 * - Manual invalidation events
 * - TTL expiration
 * - Automatic rebuild triggers
 */
export class BinaryCacheInvalidator implements CacheInvalidator {
  private staleTimestamp: number = 0;
  private rebuildCallbacks: Set<() => void> = new Set();

  /**
   * Mark cache as stale
   *
   * Records invalidation event and schedules rebuild if required.
   *
   * @param event - Invalidation event
   */
  markStale(event: CacheInvalidation): void {
    this.staleTimestamp = event.timestamp;

    if (event.requiresRebuild) {
      this.scheduleCacheRebuild(false);
    }

    // Log invalidation event
    console.log('[CacheInvalidator] Cache marked stale:', {
      trigger: event.trigger,
      timestamp: new Date(event.timestamp).toISOString(),
      requiresRebuild: event.requiresRebuild,
      metadata: event.metadata,
    });
  }

  /**
   * Check if cache is valid
   *
   * Cache is valid if:
   * - Cache timestamp > stale timestamp
   * - No invalidation events since cache generation
   *
   * @param cacheTimestamp - Cache generation timestamp
   * @returns True if cache is valid and not stale
   */
  isCacheValid(cacheTimestamp: number): boolean {
    return cacheTimestamp > this.staleTimestamp;
  }

  /**
   * Check if cache is fresh (within TTL)
   *
   * @param cacheTimestamp - Cache generation timestamp
   * @param ttl - Time-to-live in milliseconds
   * @returns True if cache age < TTL
   */
  isCacheFresh(cacheTimestamp: number, ttl: number): boolean {
    const age = Date.now() - cacheTimestamp;
    return age < ttl;
  }

  /**
   * Check if background rebuild should be triggered
   *
   * Triggers when cache age exceeds 80% of TTL to prevent
   * cold start latency spikes.
   *
   * @param cacheTimestamp - Cache generation timestamp
   * @param ttl - Time-to-live in milliseconds
   * @returns True if background rebuild recommended
   */
  shouldBackgroundRebuild(cacheTimestamp: number, ttl: number): boolean {
    const age = Date.now() - cacheTimestamp;
    const threshold = ttl * 0.8; // 80% of TTL
    return age > threshold;
  }

  /**
   * Schedule cache rebuild
   *
   * Invokes registered rebuild callbacks.
   *
   * @param background - Whether to rebuild in background
   */
  scheduleCacheRebuild(background: boolean): void {
    console.log(`[CacheInvalidator] Scheduling cache rebuild (background: ${background})`);

    // Invoke rebuild callbacks
    for (const callback of this.rebuildCallbacks) {
      try {
        callback();
      } catch (error) {
        console.error('[CacheInvalidator] Rebuild callback failed:', error);
      }
    }
  }

  /**
   * Register a rebuild callback
   *
   * Callback is invoked when cache rebuild is scheduled.
   *
   * @param callback - Rebuild callback function
   */
  onRebuild(callback: () => void): void {
    this.rebuildCallbacks.add(callback);
  }

  /**
   * Unregister a rebuild callback
   *
   * @param callback - Rebuild callback function
   */
  offRebuild(callback: () => void): void {
    this.rebuildCallbacks.delete(callback);
  }

  /**
   * Get stale timestamp
   *
   * @returns Timestamp when cache was marked stale
   */
  getStaleTimestamp(): number {
    return this.staleTimestamp;
  }

  /**
   * Reset invalidator state
   *
   * Clears stale timestamp and callbacks.
   */
  reset(): void {
    this.staleTimestamp = 0;
    this.rebuildCallbacks.clear();
  }
}

/**
 * Create a new BinaryCacheInvalidator instance
 *
 * @returns BinaryCacheInvalidator instance
 */
export function createCacheInvalidator(): BinaryCacheInvalidator {
  return new BinaryCacheInvalidator();
}
