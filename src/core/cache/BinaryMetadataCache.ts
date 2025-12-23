/**
 * Binary Metadata Cache - TypeScript Interface Definitions
 *
 * High-performance binary caching system for pattern metadata using FlatBuffers.
 * Achieves 10x faster test discovery (500ms → 50ms) by reducing pattern load
 * time from 32ms (SQLite baseline) to <5ms (binary cache target).
 *
 * Architecture:
 * - Format: FlatBuffers (zero-copy deserialization)
 * - Versioning: Semantic versioning (major.minor.patch)
 * - Validation: SHA-256 checksum
 * - Fallback: Graceful degradation to SQLite on corruption
 * - Invalidation: Event-based + TTL-based expiration
 *
 * Performance Targets:
 * - Pattern load time: <5ms (1000 patterns)
 * - Embedding access: <0.15ms (768-dim Float32Array)
 * - Cache hit rate: >95%
 * - Test discovery: <50ms (end-to-end)
 *
 * @module core/cache/BinaryMetadataCache
 * @version 1.0.0
 */

import type { TestPattern } from '../memory/IPatternStore';

/**
 * Binary cache format version
 */
export interface CacheVersion {
  /** Major version (breaking schema changes) */
  major: number;

  /** Minor version (backward-compatible additions) */
  minor: number;

  /** Patch version (non-breaking optimizations) */
  patch: number;
}

/**
 * Root binary cache container
 *
 * Represents the entire cached state of pattern metadata, agent configurations,
 * and pre-built search indexes. Serialized to disk using FlatBuffers for
 * zero-copy access and fast deserialization.
 */
export interface BinaryCache {
  /** Cache format version (encoded as uint32: major << 16 | minor << 8 | patch) */
  version: number;

  /** Cache generation timestamp (Unix milliseconds) */
  timestamp: number;

  /** SHA-256 checksum for integrity validation (hex string) */
  checksum: string;

  /** Pattern metadata entries */
  patterns: PatternEntry[];

  /** Agent configuration cache */
  agentConfigs: AgentConfigEntry[];

  /** Pre-built search indexes for fast lookup */
  indexes: CacheIndexData;
}

/**
 * Pattern metadata entry in binary cache
 *
 * Optimized layout for fast deserialization:
 * - Embedding stored as Float32Array (zero-copy access)
 * - Strings interned for memory efficiency
 * - Metadata stored inline for cache locality
 */
export interface PatternEntry {
  /** Pattern unique ID */
  id: string;

  /** Pattern type (e.g., "unit-test", "integration-test") */
  type: string;

  /** Domain/category (e.g., "api", "ui") */
  domain: string;

  /** Test framework (e.g., "jest", "vitest") */
  framework: string;

  /** Vector embedding (768-dim, zero-copy access) */
  embedding: Float32Array;

  /** Pattern content/template */
  content: string;

  /** Extended metadata */
  metadata: PatternMetadata;
}

/**
 * Pattern metadata (inline in PatternEntry)
 */
export interface PatternMetadata {
  /** Code coverage score (0.0-1.0) */
  coverage: number;

  /** Flakiness probability (0.0-1.0) */
  flakinessScore: number;

  /** Test verdict */
  verdict: 'success' | 'failure' | 'flaky' | 'unknown';

  /** Creation timestamp (Unix milliseconds) */
  createdAt: number;

  /** Last usage timestamp (Unix milliseconds) */
  lastUsed: number;

  /** Usage counter */
  usageCount: number;

  /** Success counter */
  successCount: number;
}

/**
 * Agent configuration entry in cache
 */
export interface AgentConfigEntry {
  /** Agent unique ID */
  agentId: string;

  /** Agent type (e.g., "test-generator", "coverage-analyzer") */
  type: string;

  /** JSON-serialized configuration */
  configJson: string;

  /** Configuration version */
  version: string;

  /** Last update timestamp (Unix milliseconds) */
  updatedAt: number;
}

