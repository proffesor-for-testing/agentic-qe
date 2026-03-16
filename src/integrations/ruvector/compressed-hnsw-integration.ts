/**
 * Compressed HNSW Integration
 * ADR-085: Temporal Tensor Pattern Compression + HNSW Backend
 *
 * Wraps an IHnswIndexProvider to transparently handle compressed vectors.
 * On add(), the original vector is passed to the underlying HNSW index for
 * accurate search, while a compressed copy is stored for memory savings.
 * On search(), results come from the HNSW index normally.
 *
 * The compressIndex() method bulk-compresses cold/warm vectors, and
 * getMemoryStats() reports the savings achieved.
 *
 * Activation is controlled by the `useTemporalCompression` feature flag.
 *
 * @module integrations/ruvector/compressed-hnsw-integration
 */

import type {
  IHnswIndexProvider,
  SearchResult,
} from '../../kernel/hnsw-index-provider.js';
import type {
  CompressedVector,
  CompressionTier,
} from './temporal-compression.js';
import {
  TemporalCompressionService,
  createTemporalCompressionService,
} from './temporal-compression.js';
import { isTemporalCompressionEnabled } from './feature-flags.js';
import { LoggerFactory } from '../../logging/index.js';

const logger = LoggerFactory.create('compressed-hnsw');

// ============================================================================
// Types
// ============================================================================

/**
 * Metadata tracked per vector for compression management.
 */
interface VectorEntry {
  /** The original float32 vector (kept until compressed) */
  original: Float32Array | null;
  /** Compressed representation (set after compression) */
  compressed: CompressedVector | null;
  /** Compression tier applied (null if uncompressed) */
  tier: CompressionTier | null;
  /** Last access timestamp (used for tier classification) */
  lastAccessedAt: Date;
}

/**
 * Memory statistics for the compressed HNSW index.
 */
export interface CompressedHnswMemoryStats {
  /** Total vectors in the index */
  totalVectors: number;
  /** Vectors that are still uncompressed */
  uncompressedCount: number;
  /** Vectors that have been compressed */
  compressedCount: number;
  /** Breakdown of compressed vectors by tier */
  compressedByTier: Record<CompressionTier, number>;
  /** Total bytes used by original (uncompressed) vectors */
  originalBytes: number;
  /** Total bytes used by compressed vectors (effective) */
  compressedBytes: number;
  /** Total bytes saved through compression */
  bytesSaved: number;
  /** Savings as a percentage (0-100) */
  savingsPercent: number;
  /** Whether temporal compression is enabled via feature flag */
  compressionEnabled: boolean;
}

// ============================================================================
// CompressedHnswIntegration
// ============================================================================

/**
 * Wrapper around IHnswIndexProvider that transparently manages compressed
 * vector storage alongside the HNSW index.
 *
 * The HNSW index always receives full-precision vectors for accurate search.
 * Compression is a separate memory-optimization layer that stores compact
 * representations of vectors that can be decompressed on demand.
 *
 * Usage:
 * ```typescript
 * const baseIndex = new ProgressiveHnswBackend({ dimensions: 384 });
 * const compressed = new CompressedHnswIntegration(baseIndex);
 *
 * compressed.add(1, embedding, { domain: 'auth' });
 * const results = compressed.search(queryEmbedding, 10);
 *
 * // Compress cold vectors to save memory
 * const stats = compressed.compressIndex();
 * console.log(`Compressed ${stats.compressedCount} vectors`);
 * ```
 */
export class CompressedHnswIntegration implements IHnswIndexProvider {
  private readonly backend: IHnswIndexProvider;
  private readonly compressionService: TemporalCompressionService;
  private readonly vectorEntries: Map<number, VectorEntry> = new Map();

  /**
   * Create a CompressedHnswIntegration.
   *
   * @param backend - The underlying HNSW index provider to delegate to
   * @param compressionService - Optional compression service (defaults to new instance)
   */
  constructor(
    backend: IHnswIndexProvider,
    compressionService?: TemporalCompressionService,
  ) {
    this.backend = backend;
    this.compressionService = compressionService ?? createTemporalCompressionService();
  }

