/**
 * Agentic QE v3 - OpenRouter Provider Unit Tests
 * Tests for OpenRouterModelProvider multi-model consensus verification
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import {
  OpenRouterModelProvider,
  createOpenRouterProvider,
  createMultiModelProviders,
  getModelsByTier,
  getRecommendedSecurityModels,
  getCostOptimizedModels,
  type OpenRouterProviderConfig,
} from '../../../../../src/coordination/consensus/providers/openrouter-provider';

// ============================================================================
// Mock Setup
// ============================================================================

const mockFetch = vi.fn();
global.fetch = mockFetch;

function createMockResponse(data: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(data),
    text: () => Promise.resolve(JSON.stringify(data)),
  } as Response;
}

function createSuccessResponse(content: string, promptTokens = 100, completionTokens = 50) {
  return createMockResponse({
    id: 'gen-test123',
    model: 'anthropic/claude-3.5-sonnet',
    choices: [
      {
        index: 0,
        message: {
          role: 'assistant',
          content,
        },
        finish_reason: 'stop',
      },
    ],
    usage: {
      prompt_tokens: promptTokens,
      completion_tokens: completionTokens,
      total_tokens: promptTokens + completionTokens,
    },
  });
}

function createErrorResponse(message: string, status = 400) {
  return createMockResponse(`OpenRouter API error: ${status} - ${message}`, status);
}

// ============================================================================
// Tests
// ============================================================================

describe('OpenRouterModelProvider', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    mockFetch.mockReset();
    process.env = { ...originalEnv, OPENROUTER_API_KEY: 'test-openrouter-key' };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('constructor', () => {
    it('should create provider with config API key', () => {
      const provider = new OpenRouterModelProvider({ apiKey: 'config-key' });

      expect(provider.id).toContain('openrouter');
      expect(provider.name).toContain('OpenRouter');
      expect(provider.type).toBe('openrouter');
    });

    it('should create provider with environment API key', () => {
      const provider = new OpenRouterModelProvider();

      expect(provider.type).toBe('openrouter');
    });

    it('should throw error when no API key provided', () => {
      delete process.env.OPENROUTER_API_KEY;

      expect(() => new OpenRouterModelProvider()).toThrow('OpenRouter API key is required');
    });

    it('should default to claude-3.5-sonnet model', () => {
      const provider = new OpenRouterModelProvider({ apiKey: 'test-key' });

      expect(provider.name).toContain('claude-3.5-sonnet');
    });

    it('should generate unique ID based on model', () => {
      const provider1 = new OpenRouterModelProvider({
        apiKey: 'test-key',
        defaultModel: 'openai/gpt-4o',
      });
      const provider2 = new OpenRouterModelProvider({
        apiKey: 'test-key',
        defaultModel: 'google/gemini-pro-1.5',
      });

      expect(provider1.id).not.toBe(provider2.id);
    });
  });

  describe('complete()', () => {
    let provider: OpenRouterModelProvider;

    beforeEach(() => {
      provider = new OpenRouterModelProvider({ apiKey: 'test-key' });
    });

    it('should complete a prompt successfully', async () => {
      mockFetch.mockResolvedValueOnce(createSuccessResponse('Security analysis complete.'));

      const result = await provider.complete('Analyze this code');

      expect(result).toBe('Security analysis complete.');
      expect(mockFetch).toHaveBeenCalledTimes(1);

      const [url, options] = mockFetch.mock.calls[0];
      expect(url).toBe('https://openrouter.ai/api/v1/chat/completions');
      expect(options.headers['Authorization']).toBe('Bearer test-key');
    });

    it('should include app name and site URL in headers', async () => {
      const provider = new OpenRouterModelProvider({
        apiKey: 'test-key',
        appName: 'Test App',
        siteUrl: 'https://test.example.com',
      });

      mockFetch.mockResolvedValueOnce(createSuccessResponse('Response'));

      await provider.complete('Test');

      const options = mockFetch.mock.calls[0][1];
      expect(options.headers['HTTP-Referer']).toBe('https://test.example.com');
      expect(options.headers['X-Title']).toBe('Test App');
    });

    it('should include system and user messages', async () => {
      mockFetch.mockResolvedValueOnce(createSuccessResponse('Response'));

      await provider.complete('Test prompt', {
        systemPrompt: 'You are a security expert.',
      });

      const requestBody = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(requestBody.messages).toHaveLength(2);
      expect(requestBody.messages[0].role).toBe('system');
      expect(requestBody.messages[1].role).toBe('user');
    });

    it('should use custom model when specified', async () => {
      mockFetch.mockResolvedValueOnce(createSuccessResponse('Response'));

      await provider.complete('Test prompt', { model: 'openai/gpt-4o' });

      const requestBody = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(requestBody.model).toBe('openai/gpt-4o');
    });

    it('should set stream to false', async () => {
      mockFetch.mockResolvedValueOnce(createSuccessResponse('Response'));

      await provider.complete('Test');

      const requestBody = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(requestBody.stream).toBe(false);
    });

    it('should throw error when provider is disposed', async () => {
      await provider.dispose();

      await expect(provider.complete('Test')).rejects.toThrow('Provider has been disposed');
    });

    it('should throw error when response is empty', async () => {
      // Create provider with no retries to speed up test
      const noRetryProvider = new OpenRouterModelProvider({ apiKey: 'test-key', maxRetries: 0 });
      mockFetch.mockResolvedValueOnce(
        createMockResponse({
          id: 'test',
          model: 'test',
          choices: [{ message: { content: '' }, finish_reason: 'stop' }],
        })
      );

      await expect(noRetryProvider.complete('Test')).rejects.toThrow('Empty response from OpenRouter');
    });

    it('should try fallback models on failure', async () => {
      const provider = new OpenRouterModelProvider({
        apiKey: 'test-key',
        defaultModel: 'anthropic/claude-3.5-sonnet',
        fallbackModels: ['openai/gpt-4o', 'google/gemini-pro-1.5'],
      });

      mockFetch
        .mockRejectedValueOnce(new Error('Primary failed'))
        .mockResolvedValueOnce(createSuccessResponse('Fallback success'));

      const result = await provider.complete('Test');

      expect(result).toBe('Fallback success');
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it('should retry on transient errors', async () => {
      mockFetch
        .mockRejectedValueOnce(new Error('Network error'))
        .mockResolvedValueOnce(createSuccessResponse('Success'));

      const result = await provider.complete('Test');

      expect(result).toBe('Success');
    });

    it('should not retry on authentication errors', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        text: () => Promise.resolve('Invalid API key'),
      } as Response);

      await expect(provider.complete('Test')).rejects.toThrow('Invalid API key');
    });

    it('should track total cost', async () => {
      mockFetch.mockResolvedValueOnce(createSuccessResponse('Response', 1000, 500));

      await provider.complete('Test');

      expect(provider.getTotalCost()).toBeGreaterThan(0);
    });
  });

  describe('healthCheck()', () => {
    let provider: OpenRouterModelProvider;

    beforeEach(() => {
      provider = new OpenRouterModelProvider({ apiKey: 'test-key' });
    });

    it('should return healthy when API is accessible', async () => {
      mockFetch.mockResolvedValueOnce(
        createMockResponse({ data: [{ id: 'model1' }] })
      );

      const result = await provider.healthCheck();

      expect(result.healthy).toBe(true);
      expect(result.latencyMs).toBeDefined();
    });

    it('should return unhealthy when API fails', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      const result = await provider.healthCheck();

      expect(result.healthy).toBe(false);
      expect(result.error).toContain('Network error');
    });
  });

  describe('getCostPerToken()', () => {
    it('should return correct pricing for claude-3.5-sonnet', () => {
      const provider = new OpenRouterModelProvider({
        apiKey: 'test-key',
        defaultModel: 'anthropic/claude-3.5-sonnet',
      });

      const cost = provider.getCostPerToken();

      // Claude 3.5 Sonnet: $3 input, $15 output per 1M tokens
      expect(cost.input).toBeCloseTo(3 / 1_000_000, 10);
      expect(cost.output).toBeCloseTo(15 / 1_000_000, 10);
    });

    it('should return default pricing for unknown models', () => {
      const provider = new OpenRouterModelProvider({
        apiKey: 'test-key',
        defaultModel: 'unknown/model',
      });

      const cost = provider.getCostPerToken();

      expect(cost.input).toBeGreaterThan(0);
      expect(cost.output).toBeGreaterThan(0);
    });
  });
});

describe('Helper Functions', () => {
  beforeEach(() => {
    process.env.OPENROUTER_API_KEY = 'test-key';
  });

  describe('getModelsByTier()', () => {
    it('should return cheap tier models', () => {
      const models = getModelsByTier('cheap');

      expect(models.length).toBeGreaterThan(0);
      expect(models).toContain('anthropic/claude-3-haiku');
    });

    it('should return standard tier models', () => {
      const models = getModelsByTier('standard');

      expect(models.length).toBeGreaterThan(0);
      expect(models).toContain('anthropic/claude-3.5-sonnet');
    });

    it('should return premium tier models', () => {
      const models = getModelsByTier('premium');

      expect(models.length).toBeGreaterThan(0);
      expect(models).toContain('anthropic/claude-3-opus');
    });
  });

  describe('getRecommendedSecurityModels()', () => {
    it('should return diverse set of models for security verification', () => {
      const models = getRecommendedSecurityModels();

      expect(models.length).toBe(4);
      expect(models).toContain('anthropic/claude-3.5-sonnet');
      expect(models).toContain('openai/gpt-4o');
    });
  });

  describe('getCostOptimizedModels()', () => {
    it('should return cost-effective models', () => {
      const models = getCostOptimizedModels();

      expect(models.length).toBe(4);
      expect(models).toContain('anthropic/claude-3-haiku');
      expect(models).toContain('openai/gpt-4o-mini');
    });
  });

  describe('createOpenRouterProvider()', () => {
    it('should create provider with default config', () => {
      const provider = createOpenRouterProvider();

      expect(provider).toBeInstanceOf(OpenRouterModelProvider);
    });

    it('should create provider with custom model', () => {
      const provider = createOpenRouterProvider({
        defaultModel: 'openai/gpt-4o',
      });

      expect(provider.name).toContain('gpt-4o');
    });
  });

  describe('createMultiModelProviders()', () => {
    it('should create multiple providers with default recommended models', () => {
      const providers = createMultiModelProviders();

      expect(providers.length).toBe(4);
      expect(providers[0]).toBeInstanceOf(OpenRouterModelProvider);
    });

    it('should create providers for specified models', () => {
      const providers = createMultiModelProviders([
        'anthropic/claude-3-haiku',
        'openai/gpt-4o-mini',
      ]);

      expect(providers.length).toBe(2);
    });

    it('should pass base config to all providers', () => {
      const providers = createMultiModelProviders(
        ['anthropic/claude-3-haiku'],
        { enableLogging: true }
      );

      expect(providers.length).toBe(1);
    });
  });
});
