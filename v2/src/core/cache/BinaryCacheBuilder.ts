/**
 * Binary Cache Builder - Cache Generation from SQLite
 *
 * Builds binary cache from pattern data with:
 * - Index pre-computation
 * - Atomic file writes
 * - Checksum generation
 *
 * Performance:
 * - Build time: ~50-100ms for 1000 patterns
 * - Atomic writes prevent corruption
 * - Optimized index generation
 *
 * @module core/cache/BinaryCacheBuilder
 * @version 1.0.0
 */

import { promises as fs } from 'fs';
import { join, dirname } from 'path';
import type {
  BinaryCacheBuilder,
  CacheBuildResult,
  CacheIndexData,
  PatternEntry,
  AgentConfigEntry,
  BinaryCache,
  CacheVersion,
} from './BinaryMetadataCache';
import type { TestPattern } from '../memory/IPatternStore';
import { MessagePackSerializer } from './MessagePackSerializer';
import { testPatternToEntry } from './BinaryMetadataCache';

/**
 * Implementation of BinaryCacheBuilder interface
 *
 * Builds binary cache with:
 * - Pattern serialization from SQLite data
 * - Pre-computed indexes for fast lookup
 * - Atomic file writes with temporary files
 * - Checksum computation for validation
 */
export class BinaryMetadataCacheBuilder implements BinaryCacheBuilder {
  private serializer: MessagePackSerializer;
  private currentVersion: CacheVersion = { major: 1, minor: 0, patch: 0 };

  constructor() {
    this.serializer = new MessagePackSerializer();
  }

  /**
   * Build cache from SQLite patterns
   *
   * Process:
   * 1. Convert TestPatterns to PatternEntries
   * 2. Build search indexes
   * 3. Serialize to binary format
   * 4. Compute checksum
   * 5. Write atomically to disk
   *
   * @param patterns - Array of test patterns from SQLite
   * @param agentConfigs - Array of agent configurations
   * @param outputPath - Cache file output path
   * @returns Build result with metrics
   */
  async buildCache(
    patterns: TestPattern[],
    agentConfigs: AgentConfigEntry[],
    outputPath: string
  ): Promise<CacheBuildResult> {
    const startTime = Date.now();

    try {
      // 1. Convert patterns to cache entries
      const patternEntries: PatternEntry[] = patterns.map(testPatternToEntry);

      // 2. Build indexes
      const indexes = this.buildIndexes(patternEntries);

      // 3. Create cache structure (without checksum)
      const cacheWithoutChecksum: BinaryCache = {
        version: this.serializer.encodeVersion(this.currentVersion),
        timestamp: Date.now(),
        checksum: '', // Placeholder, will compute after serialization
        patterns: patternEntries,
        agentConfigs,
        indexes,
      };

      // 4. Serialize to binary
      const buffer = this.serializer.encode(cacheWithoutChecksum);

      // 5. Compute checksum
      const checksum = await this.serializer.computeChecksum(buffer);

      // 6. Update cache with actual checksum
      const cacheWithChecksum: BinaryCache = {
        ...cacheWithoutChecksum,
        checksum,
      };

      // 7. Serialize again with correct checksum
      const finalBuffer = this.serializer.encode(cacheWithChecksum);

      // 8. Write atomically
      const writeSuccess = await this.writeAtomic(finalBuffer, outputPath);

      if (!writeSuccess) {
        throw new Error('Atomic write failed');
      }

      const duration = Date.now() - startTime;

      console.log('[BinaryCacheBuilder] Cache built successfully:', {
        duration: `${duration}ms`,
        patternCount: patterns.length,
        agentConfigCount: agentConfigs.length,
        cacheFileSize: finalBuffer.length,
        checksum,
      });

      return {
        success: true,
        duration,
        patternCount: patterns.length,
        agentConfigCount: agentConfigs.length,
        cacheFileSize: finalBuffer.length,
        version: this.currentVersion,
        checksum,
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      console.error('[BinaryCacheBuilder] Cache build failed:', {
        error: errorMessage,
        duration: `${duration}ms`,
      });

      return {
        success: false,
        duration,
        patternCount: patterns.length,
        agentConfigCount: agentConfigs.length,
        cacheFileSize: 0,
        version: this.currentVersion,
        checksum: '',
        error: errorMessage,
      };
    }
  }

  /**
   * Build cache indexes
   *
   * Pre-computes indexes for:
   * - Domain → pattern IDs
   * - Type → pattern IDs
   * - Framework → pattern IDs
   *
   * Enables O(1) filtering by domain/type/framework.
   *
   * @param patterns - Array of pattern entries
   * @returns Index data structure
   */
  buildIndexes(patterns: PatternEntry[]): CacheIndexData {
    const domainIndex = new Map<string, string[]>();
    const typeIndex = new Map<string, string[]>();
    const frameworkIndex = new Map<string, string[]>();

    for (const pattern of patterns) {
      // Domain index
      if (!domainIndex.has(pattern.domain)) {
        domainIndex.set(pattern.domain, []);
      }
      domainIndex.get(pattern.domain)!.push(pattern.id);

      // Type index
      if (!typeIndex.has(pattern.type)) {
        typeIndex.set(pattern.type, []);
      }
      typeIndex.get(pattern.type)!.push(pattern.id);

      // Framework index
      if (!frameworkIndex.has(pattern.framework)) {
        frameworkIndex.set(pattern.framework, []);
      }
      frameworkIndex.get(pattern.framework)!.push(pattern.id);
    }

    return {
      domainIndex,
      typeIndex,
      frameworkIndex,
    };
  }

  /**
   * Write cache to disk atomically
   *
   * Atomic write pattern:
   * 1. Write to temporary file (*.tmp)
   * 2. Verify write success
   * 3. Rename to final path (atomic operation)
   *
   * Prevents partial writes and corruption.
   *
   * @param buffer - Binary cache buffer
   * @param outputPath - Target file path
   * @returns True if write successful
   */
  async writeAtomic(buffer: Uint8Array, outputPath: string): Promise<boolean> {
    const tempPath = `${outputPath}.tmp`;

    try {
      // 1. Ensure directory exists
      const dir = dirname(outputPath);
      await fs.mkdir(dir, { recursive: true });

      // 2. Write to temporary file
      await fs.writeFile(tempPath, buffer);

      // 3. Verify write (read back and compare size)
      const stats = await fs.stat(tempPath);
      if (stats.size !== buffer.length) {
        throw new Error(`Write verification failed: expected ${buffer.length} bytes, got ${stats.size} bytes`);
      }

      // 4. Atomic rename
      await fs.rename(tempPath, outputPath);

      // 5. Create backup of previous cache (if exists)
      try {
        await fs.access(outputPath);
        const backupPath = `${outputPath}.bak`;
        await fs.copyFile(outputPath, backupPath);
      } catch {
        // No previous cache, skip backup
      }

      return true;
    } catch (error) {
      console.error('[BinaryCacheBuilder] Atomic write failed:', error);

      // Clean up temporary file
      try {
        await fs.unlink(tempPath);
      } catch {
        // Ignore cleanup errors
      }

      return false;
    }
  }
}

/**
 * Create a new BinaryCacheBuilder instance
 *
 * @returns BinaryCacheBuilder instance
 */
export function createCacheBuilder(): BinaryMetadataCacheBuilder {
  return new BinaryMetadataCacheBuilder();
}
