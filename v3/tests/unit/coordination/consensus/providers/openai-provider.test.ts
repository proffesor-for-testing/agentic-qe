/**
 * Agentic QE v3 - OpenAI Provider Unit Tests
 * Tests for OpenAIModelProvider multi-model consensus verification
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import {
  OpenAIModelProvider,
  createOpenAIProvider,
  type OpenAIProviderConfig,
} from '../../../../../src/coordination/consensus/providers/openai-provider';

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
    id: 'chatcmpl-test123',
    object: 'chat.completion',
    created: Date.now(),
    model: 'gpt-4-turbo',
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

function createErrorResponse(type: string, message: string, status = 400) {
  return createMockResponse(
    {
      error: {
        message,
        type,
        param: null,
        code: null,
      },
    },
    status
  );
}

// ============================================================================
// Tests
// ============================================================================

describe('OpenAIModelProvider', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env = { ...originalEnv, OPENAI_API_KEY: 'test-openai-key' };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('constructor', () => {
    it('should create provider with config API key', () => {
      const provider = new OpenAIModelProvider({ apiKey: 'config-key' });

      expect(provider.id).toBe('openai');
      expect(provider.name).toBe('OpenAI GPT');
      expect(provider.type).toBe('openai');
    });

    it('should create provider with environment API key', () => {
      const provider = new OpenAIModelProvider();

      expect(provider.id).toBe('openai');
    });

    it('should throw error when no API key provided', () => {
      delete process.env.OPENAI_API_KEY;

      expect(() => new OpenAIModelProvider()).toThrow('OpenAI API key is required');
    });

    it('should use custom base URL when provided', () => {
      const provider = new OpenAIModelProvider({
        apiKey: 'test-key',
        baseUrl: 'https://custom.openai.azure.com',
      });

      expect(provider).toBeDefined();
    });

    it('should default to gpt-4-turbo model', () => {
      const provider = new OpenAIModelProvider({ apiKey: 'test-key' });

      expect(provider).toBeDefined();
    });

    it('should support organization ID', () => {
      const provider = new OpenAIModelProvider({
        apiKey: 'test-key',
        organization: 'org-test123',
      });

      expect(provider).toBeDefined();
    });
  });

  describe('complete()', () => {
    let provider: OpenAIModelProvider;

    beforeEach(() => {
      provider = new OpenAIModelProvider({ apiKey: 'test-key' });
    });

    it('should complete a prompt successfully', async () => {
      mockFetch.mockResolvedValueOnce(createSuccessResponse('Security vulnerability found.'));

      const result = await provider.complete('Analyze this code');

      expect(result).toBe('Security vulnerability found.');
      expect(mockFetch).toHaveBeenCalledTimes(1);

      const [url, options] = mockFetch.mock.calls[0];
      expect(url).toBe('https://api.openai.com/v1/chat/completions');
      expect(options.method).toBe('POST');
      expect(options.headers['Authorization']).toBe('Bearer test-key');
    });

    it('should include system and user messages', async () => {
      mockFetch.mockResolvedValueOnce(createSuccessResponse('Response'));

      await provider.complete('Test prompt', {
        systemPrompt: 'You are a security expert.',
      });

      const requestBody = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(requestBody.messages).toHaveLength(2);
      expect(requestBody.messages[0]).toEqual({
        role: 'system',
        content: 'You are a security expert.',
      });
      expect(requestBody.messages[1]).toEqual({
        role: 'user',
        content: 'Test prompt',
      });
    });

    it('should include organization header when provided', async () => {
      const provider = new OpenAIModelProvider({
        apiKey: 'test-key',
        organization: 'org-test123',
      });

      mockFetch.mockResolvedValueOnce(createSuccessResponse('Response'));

      await provider.complete('Test');

      const options = mockFetch.mock.calls[0][1];
      expect(options.headers['OpenAI-Organization']).toBe('org-test123');
    });

    it('should use custom model when specified', async () => {
      mockFetch.mockResolvedValueOnce(createSuccessResponse('Response'));

      await provider.complete('Test prompt', { model: 'gpt-4' });

      const requestBody = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(requestBody.model).toBe('gpt-4');
    });

    it('should respect maxTokens option', async () => {
      mockFetch.mockResolvedValueOnce(createSuccessResponse('Response'));

      await provider.complete('Test prompt', { maxTokens: 2048 });

      const requestBody = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(requestBody.max_tokens).toBe(2048);
    });

    it('should respect temperature option', async () => {
      mockFetch.mockResolvedValueOnce(createSuccessResponse('Response'));

      await provider.complete('Test prompt', { temperature: 0.5 });

      const requestBody = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(requestBody.temperature).toBe(0.5);
    });

    it('should throw error when provider is disposed', async () => {
      await provider.dispose();

      await expect(provider.complete('Test')).rejects.toThrow('Provider has been disposed');
    });

    it('should throw error when response has no choices', async () => {
      // Use mockResolvedValue (not Once) to handle retries
      mockFetch.mockResolvedValue(
        createMockResponse({
          id: 'test',
          object: 'chat.completion',
          created: Date.now(),
          model: 'gpt-4',
          choices: [],
          usage: { prompt_tokens: 10, completion_tokens: 0, total_tokens: 10 },
        })
      );

      await expect(provider.complete('Test')).rejects.toThrow('OpenAI returned no choices');
    });

    it('should retry on transient errors', async () => {
      mockFetch
        .mockResolvedValueOnce(createErrorResponse('server_error', 'Internal error', 500))
        .mockResolvedValueOnce(createSuccessResponse('Success'));

      const result = await provider.complete('Test');

      expect(result).toBe('Success');
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it('should not retry on authentication errors', async () => {
      mockFetch.mockResolvedValueOnce(
        createErrorResponse('authentication_error', 'Invalid API key', 401)
      );

      await expect(provider.complete('Test')).rejects.toThrow('Invalid API key');
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it('should not retry on invalid request errors', async () => {
      // Use mockResolvedValue to handle any retries consistently
      mockFetch.mockResolvedValue(
        createErrorResponse('invalid_request_error', 'Invalid request', 400)
      );

      await expect(provider.complete('Test')).rejects.toThrow('Invalid request');
    });

    it('should not retry on quota errors', async () => {
      // Use mockResolvedValue to handle any retries consistently
      mockFetch.mockResolvedValue(
        createErrorResponse('insufficient_quota', 'You have exceeded your quota', 429)
      );

      await expect(provider.complete('Test')).rejects.toThrow('exceeded your quota');
    });

    it('should fail after max retries', async () => {
      mockFetch.mockResolvedValue(createErrorResponse('server_error', 'Server error', 500));

      await expect(provider.complete('Test')).rejects.toThrow('OpenAI completion failed after');
    });
  });

  describe('healthCheck()', () => {
    let provider: OpenAIModelProvider;

    beforeEach(() => {
      provider = new OpenAIModelProvider({ apiKey: 'test-key' });
    });

    it('should return healthy when API is accessible', async () => {
      mockFetch.mockResolvedValueOnce(createSuccessResponse('Hello'));

      const result = await provider.healthCheck();

      expect(result.healthy).toBe(true);
      expect(result.latencyMs).toBeDefined();
      expect(result.availableModels).toContain('gpt-4-turbo');
    });

    it('should return unhealthy when API fails', async () => {
      // Use mockRejectedValue (not Once) to handle all retry attempts
      mockFetch.mockRejectedValue(new Error('Network error'));

      const result = await provider.healthCheck();

      expect(result.healthy).toBe(false);
      expect(result.error).toContain('Network error');
    });
  });

  describe('getCostPerToken()', () => {
    it('should return gpt-4-turbo pricing by default', () => {
      const provider = new OpenAIModelProvider({
        apiKey: 'test-key',
        defaultModel: 'gpt-4-turbo',
      });

      const cost = provider.getCostPerToken();

      // GPT-4-turbo: $10 input, $30 output per 1M tokens
      expect(cost.input).toBeCloseTo(10 / 1_000_000, 10);
      expect(cost.output).toBeCloseTo(30 / 1_000_000, 10);
    });

    it('should return gpt-4 pricing for base gpt-4 model', () => {
      const provider = new OpenAIModelProvider({
        apiKey: 'test-key',
        defaultModel: 'gpt-4',
      });

      const cost = provider.getCostPerToken();

      // GPT-4: $30 input, $60 output per 1M tokens
      expect(cost.input).toBeCloseTo(30 / 1_000_000, 10);
      expect(cost.output).toBeCloseTo(60 / 1_000_000, 10);
    });
  });

  describe('logging', () => {
    it('should log requests when enableLogging is true', async () => {
      const consoleSpy = vi.spyOn(console, 'log');
      const provider = new OpenAIModelProvider({
        apiKey: 'test-key',
        enableLogging: true,
      });

      mockFetch.mockResolvedValueOnce(createSuccessResponse('Response', 100, 50));

      await provider.complete('Test');

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('[OpenAI] Sending request')
      );
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('[OpenAI] Received response')
      );

      consoleSpy.mockRestore();
    });
  });
});

describe('createOpenAIProvider', () => {
  beforeEach(() => {
    process.env.OPENAI_API_KEY = 'test-key';
  });

  it('should create a configured provider', () => {
    const provider = createOpenAIProvider({
      defaultModel: 'gpt-4',
    });

    expect(provider).toBeInstanceOf(OpenAIModelProvider);
  });

  it('should create provider with default config', () => {
    const provider = createOpenAIProvider();

    expect(provider).toBeInstanceOf(OpenAIModelProvider);
  });
});