/**
 * Pre-built search indexes for O(1) lookup
 *
 * Indexes are computed at cache generation time to avoid runtime overhead.
 * Supports filtering by domain, type, and framework.
 */
export interface CacheIndexData {
  /** Domain → pattern IDs mapping */
  domainIndex: Map<string, string[]>;

  /** Type → pattern IDs mapping */
  typeIndex: Map<string, string[]>;

  /** Framework → pattern IDs mapping */
  frameworkIndex: Map<string, string[]>;
}

/**
 * Cache serializer interface
 *
 * Handles encoding/decoding of cache data to/from binary format using FlatBuffers.
 * Supports atomic writes and checksum computation.
 */
export interface CacheSerializer {
  /**
   * Encode cache data to binary buffer
   *
   * @param cache - Cache data to serialize
   * @returns Binary buffer (Uint8Array) ready for disk write
   * @throws {SerializationError} If encoding fails
   */
  encode(cache: BinaryCache): Uint8Array;

  /**
   * Decode binary buffer to cache data
   *
   * @param buffer - Binary buffer from disk read
   * @returns Decoded cache data with zero-copy embeddings
   * @throws {DeserializationError} If decoding fails
   */
  decode(buffer: Uint8Array): BinaryCache;

  /**
   * Compute SHA-256 checksum of cache data
   *
   * @param buffer - Binary buffer to checksum
   * @returns SHA-256 hash as hex string
   */
  computeChecksum(buffer: Uint8Array): Promise<string>;

  /**
   * Encode cache version to uint32
   *
   * Format: (major << 16) | (minor << 8) | patch
   * Example: v1.2.3 → 0x00010203 (66051)
   *
   * @param version - Semantic version
   * @returns Encoded version as uint32
   */
  encodeVersion(version: CacheVersion): number;

  /**
   * Decode uint32 to cache version
   *
   * @param encoded - Encoded version uint32
   * @returns Semantic version
   */
  decodeVersion(encoded: number): CacheVersion;
}

/**
 * Cache validator interface
 *
 * Validates cache integrity and version compatibility.
 * Ensures data consistency and prevents use of corrupted caches.
 */
export interface CacheValidator {
  /**
   * Validate cache integrity
   *
   * Performs checksum validation and version compatibility check.
   *
   * @param buffer - Binary cache buffer
   * @param expectedChecksum - Expected SHA-256 checksum
   * @returns Validation result with error details
   */
  validate(buffer: Uint8Array, expectedChecksum: string): Promise<ValidationResult>;

  /**
   * Check version compatibility
   *
   * @param cacheVersion - Version from cache header
   * @param codeVersion - Current code version
   * @returns Compatibility result
   */
  isVersionCompatible(cacheVersion: CacheVersion, codeVersion: CacheVersion): boolean;

  /**
   * Validate pattern entry
   *
   * Checks for required fields and data integrity.
   *
   * @param entry - Pattern entry to validate
   * @returns True if valid, false otherwise
   */
  isValidPatternEntry(entry: PatternEntry): boolean;
}

/**
 * Validation result
 */
export interface ValidationResult {
  /** Overall validation success */
  valid: boolean;

  /** Checksum validation passed */
  checksumValid: boolean;

  /** Version compatibility check passed */
  versionCompatible: boolean;

  /** Error message (if validation failed) */
  error?: string;

  /** Computed checksum (for debugging) */
  computedChecksum?: string;

  /** Cache version (for debugging) */
  cacheVersion?: CacheVersion;
}

/**
 * Cache invalidation event
 */
export interface CacheInvalidation {
  /** Invalidation trigger type */
  trigger:
    | 'pattern_stored'
    | 'pattern_deleted'
    | 'config_updated'
    | 'schema_migration'
    | 'manual'
    | 'ttl_expired';

  /** Event timestamp (Unix milliseconds) */
  timestamp: number;

  /** Whether immediate cache rebuild is required */
  requiresRebuild: boolean;

  /** Additional metadata */
  metadata?: Record<string, any>;
}

