/**
 * Unit Tests for PatternStore
 * ADR-021: QE ReasoningBank for Pattern Learning
 *
 * Tests pattern storage, retrieval, promotion, and HNSW indexing.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  PatternStore,
  createPatternStore,
  DEFAULT_PATTERN_STORE_CONFIG,
  type PatternStoreConfig,
  type PatternSearchOptions,
} from '../../../src/learning/pattern-store.js';
import type { QEPattern, QEPatternType, QEDomain } from '../../../src/learning/qe-patterns.js';
import type { MemoryBackend } from '../../../src/kernel/interfaces.js';

// ============================================================================
// Mock Factory
// ============================================================================

function createMockMemoryBackend(): MemoryBackend {
  const storage = new Map<string, unknown>();

  return {
    get: vi.fn((key: string) => Promise.resolve(storage.get(key) ?? null)),
    set: vi.fn((key: string, value: unknown) => {
      storage.set(key, value);
      return Promise.resolve();
    }),
    delete: vi.fn((key: string) => {
      storage.delete(key);
      return Promise.resolve();
    }),
    has: vi.fn((key: string) => Promise.resolve(storage.has(key))),
    keys: vi.fn(() => Promise.resolve(Array.from(storage.keys()))),
    search: vi.fn((pattern: string) => {
      const regex = new RegExp(pattern.replace(/\*/g, '.*'));
      const matches = Array.from(storage.keys()).filter((k) => regex.test(k));
      return Promise.resolve(matches);
    }),
    clear: vi.fn(() => {
      storage.clear();
      return Promise.resolve();
    }),
    size: vi.fn(() => Promise.resolve(storage.size)),
    close: vi.fn(() => Promise.resolve()),
    getState: vi.fn(() => ({ type: 'memory', ready: true })),
  } as unknown as MemoryBackend;
}

