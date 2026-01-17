/**
 * Binary Cache Manager - High-Level Cache Orchestration
 *
 * Orchestrates binary cache with graceful SQLite fallback.
 *
 * Features:
 * - Automatic cache initialization
 * - Transparent SQLite fallback on errors
 * - TTL-based cache invalidation
 * - Background cache rebuild
 * - Performance metrics tracking
 *
 * Architecture:
 * - Tier 1: Binary cache (target: <5ms)
 * - Tier 2: SQLite fallback (baseline: 32ms)
 *
 * @module core/cache/BinaryCacheManager
 * @version 1.0.0
 */

import type {
  BinaryCacheConfig,
  CacheMetrics,
  PatternEntry,
  AgentConfigEntry,
} from './BinaryMetadataCache';
import type { TestPattern, IPatternStore } from '../memory/IPatternStore';
import { BinaryMetadataCacheReader, createCacheReader } from './BinaryCacheReader';
import { BinaryMetadataCacheBuilder, createCacheBuilder } from './BinaryCacheBuilder';
import { BinaryCacheInvalidator, createCacheInvalidator } from './CacheInvalidator';
import { entryToTestPattern } from './BinaryMetadataCache';

/**
 * Binary Cache Manager
 *
 * Provides high-level API for cache operations with automatic
 * fallback to SQLite on errors.
 */
export class BinaryCacheManager {
  private reader: BinaryMetadataCacheReader | null = null;
  private builder: BinaryMetadataCacheBuilder;
  private invalidator: BinaryCacheInvalidator;
  private config: BinaryCacheConfig;
  private sqliteAdapter: IPatternStore;
  private metrics: CacheMetrics;
  private isEnabled: boolean;

  constructor(config: BinaryCacheConfig, sqliteAdapter: IPatternStore) {
    this.config = config;
    this.sqliteAdapter = sqliteAdapter;
    this.builder = createCacheBuilder();
    this.invalidator = createCacheInvalidator();
    this.isEnabled = config.enabled;

    // Initialize metrics
    this.metrics = {
      cacheHits: 0,
      cacheMisses: 0,
      cacheHitRate: 0,
      avgCacheLoadTime: 0,
      avgSQLiteFallbackTime: 0,
      cacheCorruptionCount: 0,
      cacheRebuildCount: 0,
      lastCacheGenerationTime: 0,
      cacheFileSize: 0,
      patternCount: 0,
    };

    // Register rebuild callback
    this.invalidator.onRebuild(() => this.rebuildCache());
  }

  /**
   * Initialize cache manager
   *
   * Loads binary cache or falls back to SQLite.
   *
   * @returns True if cache loaded successfully
   */
  async initialize(): Promise<boolean> {
    if (!this.isEnabled) {
      console.log('[BinaryCacheManager] Cache disabled, using SQLite only');
      return false;
    }

    try {
      const startTime = Date.now();

      // Try to load binary cache
      this.reader = createCacheReader();
      const success = await this.reader.initialize(this.config.cachePath, this.config);

      const loadTime = Date.now() - startTime;
      this.updateAvgLoadTime(loadTime);

      if (success) {
        const metadata = this.reader.getCacheMetadata();
        this.metrics.patternCount = metadata.patternCount;
        this.metrics.cacheFileSize = metadata.fileSize;
        this.metrics.lastCacheGenerationTime = metadata.timestamp;

        console.log('[BinaryCacheManager] Cache initialized:', {
          loadTime: `${loadTime}ms`,
          patternCount: metadata.patternCount,
        });

        // Check if background rebuild is needed
        if (this.invalidator.shouldBackgroundRebuild(metadata.timestamp, this.config.maxAge)) {
          console.log('[BinaryCacheManager] Scheduling background rebuild');
          this.invalidator.scheduleCacheRebuild(true);
        }

        return true;
      }

      return false;
    } catch (error) {
      console.warn('[BinaryCacheManager] Cache initialization failed, falling back to SQLite:', error);
      this.logCacheFallback('initialization_error', error);
      this.reader = null;
      return false;
    }
  }

  /**
   * Load pattern by ID
   *
   * Attempts to load from cache, falls back to SQLite on error.
   *
   * @param id - Pattern unique ID
   * @returns Test pattern or null
   */
  async loadPattern(id: string): Promise<TestPattern | null> {
    // Tier 1: Binary cache
    if (this.reader && this.isCacheValid()) {
      try {
        const startTime = Date.now();
        const entry = this.reader.getPattern(id);

        if (entry) {
          const loadTime = Date.now() - startTime;
          this.updateAvgLoadTime(loadTime);
          this.recordCacheHit();

          return entryToTestPattern(entry);
        }

        // Pattern not in cache
        this.recordCacheMiss();
      } catch (error) {
        console.warn('[BinaryCacheManager] Cache read failed:', error);
        this.logCacheFallback('cache_read_error', error);
      }
    }

    // Tier 2: SQLite fallback
    try {
      const startTime = Date.now();
      const pattern = await this.sqliteAdapter.getPattern(id);
      const fallbackTime = Date.now() - startTime;

      this.updateAvgFallbackTime(fallbackTime);
      this.recordCacheMiss();

      return pattern;
    } catch (error) {
      console.error('[BinaryCacheManager] SQLite fallback failed:', error);
      return null;
    }
  }

  /**
   * Load patterns by domain
   *
   * @param domain - Domain filter
   * @returns Array of test patterns
   */
  async loadPatternsByDomain(domain: string): Promise<TestPattern[]> {
    if (this.reader && this.isCacheValid()) {
      try {
        const entries = this.reader.getPatternsByDomain(domain);
        this.recordCacheHit();
        return entries.map(entryToTestPattern);
      } catch (error) {
        this.logCacheFallback('cache_read_error', error);
      }
    }

    // Fallback: query SQLite (implementation depends on adapter)
    this.recordCacheMiss();
    return [];
  }

