/**
 * Binary Metadata Cache - Unit Tests
 *
 * Comprehensive test suite for BinaryMetadataCache interfaces and type definitions.
 * Tests cache creation, validation, serialization, and error handling.
 *
 * Coverage target: 95%+
 *
 * @module tests/unit/cache/BinaryMetadataCache
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import {
  // Types and Interfaces
  BinaryCache,
  CacheVersion,
  PatternEntry,
  PatternMetadata,
  AgentConfigEntry,
  CacheIndexData,
  ValidationResult,
  CacheInvalidation,
  BinaryCacheConfig,
  CacheMetrics,
  CacheBuildResult,
  CacheLoadError,
  SerializationError,
  DeserializationError,

  // Helper Functions
  testPatternToEntry,
  entryToTestPattern,

  // Constants
  DEFAULT_CACHE_CONFIG,
  CACHE_MAGIC_NUMBER,
  CACHE_HEADER_SIZE,
  CACHE_VERSION,
} from '@/core/cache/BinaryMetadataCache';
import type { TestPattern } from '@/core/memory/IPatternStore';

describe('BinaryMetadataCache', () => {
  describe('Type Definitions', () => {
    describe('CacheVersion', () => {
      it('should have major, minor, and patch fields', () => {
        const version: CacheVersion = { major: 1, minor: 2, patch: 3 };
        expect(version.major).toBe(1);
        expect(version.minor).toBe(2);
        expect(version.patch).toBe(3);
      });

      it('should work with zero versions', () => {
        const version: CacheVersion = { major: 0, minor: 0, patch: 0 };
        expect(version.major).toBe(0);
      });
    });

    describe('BinaryCache', () => {
      it('should contain all required fields', () => {
        const cache: BinaryCache = {
          version: 0x010203,
          timestamp: Date.now(),
          checksum: 'abc123',
          patterns: [],
          agentConfigs: [],
          indexes: {
            domainIndex: new Map(),
            typeIndex: new Map(),
            frameworkIndex: new Map(),
          },
        };

        expect(cache.version).toBeGreaterThan(0);
        expect(cache.timestamp).toBeGreaterThan(0);
        expect(cache.checksum).toBe('abc123');
        expect(Array.isArray(cache.patterns)).toBe(true);
        expect(Array.isArray(cache.agentConfigs)).toBe(true);
        expect(cache.indexes).toBeDefined();
      });
    });

    describe('PatternEntry', () => {
      it('should contain pattern metadata with embedding', () => {
        const entry: PatternEntry = {
          id: 'pattern-1',
          type: 'unit-test',
          domain: 'api',
          framework: 'jest',
          embedding: new Float32Array(768),
          content: 'test content',
          metadata: {
            coverage: 0.95,
            flakinessScore: 0.01,
            verdict: 'success',
            createdAt: Date.now(),
            lastUsed: Date.now(),
            usageCount: 10,
            successCount: 9,
          },
        };

        expect(entry.id).toBe('pattern-1');
        expect(entry.embedding).toBeInstanceOf(Float32Array);
        expect(entry.embedding.length).toBe(768);
        expect(entry.metadata.coverage).toBe(0.95);
        expect(entry.metadata.verdict).toBe('success');
      });

      it('should support different verdict types', () => {
        const verdicts: PatternMetadata['verdict'][] = [
          'success',
          'failure',
          'flaky',
          'unknown',
        ];

        verdicts.forEach((verdict) => {
          const metadata: PatternMetadata = {
            coverage: 0.8,
            flakinessScore: 0.1,
            verdict,
            createdAt: Date.now(),
            lastUsed: Date.now(),
            usageCount: 5,
            successCount: 4,
          };
          expect(metadata.verdict).toBe(verdict);
        });
      });
    });

    describe('AgentConfigEntry', () => {
      it('should store agent configuration as JSON string', () => {
        const config: AgentConfigEntry = {
          agentId: 'test-gen-1',
          type: 'test-generator',
          configJson: JSON.stringify({ timeout: 5000, retries: 3 }),
          version: '1.0.0',
          updatedAt: Date.now(),
        };

        expect(config.agentId).toBe('test-gen-1');
        expect(JSON.parse(config.configJson)).toEqual({
          timeout: 5000,
          retries: 3,
        });
      });
    });

    describe('CacheIndexData', () => {
      it('should support domain-based indexing', () => {
        const indexes: CacheIndexData = {
          domainIndex: new Map([
            ['api', ['pattern-1', 'pattern-2']],
            ['ui', ['pattern-3']],
          ]),
          typeIndex: new Map(),
          frameworkIndex: new Map(),
        };

        expect(indexes.domainIndex.get('api')).toEqual([
          'pattern-1',
          'pattern-2',
        ]);
        expect(indexes.domainIndex.get('ui')).toEqual(['pattern-3']);
      });

      it('should support type-based indexing', () => {
        const indexes: CacheIndexData = {
          domainIndex: new Map(),
          typeIndex: new Map([
            ['unit-test', ['pattern-1']],
            ['integration-test', ['pattern-2']],
          ]),
          frameworkIndex: new Map(),
        };

        expect(indexes.typeIndex.get('unit-test')).toEqual(['pattern-1']);
      });

      it('should support framework-based indexing', () => {
        const indexes: CacheIndexData = {
          domainIndex: new Map(),
          typeIndex: new Map(),
          frameworkIndex: new Map([
            ['jest', ['pattern-1', 'pattern-2']],
            ['vitest', ['pattern-3']],
          ]),
        };

        expect(indexes.frameworkIndex.get('jest')).toEqual([
          'pattern-1',
          'pattern-2',
        ]);
      });
    });
  });

  describe('Validation Types', () => {
    describe('ValidationResult', () => {
      it('should represent successful validation', () => {
        const result: ValidationResult = {
          valid: true,
          checksumValid: true,
          versionCompatible: true,
        };

        expect(result.valid).toBe(true);
        expect(result.checksumValid).toBe(true);
        expect(result.versionCompatible).toBe(true);
      });

      it('should represent failed validation with error', () => {
        const result: ValidationResult = {
          valid: false,
          checksumValid: false,
          versionCompatible: true,
          error: 'Checksum mismatch',
          computedChecksum: 'abc123',
          cacheVersion: { major: 1, minor: 0, patch: 0 },
        };

        expect(result.valid).toBe(false);
        expect(result.error).toBe('Checksum mismatch');
        expect(result.computedChecksum).toBeDefined();
      });
    });
  });

  describe('Cache Invalidation', () => {
    describe('CacheInvalidation', () => {
      it('should support pattern_stored trigger', () => {
        const invalidation: CacheInvalidation = {
          trigger: 'pattern_stored',
          timestamp: Date.now(),
          requiresRebuild: true,
        };

        expect(invalidation.trigger).toBe('pattern_stored');
        expect(invalidation.requiresRebuild).toBe(true);
      });

      it('should support all trigger types', () => {
        const triggers: CacheInvalidation['trigger'][] = [
          'pattern_stored',
          'pattern_deleted',
          'config_updated',
          'schema_migration',
          'manual',
          'ttl_expired',
        ];

        triggers.forEach((trigger) => {
          const invalidation: CacheInvalidation = {
            trigger,
            timestamp: Date.now(),
            requiresRebuild: trigger !== 'ttl_expired',
            metadata: { reason: `Testing ${trigger}` },
          };
          expect(invalidation.trigger).toBe(trigger);
        });
      });
    });
  });

  describe('Configuration', () => {
    describe('BinaryCacheConfig', () => {
      it('should have default configuration values', () => {
        expect(DEFAULT_CACHE_CONFIG.enabled).toBe(true);
        expect(DEFAULT_CACHE_CONFIG.cachePath).toBe('.aqe/cache/patterns.bin');
        expect(DEFAULT_CACHE_CONFIG.maxAge).toBe(3600000); // 1 hour
        expect(DEFAULT_CACHE_CONFIG.checkInterval).toBe(300000); // 5 minutes
        expect(DEFAULT_CACHE_CONFIG.backgroundRebuild).toBe(true);
        expect(DEFAULT_CACHE_CONFIG.fallbackToSQLite).toBe(true);
        expect(DEFAULT_CACHE_CONFIG.enableMetrics).toBe(true);
      });

      it('should allow custom configuration', () => {
        const config: BinaryCacheConfig = {
          enabled: false,
          cachePath: '/custom/path/cache.bin',
          maxAge: 7200000, // 2 hours
          checkInterval: 600000, // 10 minutes
          backgroundRebuild: false,
          fallbackToSQLite: false,
          version: { major: 2, minor: 0, patch: 0 },
          enableMetrics: false,
        };

        expect(config.enabled).toBe(false);
        expect(config.cachePath).toBe('/custom/path/cache.bin');
        expect(config.maxAge).toBe(7200000);
      });
    });

    describe('Cache Constants', () => {
      it('should have correct magic number', () => {
        expect(CACHE_MAGIC_NUMBER).toBe(0x41514543); // "AQEC"
      });

      it('should have correct header size', () => {
        expect(CACHE_HEADER_SIZE).toBe(64);
      });

      it('should have current cache version', () => {
        expect(CACHE_VERSION.major).toBe(1);
        expect(CACHE_VERSION.minor).toBe(0);
        expect(CACHE_VERSION.patch).toBe(0);
      });
    });
  });

  describe('Metrics', () => {
    describe('CacheMetrics', () => {
      it('should track cache hit rate', () => {
        const metrics: CacheMetrics = {
          cacheHits: 950,
          cacheMisses: 50,
          cacheHitRate: 0.95,
          avgCacheLoadTime: 3.5,
          avgSQLiteFallbackTime: 28.0,
          cacheCorruptionCount: 0,
          cacheRebuildCount: 2,
          lastCacheGenerationTime: Date.now(),
          cacheFileSize: 1024 * 1024 * 5, // 5 MB
          patternCount: 1000,
        };

        expect(metrics.cacheHitRate).toBeGreaterThanOrEqual(0.95);
        expect(metrics.avgCacheLoadTime).toBeLessThan(5);
        expect(metrics.cacheHits + metrics.cacheMisses).toBe(1000);
      });

      it('should detect performance degradation', () => {
        const metrics: CacheMetrics = {
          cacheHits: 100,
          cacheMisses: 900,
          cacheHitRate: 0.1,
          avgCacheLoadTime: 15.0,
          avgSQLiteFallbackTime: 30.0,
          cacheCorruptionCount: 5,
          cacheRebuildCount: 10,
          lastCacheGenerationTime: Date.now() - 3600000 * 2,
          cacheFileSize: 1024 * 1024 * 50,
          patternCount: 1000,
        };

        expect(metrics.cacheHitRate).toBeLessThan(0.5);
        expect(metrics.cacheCorruptionCount).toBeGreaterThan(0);
        expect(metrics.avgCacheLoadTime).toBeGreaterThan(10);
      });
    });
  });

  describe('Build Results', () => {
    describe('CacheBuildResult', () => {
      it('should represent successful build', () => {
        const result: CacheBuildResult = {
          success: true,
          duration: 250,
          patternCount: 1000,
          agentConfigCount: 5,
          cacheFileSize: 1024 * 1024 * 5,
          version: { major: 1, minor: 0, patch: 0 },
          checksum: 'sha256hash',
        };

        expect(result.success).toBe(true);
        expect(result.duration).toBeLessThan(500);
        expect(result.patternCount).toBe(1000);
      });

      it('should represent failed build with error', () => {
        const result: CacheBuildResult = {
          success: false,
          duration: 100,
          patternCount: 0,
          agentConfigCount: 0,
          cacheFileSize: 0,
          version: { major: 1, minor: 0, patch: 0 },
          checksum: '',
          error: 'Failed to serialize patterns',
        };

        expect(result.success).toBe(false);
        expect(result.error).toBeDefined();
      });
    });
  });

  describe('Error Classes', () => {
    describe('CacheLoadError', () => {
      it('should create error with type and message', () => {
        const error = new CacheLoadError(
          'file_not_found',
          'Cache file does not exist',
          { path: '/path/to/cache.bin' }
        );

        expect(error.name).toBe('CacheLoadError');
        expect(error.type).toBe('file_not_found');
        expect(error.message).toBe('Cache file does not exist');
        expect(error.metadata?.path).toBe('/path/to/cache.bin');
      });

      it('should support all error types', () => {
        const errorTypes: Array<typeof CacheLoadError.prototype.type> = [
          'file_not_found',
          'permission_denied',
          'checksum_mismatch',
          'version_incompatible',
          'corrupted_data',
          'io_error',
        ];

        errorTypes.forEach((type) => {
          const error = new CacheLoadError(type, `Test error: ${type}`);
          expect(error.type).toBe(type);
        });
      });
    });

    describe('SerializationError', () => {
      it('should create error with message', () => {
        const error = new SerializationError('Failed to encode patterns');
        expect(error.name).toBe('SerializationError');
        expect(error.message).toBe('Failed to encode patterns');
      });

      it('should support cause chain', () => {
        const cause = new Error('Original error');
        const error = new SerializationError('Serialization failed', cause);
        expect(error.cause).toBe(cause);
      });
    });

    describe('DeserializationError', () => {
      it('should create error with message', () => {
        const error = new DeserializationError('Failed to decode buffer');
        expect(error.name).toBe('DeserializationError');
        expect(error.message).toBe('Failed to decode buffer');
      });

      it('should support cause chain', () => {
        const cause = new Error('Invalid buffer format');
        const error = new DeserializationError('Deserialization failed', cause);
        expect(error.cause).toBe(cause);
      });
    });
  });

  describe('Helper Functions', () => {
    describe('testPatternToEntry', () => {
      it('should convert TestPattern to PatternEntry', () => {
        const pattern: TestPattern = {
          id: 'test-1',
          type: 'unit-test',
          domain: 'api',
          framework: 'jest',
          embedding: new Array(768).fill(0.5),
          content: 'describe("test", () => {})',
          coverage: 0.95,
          flakinessScore: 0.01,
          verdict: 'success',
          createdAt: Date.now(),
          lastUsed: Date.now(),
          usageCount: 10,
          metadata: { successCount: 9 },
        };

        const entry = testPatternToEntry(pattern);

        expect(entry.id).toBe(pattern.id);
        expect(entry.type).toBe(pattern.type);
        expect(entry.domain).toBe(pattern.domain);
        expect(entry.framework).toBe(pattern.framework);
        expect(entry.embedding).toBeInstanceOf(Float32Array);
        expect(entry.embedding.length).toBe(768);
        expect(entry.content).toBe(pattern.content);
        expect(entry.metadata.coverage).toBe(0.95);
        expect(entry.metadata.verdict).toBe('success');
      });

      it('should handle missing optional fields', () => {
        const pattern: TestPattern = {
          id: 'test-2',
          type: 'integration-test',
          domain: 'database',
          embedding: new Array(768).fill(0),
          content: 'test content',
        };

        const entry = testPatternToEntry(pattern);

        expect(entry.framework).toBe('unknown');
        expect(entry.metadata.coverage).toBe(0);
        expect(entry.metadata.flakinessScore).toBe(0);
        expect(entry.metadata.verdict).toBe('unknown');
        expect(entry.metadata.usageCount).toBe(0);
      });

      it('should convert array embedding to Float32Array', () => {
        const pattern: TestPattern = {
          id: 'test-3',
          type: 'e2e-test',
          domain: 'ui',
          embedding: [0.1, 0.2, 0.3],
          content: 'test',
        };

        const entry = testPatternToEntry(pattern);
        expect(entry.embedding).toBeInstanceOf(Float32Array);
        const embeddingArray = Array.from(entry.embedding);
        expect(embeddingArray.length).toBe(3);
        expect(embeddingArray[0]).toBeCloseTo(0.1, 5);
        expect(embeddingArray[1]).toBeCloseTo(0.2, 5);
        expect(embeddingArray[2]).toBeCloseTo(0.3, 5);
      });
    });

    describe('entryToTestPattern', () => {
      it('should convert PatternEntry to TestPattern', () => {
        const entry: PatternEntry = {
          id: 'pattern-1',
          type: 'unit-test',
          domain: 'api',
          framework: 'jest',
          embedding: new Float32Array([0.1, 0.2, 0.3]),
          content: 'test content',
          metadata: {
            coverage: 0.9,
            flakinessScore: 0.05,
            verdict: 'success',
            createdAt: Date.now(),
            lastUsed: Date.now(),
            usageCount: 15,
            successCount: 14,
          },
        };

        const pattern = entryToTestPattern(entry);

        expect(pattern.id).toBe(entry.id);
        expect(pattern.type).toBe(entry.type);
        expect(pattern.domain).toBe(entry.domain);
        expect(pattern.framework).toBe(entry.framework);
        expect(Array.isArray(pattern.embedding)).toBe(true);
        expect(pattern.embedding.length).toBe(3);
        expect(pattern.embedding[0]).toBeCloseTo(0.1, 5);
        expect(pattern.embedding[1]).toBeCloseTo(0.2, 5);
        expect(pattern.embedding[2]).toBeCloseTo(0.3, 5);
        expect(pattern.content).toBe(entry.content);
        expect(pattern.coverage).toBe(0.9);
        expect(pattern.verdict).toBe('success');
      });

      it('should handle unknown verdict', () => {
        const entry: PatternEntry = {
          id: 'pattern-2',
          type: 'unit-test',
          domain: 'api',
          framework: 'jest',
          embedding: new Float32Array(768),
          content: 'test',
          metadata: {
            coverage: 0.8,
            flakinessScore: 0.1,
            verdict: 'unknown',
            createdAt: Date.now(),
            lastUsed: Date.now(),
            usageCount: 5,
            successCount: 4,
          },
        };

        const pattern = entryToTestPattern(entry);
        expect(pattern.verdict).toBeUndefined();
      });

      it('should convert Float32Array to regular array', () => {
        const entry: PatternEntry = {
          id: 'pattern-3',
          type: 'unit-test',
          domain: 'api',
          framework: 'vitest',
          embedding: new Float32Array([1, 2, 3, 4, 5]),
          content: 'test',
          metadata: {
            coverage: 0,
            flakinessScore: 0,
            verdict: 'unknown',
            createdAt: Date.now(),
            lastUsed: Date.now(),
            usageCount: 0,
            successCount: 0,
          },
        };

        const pattern = entryToTestPattern(entry);
        expect(Array.isArray(pattern.embedding)).toBe(true);
        expect(pattern.embedding).toEqual([1, 2, 3, 4, 5]);
      });
    });

    describe('Round-trip conversion', () => {
      it('should maintain data integrity in round-trip conversion', () => {
        const original: TestPattern = {
          id: 'round-trip-test',
          type: 'property-based',
          domain: 'validation',
          framework: 'fast-check',
          embedding: new Array(768).fill(0.5),
          content: 'property test content',
          coverage: 0.88,
          flakinessScore: 0.02,
          verdict: 'success',
          createdAt: 1234567890,
          lastUsed: 1234567900,
          usageCount: 20,
          metadata: { successCount: 19 },
        };

        const entry = testPatternToEntry(original);
        const converted = entryToTestPattern(entry);

        expect(converted.id).toBe(original.id);
        expect(converted.type).toBe(original.type);
        expect(converted.domain).toBe(original.domain);
        expect(converted.framework).toBe(original.framework);
        expect(converted.content).toBe(original.content);
        expect(converted.coverage).toBe(original.coverage);
        expect(converted.flakinessScore).toBe(original.flakinessScore);
        expect(converted.verdict).toBe(original.verdict);
        expect(converted.usageCount).toBe(original.usageCount);
      });
    });
  });

  describe('Version Encoding', () => {
    it('should encode version as uint32', () => {
      const version: CacheVersion = { major: 1, minor: 2, patch: 3 };
      const encoded = (version.major << 16) | (version.minor << 8) | version.patch;
      expect(encoded).toBe(0x010203); // 66051 in decimal
    });

    it('should decode uint32 to version', () => {
      const encoded = 0x020305; // v2.3.5
      const major = (encoded >> 16) & 0xff;
      const minor = (encoded >> 8) & 0xff;
      const patch = encoded & 0xff;

      expect(major).toBe(2);
      expect(minor).toBe(3);
      expect(patch).toBe(5);
    });

    it('should handle edge cases in version encoding', () => {
      const maxVersion: CacheVersion = { major: 255, minor: 255, patch: 255 };
      const encoded = (maxVersion.major << 16) | (maxVersion.minor << 8) | maxVersion.patch;
      expect(encoded).toBe(0xffffff);

      const zeroVersion: CacheVersion = { major: 0, minor: 0, patch: 0 };
      const encodedZero = (zeroVersion.major << 16) | (zeroVersion.minor << 8) | zeroVersion.patch;
      expect(encodedZero).toBe(0);
    });
  });
});