  // ==========================================================================
  // IHnswIndexProvider Implementation
  // ==========================================================================

  /**
   * Add a vector to the index.
   *
   * The full-precision vector is passed to the HNSW backend for search.
   * A copy is stored locally for potential future compression.
   * If temporal compression is enabled, the vector is also compressed
   * immediately and the compressed form is stored.
   */
  add(
    id: number,
    vector: Float32Array,
    metadata?: Record<string, unknown>,
  ): void {
    // Always delegate the full-precision vector to the HNSW backend
    this.backend.add(id, vector, metadata);

    const now = new Date();
    const entry: VectorEntry = {
      original: new Float32Array(vector),
      compressed: null,
      tier: null,
      lastAccessedAt: now,
    };

    // If compression is enabled, compress immediately but keep the original
    // in the HNSW index for accurate search
    if (isTemporalCompressionEnabled()) {
      const tier = this.compressionService.classifyTier(now);
      entry.compressed = this.compressionService.compress(vector, tier);
      entry.tier = tier;
    }

    this.vectorEntries.set(id, entry);
  }

  /**
   * Search for the k nearest neighbors.
   *
   * Delegates entirely to the HNSW backend which holds full-precision
   * vectors. Updates access timestamps for returned results so they
   * stay in the hot tier.
   */
  search(query: Float32Array, k: number): SearchResult[] {
    const results = this.backend.search(query, k);

    // Update last-accessed timestamps for returned results
    const now = new Date();
    for (const result of results) {
      const entry = this.vectorEntries.get(result.id);
      if (entry) {
        entry.lastAccessedAt = now;
      }
    }

    return results;
  }

  /**
   * Remove a vector from the index.
   */
  remove(id: number): boolean {
    this.vectorEntries.delete(id);
    return this.backend.remove(id);
  }

  /**
   * Get the number of vectors in the index.
   */
  size(): number {
    return this.backend.size();
  }

  /**
   * Get the configured vector dimensions.
   */
  dimensions(): number {
    return this.backend.dimensions();
  }

  /**
   * Get estimated recall. Delegates to the underlying backend.
   */
  recall(): number {
    return this.backend.recall();
  }

  // ==========================================================================
  // Compression Operations
  // ==========================================================================

  /**
   * Compress vectors in the index based on their access tier.
   *
   * Iterates over all stored vectors and compresses those classified as
   * warm or cold. Hot vectors are left uncompressed for maximum fidelity.
   * After compression, the original float32 data for warm/cold vectors
   * is released to free memory (the HNSW backend still holds its own copy
   * for search operations).
   *
   * @param options - Optional configuration
   * @param options.compressHot - If true, also compress hot-tier vectors (default: false)
   * @returns Statistics about the compression operation
   */
  compressIndex(options?: { compressHot?: boolean }): CompressedHnswBulkResult {
    const compressHot = options?.compressHot ?? false;
    let compressedCount = 0;
    let skippedCount = 0;
    let bytesFreed = 0;
    const byTier: Record<CompressionTier, number> = { hot: 0, warm: 0, cold: 0 };

    for (const [id, entry] of this.vectorEntries) {
      const tier = this.compressionService.classifyTier(entry.lastAccessedAt);

      // Skip hot vectors unless explicitly requested
      if (tier === 'hot' && !compressHot) {
        skippedCount++;
        continue;
      }

      // Skip if already compressed at the same or more aggressive tier
      if (entry.compressed && entry.tier === tier) {
        skippedCount++;
        continue;
      }

      // Need the original vector to compress. If we already freed it,
      // we cannot re-compress (the HNSW backend doesn't expose vectors).
      if (!entry.original) {
        // If we have an existing compressed form at a less aggressive tier,
        // we could decompress and recompress, but that adds error.
        // For now, skip.
        skippedCount++;
        continue;
      }

      const compressed = this.compressionService.compress(entry.original, tier);
      const originalSize = entry.original.byteLength;

      entry.compressed = compressed;
      entry.tier = tier;

      // For warm and cold tiers, release the original to save memory.
      // The HNSW backend still holds its own copy for search.
      if (tier !== 'hot') {
        entry.original = null;
        bytesFreed += originalSize;
      }

      compressedCount++;
      byTier[tier]++;
    }

    logger.debug(
      `compressIndex: compressed=${compressedCount}, skipped=${skippedCount}, freed=${bytesFreed} bytes`,
    );

    return {
      compressedCount,
      skippedCount,
      bytesFreed,
      byTier,
    };
  }

