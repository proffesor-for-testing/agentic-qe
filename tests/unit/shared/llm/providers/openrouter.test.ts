/**
 * Agentic QE v3 - OpenRouter Provider Unit Tests
 * ADR-043: Multi-Provider LLM Support Milestone 1
 *
 * Tests for the OpenRouter provider implementation including:
 * - Configuration and initialization
 * - Chat completion
 * - Streaming
 * - Tool calling
 * - Error handling
 * - Cost calculation
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import {
  OpenRouterProvider,
  DEFAULT_OPENROUTER_CONFIG,
  OPENROUTER_PRICING,
} from '../../../../../src/shared/llm/providers/openrouter';

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch;

describe('OpenRouterProvider', () => {
  let provider: OpenRouterProvider;

  beforeEach(() => {
    vi.clearAllMocks();
    provider = new OpenRouterProvider({
      apiKey: 'test-openrouter-api-key',
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ==========================================================================
  // Configuration Tests
  // ==========================================================================

  describe('configuration', () => {
    it('should use default config', () => {
      const config = provider.getConfig();
      expect(config.model).toBe(DEFAULT_OPENROUTER_CONFIG.model);
      expect(config.maxTokens).toBe(DEFAULT_OPENROUTER_CONFIG.maxTokens);
      expect(config.baseUrl).toBe('https://openrouter.ai/api/v1');
    });

    it('should merge custom config', () => {
      const customProvider = new OpenRouterProvider({
        model: 'openai/gpt-4o',
        maxTokens: 8192,
        temperature: 0.5,
        siteUrl: 'https://example.com',
        siteName: 'Example App',
      });

      const config = customProvider.getConfig();
      expect(config.model).toBe('openai/gpt-4o');
      expect(config.maxTokens).toBe(8192);
      expect(config.temperature).toBe(0.5);
      expect(config.siteUrl).toBe('https://example.com');
      expect(config.siteName).toBe('Example App');
    });

    it('should return supported models', () => {
      const models = provider.getSupportedModels();
      expect(models).toContain('anthropic/claude-3.5-sonnet');
      expect(models).toContain('openai/gpt-4o');
      expect(models).toContain('meta-llama/llama-3.1-70b-instruct');
      expect(models.length).toBeGreaterThan(5);
    });

    it('should return cost per token', () => {
      const cost = provider.getCostPerToken();
      expect(cost.input).toBeGreaterThan(0);
      expect(cost.output).toBeGreaterThan(0);
    });

    it('should have correct provider type and name', () => {
      expect(provider.type).toBe('openai'); // Compatible with OpenAI interface
      expect(provider.name).toBe('OpenRouter');
    });
  });

  // ==========================================================================
  // Availability Tests
  // ==========================================================================

  describe('availability check', () => {
    it('should return false without API key', async () => {
      const noKeyProvider = new OpenRouterProvider({ apiKey: undefined });

      // Clear the environment variable for this test
      const originalKey = process.env.OPENROUTER_API_KEY;
      delete process.env.OPENROUTER_API_KEY;

      const available = await noKeyProvider.isAvailable();
      expect(available).toBe(false);

      // Restore
      if (originalKey) process.env.OPENROUTER_API_KEY = originalKey;
    });

    it('should return true when API is available', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            data: [
              { id: 'anthropic/claude-3.5-sonnet', name: 'Claude 3.5 Sonnet' },
              { id: 'openai/gpt-4o', name: 'GPT-4o' },
            ],
          }),
      });

      const available = await provider.isAvailable();
      expect(available).toBe(true);
    });
  });

  // ==========================================================================
  // Health Check Tests
  // ==========================================================================

  describe('health check', () => {
    it('should return healthy when API responds with models', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            data: [
              { id: 'anthropic/claude-3.5-sonnet', name: 'Claude 3.5 Sonnet' },
              { id: 'openai/gpt-4o', name: 'GPT-4o' },
              { id: 'meta-llama/llama-3.1-70b-instruct', name: 'Llama 3.1 70B' },
            ],
          }),
      });

      const result = await provider.healthCheck();

      expect(result.healthy).toBe(true);
      expect(result.latencyMs).toBeDefined();
      expect(result.models).toContain('anthropic/claude-3.5-sonnet');
      expect(result.details?.totalModels).toBe(3);
    });

    it('should return unhealthy when API key is missing', async () => {
      const noKeyProvider = new OpenRouterProvider({ apiKey: undefined });
      const originalKey = process.env.OPENROUTER_API_KEY;
      delete process.env.OPENROUTER_API_KEY;

      const result = await noKeyProvider.healthCheck();

      expect(result.healthy).toBe(false);
      expect(result.error).toContain('API key not configured');

      if (originalKey) process.env.OPENROUTER_API_KEY = originalKey;
    });

    it('should return unhealthy on API error', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        text: () => Promise.resolve('Unauthorized'),
      });

      const result = await provider.healthCheck();

      expect(result.healthy).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('should return unhealthy on network error', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      const result = await provider.healthCheck();

      expect(result.healthy).toBe(false);
      expect(result.error).toContain('Network error');
    });
  });

  // ==========================================================================
  // Generate (Chat Completion) Tests
  // ==========================================================================

  describe('generate', () => {
    it('should generate text from string prompt', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            id: 'chatcmpl-test',
            object: 'chat.completion',
            model: 'anthropic/claude-3.5-sonnet',
            choices: [
              {
                index: 0,
                message: { role: 'assistant', content: 'OpenRouter response' },
                finish_reason: 'stop',
              },
            ],
            usage: {
              prompt_tokens: 10,
              completion_tokens: 20,
              total_tokens: 30,
            },
          }),
      });

      const response = await provider.generate('Test prompt');

      expect(response.content).toBe('OpenRouter response');
      expect(response.provider).toBe('openai');
      expect(response.usage.promptTokens).toBe(10);
      expect(response.usage.completionTokens).toBe(20);
      expect(response.cost.totalCost).toBeGreaterThan(0);
      expect(response.finishReason).toBe('stop');
    });

    it('should generate text from message array', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            id: 'chatcmpl-test',
            object: 'chat.completion',
            model: 'anthropic/claude-3.5-sonnet',
            choices: [
              {
                index: 0,
                message: { role: 'assistant', content: 'Multi-turn response' },
                finish_reason: 'stop',
              },
            ],
            usage: {
              prompt_tokens: 25,
              completion_tokens: 15,
              total_tokens: 40,
            },
          }),
      });

      const response = await provider.generate([
        { role: 'user', content: 'Hello' },
        { role: 'assistant', content: 'Hi there!' },
        { role: 'user', content: 'How are you?' },
      ]);

      expect(response.content).toBe('Multi-turn response');
    });

    it('should include system prompt', async () => {
      mockFetch.mockImplementationOnce((url, options) => {
        const body = JSON.parse(options.body as string);
        expect(body.messages[0].role).toBe('system');
        expect(body.messages[0].content).toBe('You are a helpful assistant');

        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              id: 'chatcmpl-test',
              object: 'chat.completion',
              model: 'anthropic/claude-3.5-sonnet',
              choices: [
                {
                  index: 0,
                  message: { role: 'assistant', content: 'Response' },
                  finish_reason: 'stop',
                },
              ],
              usage: { prompt_tokens: 15, completion_tokens: 10, total_tokens: 25 },
            }),
        });
      });

      await provider.generate('Test', {
        systemPrompt: 'You are a helpful assistant',
      });
    });

    it('should use custom model', async () => {
      mockFetch.mockImplementationOnce((url, options) => {
        const body = JSON.parse(options.body as string);
        expect(body.model).toBe('openai/gpt-4o');

        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              id: 'chatcmpl-test',
              object: 'chat.completion',
              model: 'openai/gpt-4o',
              choices: [
                {
                  index: 0,
                  message: { role: 'assistant', content: 'GPT-4o response' },
                  finish_reason: 'stop',
                },
              ],
              usage: { prompt_tokens: 10, completion_tokens: 10, total_tokens: 20 },
            }),
        });
      });

      const response = await provider.generate('Test', {
        model: 'openai/gpt-4o',
      });

      expect(response.model).toBe('openai/gpt-4o');
    });

    it('should throw API_KEY_MISSING error without API key', async () => {
      const noKeyProvider = new OpenRouterProvider({ apiKey: undefined });
      const originalKey = process.env.OPENROUTER_API_KEY;
      delete process.env.OPENROUTER_API_KEY;

      await expect(noKeyProvider.generate('Test')).rejects.toMatchObject({
        code: 'API_KEY_MISSING',
        retryable: false,
      });

      if (originalKey) process.env.OPENROUTER_API_KEY = originalKey;
    });
  });

  // ==========================================================================
  // Error Handling Tests
  // ==========================================================================

  describe('error handling', () => {
    it('should handle rate limiting (429)', async () => {
      // Mock all retries to return 429
      mockFetch.mockResolvedValue({
        ok: false,
        status: 429,
        json: () =>
          Promise.resolve({
            error: { type: 'rate_limit_error', message: 'Rate limited', code: 429 },
          }),
      });

      // Create a provider with no retries for this test
      const noRetryProvider = new OpenRouterProvider({
        apiKey: 'test-key',
        maxRetries: 1,
      });

      await expect(noRetryProvider.generate('Test')).rejects.toMatchObject({
        code: 'RATE_LIMITED',
        retryable: true,
      });
    });

    it('should handle invalid API key (401)', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        json: () =>
          Promise.resolve({
            error: { type: 'authentication_error', message: 'Invalid API key', code: 401 },
          }),
      });

      await expect(provider.generate('Test')).rejects.toMatchObject({
        code: 'API_KEY_INVALID',
        retryable: false,
      });
    });

    it('should handle payment required (402)', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 402,
        json: () =>
          Promise.resolve({
            error: { type: 'payment_error', message: 'Insufficient credits', code: 402 },
          }),
      });

      await expect(provider.generate('Test')).rejects.toMatchObject({
        code: 'COST_LIMIT_EXCEEDED',
        retryable: false,
      });
    });

    it('should handle model not found (404)', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        json: () =>
          Promise.resolve({
            error: { type: 'not_found', message: 'Model not found', code: 404 },
          }),
      });

      await expect(provider.generate('Test', { model: 'nonexistent/model' })).rejects.toMatchObject({
        code: 'MODEL_NOT_FOUND',
        retryable: false,
      });
    });

    it('should handle context length exceeded', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 400,
        json: () =>
          Promise.resolve({
            error: {
              type: 'invalid_request_error',
              message: 'context_length_exceeded',
              code: 'context_length_exceeded',
            },
          }),
      });

      await expect(provider.generate('Test')).rejects.toMatchObject({
        code: 'CONTEXT_LENGTH_EXCEEDED',
        retryable: false,
      });
    });

    it('should handle server errors (500, 502, 503)', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 503,
        json: () =>
          Promise.resolve({
            error: { type: 'server_error', message: 'Service unavailable', code: 503 },
          }),
      });

      const noRetryProvider = new OpenRouterProvider({
        apiKey: 'test-key',
        maxRetries: 1,
      });

      await expect(noRetryProvider.generate('Test')).rejects.toMatchObject({
        code: 'PROVIDER_UNAVAILABLE',
        retryable: true,
      });
    });

    it('should handle network errors', async () => {
      mockFetch.mockRejectedValue(new Error('Network connection failed'));

      const noRetryProvider = new OpenRouterProvider({
        apiKey: 'test-key',
        maxRetries: 1,
      });

      await expect(noRetryProvider.generate('Test')).rejects.toMatchObject({
        code: 'NETWORK_ERROR',
        retryable: true,
      });
    });
  });

  // ==========================================================================
  // Cost Calculation Tests
  // ==========================================================================

  describe('cost calculation', () => {
    it('should calculate cost for anthropic/claude-3.5-sonnet', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            id: 'chatcmpl-test',
            object: 'chat.completion',
            model: 'anthropic/claude-3.5-sonnet',
            choices: [
              {
                index: 0,
                message: { role: 'assistant', content: 'Response' },
                finish_reason: 'stop',
              },
            ],
            usage: {
              prompt_tokens: 1000,
              completion_tokens: 500,
              total_tokens: 1500,
            },
          }),
      });

      const response = await provider.generate('Test');

      // Cost: (1000/1M * 3.0) + (500/1M * 15.0) = 0.003 + 0.0075 = 0.0105
      expect(response.cost.inputCost).toBeCloseTo(0.003, 6);
      expect(response.cost.outputCost).toBeCloseTo(0.0075, 6);
      expect(response.cost.totalCost).toBeCloseTo(0.0105, 6);
      expect(response.cost.currency).toBe('USD');
    });

    it('should calculate cost for openai/gpt-4o', async () => {
      const gpt4Provider = new OpenRouterProvider({
        apiKey: 'test-key',
        model: 'openai/gpt-4o',
      });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            id: 'chatcmpl-test',
            object: 'chat.completion',
            model: 'openai/gpt-4o',
            choices: [
              {
                index: 0,
                message: { role: 'assistant', content: 'Response' },
                finish_reason: 'stop',
              },
            ],
            usage: {
              prompt_tokens: 1000,
              completion_tokens: 500,
              total_tokens: 1500,
            },
          }),
      });

      const response = await gpt4Provider.generate('Test');

      // Cost: (1000/1M * 5.0) + (500/1M * 15.0) = 0.005 + 0.0075 = 0.0125
      expect(response.cost.inputCost).toBeCloseTo(0.005, 6);
      expect(response.cost.outputCost).toBeCloseTo(0.0075, 6);
      expect(response.cost.totalCost).toBeCloseTo(0.0125, 6);
    });

    it('should use default pricing for unknown models', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            id: 'chatcmpl-test',
            object: 'chat.completion',
            model: 'unknown/model',
            choices: [
              {
                index: 0,
                message: { role: 'assistant', content: 'Response' },
                finish_reason: 'stop',
              },
            ],
            usage: {
              prompt_tokens: 1000,
              completion_tokens: 500,
              total_tokens: 1500,
            },
          }),
      });

      const response = await provider.generate('Test', { model: 'unknown/model' });

      // Default cost: (1000/1M * 1.0) + (500/1M * 3.0) = 0.001 + 0.0015 = 0.0025
      expect(response.cost.inputCost).toBeCloseTo(0.001, 6);
      expect(response.cost.outputCost).toBeCloseTo(0.0015, 6);
      expect(response.cost.totalCost).toBeCloseTo(0.0025, 6);
    });

    it('should have correct pricing for all defined models', () => {
      expect(OPENROUTER_PRICING['anthropic/claude-3.5-sonnet']).toBeDefined();
      expect(OPENROUTER_PRICING['openai/gpt-4o']).toBeDefined();
      expect(OPENROUTER_PRICING['meta-llama/llama-3.1-70b-instruct']).toBeDefined();
      expect(OPENROUTER_PRICING['default']).toBeDefined();
    });
  });

  // ==========================================================================
  // Embedding Tests
  // ==========================================================================

  describe('embed', () => {
    it('should generate embeddings', async () => {
      const mockEmbedding = new Array(1536).fill(0).map((_, i) => i / 1536);

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            object: 'list',
            data: [{ object: 'embedding', index: 0, embedding: mockEmbedding }],
            model: 'openai/text-embedding-3-small',
            usage: { prompt_tokens: 5, total_tokens: 5 },
          }),
      });

      const response = await provider.embed('Test text');

      expect(response.embedding).toEqual(mockEmbedding);
      expect(response.provider).toBe('openai');
      expect(response.tokenCount).toBe(5);
    });

    it('should throw API_KEY_MISSING for embeddings without key', async () => {
      const noKeyProvider = new OpenRouterProvider({ apiKey: undefined });
      const originalKey = process.env.OPENROUTER_API_KEY;
      delete process.env.OPENROUTER_API_KEY;

      await expect(noKeyProvider.embed('test')).rejects.toMatchObject({
        code: 'API_KEY_MISSING',
      });

      if (originalKey) process.env.OPENROUTER_API_KEY = originalKey;
    });
  });

  // ==========================================================================
  // Completion Tests
  // ==========================================================================

  describe('complete', () => {
    it('should complete text using generate', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            id: 'chatcmpl-test',
            object: 'chat.completion',
            model: 'anthropic/claude-3.5-sonnet',
            choices: [
              {
                index: 0,
                message: { role: 'assistant', content: 'a, b) { return a + b; }' },
                finish_reason: 'stop',
              },
            ],
            usage: { prompt_tokens: 5, completion_tokens: 10, total_tokens: 15 },
          }),
      });

      const response = await provider.complete('function add(');

      expect(response.completion).toBe('a, b) { return a + b; }');
      expect(response.provider).toBe('openai');
    });

    it('should use low temperature for completion', async () => {
      mockFetch.mockImplementationOnce((url, options) => {
        const body = JSON.parse(options.body as string);
        expect(body.temperature).toBe(0.2); // Low for completion

        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              id: 'chatcmpl-test',
              object: 'chat.completion',
              model: 'anthropic/claude-3.5-sonnet',
              choices: [
                {
                  index: 0,
                  message: { role: 'assistant', content: 'completed' },
                  finish_reason: 'stop',
                },
              ],
              usage: { prompt_tokens: 5, completion_tokens: 5, total_tokens: 10 },
            }),
        });
      });

      await provider.complete('const x =');
    });
  });

  // ==========================================================================
  // OpenRouter-Specific Feature Tests
  // ==========================================================================

  describe('OpenRouter-specific features', () => {
    it('should include HTTP-Referer header when siteUrl is set', async () => {
      const providerWithSite = new OpenRouterProvider({
        apiKey: 'test-key',
        siteUrl: 'https://myapp.com',
        siteName: 'My App',
      });

      mockFetch.mockImplementationOnce((url, options) => {
        expect(options.headers['HTTP-Referer']).toBe('https://myapp.com');
        expect(options.headers['X-Title']).toBe('My App');

        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              id: 'chatcmpl-test',
              object: 'chat.completion',
              model: 'anthropic/claude-3.5-sonnet',
              choices: [
                {
                  index: 0,
                  message: { role: 'assistant', content: 'Response' },
                  finish_reason: 'stop',
                },
              ],
              usage: { prompt_tokens: 5, completion_tokens: 5, total_tokens: 10 },
            }),
        });
      });

      await providerWithSite.generate('Test');
    });

    it('should cache models from health check', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            data: [
              { id: 'model-1', name: 'Model 1' },
              { id: 'model-2', name: 'Model 2' },
            ],
          }),
      });

      await provider.healthCheck();

      // After health check, getSupportedModels should return cached models
      const models = provider.getSupportedModels();
      expect(models).toContain('model-1');
      expect(models).toContain('model-2');
    });

    it('should dispose and clear cached models', async () => {
      // First, populate the cache
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            data: [{ id: 'cached-model', name: 'Cached Model' }],
          }),
      });

      await provider.healthCheck();
      expect(provider.getSupportedModels()).toContain('cached-model');

      // Dispose should clear the cache
      await provider.dispose();

      // After dispose, should return default models
      const models = provider.getSupportedModels();
      expect(models).not.toContain('cached-model');
      expect(models).toContain('anthropic/claude-3.5-sonnet'); // Default model
    });
  });

  // ==========================================================================
  // Request Headers Tests
  // ==========================================================================

  describe('request headers', () => {
    it('should include correct Authorization header', async () => {
      mockFetch.mockImplementationOnce((url, options) => {
        expect(options.headers['Authorization']).toBe('Bearer test-openrouter-api-key');
        expect(options.headers['Content-Type']).toBe('application/json');

        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              id: 'chatcmpl-test',
              object: 'chat.completion',
              model: 'anthropic/claude-3.5-sonnet',
              choices: [
                {
                  index: 0,
                  message: { role: 'assistant', content: 'Response' },
                  finish_reason: 'stop',
                },
              ],
              usage: { prompt_tokens: 5, completion_tokens: 5, total_tokens: 10 },
            }),
        });
      });

      await provider.generate('Test');
    });

    it('should use correct base URL', async () => {
      mockFetch.mockImplementationOnce((url) => {
        expect(url).toBe('https://openrouter.ai/api/v1/chat/completions');

        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              id: 'chatcmpl-test',
              object: 'chat.completion',
              model: 'anthropic/claude-3.5-sonnet',
              choices: [
                {
                  index: 0,
                  message: { role: 'assistant', content: 'Response' },
                  finish_reason: 'stop',
                },
              ],
              usage: { prompt_tokens: 5, completion_tokens: 5, total_tokens: 10 },
            }),
        });
      });

      await provider.generate('Test');
    });
  });

  // ==========================================================================
  // Finish Reason Mapping Tests
  // ==========================================================================

  describe('finish reason mapping', () => {
    it('should map stop to stop', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            id: 'chatcmpl-test',
            object: 'chat.completion',
            model: 'anthropic/claude-3.5-sonnet',
            choices: [
              {
                index: 0,
                message: { role: 'assistant', content: 'Response' },
                finish_reason: 'stop',
              },
            ],
            usage: { prompt_tokens: 5, completion_tokens: 5, total_tokens: 10 },
          }),
      });

      const response = await provider.generate('Test');
      expect(response.finishReason).toBe('stop');
    });

    it('should map length to length', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            id: 'chatcmpl-test',
            object: 'chat.completion',
            model: 'anthropic/claude-3.5-sonnet',
            choices: [
              {
                index: 0,
                message: { role: 'assistant', content: 'Truncated...' },
                finish_reason: 'length',
              },
            ],
            usage: { prompt_tokens: 5, completion_tokens: 4096, total_tokens: 4101 },
          }),
      });

      const response = await provider.generate('Test');
      expect(response.finishReason).toBe('length');
    });

    it('should map content_filter to content_filter', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            id: 'chatcmpl-test',
            object: 'chat.completion',
            model: 'anthropic/claude-3.5-sonnet',
            choices: [
              {
                index: 0,
                message: { role: 'assistant', content: '' },
                finish_reason: 'content_filter',
              },
            ],
            usage: { prompt_tokens: 5, completion_tokens: 0, total_tokens: 5 },
          }),
      });

      const response = await provider.generate('Test');
      expect(response.finishReason).toBe('content_filter');
    });
  });
});