/**
 * Cache invalidator interface
 *
 * Manages cache lifecycle and invalidation logic.
 * Supports event-based and TTL-based invalidation.
 */
export interface CacheInvalidator {
  /**
   * Mark cache as stale
   *
   * @param event - Invalidation event
   */
  markStale(event: CacheInvalidation): void;

  /**
   * Check if cache is valid
   *
   * @param cacheTimestamp - Cache generation timestamp
   * @returns True if cache is valid and not stale
   */
  isCacheValid(cacheTimestamp: number): boolean;

  /**
   * Check if cache is fresh (within TTL)
   *
   * @param cacheTimestamp - Cache generation timestamp
   * @param ttl - Time-to-live in milliseconds
   * @returns True if cache age < TTL
   */
  isCacheFresh(cacheTimestamp: number, ttl: number): boolean;

  /**
   * Check if background rebuild should be triggered
   *
   * Typically triggers when cache age exceeds 80% of TTL.
   *
   * @param cacheTimestamp - Cache generation timestamp
   * @param ttl - Time-to-live in milliseconds
   * @returns True if background rebuild recommended
   */
  shouldBackgroundRebuild(cacheTimestamp: number, ttl: number): boolean;

  /**
   * Schedule cache rebuild
   *
   * @param background - Whether to rebuild in background
   */
  scheduleCacheRebuild(background: boolean): void;
}

/**
 * Cache configuration
 */
export interface BinaryCacheConfig {
  /** Enable binary cache (feature flag) */
  enabled: boolean;

  /** Cache file path (default: .aqe/cache/patterns.bin) */
  cachePath: string;

  /** Maximum cache age in milliseconds (default: 3600000 = 1 hour) */
  maxAge: number;

  /** Cache validation check interval (default: 300000 = 5 min) */
  checkInterval: number;

  /** Enable background cache rebuild (default: true) */
  backgroundRebuild: boolean;

  /** Graceful fallback to SQLite on errors (default: true) */
  fallbackToSQLite: boolean;

  /** Current cache format version */
  version: CacheVersion;

  /** Enable performance metrics collection (default: true) */
  enableMetrics: boolean;
}

/**
 * Cache metrics for monitoring
 */
export interface CacheMetrics {
  /** Total cache hits */
  cacheHits: number;

  /** Total cache misses */
  cacheMisses: number;

  /** Cache hit rate (0.0-1.0) */
  cacheHitRate: number;

  /** Average cache load time (milliseconds) */
  avgCacheLoadTime: number;

  /** Average SQLite fallback time (milliseconds) */
  avgSQLiteFallbackTime: number;

  /** Cache corruption count */
  cacheCorruptionCount: number;

  /** Cache rebuild count */
  cacheRebuildCount: number;

  /** Last cache generation timestamp */
  lastCacheGenerationTime: number;

  /** Cache file size (bytes) */
  cacheFileSize: number;

  /** Number of patterns in cache */
  patternCount: number;
}

/**
 * Binary cache reader interface (zero-copy access)
 *
 * Provides read-only access to cached pattern metadata with minimal overhead.
 * Uses memory-mapped files and FlatBuffers for zero-copy deserialization.
 */
export interface BinaryCacheReader {
  /**
   * Initialize cache reader
   *
   * Loads cache file, validates checksum, and prepares for zero-copy access.
   *
   * @param cachePath - Path to binary cache file
   * @param config - Cache configuration
   * @returns Initialization success status
   * @throws {CacheLoadError} If cache loading fails
   */
  initialize(cachePath: string, config: BinaryCacheConfig): Promise<boolean>;

  /**
   * Get pattern by ID (zero-copy)
   *
   * @param id - Pattern unique ID
   * @returns Pattern entry or null if not found
   */
  getPattern(id: string): PatternEntry | null;

  /**
   * Get patterns by domain (O(1) lookup)
   *
   * @param domain - Domain filter
   * @returns Array of pattern entries
   */
  getPatternsByDomain(domain: string): PatternEntry[];

