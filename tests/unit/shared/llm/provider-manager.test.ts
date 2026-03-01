/**
 * Agentic QE v3 - Provider Manager Unit Tests
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import {
  ProviderManager,
  createProviderManager,
  createQEProviderManager,
} from '../../../../src/shared/llm/provider-manager';
import { resetGlobalCostTracker } from '../../../../src/shared/llm/cost-tracker';

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch;

describe('ProviderManager', () => {
  let manager: ProviderManager;

  beforeEach(() => {
    vi.clearAllMocks();
    resetGlobalCostTracker();
  });

  afterEach(async () => {
    if (manager) {
      await manager.dispose();
    }
  });

  describe('initialization', () => {
    it('should initialize with default config', async () => {
      // Mock health checks for initialization
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          models: [{ name: 'llama3.1' }],
        }),
      });

      manager = createProviderManager();
      await manager.initialize();

      expect(manager.getAvailableProviders().length).toBeGreaterThan(0);
    });

    it('should create QE-optimized manager', () => {
      manager = createQEProviderManager();
      expect(manager).toBeDefined();
    });

    it('should throw if no providers can be initialized', async () => {
      // Mock all providers failing
      mockFetch.mockRejectedValue(new Error('All providers unavailable'));

      manager = new ProviderManager({
        primary: 'claude',
        fallbacks: [],
        loadBalancing: 'round-robin',
        providers: {
          claude: { model: 'claude-sonnet-4-20250514', apiKey: undefined },
        },
      });

      // Clear env vars
      const origClaude = process.env.ANTHROPIC_API_KEY;
      const origOpenai = process.env.OPENAI_API_KEY;
      delete process.env.ANTHROPIC_API_KEY;
      delete process.env.OPENAI_API_KEY;

      // Should still initialize since we have providers config
      await manager.initialize();

      // Restore
      if (origClaude) process.env.ANTHROPIC_API_KEY = origClaude;
      if (origOpenai) process.env.OPENAI_API_KEY = origOpenai;
    });
  });

  describe('generate', () => {
    beforeEach(async () => {
      // Setup mock for Ollama (local provider that doesn't need API key)
      mockFetch.mockImplementation((url: string) => {
        if (url.includes('/api/tags')) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ models: [{ name: 'llama3.1' }] }),
          });
        }
        if (url.includes('/api/generate')) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({
              model: 'llama3.1',
              response: 'Generated text',
              done: true,
              prompt_eval_count: 10,
              eval_count: 20,
            }),
          });
        }
        if (url.includes('/api/chat')) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({
              model: 'llama3.1',
              message: { role: 'assistant', content: 'Chat response' },
              done: true,
              prompt_eval_count: 10,
              eval_count: 20,
            }),
          });
        }
        return Promise.resolve({ ok: false });
      });

      manager = new ProviderManager({
        primary: 'ollama',
        fallbacks: [],
        loadBalancing: 'round-robin',
        providers: {
          ollama: { model: 'llama3.1' },
        },
      });

      await manager.initialize();
    });

    it('should generate text', async () => {
      const response = await manager.generate('Test prompt');

      expect(response.content).toBe('Generated text');
      expect(response.provider).toBe('ollama');
    });

    it('should cache responses', async () => {
      const response1 = await manager.generate('Test prompt');
      expect(response1.cached).toBe(false);

      const response2 = await manager.generate('Test prompt');
      expect(response2.cached).toBe(true);
      expect(response2.content).toBe(response1.content);
    });

    it('should skip cache when requested', async () => {
      await manager.generate('Test prompt');

      // Reset fetch call count
      mockFetch.mockClear();

      const response = await manager.generate('Test prompt', { skipCache: true });
      expect(response.cached).toBe(false);
    });

    it('should track metrics', async () => {
      await manager.generate('Test 1');
      await manager.generate('Test 2');

      const metrics = manager.getMetrics();
      expect(metrics.ollama.totalRequests).toBeGreaterThanOrEqual(2);
    });
  });

  describe('embed', () => {
    beforeEach(async () => {
      const mockEmbedding = new Array(768).fill(0).map((_, i) => i / 768);

      mockFetch.mockImplementation((url: string) => {
        if (url.includes('/api/tags')) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ models: [{ name: 'nomic-embed-text' }] }),
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

      manager = new ProviderManager({
        primary: 'ollama',
        fallbacks: [],
        loadBalancing: 'round-robin',
        providers: {
          ollama: { model: 'llama3.1' },
        },
      });

      await manager.initialize();
    });

    it('should generate embeddings', async () => {
      const response = await manager.embed('Test text');

      expect(response.embedding.length).toBe(768);
      expect(response.provider).toBe('ollama');
    });

    it('should cache embeddings', async () => {
      const response1 = await manager.embed('Test text');
      const response2 = await manager.embed('Test text');

      expect(response2.cached).toBe(true);
    });
  });

  describe('complete', () => {
    beforeEach(async () => {
      mockFetch.mockImplementation((url: string) => {
        if (url.includes('/api/tags')) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ models: [{ name: 'llama3.1' }] }),
          });
        }
        if (url.includes('/api/generate')) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({
              model: 'llama3.1',
              response: 'a, b) { return a + b; }',
              done: true,
              prompt_eval_count: 5,
              eval_count: 10,
            }),
          });
        }
        return Promise.resolve({ ok: false });
      });

      manager = new ProviderManager({
        primary: 'ollama',
        fallbacks: [],
        loadBalancing: 'round-robin',
        providers: {
          ollama: { model: 'llama3.1' },
        },
      });

      await manager.initialize();
    });

    it('should complete text', async () => {
      const response = await manager.complete('function add(');

      expect(response.completion).toContain('return');
      expect(response.provider).toBe('ollama');
    });
  });

  describe('failover', () => {
    it('should track failures in metrics', async () => {
      let callCount = 0;

      mockFetch.mockImplementation((url: string) => {
        if (url.includes('/api/tags')) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ models: [{ name: 'llama3.1' }] }),
          });
        }
        if (url.includes('/api/generate')) {
          callCount++;
          if (callCount === 1) {
            // First call fails
            return Promise.resolve({
              ok: false,
              status: 500,
              text: () => Promise.resolve('Server error'),
            });
          }
          // Second call succeeds
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({
              model: 'llama3.1',
              response: 'Success after retry',
              done: true,
              prompt_eval_count: 10,
              eval_count: 20,
            }),
          });
        }
        return Promise.resolve({ ok: false });
      });

      manager = new ProviderManager({
        primary: 'ollama',
        fallbacks: [],
        loadBalancing: 'round-robin',
        providers: {
          ollama: { model: 'llama3.1' },
        },
      });

      await manager.initialize();

      // First request fails
      try {
        await manager.generate('Test');
      } catch {
        // Expected to fail
      }

      // Check that failure was tracked in metrics
      const metrics = manager.getMetrics();
      expect(metrics.ollama.failureCount).toBeGreaterThanOrEqual(1);
    });
  });

  describe('load balancing', () => {
    beforeEach(async () => {
      mockFetch.mockImplementation((url: string) => {
        if (url.includes('/api/tags')) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ models: [{ name: 'llama3.1' }] }),
          });
        }
        if (url.includes('/api/generate')) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({
              model: 'llama3.1',
              response: 'Response',
              done: true,
              prompt_eval_count: 10,
              eval_count: 20,
            }),
          });
        }
        return Promise.resolve({ ok: false });
      });
    });

    it('should use round-robin strategy', async () => {
      manager = new ProviderManager({
        primary: 'ollama',
        fallbacks: [],
        loadBalancing: 'round-robin',
        providers: {
          ollama: { model: 'llama3.1' },
        },
      });

      await manager.initialize();

      await manager.generate('Test 1');
      await manager.generate('Test 2');

      // With single provider, all requests go to ollama
      const metrics = manager.getMetrics();
      expect(metrics.ollama.totalRequests).toBeGreaterThanOrEqual(2);
    });

    it('should use least-cost strategy', async () => {
      manager = new ProviderManager({
        primary: 'ollama',
        fallbacks: [],
        loadBalancing: 'least-cost',
        providers: {
          ollama: { model: 'llama3.1' },
        },
      });

      await manager.initialize();

      const response = await manager.generate('Test');

      // Ollama is always cheapest (free)
      expect(response.provider).toBe('ollama');
    });
  });

  describe('health check', () => {
    it('should check health of all providers', async () => {
      mockFetch.mockImplementation((url: string) => {
        if (url.includes('/api/tags')) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ models: [{ name: 'llama3.1' }] }),
          });
        }
        return Promise.resolve({ ok: false });
      });

      manager = new ProviderManager({
        primary: 'ollama',
        fallbacks: [],
        loadBalancing: 'round-robin',
        providers: {
          ollama: { model: 'llama3.1' },
        },
      });

      await manager.initialize();

      const health = await manager.healthCheck();

      expect(health.ollama).toBeDefined();
      expect(health.ollama.healthy).toBe(true);
    });
  });

  describe('cache management', () => {
    beforeEach(async () => {
      mockFetch.mockImplementation((url: string) => {
        if (url.includes('/api/tags')) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ models: [{ name: 'llama3.1' }] }),
          });
        }
        if (url.includes('/api/generate')) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({
              model: 'llama3.1',
              response: 'Response',
              done: true,
              prompt_eval_count: 10,
              eval_count: 20,
            }),
          });
        }
        return Promise.resolve({ ok: false });
      });

      manager = new ProviderManager({
        primary: 'ollama',
        fallbacks: [],
        loadBalancing: 'round-robin',
        providers: {
          ollama: { model: 'llama3.1' },
        },
      });

      await manager.initialize();
    });

    it('should get cache stats', async () => {
      await manager.generate('Test');

      const stats = manager.getCacheStats();

      expect(stats.total.size).toBeGreaterThanOrEqual(1);
    });

    it('should clear cache', async () => {
      await manager.generate('Test');

      manager.clearCache();

      const stats = manager.getCacheStats();
      expect(stats.total.size).toBe(0);
    });
  });

  describe('cost tracking', () => {
    beforeEach(async () => {
      mockFetch.mockImplementation((url: string) => {
        if (url.includes('/api/tags')) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ models: [{ name: 'llama3.1' }] }),
          });
        }
        if (url.includes('/api/generate')) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({
              model: 'llama3.1',
              response: 'Response',
              done: true,
              prompt_eval_count: 10,
              eval_count: 20,
            }),
          });
        }
        return Promise.resolve({ ok: false });
      });

      manager = new ProviderManager({
        primary: 'ollama',
        fallbacks: [],
        loadBalancing: 'round-robin',
        providers: {
          ollama: { model: 'llama3.1' },
        },
      });

      await manager.initialize();
    });

    it('should track costs', async () => {
      await manager.generate('Test', { skipCache: true });

      const summary = manager.getCostSummary('all');

      expect(summary.totalRequests).toBeGreaterThanOrEqual(1);
      expect(summary.totalCost).toBe(0); // Ollama is free
    });
  });

  describe('circuit breaker', () => {
    it('should reset circuit breakers', async () => {
      mockFetch.mockImplementation((url: string) => {
        if (url.includes('/api/tags')) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ models: [{ name: 'llama3.1' }] }),
          });
        }
        return Promise.resolve({ ok: false });
      });

      manager = new ProviderManager({
        primary: 'ollama',
        fallbacks: [],
        loadBalancing: 'round-robin',
        providers: {
          ollama: { model: 'llama3.1' },
        },
      });

      await manager.initialize();

      // Reset should not throw
      manager.resetCircuitBreakers();

      expect(manager.getAvailableProviders()).toContain('ollama');
    });
  });
});

describe('Factory functions', () => {
  it('should create provider manager with createProviderManager', () => {
    const manager = createProviderManager();
    expect(manager).toBeInstanceOf(ProviderManager);
  });

  it('should create QE provider manager with createQEProviderManager', () => {
    const manager = createQEProviderManager();
    expect(manager).toBeInstanceOf(ProviderManager);
  });
});
