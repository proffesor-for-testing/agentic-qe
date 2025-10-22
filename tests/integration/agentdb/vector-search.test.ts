/**
 * AgentDB Vector Search Integration Tests
 *
 * Tests vector search functionality to verify "150x faster" claims:
 * - Embedding generation (actual neural network inference)
 * - HNSW index creation and usage
 * - Similarity search accuracy
 * - Search performance benchmarks (<100µs target)
 * - Quantization effects on memory and accuracy
 *
 * These tests use REAL embeddings and measure REAL performance.
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import Database from 'better-sqlite3';
import { AgentDBManager, AgentDBConfig, MemoryPattern, RetrievalOptions } from '../../../src/core/memory/AgentDBManager';
import * as fs from 'fs';
import * as path from 'path';

describe('AgentDB Vector Search Integration', () => {
  let agentDBManager: AgentDBManager;
  let testDbPath: string;
  const TEST_DATA_DIR = path.join(__dirname, '../../fixtures/agentdb');

  beforeEach(async () => {
    testDbPath = path.join(TEST_DATA_DIR, `vector-test-${Date.now()}.db`);

    if (!fs.existsSync(TEST_DATA_DIR)) {
      fs.mkdirSync(TEST_DATA_DIR, { recursive: true });
    }

    const config: AgentDBConfig = {
      dbPath: testDbPath,
      enableQUICSync: false,
      syncPort: 4433,
      syncPeers: [],
      enableLearning: false,
      enableReasoning: true, // Enable for embedding generation
      cacheSize: 1000,
      quantizationType: 'none' // Test without quantization first
    };

    agentDBManager = new AgentDBManager(config);
    await agentDBManager.initialize();
  });

  afterEach(async () => {
    if (agentDBManager) {
      await agentDBManager.shutdown();
    }

    if (fs.existsSync(testDbPath)) {
      fs.unlinkSync(testDbPath);
    }
  });

  describe('Embedding Generation', () => {
    it('should generate embeddings for text input', async () => {
      const text = 'This is a test for embedding generation';

      const embedding = await agentDBManager.generateEmbedding(text);

      expect(embedding).toBeDefined();
      expect(Array.isArray(embedding)).toBe(true);
      expect(embedding.length).toBe(384); // MiniLM embedding dimension
      expect(embedding.every(v => typeof v === 'number')).toBe(true);
      expect(embedding.every(v => !isNaN(v))).toBe(true);
    });

    it('should generate different embeddings for different texts', async () => {
      const text1 = 'Unit testing is important';
      const text2 = 'Integration testing is crucial';

      const embedding1 = await agentDBManager.generateEmbedding(text1);
      const embedding2 = await agentDBManager.generateEmbedding(text2);

      expect(embedding1).not.toEqual(embedding2);

      // Calculate cosine similarity
      const similarity = cosineSimilarity(embedding1, embedding2);
      expect(similarity).toBeGreaterThan(0); // Related texts should have positive similarity
      expect(similarity).toBeLessThan(1); // But not identical
    });

    it('should generate similar embeddings for similar texts', async () => {
      const text1 = 'Testing authentication logic';
      const text2 = 'Testing auth logic';

      const embedding1 = await agentDBManager.generateEmbedding(text1);
      const embedding2 = await agentDBManager.generateEmbedding(text2);

      const similarity = cosineSimilarity(embedding1, embedding2);
      expect(similarity).toBeGreaterThan(0.8); // Very similar texts
    });

    it('should generate dissimilar embeddings for unrelated texts', async () => {
      const text1 = 'Testing authentication in React';
      const text2 = 'Machine learning model training';

      const embedding1 = await agentDBManager.generateEmbedding(text1);
      const embedding2 = await agentDBManager.generateEmbedding(text2);

      const similarity = cosineSimilarity(embedding1, embedding2);
      expect(similarity).toBeLessThan(0.5); // Unrelated texts
    });

    it('should handle empty text gracefully', async () => {
      await expect(agentDBManager.generateEmbedding('')).rejects.toThrow();
    });

    it('should handle long text (>512 tokens)', async () => {
      const longText = 'word '.repeat(1000); // Very long text

      const embedding = await agentDBManager.generateEmbedding(longText);

      expect(embedding).toBeDefined();
      expect(embedding.length).toBe(384);
    });

    it('should generate consistent embeddings for same text', async () => {
      const text = 'Consistent embedding test';

      const embedding1 = await agentDBManager.generateEmbedding(text);
      const embedding2 = await agentDBManager.generateEmbedding(text);

      expect(embedding1).toEqual(embedding2);
    });
  });

  describe('HNSW Index Creation', () => {
    beforeEach(async () => {
      // Store patterns with embeddings to trigger index creation
      const patterns: MemoryPattern[] = Array.from({ length: 100 }, (_, i) => ({
        id: `hnsw-pattern-${i}`,
        type: 'test-pattern',
        domain: 'testing',
        pattern_data: JSON.stringify({
          text: `Test pattern ${i} for HNSW indexing`,
          embedding: generateRandomEmbedding(),
          metadata: { index: i }
        }),
        confidence: 0.8 + Math.random() * 0.2,
        usage_count: 0,
        success_count: 0,
        created_at: Date.now(),
        last_used: Date.now()
      }));

      await agentDBManager.storeBatch(patterns);
    });

    it('should create HNSW index automatically', async () => {
      const indexInfo = await agentDBManager.getIndexInfo();

      expect(indexInfo).toBeDefined();
      expect(indexInfo.type).toBe('HNSW');
      expect(indexInfo.indexedVectors).toBe(100);
      expect(indexInfo.dimension).toBe(384);
    });

    it('should use HNSW index for fast retrieval', async () => {
      const queryText = 'Test pattern for searching';

      const startTime = performance.now();
      const result = await agentDBManager.retrievePatterns(queryText, { k: 10 });
      const searchTime = performance.now() - startTime;

      expect(result.memories.length).toBeGreaterThan(0);
      expect(searchTime).toBeLessThan(1); // <1ms with HNSW index
      expect(result.metadata.indexUsed).toBe('HNSW');
    });

    it('should support different distance metrics', async () => {
      const queryText = 'Test pattern search';

      // Cosine similarity
      const resultCosine = await agentDBManager.retrievePatterns(queryText, {
        k: 5,
        metric: 'cosine'
      });

      // Euclidean distance
      const resultEuclidean = await agentDBManager.retrievePatterns(queryText, {
        k: 5,
        metric: 'euclidean'
      });

      // Dot product
      const resultDot = await agentDBManager.retrievePatterns(queryText, {
        k: 5,
        metric: 'dot'
      });

      expect(resultCosine.memories.length).toBeGreaterThan(0);
      expect(resultEuclidean.memories.length).toBeGreaterThan(0);
      expect(resultDot.memories.length).toBeGreaterThan(0);

      // Results may differ based on metric
      expect(resultCosine.memories[0].id).toBeDefined();
      expect(resultEuclidean.memories[0].id).toBeDefined();
      expect(resultDot.memories[0].id).toBeDefined();
    });

    it('should rebuild index when patterns are added', async () => {
      const initialInfo = await agentDBManager.getIndexInfo();
      expect(initialInfo.indexedVectors).toBe(100);

      // Add more patterns
      const newPatterns: MemoryPattern[] = Array.from({ length: 50 }, (_, i) => ({
        id: `new-pattern-${i}`,
        type: 'test',
        domain: 'testing',
        pattern_data: JSON.stringify({
          text: `New pattern ${i}`,
          embedding: generateRandomEmbedding()
        }),
        confidence: 0.9,
        usage_count: 0,
        success_count: 0,
        created_at: Date.now(),
        last_used: Date.now()
      }));

      await agentDBManager.storeBatch(newPatterns);

      const updatedInfo = await agentDBManager.getIndexInfo();
      expect(updatedInfo.indexedVectors).toBe(150);
    });
  });

  describe('Similarity Search Accuracy', () => {
    beforeEach(async () => {
      // Store patterns with known embeddings
      const testPatterns = [
        {
          id: 'auth-test-1',
          text: 'Unit test for user authentication',
          domain: 'authentication',
          embedding: await agentDBManager.generateEmbedding('Unit test for user authentication')
        },
        {
          id: 'auth-test-2',
          text: 'Integration test for login flow',
          domain: 'authentication',
          embedding: await agentDBManager.generateEmbedding('Integration test for login flow')
        },
        {
          id: 'api-test-1',
          text: 'API endpoint testing',
          domain: 'api',
          embedding: await agentDBManager.generateEmbedding('API endpoint testing')
        },
        {
          id: 'db-test-1',
          text: 'Database query optimization',
          domain: 'database',
          embedding: await agentDBManager.generateEmbedding('Database query optimization')
        },
        {
          id: 'ui-test-1',
          text: 'User interface component testing',
          domain: 'ui',
          embedding: await agentDBManager.generateEmbedding('User interface component testing')
        }
      ];

      for (const pattern of testPatterns) {
        await agentDBManager.storePattern({
          id: pattern.id,
          type: 'test-pattern',
          domain: pattern.domain,
          pattern_data: JSON.stringify({
            text: pattern.text,
            embedding: pattern.embedding
          }),
          confidence: 0.9,
          usage_count: 0,
          success_count: 0,
          created_at: Date.now(),
          last_used: Date.now()
        });
      }
    });

    it('should retrieve most relevant patterns for authentication query', async () => {
      const result = await agentDBManager.retrievePatterns('testing user login', { k: 3 });

      expect(result.memories.length).toBeGreaterThan(0);

      // Top result should be from authentication domain
      const topResult = result.memories[0];
      const data = JSON.parse(topResult.pattern_data);
      expect(topResult.domain).toBe('authentication');
      expect(data.text).toMatch(/authentication|login/i);
    });

    it('should rank results by similarity score', async () => {
      const result = await agentDBManager.retrievePatterns('API testing', { k: 5 });

      expect(result.memories.length).toBeGreaterThan(0);

      // Similarity scores should be in descending order
      for (let i = 0; i < result.memories.length - 1; i++) {
        expect(result.memories[i].similarity).toBeGreaterThanOrEqual(
          result.memories[i + 1].similarity
        );
      }

      // Top result should be API-related
      const topResult = result.memories[0];
      const data = JSON.parse(topResult.pattern_data);
      expect(data.text).toMatch(/API/i);
    });

    it('should filter by domain and maintain accuracy', async () => {
      const result = await agentDBManager.retrievePatterns('testing', {
        k: 3,
        domain: 'authentication'
      });

      expect(result.memories.length).toBeGreaterThan(0);
      expect(result.memories.every(m => m.domain === 'authentication')).toBe(true);
    });

    it('should handle queries with no relevant results', async () => {
      const result = await agentDBManager.retrievePatterns('quantum physics equation', { k: 5 });

      // Should return results but with low similarity scores
      if (result.memories.length > 0) {
        expect(result.memories[0].similarity).toBeLessThan(0.5);
      }
    });
  });

  describe('Search Performance (<100µs target)', () => {
    beforeEach(async () => {
      // Create large dataset for performance testing
      const patterns: MemoryPattern[] = Array.from({ length: 1000 }, (_, i) => ({
        id: `perf-pattern-${i}`,
        type: 'test',
        domain: `domain-${i % 10}`,
        pattern_data: JSON.stringify({
          text: `Performance test pattern ${i} with additional text for realism`,
          embedding: generateRandomEmbedding(),
          metadata: { index: i, category: `cat-${i % 5}` }
        }),
        confidence: 0.8 + Math.random() * 0.2,
        usage_count: Math.floor(Math.random() * 100),
        success_count: 0,
        created_at: Date.now(),
        last_used: Date.now()
      }));

      await agentDBManager.storeBatch(patterns);

      // Wait for HNSW index to be built
      await agentDBManager.rebuildIndex();
    });

    it('should search 1000 patterns in <100µs (0.1ms)', async () => {
      const queryText = 'performance test pattern search';

      // Warm up
      await agentDBManager.retrievePatterns(queryText, { k: 10 });

      // Actual measurement
      const measurements: number[] = [];
      for (let i = 0; i < 100; i++) {
        const start = performance.now();
        await agentDBManager.retrievePatterns(queryText, { k: 10 });
        const duration = performance.now() - start;
        measurements.push(duration);
      }

      const avgTime = measurements.reduce((a, b) => a + b, 0) / measurements.length;
      const minTime = Math.min(...measurements);
      const maxTime = Math.max(...measurements);

      console.log(`Vector Search Performance (1000 vectors):`);
      console.log(`  Avg: ${avgTime.toFixed(3)}ms`);
      console.log(`  Min: ${minTime.toFixed(3)}ms`);
      console.log(`  Max: ${maxTime.toFixed(3)}ms`);

      expect(avgTime).toBeLessThan(0.1); // 100µs = 0.1ms
      expect(minTime).toBeLessThan(0.1);
    });

    it('should maintain performance with different k values', async () => {
      const queryText = 'performance test';

      const k1Time = await measureSearchTime(agentDBManager, queryText, 1);
      const k10Time = await measureSearchTime(agentDBManager, queryText, 10);
      const k100Time = await measureSearchTime(agentDBManager, queryText, 100);

      console.log(`Search time by k:
        k=1:   ${k1Time.toFixed(3)}ms
        k=10:  ${k10Time.toFixed(3)}ms
        k=100: ${k100Time.toFixed(3)}ms`);

      expect(k1Time).toBeLessThan(0.1);
      expect(k10Time).toBeLessThan(0.2);
      expect(k100Time).toBeLessThan(1);
    });

    it('should scale to 10,000 patterns while maintaining <1ms search time', async () => {
      // Add 9,000 more patterns (already have 1,000)
      const largePatternSet: MemoryPattern[] = Array.from({ length: 9000 }, (_, i) => ({
        id: `scale-pattern-${i}`,
        type: 'test',
        domain: `domain-${i % 20}`,
        pattern_data: JSON.stringify({
          text: `Scale test pattern ${i}`,
          embedding: generateRandomEmbedding()
        }),
        confidence: 0.85,
        usage_count: 0,
        success_count: 0,
        created_at: Date.now(),
        last_used: Date.now()
      }));

      const insertStart = performance.now();
      await agentDBManager.storeBatch(largePatternSet);
      const insertTime = performance.now() - insertStart;

      console.log(`Inserted 9,000 patterns in ${insertTime.toFixed(2)}ms`);

      await agentDBManager.rebuildIndex();

      const searchTime = await measureSearchTime(agentDBManager, 'scale test', 10);

      console.log(`Search time with 10,000 vectors: ${searchTime.toFixed(3)}ms`);

      expect(searchTime).toBeLessThan(1); // <1ms even with 10k vectors
    });
  });

  describe('Quantization Effects', () => {
    it('should reduce memory usage with scalar quantization', async () => {
      const configNone: AgentDBConfig = {
        dbPath: ':memory:',
        enableQUICSync: false,
        syncPort: 4433,
        syncPeers: [],
        enableLearning: false,
        enableReasoning: false,
        cacheSize: 100,
        quantizationType: 'none'
      };

      const configScalar: AgentDBConfig = {
        ...configNone,
        quantizationType: 'scalar'
      };

      const managerNone = new AgentDBManager(configNone);
      const managerScalar = new AgentDBManager(configScalar);

      await managerNone.initialize();
      await managerScalar.initialize();

      // Store same patterns in both
      const patterns = Array.from({ length: 100 }, (_, i) => ({
        id: `quant-test-${i}`,
        type: 'test',
        domain: 'general',
        pattern_data: JSON.stringify({
          text: `Quantization test ${i}`,
          embedding: generateRandomEmbedding()
        }),
        confidence: 0.9,
        usage_count: 0,
        success_count: 0,
        created_at: Date.now(),
        last_used: Date.now()
      }));

      await managerNone.storeBatch(patterns);
      await managerScalar.storeBatch(patterns);

      const memoryNone = await managerNone.getMemoryUsage();
      const memoryScalar = await managerScalar.getMemoryUsage();

      console.log(`Memory usage:
        None:   ${memoryNone.totalBytes} bytes
        Scalar: ${memoryScalar.totalBytes} bytes
        Reduction: ${((1 - memoryScalar.totalBytes / memoryNone.totalBytes) * 100).toFixed(1)}%`);

      expect(memoryScalar.totalBytes).toBeLessThan(memoryNone.totalBytes);
      expect(memoryScalar.totalBytes / memoryNone.totalBytes).toBeLessThan(0.5); // >50% reduction

      await managerNone.shutdown();
      await managerScalar.shutdown();
    });

    it('should maintain acceptable accuracy with quantization', async () => {
      const patterns = [
        {
          text: 'Authentication testing pattern',
          embedding: await agentDBManager.generateEmbedding('Authentication testing pattern')
        },
        {
          text: 'API integration testing',
          embedding: await agentDBManager.generateEmbedding('API integration testing')
        }
      ];

      // Store without quantization
      for (let i = 0; i < patterns.length; i++) {
        await agentDBManager.storePattern({
          id: `no-quant-${i}`,
          type: 'test',
          domain: 'general',
          pattern_data: JSON.stringify(patterns[i]),
          confidence: 0.9,
          usage_count: 0,
          success_count: 0,
          created_at: Date.now(),
          last_used: Date.now()
        });
      }

      const resultNoQuant = await agentDBManager.retrievePatterns('authentication test', { k: 2 });

      // Create quantized manager
      const quantizedManager = new AgentDBManager({
        ...agentDBManager.getConfig(),
        quantizationType: 'scalar',
        dbPath: ':memory:'
      });

      await quantizedManager.initialize();

      // Store with quantization
      for (let i = 0; i < patterns.length; i++) {
        await quantizedManager.storePattern({
          id: `quant-${i}`,
          type: 'test',
          domain: 'general',
          pattern_data: JSON.stringify(patterns[i]),
          confidence: 0.9,
          usage_count: 0,
          success_count: 0,
          created_at: Date.now(),
          last_used: Date.now()
        });
      }

      const resultQuant = await quantizedManager.retrievePatterns('authentication test', { k: 2 });

      // Similarity scores should be close (within 10%)
      expect(Math.abs(resultNoQuant.memories[0].similarity - resultQuant.memories[0].similarity))
        .toBeLessThan(0.1);

      await quantizedManager.shutdown();
    });
  });
});

// Helper functions

function generateRandomEmbedding(dimension: number = 384): number[] {
  return Array.from({ length: dimension }, () => Math.random() * 2 - 1);
}

function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) {
    throw new Error('Vectors must have same length');
  }

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

async function measureSearchTime(
  manager: AgentDBManager,
  query: string,
  k: number
): Promise<number> {
  const measurements: number[] = [];

  // Run 10 times and take average
  for (let i = 0; i < 10; i++) {
    const start = performance.now();
    await manager.retrievePatterns(query, { k });
    const duration = performance.now() - start;
    measurements.push(duration);
  }

  return measurements.reduce((a, b) => a + b, 0) / measurements.length;
}
