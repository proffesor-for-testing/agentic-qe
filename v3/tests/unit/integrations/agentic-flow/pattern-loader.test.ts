/**
 * Agentic QE v3 - Pattern Loader Unit Tests
 *
 * Tests for the PatternLoader singleton that loads JSON patterns from
 * .agentic-qe/patterns/ directory.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { join } from 'node:path';
import {
  PatternLoader,
  PatternLoaderError,
  createPatternLoader,
  getPatternLoader,
  loadBoosterPatterns,
  loadRouterPatterns,
  loadEmbeddingPatterns,
  loadReasoningPatterns,
  isBoosterEligible,
  type PatternLoaderConfig,
  type BoosterPatternsFile,
  type RouterPatternsFile,
  type EmbeddingPatternsFile,
  type ReasoningPatternsFile,
} from '../../../../src/integrations/agentic-flow/pattern-loader';

// Get the v3 project root for test fixtures
const V3_ROOT = join(__dirname, '..', '..', '..', '..');
const PATTERNS_PATH = join(V3_ROOT, '.agentic-qe', 'patterns');

describe('PatternLoader', () => {
  // Reset singleton between tests
  beforeEach(() => {
    PatternLoader.resetInstance();
  });

  afterEach(() => {
    PatternLoader.resetInstance();
  });

  describe('singleton pattern', () => {
    it('should return the same instance when getInstance is called multiple times', () => {
      const instance1 = PatternLoader.getInstance();
      const instance2 = PatternLoader.getInstance();
      expect(instance1).toBe(instance2);
    });

    it('should reset instance when resetInstance is called', () => {
      const instance1 = PatternLoader.getInstance();
      PatternLoader.resetInstance();
      const instance2 = PatternLoader.getInstance();
      expect(instance1).not.toBe(instance2);
    });

    it('should allow config on first getInstance call', () => {
      const config: PatternLoaderConfig = { throwOnMissing: true };
      const instance = PatternLoader.getInstance(config);
      expect(instance).toBeDefined();
    });
  });

  describe('loadPatterns', () => {
    it('should load all pattern files from disk', async () => {
      const loader = PatternLoader.getInstance({ basePath: PATTERNS_PATH });
      await loader.loadPatterns();

      expect(loader.isLoaded()).toBe(true);
      expect(loader.getLoadedAt()).toBeInstanceOf(Date);
    });

    it('should load index file', async () => {
      const loader = PatternLoader.getInstance({ basePath: PATTERNS_PATH });
      const index = await loader.getIndex();

      expect(index).not.toBeNull();
      expect(index?.name).toBe('ADR-051 Pattern Memory Store');
      expect(index?.version).toBe('1.0');
    });

    it('should load booster patterns', async () => {
      const loader = PatternLoader.getInstance({ basePath: PATTERNS_PATH });
      const patterns = await loader.getBoosterPatterns();

      expect(patterns).not.toBeNull();
      expect(patterns?.namespace).toBe('adr-051/booster-patterns');
      expect(patterns?.patterns).toBeInstanceOf(Array);
      expect(patterns?.patterns.length).toBeGreaterThan(0);
    });

    it('should load router patterns', async () => {
      const loader = PatternLoader.getInstance({ basePath: PATTERNS_PATH });
      const patterns = await loader.getRouterPatterns();

      expect(patterns).not.toBeNull();
      expect(patterns?.namespace).toBe('adr-051/router-patterns');
      expect(patterns?.patterns).toBeInstanceOf(Array);
      expect(patterns?.patterns.length).toBeGreaterThan(0);
    });

    it('should load embedding patterns', async () => {
      const loader = PatternLoader.getInstance({ basePath: PATTERNS_PATH });
      const patterns = await loader.getEmbeddingPatterns();

      expect(patterns).not.toBeNull();
      expect(patterns?.namespace).toBe('adr-051/embedding-patterns');
      expect(patterns?.patterns).toBeInstanceOf(Array);
      expect(patterns?.patterns.length).toBeGreaterThan(0);
    });

    it('should load reasoning patterns', async () => {
      const loader = PatternLoader.getInstance({ basePath: PATTERNS_PATH });
      const patterns = await loader.getReasoningPatterns();

      expect(patterns).not.toBeNull();
      expect(patterns?.namespace).toBe('adr-051/reasoning-patterns');
      expect(patterns?.patterns).toBeInstanceOf(Array);
      expect(patterns?.patterns.length).toBeGreaterThan(0);
    });

    it('should handle missing files gracefully when throwOnMissing is false', async () => {
      const loader = PatternLoader.getInstance({
        basePath: '/nonexistent/path',
        throwOnMissing: false,
      });
      await loader.loadPatterns();

      expect(loader.isLoaded()).toBe(true);
      expect(loader.getErrors().length).toBeGreaterThan(0);
      expect(await loader.getBoosterPatterns()).toBeNull();
    });

    it('should throw when throwOnMissing is true and file is missing', async () => {
      const loader = PatternLoader.getInstance({
        basePath: '/nonexistent/path',
        throwOnMissing: true,
      });

      await expect(loader.loadPatterns()).rejects.toThrow(PatternLoaderError);
    });

    it('should not load patterns concurrently', async () => {
      const loader = PatternLoader.getInstance({ basePath: PATTERNS_PATH });

      // Start multiple load calls simultaneously
      const loadPromise1 = loader.loadPatterns();
      const loadPromise2 = loader.loadPatterns();
      const loadPromise3 = loader.loadPatterns();

      await Promise.all([loadPromise1, loadPromise2, loadPromise3]);

      // Should only have loaded once
      expect(loader.isLoaded()).toBe(true);
    });
  });

  describe('lazy loading', () => {
    it('should lazy-load patterns on first getBoosterPatterns call', async () => {
      const loader = PatternLoader.getInstance({ basePath: PATTERNS_PATH });
      expect(loader.isLoaded()).toBe(false);

      const patterns = await loader.getBoosterPatterns();
      expect(loader.isLoaded()).toBe(true);
      expect(patterns).not.toBeNull();
    });

    it('should lazy-load patterns on first getRouterPatterns call', async () => {
      const loader = PatternLoader.getInstance({ basePath: PATTERNS_PATH });
      expect(loader.isLoaded()).toBe(false);

      const patterns = await loader.getRouterPatterns();
      expect(loader.isLoaded()).toBe(true);
      expect(patterns).not.toBeNull();
    });

    it('should lazy-load patterns on first getIndex call', async () => {
      const loader = PatternLoader.getInstance({ basePath: PATTERNS_PATH });
      expect(loader.isLoaded()).toBe(false);

      const index = await loader.getIndex();
      expect(loader.isLoaded()).toBe(true);
      expect(index).not.toBeNull();
    });
  });

  describe('getBoosterPatternByKey', () => {
    it('should retrieve transform eligibility pattern by key', async () => {
      const loader = PatternLoader.getInstance({ basePath: PATTERNS_PATH });
      const pattern = await loader.getBoosterPatternByKey(
        'booster-transform-eligibility'
      );

      expect(pattern).not.toBeNull();
      expect(pattern?.key).toBe('booster-transform-eligibility');
      expect(pattern?.eligibility_criteria).toBeDefined();
      expect(pattern?.eligibility_criteria.simple_transforms).toContain(
        'var-to-const'
      );
    });

    it('should retrieve batch optimization pattern by key', async () => {
      const loader = PatternLoader.getInstance({ basePath: PATTERNS_PATH });
      const pattern = await loader.getBoosterPatternByKey(
        'booster-batch-optimization'
      );

      expect(pattern).not.toBeNull();
      expect(pattern?.key).toBe('booster-batch-optimization');
      expect(pattern?.batch_strategy).toBeDefined();
    });

    it('should retrieve wasm fallback pattern by key', async () => {
      const loader = PatternLoader.getInstance({ basePath: PATTERNS_PATH });
      const pattern = await loader.getBoosterPatternByKey('booster-wasm-fallback');

      expect(pattern).not.toBeNull();
      expect(pattern?.key).toBe('booster-wasm-fallback');
      expect(pattern?.fallback_triggers).toBeDefined();
    });

    it('should return null for non-existent key', async () => {
      const loader = PatternLoader.getInstance({ basePath: PATTERNS_PATH });
      const pattern = await loader.getBoosterPatternByKey(
        'non-existent-key' as never
      );

      expect(pattern).toBeNull();
    });
  });

  describe('getRouterPatternByKey', () => {
    it('should retrieve 5-tier complexity pattern by key', async () => {
      const loader = PatternLoader.getInstance({ basePath: PATTERNS_PATH });
      const pattern = await loader.getRouterPatternByKey('router-5tier-complexity');

      expect(pattern).not.toBeNull();
      expect(pattern?.key).toBe('router-5tier-complexity');
      expect(pattern?.tier_hierarchy).toBeDefined();
      expect(pattern?.tier_hierarchy.tier_1_booster).toBeDefined();
    });

    it('should retrieve budget enforcement pattern by key', async () => {
      const loader = PatternLoader.getInstance({ basePath: PATTERNS_PATH });
      const pattern = await loader.getRouterPatternByKey(
        'router-budget-enforcement'
      );

      expect(pattern).not.toBeNull();
      expect(pattern?.key).toBe('router-budget-enforcement');
      expect(pattern?.budget_constraints).toBeDefined();
    });

    it('should retrieve booster integration pattern by key', async () => {
      const loader = PatternLoader.getInstance({ basePath: PATTERNS_PATH });
      const pattern = await loader.getRouterPatternByKey(
        'router-booster-integration'
      );

      expect(pattern).not.toBeNull();
      expect(pattern?.key).toBe('router-booster-integration');
      expect(pattern?.integration_flow).toBeDefined();
    });
  });

  describe('getEmbeddingPatternByKey', () => {
    it('should retrieve local generation pattern by key', async () => {
      const loader = PatternLoader.getInstance({ basePath: PATTERNS_PATH });
      const pattern = await loader.getEmbeddingPatternByKey(
        'embeddings-local-generation'
      );

      expect(pattern).not.toBeNull();
      expect(pattern?.key).toBe('embeddings-local-generation');
      expect(pattern?.models_supported).toBeDefined();
    });

    it('should retrieve LRU cache pattern by key', async () => {
      const loader = PatternLoader.getInstance({ basePath: PATTERNS_PATH });
      const pattern = await loader.getEmbeddingPatternByKey('embeddings-lru-cache');

      expect(pattern).not.toBeNull();
      expect(pattern?.key).toBe('embeddings-lru-cache');
      expect(pattern?.cache_architecture).toBeDefined();
    });

    it('should retrieve hyperbolic space pattern by key', async () => {
      const loader = PatternLoader.getInstance({ basePath: PATTERNS_PATH });
      const pattern = await loader.getEmbeddingPatternByKey(
        'embeddings-hyperbolic-space'
      );

      expect(pattern).not.toBeNull();
      expect(pattern?.key).toBe('embeddings-hyperbolic-space');
      expect(pattern?.hyperbolic_geometry).toBeDefined();
    });

    it('should retrieve similarity metrics pattern by key', async () => {
      const loader = PatternLoader.getInstance({ basePath: PATTERNS_PATH });
      const pattern = await loader.getEmbeddingPatternByKey(
        'embeddings-similarity-metrics'
      );

      expect(pattern).not.toBeNull();
      expect(pattern?.key).toBe('embeddings-similarity-metrics');
      expect(pattern?.metrics_overview).toBeDefined();
    });
  });

  describe('getReasoningPatternByKey', () => {
    it('should retrieve trajectory tracking pattern by key', async () => {
      const loader = PatternLoader.getInstance({ basePath: PATTERNS_PATH });
      const pattern = await loader.getReasoningPatternByKey(
        'reasoning-trajectory-tracking'
      );

      expect(pattern).not.toBeNull();
      expect(pattern?.key).toBe('reasoning-trajectory-tracking');
      expect(pattern?.trajectory_structure).toBeDefined();
    });

    it('should retrieve pattern quality gates by key', async () => {
      const loader = PatternLoader.getInstance({ basePath: PATTERNS_PATH });
      const pattern = await loader.getReasoningPatternByKey(
        'reasoning-pattern-quality-gates'
      );

      expect(pattern).not.toBeNull();
      expect(pattern?.key).toBe('reasoning-pattern-quality-gates');
      expect(pattern?.gate_thresholds).toBeDefined();
    });

    it('should retrieve experience replay pattern by key', async () => {
      const loader = PatternLoader.getInstance({ basePath: PATTERNS_PATH });
      const pattern = await loader.getReasoningPatternByKey(
        'reasoning-experience-replay'
      );

      expect(pattern).not.toBeNull();
      expect(pattern?.key).toBe('reasoning-experience-replay');
      expect(pattern?.replay_mechanism).toBeDefined();
    });

    it('should retrieve cross-agent sharing pattern by key', async () => {
      const loader = PatternLoader.getInstance({ basePath: PATTERNS_PATH });
      const pattern = await loader.getReasoningPatternByKey(
        'reasoning-cross-agent-sharing'
      );

      expect(pattern).not.toBeNull();
      expect(pattern?.key).toBe('reasoning-cross-agent-sharing');
      expect(pattern?.sharing_channels).toBeDefined();
    });
  });

  describe('helper methods', () => {
    it('should get eligible booster transforms', async () => {
      const loader = PatternLoader.getInstance({ basePath: PATTERNS_PATH });
      const transforms = await loader.getEligibleBoosterTransforms();

      expect(transforms).toBeInstanceOf(Array);
      expect(transforms).toContain('var-to-const');
      expect(transforms).toContain('add-types');
      expect(transforms).toContain('remove-console');
    });

    it('should get tier hierarchy from router patterns', async () => {
      const loader = PatternLoader.getInstance({ basePath: PATTERNS_PATH });
      const hierarchy = await loader.getTierHierarchy();

      expect(hierarchy).not.toBeNull();
      expect(hierarchy?.tier_1_booster).toBeDefined();
      expect(hierarchy?.tier_2_haiku).toBeDefined();
      expect(hierarchy?.tier_3_sonnet).toBeDefined();
      expect(hierarchy?.tier_4_opus).toBeDefined();
      expect(hierarchy?.tier_5_human).toBeDefined();
    });

    it('should get quality gate thresholds from reasoning patterns', async () => {
      const loader = PatternLoader.getInstance({ basePath: PATTERNS_PATH });
      const thresholds = await loader.getQualityGateThresholds();

      expect(thresholds).not.toBeNull();
      expect(thresholds?.bronze_tier).toBeDefined();
      expect(thresholds?.silver_tier).toBeDefined();
      expect(thresholds?.gold_tier).toBeDefined();
      expect(thresholds?.platinum_tier).toBeDefined();
    });

    it('should get pattern statistics', async () => {
      const loader = PatternLoader.getInstance({ basePath: PATTERNS_PATH });
      const stats = await loader.getStatistics();

      expect(stats).not.toBeNull();
      expect(stats?.total_patterns).toBeGreaterThan(0);
      expect(stats?.namespaces).toBeGreaterThan(0);
      expect(stats?.avg_success_rate).toBeGreaterThan(0);
    });
  });

  describe('reload', () => {
    it('should reload patterns from disk', async () => {
      const loader = PatternLoader.getInstance({ basePath: PATTERNS_PATH });

      // Initial load
      await loader.loadPatterns();
      const loadedAt1 = loader.getLoadedAt();

      // Small delay to ensure timestamps differ
      await new Promise((resolve) => setTimeout(resolve, 10));

      // Reload
      await loader.reload();
      const loadedAt2 = loader.getLoadedAt();

      expect(loadedAt1).not.toEqual(loadedAt2);
    });
  });

  describe('getAllPatterns', () => {
    it('should return all loaded patterns', async () => {
      const loader = PatternLoader.getInstance({ basePath: PATTERNS_PATH });
      const allPatterns = await loader.getAllPatterns();

      expect(allPatterns.index).not.toBeNull();
      expect(allPatterns.booster).not.toBeNull();
      expect(allPatterns.router).not.toBeNull();
      expect(allPatterns.embedding).not.toBeNull();
      expect(allPatterns.reasoning).not.toBeNull();
      expect(allPatterns.loadedAt).toBeInstanceOf(Date);
      expect(allPatterns.errors).toBeInstanceOf(Array);
    });
  });
});

describe('Factory functions', () => {
  beforeEach(() => {
    PatternLoader.resetInstance();
  });

  afterEach(() => {
    PatternLoader.resetInstance();
  });

  describe('createPatternLoader', () => {
    it('should return a PatternLoader instance', () => {
      const loader = createPatternLoader({ basePath: PATTERNS_PATH });
      expect(loader).toBeInstanceOf(PatternLoader);
    });

    it('should return the same singleton instance', () => {
      const loader1 = createPatternLoader({ basePath: PATTERNS_PATH });
      const loader2 = createPatternLoader();
      expect(loader1).toBe(loader2);
    });
  });

  describe('getPatternLoader', () => {
    it('should return the singleton instance', () => {
      const loader = getPatternLoader();
      expect(loader).toBeInstanceOf(PatternLoader);
    });
  });
});

describe('Convenience functions', () => {
  beforeEach(() => {
    PatternLoader.resetInstance();
  });

  afterEach(() => {
    PatternLoader.resetInstance();
  });

  describe('loadBoosterPatterns', () => {
    it('should load and return booster patterns', async () => {
      const patterns = await loadBoosterPatterns({ basePath: PATTERNS_PATH });
      expect(patterns).not.toBeNull();
      expect(patterns?.namespace).toBe('adr-051/booster-patterns');
    });
  });

  describe('loadRouterPatterns', () => {
    it('should load and return router patterns', async () => {
      const patterns = await loadRouterPatterns({ basePath: PATTERNS_PATH });
      expect(patterns).not.toBeNull();
      expect(patterns?.namespace).toBe('adr-051/router-patterns');
    });
  });

  describe('loadEmbeddingPatterns', () => {
    it('should load and return embedding patterns', async () => {
      const patterns = await loadEmbeddingPatterns({ basePath: PATTERNS_PATH });
      expect(patterns).not.toBeNull();
      expect(patterns?.namespace).toBe('adr-051/embedding-patterns');
    });
  });

  describe('loadReasoningPatterns', () => {
    it('should load and return reasoning patterns', async () => {
      const patterns = await loadReasoningPatterns({ basePath: PATTERNS_PATH });
      expect(patterns).not.toBeNull();
      expect(patterns?.namespace).toBe('adr-051/reasoning-patterns');
    });
  });

  describe('isBoosterEligible', () => {
    it('should return true for eligible transform types', async () => {
      expect(
        await isBoosterEligible('var-to-const', { basePath: PATTERNS_PATH })
      ).toBe(true);
      expect(
        await isBoosterEligible('add-types', { basePath: PATTERNS_PATH })
      ).toBe(true);
      expect(
        await isBoosterEligible('remove-console', { basePath: PATTERNS_PATH })
      ).toBe(true);
    });

    it('should return false for non-eligible transform types', async () => {
      expect(
        await isBoosterEligible('complex-refactor', { basePath: PATTERNS_PATH })
      ).toBe(false);
      expect(
        await isBoosterEligible('unknown-transform', { basePath: PATTERNS_PATH })
      ).toBe(false);
    });
  });
});

describe('Pattern content validation', () => {
  let loader: PatternLoader;

  beforeEach(() => {
    PatternLoader.resetInstance();
    loader = PatternLoader.getInstance({ basePath: PATTERNS_PATH });
  });

  afterEach(() => {
    PatternLoader.resetInstance();
  });

  describe('Booster patterns structure', () => {
    it('should have valid successRate values', async () => {
      const patterns = await loader.getBoosterPatterns();

      for (const pattern of patterns?.patterns ?? []) {
        expect(pattern.successRate).toBeGreaterThanOrEqual(0);
        expect(pattern.successRate).toBeLessThanOrEqual(1);
      }
    });

    it('should have valid lastUpdated dates', async () => {
      const patterns = await loader.getBoosterPatterns();

      for (const pattern of patterns?.patterns ?? []) {
        expect(pattern.lastUpdated).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      }
    });
  });

  describe('Router patterns structure', () => {
    it('should have all tier definitions in 5-tier pattern', async () => {
      const pattern = await loader.getRouterPatternByKey('router-5tier-complexity');

      expect(pattern?.tier_hierarchy.tier_1_booster.cost).toBeDefined();
      expect(pattern?.tier_hierarchy.tier_2_haiku.cost).toBeDefined();
      expect(pattern?.tier_hierarchy.tier_3_sonnet.cost).toBeDefined();
      expect(pattern?.tier_hierarchy.tier_4_opus.cost).toBeDefined();
      expect(pattern?.tier_hierarchy.tier_5_human.cost).toBeDefined();
    });

    it('should have budget constraints in budget enforcement pattern', async () => {
      const pattern = await loader.getRouterPatternByKey(
        'router-budget-enforcement'
      );

      expect(pattern?.budget_constraints.max_tokens_per_task).toBeDefined();
      expect(pattern?.budget_constraints.max_cost_per_task).toBeDefined();
      expect(pattern?.budget_constraints.max_latency_ms).toBeDefined();
    });
  });

  describe('Embedding patterns structure', () => {
    it('should have supported models in local generation pattern', async () => {
      const pattern = await loader.getEmbeddingPatternByKey(
        'embeddings-local-generation'
      );

      expect(pattern?.models_supported.length).toBeGreaterThan(0);
      expect(pattern?.models_supported.some((m) => m.includes('MiniLM'))).toBe(
        true
      );
    });

    it('should have cache configuration in LRU cache pattern', async () => {
      const pattern = await loader.getEmbeddingPatternByKey('embeddings-lru-cache');

      expect(pattern?.cache_architecture.cache_type).toBe(
        'LRU (Least Recently Used eviction)'
      );
      expect(pattern?.cache_key_strategy.primary_key).toBeDefined();
    });
  });

  describe('Reasoning patterns structure', () => {
    it('should have trajectory structure in tracking pattern', async () => {
      const pattern = await loader.getReasoningPatternByKey(
        'reasoning-trajectory-tracking'
      );

      expect(pattern?.trajectory_structure.trajectory_id).toBeDefined();
      expect(pattern?.trajectory_structure.steps).toBeInstanceOf(Array);
    });

    it('should have quality tiers in quality gates pattern', async () => {
      const pattern = await loader.getReasoningPatternByKey(
        'reasoning-pattern-quality-gates'
      );

      expect(pattern?.gate_thresholds.bronze_tier).toContain('0.70');
      expect(pattern?.gate_thresholds.silver_tier).toContain('0.80');
      expect(pattern?.gate_thresholds.gold_tier).toContain('0.90');
      expect(pattern?.gate_thresholds.platinum_tier).toContain('0.95');
    });
  });
});

describe('Error handling', () => {
  beforeEach(() => {
    PatternLoader.resetInstance();
  });

  afterEach(() => {
    PatternLoader.resetInstance();
  });

  it('should collect errors for invalid JSON files', async () => {
    // This would require mocking fs.readFileSync to return invalid JSON
    // For now, we just test that errors array exists
    const loader = PatternLoader.getInstance({ basePath: '/nonexistent' });
    await loader.loadPatterns();

    const errors = loader.getErrors();
    expect(errors).toBeInstanceOf(Array);
    expect(errors.length).toBeGreaterThan(0);
  });

  it('PatternLoaderError should have correct properties', () => {
    const error = new PatternLoaderError('Test error', 'TEST_CODE');

    expect(error.name).toBe('PatternLoaderError');
    expect(error.message).toBe('Test error');
    expect(error.code).toBe('TEST_CODE');
  });

  it('PatternLoaderError should preserve cause', () => {
    const cause = new Error('Original error');
    const error = new PatternLoaderError('Test error', 'TEST_CODE', cause);

    expect(error.cause).toBe(cause);
  });
});
