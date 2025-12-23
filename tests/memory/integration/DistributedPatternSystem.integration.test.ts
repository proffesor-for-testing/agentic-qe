/**
 * Distributed Pattern System Integration Tests
 *
 * End-to-end tests for the complete distributed pattern management system
 * integrating DistributedPatternLibrary, PatternReplicationService, and PatternQualityScorer
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { DistributedPatternLibrary } from '../../../src/memory/DistributedPatternLibrary';
import { PatternReplicationService } from '../../../src/memory/PatternReplicationService';
import { PatternQualityScorer } from '../../../src/memory/PatternQualityScorer';
import { TestPattern } from '../../../src/core/memory/IPatternStore';

describe('Distributed Pattern System Integration', () => {
  let library1: DistributedPatternLibrary;
  let library2: DistributedPatternLibrary;
  let library3: DistributedPatternLibrary;
  let replicationService: PatternReplicationService;
  let scorer1: PatternQualityScorer;
  let scorer2: PatternQualityScorer;
  let scorer3: PatternQualityScorer;

  beforeEach(async () => {
    // Create 3 distributed pattern libraries
    library1 = new DistributedPatternLibrary({
      agentId: 'agent-1',
      dimension: 128,
      autoCompress: true,
      compressionThreshold: 10240
    });

    library2 = new DistributedPatternLibrary({
      agentId: 'agent-2',
      dimension: 128,
      autoCompress: true,
      compressionThreshold: 10240
    });

    library3 = new DistributedPatternLibrary({
      agentId: 'agent-3',
      dimension: 128,
      autoCompress: true,
      compressionThreshold: 10240
    });

    await library1.initialize();
    await library2.initialize();
    await library3.initialize();

    // Create replication service
    replicationService = new PatternReplicationService({
      replicationFactor: 3,
      heartbeatInterval: 100,
      syncInterval: 200,
      autoRecover: true
    });

    // Register nodes
    await replicationService.registerNode('agent-1', library1);
    await replicationService.registerNode('agent-2', library2);
    await replicationService.registerNode('agent-3', library3);

    // Create quality scorers
    scorer1 = new PatternQualityScorer(library1, {
      minSuccessRate: 0.7,
      minQualityScore: 0.5,
      enableAutoGC: false
    });

    scorer2 = new PatternQualityScorer(library2, {
      minSuccessRate: 0.7,
      minQualityScore: 0.5,
      enableAutoGC: false
    });

    scorer3 = new PatternQualityScorer(library3, {
      minSuccessRate: 0.7,
      minQualityScore: 0.5,
      enableAutoGC: false
    });
  });

  afterEach(async () => {
    await replicationService.stop();
    scorer1.stopAutoGC();
    scorer2.stopAutoGC();
    scorer3.stopAutoGC();
    await library1.clear();
    await library2.clear();
    await library3.clear();
  });

  describe('End-to-End Pattern Lifecycle', () => {
    it('should replicate, track quality, and garbage collect patterns', async () => {
      // 1. Create and replicate high-quality pattern
      const highQualityPattern: TestPattern = {
        id: 'hq-pattern',
        type: 'unit',
        domain: 'auth',
        embedding: new Array(128).fill(0.5),
        content: 'high quality test',
        coverage: 0.95,
        usageCount: 0
      };

      await replicationService.replicatePattern(highQualityPattern);

      // Verify replication
      const p1 = await library1.getPattern('hq-pattern');
      const p2 = await library2.getPattern('hq-pattern');
      const p3 = await library3.getPattern('hq-pattern');

      expect(p1).toBeDefined();
      expect(p2).toBeDefined();
      expect(p3).toBeDefined();

      // 2. Track usage on all nodes
      for (let i = 0; i < 20; i++) {
        await scorer1.recordUsage({
          patternId: 'hq-pattern',
          timestamp: Date.now() + i,
          success: true,
          executionTime: 50
        });

        await scorer2.recordUsage({
          patternId: 'hq-pattern',
          timestamp: Date.now() + i,
          success: true,
          executionTime: 50
        });

        await scorer3.recordUsage({
          patternId: 'hq-pattern',
          timestamp: Date.now() + i,
          success: true,
          executionTime: 50
        });
      }

      // 3. Verify quality metrics
      const metrics1 = await scorer1.calculateMetrics('hq-pattern');
      expect(metrics1?.successRate).toBe(1.0);
      expect(metrics1?.qualityScore).toBeGreaterThan(0.7);

      // 4. Create low-quality pattern
      const lowQualityPattern: TestPattern = {
        id: 'lq-pattern',
        type: 'unit',
        domain: 'auth',
        embedding: new Array(128).fill(0.5),
        content: 'low quality test',
        coverage: 0.3,
        usageCount: 0
      };

      await replicationService.replicatePattern(lowQualityPattern);

      // Track poor usage
      for (let i = 0; i < 20; i++) {
        await scorer1.recordUsage({
          patternId: 'lq-pattern',
          timestamp: Date.now() + i,
          success: i < 4, // 20% success rate
          executionTime: 50
        });
      }

      // 5. Run garbage collection
      const gcResult = await scorer1.garbageCollect();

      expect(gcResult.patternsRemoved).toBeGreaterThan(0);
      expect(gcResult.removedPatternIds).toContain('lq-pattern');

      // 6. Verify high-quality pattern still exists
      const stillExists = await library1.getPattern('hq-pattern');
      expect(stillExists).toBeDefined();
    });
  });

  describe('Multi-Agent Replication with Quality Tracking', () => {
    it('should maintain 1000+ patterns across 3 agents with quality scoring', async () => {
      const startTime = Date.now();

      // Create and replicate 1000 patterns
      for (let i = 0; i < 1000; i++) {
        const pattern: TestPattern = {
          id: `pattern-${i}`,
          type: i % 2 === 0 ? 'unit' : 'integration',
          domain: i % 3 === 0 ? 'auth' : i % 3 === 1 ? 'api' : 'database',
          embedding: new Array(128).fill(Math.random()),
          content: `test pattern ${i}`,
          coverage: 0.5 + (Math.random() * 0.5) // 0.5-1.0
        };

        await replicationService.replicatePattern(pattern);
      }

      const replicationTime = Date.now() - startTime;

      // Verify replication
      const stats1 = await library1.getStats();
      const stats2 = await library2.getStats();
      const stats3 = await library3.getStats();

      expect(stats1.totalPatterns).toBeGreaterThanOrEqual(1000);
      expect(stats2.totalPatterns).toBeGreaterThanOrEqual(1000);
      expect(stats3.totalPatterns).toBeGreaterThanOrEqual(1000);

      // Track usage for sample patterns
      for (let i = 0; i < 100; i++) {
        const patternId = `pattern-${i}`;
        const successRate = Math.random();

        for (let j = 0; j < 10; j++) {
          await scorer1.recordUsage({
            patternId,
            timestamp: Date.now() + j,
            success: Math.random() < successRate,
            executionTime: 50
          });
        }
      }

      // Get quality statistics
      const scorerStats = await scorer1.getStats();

      expect(scorerStats.totalPatterns).toBeGreaterThanOrEqual(1000);
      expect(scorerStats.trackedPatterns).toBeGreaterThan(0);

      // Performance check
      expect(replicationTime).toBeLessThan(60000); // < 60 seconds
    });
  });

  describe('Pattern Lookup Performance', () => {
    beforeEach(async () => {
      // Seed with 100 patterns
      for (let i = 0; i < 100; i++) {
        await replicationService.replicatePattern({
          id: `perf-pattern-${i}`,
          type: 'unit',
          domain: 'test',
          embedding: new Array(128).fill(Math.random()),
          content: `performance test ${i}`,
          coverage: Math.random()
        });
      }
    });

    it('should achieve <100ms p99 lookup latency across replicas', async () => {
      const latencies: number[] = [];

      // Perform 300 lookups across all 3 libraries
      for (let i = 0; i < 100; i++) {
        const patternId = `perf-pattern-${Math.floor(Math.random() * 100)}`;

        // Test on library1
        const start1 = Date.now();
        await library1.getPattern(patternId);
        latencies.push(Date.now() - start1);

        // Test on library2
        const start2 = Date.now();
        await library2.getPattern(patternId);
        latencies.push(Date.now() - start2);

        // Test on library3
        const start3 = Date.now();
        await library3.getPattern(patternId);
        latencies.push(Date.now() - start3);
      }

      // Calculate p99
      latencies.sort((a, b) => a - b);
      const p99Index = Math.floor(latencies.length * 0.99);
      const p99Latency = latencies[p99Index];

      expect(p99Latency).toBeLessThan(100);
    });
  });

  describe('Consistency and Sync', () => {
    it('should achieve 99.9% consistency after sync', async () => {
      // Create patterns on library1 only
      for (let i = 0; i < 100; i++) {
        await library1.storePattern({
          id: `consistency-pattern-${i}`,
          type: 'unit',
          domain: 'test',
          embedding: new Array(128).fill(Math.random()),
          content: `test pattern ${i}`,
          coverage: Math.random()
        });
      }

      // Sync patterns
      await replicationService.syncPatterns();

      // Check health
      const health = await replicationService.checkHealth();

      expect(health.consistencyPercentage).toBeGreaterThanOrEqual(99.9);

      // Verify pattern counts
      const stats1 = await library1.getStats();
      const stats2 = await library2.getStats();
      const stats3 = await library3.getStats();

      expect(stats2.totalPatterns).toBeGreaterThanOrEqual(stats1.totalPatterns * 0.999);
      expect(stats3.totalPatterns).toBeGreaterThanOrEqual(stats1.totalPatterns * 0.999);
    });

    it('should handle concurrent updates with conflict resolution', async () => {
      const pattern: TestPattern = {
        id: 'concurrent-pattern',
        type: 'unit',
        domain: 'auth',
        embedding: new Array(128).fill(0.5),
        content: 'original',
        coverage: 0.7
      };

      // Store on all libraries
      await library1.storePattern(pattern);
      await library2.storePattern(pattern);
      await library3.storePattern(pattern);

      // Concurrent updates
      const updated1 = { ...pattern, content: 'update from agent-1', coverage: 0.8 };
      const updated2 = { ...pattern, content: 'update from agent-2', coverage: 0.9 };
      const updated3 = { ...pattern, content: 'update from agent-3', coverage: 0.85 };

      await Promise.all([
        library1.updatePattern(updated1),
        library2.updatePattern(updated2),
        library3.updatePattern(updated3)
      ]);

      // Sync to resolve conflicts
      await replicationService.syncPatterns();

      // All libraries should converge to same version
      const final1 = await library1.getPattern('concurrent-pattern');
      const final2 = await library2.getPattern('concurrent-pattern');
      const final3 = await library3.getPattern('concurrent-pattern');

      expect(final1?.content).toBe(final2?.content);
      expect(final2?.content).toBe(final3?.content);
    });
  });

  describe('Compression Integration', () => {
    it('should compress large patterns during replication', async () => {
      const largeContent = 'x'.repeat(15000); // 15KB
      const largePattern: TestPattern = {
        id: 'large-replicated',
        type: 'integration',
        domain: 'api',
        embedding: new Array(128).fill(0.5),
        content: largeContent,
        coverage: 0.85
      };

      await replicationService.replicatePattern(largePattern);

      // Verify compression on all nodes
      const stats1 = await library1.getStats();
      const stats2 = await library2.getStats();
      const stats3 = await library3.getStats();

      expect(stats1.compressedPatterns).toBeGreaterThan(0);
      expect(stats2.compressedPatterns).toBeGreaterThan(0);
      expect(stats3.compressedPatterns).toBeGreaterThan(0);

      // Verify retrieval works correctly
      const retrieved1 = await library1.getPattern('large-replicated');
      const retrieved2 = await library2.getPattern('large-replicated');
      const retrieved3 = await library3.getPattern('large-replicated');

      expect(retrieved1?.content).toBe(largeContent);
      expect(retrieved2?.content).toBe(largeContent);
      expect(retrieved3?.content).toBe(largeContent);
    });
  });

  describe('Quality-Based Replication Decisions', () => {
    it('should use quality scores to prioritize pattern replication', async () => {
      // Create patterns with varying quality
      const patterns: TestPattern[] = [];
      for (let i = 0; i < 10; i++) {
        patterns.push({
          id: `quality-pattern-${i}`,
          type: 'unit',
          domain: 'test',
          embedding: new Array(128).fill(Math.random()),
          content: `test pattern ${i}`,
          coverage: 0.5 + (i * 0.05) // Increasing quality
        });
      }

      // Replicate all patterns
      for (const pattern of patterns) {
        await replicationService.replicatePattern(pattern);
      }

      // Track usage with varying success rates
      for (let i = 0; i < 10; i++) {
        const patternId = `quality-pattern-${i}`;
        const successRate = 0.5 + (i * 0.05);

        for (let j = 0; j < 20; j++) {
          await scorer1.recordUsage({
            patternId,
            timestamp: Date.now() + j,
            success: Math.random() < successRate,
            executionTime: 50
          });
        }
      }

      // Get ranked patterns
      const ranked = await scorer1.getRankedPatterns({ sortBy: 'quality' });

      expect(ranked.length).toBe(10);
      expect(ranked[0].metrics.qualityScore).toBeGreaterThan(ranked[9].metrics.qualityScore);

      // Verify replication maintained pattern quality
      for (const rankedPattern of ranked) {
        const p1 = await library1.getPattern(rankedPattern.pattern.id);
        const p2 = await library2.getPattern(rankedPattern.pattern.id);
        const p3 = await library3.getPattern(rankedPattern.pattern.id);

        expect(p1).toBeDefined();
        expect(p2).toBeDefined();
        expect(p3).toBeDefined();
      }
    });
  });

  describe('Health Monitoring with Quality Metrics', () => {
    it('should track both replication health and pattern quality', async () => {
      await replicationService.start();

      // Create and replicate patterns
      for (let i = 0; i < 50; i++) {
        await replicationService.replicatePattern({
          id: `health-pattern-${i}`,
          type: 'unit',
          domain: 'test',
          embedding: new Array(128).fill(Math.random()),
          content: `test pattern ${i}`,
          coverage: Math.random()
        });
      }

      // Track some usage
      for (let i = 0; i < 20; i++) {
        await scorer1.recordUsage({
          patternId: `health-pattern-${i}`,
          timestamp: Date.now() + i,
          success: Math.random() > 0.3,
          executionTime: 50
        });
      }

      // Get combined health metrics
      const replicationHealth = await replicationService.checkHealth();
      const qualityStats = await scorer1.getStats();

      expect(replicationHealth.healthyNodes).toBe(3);
      expect(replicationHealth.consistencyPercentage).toBeGreaterThan(90);
      expect(qualityStats.totalPatterns).toBeGreaterThanOrEqual(50);
      expect(qualityStats.averageQualityScore).toBeGreaterThan(0);
    });
  });

  describe('System Resilience', () => {
    it('should maintain quality tracking during node failures', async () => {
      await replicationService.start();

      // Replicate patterns
      for (let i = 0; i < 20; i++) {
        await replicationService.replicatePattern({
          id: `resilience-pattern-${i}`,
          type: 'unit',
          domain: 'test',
          embedding: new Array(128).fill(Math.random()),
          content: `test pattern ${i}`,
          coverage: Math.random()
        });
      }

      // Track usage on library1
      for (let i = 0; i < 10; i++) {
        await scorer1.recordUsage({
          patternId: `resilience-pattern-${i}`,
          timestamp: Date.now() + i,
          success: true,
          executionTime: 50
        });
      }

      // Simulate node failure by unregistering
      await replicationService.unregisterNode('agent-3');

      // Quality tracking should still work on remaining nodes
      const metrics = await scorer1.calculateMetrics('resilience-pattern-5');
      expect(metrics).toBeDefined();
      expect(metrics?.totalUsage).toBeGreaterThan(0);

      // Replication should continue with 2 nodes
      await replicationService.replicatePattern({
        id: 'post-failure-pattern',
        type: 'unit',
        domain: 'test',
        embedding: new Array(128).fill(0.5),
        content: 'after failure',
        coverage: 0.8
      });

      const p1 = await library1.getPattern('post-failure-pattern');
      const p2 = await library2.getPattern('post-failure-pattern');

      expect(p1).toBeDefined();
      expect(p2).toBeDefined();
    });
  });
});