  /**
   * Get patterns by type (O(1) lookup)
   *
   * @param type - Type filter
   * @returns Array of pattern entries
   */
  getPatternsByType(type: string): PatternEntry[];

  /**
   * Get patterns by framework (O(1) lookup)
   *
   * @param framework - Framework filter
   * @returns Array of pattern entries
   */
  getPatternsByFramework(framework: string): PatternEntry[];

  /**
   * Get all patterns (zero-copy)
   *
   * @returns Array of all pattern entries
   */
  getAllPatterns(): PatternEntry[];

  /**
   * Get agent configuration by ID
   *
   * @param agentId - Agent unique ID
   * @returns Agent config entry or null if not found
   */
  getAgentConfig(agentId: string): AgentConfigEntry | null;

  /**
   * Get cache metadata
   *
   * @returns Cache version, timestamp, and statistics
   */
  getCacheMetadata(): {
    version: CacheVersion;
    timestamp: number;
    patternCount: number;
    agentConfigCount: number;
    fileSize: number;
  };

  /**
   * Check if cache is valid and fresh
   *
   * @returns True if cache is usable
   */
  isValid(): boolean;

  /**
   * Close cache reader and release resources
   */
  close(): void;
}

/**
 * Binary cache builder interface
 *
 * Builds binary cache from SQLite data source.
 * Handles serialization, index generation, and atomic writes.
 */
export interface BinaryCacheBuilder {
  /**
   * Build cache from SQLite patterns
   *
   * @param patterns - Array of test patterns from SQLite
   * @param agentConfigs - Array of agent configurations
   * @param outputPath - Cache file output path
   * @returns Build success status and metrics
   */
  buildCache(
    patterns: TestPattern[],
    agentConfigs: AgentConfigEntry[],
    outputPath: string
  ): Promise<CacheBuildResult>;

  /**
   * Build cache indexes
   *
   * Pre-computes domain, type, and framework indexes for O(1) lookup.
   *
   * @param patterns - Array of pattern entries
   * @returns Index data structure
   */
  buildIndexes(patterns: PatternEntry[]): CacheIndexData;

  /**
   * Write cache to disk atomically
   *
   * Uses atomic write pattern (write to temp, validate, rename) to prevent
   * partial writes and corruption.
   *
   * @param buffer - Binary cache buffer
   * @param outputPath - Target file path
   * @returns Write success status
   */
  writeAtomic(buffer: Uint8Array, outputPath: string): Promise<boolean>;
}

/**
 * Cache build result
 */
export interface CacheBuildResult {
  /** Build success status */
  success: boolean;

  /** Build duration (milliseconds) */
  duration: number;

  /** Number of patterns cached */
  patternCount: number;

  /** Number of agent configs cached */
  agentConfigCount: number;

  /** Cache file size (bytes) */
  cacheFileSize: number;

  /** Cache version */
  version: CacheVersion;

  /** SHA-256 checksum */
  checksum: string;

  /** Error message (if build failed) */
  error?: string;
}

/**
 * Cache load error types
 */
export type CacheLoadErrorType =
  | 'file_not_found'
  | 'permission_denied'
  | 'checksum_mismatch'
  | 'version_incompatible'
  | 'corrupted_data'
  | 'io_error';

/**
 * Cache load error
 */
export class CacheLoadError extends Error {
  constructor(
    public type: CacheLoadErrorType,
    message: string,
    public metadata?: Record<string, any>
  ) {
    super(message);
    this.name = 'CacheLoadError';
  }
}

/**
 * Serialization error
 */
export class SerializationError extends Error {
  constructor(message: string, public cause?: Error) {
    super(message);
    this.name = 'SerializationError';
  }
}

/**
 * Deserialization error
 */
export class DeserializationError extends Error {
  constructor(message: string, public cause?: Error) {
    super(message);
    this.name = 'DeserializationError';
  }
}

/**
 * Default cache configuration
 */
