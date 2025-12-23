/**
 * DistributedPatternLibrary Tests
 *
 * Comprehensive test suite for distributed pattern storage with eventual consistency
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import {
  DistributedPatternLibrary,
  ConflictResolution,
  DistributedPatternConfig
} from '../../src/memory/DistributedPatternLibrary';
import { TestPattern } from '../../src/core/memory/IPatternStore';

describe('DistributedPatternLibrary', () => {
  let library: DistributedPatternLibrary;
  let config: DistributedPatternConfig;

  beforeEach(async () => {
    config = {
      agentId: 'agent-1',
      dimension: 128,
      compressionThreshold: 1024,
      autoCompress: true,
      conflictResolution: ConflictResolution.VECTOR_CLOCK
    };
    library = new DistributedPatternLibrary(config);
    await library.initialize();
  });

  afterEach(async () => {
    await library.clear();
  });

  describe('Pattern Storage', () => {
    it('should store a pattern with vector clock', async () => {
      const pattern: TestPattern = {
        id: 'pattern-1',
        type: 'unit',
        domain: 'auth',
        embedding: new Array(128).fill(0.5),
        content: 'test pattern',
        coverage: 0.9
      };

      await library.storePattern(pattern);
      const retrieved = await library.getPattern('pattern-1');

      expect(retrieved).toBeDefined();
      expect(retrieved?.id).toBe('pattern-1');
      expect(retrieved?.type).toBe('unit');
      expect(retrieved?.domain).toBe('auth');
    });

    it('should handle 1000+ patterns efficiently', async () => {
      const startTime = Date.now();
      const patterns: TestPattern[] = [];

      // Generate 1000 patterns
      for (let i = 0; i < 1000; i++) {
        patterns.push({
          id: `pattern-${i}`,
          type: 'unit',
          domain: 'test',
          embedding: new Array(128).fill(Math.random()),
          content: `test pattern ${i}`,
          coverage: Math.random()
        });
      }

      // Store all patterns
      for (const pattern of patterns) {
        await library.storePattern(pattern);
      }

      const storageTime = Date.now() - startTime;
      const stats = await library.getStats();

      expect(stats.totalPatterns).toBe(1000);
      expect(storageTime).toBeLessThan(10000); // Should complete in < 10 seconds
    });

    it('should compress large patterns (>10KB)', async () => {
      const largeContent = 'x'.repeat(15000); // 15KB content
      const pattern: TestPattern = {
        id: 'large-pattern',
        type: 'integration',
        domain: 'api',
        embedding: new Array(128).fill(0.5),
        content: largeContent,
        coverage: 0.85
      };

      await library.storePattern(pattern);
      const stats = await library.getStats();

      expect(stats.compressedPatterns).toBeGreaterThan(0);
      expect(stats.averageCompressionRatio).toBeLessThan(1);

      // Verify retrieval works correctly
      const retrieved = await library.getPattern('large-pattern');
      expect(retrieved?.content).toBe(largeContent);
    });

    it('should update existing patterns', async () => {
      const pattern: TestPattern = {
        id: 'pattern-update',
        type: 'unit',
        domain: 'auth',
        embedding: new Array(128).fill(0.5),
        content: 'original content',
        coverage: 0.7
      };

      await library.storePattern(pattern);

      // Update pattern
      pattern.content = 'updated content';
      pattern.coverage = 0.9;
      await library.updatePattern(pattern);

      const retrieved = await library.getPattern('pattern-update');
      expect(retrieved?.content).toBe('updated content');
      expect(retrieved?.coverage).toBe(0.9);
    });

    it('should delete patterns', async () => {
      const pattern: TestPattern = {
        id: 'pattern-delete',
        type: 'unit',
        domain: 'auth',
        embedding: new Array(128).fill(0.5),
        content: 'to be deleted',
        coverage: 0.8
      };

      await library.storePattern(pattern);
      const deleted = await library.deletePattern('pattern-delete');

      expect(deleted).toBe(true);

      const retrieved = await library.getPattern('pattern-delete');
      expect(retrieved).toBeNull();
    });
  });

  describe('Pattern Lookup Performance', () => {
    beforeEach(async () => {
      // Seed with 100 patterns
      for (let i = 0; i < 100; i++) {
        await library.storePattern({
          id: `pattern-${i}`,
          type: 'unit',
          domain: 'test',
          embedding: new Array(128).fill(Math.random()),
          content: `test pattern ${i}`,
          coverage: Math.random()
        });
      }
    });

    it('should achieve <100ms p99 lookup latency', async () => {
      const latencies: number[] = [];

      // Perform 100 lookups
      for (let i = 0; i < 100; i++) {
        const patternId = `pattern-${Math.floor(Math.random() * 100)}`;
        const startTime = Date.now();
        await library.getPattern(patternId);
        const latency = Date.now() - startTime;
        latencies.push(latency);
      }

      // Calculate p99
      latencies.sort((a, b) => a - b);
      const p99Index = Math.floor(latencies.length * 0.99);
      const p99Latency = latencies[p99Index];

      expect(p99Latency).toBeLessThan(100);
    });

    it('should use cache for repeated lookups', async () => {
      const patternId = 'pattern-50';

      // First lookup (cold)
      const start1 = Date.now();
      await library.getPattern(patternId);
      const latency1 = Date.now() - start1;

      // Second lookup (cached)
      const start2 = Date.now();
      await library.getPattern(patternId);
      const latency2 = Date.now() - start2;

      // Cached lookup should be faster
      expect(latency2).toBeLessThanOrEqual(latency1);
    });
  });

  describe('Vector Clock Versioning', () => {
    it('should increment vector clock on updates', async () => {
      const pattern: TestPattern = {
        id: 'pattern-vc',
        type: 'unit',
        domain: 'auth',
        embedding: new Array(128).fill(0.5),
        content: 'version 1',
        coverage: 0.7
      };

      await library.storePattern(pattern);
      const exported1 = await library.exportPatterns();
      const version1 = exported1[0].vectorClock;

      // Update pattern
      pattern.content = 'version 2';
      await library.updatePattern(pattern);
      const exported2 = await library.exportPatterns();
      const version2 = exported2[0].vectorClock;

      expect(version2['agent-1']).toBeGreaterThan(version1['agent-1']);
    });

    it('should track multiple agents in vector clock', async () => {
      const pattern: TestPattern = {
        id: 'pattern-multi-agent',
        type: 'unit',
        domain: 'auth',
        embedding: new Array(128).fill(0.5),
        content: 'test',
        coverage: 0.8
      };

      // Store from agent-1
      await library.storePattern(pattern, 'agent-1');

      // Update from agent-2
      await library.storePattern(pattern, 'agent-2');

      // Update from agent-3
      await library.storePattern(pattern, 'agent-3');

      const exported = await library.exportPatterns();
      const vectorClock = exported[0].vectorClock;

      expect(Object.keys(vectorClock).length).toBeGreaterThanOrEqual(3);
      expect(vectorClock['agent-1']).toBeGreaterThan(0);
      expect(vectorClock['agent-2']).toBeGreaterThan(0);
      expect(vectorClock['agent-3']).toBeGreaterThan(0);
    });
  });

  describe('Conflict Resolution', () => {
    it('should resolve conflicts using vector clock by default', async () => {
      const pattern1: TestPattern = {
        id: 'conflict-pattern',
        type: 'unit',
        domain: 'auth',
        embedding: new Array(128).fill(0.5),
        content: 'version from agent-1',
        coverage: 0.7
      };

      const pattern2: TestPattern = {
        id: 'conflict-pattern',
        type: 'unit',
        domain: 'auth',
        embedding: new Array(128).fill(0.6),
        content: 'version from agent-2',
        coverage: 0.8
      };

      await library.storePattern(pattern1, 'agent-1');
      await library.storePattern(pattern2, 'agent-2');

      const retrieved = await library.getPattern('conflict-pattern');
      expect(retrieved).toBeDefined();
      expect(['version from agent-1', 'version from agent-2']).toContain(retrieved?.content);
    });

    it('should use last write wins strategy', async () => {
      const lwwLibrary = new DistributedPatternLibrary({
        ...config,
        conflictResolution: ConflictResolution.LAST_WRITE_WINS
      });
      await lwwLibrary.initialize();

      const pattern1: TestPattern = {
        id: 'lww-pattern',
        type: 'unit',
        domain: 'auth',
        embedding: new Array(128).fill(0.5),
        content: 'first write',
        coverage: 0.7
      };

      await lwwLibrary.storePattern(pattern1);
      await new Promise(resolve => setTimeout(resolve, 10)); // Small delay

      const pattern2 = { ...pattern1, content: 'second write' };
      await lwwLibrary.storePattern(pattern2);

      const retrieved = await lwwLibrary.getPattern('lww-pattern');
      expect(retrieved?.content).toBe('second write');

      await lwwLibrary.clear();
    });

    it('should use highest confidence strategy', async () => {
      const hcLibrary = new DistributedPatternLibrary({
        ...config,
        conflictResolution: ConflictResolution.HIGHEST_CONFIDENCE
      });
      await hcLibrary.initialize();

      const pattern1: TestPattern = {
        id: 'hc-pattern',
        type: 'unit',
        domain: 'auth',
        embedding: new Array(128).fill(0.5),
        content: 'low confidence',
        coverage: 0.6
      };

      const pattern2: TestPattern = {
        id: 'hc-pattern',
        type: 'unit',
        domain: 'auth',
        embedding: new Array(128).fill(0.7),
        content: 'high confidence',
        coverage: 0.95
      };

      await hcLibrary.storePattern(pattern1);
      await hcLibrary.storePattern(pattern2);

      const retrieved = await hcLibrary.getPattern('hc-pattern');
      expect(retrieved?.content).toBe('high confidence');

      await hcLibrary.clear();
    });
  });

  describe('Pattern Merging', () => {
    it('should merge patterns from remote agent', async () => {
      const remoteLibrary = new DistributedPatternLibrary({
        agentId: 'agent-2',
        dimension: 128
      });
      await remoteLibrary.initialize();

      // Create patterns on remote
      for (let i = 0; i < 10; i++) {
        await remoteLibrary.storePattern({
          id: `remote-pattern-${i}`,
          type: 'unit',
          domain: 'remote',
          embedding: new Array(128).fill(Math.random()),
          content: `remote pattern ${i}`,
          coverage: Math.random()
        });
      }

      // Export from remote and merge to local
      const remotePatterns = await remoteLibrary.exportPatterns();
      const mergedCount = await library.mergePatterns(remotePatterns);

      expect(mergedCount).toBe(10);

      const stats = await library.getStats();
      expect(stats.totalPatterns).toBe(10);

      await remoteLibrary.clear();
    });

    it('should handle 99.9% consistency after sync', async () => {
      // Create 3 libraries
      const lib1 = new DistributedPatternLibrary({ agentId: 'agent-1', dimension: 128 });
      const lib2 = new DistributedPatternLibrary({ agentId: 'agent-2', dimension: 128 });
      const lib3 = new DistributedPatternLibrary({ agentId: 'agent-3', dimension: 128 });

      await lib1.initialize();
      await lib2.initialize();
      await lib3.initialize();

      // Create 100 patterns on lib1
      for (let i = 0; i < 100; i++) {
        await lib1.storePattern({
          id: `pattern-${i}`,
          type: 'unit',
          domain: 'test',
          embedding: new Array(128).fill(Math.random()),
          content: `test pattern ${i}`,
          coverage: Math.random()
        });
      }

      // Sync to lib2 and lib3
      const patterns1 = await lib1.exportPatterns();
      await lib2.mergePatterns(patterns1);
      await lib3.mergePatterns(patterns1);

      // Verify consistency
      const stats1 = await lib1.getStats();
      const stats2 = await lib2.getStats();
      const stats3 = await lib3.getStats();

      expect(stats1.totalPatterns).toBe(100);
      expect(stats2.totalPatterns).toBe(100);
      expect(stats3.totalPatterns).toBe(100);

      // Check consistency (should be 100%)
      const consistency = (stats2.totalPatterns / stats1.totalPatterns) * 100;
      expect(consistency).toBeGreaterThanOrEqual(99.9);

      await lib1.clear();
      await lib2.clear();
      await lib3.clear();
    });
  });

  describe('Pattern Filtering', () => {
    beforeEach(async () => {
      // Seed with diverse patterns
      await library.storePattern({
        id: 'unit-auth-1',
        type: 'unit',
        domain: 'auth',
        framework: 'jest',
        embedding: new Array(128).fill(0.5),
        content: 'auth unit test',
        coverage: 0.9
      });

      await library.storePattern({
        id: 'integration-api-1',
        type: 'integration',
        domain: 'api',
        framework: 'mocha',
        embedding: new Array(128).fill(0.5),
        content: 'api integration test',
        coverage: 0.85
      });

      await library.storePattern({
        id: 'unit-db-1',
        type: 'unit',
        domain: 'database',
        framework: 'jest',
        embedding: new Array(128).fill(0.5),
        content: 'db unit test',
        coverage: 0.75
      });
    });

    it('should filter patterns by type', async () => {
      const unitPatterns = await library.getPatterns({ type: 'unit' });
      expect(unitPatterns.length).toBe(2);
      expect(unitPatterns.every(p => p.type === 'unit')).toBe(true);
    });

    it('should filter patterns by domain', async () => {
      const authPatterns = await library.getPatterns({ domain: 'auth' });
      expect(authPatterns.length).toBe(1);
      expect(authPatterns[0].domain).toBe('auth');
    });

    it('should filter patterns by framework', async () => {
      const jestPatterns = await library.getPatterns({ framework: 'jest' });
      expect(jestPatterns.length).toBe(2);
      expect(jestPatterns.every(p => p.framework === 'jest')).toBe(true);
    });

    it('should filter patterns by minimum confidence', async () => {
      const highConfidencePatterns = await library.getPatterns({ minConfidence: 0.8 });
      expect(highConfidencePatterns.length).toBe(2);
      expect(highConfidencePatterns.every(p => (p.coverage || 0) >= 0.8)).toBe(true);
    });
  });

  describe('Statistics', () => {
    it('should provide accurate statistics', async () => {
      // Add patterns with different characteristics
      await library.storePattern({
        id: 'small-pattern',
        type: 'unit',
        domain: 'test',
        embedding: new Array(128).fill(0.5),
        content: 'small',
        coverage: 0.8
      });

      await library.storePattern({
        id: 'large-pattern',
        type: 'unit',
        domain: 'test',
        embedding: new Array(128).fill(0.5),
        content: 'x'.repeat(15000), // Large enough to compress
        coverage: 0.9
      });

      const stats = await library.getStats();

      expect(stats.totalPatterns).toBe(2);
      expect(stats.vectorClockSize).toBeGreaterThan(0);
      expect(stats.lastSyncTimestamp).toBeGreaterThan(0);
    });
  });
});
