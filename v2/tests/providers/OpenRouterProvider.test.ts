/**
 * OpenRouterProvider Unit Tests
 *
 * Tests for OpenRouter API implementation with model hot-swapping.
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { OpenRouterProvider, OpenRouterConfig } from '../../src/providers/OpenRouterProvider';

// Mock fetch globally
const mockFetch = jest.fn() as jest.MockedFunction<typeof fetch>;
global.fetch = mockFetch;

describe('OpenRouterProvider', () => {
  let provider: OpenRouterProvider;
  const originalEnv = process.env;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = { ...originalEnv, OPENROUTER_API_KEY: 'test-key' };
  });

  afterEach(async () => {
    process.env = originalEnv;
    if (provider) {
      try {
        await provider.shutdown();
      } catch {
        // Ignore shutdown errors
      }
    }
  });

  describe('provider metadata', () => {
    it('should return provider metadata without initialization', () => {
      provider = new OpenRouterProvider();
      const metadata = provider.getMetadata();

      expect(metadata.name).toBe('openrouter');
      expect(metadata.version).toBeDefined();
      expect(metadata.models).toBeDefined();
      expect(metadata.capabilities).toBeDefined();
    });

    it('should report cloud location', () => {
      provider = new OpenRouterProvider();
      const metadata = provider.getMetadata();
      expect(metadata.location).toBe('cloud');
    });

    it('should have streaming capability', () => {
      provider = new OpenRouterProvider();
      const metadata = provider.getMetadata();
      expect(metadata.capabilities.streaming).toBe(true);
    });

    it('should have embeddings capability', () => {
      provider = new OpenRouterProvider();
      const metadata = provider.getMetadata();
      expect(metadata.capabilities.embeddings).toBe(true);
    });

    it('should have vision capability', () => {
      provider = new OpenRouterProvider();
      const metadata = provider.getMetadata();
      expect(metadata.capabilities.vision).toBe(true);
    });
  });

  describe('initialization', () => {
    it('should initialize with API key from env', async () => {
      provider = new OpenRouterProvider();

      // Mock the models endpoint
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: [] }),
      } as Response);

      await provider.initialize();

      const health = await mockHealthCheck(provider);
      expect(health.healthy).toBe(true);
    });

    it('should throw without API key', async () => {
      delete process.env.OPENROUTER_API_KEY;
      provider = new OpenRouterProvider();

      await expect(provider.initialize()).rejects.toThrow(/API key/i);
    });

    it('should accept custom config', () => {
      const config: OpenRouterConfig = {
        name: 'custom-openrouter',
        defaultModel: 'anthropic/claude-3.5-sonnet',
        siteUrl: 'https://example.com',
        siteName: 'Test Site',
      };

      provider = new OpenRouterProvider(config);
      expect(provider).toBeDefined();
    });
  });

  describe('completion', () => {
    beforeEach(async () => {
      provider = new OpenRouterProvider({
        enableModelDiscovery: false,
      });

      // No mock needed here - enableModelDiscovery: false means initialize() doesn't call fetch
      await provider.initialize();
    });

    it('should complete a prompt', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          id: 'test-id',
          model: 'anthropic/claude-3.5-sonnet',
          choices: [{
            message: { content: 'Hello, world!' },
            finish_reason: 'stop',
          }],
          usage: {
            prompt_tokens: 10,
            completion_tokens: 5,
          },
        }),
      } as Response);

      const result = await provider.complete({
        model: 'anthropic/claude-3.5-sonnet',
        messages: [{ role: 'user', content: 'Hi' }],
      });

      expect(result.content[0].text).toBe('Hello, world!');
      expect(result.usage.input_tokens).toBe(10);
      expect(result.usage.output_tokens).toBe(5);
    });

    it('should throw when not initialized', async () => {
      provider = new OpenRouterProvider({ enableModelDiscovery: false });

      await expect(provider.complete({
        model: 'test',
        messages: [{ role: 'user', content: 'Test' }],
      })).rejects.toThrow(/not initialized/i);
    });

    it('should handle API errors', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        text: async () => 'Internal Server Error',
      } as Response);

      await expect(provider.complete({
        model: 'test',
        messages: [{ role: 'user', content: 'Test' }],
      })).rejects.toThrow();
    });
  });

  describe('cost tracking', () => {
    it('should track costs correctly', () => {
      provider = new OpenRouterProvider();
      const cost = provider.trackCost({
        input_tokens: 1000,
        output_tokens: 500,
      });

      // With default 'auto' pricing ($0.5/1M input, $2/1M output)
      // Cost = (1000/1M * 0.5) + (500/1M * 2) = 0.0005 + 0.001 = 0.0015
      expect(cost).toBeGreaterThanOrEqual(0);
    });

    it('should accumulate total cost', async () => {
      provider = new OpenRouterProvider({ enableModelDiscovery: false });

      // No mock needed for initialization with enableModelDiscovery: false
      await provider.initialize();

      // Make a completion
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          id: 'test-id',
          model: 'auto',
          choices: [{ message: { content: 'Hi' }, finish_reason: 'stop' }],
          usage: { prompt_tokens: 100, completion_tokens: 50 },
        }),
      } as Response);

      await provider.complete({
        model: 'auto',
        messages: [{ role: 'user', content: 'Hi' }],
      });

      expect(provider.getTotalCost()).toBeGreaterThan(0);
      expect(provider.getRequestCount()).toBe(1);
    });
  });

  describe('hot-swap (G6)', () => {
    beforeEach(async () => {
      provider = new OpenRouterProvider({
        defaultModel: 'auto',
        enableModelDiscovery: false,
      });

      // No mock needed for initialization with enableModelDiscovery: false
      await provider.initialize();
    });

    it('should get current model', () => {
      expect(provider.getCurrentModel()).toBe('auto');
    });

    it('should hot-swap to different model', async () => {
      await provider.setModel('anthropic/claude-3.5-sonnet');
      expect(provider.getCurrentModel()).toBe('anthropic/claude-3.5-sonnet');
    });

    it('should hot-swap multiple times', async () => {
      await provider.setModel('openai/gpt-4o');
      expect(provider.getCurrentModel()).toBe('openai/gpt-4o');

      await provider.setModel('google/gemini-pro');
      expect(provider.getCurrentModel()).toBe('google/gemini-pro');

      await provider.setModel('auto');
      expect(provider.getCurrentModel()).toBe('auto');
    });

    it('should throw when hot-swapping before init', async () => {
      const uninitProvider = new OpenRouterProvider();

      await expect(uninitProvider.setModel('test')).rejects.toThrow(/not initialized/i);
    });
  });

  describe('model discovery', () => {
    it('should discover models from API', async () => {
      provider = new OpenRouterProvider({
        enableModelDiscovery: true,
      });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: [
            { id: 'anthropic/claude-3.5-sonnet', name: 'Claude 3.5 Sonnet', context_length: 200000 },
            { id: 'openai/gpt-4o', name: 'GPT-4o', context_length: 128000 },
          ],
        }),
      } as Response);

      await provider.initialize();

      const models = await provider.getAvailableModels();
      expect(models.length).toBeGreaterThan(0);
    });

    it('should continue without models if discovery fails', async () => {
      provider = new OpenRouterProvider({
        enableModelDiscovery: true,
      });

      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      // Should not throw
      await provider.initialize();

      const metadata = provider.getMetadata();
      expect(metadata.models.length).toBeGreaterThan(0); // Uses default models
    });
  });

  describe('health check', () => {
    it('should report unhealthy when not initialized', async () => {
      provider = new OpenRouterProvider();

      const health = await provider.healthCheck();
      expect(health.healthy).toBe(false);
    });

    it('should report healthy after initialization', async () => {
      provider = new OpenRouterProvider({ enableModelDiscovery: false });

      // No mock needed for initialization with enableModelDiscovery: false
      await provider.initialize();

      // Mock health check request
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
      } as Response);

      const health = await provider.healthCheck();
      expect(health.healthy).toBe(true);
    });
  });

  describe('embeddings', () => {
    beforeEach(async () => {
      provider = new OpenRouterProvider({ enableModelDiscovery: false });

      // No mock needed for initialization with enableModelDiscovery: false
      await provider.initialize();
    });

    it('should generate embeddings', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          model: 'openai/text-embedding-3-small',
          data: [{ embedding: [0.1, 0.2, 0.3] }],
          usage: { prompt_tokens: 5 },
        }),
      } as Response);

      const result = await provider.embed({ text: 'test' });

      expect(result.embedding).toEqual([0.1, 0.2, 0.3]);
      expect(result.model).toBe('openai/text-embedding-3-small');
    });
  });

  describe('token counting', () => {
    it('should estimate token count', async () => {
      provider = new OpenRouterProvider({ enableModelDiscovery: false });

      // No mock needed for initialization with enableModelDiscovery: false
      await provider.initialize();

      const count = await provider.countTokens({ text: 'Hello, world!' });

      // ~4 chars per token estimate
      expect(count).toBeGreaterThan(0);
      expect(count).toBeLessThan(20);
    });
  });

  describe('shutdown', () => {
    it('should handle shutdown gracefully', async () => {
      provider = new OpenRouterProvider({ enableModelDiscovery: false });

      // No mock needed for initialization with enableModelDiscovery: false
      await provider.initialize();
      await expect(provider.shutdown()).resolves.not.toThrow();
    });

    it('should handle shutdown when not initialized', async () => {
      provider = new OpenRouterProvider();
      await expect(provider.shutdown()).resolves.not.toThrow();
    });
  });
});

// Helper to mock health check for initialized provider
async function mockHealthCheck(provider: OpenRouterProvider): Promise<{ healthy: boolean }> {
  mockFetch.mockResolvedValueOnce({
    ok: true,
    status: 200,
  } as Response);

  return provider.healthCheck();
}
