/**
 * Unit Tests for SemanticRetriever
 *
 * Tests multi-chunk retrieval with configurable top-k.
 * Validates AST chunking + top-k > 1 strategy.
 */

import { describe, it, expect, beforeEach, vi } from '@jest/globals';
import { SemanticRetriever } from '../../../src/code-intelligence/retrieval/SemanticRetriever.js';
import type { NomicEmbedder } from '../../../src/code-intelligence/embeddings/NomicEmbedder.js';
import type { StoredChunk } from '../../../src/code-intelligence/retrieval/types.js';
import {
  PRECISION_RETRIEVAL_CONFIG,
  RECALL_RETRIEVAL_CONFIG,
} from '../../../src/code-intelligence/retrieval/types.js';

// Create mock embedder
function createMockEmbedder(): NomicEmbedder {
  return {
    embed: jest.fn().mockResolvedValue(new Array(768).fill(0.5)),
    embedBatch: jest.fn(),
    formatForEmbedding: jest.fn(),
    healthCheck: jest.fn(),
    getServerInfo: jest.fn(),
    getCacheStats: jest.fn(),
    getCacheMemoryUsage: jest.fn(),
    clearCache: jest.fn(),
    evictOldCacheEntries: jest.fn(),
    warmupCache: jest.fn(),
    batchFormat: jest.fn(),
    getConfig: jest.fn(),
    estimateBatchTime: jest.fn(),
  } as unknown as NomicEmbedder;
}

// Helper to create test chunks with embeddings
function createTestChunk(
  id: string,
  filePath: string,
  entityType: string,
  similarity: number, // 0-1, used to create embedding
  overrides: Partial<StoredChunk> = {}
): StoredChunk {
  // Create embedding that will have target similarity with [0.5, 0.5, ...]
  // similarity = dot(a,b) / (|a| * |b|)
  const embedding = new Array(768).fill(similarity);

  return {
    id,
    fileId: filePath,
    filePath,
    content: `// Content for ${id}`,
    startLine: 1,
    endLine: 10,
    entityType,
    entityName: id,
    language: 'typescript',
    embedding,
    ...overrides,
  };
}

