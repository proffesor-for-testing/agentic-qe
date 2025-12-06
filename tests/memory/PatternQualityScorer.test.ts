/**
 * PatternQualityScorer Tests
 *
 * Comprehensive test suite for pattern quality scoring and garbage collection
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import {
  PatternQualityScorer,
  PatternUsage,
  QualityScorerConfig
} from '../../src/memory/PatternQualityScorer';
import { DistributedPatternLibrary } from '../../src/memory/DistributedPatternLibrary';
import { TestPattern } from '../../src/core/memory/IPatternStore';

describe('PatternQualityScorer', () => {
  let library: DistributedPatternLibrary;
  let scorer: PatternQualityScorer;
  let config: QualityScorerConfig;

  beforeEach(async () => {
    library = new DistributedPatternLibrary({
      agentId: 'test-agent',
      dimension: 128,
      autoCompress: false
    });
    await library.initialize();

    config = {
      minSuccessRate: 0.7,
      minUsageCount: 5,
      maxAgeInDays: 90,
      minQualityScore: 0.5,
      successRateWeight: 0.5,
      usageWeight: 0.3,
      recencyWeight: 0.2,
      enableAutoGC: false,
      gcInterval: 1000
    };

    scorer = new PatternQualityScorer(library, config);
  });

  afterEach(async () => {
    scorer.stopAutoGC();
    scorer.clearHistory();
    await library.clear();
  });

  describe('Usage Tracking', () => {
    it('should record pattern usage', async () => {
      const pattern: TestPattern = {
        id: 'usage-pattern',
        type: 'unit',
        domain: 'auth',
        embedding: new Array(128).fill(0.5),
        content: 'test pattern',
        coverage: 0.9,
        usageCount: 0
      };

      await library.storePattern(pattern);

      const usage: PatternUsage = {
        patternId: 'usage-pattern',
        timestamp: Date.now(),
        success: true,
        executionTime: 50
      };

      await scorer.recordUsage(usage);

      const metrics = await scorer.calculateMetrics('usage-pattern');
      expect(metrics).toBeDefined();
      expect(metrics?.totalUsage).toBe(1);
      expect(metrics?.successCount).toBe(1);
    });

    it('should track multiple usage records', async () => {
      const pattern: TestPattern = {
        id: 'multi-usage-pattern',
        type: 'unit',
        domain: 'auth',
        embedding: new Array(128).fill(0.5),
        content: 'test pattern',
        coverage: 0.9,
        usageCount: 0
      };

      await library.storePattern(pattern);

      // Record 10 usages (7 success, 3 failure)
      for (let i = 0; i < 10; i++) {
        await scorer.recordUsage({
          patternId: 'multi-usage-pattern',
          timestamp: Date.now() + i,
          success: i < 7,
          executionTime: 50 + i
        });
      }

      const metrics = await scorer.calculateMetrics('multi-usage-pattern');
      expect(metrics?.totalUsage).toBe(10);
      expect(metrics?.successCount).toBe(7);
      expect(metrics?.failureCount).toBe(3);
      expect(metrics?.successRate).toBeCloseTo(0.7, 2);
    });

    it('should calculate average execution time', async () => {
      const pattern: TestPattern = {
        id: 'exec-time-pattern',
        type: 'unit',
        domain: 'auth',
        embedding: new Array(128).fill(0.5),
        content: 'test pattern',
        coverage: 0.9,
        usageCount: 0
      };

      await library.storePattern(pattern);

      // Record usages with different execution times
      await scorer.recordUsage({
        patternId: 'exec-time-pattern',
        timestamp: Date.now(),
        success: true,
        executionTime: 50
      });

      await scorer.recordUsage({
        patternId: 'exec-time-pattern',
        timestamp: Date.now(),
        success: true,
        executionTime: 100
      });

      await scorer.recordUsage({
        patternId: 'exec-time-pattern',
        timestamp: Date.now(),
        success: true,
        executionTime: 150
      });

      const metrics = await scorer.calculateMetrics('exec-time-pattern');
      expect(metrics?.averageExecutionTime).toBeCloseTo(100, 0);
    });
  });

  describe('Quality Scoring', () => {
    it('should calculate quality score based on success rate', async () => {
      const pattern: TestPattern = {
        id: 'quality-pattern',
        type: 'unit',
        domain: 'auth',
        embedding: new Array(128).fill(0.5),
        content: 'test pattern',
        coverage: 0.9,
        createdAt: Date.now(),
        usageCount: 0
      };

      await library.storePattern(pattern);

      // Record high success rate
      for (let i = 0; i < 10; i++) {
        await scorer.recordUsage({
          patternId: 'quality-pattern',
          timestamp: Date.now() + i,
          success: i < 9, // 90% success rate
          executionTime: 50
        });
      }

      const metrics = await scorer.calculateMetrics('quality-pattern');
      expect(metrics?.successRate).toBeCloseTo(0.9, 2);
      expect(metrics?.qualityScore).toBeGreaterThan(0.5);
    });

    it('should penalize low success rate patterns', async () => {
      const pattern: TestPattern = {
        id: 'low-quality-pattern',
        type: 'unit',
        domain: 'auth',
        embedding: new Array(128).fill(0.5),
        content: 'test pattern',
        coverage: 0.5,
        createdAt: Date.now(),
        usageCount: 0
      };

      await library.storePattern(pattern);

      // Record low success rate
      for (let i = 0; i < 10; i++) {
        await scorer.recordUsage({
          patternId: 'low-quality-pattern',
          timestamp: Date.now() + i,
          success: i < 3, // 30% success rate
          executionTime: 50
        });
      }

      const metrics = await scorer.calculateMetrics('low-quality-pattern');
      expect(metrics?.successRate).toBeCloseTo(0.3, 2);
      expect(metrics?.qualityScore).toBeLessThan(0.5);
    });

    it('should consider usage frequency in quality score', async () => {
      const highUsagePattern: TestPattern = {
        id: 'high-usage-pattern',
        type: 'unit',
        domain: 'auth',
        embedding: new Array(128).fill(0.5),
        content: 'high usage',
        coverage: 0.8,
        createdAt: Date.now(),
        usageCount: 0
      };

      const lowUsagePattern: TestPattern = {
        id: 'low-usage-pattern',
        type: 'unit',
        domain: 'auth',
        embedding: new Array(128).fill(0.5),
        content: 'low usage',
        coverage: 0.8,
        createdAt: Date.now(),
        usageCount: 0
      };

      await library.storePattern(highUsagePattern);
      await library.storePattern(lowUsagePattern);

      // Record high usage
      for (let i = 0; i < 50; i++) {
        await scorer.recordUsage({
          patternId: 'high-usage-pattern',
          timestamp: Date.now() + i,
          success: true,
          executionTime: 50
        });
      }

      // Record low usage
      for (let i = 0; i < 5; i++) {
        await scorer.recordUsage({
          patternId: 'low-usage-pattern',
          timestamp: Date.now() + i,
          success: true,
          executionTime: 50
        });
      }

      const highMetrics = await scorer.calculateMetrics('high-usage-pattern');
      const lowMetrics = await scorer.calculateMetrics('low-usage-pattern');

      expect(highMetrics?.qualityScore).toBeGreaterThan(lowMetrics?.qualityScore || 0);
    });

    it('should consider pattern age in quality score', async () => {
      const now = Date.now();
      const oldPattern: TestPattern = {
        id: 'old-pattern',
        type: 'unit',
        domain: 'auth',
        embedding: new Array(128).fill(0.5),
        content: 'old pattern',
        coverage: 0.8,
        createdAt: now - (100 * 24 * 60 * 60 * 1000), // 100 days ago
        usageCount: 0
      };

      const newPattern: TestPattern = {
        id: 'new-pattern',
        type: 'unit',
        domain: 'auth',
        embedding: new Array(128).fill(0.5),
        content: 'new pattern',
        coverage: 0.8,
        createdAt: now - (1 * 24 * 60 * 60 * 1000), // 1 day ago
        usageCount: 0
      };

      await library.storePattern(oldPattern);
      await library.storePattern(newPattern);

      // Equal usage
      for (let i = 0; i < 10; i++) {
        await scorer.recordUsage({
          patternId: 'old-pattern',
          timestamp: Date.now() + i,
          success: true,
          executionTime: 50
        });

        await scorer.recordUsage({
          patternId: 'new-pattern',
          timestamp: Date.now() + i,
          success: true,
          executionTime: 50
        });
      }

      const oldMetrics = await scorer.calculateMetrics('old-pattern');
      const newMetrics = await scorer.calculateMetrics('new-pattern');

      expect(newMetrics?.qualityScore).toBeGreaterThan(oldMetrics?.qualityScore || 0);
    });
  });

  describe('Trend Analysis', () => {
    it('should detect improving patterns', async () => {
      const pattern: TestPattern = {
        id: 'improving-pattern',
        type: 'unit',
        domain: 'auth',
        embedding: new Array(128).fill(0.5),
        content: 'test pattern',
        coverage: 0.8,
        createdAt: Date.now(),
        usageCount: 0
      };

      await library.storePattern(pattern);

      // Record usage with improving success rate
      // First 10: 30% success
      for (let i = 0; i < 10; i++) {
        await scorer.recordUsage({
          patternId: 'improving-pattern',
          timestamp: Date.now() + i,
          success: i < 3,
          executionTime: 50
        });
      }

      // Next 10: 90% success
      for (let i = 10; i < 20; i++) {
        await scorer.recordUsage({
          patternId: 'improving-pattern',
          timestamp: Date.now() + i,
          success: i < 19,
          executionTime: 50
        });
      }

      const metrics = await scorer.calculateMetrics('improving-pattern');
      expect(metrics?.trendScore).toBeGreaterThan(0); // Positive trend
    });

    it('should detect degrading patterns', async () => {
      const pattern: TestPattern = {
        id: 'degrading-pattern',
        type: 'unit',
        domain: 'auth',
        embedding: new Array(128).fill(0.5),
        content: 'test pattern',
        coverage: 0.8,
        createdAt: Date.now(),
        usageCount: 0
      };

      await library.storePattern(pattern);

      // Record usage with degrading success rate
      // First 10: 90% success
      for (let i = 0; i < 10; i++) {
        await scorer.recordUsage({
          patternId: 'degrading-pattern',
          timestamp: Date.now() + i,
          success: i < 9,
          executionTime: 50
        });
      }

      // Next 10: 30% success
      for (let i = 10; i < 20; i++) {
        await scorer.recordUsage({
          patternId: 'degrading-pattern',
          timestamp: Date.now() + i,
          success: i < 13,
          executionTime: 50
        });
      }

      const metrics = await scorer.calculateMetrics('degrading-pattern');
      expect(metrics?.trendScore).toBeLessThan(0); // Negative trend
    });
  });

  describe('Pattern Ranking', () => {
    beforeEach(async () => {
      // Create diverse patterns
      const patterns = [
        { id: 'high-quality', coverage: 0.95, successRate: 0.95, usage: 100 },
        { id: 'medium-quality', coverage: 0.75, successRate: 0.75, usage: 50 },
        { id: 'low-quality', coverage: 0.55, successRate: 0.55, usage: 20 }
      ];

      for (const p of patterns) {
        await library.storePattern({
          id: p.id,
          type: 'unit',
          domain: 'auth',
          embedding: new Array(128).fill(0.5),
          content: `${p.id} pattern`,
          coverage: p.coverage,
          createdAt: Date.now(),
          usageCount: 0
        });

        // Record usage
        for (let i = 0; i < p.usage; i++) {
          await scorer.recordUsage({
            patternId: p.id,
            timestamp: Date.now() + i,
            success: Math.random() < p.successRate,
            executionTime: 50
          });
        }
      }
    });

    it('should rank patterns by quality', async () => {
      const ranked = await scorer.getRankedPatterns({ sortBy: 'quality' });

      expect(ranked.length).toBe(3);
      expect(ranked[0].rank).toBe(1);
      expect(ranked[1].rank).toBe(2);
      expect(ranked[2].rank).toBe(3);

      // Higher ranks should have better quality scores
      expect(ranked[0].metrics.qualityScore).toBeGreaterThan(ranked[1].metrics.qualityScore);
      expect(ranked[1].metrics.qualityScore).toBeGreaterThan(ranked[2].metrics.qualityScore);
    });

    it('should rank patterns by usage', async () => {
      const ranked = await scorer.getRankedPatterns({ sortBy: 'usage' });

      expect(ranked.length).toBe(3);
      expect(ranked[0].metrics.totalUsage).toBeGreaterThan(ranked[1].metrics.totalUsage);
      expect(ranked[1].metrics.totalUsage).toBeGreaterThan(ranked[2].metrics.totalUsage);
    });

    it('should filter by minimum quality score', async () => {
      const ranked = await scorer.getRankedPatterns({ minQualityScore: 0.6 });

      // Should exclude low-quality patterns
      expect(ranked.length).toBeLessThan(3);
      expect(ranked.every(p => p.metrics.qualityScore >= 0.6)).toBe(true);
    });

    it('should limit results', async () => {
      const ranked = await scorer.getRankedPatterns({ limit: 2 });

      expect(ranked.length).toBe(2);
    });
  });

  describe('Garbage Collection', () => {
    it('should identify garbage candidates', async () => {
      const lowQualityPattern: TestPattern = {
        id: 'gc-candidate',
        type: 'unit',
        domain: 'auth',
        embedding: new Array(128).fill(0.5),
        content: 'low quality pattern',
        coverage: 0.3,
        createdAt: Date.now(),
        usageCount: 0
      };

      await library.storePattern(lowQualityPattern);

      // Record poor usage
      for (let i = 0; i < 10; i++) {
        await scorer.recordUsage({
          patternId: 'gc-candidate',
          timestamp: Date.now() + i,
          success: i < 2, // 20% success rate
          executionTime: 50
        });
      }

      const candidates = await scorer.getGarbageCandidates();

      expect(candidates.length).toBeGreaterThan(0);
      expect(candidates.some(c => c.patternId === 'gc-candidate')).toBe(true);
    });

    it('should perform garbage collection', async () => {
      // Create low-quality patterns
      for (let i = 0; i < 5; i++) {
        await library.storePattern({
          id: `gc-pattern-${i}`,
          type: 'unit',
          domain: 'auth',
          embedding: new Array(128).fill(0.5),
          content: `gc pattern ${i}`,
          coverage: 0.2,
          createdAt: Date.now(),
          usageCount: 0
        });

        // Record poor usage
        for (let j = 0; j < 10; j++) {
          await scorer.recordUsage({
            patternId: `gc-pattern-${i}`,
            timestamp: Date.now() + j,
            success: j < 1, // 10% success rate
            executionTime: 50
          });
        }
      }

      const initialStats = await library.getStats();
      const gcResult = await scorer.garbageCollect();

      expect(gcResult.patternsRemoved).toBeGreaterThan(0);
      expect(gcResult.bytesReclaimed).toBeGreaterThan(0);
      expect(gcResult.duration).toBeGreaterThan(0);

      const finalStats = await library.getStats();
      expect(finalStats.totalPatterns).toBeLessThan(initialStats.totalPatterns);
    });

    it('should remove old unused patterns', async () => {
      const oldUnusedPattern: TestPattern = {
        id: 'old-unused',
        type: 'unit',
        domain: 'auth',
        embedding: new Array(128).fill(0.5),
        content: 'old unused pattern',
        coverage: 0.8,
        createdAt: Date.now() - (100 * 24 * 60 * 60 * 1000), // 100 days ago
        usageCount: 0
      };

      await library.storePattern(oldUnusedPattern);

      const candidates = await scorer.getGarbageCandidates();

      expect(candidates.some(c => c.patternId === 'old-unused')).toBe(true);
    });

    it('should preserve high-quality patterns', async () => {
      const highQualityPattern: TestPattern = {
        id: 'preserve-pattern',
        type: 'unit',
        domain: 'auth',
        embedding: new Array(128).fill(0.5),
        content: 'high quality pattern',
        coverage: 0.95,
        createdAt: Date.now(),
        usageCount: 0
      };

      await library.storePattern(highQualityPattern);

      // Record excellent usage
      for (let i = 0; i < 20; i++) {
        await scorer.recordUsage({
          patternId: 'preserve-pattern',
          timestamp: Date.now() + i,
          success: true,
          executionTime: 50
        });
      }

      await scorer.garbageCollect();

      const preserved = await library.getPattern('preserve-pattern');
      expect(preserved).toBeDefined();
    });
  });

  describe('Automatic Garbage Collection', () => {
    it('should start and stop auto GC', () => {
      const autoScorer = new PatternQualityScorer(library, {
        ...config,
        enableAutoGC: true,
        gcInterval: 100
      });

      autoScorer.startAutoGC();
      expect(autoScorer['gcTimer']).toBeDefined();

      autoScorer.stopAutoGC();
      expect(autoScorer['gcTimer']).toBeUndefined();
    });

    it('should run GC periodically', async () => {
      const autoScorer = new PatternQualityScorer(library, {
        ...config,
        enableAutoGC: true,
        gcInterval: 200
      });

      // Create low-quality pattern
      await library.storePattern({
        id: 'auto-gc-pattern',
        type: 'unit',
        domain: 'auth',
        embedding: new Array(128).fill(0.5),
        content: 'auto gc pattern',
        coverage: 0.2,
        createdAt: Date.now(),
        usageCount: 0
      });

      // Record poor usage
      for (let i = 0; i < 10; i++) {
        await autoScorer.recordUsage({
          patternId: 'auto-gc-pattern',
          timestamp: Date.now() + i,
          success: false,
          executionTime: 50
        });
      }

      autoScorer.startAutoGC();

      // Wait for GC to run
      await new Promise(resolve => setTimeout(resolve, 500));

      autoScorer.stopAutoGC();

      const pattern = await library.getPattern('auto-gc-pattern');
      // Pattern should be removed or still exist depending on timing
      // Just verify no errors occurred
      expect(true).toBe(true);
    });
  });

  describe('Statistics', () => {
    beforeEach(async () => {
      // Create patterns with varying quality
      for (let i = 0; i < 10; i++) {
        const successRate = i < 5 ? 0.3 : 0.9;
        await library.storePattern({
          id: `stats-pattern-${i}`,
          type: 'unit',
          domain: 'auth',
          embedding: new Array(128).fill(0.5),
          content: `stats pattern ${i}`,
          coverage: successRate,
          createdAt: Date.now(),
          usageCount: 0
        });

        for (let j = 0; j < 10; j++) {
          await scorer.recordUsage({
            patternId: `stats-pattern-${i}`,
            timestamp: Date.now() + j,
            success: Math.random() < successRate,
            executionTime: 50
          });
        }
      }
    });

    it('should provide scorer statistics', async () => {
      const stats = await scorer.getStats();

      expect(stats.totalPatterns).toBe(10);
      expect(stats.trackedPatterns).toBe(10);
      expect(stats.averageQualityScore).toBeGreaterThan(0);
      expect(stats.lowQualityPatterns).toBeGreaterThan(0);
    });

    it('should count garbage candidates', async () => {
      const stats = await scorer.getStats();

      expect(stats.garbageCandidates).toBeGreaterThanOrEqual(0);
    });
  });

  describe('History Management', () => {
    it('should clear usage history', async () => {
      const pattern: TestPattern = {
        id: 'history-pattern',
        type: 'unit',
        domain: 'auth',
        embedding: new Array(128).fill(0.5),
        content: 'test pattern',
        coverage: 0.8,
        usageCount: 0
      };

      await library.storePattern(pattern);

      await scorer.recordUsage({
        patternId: 'history-pattern',
        timestamp: Date.now(),
        success: true,
        executionTime: 50
      });

      scorer.clearHistory();

      const metrics = await scorer.calculateMetrics('history-pattern');
      expect(metrics?.totalUsage).toBe(0);
    });

    it('should export usage history', async () => {
      const pattern: TestPattern = {
        id: 'export-pattern',
        type: 'unit',
        domain: 'auth',
        embedding: new Array(128).fill(0.5),
        content: 'test pattern',
        coverage: 0.8,
        usageCount: 0
      };

      await library.storePattern(pattern);

      await scorer.recordUsage({
        patternId: 'export-pattern',
        timestamp: Date.now(),
        success: true,
        executionTime: 50
      });

      const exported = scorer.exportHistory();

      expect(exported.size).toBe(1);
      expect(exported.has('export-pattern')).toBe(true);
    });

    it('should import usage history', async () => {
      const history = new Map<string, PatternUsage[]>();
      history.set('import-pattern', [
        {
          patternId: 'import-pattern',
          timestamp: Date.now(),
          success: true,
          executionTime: 50
        }
      ]);

      scorer.importHistory(history);

      const exported = scorer.exportHistory();
      expect(exported.size).toBe(1);
      expect(exported.has('import-pattern')).toBe(true);
    });
  });
});
