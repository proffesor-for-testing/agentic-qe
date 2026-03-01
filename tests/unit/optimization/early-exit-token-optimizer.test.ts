/**
 * Unit Tests for Early Exit Token Optimizer
 * ADR-042: Token Optimization via Pattern Reuse
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  EarlyExitTokenOptimizer,
  createEarlyExitTokenOptimizer,
  createAggressiveTokenOptimizer,
  createConservativeTokenOptimizer,
  DEFAULT_EARLY_EXIT_CONFIG,
  AGGRESSIVE_EARLY_EXIT_CONFIG,
  CONSERVATIVE_EARLY_EXIT_CONFIG,
} from '../../../src/optimization/early-exit-token-optimizer.js';
import type { PatternStore, PatternSearchResult } from '../../../src/learning/pattern-store.js';
import type { QEPattern } from '../../../src/learning/qe-patterns.js';
import { ok, err } from '../../../src/shared/types/index.js';

// Helper to create mock patterns
function createMockPattern(overrides: Partial<QEPattern> = {}): QEPattern {
  const now = new Date();
  return {
    id: 'test-pattern-1',
    patternType: 'test-template',
    qeDomain: 'test-generation',
    domain: 'test-generation',
    name: 'Test Pattern',
    description: 'A test pattern for unit testing',
    confidence: 0.9,
    usageCount: 10,
    successRate: 0.95,
    qualityScore: 0.85,
    context: {
      language: 'typescript',
      framework: 'vitest',
      testType: 'unit',
      tags: ['test', 'unit'],
    },
    template: {
      type: 'code',
      content: 'describe("{{name}}", () => { it("should work", () => { expect(true).toBe(true); }); });',
      variables: [{ name: 'name', type: 'string', required: true }],
    },
    tier: 'long-term',
    createdAt: new Date(now.getTime() - 24 * 60 * 60 * 1000), // 1 day ago
    lastUsedAt: new Date(now.getTime() - 60 * 60 * 1000), // 1 hour ago
    successfulUses: 8,
    ...overrides,
  };
}

// Helper to create mock PatternStore
function createMockPatternStore(
  searchResults: PatternSearchResult[] = [],
  searchError?: Error
): PatternStore {
  return {
    initialize: vi.fn().mockResolvedValue(undefined),
    store: vi.fn().mockResolvedValue(ok('pattern-id')),
    create: vi.fn().mockResolvedValue(ok(createMockPattern())),
    get: vi.fn().mockResolvedValue(null),
    search: vi.fn().mockResolvedValue(
      searchError ? err(searchError) : ok(searchResults)
    ),
    recordUsage: vi.fn().mockResolvedValue(ok(undefined)),
    promote: vi.fn().mockResolvedValue(ok(undefined)),
    delete: vi.fn().mockResolvedValue(ok(undefined)),
    getStats: vi.fn().mockResolvedValue({
      totalPatterns: 0,
      byTier: { shortTerm: 0, longTerm: 0 },
      byDomain: {},
      byType: {},
      avgConfidence: 0,
      avgQualityScore: 0,
      avgSuccessRate: 0,
      searchOperations: 0,
      avgSearchLatencyMs: 0,
      hnswStats: { nativeAvailable: false, vectorCount: 0, indexSizeBytes: 0 },
    }),
    cleanup: vi.fn().mockResolvedValue({ removed: 0, promoted: 0 }),
    dispose: vi.fn().mockResolvedValue(undefined),
  } as unknown as PatternStore;
}

describe('EarlyExitTokenOptimizer', () => {
  describe('Configuration', () => {
    it('should create with default configuration', () => {
      const store = createMockPatternStore();
      const optimizer = new EarlyExitTokenOptimizer(store);
      const config = optimizer.getConfig();

      expect(config.minConfidenceForExit).toBe(DEFAULT_EARLY_EXIT_CONFIG.minConfidenceForExit);
      expect(config.minSuccessRate).toBe(DEFAULT_EARLY_EXIT_CONFIG.minSuccessRate);
      expect(config.maxPatternAge).toBe(DEFAULT_EARLY_EXIT_CONFIG.maxPatternAge);
    });

    it('should create with custom configuration', () => {
      const store = createMockPatternStore();
      const optimizer = new EarlyExitTokenOptimizer(store, {
        minConfidenceForExit: 0.95,
        minSuccessRate: 0.99,
      });
      const config = optimizer.getConfig();

      expect(config.minConfidenceForExit).toBe(0.95);
      expect(config.minSuccessRate).toBe(0.99);
    });

    it('should update configuration dynamically', () => {
      const store = createMockPatternStore();
      const optimizer = new EarlyExitTokenOptimizer(store);

      optimizer.updateConfig({ minConfidenceForExit: 0.75 });
      const config = optimizer.getConfig();

      expect(config.minConfidenceForExit).toBe(0.75);
    });
  });

  describe('Factory Functions', () => {
    it('should create default optimizer', () => {
      const store = createMockPatternStore();
      const optimizer = createEarlyExitTokenOptimizer(store);

      expect(optimizer.getConfig().minConfidenceForExit).toBe(0.85);
    });

    it('should create aggressive optimizer', () => {
      const store = createMockPatternStore();
      const optimizer = createAggressiveTokenOptimizer(store);

      expect(optimizer.getConfig().minConfidenceForExit).toBe(AGGRESSIVE_EARLY_EXIT_CONFIG.minConfidenceForExit);
      expect(optimizer.getConfig().minSuccessRate).toBe(AGGRESSIVE_EARLY_EXIT_CONFIG.minSuccessRate);
    });

    it('should create conservative optimizer', () => {
      const store = createMockPatternStore();
      const optimizer = createConservativeTokenOptimizer(store);

      expect(optimizer.getConfig().minConfidenceForExit).toBe(CONSERVATIVE_EARLY_EXIT_CONFIG.minConfidenceForExit);
      expect(optimizer.getConfig().minSuccessRate).toBe(CONSERVATIVE_EARLY_EXIT_CONFIG.minSuccessRate);
    });
  });

  describe('checkEarlyExit', () => {
    it('should allow early exit when pattern meets all criteria', async () => {
      const pattern = createMockPattern({
        confidence: 0.9,
        successRate: 0.95,
        qualityScore: 0.85,
        successfulUses: 5,
      });

      const store = createMockPatternStore([
        { pattern, score: 0.9, matchType: 'vector' },
      ]);

      const optimizer = new EarlyExitTokenOptimizer(store);
      const result = await optimizer.checkEarlyExit({
        description: 'Generate unit tests for UserService',
        domain: 'test-generation',
      });

      expect(result.canExit).toBe(true);
      expect(result.reusedPattern).toBeDefined();
      expect(result.reusedPattern?.id).toBe(pattern.id);
      expect(result.estimatedTokensSaved).toBeGreaterThan(0);
      expect(result.confidence).toBe(0.9);
      expect(result.similarityScore).toBe(0.9);
      expect(result.reason).toBe('pattern_reused');
    });

    it('should reject when no matching patterns found', async () => {
      const store = createMockPatternStore([]);
      const optimizer = new EarlyExitTokenOptimizer(store);

      const result = await optimizer.checkEarlyExit({
        description: 'Generate unit tests for UserService',
      });

      expect(result.canExit).toBe(false);
      expect(result.reusedPattern).toBeUndefined();
      expect(result.reason).toBe('no_matching_pattern');
    });

    it('should reject when pattern confidence is too low', async () => {
      const pattern = createMockPattern({
        confidence: 0.5, // Below default threshold of 0.85
        successRate: 0.95,
        qualityScore: 0.85,
        successfulUses: 5,
      });

      const store = createMockPatternStore([
        { pattern, score: 0.9, matchType: 'vector' },
      ]);

      const optimizer = new EarlyExitTokenOptimizer(store);
      const result = await optimizer.checkEarlyExit({
        description: 'Generate unit tests',
      });

      expect(result.canExit).toBe(false);
      expect(result.reason).toBe('confidence_too_low');
    });

    it('should reject when pattern success rate is too low', async () => {
      const pattern = createMockPattern({
        confidence: 0.9,
        successRate: 0.5, // Below default threshold of 0.90
        qualityScore: 0.85,
        successfulUses: 5,
      });

      const store = createMockPatternStore([
        { pattern, score: 0.9, matchType: 'vector' },
      ]);

      const optimizer = new EarlyExitTokenOptimizer(store);
      const result = await optimizer.checkEarlyExit({
        description: 'Generate unit tests',
      });

      expect(result.canExit).toBe(false);
      expect(result.reason).toBe('success_rate_too_low');
    });

    it('should reject when pattern is too old', async () => {
      const now = new Date();
      const pattern = createMockPattern({
        confidence: 0.9,
        successRate: 0.95,
        qualityScore: 0.85,
        successfulUses: 5,
        lastUsedAt: new Date(now.getTime() - 10 * 24 * 60 * 60 * 1000), // 10 days ago
      });

      const store = createMockPatternStore([
        { pattern, score: 0.9, matchType: 'vector' },
      ]);

      const optimizer = new EarlyExitTokenOptimizer(store);
      const result = await optimizer.checkEarlyExit({
        description: 'Generate unit tests',
      });

      expect(result.canExit).toBe(false);
      expect(result.reason).toBe('pattern_too_old');
    });

    it('should reject when similarity score is too low', async () => {
      const pattern = createMockPattern({
        confidence: 0.9,
        successRate: 0.95,
        qualityScore: 0.85,
        successfulUses: 5,
      });

      const store = createMockPatternStore([
        { pattern, score: 0.5, matchType: 'vector' }, // Below default threshold of 0.8
      ]);

      const optimizer = new EarlyExitTokenOptimizer(store);
      const result = await optimizer.checkEarlyExit({
        description: 'Generate unit tests',
      });

      expect(result.canExit).toBe(false);
      expect(result.reason).toBe('similarity_too_low');
    });

    it('should reject when pattern has insufficient uses', async () => {
      const pattern = createMockPattern({
        confidence: 0.9,
        successRate: 0.95,
        qualityScore: 0.85,
        successfulUses: 1, // Below default threshold of 2
      });

      const store = createMockPatternStore([
        { pattern, score: 0.9, matchType: 'vector' },
      ]);

      const optimizer = new EarlyExitTokenOptimizer(store);
      const result = await optimizer.checkEarlyExit({
        description: 'Generate unit tests',
      });

      expect(result.canExit).toBe(false);
      expect(result.reason).toBe('insufficient_uses');
    });

    it('should reject when quality score is too low', async () => {
      const pattern = createMockPattern({
        confidence: 0.9,
        successRate: 0.95,
        qualityScore: 0.5, // Below default threshold of 0.7
        successfulUses: 5,
      });

      const store = createMockPatternStore([
        { pattern, score: 0.9, matchType: 'vector' },
      ]);

      const optimizer = new EarlyExitTokenOptimizer(store);
      const result = await optimizer.checkEarlyExit({
        description: 'Generate unit tests',
      });

      expect(result.canExit).toBe(false);
      expect(result.reason).toBe('quality_score_too_low');
    });

    it('should handle search errors gracefully', async () => {
      const store = createMockPatternStore([], new Error('Search failed'));
      const optimizer = new EarlyExitTokenOptimizer(store);

      const result = await optimizer.checkEarlyExit({
        description: 'Generate unit tests',
      });

      expect(result.canExit).toBe(false);
      expect(result.reason).toBe('search_error');
      expect(result.explanation).toContain('Search failed');
    });

    it('should detect domain from task description', async () => {
      const pattern = createMockPattern({
        qeDomain: 'test-generation',
      });

      const store = createMockPatternStore([
        { pattern, score: 0.9, matchType: 'vector' },
      ]);

      const optimizer = new EarlyExitTokenOptimizer(store);
      await optimizer.checkEarlyExit({
        description: 'Generate test spec for authentication module',
        // No domain provided - should be detected
      });

      // Verify search was called
      expect(store.search).toHaveBeenCalled();
    });

    it('should include search latency in result', async () => {
      const store = createMockPatternStore([]);
      const optimizer = new EarlyExitTokenOptimizer(store);

      const result = await optimizer.checkEarlyExit({
        description: 'Generate unit tests',
      });

      expect(result.searchLatencyMs).toBeGreaterThanOrEqual(0);
    });
  });

  describe('recordSuccessfulReuse', () => {
    it('should record successful pattern reuse', async () => {
      const pattern = createMockPattern();
      const store = createMockPatternStore([
        { pattern, score: 0.9, matchType: 'vector' },
      ]);

      const optimizer = new EarlyExitTokenOptimizer(store);
      optimizer.recordSuccessfulReuse(pattern.id);

      // Wait for async operation using process.nextTick for deterministic behavior
      await new Promise((resolve) => process.nextTick(resolve));

      expect(store.recordUsage).toHaveBeenCalledWith(pattern.id, true);
    });
  });

  describe('recordFailedReuse', () => {
    it('should record failed pattern reuse', async () => {
      const pattern = createMockPattern();
      const store = createMockPatternStore([
        { pattern, score: 0.9, matchType: 'vector' },
      ]);

      const optimizer = new EarlyExitTokenOptimizer(store);
      optimizer.recordFailedReuse(pattern.id);

      // Wait for async operation using process.nextTick for deterministic behavior
      await new Promise((resolve) => process.nextTick(resolve));

      expect(store.recordUsage).toHaveBeenCalledWith(pattern.id, false);
    });
  });

  describe('getReuseStats', () => {
    it('should return empty stats initially', () => {
      const store = createMockPatternStore();
      const optimizer = new EarlyExitTokenOptimizer(store);
      const stats = optimizer.getReuseStats();

      expect(stats.totalReuses).toBe(0);
      expect(stats.tokensSaved).toBe(0);
      expect(stats.avgConfidence).toBe(0);
      expect(stats.avgSimilarity).toBe(0);
      expect(stats.totalAttempts).toBe(0);
      expect(stats.exitRate).toBe(0);
    });

    it('should track successful reuses', async () => {
      const pattern = createMockPattern({
        confidence: 0.9,
        successRate: 0.95,
        qualityScore: 0.85,
        successfulUses: 5,
      });

      const store = createMockPatternStore([
        { pattern, score: 0.9, matchType: 'vector' },
      ]);

      const optimizer = new EarlyExitTokenOptimizer(store);

      // Perform a successful early exit
      await optimizer.checkEarlyExit({
        description: 'Generate unit tests',
        domain: 'test-generation',
      });

      const stats = optimizer.getReuseStats();

      expect(stats.totalReuses).toBe(1);
      expect(stats.tokensSaved).toBeGreaterThan(0);
      expect(stats.avgConfidence).toBe(0.9);
      expect(stats.avgSimilarity).toBe(0.9);
      expect(stats.totalAttempts).toBe(1);
      expect(stats.exitRate).toBe(1);
      expect(stats.reasonBreakdown.pattern_reused).toBe(1);
    });

    it('should track failed attempts', async () => {
      const store = createMockPatternStore([]);
      const optimizer = new EarlyExitTokenOptimizer(store);

      await optimizer.checkEarlyExit({
        description: 'Generate unit tests',
      });

      const stats = optimizer.getReuseStats();

      expect(stats.totalReuses).toBe(0);
      expect(stats.totalAttempts).toBe(1);
      expect(stats.exitRate).toBe(0);
      expect(stats.reasonBreakdown.no_matching_pattern).toBe(1);
    });

    it('should calculate correct exit rate over multiple attempts', async () => {
      const goodPattern = createMockPattern({
        id: 'good-pattern',
        confidence: 0.9,
        successRate: 0.95,
        qualityScore: 0.85,
        successfulUses: 5,
      });

      const store = createMockPatternStore([
        { pattern: goodPattern, score: 0.9, matchType: 'vector' },
      ]);

      const optimizer = new EarlyExitTokenOptimizer(store);

      // First attempt - success
      await optimizer.checkEarlyExit({
        description: 'Generate unit tests',
        domain: 'test-generation',
      });

      // Reset store to return no results for second attempt
      vi.mocked(store.search).mockResolvedValueOnce(ok([]));

      // Second attempt - failure
      await optimizer.checkEarlyExit({
        description: 'Some other task',
      });

      const stats = optimizer.getReuseStats();

      expect(stats.totalReuses).toBe(1);
      expect(stats.totalAttempts).toBe(2);
      expect(stats.exitRate).toBe(0.5);
    });

    it('should track domain breakdown', async () => {
      const pattern1 = createMockPattern({
        id: 'pattern-1',
        qeDomain: 'test-generation',
        confidence: 0.9,
        successRate: 0.95,
        qualityScore: 0.85,
        successfulUses: 5,
      });

      const pattern2 = createMockPattern({
        id: 'pattern-2',
        qeDomain: 'coverage-analysis',
        confidence: 0.9,
        successRate: 0.95,
        qualityScore: 0.85,
        successfulUses: 5,
      });

      const store = createMockPatternStore([]);
      const optimizer = new EarlyExitTokenOptimizer(store);

      // First domain
      vi.mocked(store.search).mockResolvedValueOnce(ok([
        { pattern: pattern1, score: 0.9, matchType: 'vector' },
      ]));
      await optimizer.checkEarlyExit({
        description: 'Generate tests',
        domain: 'test-generation',
      });

      // Second domain
      vi.mocked(store.search).mockResolvedValueOnce(ok([
        { pattern: pattern2, score: 0.9, matchType: 'vector' },
      ]));
      await optimizer.checkEarlyExit({
        description: 'Analyze coverage',
        domain: 'coverage-analysis',
      });

      const stats = optimizer.getReuseStats();

      expect(stats.domainBreakdown['test-generation']).toBeDefined();
      expect(stats.domainBreakdown['test-generation'].reuses).toBe(1);
      expect(stats.domainBreakdown['coverage-analysis']).toBeDefined();
      expect(stats.domainBreakdown['coverage-analysis'].reuses).toBe(1);
    });
  });

  describe('resetStats', () => {
    it('should reset all statistics', async () => {
      const pattern = createMockPattern({
        confidence: 0.9,
        successRate: 0.95,
        qualityScore: 0.85,
        successfulUses: 5,
      });

      const store = createMockPatternStore([
        { pattern, score: 0.9, matchType: 'vector' },
      ]);

      const optimizer = new EarlyExitTokenOptimizer(store);

      // Perform some operations
      await optimizer.checkEarlyExit({
        description: 'Generate unit tests',
        domain: 'test-generation',
      });

      // Verify stats are populated
      let stats = optimizer.getReuseStats();
      expect(stats.totalReuses).toBeGreaterThan(0);

      // Reset stats
      optimizer.resetStats();

      // Verify stats are cleared
      stats = optimizer.getReuseStats();
      expect(stats.totalReuses).toBe(0);
      expect(stats.tokensSaved).toBe(0);
      expect(stats.totalAttempts).toBe(0);
    });
  });

  describe('Token Estimation', () => {
    it('should estimate tokens based on template content length', async () => {
      const shortPattern = createMockPattern({
        template: {
          type: 'code',
          content: 'short',
          variables: [],
        },
        confidence: 0.9,
        successRate: 0.95,
        qualityScore: 0.85,
        successfulUses: 5,
      });

      const longPattern = createMockPattern({
        id: 'long-pattern',
        template: {
          type: 'code',
          content: 'x'.repeat(1000), // Long content
          variables: [],
        },
        confidence: 0.9,
        successRate: 0.95,
        qualityScore: 0.85,
        successfulUses: 5,
      });

      const store = createMockPatternStore([
        { pattern: shortPattern, score: 0.9, matchType: 'vector' },
      ]);

      const optimizer = new EarlyExitTokenOptimizer(store);

      const result1 = await optimizer.checkEarlyExit({
        description: 'Generate tests',
        domain: 'test-generation',
      });

      vi.mocked(store.search).mockResolvedValueOnce(ok([
        { pattern: longPattern, score: 0.9, matchType: 'vector' },
      ]));

      const result2 = await optimizer.checkEarlyExit({
        description: 'Generate tests',
        domain: 'test-generation',
      });

      expect(result1.estimatedTokensSaved).toBeLessThan(result2.estimatedTokensSaved!);
    });
  });
});