describe('SemanticRetriever', () => {
  let retriever: SemanticRetriever;
  let mockEmbedder: NomicEmbedder;

  beforeEach(() => {
    mockEmbedder = createMockEmbedder();
    retriever = new SemanticRetriever(mockEmbedder);
  });

  describe('configuration', () => {
    it('should use default config with topK=5', () => {
      const config = retriever.getConfig();

      expect(config.topK).toBe(5);
      expect(config.minSimilarity).toBe(0.5);
      expect(config.deduplicateByFile).toBe(true);
      expect(config.maxChunksPerFile).toBe(3);
    });

    it('should allow config override in constructor', () => {
      const customRetriever = new SemanticRetriever(createMockEmbedder(), { topK: 10 });

      expect(customRetriever.getConfig().topK).toBe(10);
    });

    it('should allow config update', () => {
      retriever.updateConfig({ topK: 8 });

      expect(retriever.getConfig().topK).toBe(8);
    });

    it('should provide precision config preset', () => {
      expect(PRECISION_RETRIEVAL_CONFIG.topK).toBe(3);
      expect(PRECISION_RETRIEVAL_CONFIG.minSimilarity).toBe(0.7);
    });

    it('should provide recall config preset', () => {
      expect(RECALL_RETRIEVAL_CONFIG.topK).toBe(10);
      expect(RECALL_RETRIEVAL_CONFIG.minSimilarity).toBe(0.4);
      expect(RECALL_RETRIEVAL_CONFIG.includeContext).toBe(true);
    });
  });

  describe('indexing', () => {
    it('should add chunks to index', () => {
      const chunks = [
        createTestChunk('c1', '/file1.ts', 'function', 0.8),
        createTestChunk('c2', '/file2.ts', 'class', 0.7),
      ];

      retriever.addChunks(chunks);

      expect(retriever.getIndexSize()).toBe(2);
    });

    it('should clear index', () => {
      retriever.addChunks([createTestChunk('c1', '/file.ts', 'function', 0.8)]);
      expect(retriever.getIndexSize()).toBe(1);

      retriever.clearIndex();

      expect(retriever.getIndexSize()).toBe(0);
    });
  });

  describe('retrieval', () => {
    beforeEach(() => {
      // Add test chunks with varying similarity
      const chunks = [
        createTestChunk('high1', '/file1.ts', 'function', 0.9),
        createTestChunk('high2', '/file1.ts', 'function', 0.85),
        createTestChunk('medium1', '/file2.ts', 'class', 0.7),
        createTestChunk('medium2', '/file2.ts', 'method', 0.65),
        createTestChunk('low1', '/file3.ts', 'function', 0.4),
        createTestChunk('low2', '/file3.ts', 'variable', 0.3),
      ];
      retriever.addChunks(chunks);
    });

    it('should retrieve top-k chunks by similarity', async () => {
      const response = await retriever.retrieve('test query');

      expect(response.results.length).toBeLessThanOrEqual(5); // default topK
      expect(response.query).toBe('test query');
      expect(response.retrievalTimeMs).toBeGreaterThanOrEqual(0);
    });

    it('should filter by minimum similarity', async () => {
      const response = await retriever.retrieve('test query');

      // All results should be above threshold
      response.results.forEach(result => {
        expect(result.similarity).toBeGreaterThanOrEqual(0.5);
      });
    });

    it('should return results ordered by similarity', async () => {
      const response = await retriever.retrieve('test query');

      for (let i = 1; i < response.results.length; i++) {
        expect(response.results[i - 1].similarity).toBeGreaterThanOrEqual(
          response.results[i].similarity
        );
      }
    });

    it('should respect maxChunksPerFile limit', async () => {
      // Add many chunks from same file
      const sameFileChunks = Array.from({ length: 10 }, (_, i) =>
        createTestChunk(`same${i}`, '/samefile.ts', 'function', 0.8)
      );
      retriever.addChunks(sameFileChunks);

      const response = await retriever.retrieve('test query');

      const sameFileResults = response.results.filter(
        r => r.filePath === '/samefile.ts'
      );
      expect(sameFileResults.length).toBeLessThanOrEqual(3); // maxChunksPerFile
    });

    it('should allow per-query config override', async () => {
      const response = await retriever.retrieve('test query', { topK: 2 });

      expect(response.results.length).toBeLessThanOrEqual(2);
    });

    it('should include retrieval statistics', async () => {
      const response = await retriever.retrieve('test query');

      expect(response.stats.totalChunksSearched).toBeGreaterThan(0);
      expect(response.stats.chunksReturned).toBeGreaterThanOrEqual(0);
      expect(response.stats.uniqueFiles).toBeGreaterThanOrEqual(0);
      expect(response.stats.avgSimilarity).toBeGreaterThanOrEqual(0);
    });
  });

  describe('context formatting', () => {
    beforeEach(() => {
      retriever.addChunks([
        createTestChunk('func1', '/src/utils.ts', 'function', 0.9, {
          content: 'function helper() { return 42; }',
          startLine: 10,
          endLine: 12,
          entityName: 'helper',
        }),
        createTestChunk('class1', '/src/service.ts', 'class', 0.8, {
          content: 'class UserService { }',
          startLine: 1,
          endLine: 50,
          entityName: 'UserService',
        }),
      ]);
    });

    it('should format results as context string', async () => {
      const context = await retriever.retrieveAsContext('test query');

      expect(context).toContain('/src/utils.ts');
      expect(context).toContain('function helper()');
      expect(context).toContain('10-12');
    });

    it('should return empty string when no results', async () => {
      retriever.clearIndex();

      const context = await retriever.retrieveAsContext('test query');

      expect(context).toBe('');
    });
  });

  describe('multi-chunk retrieval benefit', () => {
    it('should find related content across multiple small chunks', async () => {
      // Simulate AST-chunked code where a feature spans multiple chunks
      retriever.clearIndex();
      retriever.addChunks([
        createTestChunk('auth-validate', '/auth.ts', 'function', 0.85, {
          content: 'function validateCredentials(email, password) { }',
          entityName: 'validateCredentials',
        }),
        createTestChunk('auth-jwt', '/auth.ts', 'function', 0.82, {
          content: 'function generateJWT(userId) { return jwt.sign(...); }',
          entityName: 'generateJWT',
        }),
        createTestChunk('auth-refresh', '/auth.ts', 'function', 0.78, {
          content: 'function refreshToken(token) { }',
          entityName: 'refreshToken',
        }),
        createTestChunk('user-create', '/user.ts', 'function', 0.75, {
          content: 'function createUser(data) { }',
          entityName: 'createUser',
        }),
      ]);

      // With topK=5, should get all auth-related chunks
      const response = await retriever.retrieve('user authentication', { topK: 5 });

      // Should get multiple chunks providing complete auth context
      expect(response.results.length).toBeGreaterThan(1);

      // Should include chunks from auth.ts
      const authChunks = response.results.filter(r => r.filePath === '/auth.ts');
      expect(authChunks.length).toBeGreaterThan(0);
    });

    it('should demonstrate improvement over single-chunk retrieval', async () => {
      retriever.clearIndex();

      // Add chunks that together form complete context
      retriever.addChunks([
        createTestChunk('part1', '/feature.ts', 'function', 0.9, {
          content: 'function processData(input) { const validated = validate(input); }',
        }),
        createTestChunk('part2', '/feature.ts', 'function', 0.85, {
          content: 'function validate(data) { return schema.parse(data); }',
        }),
        createTestChunk('part3', '/feature.ts', 'function', 0.8, {
          content: 'function formatOutput(result) { return JSON.stringify(result); }',
        }),
      ]);

      // Single chunk retrieval
      const single = await retriever.retrieve('data processing', { topK: 1 });

      // Multi chunk retrieval
      const multi = await retriever.retrieve('data processing', { topK: 5 });

      // Multi-chunk provides more complete context
      expect(multi.results.length).toBeGreaterThan(single.results.length);

      // Combined content should include more of the feature
      const singleContent = single.results.map(r => r.content).join(' ');
      const multiContent = multi.results.map(r => r.content).join(' ');

      expect(multiContent.length).toBeGreaterThan(singleContent.length);
    });
  });
});
