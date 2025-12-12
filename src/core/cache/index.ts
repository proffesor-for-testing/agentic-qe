/**
 * Binary Metadata Cache - Unified Exports
 *
 * High-performance binary caching system for pattern metadata.
 *
 * Features:
 * - MessagePack serialization (2-3x faster than JSON)
 * - SHA-256 checksum validation
 * - Semantic versioning
 * - Graceful SQLite fallback
 * - O(1) index lookups
 *
 * Performance Targets:
 * - Pattern load: <5ms (1000 patterns)
 * - Cache hit rate: >95%
 * - Test discovery: <50ms (end-to-end)
 *
 * @module core/cache
 * @version 1.0.0
 */

// Type definitions and interfaces
export type {
  CacheVersion,
  BinaryCache,
  PatternEntry,
  PatternMetadata,
  AgentConfigEntry,
  CacheIndexData,
  CacheSerializer,
  CacheValidator,
  ValidationResult,
  CacheInvalidation,
  CacheInvalidator,
  BinaryCacheConfig,
  CacheMetrics,
  BinaryCacheReader,
  BinaryCacheBuilder,
  CacheBuildResult,
  CacheLoadErrorType,
} from './BinaryMetadataCache';

// Error classes
export {
  CacheLoadError,
  SerializationError,
  DeserializationError,
} from './BinaryMetadataCache';

// Constants
export {
  DEFAULT_CACHE_CONFIG,
  CACHE_MAGIC_NUMBER,
  CACHE_HEADER_SIZE,
  CACHE_VERSION,
} from './BinaryMetadataCache';

// Helper functions
export {
  testPatternToEntry,
  entryToTestPattern,
} from './BinaryMetadataCache';

// MessagePack Serializer
export {
  MessagePackSerializer,
  createMessagePackSerializer,
  serializeCache,
  deserializeCache,
  computeCacheChecksum,
} from './MessagePackSerializer';

// Cache Validator
export {
  BinaryCacheValidator,
  createCacheValidator,
} from './CacheValidator';

// Cache Invalidator
export {
  BinaryCacheInvalidator,
  createCacheInvalidator,
} from './CacheInvalidator';

// Cache Reader
export {
  BinaryMetadataCacheReader,
  createCacheReader,
} from './BinaryCacheReader';

// Cache Builder
export {
  BinaryMetadataCacheBuilder,
  createCacheBuilder,
} from './BinaryCacheBuilder';

// Cache Manager (main entry point)
export {
  BinaryCacheManager,
  createCacheManager,
} from './BinaryCacheManager';

// Platform-optimized file operations (Phase 2 A2.2)
// Re-export for convenient access in cache operations
export {
  copyFile,
  copyDirectory,
  cloneForIsolation,
  linkFixture,
  getCopyCapabilities,
  benchmarkCopy,
  CopyStrategy,
  type CopyResult,
  type CopyOptions,
} from '../platform';

/**
 * Quick Start Example:
 *
 * ```typescript
 * import {
 *   createCacheManager,
 *   DEFAULT_CACHE_CONFIG,
 * } from './core/cache';
 *
 * // Initialize with SQLite adapter
 * const cacheManager = createCacheManager(
 *   DEFAULT_CACHE_CONFIG,
 *   sqliteAdapter
 * );
 *
 * // Initialize cache
 * await cacheManager.initialize();
 *
 * // Load pattern (automatic SQLite fallback)
 * const pattern = await cacheManager.loadPattern('pattern-123');
 *
 * // Get metrics
 * const metrics = cacheManager.getMetrics();
 * console.log('Cache hit rate:', metrics.cacheHitRate);
 * ```
 */
