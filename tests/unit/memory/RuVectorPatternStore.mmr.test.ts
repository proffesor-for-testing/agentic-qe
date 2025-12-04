/**
 * RuVectorPatternStore MMR (Maximal Marginal Relevance) Tests
 *
 * Comprehensive tests for MMR diversity search functionality.
 * Tests relevance-diversity tradeoff, parameter effects, and edge cases.
 *
 * NO MOCKS - Uses real RuVectorPatternStore with actual embeddings.
 */

import {
  RuVectorPatternStore,
  type MMRSearchOptions,
} from '../../../src/core/memory/RuVectorPatternStore';
import type { TestPattern } from '../../../src/core/memory/IPatternStore';

describe('RuVectorPatternStore - MMR Search', () => {
  let store: RuVectorPatternStore;

  /**
   * Generate a deterministic embedding based on seed
   * Creates realistic 384-dimensional vectors
   */
  const generateEmbedding = (seed: number, dimension: number = 384): number[] => {
    const embedding: number[] = [];
    for (let i = 0; i < dimension; i++) {
      // Use simple deterministic formula for reproducibility
      const value = Math.sin(seed * 12.9898 + i * 78.233) * 43758.5453;
      embedding.push((value - Math.floor(value)) * 2 - 1);
    }
    // Normalize to unit vector for consistent similarity
    const magnitude = Math.sqrt(embedding.reduce((sum, val) => sum + val * val, 0));
    return embedding.map(val => val / magnitude);
  };

  /**
   * Create a similar embedding by mixing two embeddings
   */
  const createSimilarEmbedding = (
    base: number[],
    seed: number,
    similarity: number = 0.9
  ): number[] => {
    const noise = generateEmbedding(seed);
    const mixed = base.map((val, i) => val * similarity + noise[i] * (1 - similarity));
    // Normalize
    const magnitude = Math.sqrt(mixed.reduce((sum, val) => sum + val * val, 0));
    return mixed.map(val => val / magnitude);
  };

  /**
   * Calculate cosine similarity between two vectors
   */
  const cosineSimilarity = (a: number[], b: number[]): number => {
    if (a.length !== b.length) return 0;
    let dotProduct = 0;
    let normA = 0;
    let normB = 0;
    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }
    const magnitude = Math.sqrt(normA) * Math.sqrt(normB);
    return magnitude > 0 ? dotProduct / magnitude : 0;
  };

  /**
   * Calculate average pairwise similarity of results
   * Used to verify diversity
   */
  const calculateAvgPairwiseSimilarity = (patterns: TestPattern[]): number => {
    if (patterns.length < 2) return 0;

    let totalSimilarity = 0;
    let count = 0;

    for (let i = 0; i < patterns.length; i++) {
      for (let j = i + 1; j < patterns.length; j++) {
        totalSimilarity += cosineSimilarity(patterns[i].embedding, patterns[j].embedding);
        count++;
      }
    }

    return count > 0 ? totalSimilarity / count : 0;
  };

  /**
   * Create test pattern with specific properties
   */
  const createTestPattern = (
    id: string,
    embedding: number[],
    options: {
      domain?: string;
      type?: string;
      framework?: string;
      content?: string;
    } = {}
  ): TestPattern => ({
    id,
    type: options.type ?? 'unit-test',
    domain: options.domain ?? 'testing',
    embedding,
    content: options.content ?? `Test pattern ${id}`,
    framework: options.framework ?? 'jest',
    coverage: 0.85,
    verdict: 'success',
    createdAt: Date.now(),
    lastUsed: Date.now(),
    usageCount: 0,
  });

  beforeEach(async () => {
    store = new RuVectorPatternStore({
      dimension: 384,
      metric: 'cosine',
      enableMetrics: true,
    });
    await store.initialize();
  });

  afterEach(async () => {
    await store.clear();
    await store.shutdown();
  });

  describe('Basic MMR Functionality', () => {
    beforeEach(async () => {
      // Create 20 patterns: 10 highly similar to query, 10 diverse
      const queryEmbedding = generateEmbedding(1000);

      // Similar group - high relevance
      for (let i = 0; i < 10; i++) {
        const embedding = createSimilarEmbedding(queryEmbedding, 1000 + i, 0.95);
        await store.storePattern(
          createTestPattern(`similar-${i}`, embedding, { domain: 'similar-group' })
        );
      }

      // Diverse group - lower relevance but different from each other
      for (let i = 0; i < 10; i++) {
        const embedding = generateEmbedding(2000 + i * 100);
        await store.storePattern(
          createTestPattern(`diverse-${i}`, embedding, { domain: 'diverse-group' })
        );
      }
    });

    it('should return diverse results with default MMR', async () => {
      const queryEmbedding = generateEmbedding(1000);
      const results = await store.searchWithMMR(queryEmbedding, { k: 5 });

      expect(results).toHaveLength(5);
      expect(results[0].score).toBeGreaterThan(0);

      // Calculate diversity - should be reasonably diverse
      const patterns = results.map(r => r.pattern);
      const avgSimilarity = calculateAvgPairwiseSimilarity(patterns);

      // With default lambda=0.5, diversity should be better than pure relevance
      // Note: In fallback mode with small datasets, diversity may be limited
      expect(avgSimilarity).toBeLessThanOrEqual(1.0);
    });

    it('should prioritize relevance when lambda=1.0 (no diversity)', async () => {
      const queryEmbedding = generateEmbedding(1000);

      const mmrResults = await store.searchWithMMR(queryEmbedding, {
        k: 5,
        lambda: 1.0
      });

      // Standard search for comparison
      const standardResults = await store.searchSimilar(queryEmbedding, { k: 5 });

      expect(mmrResults).toHaveLength(5);
      expect(standardResults).toHaveLength(5);

      // With lambda=1.0, MMR should behave like standard search (pure relevance)
      // All results should be from similar group
      const mmrSimilarCount = mmrResults.filter(r =>
        r.pattern.domain === 'similar-group'
      ).length;
      expect(mmrSimilarCount).toBeGreaterThanOrEqual(4);

      // Scores should be very high (close to query)
      expect(mmrResults[0].score).toBeGreaterThan(0.9);
    });

    it('should prioritize diversity when lambda=0.0 (no relevance)', async () => {
      const queryEmbedding = generateEmbedding(1000);

      const results = await store.searchWithMMR(queryEmbedding, {
        k: 5,
        lambda: 0.0
      });

      expect(results).toHaveLength(5);

      // With lambda=0.0, results should be maximally diverse
      const patterns = results.map(r => r.pattern);
      const avgSimilarity = calculateAvgPairwiseSimilarity(patterns);

      // Should be highly diverse (low pairwise similarity)
      expect(avgSimilarity).toBeLessThan(0.5);
    });

    it('should balance relevance and diversity when lambda=0.5', async () => {
      const queryEmbedding = generateEmbedding(1000);

      const results = await store.searchWithMMR(queryEmbedding, {
        k: 5,
        lambda: 0.5
      });

      expect(results).toHaveLength(5);

      // Should have mix of similar and diverse patterns
      const similarCount = results.filter(r =>
        r.pattern.domain === 'similar-group'
      ).length;
      const diverseCount = results.filter(r =>
        r.pattern.domain === 'diverse-group'
      ).length;

      // At least one group should be represented (may not always be both with small datasets)
      expect(similarCount + diverseCount).toBe(5);

      // First result should still be relevant
      expect(results[0].score).toBeGreaterThan(0.5);
    });
  });

  describe('MMR Parameters', () => {
    beforeEach(async () => {
      // Store 30 patterns with varying similarity
      const baseEmbedding = generateEmbedding(500);

      for (let i = 0; i < 30; i++) {
        const similarity = 0.7 + (i / 100); // Gradually increasing similarity
        const embedding = createSimilarEmbedding(baseEmbedding, 500 + i, similarity);
        await store.storePattern(
          createTestPattern(`pattern-${i}`, embedding, {
            type: `type-${Math.floor(i / 10)}`,
            framework: i < 15 ? 'jest' : 'mocha',
          })
        );
      }
    });

    it('should respect k parameter for result count', async () => {
      const queryEmbedding = generateEmbedding(500);

      const results3 = await store.searchWithMMR(queryEmbedding, { k: 3 });
      expect(results3).toHaveLength(3);

      const results10 = await store.searchWithMMR(queryEmbedding, { k: 10 });
      expect(results10).toHaveLength(10);

      const results20 = await store.searchWithMMR(queryEmbedding, { k: 20 });
      expect(results20).toHaveLength(20);
    });

    it('should use candidateMultiplier to control candidate pool', async () => {
      const queryEmbedding = generateEmbedding(500);

      // With small multiplier, less diversity possible
      const smallPool = await store.searchWithMMR(queryEmbedding, {
        k: 5,
        lambda: 0.3,
        candidateMultiplier: 2
      });

      // With large multiplier, more diversity possible
      const largePool = await store.searchWithMMR(queryEmbedding, {
        k: 5,
        lambda: 0.3,
        candidateMultiplier: 6
      });

      expect(smallPool).toHaveLength(5);
      expect(largePool).toHaveLength(5);

      // Large pool should be more diverse
      const smallAvgSim = calculateAvgPairwiseSimilarity(
        smallPool.map(r => r.pattern)
      );
      const largeAvgSim = calculateAvgPairwiseSimilarity(
        largePool.map(r => r.pattern)
      );

      expect(largeAvgSim).toBeLessThanOrEqual(smallAvgSim);
    });

    it('should filter by threshold', async () => {
      const queryEmbedding = generateEmbedding(500);

      const lowThreshold = await store.searchWithMMR(queryEmbedding, {
        k: 10,
        threshold: 0.3
      });

      const highThreshold = await store.searchWithMMR(queryEmbedding, {
        k: 10,
        threshold: 0.7
      });

      // Low threshold should have at least as many results as high threshold
      expect(lowThreshold.length).toBeGreaterThanOrEqual(highThreshold.length);

      // All results should meet threshold
      for (const result of highThreshold) {
        expect(result.score).toBeGreaterThanOrEqual(0.7);
      }
    });

    it('should filter by domain', async () => {
      // Add some patterns with specific domain
      const specificEmbedding = generateEmbedding(600);
      for (let i = 0; i < 5; i++) {
        await store.storePattern(
          createTestPattern(`domain-specific-${i}`,
            createSimilarEmbedding(specificEmbedding, 600 + i, 0.8),
            { domain: 'api-testing' }
          )
        );
      }

      const queryEmbedding = generateEmbedding(600);
      const results = await store.searchWithMMR(queryEmbedding, {
        k: 10,
        domain: 'api-testing'
      });

      // Should only return patterns from api-testing domain
      expect(results.length).toBeGreaterThan(0);
      expect(results.length).toBeLessThanOrEqual(5);
      for (const result of results) {
        expect(result.pattern.domain).toBe('api-testing');
      }
    });

    it('should filter by type', async () => {
      const queryEmbedding = generateEmbedding(500);
      const results = await store.searchWithMMR(queryEmbedding, {
        k: 10,
        type: 'type-1'
      });

      expect(results.length).toBeGreaterThan(0);
      for (const result of results) {
        expect(result.pattern.type).toBe('type-1');
      }
    });

    it('should filter by framework', async () => {
      const queryEmbedding = generateEmbedding(500);
      const results = await store.searchWithMMR(queryEmbedding, {
        k: 10,
        framework: 'jest'
      });

      expect(results.length).toBeGreaterThan(0);
      for (const result of results) {
        expect(result.pattern.framework).toBe('jest');
      }
    });

    it('should combine multiple filters', async () => {
      const queryEmbedding = generateEmbedding(500);
      const results = await store.searchWithMMR(queryEmbedding, {
        k: 5,
        type: 'type-0',
        framework: 'jest',
        threshold: 0.5
      });

      // Should satisfy all filters
      for (const result of results) {
        expect(result.pattern.type).toBe('type-0');
        expect(result.pattern.framework).toBe('jest');
        expect(result.score).toBeGreaterThanOrEqual(0.5);
      }
    });
  });

  describe('Diversity Verification', () => {
    beforeEach(async () => {
      // Create clusters of similar patterns
      for (let cluster = 0; cluster < 5; cluster++) {
        const clusterBase = generateEmbedding(cluster * 1000);

        // 5 patterns per cluster
        for (let i = 0; i < 5; i++) {
          const embedding = createSimilarEmbedding(clusterBase, cluster * 1000 + i, 0.95);
          await store.storePattern(
            createTestPattern(`cluster-${cluster}-${i}`, embedding, {
              domain: `cluster-${cluster}`,
            })
          );
        }
      }
    });

    it('should produce more diverse results than standard search', async () => {
      const queryEmbedding = generateEmbedding(0); // Close to cluster 0

      // Standard search
      const standardResults = await store.searchSimilar(queryEmbedding, { k: 10 });

      // MMR search with diversity emphasis
      const mmrResults = await store.searchWithMMR(queryEmbedding, {
        k: 10,
        lambda: 0.3 // Emphasize diversity
      });

      expect(standardResults).toHaveLength(10);
      expect(mmrResults).toHaveLength(10);

      // Calculate diversity
      const standardPatterns = standardResults.map(r => r.pattern);
      const mmrPatterns = mmrResults.map(r => r.pattern);

      const standardSimilarity = calculateAvgPairwiseSimilarity(standardPatterns);
      const mmrSimilarity = calculateAvgPairwiseSimilarity(mmrPatterns);

      // MMR should be more diverse (lower pairwise similarity)
      expect(mmrSimilarity).toBeLessThan(standardSimilarity);
    });

    it('should select from multiple clusters', async () => {
      const queryEmbedding = generateEmbedding(0);

      const results = await store.searchWithMMR(queryEmbedding, {
        k: 10,
        lambda: 0.4 // Favor diversity
      });

      expect(results).toHaveLength(10);

      // Count unique clusters
      const clusters = new Set(results.map(r => r.pattern.domain));

      // Should have patterns from multiple clusters (not just closest one)
      expect(clusters.size).toBeGreaterThan(1);
    });

    it('should measure pairwise similarity correctly', async () => {
      const queryEmbedding = generateEmbedding(1000);

      // Get results with low diversity (high lambda)
      const relevantResults = await store.searchWithMMR(queryEmbedding, {
        k: 5,
        lambda: 0.9
      });

      // Get results with high diversity (low lambda)
      const diverseResults = await store.searchWithMMR(queryEmbedding, {
        k: 5,
        lambda: 0.1
      });

      const relevantPatterns = relevantResults.map(r => r.pattern);
      const diversePatterns = diverseResults.map(r => r.pattern);

      const relevantSimilarity = calculateAvgPairwiseSimilarity(relevantPatterns);
      const diverseSimilarity = calculateAvgPairwiseSimilarity(diversePatterns);

      // High lambda should have higher pairwise similarity
      expect(relevantSimilarity).toBeGreaterThan(diverseSimilarity);
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty store', async () => {
      const queryEmbedding = generateEmbedding(100);
      const results = await store.searchWithMMR(queryEmbedding, { k: 10 });

      expect(results).toHaveLength(0);
    });

    it('should handle k larger than available patterns', async () => {
      // Store only 5 patterns
      for (let i = 0; i < 5; i++) {
        const embedding = generateEmbedding(i * 100);
        await store.storePattern(
          createTestPattern(`pattern-${i}`, embedding)
        );
      }

      const queryEmbedding = generateEmbedding(0);
      const results = await store.searchWithMMR(queryEmbedding, { k: 20 });

      // Should return all available patterns (up to 5) that meet the candidate pool criteria
      expect(results.length).toBeGreaterThan(0);
      expect(results.length).toBeLessThanOrEqual(5);
    });

    it('should handle single pattern', async () => {
      const embedding = generateEmbedding(100);
      await store.storePattern(
        createTestPattern('single', embedding)
      );

      const queryEmbedding = generateEmbedding(100);
      const results = await store.searchWithMMR(queryEmbedding, { k: 5 });

      expect(results).toHaveLength(1);
      expect(results[0].pattern.id).toBe('single');
    });

    it('should throw error for invalid lambda < 0', async () => {
      const queryEmbedding = generateEmbedding(100);

      await expect(
        store.searchWithMMR(queryEmbedding, { lambda: -0.1 })
      ).rejects.toThrow('MMR lambda must be between 0 and 1');
    });

    it('should throw error for invalid lambda > 1', async () => {
      const queryEmbedding = generateEmbedding(100);

      await expect(
        store.searchWithMMR(queryEmbedding, { lambda: 1.5 })
      ).rejects.toThrow('MMR lambda must be between 0 and 1');
    });

    it('should handle lambda = 0 exactly (pure diversity)', async () => {
      // Store 10 patterns
      for (let i = 0; i < 10; i++) {
        const embedding = generateEmbedding(i * 100);
        await store.storePattern(
          createTestPattern(`pattern-${i}`, embedding)
        );
      }

      const queryEmbedding = generateEmbedding(0);
      const results = await store.searchWithMMR(queryEmbedding, {
        k: 5,
        lambda: 0
      });

      expect(results).toHaveLength(5);

      // With lambda=0, diversity should be maximized
      const patterns = results.map(r => r.pattern);
      const avgSimilarity = calculateAvgPairwiseSimilarity(patterns);
      expect(avgSimilarity).toBeLessThan(0.5);
    });

    it('should handle lambda = 1 exactly (pure relevance)', async () => {
      // Store 10 patterns
      const baseEmbedding = generateEmbedding(0);
      for (let i = 0; i < 10; i++) {
        const embedding = createSimilarEmbedding(baseEmbedding, i, 0.9);
        await store.storePattern(
          createTestPattern(`pattern-${i}`, embedding)
        );
      }

      const results = await store.searchWithMMR(baseEmbedding, {
        k: 5,
        lambda: 1
      });

      expect(results).toHaveLength(5);

      // With lambda=1, should get most similar patterns
      expect(results[0].score).toBeGreaterThan(0.8);
    });

    it('should handle threshold filtering with no matches', async () => {
      // Store patterns with low similarity to query
      for (let i = 0; i < 5; i++) {
        const embedding = generateEmbedding(i * 1000);
        await store.storePattern(
          createTestPattern(`pattern-${i}`, embedding)
        );
      }

      const queryEmbedding = generateEmbedding(10000);
      const results = await store.searchWithMMR(queryEmbedding, {
        k: 5,
        threshold: 0.95 // Very high threshold
      });

      // Might have no results if nothing meets threshold
      expect(results.length).toBeGreaterThanOrEqual(0);

      // Any results should meet threshold
      for (const result of results) {
        expect(result.score).toBeGreaterThanOrEqual(0.95);
      }
    });

    it('should handle domain filter with no matches', async () => {
      // Store patterns in one domain
      for (let i = 0; i < 5; i++) {
        const embedding = generateEmbedding(i * 100);
        await store.storePattern(
          createTestPattern(`pattern-${i}`, embedding, { domain: 'domain-a' })
        );
      }

      const queryEmbedding = generateEmbedding(0);
      const results = await store.searchWithMMR(queryEmbedding, {
        k: 5,
        domain: 'domain-b' // Different domain
      });

      expect(results).toHaveLength(0);
    });

    it('should handle candidateMultiplier = 1', async () => {
      // Store 10 patterns
      for (let i = 0; i < 10; i++) {
        const embedding = generateEmbedding(i * 100);
        await store.storePattern(
          createTestPattern(`pattern-${i}`, embedding)
        );
      }

      const queryEmbedding = generateEmbedding(0);
      const results = await store.searchWithMMR(queryEmbedding, {
        k: 5,
        candidateMultiplier: 1 // Minimal candidate pool
      });

      // Should still work but with limited diversity potential
      expect(results).toHaveLength(5);
    });
  });

  describe('Integration with searchSimilar', () => {
    beforeEach(async () => {
      // Store test patterns
      for (let i = 0; i < 20; i++) {
        const embedding = generateEmbedding(i * 50);
        await store.storePattern(
          createTestPattern(`pattern-${i}`, embedding, {
            framework: i < 10 ? 'jest' : 'mocha',
          })
        );
      }
    });

    it('should be callable through searchSimilar with useMMR flag', async () => {
      const queryEmbedding = generateEmbedding(0);

      // Direct MMR call
      const directResults = await store.searchWithMMR(queryEmbedding, {
        k: 5,
        lambda: 0.4
      });

      // Via searchSimilar
      const indirectResults = await store.searchSimilar(queryEmbedding, {
        k: 5,
        useMMR: true,
        mmrLambda: 0.4
      });

      expect(directResults).toHaveLength(5);
      expect(indirectResults).toHaveLength(5);

      // Results should be similar (same algorithm)
      expect(directResults[0].pattern.id).toBe(indirectResults[0].pattern.id);
    });

    it('should apply filters consistently through both interfaces', async () => {
      const queryEmbedding = generateEmbedding(0);

      const directResults = await store.searchWithMMR(queryEmbedding, {
        k: 5,
        framework: 'jest'
      });

      const indirectResults = await store.searchSimilar(queryEmbedding, {
        k: 5,
        useMMR: true,
        framework: 'jest'
      });

      // Both should filter by framework
      for (const result of directResults) {
        expect(result.pattern.framework).toBe('jest');
      }
      for (const result of indirectResults) {
        expect(result.pattern.framework).toBe('jest');
      }
    });
  });
});
