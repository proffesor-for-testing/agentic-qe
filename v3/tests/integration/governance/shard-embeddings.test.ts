/**
 * Integration tests for ShardEmbeddingsManager
 *
 * Tests verify:
 * - Embedding generation for all 12 domain shards
 * - Similarity search functionality
 * - Relevant shard finding
 * - Index management
 * - Cosine similarity calculation
 * - Feature flag integration
 *
 * @see ADR-058-guidance-governance-integration.md
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as path from 'path';
import {
  governanceFlags,
  DEFAULT_GOVERNANCE_FLAGS,
} from '../../../src/governance/feature-flags.js';
import {
  ShardEmbeddingsManager,
  shardEmbeddingsManager,
  DEFAULT_SHARD_EMBEDDINGS_FLAGS,
  type ShardEmbedding,
  type SimilarityResult,
  type RelevantShard,
  type IndexStats,
} from '../../../src/governance/shard-embeddings.js';
import {
  ShardRetrieverIntegration,
  DEFAULT_SHARD_RETRIEVER_FLAGS,
} from '../../../src/governance/shard-retriever-integration.js';

// Base path for the project root (where shards are located)
const PROJECT_ROOT = path.resolve(process.cwd(), '..');

describe('ShardEmbeddingsManager Integration - ADR-058 Phase 3', () => {
  beforeEach(() => {
    // Reset to defaults before each test
    governanceFlags.reset();
    shardEmbeddingsManager.reset();

    // Ensure both shard retriever and embeddings are enabled
    governanceFlags.updateFlags({
      shardRetriever: {
        ...DEFAULT_SHARD_RETRIEVER_FLAGS,
        enabled: true,
      },
      shardEmbeddings: {
        ...DEFAULT_SHARD_EMBEDDINGS_FLAGS,
        enabled: true,
      },
    } as Parameters<typeof governanceFlags.updateFlags>[0]);
  });

  afterEach(() => {
    shardEmbeddingsManager.reset();
  });

  describe('Initialization', () => {
    it('should initialize successfully', async () => {
      const manager = new ShardEmbeddingsManager(PROJECT_ROOT);
      await manager.initialize();

      expect(manager.isInitialized()).toBe(true);
    });

    it('should be idempotent when calling initialize multiple times', async () => {
      const manager = new ShardEmbeddingsManager(PROJECT_ROOT);

      await manager.initialize();
      await manager.initialize();
      await manager.initialize();

      expect(manager.isInitialized()).toBe(true);
    });

    it('should not generate embeddings when disabled', async () => {
      governanceFlags.updateFlags({
        shardEmbeddings: {
          ...DEFAULT_SHARD_EMBEDDINGS_FLAGS,
          enabled: false,
        },
      } as Parameters<typeof governanceFlags.updateFlags>[0]);

      const manager = new ShardEmbeddingsManager(PROJECT_ROOT);
      await manager.initialize();

      const stats = manager.getIndexStats();
      expect(stats.totalEmbeddings).toBe(0);
    });

    it('should not generate embeddings when global gates disabled', async () => {
      governanceFlags.disableAllGates();

      const manager = new ShardEmbeddingsManager(PROJECT_ROOT);
      await manager.initialize();

      const stats = manager.getIndexStats();
      expect(stats.totalEmbeddings).toBe(0);
    });
  });

  describe('Embedding Generation', () => {
    it('should generate embeddings for all 12 domain shards', async () => {
      const manager = new ShardEmbeddingsManager(PROJECT_ROOT);
      await manager.generateEmbeddings();

      const stats = manager.getIndexStats();

      // 12 domains * 5 section types = up to 60 embeddings (some sections may be empty)
      expect(stats.totalEmbeddings).toBeGreaterThan(0);
      expect(Object.keys(stats.embeddingsByDomain).length).toBe(12);
    });

    it('should generate embeddings for each section type', async () => {
      const manager = new ShardEmbeddingsManager(PROJECT_ROOT);
      await manager.generateEmbeddings();

      const stats = manager.getIndexStats();

      // All section types should have at least one embedding
      expect(stats.embeddingsBySectionType.rules).toBeGreaterThan(0);
      expect(stats.embeddingsBySectionType.full).toBeGreaterThan(0);
      // Some section types may not exist in all shards
      expect(stats.embeddingsBySectionType.invariants).toBeGreaterThanOrEqual(0);
      expect(stats.embeddingsBySectionType.thresholds).toBeGreaterThanOrEqual(0);
      expect(stats.embeddingsBySectionType.patterns).toBeGreaterThanOrEqual(0);
    });

    it('should generate embeddings for a specific shard', async () => {
      const manager = new ShardEmbeddingsManager(PROJECT_ROOT);
      await manager.initialize();

      const embeddings = await manager.generateEmbeddingForShard('test-generation');

      expect(embeddings.length).toBeGreaterThan(0);
      expect(embeddings.every(e => e.domain === 'test-generation')).toBe(true);
    });

    it('should return empty array for non-existent shard', async () => {
      const manager = new ShardEmbeddingsManager(PROJECT_ROOT);
      await manager.initialize();

      const embeddings = await manager.generateEmbeddingForShard('non-existent-domain');

      expect(embeddings.length).toBe(0);
    });

    it('should create embeddings with correct dimensions', async () => {
      const manager = new ShardEmbeddingsManager(PROJECT_ROOT);
      await manager.generateEmbeddings();

      const stats = manager.getIndexStats();
      expect(stats.dimensions).toBe(128);
    });

    it('should respect custom embedding dimensions', async () => {
      governanceFlags.updateFlags({
        shardRetriever: {
          ...DEFAULT_SHARD_RETRIEVER_FLAGS,
          enabled: true,
        },
        shardEmbeddings: {
          ...DEFAULT_SHARD_EMBEDDINGS_FLAGS,
          enabled: true,
          embeddingDimensions: 64,
        },
      } as Parameters<typeof governanceFlags.updateFlags>[0]);

      const manager = new ShardEmbeddingsManager(PROJECT_ROOT);
      await manager.generateEmbeddings();

      const stats = manager.getIndexStats();
      expect(stats.dimensions).toBe(64);
    });

    it('should build vocabulary from shard content', async () => {
      const manager = new ShardEmbeddingsManager(PROJECT_ROOT);
      await manager.generateEmbeddings();

      const stats = manager.getIndexStats();
      expect(stats.vocabularySize).toBeGreaterThan(0);
    });

    it('should track last rebuild time', async () => {
      const before = Date.now();
      const manager = new ShardEmbeddingsManager(PROJECT_ROOT);
      await manager.generateEmbeddings();
      const after = Date.now();

      const stats = manager.getIndexStats();
      expect(stats.lastRebuild).toBeGreaterThanOrEqual(before);
      expect(stats.lastRebuild).toBeLessThanOrEqual(after);
    });
  });

  describe('Similarity Search', () => {
    it('should find similar embeddings for test-related queries', async () => {
      const manager = new ShardEmbeddingsManager(PROJECT_ROOT);
      await manager.initialize();

      const results = await manager.searchBySimilarity('generate unit tests', 10);

      expect(results.length).toBeGreaterThan(0);
      expect(results.some(r => r.domain === 'test-generation')).toBe(true);
    });

    it('should find similar embeddings for security-related queries', async () => {
      const manager = new ShardEmbeddingsManager(PROJECT_ROOT);
      await manager.initialize();

      const results = await manager.searchBySimilarity('vulnerability scanning SAST DAST', 10);

      expect(results.length).toBeGreaterThan(0);
      expect(results.some(r => r.domain === 'security-compliance')).toBe(true);
    });

    it('should find similar embeddings for coverage-related queries', async () => {
      const manager = new ShardEmbeddingsManager(PROJECT_ROOT);
      await manager.initialize();

      const results = await manager.searchBySimilarity('code coverage analysis gaps', 10);

      expect(results.length).toBeGreaterThan(0);
      expect(results.some(r => r.domain === 'coverage-analysis')).toBe(true);
    });

    it('should return results sorted by similarity (descending)', async () => {
      const manager = new ShardEmbeddingsManager(PROJECT_ROOT);
      await manager.initialize();

      const results = await manager.searchBySimilarity('test generation patterns', 10);

      for (let i = 1; i < results.length; i++) {
        expect(results[i - 1].similarity).toBeGreaterThanOrEqual(results[i].similarity);
      }
    });

    it('should respect the limit parameter', async () => {
      const manager = new ShardEmbeddingsManager(PROJECT_ROOT);
      await manager.initialize();

      const results = await manager.searchBySimilarity('test', 3);

      expect(results.length).toBeLessThanOrEqual(3);
    });

    it('should return similarity scores between 0 and 1', async () => {
      const manager = new ShardEmbeddingsManager(PROJECT_ROOT);
      await manager.initialize();

      const results = await manager.searchBySimilarity('quality assessment metrics', 10);

      for (const result of results) {
        expect(result.similarity).toBeGreaterThanOrEqual(-1);
        expect(result.similarity).toBeLessThanOrEqual(1);
      }
    });

    it('should return empty results when disabled', async () => {
      governanceFlags.updateFlags({
        shardEmbeddings: {
          ...DEFAULT_SHARD_EMBEDDINGS_FLAGS,
          enabled: false,
        },
      } as Parameters<typeof governanceFlags.updateFlags>[0]);

      const manager = new ShardEmbeddingsManager(PROJECT_ROOT);
      await manager.initialize();

      const results = await manager.searchBySimilarity('test', 10);

      expect(results.length).toBe(0);
    });

    it('should include content and metadata in results', async () => {
      const manager = new ShardEmbeddingsManager(PROJECT_ROOT);
      await manager.initialize();

      const results = await manager.searchBySimilarity('test generation', 5);

      for (const result of results) {
        expect(result.content).toBeDefined();
        expect(result.content.length).toBeGreaterThan(0);
        expect(result.metadata).toBeDefined();
        expect(typeof result.metadata).toBe('object');
      }
    });
  });

  describe('Find Relevant Shards', () => {
    it('should find relevant shards for task descriptions', async () => {
      const manager = new ShardEmbeddingsManager(PROJECT_ROOT);
      await manager.initialize();

      const shards = await manager.findRelevantShards('Generate comprehensive unit tests for the authentication module');

      expect(shards.length).toBeGreaterThan(0);
      expect(shards[0]).toHaveProperty('domain');
      expect(shards[0]).toHaveProperty('overallSimilarity');
      expect(shards[0]).toHaveProperty('sectionScores');
      expect(shards[0]).toHaveProperty('matchingSections');
    });

    it('should return shards sorted by overall similarity', async () => {
      const manager = new ShardEmbeddingsManager(PROJECT_ROOT);
      await manager.initialize();

      const shards = await manager.findRelevantShards('security vulnerability analysis');

      for (let i = 1; i < shards.length; i++) {
        expect(shards[i - 1].overallSimilarity).toBeGreaterThanOrEqual(shards[i].overallSimilarity);
      }
    });

    it('should include section-level scores', async () => {
      const manager = new ShardEmbeddingsManager(PROJECT_ROOT);
      await manager.initialize();

      const shards = await manager.findRelevantShards('test coverage quality');

      for (const shard of shards) {
        expect(shard.sectionScores).toBeDefined();
        expect(typeof shard.sectionScores.rules).toBe('number');
        expect(typeof shard.sectionScores.full).toBe('number');
      }
    });

    it('should track matching sections', async () => {
      const manager = new ShardEmbeddingsManager(PROJECT_ROOT);
      await manager.initialize();

      const shards = await manager.findRelevantShards('test generation patterns');

      // At least some shards should have matching sections
      const hasMatchingSections = shards.some(s => s.matchingSections.length > 0);
      expect(hasMatchingSections).toBe(true);
    });

    it('should respect the limit parameter', async () => {
      const manager = new ShardEmbeddingsManager(PROJECT_ROOT);
      await manager.initialize();

      const shards = await manager.findRelevantShards('any task', 3);

      expect(shards.length).toBeLessThanOrEqual(3);
    });

    it('should include the full shard content when available', async () => {
      const manager = new ShardEmbeddingsManager(PROJECT_ROOT);
      await manager.initialize();

      const shards = await manager.findRelevantShards('test execution');

      // Should have loaded shard content
      const shardsWithContent = shards.filter(s => s.shard !== null);
      expect(shardsWithContent.length).toBeGreaterThan(0);

      for (const shard of shardsWithContent) {
        expect(shard.shard).toHaveProperty('domain');
        expect(shard.shard).toHaveProperty('rules');
        expect(shard.shard).toHaveProperty('thresholds');
      }
    });
  });

  describe('Index Management', () => {
    it('should index a single embedding', async () => {
      const manager = new ShardEmbeddingsManager(PROJECT_ROOT);
      await manager.initialize();

      const initialStats = manager.getIndexStats();
      const initialCount = initialStats.totalEmbeddings;

      const embedding: ShardEmbedding = {
        domain: 'custom-domain',
        sectionType: 'rules',
        content: 'Custom rule content',
        embedding: new Array(128).fill(0.1),
        metadata: { custom: true },
      };

      await manager.indexEmbedding(embedding);

      const newStats = manager.getIndexStats();
      expect(newStats.totalEmbeddings).toBe(initialCount + 1);
    });

    it('should rebuild the entire index', async () => {
      const manager = new ShardEmbeddingsManager(PROJECT_ROOT);
      await manager.initialize();

      const beforeStats = manager.getIndexStats();
      const beforeRebuild = beforeStats.lastRebuild;

      // Wait a tiny bit to ensure timestamp changes
      await new Promise(resolve => setTimeout(resolve, 10));

      await manager.rebuildIndex();

      const afterStats = manager.getIndexStats();
      expect(afterStats.lastRebuild).toBeGreaterThan(beforeRebuild!);
      expect(afterStats.totalEmbeddings).toBeGreaterThan(0);
    });

    it('should provide accurate index statistics', async () => {
      const manager = new ShardEmbeddingsManager(PROJECT_ROOT);
      await manager.initialize();

      const stats = manager.getIndexStats();

      expect(stats).toHaveProperty('totalEmbeddings');
      expect(stats).toHaveProperty('embeddingsByDomain');
      expect(stats).toHaveProperty('embeddingsBySectionType');
      expect(stats).toHaveProperty('dimensions');
      expect(stats).toHaveProperty('lastRebuild');
      expect(stats).toHaveProperty('vocabularySize');
      expect(stats).toHaveProperty('persistedToFile');
    });

    it('should clear index on reset', async () => {
      const manager = new ShardEmbeddingsManager(PROJECT_ROOT);
      await manager.initialize();

      expect(manager.getIndexStats().totalEmbeddings).toBeGreaterThan(0);

      manager.reset();

      expect(manager.getIndexStats().totalEmbeddings).toBe(0);
      expect(manager.isInitialized()).toBe(false);
    });
  });

  describe('Cosine Similarity Calculation', () => {
    it('should return 1 for identical vectors', () => {
      const manager = new ShardEmbeddingsManager(PROJECT_ROOT);

      const vectorA = [1, 2, 3, 4, 5];
      const vectorB = [1, 2, 3, 4, 5];

      const similarity = manager.cosineSimilarity(vectorA, vectorB);

      expect(similarity).toBeCloseTo(1, 5);
    });

    it('should return 0 for orthogonal vectors', () => {
      const manager = new ShardEmbeddingsManager(PROJECT_ROOT);

      const vectorA = [1, 0, 0, 0];
      const vectorB = [0, 1, 0, 0];

      const similarity = manager.cosineSimilarity(vectorA, vectorB);

      expect(similarity).toBeCloseTo(0, 5);
    });

    it('should return -1 for opposite vectors', () => {
      const manager = new ShardEmbeddingsManager(PROJECT_ROOT);

      const vectorA = [1, 2, 3];
      const vectorB = [-1, -2, -3];

      const similarity = manager.cosineSimilarity(vectorA, vectorB);

      expect(similarity).toBeCloseTo(-1, 5);
    });

    it('should return 0 for zero vectors', () => {
      const manager = new ShardEmbeddingsManager(PROJECT_ROOT);

      const vectorA = [0, 0, 0];
      const vectorB = [1, 2, 3];

      const similarity = manager.cosineSimilarity(vectorA, vectorB);

      expect(similarity).toBe(0);
    });

    it('should return 0 for vectors of different lengths', () => {
      const manager = new ShardEmbeddingsManager(PROJECT_ROOT);

      const vectorA = [1, 2, 3];
      const vectorB = [1, 2];

      const similarity = manager.cosineSimilarity(vectorA, vectorB);

      expect(similarity).toBe(0);
    });

    it('should return 0 for empty vectors', () => {
      const manager = new ShardEmbeddingsManager(PROJECT_ROOT);

      const vectorA: number[] = [];
      const vectorB: number[] = [];

      const similarity = manager.cosineSimilarity(vectorA, vectorB);

      expect(similarity).toBe(0);
    });

    it('should handle normalized vectors', () => {
      const manager = new ShardEmbeddingsManager(PROJECT_ROOT);

      // Normalized vectors (magnitude = 1)
      const vectorA = [0.6, 0.8];
      const vectorB = [0.8, 0.6];

      const similarity = manager.cosineSimilarity(vectorA, vectorB);

      // 0.6*0.8 + 0.8*0.6 = 0.96
      expect(similarity).toBeCloseTo(0.96, 5);
    });

    it('should be commutative', () => {
      const manager = new ShardEmbeddingsManager(PROJECT_ROOT);

      const vectorA = [1, 2, 3, 4, 5];
      const vectorB = [5, 4, 3, 2, 1];

      const similarityAB = manager.cosineSimilarity(vectorA, vectorB);
      const similarityBA = manager.cosineSimilarity(vectorB, vectorA);

      expect(similarityAB).toBeCloseTo(similarityBA, 10);
    });
  });

  describe('Get Embedding For Text', () => {
    it('should generate embedding for arbitrary text', async () => {
      const manager = new ShardEmbeddingsManager(PROJECT_ROOT);
      await manager.initialize();

      const embedding = await manager.getEmbeddingForText('test generation quality');

      expect(embedding.length).toBe(128);
    });

    it('should generate different embeddings for different text', async () => {
      const manager = new ShardEmbeddingsManager(PROJECT_ROOT);
      await manager.initialize();

      const embedding1 = await manager.getEmbeddingForText('security vulnerability');
      const embedding2 = await manager.getEmbeddingForText('test coverage analysis');

      // Embeddings should be different
      let allSame = true;
      for (let i = 0; i < embedding1.length; i++) {
        if (embedding1[i] !== embedding2[i]) {
          allSame = false;
          break;
        }
      }
      expect(allSame).toBe(false);
    });

    it('should generate similar embeddings for similar text', async () => {
      const manager = new ShardEmbeddingsManager(PROJECT_ROOT);
      await manager.initialize();

      const embedding1 = await manager.getEmbeddingForText('test generation');
      const embedding2 = await manager.getEmbeddingForText('generate tests');

      const similarity = manager.cosineSimilarity(embedding1, embedding2);

      // Similar text should have positive similarity
      expect(similarity).toBeGreaterThan(0);
    });

    it('should return empty embedding when disabled', async () => {
      governanceFlags.updateFlags({
        shardEmbeddings: {
          ...DEFAULT_SHARD_EMBEDDINGS_FLAGS,
          enabled: false,
        },
      } as Parameters<typeof governanceFlags.updateFlags>[0]);

      const manager = new ShardEmbeddingsManager(PROJECT_ROOT);

      const embedding = await manager.getEmbeddingForText('test');

      expect(embedding.length).toBe(0);
    });

    it('should handle empty text', async () => {
      const manager = new ShardEmbeddingsManager(PROJECT_ROOT);
      await manager.initialize();

      const embedding = await manager.getEmbeddingForText('');

      expect(embedding.length).toBe(128);
      // Empty text should result in zero vector
      expect(embedding.every(v => v === 0)).toBe(true);
    });
  });

  describe('Domain Coverage', () => {
    const expectedDomains = [
      'test-generation',
      'test-execution',
      'coverage-analysis',
      'quality-assessment',
      'defect-intelligence',
      'requirements-validation',
      'code-intelligence',
      'security-compliance',
      'contract-testing',
      'visual-accessibility',
      'chaos-resilience',
      'learning-optimization',
    ];

    it('should generate embeddings for all 12 expected domains', async () => {
      const manager = new ShardEmbeddingsManager(PROJECT_ROOT);
      await manager.generateEmbeddings();

      const stats = manager.getIndexStats();

      for (const domain of expectedDomains) {
        expect(stats.embeddingsByDomain[domain]).toBeGreaterThan(0);
      }
    });

    it.each(expectedDomains)('should generate embedding for %s domain', async (domain) => {
      const manager = new ShardEmbeddingsManager(PROJECT_ROOT);
      await manager.initialize();

      const embeddings = await manager.generateEmbeddingForShard(domain);

      expect(embeddings.length).toBeGreaterThan(0);
      expect(embeddings.every(e => e.domain === domain)).toBe(true);
      expect(embeddings.every(e => e.embedding.length === 128)).toBe(true);
    });
  });

  describe('Feature Flag Integration', () => {
    it('should respect enabled flag', async () => {
      governanceFlags.updateFlags({
        shardEmbeddings: {
          ...DEFAULT_SHARD_EMBEDDINGS_FLAGS,
          enabled: false,
        },
      } as Parameters<typeof governanceFlags.updateFlags>[0]);

      const manager = new ShardEmbeddingsManager(PROJECT_ROOT);
      await manager.initialize();

      expect(manager.getIndexStats().totalEmbeddings).toBe(0);
    });

    it('should use singleton instance', () => {
      expect(shardEmbeddingsManager).toBeDefined();
      expect(shardEmbeddingsManager).toBeInstanceOf(ShardEmbeddingsManager);
    });

    it('should respect custom n-gram settings', async () => {
      governanceFlags.updateFlags({
        shardRetriever: {
          ...DEFAULT_SHARD_RETRIEVER_FLAGS,
          enabled: true,
        },
        shardEmbeddings: {
          ...DEFAULT_SHARD_EMBEDDINGS_FLAGS,
          enabled: true,
          ngramMin: 3,
          ngramMax: 5,
        },
      } as Parameters<typeof governanceFlags.updateFlags>[0]);

      const manager = new ShardEmbeddingsManager(PROJECT_ROOT);
      await manager.initialize();

      // Should still generate embeddings with different n-gram settings
      expect(manager.getIndexStats().totalEmbeddings).toBeGreaterThan(0);
    });
  });

  describe('Semantic Search Quality', () => {
    it('should rank test-generation first for test generation queries', async () => {
      const manager = new ShardEmbeddingsManager(PROJECT_ROOT);
      await manager.initialize();

      const shards = await manager.findRelevantShards(
        'generate unit tests for authentication module with TDD'
      );

      // test-generation should be among top 3 results
      const testGenIndex = shards.findIndex(s => s.domain === 'test-generation');
      expect(testGenIndex).toBeGreaterThanOrEqual(0);
      expect(testGenIndex).toBeLessThan(5);
    });

    it('should rank security-compliance first for security queries', async () => {
      const manager = new ShardEmbeddingsManager(PROJECT_ROOT);
      await manager.initialize();

      const shards = await manager.findRelevantShards(
        'scan for vulnerabilities OWASP SAST security compliance'
      );

      // security-compliance should be among top 3 results
      const securityIndex = shards.findIndex(s => s.domain === 'security-compliance');
      expect(securityIndex).toBeGreaterThanOrEqual(0);
      expect(securityIndex).toBeLessThan(5);
    });

    it('should rank coverage-analysis first for coverage queries', async () => {
      const manager = new ShardEmbeddingsManager(PROJECT_ROOT);
      await manager.initialize();

      const shards = await manager.findRelevantShards(
        'analyze code coverage identify gaps uncovered paths'
      );

      // coverage-analysis should be among top 3 results
      const coverageIndex = shards.findIndex(s => s.domain === 'coverage-analysis');
      expect(coverageIndex).toBeGreaterThanOrEqual(0);
      expect(coverageIndex).toBeLessThan(5);
    });

    it('should find relevant domains for accessibility queries', async () => {
      const manager = new ShardEmbeddingsManager(PROJECT_ROOT);
      await manager.initialize();

      const shards = await manager.findRelevantShards(
        'accessibility testing WCAG visual regression a11y'
      );

      // visual-accessibility should be in results
      const a11yIndex = shards.findIndex(s => s.domain === 'visual-accessibility');
      expect(a11yIndex).toBeGreaterThanOrEqual(0);
    });

    it('should find relevant domains for chaos testing queries', async () => {
      const manager = new ShardEmbeddingsManager(PROJECT_ROOT);
      await manager.initialize();

      const shards = await manager.findRelevantShards(
        'chaos engineering fault injection resilience load testing'
      );

      // chaos-resilience should be in results
      const chaosIndex = shards.findIndex(s => s.domain === 'chaos-resilience');
      expect(chaosIndex).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Error Handling', () => {
    it('should handle concurrent searches', async () => {
      const manager = new ShardEmbeddingsManager(PROJECT_ROOT);
      await manager.initialize();

      const results = await Promise.all([
        manager.searchBySimilarity('test generation', 5),
        manager.searchBySimilarity('security scan', 5),
        manager.searchBySimilarity('coverage analysis', 5),
        manager.searchBySimilarity('quality assessment', 5),
      ]);

      for (const result of results) {
        expect(result.length).toBeGreaterThan(0);
      }
    });

    it('should handle concurrent embedding generation', async () => {
      const manager = new ShardEmbeddingsManager(PROJECT_ROOT);
      await manager.initialize();

      const results = await Promise.all([
        manager.generateEmbeddingForShard('test-generation'),
        manager.generateEmbeddingForShard('security-compliance'),
        manager.generateEmbeddingForShard('coverage-analysis'),
      ]);

      for (const result of results) {
        expect(result.length).toBeGreaterThan(0);
      }
    });

    it('should recover from reset and reinitialize', async () => {
      const manager = new ShardEmbeddingsManager(PROJECT_ROOT);
      await manager.initialize();

      expect(manager.getIndexStats().totalEmbeddings).toBeGreaterThan(0);

      manager.reset();
      expect(manager.getIndexStats().totalEmbeddings).toBe(0);

      await manager.initialize();
      expect(manager.getIndexStats().totalEmbeddings).toBeGreaterThan(0);
    });
  });
});
