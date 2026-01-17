/**
 * Cache Validator - Integrity and Version Validation
 *
 * Validates binary cache integrity using:
 * - SHA-256 checksum verification
 * - Semantic version compatibility checks
 * - Pattern entry validation
 *
 * @module core/cache/CacheValidator
 * @version 1.0.0
 */

import type {
  CacheValidator,
  CacheVersion,
  ValidationResult,
  PatternEntry,
} from './BinaryMetadataCache';
import { MessagePackSerializer } from './MessagePackSerializer';

/**
 * Implementation of CacheValidator interface
 *
 * Provides multi-level validation:
 * 1. Checksum validation (SHA-256)
 * 2. Version compatibility (semantic versioning)
 * 3. Pattern entry validation (required fields)
 */
export class BinaryCacheValidator implements CacheValidator {
  private serializer: MessagePackSerializer;

  constructor() {
    this.serializer = new MessagePackSerializer();
  }

  /**
   * Validate cache integrity
   *
   * Performs comprehensive validation:
   * - Checksum matches expected value
   * - Version is compatible with current code
   * - Buffer structure is valid
   *
   * @param buffer - Binary cache buffer
   * @param expectedChecksum - Expected SHA-256 checksum
   * @returns Validation result with detailed diagnostics
   */
  async validate(buffer: Uint8Array, expectedChecksum: string): Promise<ValidationResult> {
    try {
      // 1. Compute actual checksum
      const computedChecksum = await this.serializer.computeChecksum(buffer);
      const checksumValid = computedChecksum === expectedChecksum;

      if (!checksumValid) {
        return {
          valid: false,
          checksumValid: false,
          versionCompatible: false,
          error: `Checksum mismatch: expected ${expectedChecksum}, got ${computedChecksum}`,
          computedChecksum,
        };
      }

      // 2. Decode cache to check structure
      const cache = this.serializer.decode(buffer);

      // 3. Decode version
      const cacheVersion = this.serializer.decodeVersion(cache.version);

      // 4. Check version compatibility (assuming current version is 1.0.0)
      const currentVersion: CacheVersion = { major: 1, minor: 0, patch: 0 };
      const versionCompatible = this.isVersionCompatible(cacheVersion, currentVersion);

      if (!versionCompatible) {
        return {
          valid: false,
          checksumValid: true,
          versionCompatible: false,
          error: `Version incompatible: cache version ${cacheVersion.major}.${cacheVersion.minor}.${cacheVersion.patch}, code version ${currentVersion.major}.${currentVersion.minor}.${currentVersion.patch}`,
          computedChecksum,
          cacheVersion,
        };
      }

      // 5. Validate pattern entries
      for (const pattern of cache.patterns) {
        if (!this.isValidPatternEntry(pattern)) {
          return {
            valid: false,
            checksumValid: true,
            versionCompatible: true,
            error: `Invalid pattern entry: ${pattern.id}`,
            computedChecksum,
            cacheVersion,
          };
        }
      }

      // All validations passed
      return {
        valid: true,
        checksumValid: true,
        versionCompatible: true,
        computedChecksum,
        cacheVersion,
      };
    } catch (error) {
      return {
        valid: false,
        checksumValid: false,
        versionCompatible: false,
        error: `Validation failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }
  }

  /**
   * Check version compatibility
   *
   * Rules:
   * - Major version mismatch: INCOMPATIBLE (breaking changes)
   * - Minor version mismatch: COMPATIBLE (backward compatible)
   * - Patch version mismatch: COMPATIBLE (bug fixes)
   *
   * @param cacheVersion - Version from cache header
   * @param codeVersion - Current code version
   * @returns True if compatible
   */
  isVersionCompatible(cacheVersion: CacheVersion, codeVersion: CacheVersion): boolean {
    // Major version must match exactly
    if (cacheVersion.major !== codeVersion.major) {
      return false;
    }

    // Cache minor version can be less than or equal to code version
    // (newer code can read older cache)
    if (cacheVersion.minor > codeVersion.minor) {
      return false;
    }

    // Patch version is always compatible within same major.minor
    return true;
  }

  /**
   * Validate pattern entry
   *
   * Checks for:
   * - Required fields present
   * - Valid embedding dimensions
   * - Valid metadata values
   *
   * @param entry - Pattern entry to validate
   * @returns True if valid
   */
  isValidPatternEntry(entry: PatternEntry): boolean {
    // Check required fields
    if (!entry.id || typeof entry.id !== 'string') {
      return false;
    }

    if (!entry.type || typeof entry.type !== 'string') {
      return false;
    }

    if (!entry.domain || typeof entry.domain !== 'string') {
      return false;
    }

    if (!entry.framework || typeof entry.framework !== 'string') {
      return false;
    }

    if (!entry.content || typeof entry.content !== 'string') {
      return false;
    }

    // Validate embedding
    if (!(entry.embedding instanceof Float32Array)) {
      return false;
    }

    if (entry.embedding.length === 0) {
      return false;
    }

    // Validate metadata
    if (!entry.metadata) {
      return false;
    }

    if (typeof entry.metadata.coverage !== 'number' || entry.metadata.coverage < 0 || entry.metadata.coverage > 1) {
      return false;
    }

    if (typeof entry.metadata.flakinessScore !== 'number' || entry.metadata.flakinessScore < 0 || entry.metadata.flakinessScore > 1) {
      return false;
    }

    const validVerdicts = ['success', 'failure', 'flaky', 'unknown'];
    if (!validVerdicts.includes(entry.metadata.verdict)) {
      return false;
    }

    return true;
  }
}

/**
 * Create a new BinaryCacheValidator instance
 *
 * @returns BinaryCacheValidator instance
 */
export function createCacheValidator(): BinaryCacheValidator {
  return new BinaryCacheValidator();
}