export const DEFAULT_CACHE_CONFIG: BinaryCacheConfig = {
  enabled: true,
  cachePath: '.aqe/cache/patterns.bin',
  maxAge: 3600000, // 1 hour
  checkInterval: 300000, // 5 minutes
  backgroundRebuild: true,
  fallbackToSQLite: true,
  version: { major: 1, minor: 0, patch: 0 },
  enableMetrics: true,
};

/**
 * Cache file magic number (0x41514543 = "AQEC" = Agentic QE Cache)
 */
export const CACHE_MAGIC_NUMBER = 0x41514543;

/**
 * Cache file header size (bytes)
 */
export const CACHE_HEADER_SIZE = 64;

/**
 * Current cache format version
 */
export const CACHE_VERSION: CacheVersion = { major: 1, minor: 0, patch: 0 };

/**
 * Helper: Convert TestPattern to PatternEntry
 *
 * Maps from IPatternStore.TestPattern to cache-optimized PatternEntry format.
 *
 * @param pattern - Test pattern from SQLite
 * @returns Pattern entry for cache
 */
export function testPatternToEntry(pattern: TestPattern): PatternEntry {
  return {
    id: pattern.id,
    type: pattern.type,
    domain: pattern.domain,
    framework: pattern.framework || 'unknown',
    embedding: new Float32Array(pattern.embedding),
    content: pattern.content,
    metadata: {
      coverage: pattern.coverage || 0,
      flakinessScore: pattern.flakinessScore || 0,
      verdict: pattern.verdict || 'unknown',
      createdAt: pattern.createdAt || Date.now(),
      lastUsed: pattern.lastUsed || Date.now(),
      usageCount: pattern.usageCount || 0,
      successCount: pattern.metadata?.successCount || 0,
    },
  };
}

/**
 * Helper: Convert PatternEntry to TestPattern
 *
 * Maps from cache-optimized PatternEntry to IPatternStore.TestPattern format.
 *
 * @param entry - Pattern entry from cache
 * @returns Test pattern for application use
 */
export function entryToTestPattern(entry: PatternEntry): TestPattern {
  return {
    id: entry.id,
    type: entry.type,
    domain: entry.domain,
    framework: entry.framework,
    embedding: Array.from(entry.embedding),
    content: entry.content,
    coverage: entry.metadata.coverage,
    flakinessScore: entry.metadata.flakinessScore,
    verdict: entry.metadata.verdict === 'unknown' ? undefined : entry.metadata.verdict,
    createdAt: entry.metadata.createdAt,
    lastUsed: entry.metadata.lastUsed,
    usageCount: entry.metadata.usageCount,
    metadata: {
      successCount: entry.metadata.successCount,
    },
  };
}

// ============================================================================
// TRM (Test-time Reasoning & Metacognition) Pattern Cache
// ============================================================================

/**
 * TRM Pattern type classification
 */
export type TRMPatternType =
  | 'reasoning'       // Reasoning step patterns
  | 'refinement'      // Iterative refinement patterns
  | 'convergence'     // Convergence detection patterns
  | 'quality'         // Quality improvement patterns
  | 'trajectory';     // Full trajectory patterns

/**
 * TRM Pattern entry in binary cache
 *
 * Optimized layout for caching TRM reasoning patterns:
 * - Input/output embeddings for similarity search
 * - Quality metrics for pattern selection
 * - Trajectory data for learning
 */
export interface TRMPatternEntry {
  /** Pattern unique ID */
  id: string;

  /** TRM pattern type */
  type: TRMPatternType;

  /** Input embedding (768-dim, zero-copy access) */
  inputEmbedding: Float32Array;

  /** Output embedding (768-dim, zero-copy access) */
  outputEmbedding: Float32Array;

  /** Input text (query/prompt) */
  inputText: string;

  /** Output text (response) */
  outputText: string;

  /** TRM-specific metadata */
  metadata: TRMPatternMetadata;
}

/**
 * TRM Pattern metadata
 */
export interface TRMPatternMetadata {
  /** Final quality score (0.0-1.0) */
  quality: number;

  /** Quality metric used */
  qualityMetric: 'coherence' | 'coverage' | 'diversity';

  /** Number of TRM iterations */
  iterations: number;