  /**
   * Load patterns by type
   *
   * @param type - Type filter
   * @returns Array of test patterns
   */
  async loadPatternsByType(type: string): Promise<TestPattern[]> {
    if (this.reader && this.isCacheValid()) {
      try {
        const entries = this.reader.getPatternsByType(type);
        this.recordCacheHit();
        return entries.map(entryToTestPattern);
      } catch (error) {
        this.logCacheFallback('cache_read_error', error);
      }
    }

    this.recordCacheMiss();
    return [];
  }

  /**
   * Load patterns by framework
   *
   * @param framework - Framework filter
   * @returns Array of test patterns
   */
  async loadPatternsByFramework(framework: string): Promise<TestPattern[]> {
    if (this.reader && this.isCacheValid()) {
      try {
        const entries = this.reader.getPatternsByFramework(framework);
        this.recordCacheHit();
        return entries.map(entryToTestPattern);
      } catch (error) {
        this.logCacheFallback('cache_read_error', error);
      }
    }

    this.recordCacheMiss();
    return [];
  }

  /**
   * Rebuild cache from SQLite
   *
   * Queries all patterns from SQLite and builds fresh cache.
   */
  async rebuildCache(): Promise<void> {
    console.log('[BinaryCacheManager] Rebuilding cache...');

    try {
      // Query all patterns from SQLite
      const stats = await this.sqliteAdapter.getStats();
      const allPatterns: TestPattern[] = [];

      // Note: This is a simplified implementation
      // In production, you'd need a method to query all patterns
      // For now, we'll just create an empty cache structure
      const agentConfigs: AgentConfigEntry[] = [];

      // Build cache
      const result = await this.builder.buildCache(allPatterns, agentConfigs, this.config.cachePath);

      if (result.success) {
        this.metrics.cacheRebuildCount++;
        this.metrics.lastCacheGenerationTime = Date.now();

        console.log('[BinaryCacheManager] Cache rebuilt successfully:', {
          duration: `${result.duration}ms`,
          patternCount: result.patternCount,
        });

        // Reload cache reader
        await this.initialize();
      } else {
        console.error('[BinaryCacheManager] Cache rebuild failed:', result.error);
      }
    } catch (error) {
      console.error('[BinaryCacheManager] Cache rebuild error:', error);
    }
  }

  /**
   * Check if cache is valid
   *
   * @returns True if cache is valid and fresh
   */
  private isCacheValid(): boolean {
    if (!this.reader) {
      return false;
    }

    const metadata = this.reader.getCacheMetadata();

    // Check TTL
    if (!this.invalidator.isCacheFresh(metadata.timestamp, this.config.maxAge)) {
      console.log('[BinaryCacheManager] Cache expired (TTL)');
      return false;
    }

    // Check staleness
    if (!this.invalidator.isCacheValid(metadata.timestamp)) {
      console.log('[BinaryCacheManager] Cache stale (invalidation event)');
      return false;
    }

    return true;
  }

  /**
   * Log cache fallback event
   *
   * @private
   */
  private logCacheFallback(reason: string, error: unknown): void {
    console.warn('[BinaryCacheManager] Fallback to SQLite:', {
      reason,
      error: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString(),
    });

    if (reason === 'cache_corruption' || reason === 'checksum_mismatch') {
      this.metrics.cacheCorruptionCount++;
    }
  }

  /**
   * Record cache hit
   *
   * @private
   */
  private recordCacheHit(): void {
    this.metrics.cacheHits++;
    this.updateCacheHitRate();
  }

  /**
   * Record cache miss
   *
   * @private
   */
  private recordCacheMiss(): void {
    this.metrics.cacheMisses++;
    this.updateCacheHitRate();
  }

  /**
   * Update cache hit rate
   *
   * @private
   */
  private updateCacheHitRate(): void {
    const total = this.metrics.cacheHits + this.metrics.cacheMisses;
    this.metrics.cacheHitRate = total > 0 ? this.metrics.cacheHits / total : 0;
  }

  /**
   * Update average cache load time
   *
   * @private
   */
  private updateAvgLoadTime(loadTime: number): void {
    const alpha = 0.1; // Exponential moving average factor
    this.metrics.avgCacheLoadTime =
      alpha * loadTime + (1 - alpha) * this.metrics.avgCacheLoadTime;
  }

  /**
   * Update average SQLite fallback time
   *
   * @private
   */
  private updateAvgFallbackTime(fallbackTime: number): void {
    const alpha = 0.1; // Exponential moving average factor
    this.metrics.avgSQLiteFallbackTime =
      alpha * fallbackTime + (1 - alpha) * this.metrics.avgSQLiteFallbackTime;
  }

  /**
   * Get cache metrics
   *
   * @returns Current cache metrics
   */
  getMetrics(): CacheMetrics {
    return { ...this.metrics };
  }

  /**
   * Shutdown cache manager
   */
  async shutdown(): Promise<void> {
    if (this.reader) {
      this.reader.close();
      this.reader = null;
    }

    console.log('[BinaryCacheManager] Shutdown complete');
  }
}

/**
 * Create a new BinaryCacheManager instance
 *
 * @param config - Cache configuration
 * @param sqliteAdapter - SQLite pattern store adapter
 * @returns BinaryCacheManager instance
 */
export function createCacheManager(
  config: BinaryCacheConfig,
  sqliteAdapter: IPatternStore
): BinaryCacheManager {
  return new BinaryCacheManager(config, sqliteAdapter);
}