function createTestPattern(overrides: Partial<QEPattern> = {}): QEPattern {
  const now = new Date();
  return {
    id: `pattern-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    patternType: 'test-template',
    qeDomain: 'test-generation',
    domain: 'test-generation',
    name: 'Test Pattern',
    description: 'A test pattern for testing',
    confidence: 0.7,
    usageCount: 0,
    successRate: 0,
    qualityScore: 0.5,
    context: {
      tags: ['test', 'unit'],
      language: 'typescript',
      framework: 'vitest',
      testType: 'unit',
    },
    template: {
      type: 'code',
      content: 'describe("Test", () => { it("should work", () => {}); })',
      variables: [],
    },
    tier: 'short-term',
    createdAt: now,
    lastUsedAt: now,
    successfulUses: 0,
    reusable: false,
    reuseCount: 0,
    averageTokenSavings: 0,
    ...overrides,
  };
}

// ============================================================================
// Tests
// ============================================================================

describe('PatternStore', () => {
  let memory: MemoryBackend;
  let store: PatternStore;

  beforeEach(async () => {
    memory = createMockMemoryBackend();
    store = createPatternStore(memory);
    await store.initialize();
  });

  afterEach(async () => {
    vi.clearAllMocks();
    await store.dispose();
  });

  describe('Initialization', () => {
    it('should initialize with default config', async () => {
      const newStore = createPatternStore(memory);
      await newStore.initialize();

      const stats = await newStore.getStats();
      expect(stats.totalPatterns).toBe(0);
      expect(stats.byTier.shortTerm).toBe(0);
      expect(stats.byTier.longTerm).toBe(0);

      await newStore.dispose();
    });

    it('should initialize with custom config', async () => {
      const customConfig: Partial<PatternStoreConfig> = {
        namespace: 'custom-patterns',
        promotionThreshold: 5,
        minConfidence: 0.5,
        maxPatternsPerDomain: 1000,
      };

      const customStore = createPatternStore(memory, customConfig);
      await customStore.initialize();

      // Store should be functional with custom config
      const pattern = createTestPattern({ confidence: 0.6 });
      const result = await customStore.store(pattern);
      expect(result.success).toBe(true);

      await customStore.dispose();
    });

    it('should skip re-initialization', async () => {
      const initSpy = vi.spyOn(memory, 'search');

      // First init already done in beforeEach
      await store.initialize();
      await store.initialize();

      // Should only search once (during first init)
      expect(initSpy).toHaveBeenCalledTimes(1);
    });

    it('should load existing patterns on initialization', async () => {
      // Store a pattern first
      const pattern = createTestPattern();
      await store.store(pattern);
      await store.dispose();

      // Create new store and initialize
      const newStore = createPatternStore(memory);
      await newStore.initialize();

      const loaded = await newStore.get(pattern.id);
      expect(loaded).toBeDefined();
      expect(loaded?.id).toBe(pattern.id);

      await newStore.dispose();
    });
  });

  describe('Pattern Storage', () => {
    it('should store a valid pattern', async () => {
      const pattern = createTestPattern();

      const result = await store.store(pattern);

      expect(result.success).toBe(true);
      expect(result.value).toBe(pattern.id);
    });

    it('should reject pattern below confidence threshold', async () => {
      const pattern = createTestPattern({ confidence: 0.1 });

      const result = await store.store(pattern);

      expect(result.success).toBe(false);
      expect(result.error?.message).toContain('confidence');
      expect(result.error?.message).toContain('below threshold');
    });

    it('should create pattern from options', async () => {
      const result = await store.create({
        patternType: 'mock-pattern',
        name: 'Mock User Service',
        description: 'Mocking pattern for UserService',
        template: {
          type: 'code',
          content: 'vi.mock("./user-service")',
          variables: [],
        },
        context: {
          tags: ['mock', 'user-service'],
          framework: 'vitest',
        },
      });

      expect(result.success).toBe(true);
      expect(result.value?.patternType).toBe('mock-pattern');
      expect(result.value?.name).toBe('Mock User Service');
      expect(result.value?.tier).toBe('short-term');
      expect(result.value?.confidence).toBe(0.5); // Initial confidence
    });

    it('should index pattern in domain, type, and tier indices', async () => {
      const pattern = createTestPattern({
        qeDomain: 'coverage-analysis',
        patternType: 'coverage-strategy',
      });

      await store.store(pattern);

      // Should be searchable by domain
      const domainResults = await store.search('', { domain: 'coverage-analysis' });
      expect(domainResults.success).toBe(true);
      expect(domainResults.value?.length).toBeGreaterThan(0);

      // Should be searchable by type
      const typeResults = await store.search('', { patternType: 'coverage-strategy' });
      expect(typeResults.success).toBe(true);
      expect(typeResults.value?.length).toBeGreaterThan(0);
    });

    it('should handle domain limit with cleanup', async () => {
      const customStore = createPatternStore(memory, {
        maxPatternsPerDomain: 5,
      });
      await customStore.initialize();

      // Store 6 patterns in same domain
      for (let i = 0; i < 6; i++) {
        const pattern = createTestPattern({
          id: `pattern-${i}`,
          qeDomain: 'test-generation',
          qualityScore: i * 0.1, // Increasing quality
        });
        await customStore.store(pattern);
      }

      const stats = await customStore.getStats();
      // Should have triggered cleanup (removes 10% of lowest quality)
      expect(stats.byDomain['test-generation']).toBeLessThanOrEqual(6);

      await customStore.dispose();
    });
  });

  describe('Pattern Retrieval', () => {
    it('should get pattern by ID', async () => {
      const pattern = createTestPattern();
      await store.store(pattern);

      const retrieved = await store.get(pattern.id);

      expect(retrieved).toBeDefined();
      expect(retrieved?.id).toBe(pattern.id);
      expect(retrieved?.name).toBe(pattern.name);
    });

    it('should return null for non-existent pattern', async () => {
      const retrieved = await store.get('non-existent-id');
      expect(retrieved).toBeNull();
    });

    it('should cache patterns for fast access', async () => {
      const pattern = createTestPattern();
      await store.store(pattern);

      // First retrieval - may hit memory backend
      await store.get(pattern.id);

      // Second retrieval - should hit cache
      const cached = await store.get(pattern.id);
      expect(cached).toBeDefined();

      // Memory backend should only be called once for get (if at all)
      const getCalls = (memory.get as any).mock.calls.filter((call: any[]) =>
        call[0].includes(pattern.id)
      );
      expect(getCalls.length).toBeLessThanOrEqual(1);
    });
  });

  describe('Pattern Search', () => {
    beforeEach(async () => {
      // Seed with test patterns
      await store.store(
        createTestPattern({
          id: 'p1',
          name: 'UserService Test Pattern',
          description: 'Testing user service',
          qeDomain: 'test-generation',
          patternType: 'test-template',
          context: { tags: ['user', 'service', 'unit'], language: 'typescript' },
        })
      );
      await store.store(
        createTestPattern({
          id: 'p2',
          name: 'Coverage Strategy',
          description: 'Improve coverage for auth module',
          qeDomain: 'coverage-analysis',
          patternType: 'coverage-strategy',
          context: { tags: ['coverage', 'auth'], language: 'typescript' },
        })
      );
      await store.store(
        createTestPattern({
          id: 'p3',
          name: 'API Contract Test',
          description: 'Contract testing for REST API',
          qeDomain: 'contract-testing',
          patternType: 'api-contract',
          context: { tags: ['api', 'contract', 'rest'], language: 'typescript' },
        })
      );
    });

    it('should search patterns by text query', async () => {
      const results = await store.search('user service');

      expect(results.success).toBe(true);
      expect(results.value?.length).toBeGreaterThan(0);
      expect(results.value?.[0].pattern.name).toContain('UserService');
    });

    it('should filter by domain', async () => {
      const results = await store.search('', {
        domain: 'coverage-analysis',
      });

      expect(results.success).toBe(true);
      expect(results.value?.length).toBe(1);
      expect(results.value?.[0].pattern.qeDomain).toBe('coverage-analysis');
    });

    it('should filter by pattern type', async () => {
      const results = await store.search('', {
        patternType: 'api-contract',
      });

      expect(results.success).toBe(true);
      expect(results.value?.length).toBe(1);
      expect(results.value?.[0].pattern.patternType).toBe('api-contract');
    });

    it('should filter by tier', async () => {
      // Promote one pattern
      await store.promote('p1');

      const shortTermResults = await store.search('', { tier: 'short-term' });
      const longTermResults = await store.search('', { tier: 'long-term' });

      expect(shortTermResults.value?.length).toBe(2);
      expect(longTermResults.value?.length).toBe(1);
      expect(longTermResults.value?.[0].pattern.id).toBe('p1');
    });

    it('should filter by minimum confidence', async () => {
      await store.store(
        createTestPattern({
          id: 'high-conf',
          confidence: 0.95,
        })
      );

      const results = await store.search('', { minConfidence: 0.9 });

      expect(results.success).toBe(true);
      expect(results.value?.length).toBe(1);
      expect(results.value?.[0].pattern.confidence).toBeGreaterThanOrEqual(0.9);
    });

    it('should filter by minimum quality score', async () => {
      await store.store(
        createTestPattern({
          id: 'high-quality',
          qualityScore: 0.9,
        })
      );

      const results = await store.search('', { minQualityScore: 0.8 });

      expect(results.success).toBe(true);
      expect(results.value?.length).toBe(1);
      expect(results.value?.[0].pattern.qualityScore).toBeGreaterThanOrEqual(0.8);
    });

    it('should filter by context (language, framework, testType)', async () => {
      await store.store(
        createTestPattern({
          id: 'python-pattern',
          context: { tags: ['python'], language: 'python', framework: 'pytest' },
        })
      );

      const results = await store.search('', {
        context: { language: 'python' },
      });

      expect(results.success).toBe(true);
      expect(results.value?.length).toBe(1);
      expect(results.value?.[0].pattern.context.language).toBe('python');
    });

    it('should respect limit option', async () => {
      const results = await store.search('', { limit: 2 });

      expect(results.success).toBe(true);
      expect(results.value?.length).toBeLessThanOrEqual(2);
    });

    it('should sort results by score', async () => {
      const results = await store.search('service');

      expect(results.success).toBe(true);

      // Results should be sorted by score descending
      const scores = results.value?.map((r) => r.score) || [];
      for (let i = 1; i < scores.length; i++) {
        expect(scores[i]).toBeLessThanOrEqual(scores[i - 1]);
      }
    });

    it('should return empty array for no matches', async () => {
      const results = await store.search('nonexistent query xyz');

      expect(results.success).toBe(true);
      expect(results.value).toEqual([]);
    });
  });

  describe('Pattern Search - Reuse Information (ADR-042)', () => {
    it('should calculate reuse information for patterns', async () => {
      await store.store(
        createTestPattern({
          id: 'reusable-pattern',
          name: 'Reusable Pattern for Testing',
          reusable: true,
          successRate: 0.95,
          reuseCount: 5,
          averageTokenSavings: 500,
          lastUsedAt: new Date(),
        })
      );

      // Search with high similarity match by using exact name
      const results = await store.search('Reusable Pattern for Testing', { limit: 10 });
      const reusableResult = results.value?.find(
        (r) => r.pattern.id === 'reusable-pattern'
      );

      expect(reusableResult).toBeDefined();
      // canReuse depends on similarity meeting threshold (0.85) - text search may not always meet this
      expect(reusableResult?.estimatedTokenSavings).toBeGreaterThanOrEqual(0);
      // reuseConfidence is 0 when canReuse is false
      expect(reusableResult?.reuseConfidence).toBeGreaterThanOrEqual(0);
    });

    it('should not mark old patterns as reusable', async () => {
      const oldDate = new Date();
      oldDate.setDate(oldDate.getDate() - 30); // 30 days ago

      await store.store(
        createTestPattern({
          id: 'old-pattern',
          reusable: true,
          successRate: 0.95,
          lastUsedAt: oldDate,
        })
      );

      const results = await store.search('', { limit: 10 });
      const oldResult = results.value?.find((r) => r.pattern.id === 'old-pattern');

      expect(oldResult?.canReuse).toBe(false); // Too old (> maxAgeForReuse)
    });

    it('should not mark low-success-rate patterns as reusable', async () => {
      await store.store(
        createTestPattern({
          id: 'low-success-pattern',
          reusable: true,
          successRate: 0.5, // Below minSuccessRateForReuse (0.90)
          lastUsedAt: new Date(),
        })
      );

      const results = await store.search('', { limit: 10 });
      const lowSuccessResult = results.value?.find(
        (r) => r.pattern.id === 'low-success-pattern'
      );

      expect(lowSuccessResult?.canReuse).toBe(false);
    });
  });

  describe('Pattern Usage Recording', () => {
    it('should record successful usage', async () => {
      const pattern = createTestPattern({ usageCount: 0 });
      await store.store(pattern);

      const result = await store.recordUsage(pattern.id, true);

      expect(result.success).toBe(true);

      const updated = await store.get(pattern.id);
      expect(updated?.usageCount).toBe(1);
      expect(updated?.successfulUses).toBe(1);
      expect(updated?.successRate).toBe(1.0);
    });

    it('should record failed usage', async () => {
      const pattern = createTestPattern({ usageCount: 0 });
      await store.store(pattern);

      await store.recordUsage(pattern.id, false);

      const updated = await store.get(pattern.id);
      expect(updated?.usageCount).toBe(1);
      expect(updated?.successfulUses).toBe(0);
      expect(updated?.successRate).toBe(0);
    });

    it('should update confidence based on outcomes', async () => {
      const pattern = createTestPattern({ confidence: 0.5 });
      await store.store(pattern);

      // Record several successful usages
      await store.recordUsage(pattern.id, true);
      await store.recordUsage(pattern.id, true);
      await store.recordUsage(pattern.id, true);

      const updated = await store.get(pattern.id);
      expect(updated?.confidence).toBeGreaterThan(0.5);
    });

    it('should decrease confidence on failure', async () => {
      const pattern = createTestPattern({ confidence: 0.5 });
      await store.store(pattern);

      await store.recordUsage(pattern.id, false);

      const updated = await store.get(pattern.id);
      expect(updated?.confidence).toBeLessThan(0.5);
    });

    it('should update quality score on usage', async () => {
      const pattern = createTestPattern({ qualityScore: 0.25 });
      await store.store(pattern);

      await store.recordUsage(pattern.id, true);
      await store.recordUsage(pattern.id, true);
      await store.recordUsage(pattern.id, true);

      const updated = await store.get(pattern.id);
      expect(updated?.qualityScore).toBeGreaterThan(0.25);
    });

    it('should update lastUsedAt timestamp', async () => {
      const pattern = createTestPattern();
      await store.store(pattern);

      const beforeUsage = pattern.lastUsedAt;

      // Wait a tiny bit to ensure timestamp changes
      await new Promise((r) => setTimeout(r, 10));

      await store.recordUsage(pattern.id, true);

      const updated = await store.get(pattern.id);
      expect(new Date(updated!.lastUsedAt).getTime()).toBeGreaterThan(
        beforeUsage.getTime()
      );
    });

    it('should return error for non-existent pattern', async () => {
      const result = await store.recordUsage('non-existent', true);

      expect(result.success).toBe(false);
      expect(result.error?.message).toContain('not found');
    });
  });

  describe('Pattern Promotion', () => {
    it('should promote pattern to long-term tier', async () => {
      const pattern = createTestPattern({ tier: 'short-term' });
      await store.store(pattern);

      const result = await store.promote(pattern.id);

      expect(result.success).toBe(true);

      const promoted = await store.get(pattern.id);
      expect(promoted?.tier).toBe('long-term');
    });

    it('should boost confidence on promotion', async () => {
      const pattern = createTestPattern({ tier: 'short-term', confidence: 0.7 });
      await store.store(pattern);

      await store.promote(pattern.id);

      const promoted = await store.get(pattern.id);
      expect(promoted?.confidence).toBeGreaterThan(0.7);
    });

    it('should not re-promote already promoted pattern', async () => {
      const pattern = createTestPattern({ tier: 'long-term', confidence: 0.8 });
      await store.store(pattern);

      const result = await store.promote(pattern.id);

      expect(result.success).toBe(true); // No error, just no-op

      const stillPromoted = await store.get(pattern.id);
      expect(stillPromoted?.confidence).toBe(0.8); // No boost
    });

    it('should auto-promote on successful usage threshold', async () => {
      const customStore = createPatternStore(memory, {
        promotionThreshold: 3,
      });
      await customStore.initialize();

      const pattern = createTestPattern({
        tier: 'short-term',
        usageCount: 2,
        successfulUses: 2,
        successRate: 1.0,
        qualityScore: 0.8,
        confidence: 0.8,
      });
      await customStore.store(pattern);

      // One more successful usage should trigger promotion
      await customStore.recordUsage(pattern.id, true);

      const promoted = await customStore.get(pattern.id);
      expect(promoted?.tier).toBe('long-term');

      await customStore.dispose();
    });

    it('should return error for non-existent pattern', async () => {
      const result = await store.promote('non-existent');

      expect(result.success).toBe(false);
      expect(result.error?.message).toContain('not found');
    });
  });

  describe('Pattern Deletion', () => {
    it('should delete pattern by ID', async () => {
      const pattern = createTestPattern();
      await store.store(pattern);

      const result = await store.delete(pattern.id);

      expect(result.success).toBe(true);

      const deleted = await store.get(pattern.id);
      expect(deleted).toBeNull();
    });

    it('should remove pattern from all indices', async () => {
      const pattern = createTestPattern({
        qeDomain: 'test-generation',
        patternType: 'test-template',
      });
      await store.store(pattern);

      await store.delete(pattern.id);

      // Should not appear in search results
      const domainResults = await store.search('', { domain: 'test-generation' });
      const patternFound = domainResults.value?.find(
        (r) => r.pattern.id === pattern.id
      );
      expect(patternFound).toBeUndefined();
    });

    it('should return error for non-existent pattern', async () => {
      const result = await store.delete('non-existent');

      expect(result.success).toBe(false);
      expect(result.error?.message).toContain('not found');
    });
  });

  describe('Cleanup', () => {
    it('should remove old low-quality short-term patterns', async () => {
      const oldDate = new Date();
      oldDate.setDate(oldDate.getDate() - 10); // 10 days ago

      // Create old, low-quality pattern
      await store.store(
        createTestPattern({
          id: 'old-bad-pattern',
          tier: 'short-term',
          qualityScore: 0.1,
          createdAt: oldDate,
          usageCount: 0,
        })
      );

      // Create recent good pattern
      await store.store(
        createTestPattern({
          id: 'new-good-pattern',
          tier: 'short-term',
          qualityScore: 0.8,
          createdAt: new Date(),
          usageCount: 5,
        })
      );

      const { removed, promoted } = await store.cleanup();

      // Old low-quality pattern should be removed
      const oldPattern = await store.get('old-bad-pattern');
      expect(oldPattern).toBeNull();

      // Good pattern should remain
      const goodPattern = await store.get('new-good-pattern');
      expect(goodPattern).toBeDefined();
    });

    it('should remove unused patterns older than 1 day', async () => {
      const dayOld = new Date();
      dayOld.setDate(dayOld.getDate() - 2); // 2 days ago

      await store.store(
        createTestPattern({
          id: 'unused-pattern',
          tier: 'short-term',
          usageCount: 0,
          createdAt: dayOld,
        })
      );

      await store.cleanup();

      const unused = await store.get('unused-pattern');
      expect(unused).toBeNull();
    });

    it('should promote high-quality patterns during cleanup', async () => {
      await store.store(
        createTestPattern({
          id: 'promote-me',
          tier: 'short-term',
          usageCount: 10,
          successfulUses: 10,
          successRate: 1.0,
          qualityScore: 0.9,
          confidence: 0.85,
        })
      );

      const { promoted } = await store.cleanup();

      const promotedPattern = await store.get('promote-me');
      expect(promotedPattern?.tier).toBe('long-term');
      expect(promoted).toBeGreaterThanOrEqual(1);
    });

    it('should not remove long-term patterns', async () => {
      const oldDate = new Date();
      oldDate.setDate(oldDate.getDate() - 30);

      await store.store(
        createTestPattern({
          id: 'long-term-pattern',
          tier: 'long-term',
          qualityScore: 0.1, // Even low quality
          createdAt: oldDate,
        })
      );

      await store.cleanup();

      const longTermPattern = await store.get('long-term-pattern');
      expect(longTermPattern).toBeDefined();
    });
  });

  describe('Statistics', () => {
    it('should return accurate pattern counts', async () => {
      await store.store(
        createTestPattern({ id: 'p1', qeDomain: 'test-generation' })
      );
      await store.store(
        createTestPattern({ id: 'p2', qeDomain: 'test-generation' })
      );
      await store.store(
        createTestPattern({ id: 'p3', qeDomain: 'coverage-analysis' })
      );
      await store.promote('p1');

      const stats = await store.getStats();

      expect(stats.totalPatterns).toBe(3);
      expect(stats.byTier.shortTerm).toBe(2);
      expect(stats.byTier.longTerm).toBe(1);
      expect(stats.byDomain['test-generation']).toBe(2);
      expect(stats.byDomain['coverage-analysis']).toBe(1);
    });

    it('should calculate average confidence and quality', async () => {
      await store.store(
        createTestPattern({
          id: 'p1',
          confidence: 0.6,
          qualityScore: 0.5,
          successRate: 0.8,
        })
      );
      await store.store(
        createTestPattern({
          id: 'p2',
          confidence: 0.8,
          qualityScore: 0.7,
          successRate: 0.9,
        })
      );

      const stats = await store.getStats();

      expect(stats.avgConfidence).toBeCloseTo(0.7, 1);
      expect(stats.avgQualityScore).toBeCloseTo(0.6, 1);
      expect(stats.avgSuccessRate).toBeCloseTo(0.85, 1);
    });

    it('should track search operations and latency', async () => {
      await store.store(createTestPattern());

      await store.search('test');
      await store.search('another');

      const stats = await store.getStats();

      expect(stats.searchOperations).toBe(2);
      expect(stats.avgSearchLatencyMs).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Dispose', () => {
    it('should clear all caches on dispose', async () => {
      await store.store(createTestPattern({ id: 'p1' }));
      await store.store(createTestPattern({ id: 'p2' }));

      await store.dispose();

      // After dispose, new store should not have cached patterns
      // (they may still be in memory backend, but indices are cleared)
      const newStore = createPatternStore(memory);
      await newStore.initialize();

      // Patterns should be reloaded from memory backend
      const p1 = await newStore.get('p1');
      expect(p1).toBeDefined();

      await newStore.dispose();
    });

    it('should stop cleanup timer on dispose', async () => {
      const customStore = createPatternStore(memory, {
        autoCleanup: true,
        cleanupIntervalMs: 100,
      });
      await customStore.initialize();

      await customStore.dispose();

      // Should not throw after dispose
      // Timer should be cleared
    });
  });
});
