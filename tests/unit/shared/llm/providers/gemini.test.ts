/**
 * Agentic QE v3 - Gemini Provider Unit Tests
 * ADR-043: Multi-Provider LLM Support Milestone 4
 *
 * Tests for Google Gemini provider implementation
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import {
  GeminiProvider,
  DEFAULT_GEMINI_CONFIG,
  GEMINI_PRICING,
} from '../../../../../src/shared/llm/providers/gemini';

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch;

describe('GeminiProvider', () => {
  let provider: GeminiProvider;

  beforeEach(() => {
    vi.clearAllMocks();
    provider = new GeminiProvider({
      apiKey: 'test-api-key',
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('configuration', () => {
    it('should use default config', () => {
      const config = provider.getConfig();
      expect(config.model).toBe(DEFAULT_GEMINI_CONFIG.model);
      expect(config.maxTokens).toBe(DEFAULT_GEMINI_CONFIG.maxTokens);
      expect(config.temperature).toBe(DEFAULT_GEMINI_CONFIG.temperature);
    });

    it('should merge custom config', () => {
      const customProvider = new GeminiProvider({
        model: 'gemini-ultra',
        maxTokens: 16384,
        temperature: 0.5,
      });

      const config = customProvider.getConfig();
      expect(config.model).toBe('gemini-ultra');
      expect(config.maxTokens).toBe(16384);
      expect(config.temperature).toBe(0.5);
    });

    it('should return provider type as gemini', () => {
      expect(provider.type).toBe('gemini');
    });

    it('should return provider name as Google Gemini', () => {
      expect(provider.name).toBe('Google Gemini');
    });

    it('should return supported models', () => {
      const models = provider.getSupportedModels();
      expect(models).toContain('gemini-pro');
      expect(models).toContain('gemini-1.5-pro');
      expect(models).toContain('gemini-1.5-flash');
      expect(models).toContain('gemini-ultra');
    });

    it('should return cost per token', () => {
      const cost = provider.getCostPerToken();
      expect(cost.input).toBeGreaterThan(0);
      expect(cost.output).toBeGreaterThan(0);
    });

    it('should return default pricing for known model', () => {
      const flashProvider = new GeminiProvider({
        model: 'gemini-1.5-flash',
      });
      const cost = flashProvider.getCostPerToken();
      // gemini-1.5-flash: 0.075 input, 0.3 output per 1M tokens
      expect(cost.input).toBeCloseTo(0.075 / 1_000_000, 12);
      expect(cost.output).toBeCloseTo(0.3 / 1_000_000, 12);
    });
  });

  describe('availability check', () => {
    it('should return false without API key', async () => {
      const noKeyProvider = new GeminiProvider({ apiKey: undefined });

      // Clear environment variables for this test
      const originalGoogleKey = process.env.GOOGLE_AI_API_KEY;
      const originalGeminiKey = process.env.GEMINI_API_KEY;
      delete process.env.GOOGLE_AI_API_KEY;
      delete process.env.GEMINI_API_KEY;

      const available = await noKeyProvider.isAvailable();
      expect(available).toBe(false);

      // Restore
      if (originalGoogleKey) process.env.GOOGLE_AI_API_KEY = originalGoogleKey;
      if (originalGeminiKey) process.env.GEMINI_API_KEY = originalGeminiKey;
    });

    it('should return true when API responds', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            models: [
              {
                name: 'models/gemini-1.5-pro',
                displayName: 'Gemini 1.5 Pro',
                supportedGenerationMethods: ['generateContent'],
              },
            ],
          }),
      });

      const available = await provider.isAvailable();
      expect(available).toBe(true);
    });
  });

  describe('health check', () => {
    it('should return healthy when API responds', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            models: [
              {
                name: 'models/gemini-1.5-pro',
                displayName: 'Gemini 1.5 Pro',
                supportedGenerationMethods: ['generateContent'],
              },
              {
                name: 'models/gemini-1.5-flash',
                displayName: 'Gemini 1.5 Flash',
                supportedGenerationMethods: ['generateContent'],
              },
            ],
          }),
      });

      const result = await provider.healthCheck();

      expect(result.healthy).toBe(true);
      expect(result.latencyMs).toBeDefined();
      expect(result.models).toContain('gemini-1.5-pro');
      expect(result.models).toContain('gemini-1.5-flash');
    });

    it('should return unhealthy without API key', async () => {
      const noKeyProvider = new GeminiProvider({ apiKey: undefined });

      const originalGoogleKey = process.env.GOOGLE_AI_API_KEY;
      const originalGeminiKey = process.env.GEMINI_API_KEY;
      delete process.env.GOOGLE_AI_API_KEY;
      delete process.env.GEMINI_API_KEY;

      const result = await noKeyProvider.healthCheck();

      expect(result.healthy).toBe(false);
      expect(result.error).toContain('API key not configured');

      if (originalGoogleKey) process.env.GOOGLE_AI_API_KEY = originalGoogleKey;
      if (originalGeminiKey) process.env.GEMINI_API_KEY = originalGeminiKey;
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

  describe('generate', () => {
    it('should generate text from string prompt', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            candidates: [
              {
                content: {
                  parts: [{ text: 'Generated response from Gemini' }],
                  role: 'model',
                },
                finishReason: 'STOP',
              },
            ],
            usageMetadata: {
              promptTokenCount: 10,
              candidatesTokenCount: 20,
              totalTokenCount: 30,
            },
            modelVersion: 'gemini-1.5-pro',
          }),
      });

      const response = await provider.generate('Test prompt');

      expect(response.content).toBe('Generated response from Gemini');
      expect(response.provider).toBe('gemini');
      expect(response.usage.promptTokens).toBe(10);
      expect(response.usage.completionTokens).toBe(20);
      expect(response.usage.totalTokens).toBe(30);
      expect(response.finishReason).toBe('stop');
      expect(response.cost.totalCost).toBeGreaterThan(0);
    });

    it('should generate text from message array', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            candidates: [
              {
                content: {
                  parts: [{ text: 'Response to conversation' }],
                  role: 'model',
                },
                finishReason: 'STOP',
              },
            ],
            usageMetadata: {
              promptTokenCount: 15,
              candidatesTokenCount: 10,
              totalTokenCount: 25,
            },
          }),
      });

      const response = await provider.generate([
        { role: 'user', content: 'Hello' },
        { role: 'assistant', content: 'Hi there!' },
        { role: 'user', content: 'How are you?' },
      ]);

      expect(response.content).toBe('Response to conversation');
    });

    it('should include system prompt in request', async () => {
      mockFetch.mockImplementationOnce(async (url: string, options: RequestInit) => {
        const body = JSON.parse(options.body as string);
        expect(body.systemInstruction).toBeDefined();
        expect(body.systemInstruction.parts[0].text).toBe('You are a helpful assistant');

        return {
          ok: true,
          json: () =>
            Promise.resolve({
              candidates: [
                {
                  content: {
                    parts: [{ text: 'Response' }],
                    role: 'model',
                  },
                  finishReason: 'STOP',
                },
              ],
              usageMetadata: {
                promptTokenCount: 10,
                candidatesTokenCount: 10,
                totalTokenCount: 20,
              },
            }),
        };
      });

      await provider.generate('Test', {
        systemPrompt: 'You are a helpful assistant',
      });
    });

    it('should handle MAX_TOKENS finish reason', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            candidates: [
              {
                content: {
                  parts: [{ text: 'Truncated response...' }],
                  role: 'model',
                },
                finishReason: 'MAX_TOKENS',
              },
            ],
            usageMetadata: {
              promptTokenCount: 10,
              candidatesTokenCount: 100,
              totalTokenCount: 110,
            },
          }),
      });

      const response = await provider.generate('Test');

      expect(response.finishReason).toBe('length');
    });

    it('should handle SAFETY finish reason', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            candidates: [
              {
                content: {
                  parts: [{ text: '' }],
                  role: 'model',
                },
                finishReason: 'SAFETY',
              },
            ],
            usageMetadata: {
              promptTokenCount: 10,
              candidatesTokenCount: 0,
              totalTokenCount: 10,
            },
          }),
      });

      const response = await provider.generate('Test');

      expect(response.finishReason).toBe('content_filter');
    });

    it('should handle rate limiting', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 429,
        json: () =>
          Promise.resolve({
            error: {
              code: 429,
              message: 'Rate limit exceeded',
              status: 'RESOURCE_EXHAUSTED',
            },
          }),
      });

      const noRetryProvider = new GeminiProvider({
        apiKey: 'test-api-key',
        maxRetries: 1,
      });

      await expect(noRetryProvider.generate('Test')).rejects.toMatchObject({
        code: 'RATE_LIMITED',
        retryable: true,
      });
    });

    it('should handle invalid API key', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        json: () =>
          Promise.resolve({
            error: {
              code: 401,
              message: 'Invalid API key',
              status: 'UNAUTHENTICATED',
            },
          }),
      });

      await expect(provider.generate('Test')).rejects.toMatchObject({
        code: 'API_KEY_INVALID',
        retryable: false,
      });
    });

    it('should handle model not found', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        json: () =>
          Promise.resolve({
            error: {
              code: 404,
              message: 'Model not found',
              status: 'NOT_FOUND',
            },
          }),
      });

      await expect(provider.generate('Test')).rejects.toMatchObject({
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
              code: 400,
              message: 'Request exceeds maximum token length',
              status: 'INVALID_ARGUMENT',
            },
          }),
      });

      await expect(provider.generate('Test')).rejects.toMatchObject({
        code: 'CONTEXT_LENGTH_EXCEEDED',
        retryable: false,
      });
    });

    it('should handle provider unavailable', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 503,
        json: () =>
          Promise.resolve({
            error: {
              code: 503,
              message: 'Service unavailable',
              status: 'UNAVAILABLE',
            },
          }),
      });

      const noRetryProvider = new GeminiProvider({
        apiKey: 'test-api-key',
        maxRetries: 1,
      });

      await expect(noRetryProvider.generate('Test')).rejects.toMatchObject({
        code: 'PROVIDER_UNAVAILABLE',
        retryable: true,
      });
    });
  });

  describe('embed', () => {
    it('should generate embeddings', async () => {
      const mockEmbedding = new Array(768).fill(0).map((_, i) => i / 768);

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            embedding: {
              values: mockEmbedding,
            },
          }),
      });

      const response = await provider.embed('Test text');

      expect(response.embedding).toEqual(mockEmbedding);
      expect(response.provider).toBe('gemini');
      expect(response.tokenCount).toBeGreaterThan(0);
      // latencyMs may be 0 in fast tests due to mock resolution
      expect(response.latencyMs).toBeGreaterThanOrEqual(0);
    });

    it('should handle embedding error', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 400,
        json: () =>
          Promise.resolve({
            error: {
              code: 400,
              message: 'Invalid request',
              status: 'INVALID_ARGUMENT',
            },
          }),
      });

      await expect(provider.embed('Test')).rejects.toMatchObject({
        code: 'UNKNOWN',
      });
    });
  });

  describe('complete', () => {
    it('should complete text using generate', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            candidates: [
              {
                content: {
                  parts: [{ text: 'a, b) { return a + b; }' }],
                  role: 'model',
                },
                finishReason: 'STOP',
              },
            ],
            usageMetadata: {
              promptTokenCount: 5,
              candidatesTokenCount: 15,
              totalTokenCount: 20,
            },
          }),
      });

      const response = await provider.complete('function add(');

      expect(response.completion).toBe('a, b) { return a + b; }');
      expect(response.provider).toBe('gemini');
    });

    it('should use low temperature for completion', async () => {
      mockFetch.mockImplementationOnce(async (url: string, options: RequestInit) => {
        const body = JSON.parse(options.body as string);
        expect(body.generationConfig.temperature).toBe(0.2);

        return {
          ok: true,
          json: () =>
            Promise.resolve({
              candidates: [
                {
                  content: {
                    parts: [{ text: 'completed' }],
                    role: 'model',
                  },
                  finishReason: 'STOP',
                },
              ],
              usageMetadata: {
                promptTokenCount: 5,
                candidatesTokenCount: 3,
                totalTokenCount: 8,
              },
            }),
        };
      });

      await provider.complete('function add(');
    });
  });

  describe('pricing', () => {
    it('should have correct pricing for gemini-pro', () => {
      expect(GEMINI_PRICING['gemini-pro']).toEqual({ input: 0.5, output: 1.5 });
    });

    it('should have correct pricing for gemini-1.5-pro', () => {
      expect(GEMINI_PRICING['gemini-1.5-pro']).toEqual({ input: 3.5, output: 10.5 });
    });

    it('should have correct pricing for gemini-1.5-flash', () => {
      expect(GEMINI_PRICING['gemini-1.5-flash']).toEqual({ input: 0.075, output: 0.3 });
    });

    it('should have correct pricing for gemini-ultra', () => {
      expect(GEMINI_PRICING['gemini-ultra']).toEqual({ input: 7.0, output: 21.0 });
    });

    it('should have default pricing fallback', () => {
      expect(GEMINI_PRICING['default']).toEqual({ input: 1.0, output: 3.0 });
    });
  });

  describe('dispose', () => {
    it('should dispose resources', async () => {
      await expect(provider.dispose()).resolves.toBeUndefined();
    });
  });

  describe('API key from environment', () => {
    it('should use GOOGLE_AI_API_KEY from environment', async () => {
      const noConfigProvider = new GeminiProvider({});

      const originalKey = process.env.GOOGLE_AI_API_KEY;
      process.env.GOOGLE_AI_API_KEY = 'env-google-key';

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            models: [
              {
                name: 'models/gemini-1.5-pro',
                displayName: 'Gemini 1.5 Pro',
                supportedGenerationMethods: ['generateContent'],
              },
            ],
          }),
      });

      const result = await noConfigProvider.healthCheck();
      expect(result.healthy).toBe(true);

      // Verify the key was used in the URL
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('key=env-google-key'),
        expect.any(Object)
      );

      if (originalKey) {
        process.env.GOOGLE_AI_API_KEY = originalKey;
      } else {
        delete process.env.GOOGLE_AI_API_KEY;
      }
    });

    it('should use GEMINI_API_KEY as fallback', async () => {
      const noConfigProvider = new GeminiProvider({});

      const originalGoogleKey = process.env.GOOGLE_AI_API_KEY;
      const originalGeminiKey = process.env.GEMINI_API_KEY;
      delete process.env.GOOGLE_AI_API_KEY;
      process.env.GEMINI_API_KEY = 'env-gemini-key';

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            models: [
              {
                name: 'models/gemini-1.5-pro',
                displayName: 'Gemini 1.5 Pro',
                supportedGenerationMethods: ['generateContent'],
              },
            ],
          }),
      });

      const result = await noConfigProvider.healthCheck();
      expect(result.healthy).toBe(true);

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('key=env-gemini-key'),
        expect.any(Object)
      );

      if (originalGoogleKey) {
        process.env.GOOGLE_AI_API_KEY = originalGoogleKey;
      }
      if (originalGeminiKey) {
        process.env.GEMINI_API_KEY = originalGeminiKey;
      } else {
        delete process.env.GEMINI_API_KEY;
      }
    });
  });

  describe('cost calculation', () => {
    it('should calculate cost correctly for gemini-1.5-pro', async () => {
      const proProvider = new GeminiProvider({
        apiKey: 'test-key',
        model: 'gemini-1.5-pro',
      });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            candidates: [
              {
                content: {
                  parts: [{ text: 'Response' }],
                  role: 'model',
                },
                finishReason: 'STOP',
              },
            ],
            usageMetadata: {
              promptTokenCount: 1000,
              candidatesTokenCount: 500,
              totalTokenCount: 1500,
            },
          }),
      });

      const response = await proProvider.generate('Test');

      // gemini-1.5-pro: 3.5 input, 10.5 output per 1M tokens
      // 1000 input tokens: (1000 / 1_000_000) * 3.5 = 0.0035
      // 500 output tokens: (500 / 1_000_000) * 10.5 = 0.00525
      // Total: 0.00875
      expect(response.cost.inputCost).toBeCloseTo(0.0035, 6);
      expect(response.cost.outputCost).toBeCloseTo(0.00525, 6);
      expect(response.cost.totalCost).toBeCloseTo(0.00875, 6);
      expect(response.cost.currency).toBe('USD');
    });

    it('should calculate cost correctly for gemini-1.5-flash', async () => {
      const flashProvider = new GeminiProvider({
        apiKey: 'test-key',
        model: 'gemini-1.5-flash',
      });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            candidates: [
              {
                content: {
                  parts: [{ text: 'Response' }],
                  role: 'model',
                },
                finishReason: 'STOP',
              },
            ],
            usageMetadata: {
              promptTokenCount: 10000,
              candidatesTokenCount: 5000,
              totalTokenCount: 15000,
            },
          }),
      });

      const response = await flashProvider.generate('Test');

      // gemini-1.5-flash: 0.075 input, 0.3 output per 1M tokens
      // 10000 input tokens: (10000 / 1_000_000) * 0.075 = 0.00075
      // 5000 output tokens: (5000 / 1_000_000) * 0.3 = 0.0015
      // Total: 0.00225
      expect(response.cost.inputCost).toBeCloseTo(0.00075, 6);
      expect(response.cost.outputCost).toBeCloseTo(0.0015, 6);
      expect(response.cost.totalCost).toBeCloseTo(0.00225, 6);
    });
  });
});
