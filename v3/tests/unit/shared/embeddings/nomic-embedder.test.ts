/**
 * Agentic QE v3 - NomicEmbedder Unit Tests
 * Tests the embedding service with mocked Ollama client
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import {
  NomicEmbedder,
  EmbeddingCache,
  EMBEDDING_CONFIG,
  CodeChunk,
} from '../../../../src/shared/embeddings';

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch;

describe('NomicEmbedder', () => {
  let embedder: NomicEmbedder;

  beforeEach(() => {
    vi.clearAllMocks();
    embedder = new NomicEmbedder({
      enableFallback: true,
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('constructor', () => {
    it('should create embedder with default config', () => {
      const config = embedder.getConfig();
      expect(config.model).toBe('nomic-embed-text');
      expect(config.dimensions).toBe(768);
      expect(config.enableFallback).toBe(true);
    });

    it('should create embedder with custom config', () => {
      const customEmbedder = new NomicEmbedder({
        ollamaBaseUrl: 'http://custom:11434',
        batchSize: 50,
        enableFallback: false,
      });
      const config = customEmbedder.getConfig();
      expect(config.batchSize).toBe(50);
      expect(config.enableFallback).toBe(false);
    });
  });

  describe('embed (fallback mode)', () => {
    beforeEach(() => {
      // Mock Ollama health check as unavailable
      mockFetch.mockResolvedValue({
        ok: false,
      });
    });

    it('should generate pseudo-embedding when Ollama unavailable', async () => {
      const embedding = await embedder.embed('function add(a, b) { return a + b; }');

      expect(Array.isArray(embedding)).toBe(true);
      expect(embedding.length).toBe(EMBEDDING_CONFIG.DIMENSIONS);
    });

    it('should generate normalized embeddings', async () => {
      const embedding = await embedder.embed('test code');

      const magnitude = Math.sqrt(embedding.reduce((sum, v) => sum + v * v, 0));
      expect(magnitude).toBeCloseTo(1, 5);
    });

    it('should cache embeddings', async () => {
      const text = 'const x = 1;';

      const embedding1 = await embedder.embed(text);
      const embedding2 = await embedder.embed(text);

      expect(embedding1).toEqual(embedding2);

      const stats = embedder.getCacheStats();
      expect(stats.hits).toBeGreaterThan(0);
    });

    it('should generate different embeddings for different code', async () => {
      const embedding1 = await embedder.embed('function add() {}');
      const embedding2 = await embedder.embed('class User {}');

      expect(embedding1).not.toEqual(embedding2);
    });

    it('should throw when fallback disabled and Ollama unavailable', async () => {
      const strictEmbedder = new NomicEmbedder({
        enableFallback: false,
      });

      await expect(strictEmbedder.embed('test')).rejects.toThrow(
        /Ollama is not available/
      );
    });
  });

  describe('embed (with Ollama)', () => {
    const mockEmbedding = new Array(768).fill(0).map((_, i) => i / 1000);

    beforeEach(() => {
      // Mock successful Ollama responses
      mockFetch.mockImplementation((url: string) => {
        if (url.includes('/api/tags')) {
          return Promise.resolve({
            ok: true,
            json: () =>
              Promise.resolve({
                models: [{ name: 'nomic-embed-text:latest', model: 'nomic-embed-text' }],
              }),
          });
        }
        if (url.includes('/api/embeddings')) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ embedding: mockEmbedding }),
          });
        }
        return Promise.resolve({ ok: false });
      });
    });

    it('should generate embedding using Ollama when available', async () => {
      const freshEmbedder = new NomicEmbedder({ enableFallback: true });
      const embedding = await freshEmbedder.embed('test code');

      expect(embedding).toEqual(mockEmbedding);
    });

    it('should use cached embedding on second call', async () => {
      const freshEmbedder = new NomicEmbedder({ enableFallback: true });

      await freshEmbedder.embed('cached test');
      await freshEmbedder.embed('cached test');

      // Should only call API once for the same content
      const embeddingCalls = mockFetch.mock.calls.filter((call) =>
        call[0].includes('/api/embeddings')
      );
      expect(embeddingCalls.length).toBe(1);
    });
  });

  describe('formatForEmbedding', () => {
    it('should format code chunk with language, type, and name', () => {
      const chunk: CodeChunk = {
        id: '1',
        fileId: 'file-1',
        content: 'return a + b;',
        startLine: 1,
        endLine: 3,
        type: 'function',
        name: 'add',
        language: 'typescript',
      };

      const formatted = embedder.formatForEmbedding(chunk);
      expect(formatted).toBe('typescript function add: return a + b;');
    });

    it('should handle chunk without name', () => {
      const chunk: CodeChunk = {
        id: '1',
        fileId: 'file-1',
        content: 'const x = 1;',
        startLine: 1,
        endLine: 1,
        type: 'variable',
        language: 'javascript',
      };

      const formatted = embedder.formatForEmbedding(chunk);
      expect(formatted).toBe('javascript variable: const x = 1;');
    });

    it('should truncate very long content', () => {
      const longContent = 'x'.repeat(50000);
      const chunk: CodeChunk = {
        id: '1',
        fileId: 'file-1',
        content: longContent,
        startLine: 1,
        endLine: 1000,
        type: 'file',
        language: 'text',
      };

      const formatted = embedder.formatForEmbedding(chunk);
      expect(formatted.length).toBeLessThan(EMBEDDING_CONFIG.CONTEXT_WINDOW * 4 + 100);
      expect(formatted.endsWith('...')).toBe(true);
    });
  });

  describe('embedBatch (simple texts)', () => {
    beforeEach(() => {
      mockFetch.mockResolvedValue({ ok: false });
    });

    it('should process batch of text strings', async () => {
      const texts = ['function add() {}', 'class User {}'];
      const result = await embedder.embedBatch(texts);

      expect(result.length).toBe(2);
      expect(result[0].length).toBe(EMBEDDING_CONFIG.DIMENSIONS);
      expect(result[1].length).toBe(EMBEDDING_CONFIG.DIMENSIONS);
    });
  });

  describe('embedCodeChunks', () => {
    beforeEach(() => {
      // Mock Ollama as unavailable for batch tests
      mockFetch.mockResolvedValue({ ok: false });
    });

    it('should process batch of chunks', async () => {
      const chunks: CodeChunk[] = [
        {
          id: '1',
          fileId: 'f1',
          content: 'function add() {}',
          startLine: 1,
          endLine: 1,
          type: 'function',
          language: 'typescript',
        },
        {
          id: '2',
          fileId: 'f1',
          content: 'class User {}',
          startLine: 2,
          endLine: 2,
          type: 'class',
          language: 'typescript',
        },
      ];

      const result = await embedder.embedCodeChunks(chunks);

      expect(result.results.length).toBe(2);
      expect(result.stats.totalChunks).toBe(2);
      expect(result.stats.computedNew).toBe(2);
    });

    it('should report progress during batch processing', async () => {
      const chunks: CodeChunk[] = Array.from({ length: 5 }, (_, i) => ({
        id: `${i}`,
        fileId: 'f1',
        content: `code ${i}`,
        startLine: i,
        endLine: i,
        type: 'code',
        language: 'typescript',
      }));

      const progressUpdates: number[] = [];

      await embedder.embedCodeChunks(chunks, (progress) => {
        progressUpdates.push(progress.percentage);
      });

      expect(progressUpdates.length).toBeGreaterThan(0);
      expect(progressUpdates[progressUpdates.length - 1]).toBe(100);
    });

    it('should track cache hits in batch', async () => {
      const chunks: CodeChunk[] = [
        {
          id: '1',
          fileId: 'f1',
          content: 'same content',
          startLine: 1,
          endLine: 1,
          type: 'code',
          language: 'typescript',
        },
      ];

      // First batch
      await embedder.embedCodeChunks(chunks);

      // Second batch with same content
      const result = await embedder.embedCodeChunks(chunks);

      expect(result.stats.cachedHits).toBe(1);
      expect(result.stats.computedNew).toBe(0);
    });
  });

  describe('cache operations', () => {
    beforeEach(() => {
      mockFetch.mockResolvedValue({ ok: false });
    });

    it('should clear cache', async () => {
      await embedder.embed('test');
      embedder.clearCache();

      const stats = embedder.getCacheStats();
      expect(stats.size).toBe(0);
    });

    it('should track cache statistics', async () => {
      await embedder.embed('test1');
      await embedder.embed('test2');
      await embedder.embed('test1'); // Cache hit

      const stats = embedder.getCacheStats();
      expect(stats.size).toBe(2);
      expect(stats.hits).toBe(1);
      expect(stats.misses).toBe(2);
    });
  });

  describe('healthCheck', () => {
    it('should return false when Ollama unavailable', async () => {
      mockFetch.mockResolvedValue({ ok: false });

      const isHealthy = await embedder.healthCheck();
      expect(isHealthy).toBe(false);
    });

    it('should return true when Ollama available with model', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            models: [{ name: 'nomic-embed-text:latest' }],
          }),
      });

      const isHealthy = await embedder.healthCheck();
      expect(isHealthy).toBe(true);
    });

    it('should return false when model not present', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            models: [{ name: 'other-model' }],
          }),
      });

      const isHealthy = await embedder.healthCheck();
      expect(isHealthy).toBe(false);
    });
  });
});

describe('EmbeddingCache', () => {
  let cache: EmbeddingCache;

  beforeEach(() => {
    cache = new EmbeddingCache(100);
  });

  it('should store and retrieve embeddings', () => {
    const embedding = [0.1, 0.2, 0.3];
    cache.set('content', 'model', embedding);

    const retrieved = cache.get('content', 'model');
    expect(retrieved).toEqual(embedding);
  });

  it('should return null for missing entries', () => {
    const result = cache.get('nonexistent', 'model');
    expect(result).toBeNull();
  });

  it('should track hit/miss statistics', () => {
    cache.set('content', 'model', [0.1]);
    cache.get('content', 'model'); // Hit
    cache.get('missing', 'model'); // Miss

    const stats = cache.getStats();
    expect(stats.hits).toBe(1);
    expect(stats.misses).toBe(1);
    expect(stats.hitRate).toBeCloseTo(0.5, 2);
  });

  it('should evict oldest entries when full', () => {
    const smallCache = new EmbeddingCache(2);

    smallCache.set('first', 'model', [0.1]);
    smallCache.set('second', 'model', [0.2]);
    smallCache.set('third', 'model', [0.3]); // Should evict 'first'

    expect(smallCache.get('first', 'model')).toBeNull();
    expect(smallCache.get('second', 'model')).toEqual([0.2]);
    expect(smallCache.get('third', 'model')).toEqual([0.3]);
  });

  it('should clear all entries', () => {
    cache.set('content', 'model', [0.1]);
    cache.clear();

    expect(cache.getStats().size).toBe(0);
    expect(cache.get('content', 'model')).toBeNull();
  });

  it('should export and import cache data', () => {
    cache.set('c1', 'model', [0.1]);
    cache.set('c2', 'model', [0.2]);

    const exported = cache.export();
    expect(exported.length).toBe(2);

    const newCache = new EmbeddingCache(100);
    newCache.import(exported);

    expect(newCache.getStats().size).toBe(2);
  });
});