  /**
   * Decompress and retrieve the vector for a given ID.
   *
   * Returns the original vector if still available, otherwise
   * decompresses from the stored compressed form.
   *
   * @param id - The vector ID
   * @returns The decompressed Float32Array, or null if not found
   */
  getVector(id: number): Float32Array | null {
    const entry = this.vectorEntries.get(id);
    if (!entry) return null;

    // Return original if still available
    if (entry.original) return entry.original;

    // Decompress from compressed form
    if (entry.compressed) {
      return this.compressionService.decompress(entry.compressed);
    }

    return null;
  }

  /**
   * Get the compression tier for a specific vector.
   *
   * @param id - The vector ID
   * @returns The tier, or null if not found or not compressed
   */
  getVectorTier(id: number): CompressionTier | null {
    const entry = this.vectorEntries.get(id);
    return entry?.tier ?? null;
  }

  /**
   * Update the last-accessed timestamp for a vector.
   * This affects which tier it falls into during the next compressIndex() call.
   *
   * @param id - The vector ID
   * @param accessDate - The access date (defaults to now)
   */
  touchVector(id: number, accessDate?: Date): void {
    const entry = this.vectorEntries.get(id);
    if (entry) {
      entry.lastAccessedAt = accessDate ?? new Date();
    }
  }

  // ==========================================================================
  // Memory Statistics
  // ==========================================================================

  /**
   * Get memory usage statistics for the compressed index.
   */
  getMemoryStats(): CompressedHnswMemoryStats {
    let uncompressedCount = 0;
    let compressedCount = 0;
    let originalBytes = 0;
    let compressedBytes = 0;
    const compressedByTier: Record<CompressionTier, number> = { hot: 0, warm: 0, cold: 0 };

    for (const entry of this.vectorEntries.values()) {
      if (entry.compressed && entry.tier) {
        compressedCount++;
        compressedByTier[entry.tier]++;
        compressedBytes += entry.compressed.compressedByteSize;
        originalBytes += entry.compressed.originalByteSize;
      } else if (entry.original) {
        uncompressedCount++;
        const byteSize = entry.original.byteLength;
        originalBytes += byteSize;
        compressedBytes += byteSize; // Not compressed, so same size
      }
    }

    const bytesSaved = originalBytes - compressedBytes;
    const savingsPercent = originalBytes > 0
      ? (bytesSaved / originalBytes) * 100
      : 0;

    return {
      totalVectors: this.vectorEntries.size,
      uncompressedCount,
      compressedCount,
      compressedByTier,
      originalBytes,
      compressedBytes,
      bytesSaved,
      savingsPercent,
      compressionEnabled: isTemporalCompressionEnabled(),
    };
  }

  // ==========================================================================
  // Accessors
  // ==========================================================================

  /**
   * Get the underlying HNSW backend.
   * Useful for accessing backend-specific methods (e.g., NativeHnswBackend.getMetrics()).
   */
  getBackend(): IHnswIndexProvider {
    return this.backend;
  }

  /**
   * Get the compression service instance.
   */
  getCompressionService(): TemporalCompressionService {
    return this.compressionService;
  }
}

// ============================================================================
// Bulk Compression Result
// ============================================================================

/**
 * Result of a bulk compression operation via compressIndex().
 */
export interface CompressedHnswBulkResult {
  /** Number of vectors compressed in this operation */
  compressedCount: number;
  /** Number of vectors skipped (already compressed or hot) */
  skippedCount: number;
  /** Bytes freed by releasing original vectors */
  bytesFreed: number;
  /** Breakdown of newly compressed vectors by tier */
  byTier: Record<CompressionTier, number>;
}
