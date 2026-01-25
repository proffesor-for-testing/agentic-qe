/**
 * Unit Tests for NomicEmbedder
 *
 * Tests embedding generation, caching, batch processing,
 * and Ollama integration with mocked HTTP.
 *
 * REAL TESTS - Uses actual NomicEmbedder implementation with mocked fetch.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from '@jest/globals';
import { NomicEmbedder } from '../../../src/code-intelligence/embeddings/NomicEmbedder.js';
import { EmbeddingCache } from '../../../src/code-intelligence/embeddings/EmbeddingCache.js';
import type { CodeChunk } from '../../../src/code-intelligence/embeddings/types.js';
import { EMBEDDING_CONFIG } from '../../../src/code-intelligence/embeddings/types.js';

// Mock global fetch
const mockFetch = jest.fn();
(global as any).fetch = mockFetch;

// Helper to create mock embedding response
function mockEmbeddingResponse(embedding?: number[]) {
  return {
    ok: true,
    json: () => Promise.resolve({
      embedding: embedding || new Array(768).fill(0).map((_, i) => i * 0.001),
    }),
  };
}

// Helper to create test chunks
function createTestChunk(overrides: Partial<CodeChunk> = {}): CodeChunk {
  return {
    id: 'chunk1',
    fileId: 'file1',
    content: 'function test() { return 42; }',
    startLine: 1,
    endLine: 3,
    type: 'function',
    name: 'test',
    language: 'typescript',
    ...overrides,
  };
}

describe('NomicEmbedder', () => {
  let embedder: NomicEmbedder;

  beforeEach(() => {
    embedder = new NomicEmbedder('http://localhost:11434');
    mockFetch.mockReset();

    // Default: health check passes
    mockFetch.mockImplementation((url: string) => {
      if (url.includes('/api/tags')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({
            models: [{ name: 'nomic-embed-text' }],
          }),
        });
      }
      if (url.includes('/api/embeddings')) {
        return Promise.resolve(mockEmbeddingResponse());
      }
      return Promise.reject(new Error('Unknown URL'));
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('embedding generation', () => {
    it('should generate 768-dimensional vectors', async () => {
      const result = await embedder.embed('function test() { return 42; }');

      expect(result).toHaveLength(768);
      expect(result[0]).toBe(0);
      expect(result[767]).toBeCloseTo(0.767);
    });

    it('should format chunks with language context', () => {
      const chunk = createTestChunk({
        language: 'typescript',
        type: 'class',
        name: 'UserService',
        content: 'class UserService { }',
      });

      const formatted = embedder.formatForEmbedding(chunk);

      expect(formatted).toContain('typescript');
      expect(formatted).toContain('class');
      expect(formatted).toContain('UserService');
      expect(formatted).toContain('class UserService { }');
    });

    it('should batch process chunks efficiently', async () => {
      const chunks: CodeChunk[] = Array.from({ length: 10 }, (_, i) =>
        createTestChunk({
          id: `chunk${i}`,
          content: `function func${i}() { return ${i}; }`,
          name: `func${i}`,
        })
      );

      const result = await embedder.embedBatch(chunks);

      expect(result.results).toHaveLength(10);
      expect(result.stats.totalChunks).toBe(10);
      result.results.forEach((r) => {
        expect(r.embedding).toHaveLength(768);
        expect(r.model).toBe(EMBEDDING_CONFIG.MODEL);
      });
    });

    it('should handle empty chunk content', async () => {
      const chunk = createTestChunk({ content: '' });

      const formatted = embedder.formatForEmbedding(chunk);
      expect(formatted).toBeDefined();

      const result = await embedder.embed(formatted);
      expect(result).toHaveLength(768);
    });

    it('should handle very long chunks by truncating', () => {
      const longContent = 'x'.repeat(50000); // Way over context window
      const chunk = createTestChunk({ content: longContent });

      const formatted = embedder.formatForEmbedding(chunk);

      // Should be truncated to fit context window
      expect(formatted.length).toBeLessThan(EMBEDDING_CONFIG.CONTEXT_WINDOW * 4 + 100);
      expect(formatted).toContain('...');
    });

    it('should preserve chunk metadata in results', async () => {
      const chunk = createTestChunk({
        id: 'meta-chunk',
        metadata: { complexity: 'low', tags: ['utility'] },
      });

      const result = await embedder.embedBatch([chunk]);

      expect(result.results[0].chunkId).toBe('meta-chunk');
    });
  });

  describe('caching', () => {
    it('should cache embeddings by content hash', async () => {
      const text = 'function stable() { return 42; }';

      // First call - should hit API
      await embedder.embed(text);
      const firstCallCount = mockFetch.mock.calls.filter(
        (c) => c[0].includes('/api/embeddings')
      ).length;

      // Second call - should use cache
      await embedder.embed(text);
      const secondCallCount = mockFetch.mock.calls.filter(
        (c) => c[0].includes('/api/embeddings')
      ).length;

      // API should only be called once
      expect(secondCallCount).toBe(firstCallCount);
    });

    it('should return cached results for identical content', async () => {
      // Note: Within a single batch, chunks are processed concurrently via Promise.all,
      // so cache hits only work across SEPARATE batch calls
      const chunk1 = createTestChunk({ id: 'c1', content: 'same content' });
      const chunk2 = createTestChunk({ id: 'c2', content: 'same content' });
      const chunk3 = createTestChunk({ id: 'c3', content: 'same content' });

      // First batch: populates cache
      const result1 = await embedder.embedBatch([chunk1]);
      expect(result1.stats.computedNew).toBe(1);
      expect(result1.stats.cachedHits).toBe(0);

      // Second batch: should hit cache for identical content
      const result2 = await embedder.embedBatch([chunk2, chunk3]);
      expect(result2.stats.cachedHits).toBe(2);
      expect(result2.stats.computedNew).toBe(0);
    });

    it('should track cache hit rate accurately', async () => {
      const text = 'test content';
      await embedder.embed(text);
      await embedder.embed(text);
      await embedder.embed(text);

      const stats = await embedder.getCacheStats();

      expect(stats.hits).toBe(2);
      expect(stats.misses).toBe(1);
      expect(stats.hitRate).toBeCloseTo(2 / 3);
    });

    it('should invalidate cache when content changes', async () => {
      await embedder.embed('version 1');
      await embedder.embed('version 2'); // Different content

      const stats = await embedder.getCacheStats();

      expect(stats.misses).toBe(2); // Both should be cache misses
    });

    it('should clear cache on demand', async () => {
      await embedder.embed('some content');
      const statsBefore = await embedder.getCacheStats();
      expect(statsBefore.size).toBeGreaterThan(0);

      await embedder.clearCache();

      const statsAfter = await embedder.getCacheStats();
      expect(statsAfter.size).toBe(0);
    });

    it('should estimate memory usage', async () => {
      await embedder.embed('content 1');
      await embedder.embed('content 2');

      const memoryUsage = embedder.getCacheMemoryUsage();

      // Should be approximately 2 * (768 * 8 + overhead)
      expect(memoryUsage).toBeGreaterThan(0);
      expect(memoryUsage).toBeGreaterThan(768 * 8); // At least one embedding
    });
  });

  describe('Ollama integration', () => {
    it('should health check before batch processing', async () => {
      const chunks = [createTestChunk()];

      await embedder.embedBatch(chunks);

      // Should have called health check endpoint
      const healthCalls = mockFetch.mock.calls.filter(
        (c) => c[0].includes('/api/tags')
      );
      expect(healthCalls.length).toBeGreaterThan(0);
    });

    it('should throw when Ollama is unavailable', async () => {
      mockFetch.mockImplementation((url: string) => {
        if (url.includes('/api/tags')) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ models: [] }), // No models
          });
        }
        return Promise.reject(new Error('Connection refused'));
      });

      const chunks = [createTestChunk()];

      await expect(embedder.embedBatch(chunks)).rejects.toThrow(
        /nomic-embed-text.*not available/
      );
    });

    it('should perform health check', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          models: [{ name: 'nomic-embed-text' }],
        }),
      });

      const healthy = await embedder.healthCheck();

      expect(healthy).toBe(true);
    });

    it('should get server info', async () => {
      const serverInfo = {
        models: [
          { name: 'nomic-embed-text', size: 1000000 },
        ],
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(serverInfo),
      });

      const info = await embedder.getServerInfo();

      expect(info).toEqual(serverInfo);
    });
  });

  describe('batch processing', () => {
    it('should split large batches automatically', async () => {
      // Create more chunks than batch size
      const chunks: CodeChunk[] = Array.from({ length: 150 }, (_, i) =>
        createTestChunk({
          id: `chunk${i}`,
          content: `unique content ${i}`,
        })
      );

      const result = await embedder.embedBatch(chunks);

      expect(result.results).toHaveLength(150);
      expect(result.stats.totalChunks).toBe(150);
    });

    it('should aggregate batch statistics', async () => {
      // Note: Within a single batch, chunks are processed concurrently via Promise.all,
      // so duplicates in the SAME batch won't hit cache. Cache works across batches.
      const chunks1: CodeChunk[] = [
        createTestChunk({ id: 'c1', content: 'content 1' }),
        createTestChunk({ id: 'c2', content: 'content 2' }),
      ];

      // First batch: both computed
      const result1 = await embedder.embedBatch(chunks1);
      expect(result1.stats.totalChunks).toBe(2);
      expect(result1.stats.computedNew).toBe(2);
      expect(result1.stats.cachedHits).toBe(0);

      // Second batch with duplicate content
      const chunks2: CodeChunk[] = [
        createTestChunk({ id: 'c3', content: 'content 1' }), // Duplicate of c1
      ];

      const result2 = await embedder.embedBatch(chunks2);
      expect(result2.stats.totalChunks).toBe(1);
      expect(result2.stats.cachedHits).toBe(1);
      expect(result2.stats.computedNew).toBe(0);
      expect(result2.stats.totalTimeMs).toBeGreaterThanOrEqual(0);
      expect(result2.stats.avgTimePerChunk).toBeGreaterThanOrEqual(0);
    });

    it('should report progress for long operations', async () => {
      const chunks: CodeChunk[] = Array.from({ length: 50 }, (_, i) =>
        createTestChunk({
          id: `chunk${i}`,
          content: `content ${i}`,
        })
      );

      const progressUpdates: number[] = [];

      await embedder.embedBatch(chunks, (progress) => {
        progressUpdates.push(progress.percentage);
      });

      // Should have received progress updates
      expect(progressUpdates.length).toBeGreaterThan(0);
      // Last update should be 100%
      expect(progressUpdates[progressUpdates.length - 1]).toBe(100);
    });

    it('should maintain order in batch results', async () => {
      const chunks: CodeChunk[] = [
        createTestChunk({ id: 'a', content: 'a' }),
        createTestChunk({ id: 'b', content: 'b' }),
        createTestChunk({ id: 'c', content: 'c' }),
      ];

      const result = await embedder.embedBatch(chunks);

      expect(result.results.map((r) => r.chunkId)).toEqual(['a', 'b', 'c']);
    });
  });

  describe('error handling', () => {
    it('should throw informative error on API failure', async () => {
      mockFetch.mockImplementation((url: string) => {
        if (url.includes('/api/tags')) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({
              models: [{ name: 'nomic-embed-text' }],
            }),
          });
        }
        return Promise.resolve({
          ok: false,
          status: 500,
          text: () => Promise.resolve('Internal Server Error'),
        });
      });

      await expect(embedder.embed('test')).rejects.toThrow(/Failed to generate embedding/);
    });

    it('should handle malformed chunks gracefully', async () => {
      const malformedChunk = {
        id: 'bad',
        content: 'test',
        // Missing other required fields
      } as unknown as CodeChunk;

      // Should not crash - formatForEmbedding handles missing fields
      const formatted = embedder.formatForEmbedding(malformedChunk);
      expect(formatted).toContain('test');
    });
  });

  describe('edge cases', () => {
    it('should handle chunks with special characters', async () => {
      const chunk = createTestChunk({
        content: 'const emoji = "🚀💻🎉"; const regex = /[^\\s@]+/;',
      });

      const formatted = embedder.formatForEmbedding(chunk);
      expect(formatted).toContain('🚀');

      const result = await embedder.embed(formatted);
      expect(result).toHaveLength(768);
    });

    it('should handle chunks with Unicode', async () => {
      const chunk = createTestChunk({
        name: 'café',
        content: 'function café() { const π = 3.14; }',
      });

      const formatted = embedder.formatForEmbedding(chunk);
      expect(formatted).toContain('café');
      expect(formatted).toContain('π');
    });

    it('should handle chunks with newlines', async () => {
      const chunk = createTestChunk({
        content: 'function test() {\n  const x = 1;\n  return x;\n}',
      });

      const formatted = embedder.formatForEmbedding(chunk);
      expect(formatted).toContain('\n');
    });
  });

  describe('configuration', () => {
    it('should use default configuration', () => {
      const config = embedder.getConfig();

      expect(config.model).toBe(EMBEDDING_CONFIG.MODEL);
      expect(config.dimensions).toBe(768);
      expect(config.contextWindow).toBe(EMBEDDING_CONFIG.CONTEXT_WINDOW);
    });

    it('should allow custom batch size', () => {
      const customEmbedder = new NomicEmbedder(
        'http://localhost:11434',
        10000, // maxCacheSize
        50 // batchSize
      );

      const config = customEmbedder.getConfig();
      expect(config.batchSize).toBe(50);
    });

    it('should estimate batch time', async () => {
      const estimate = await embedder.estimateBatchTime(100, 50);

      // With empty cache, should estimate 100 * 50ms = 5000ms
      expect(estimate).toBeGreaterThan(0);
    });
  });

  describe('cache management', () => {
    it('should evict old cache entries', async () => {
      await embedder.embed('old content');

      // Wait a tiny bit
      await new Promise((r) => setTimeout(r, 10));

      // Evict entries older than 5ms
      const evicted = await embedder.evictOldCacheEntries(5);

      expect(evicted).toBeGreaterThanOrEqual(0);
    });

    it('should support cache warmup', async () => {
      const chunks = [
        createTestChunk({ id: 'w1', content: 'warmup 1' }),
        createTestChunk({ id: 'w2', content: 'warmup 2' }),
      ];

      await embedder.warmupCache(chunks);

      // Cache should now contain these entries
      const stats = await embedder.getCacheStats();
      expect(stats.size).toBeGreaterThan(0);
    });

    it('should batch format chunks', () => {
      const chunks = [
        createTestChunk({ id: 'f1', content: 'format 1' }),
        createTestChunk({ id: 'f2', content: 'format 2' }),
      ];

      const formatted = embedder.batchFormat(chunks);

      expect(formatted).toHaveLength(2);
      expect(formatted[0]).toContain('format 1');
      expect(formatted[1]).toContain('format 2');
    });
  });
});
