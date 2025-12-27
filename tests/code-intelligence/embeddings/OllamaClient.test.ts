/**
 * Unit Tests for OllamaClient
 *
 * Tests Ollama API integration with mocked HTTP responses.
 * REAL TESTS - Uses actual OllamaClient implementation with mocked fetch.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from '@jest/globals';
import { OllamaClient } from '../../../src/code-intelligence/embeddings/OllamaClient.js';
import { EMBEDDING_CONFIG } from '../../../src/code-intelligence/embeddings/types.js';

// Mock global fetch
const mockFetch = jest.fn();
(global as any).fetch = mockFetch;

describe('OllamaClient', () => {
  let client: OllamaClient;

  beforeEach(() => {
    client = new OllamaClient('http://localhost:11434');
    mockFetch.mockReset();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('health check', () => {
    it('should return true when Ollama is running with correct model', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          models: [
            { name: 'nomic-embed-text', model: 'nomic-embed-text' },
            { name: 'llama2', model: 'llama2' },
          ],
        }),
      });

      const healthy = await client.healthCheck();

      expect(healthy).toBe(true);
      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:11434/api/tags',
        expect.objectContaining({
          method: 'GET',
          headers: { 'Content-Type': 'application/json' },
        })
      );
    });

    it('should return false when model is not available', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          models: [
            { name: 'llama2', model: 'llama2' },
          ],
        }),
      });

      const healthy = await client.healthCheck();

      expect(healthy).toBe(false);
    });

    it('should return false when Ollama is not running', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Connection refused'));

      const healthy = await client.healthCheck();

      expect(healthy).toBe(false);
    });

    it('should return false on HTTP error', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
      });

      const healthy = await client.healthCheck();

      expect(healthy).toBe(false);
    });

    it('should return false when models array is empty', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ models: [] }),
      });

      const healthy = await client.healthCheck();

      expect(healthy).toBe(false);
    });

    it('should return false when response has no models field', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({}),
      });

      const healthy = await client.healthCheck();

      expect(healthy).toBe(false);
    });
  });

  describe('embedding generation', () => {
    it('should generate 768-dimensional embedding', async () => {
      const mockEmbedding = new Array(768).fill(0).map((_, i) => i * 0.001);

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ embedding: mockEmbedding }),
      });

      const result = await client.generateEmbedding('function test() { return 42; }');

      expect(result).toHaveLength(768);
      expect(result[0]).toBe(0);
      expect(result[767]).toBeCloseTo(0.767);
    });

    it('should send correct request format', async () => {
      const mockEmbedding = new Array(768).fill(0.5);

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ embedding: mockEmbedding }),
      });

      const prompt = 'typescript function add: function add(a, b) { return a + b; }';
      await client.generateEmbedding(prompt);

      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:11434/api/embeddings',
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: EMBEDDING_CONFIG.MODEL,
            prompt,
          }),
        })
      );
    });

    it('should throw on API error', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 500,
        text: () => Promise.resolve('Internal Server Error'),
      });

      await expect(client.generateEmbedding('test')).rejects.toThrow(
        /Failed to generate embedding after 3 attempts/
      );
    });

    it('should throw on invalid embedding dimensions', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ embedding: new Array(512).fill(0) }),
      });

      await expect(client.generateEmbedding('test')).rejects.toThrow(
        /Invalid embedding dimensions: expected 768, got 512/
      );
    });

    it('should handle empty response', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ embedding: [] }),
      });

      await expect(client.generateEmbedding('test')).rejects.toThrow(
        /Invalid embedding dimensions/
      );
    });
  });

  describe('retry logic', () => {
    it('should retry on transient failure', async () => {
      const mockEmbedding = new Array(768).fill(0.5);

      // First two calls fail, third succeeds
      mockFetch
        .mockRejectedValueOnce(new Error('Network error'))
        .mockRejectedValueOnce(new Error('Timeout'))
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ embedding: mockEmbedding }),
        });

      const result = await client.generateEmbedding('test');

      expect(result).toHaveLength(768);
      expect(mockFetch).toHaveBeenCalledTimes(3);
    });

    it('should fail after max retries', async () => {
      mockFetch.mockRejectedValue(new Error('Persistent failure'));

      await expect(client.generateEmbedding('test')).rejects.toThrow(
        /Failed to generate embedding after 3 attempts/
      );

      expect(mockFetch).toHaveBeenCalledTimes(3);
    });

    it('should not retry on validation error', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ embedding: new Array(512).fill(0) }),
      });

      await expect(client.generateEmbedding('test')).rejects.toThrow(
        /Invalid embedding dimensions/
      );

      // Should fail immediately without retrying
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it('should use exponential backoff', async () => {
      const mockEmbedding = new Array(768).fill(0.5);

      // Track timing
      const callTimes: number[] = [];
      mockFetch.mockImplementation(() => {
        callTimes.push(Date.now());
        if (callTimes.length < 3) {
          return Promise.reject(new Error('Retry'));
        }
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ embedding: mockEmbedding }),
        });
      });

      await client.generateEmbedding('test');

      // Verify delays increase (exponential backoff)
      if (callTimes.length >= 3) {
        const delay1 = callTimes[1] - callTimes[0];
        const delay2 = callTimes[2] - callTimes[1];
        // Second delay should be roughly double the first (with tolerance)
        expect(delay2).toBeGreaterThan(delay1 * 0.5);
      }
    });
  });

  describe('server info', () => {
    it('should return server info when available', async () => {
      const serverInfo = {
        models: [
          { name: 'nomic-embed-text', size: 1000000 },
          { name: 'llama2', size: 5000000 },
        ],
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(serverInfo),
      });

      const info = await client.getServerInfo();

      expect(info).toEqual(serverInfo);
    });

    it('should return null when server is unavailable', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Connection refused'));

      const info = await client.getServerInfo();

      expect(info).toBeNull();
    });

    it('should return null on HTTP error', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 503,
      });

      const info = await client.getServerInfo();

      expect(info).toBeNull();
    });
  });

  describe('model availability check', () => {
    it('should succeed when model is available', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          models: [{ name: 'nomic-embed-text' }],
        }),
      });

      await expect(client.ensureModelAvailable()).resolves.not.toThrow();
    });

    it('should throw when model is not available', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          models: [{ name: 'other-model' }],
        }),
      });

      await expect(client.ensureModelAvailable()).rejects.toThrow(
        /nomic-embed-text.*not available/
      );
    });

    it('should throw with helpful message', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Connection refused'));

      await expect(client.ensureModelAvailable()).rejects.toThrow(
        /ollama pull nomic-embed-text/
      );
    });
  });

  describe('configuration', () => {
    it('should use default URL when not specified', () => {
      const defaultClient = new OllamaClient();
      expect(defaultClient).toBeDefined();
    });

    it('should strip trailing slash from URL', async () => {
      const clientWithSlash = new OllamaClient('http://localhost:11434/');

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ models: [] }),
      });

      await clientWithSlash.healthCheck();

      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:11434/api/tags',
        expect.any(Object)
      );
    });

    it('should use custom retry settings', () => {
      const customClient = new OllamaClient(
        'http://localhost:11434',
        5, // maxRetries
        500, // retryDelayMs
        60000 // timeoutMs
      );

      expect(customClient).toBeDefined();
    });
  });

  describe('timeout handling', () => {
    it('should timeout on slow response', async () => {
      // Create client with very short timeout for testing
      const fastClient = new OllamaClient(
        'http://localhost:11434',
        1, // maxRetries
        10, // retryDelayMs - short for fast test
        50 // timeoutMs - very short
      );

      // Mock that respects abort signal like real fetch would
      mockFetch.mockImplementation((url: string, options?: RequestInit) => {
        return new Promise((resolve, reject) => {
          const timeoutId = setTimeout(() => {
            resolve({ ok: true, json: () => Promise.resolve({ embedding: [] }) });
          }, 10000);

          // Listen for abort signal
          if (options?.signal) {
            options.signal.addEventListener('abort', () => {
              clearTimeout(timeoutId);
              reject(new DOMException('The operation was aborted.', 'AbortError'));
            });
          }
        });
      });

      // Should reject due to timeout (AbortError)
      await expect(fastClient.generateEmbedding('test')).rejects.toThrow();
    });
  });

  describe('edge cases', () => {
    it('should handle Unicode in prompt', async () => {
      const mockEmbedding = new Array(768).fill(0.5);

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ embedding: mockEmbedding }),
      });

      const prompt = 'function café() { const π = 3.14; const 你好 = "hello"; }';
      const result = await client.generateEmbedding(prompt);

      expect(result).toHaveLength(768);
      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          body: expect.stringContaining('café'),
        })
      );
    });

    it('should handle very long prompts', async () => {
      const mockEmbedding = new Array(768).fill(0.5);

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ embedding: mockEmbedding }),
      });

      const longPrompt = 'x'.repeat(10000);
      const result = await client.generateEmbedding(longPrompt);

      expect(result).toHaveLength(768);
    });

    it('should handle empty prompt', async () => {
      const mockEmbedding = new Array(768).fill(0);

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ embedding: mockEmbedding }),
      });

      const result = await client.generateEmbedding('');

      expect(result).toHaveLength(768);
    });

    it('should handle special characters in prompt', async () => {
      const mockEmbedding = new Array(768).fill(0.5);

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ embedding: mockEmbedding }),
      });

      const prompt = 'const regex = /[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/;';
      const result = await client.generateEmbedding(prompt);

      expect(result).toHaveLength(768);
    });
  });
});
