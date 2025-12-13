/**
 * Binary Cache Implementation Tests
 *
 * Tests the binary cache serialization, validation, and management.
 * Optimized for DevPod/Codespaces memory constraints.
 */

import * as path from 'path';
import { promises as fs } from 'fs';
import {
  BinaryCacheSerializerImpl,
  BinaryCacheValidatorImpl,
  BinaryCacheInvalidatorImpl,
  BinaryCacheReaderImpl,
  BinaryCacheBuilderImpl,
  createBinaryCacheManager,
} from '../../../src/core/cache/BinaryCacheImpl';
import {
  type PatternEntry,
  type AgentConfigEntry,
  type BinaryCache,
  type CacheVersion,
  CACHE_VERSION,
  DEFAULT_CACHE_CONFIG,
} from '../../../src/core/cache/BinaryMetadataCache';
import type { TestPattern } from '../../../src/core/memory/IPatternStore';

// Test data directory
const TEST_CACHE_DIR = path.join(__dirname, '.test-cache');
const TEST_CACHE_PATH = path.join(TEST_CACHE_DIR, 'test-patterns.bin');

// Helper to create test pattern
function createTestPattern(id: string, domain: string): TestPattern {
  return {
    id,
    type: 'unit-test',
    domain,
    framework: 'jest',
    embedding: new Array(64).fill(0).map((_, i) => Math.sin(i * 0.1)),
    content: `Test pattern ${id}`,
    coverage: 0.85,
    flakinessScore: 0.1,
    verdict: 'success',
    createdAt: Date.now(),
    lastUsed: Date.now(),
    usageCount: 5,
    metadata: { successCount: 4 },
  };
}