  /** Convergence achieved */
  converged: boolean;

  /** Confidence score (0.0-1.0) */
  confidence: number;

  /** Creation timestamp (Unix milliseconds) */
  createdAt: number;

  /** Last usage timestamp (Unix milliseconds) */
  lastUsed: number;

  /** Usage counter */
  usageCount: number;

  /** Average latency per iteration (ms) */
  avgIterationLatency: number;

  /** LoRA adapter ID used (if any) */
  loraAdapterId?: string;
}

/**
 * TRM cache index data for O(1) lookup
 */
export interface TRMCacheIndexData {
  /** Type → pattern IDs mapping */
  typeIndex: Map<TRMPatternType, string[]>;

  /** Quality metric → pattern IDs mapping */
  metricIndex: Map<string, string[]>;

  /** Converged → pattern IDs mapping */
  convergedIndex: Map<boolean, string[]>;

  /** Quality bucket (0.0-0.25, 0.25-0.5, 0.5-0.75, 0.75-1.0) → pattern IDs */
  qualityBucketIndex: Map<string, string[]>;
}

/**
 * TRM Binary Cache extension
 *
 * Extends the base BinaryCache with TRM-specific pattern storage.
 */
export interface TRMBinaryCache extends BinaryCache {
  /** TRM pattern entries */
  trmPatterns: TRMPatternEntry[];

  /** TRM pattern indexes */
  trmIndexes: TRMCacheIndexData;

  /** LoRA adapter configurations */
  loraAdapters: LoRAAdapterEntry[];
}

/**
 * LoRA adapter entry in cache
 */
export interface LoRAAdapterEntry {
  /** Adapter unique ID */
  id: string;

  /** Adapter name/description */
  name: string;

  /** LoRA rank */
  rank: number;

  /** LoRA alpha scaling factor */
  alpha: number;

  /** Target modules */
  targetModules: string[];

  /** Creation timestamp */
  createdAt: number;

  /** Training iterations */
  trainingIterations: number;

  /** Final loss value */
  finalLoss: number;
}

/**
 * TRM cache reader interface
 *
 * Extends BinaryCacheReader with TRM pattern access.
 */
export interface TRMBinaryCacheReader extends BinaryCacheReader {
  /**
   * Get TRM pattern by ID
   *
   * @param id - Pattern unique ID
   * @returns TRM pattern entry or null if not found
   */
  getTRMPattern(id: string): TRMPatternEntry | null;

  /**
   * Get TRM patterns by type
   *
   * @param type - TRM pattern type filter
   * @returns Array of TRM pattern entries
   */
  getTRMPatternsByType(type: TRMPatternType): TRMPatternEntry[];

  /**
   * Get converged TRM patterns
   *
   * @returns Array of TRM patterns that achieved convergence
   */
  getConvergedPatterns(): TRMPatternEntry[];

  /**
   * Get high-quality TRM patterns (quality >= 0.75)
   *
   * @returns Array of high-quality TRM pattern entries
   */
  getHighQualityPatterns(): TRMPatternEntry[];

  /**
   * Search TRM patterns by input similarity
   *
   * @param embedding - Query embedding (768-dim)
   * @param k - Number of results to return
   * @returns Array of similar TRM patterns with scores
   */
  searchByInputSimilarity(
    embedding: Float32Array,
    k: number
  ): Array<{ pattern: TRMPatternEntry; score: number }>;

  /**
   * Get all TRM patterns
   *
   * @returns Array of all TRM pattern entries
   */
  getAllTRMPatterns(): TRMPatternEntry[];

  /**
   * Get LoRA adapter by ID
   *
   * @param id - Adapter unique ID
   * @returns LoRA adapter entry or null if not found
   */
  getLoRAAdapter(id: string): LoRAAdapterEntry | null;

  /**
   * Get TRM cache statistics
   *
   * @returns TRM-specific cache statistics
   */
  getTRMCacheStats(): TRMCacheStats;
}

/**
 * TRM cache statistics
 */
export interface TRMCacheStats {
  /** Total TRM patterns */
  totalPatterns: number;

  /** Converged patterns count */
  convergedCount: number;

  /** High-quality patterns count (quality >= 0.75) */
  highQualityCount: number;

  /** Average quality score */
  avgQuality: number;

  /** Average iterations per pattern */
  avgIterations: number;

  /** LoRA adapters count */
  loraAdaptersCount: number;

  /** Cache age (milliseconds) */
  cacheAge: number;
}

/**
 * TRM cache builder interface
 *
 * Extends BinaryCacheBuilder with TRM pattern support.
 */
export interface TRMBinaryCacheBuilder extends BinaryCacheBuilder {
  /**
   * Build TRM cache from patterns
   *
   * @param trmPatterns - Array of TRM patterns
   * @param loraAdapters - Array of LoRA adapter configs
   * @param outputPath - Cache file output path
   * @returns Build success status and metrics
   */
  buildTRMCache(
    trmPatterns: TRMPatternEntry[],
    loraAdapters: LoRAAdapterEntry[],
    outputPath: string
  ): Promise<TRMCacheBuildResult>;

  /**
   * Build TRM cache indexes
   *
   * @param patterns - Array of TRM pattern entries
   * @returns TRM index data structure
   */
  buildTRMIndexes(patterns: TRMPatternEntry[]): TRMCacheIndexData;
}

/**
 * TRM cache build result
 */
export interface TRMCacheBuildResult extends CacheBuildResult {
  /** Number of TRM patterns cached */
  trmPatternCount: number;

  /** Number of LoRA adapters cached */
  loraAdapterCount: number;

  /** Converged patterns count */
  convergedPatternCount: number;

  /** Average quality of cached patterns */
  avgQuality: number;
}

/**
 * Default TRM cache configuration
 */
export const DEFAULT_TRM_CACHE_CONFIG: BinaryCacheConfig = {
  ...DEFAULT_CACHE_CONFIG,
  cachePath: '.aqe/cache/trm-patterns.bin',
  maxAge: 7200000, // 2 hours (TRM patterns are more valuable)
  version: { major: 1, minor: 1, patch: 0 }, // TRM extension version
};

/**
 * TRM cache file magic number (0x54524D43 = "TRMC" = TRM Cache)
 */
export const TRM_CACHE_MAGIC_NUMBER = 0x54524D43;

/**
 * Helper: Compute quality bucket for indexing
 *
 * @param quality - Quality score (0.0-1.0)
 * @returns Quality bucket string
 */
export function getQualityBucket(quality: number): string {
  if (quality >= 0.75) return 'high';
  if (quality >= 0.5) return 'medium';
  if (quality >= 0.25) return 'low';
  return 'very_low';
}

/**
 * Helper: Create TRM pattern entry
 *
 * @param input - Input text
 * @param output - Output text
 * @param inputEmb - Input embedding
 * @param outputEmb - Output embedding
 * @param metadata - TRM metadata
 * @returns TRM pattern entry
 */
export function createTRMPatternEntry(
  input: string,
  output: string,
  inputEmb: number[],
  outputEmb: number[],
  metadata: Partial<TRMPatternMetadata>
): TRMPatternEntry {
  return {
    id: `trm-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    type: metadata.iterations && metadata.iterations > 1 ? 'refinement' : 'reasoning',
    inputText: input,
    outputText: output,
    inputEmbedding: new Float32Array(inputEmb),
    outputEmbedding: new Float32Array(outputEmb),
    metadata: {
      quality: metadata.quality ?? 0.5,
      qualityMetric: metadata.qualityMetric ?? 'coherence',
      iterations: metadata.iterations ?? 1,
      converged: metadata.converged ?? false,
      confidence: metadata.confidence ?? 0.5,
      createdAt: Date.now(),
      lastUsed: Date.now(),
      usageCount: 1,
      avgIterationLatency: metadata.avgIterationLatency ?? 0,
      loraAdapterId: metadata.loraAdapterId,
    },
  };
}