describe('BinaryCacheImpl', () => {
  beforeAll(async () => {
    await fs.mkdir(TEST_CACHE_DIR, { recursive: true });
  });

  afterAll(async () => {
    try {
      await fs.rm(TEST_CACHE_DIR, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe('BinaryCacheSerializerImpl', () => {
    let serializer: BinaryCacheSerializerImpl;

    beforeEach(() => {
      serializer = new BinaryCacheSerializerImpl();
    });

    it('should encode and decode version correctly', () => {
      const version: CacheVersion = { major: 1, minor: 2, patch: 3 };
      const encoded = serializer.encodeVersion(version);
      const decoded = serializer.decodeVersion(encoded);

      expect(decoded.major).toBe(1);
      expect(decoded.minor).toBe(2);
      expect(decoded.patch).toBe(3);
    });

    it('should serialize and deserialize cache', () => {
      const cache: BinaryCache = {
        version: serializer.encodeVersion(CACHE_VERSION),
        timestamp: Date.now(),
        checksum: '',
        patterns: [
          {
            id: 'test-1',
            type: 'unit-test',
            domain: 'api',
            framework: 'jest',
            embedding: new Float32Array([0.1, 0.2, 0.3]),
            content: 'Test content',
            metadata: {
              coverage: 0.8,
              flakinessScore: 0.1,
              verdict: 'success',
              createdAt: Date.now(),
              lastUsed: Date.now(),
              usageCount: 5,
              successCount: 4,
            },
          },
        ],
        agentConfigs: [],
        indexes: {
          domainIndex: new Map([['api', ['test-1']]]),
          typeIndex: new Map([['unit-test', ['test-1']]]),
          frameworkIndex: new Map([['jest', ['test-1']]]),
        },
      };

      const buffer = serializer.encode(cache);
      expect(buffer.length).toBeGreaterThan(0);

      const decoded = serializer.decode(buffer);
      expect(decoded.patterns.length).toBe(1);
      expect(decoded.patterns[0].id).toBe('test-1');
      expect(decoded.patterns[0].embedding).toBeInstanceOf(Float32Array);
      expect(decoded.indexes.domainIndex.get('api')).toContain('test-1');
    });

    it('should compute checksum', async () => {
      const buffer = new Uint8Array([1, 2, 3, 4, 5]);
      const checksum = await serializer.computeChecksum(buffer);

      expect(checksum).toHaveLength(64); // SHA-256 hex is 64 chars
      expect(checksum).toMatch(/^[a-f0-9]+$/);
    });
  });

  describe('BinaryCacheValidatorImpl', () => {
    let validator: BinaryCacheValidatorImpl;

    beforeEach(() => {
      validator = new BinaryCacheValidatorImpl();
    });

    it('should validate version compatibility', () => {
      // Same major version
      expect(validator.isVersionCompatible(
        { major: 1, minor: 0, patch: 0 },
        { major: 1, minor: 0, patch: 0 }
      )).toBe(true);

      // Cache with older minor version
      expect(validator.isVersionCompatible(
        { major: 1, minor: 0, patch: 0 },
        { major: 1, minor: 1, patch: 0 }
      )).toBe(true);

      // Different major version
      expect(validator.isVersionCompatible(
        { major: 2, minor: 0, patch: 0 },
        { major: 1, minor: 0, patch: 0 }
      )).toBe(false);

      // Cache with newer minor version
      expect(validator.isVersionCompatible(
        { major: 1, minor: 2, patch: 0 },
        { major: 1, minor: 1, patch: 0 }
      )).toBe(false);
    });

    it('should validate pattern entries', () => {
      const validEntry: PatternEntry = {
        id: 'test-1',
        type: 'unit-test',
        domain: 'api',
        framework: 'jest',
        embedding: new Float32Array([0.1, 0.2]),
        content: 'Test',
        metadata: {
          coverage: 0.8,
          flakinessScore: 0.1,
          verdict: 'success',
          createdAt: Date.now(),
          lastUsed: Date.now(),
          usageCount: 1,
          successCount: 1,
        },
      };

      expect(validator.isValidPatternEntry(validEntry)).toBe(true);

      // Invalid: empty ID
      expect(validator.isValidPatternEntry({ ...validEntry, id: '' })).toBe(false);

      // Invalid: empty embedding
      expect(validator.isValidPatternEntry({
        ...validEntry,
        embedding: new Float32Array([]),
      })).toBe(false);
    });
  });

  describe('BinaryCacheInvalidatorImpl', () => {
    let invalidator: BinaryCacheInvalidatorImpl;

    beforeEach(() => {
      invalidator = new BinaryCacheInvalidatorImpl();
    });

    it('should track stale events', () => {
      const timestamp = Date.now();

      invalidator.markStale({
        trigger: 'pattern_stored',
        timestamp,
        requiresRebuild: true,
      });

      expect(invalidator.isCacheValid(timestamp - 1000)).toBe(false);
      expect(invalidator.isCacheValid(timestamp + 1000)).toBe(true);
    });

    it('should check cache freshness', () => {
      const now = Date.now();
      const ttl = 3600000; // 1 hour

      // Fresh cache (30 min old)
      expect(invalidator.isCacheFresh(now - 1800000, ttl)).toBe(true);

      // Stale cache (2 hours old)
      expect(invalidator.isCacheFresh(now - 7200000, ttl)).toBe(false);
    });

    it('should recommend background rebuild', () => {
      const now = Date.now();
      const ttl = 3600000; // 1 hour

      // Cache at 50% age - no rebuild
      expect(invalidator.shouldBackgroundRebuild(now - 1800000, ttl)).toBe(false);

      // Cache at 85% age - should rebuild
      expect(invalidator.shouldBackgroundRebuild(now - 3060000, ttl)).toBe(true);
    });
  });

  describe('BinaryCacheBuilderImpl', () => {
    let builder: BinaryCacheBuilderImpl;

    beforeEach(() => {
      builder = new BinaryCacheBuilderImpl();
    });

    it('should build cache from patterns', async () => {
      const patterns: TestPattern[] = [
        createTestPattern('p1', 'api'),
        createTestPattern('p2', 'api'),
        createTestPattern('p3', 'ui'),
      ];

      const result = await builder.buildCache(patterns, [], TEST_CACHE_PATH);

      expect(result.success).toBe(true);
      expect(result.patternCount).toBe(3);
      expect(result.cacheFileSize).toBeGreaterThan(0);
      expect(result.checksum).toHaveLength(64);
    });

    it('should build indexes correctly', () => {
      const entries: PatternEntry[] = [
        {
          id: 'p1',
          type: 'unit-test',
          domain: 'api',
          framework: 'jest',
          embedding: new Float32Array([0.1]),
          content: 'Test',
          metadata: {
            coverage: 0.8,
            flakinessScore: 0.1,
            verdict: 'success',
            createdAt: Date.now(),
            lastUsed: Date.now(),
            usageCount: 1,
            successCount: 1,
          },
        },
        {
          id: 'p2',
          type: 'integration-test',
          domain: 'api',
          framework: 'vitest',
          embedding: new Float32Array([0.2]),
          content: 'Test 2',
          metadata: {
            coverage: 0.9,
            flakinessScore: 0.05,
            verdict: 'success',
            createdAt: Date.now(),
            lastUsed: Date.now(),
            usageCount: 2,
            successCount: 2,
          },
        },
      ];

      const indexes = builder.buildIndexes(entries);

      expect(indexes.domainIndex.get('api')).toEqual(['p1', 'p2']);
      expect(indexes.typeIndex.get('unit-test')).toEqual(['p1']);
      expect(indexes.typeIndex.get('integration-test')).toEqual(['p2']);
      expect(indexes.frameworkIndex.get('jest')).toEqual(['p1']);
      expect(indexes.frameworkIndex.get('vitest')).toEqual(['p2']);
    });
  });

  describe('BinaryCacheReaderImpl', () => {
    let builder: BinaryCacheBuilderImpl;

    beforeEach(async () => {
      builder = new BinaryCacheBuilderImpl();

      // Build a cache file first
      const patterns: TestPattern[] = [
        createTestPattern('reader-p1', 'api'),
        createTestPattern('reader-p2', 'ui'),
      ];
      await builder.buildCache(patterns, [], TEST_CACHE_PATH);
    });

    it('should initialize and load cache', async () => {
      const reader = new BinaryCacheReaderImpl();
      const success = await reader.initialize(TEST_CACHE_PATH, DEFAULT_CACHE_CONFIG);

      expect(success).toBe(true);

      const metadata = reader.getCacheMetadata();
      expect(metadata.patternCount).toBe(2);
      expect(metadata.fileSize).toBeGreaterThan(0);

      reader.close();
    });

    it('should retrieve patterns by ID', async () => {
      const reader = new BinaryCacheReaderImpl();
      await reader.initialize(TEST_CACHE_PATH, DEFAULT_CACHE_CONFIG);

      const pattern = reader.getPattern('reader-p1');
      expect(pattern).not.toBeNull();
      expect(pattern!.id).toBe('reader-p1');
      expect(pattern!.domain).toBe('api');

      reader.close();
    });

    it('should retrieve patterns by domain', async () => {
      const reader = new BinaryCacheReaderImpl();
      await reader.initialize(TEST_CACHE_PATH, DEFAULT_CACHE_CONFIG);

      const apiPatterns = reader.getPatternsByDomain('api');
      expect(apiPatterns.length).toBe(1);
      expect(apiPatterns[0].domain).toBe('api');

      reader.close();
    });

    it('should check validity based on age', async () => {
      const reader = new BinaryCacheReaderImpl();
      await reader.initialize(TEST_CACHE_PATH, DEFAULT_CACHE_CONFIG);

      // Fresh cache should be valid
      expect(reader.isValid()).toBe(true);

      reader.close();
    });
  });

  describe('BinaryCacheManager (via createBinaryCacheManager)', () => {
    it('should build and load cache', async () => {
      const manager = createBinaryCacheManager({
        ...DEFAULT_CACHE_CONFIG,
        cachePath: path.join(TEST_CACHE_DIR, 'manager-test.bin'),
      });

      const patterns: TestPattern[] = [
        createTestPattern('mgr-p1', 'api'),
        createTestPattern('mgr-p2', 'ui'),
      ];

      const buildResult = await manager.buildAndSave(patterns);
      expect(buildResult.success).toBe(true);

      const pattern = manager.getPattern('mgr-p1');
      expect(pattern).not.toBeNull();
      expect(pattern!.id).toBe('mgr-p1');

      const metrics = manager.getMetrics();
      expect(metrics.cacheHits).toBeGreaterThan(0);
      expect(metrics.patternCount).toBe(2);

      manager.close();
    });

    it('should track cache metrics', async () => {
      const manager = createBinaryCacheManager({
        ...DEFAULT_CACHE_CONFIG,
        cachePath: path.join(TEST_CACHE_DIR, 'metrics-test.bin'),
      });

      await manager.buildAndSave([createTestPattern('metrics-p1', 'api')]);

      // Hit
      manager.getPattern('metrics-p1');
      // Miss
      manager.getPattern('nonexistent');

      const metrics = manager.getMetrics();
      expect(metrics.cacheHits).toBe(1);
      expect(metrics.cacheMisses).toBe(1);
      expect(metrics.cacheHitRate).toBe(0.5);

      manager.close();
    });

    it('should handle invalidation', async () => {
      const manager = createBinaryCacheManager({
        ...DEFAULT_CACHE_CONFIG,
        cachePath: path.join(TEST_CACHE_DIR, 'invalidation-test.bin'),
      });

      await manager.buildAndSave([createTestPattern('inv-p1', 'api')]);

      expect(manager.isValid()).toBe(true);

      // Invalidation marks cache as stale
      manager.invalidate('pattern_stored');

      // Verify we can still retrieve patterns (graceful degradation)
      const pattern = manager.getPattern('inv-p1');
      expect(pattern).not.toBeNull();

      // Note: shouldRebuild() is based on TTL age, not invalidation events
      // A freshly built cache won't trigger rebuild based on age alone

      manager.close();
    });
  });
});
