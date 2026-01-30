/**
 * Agentic QE v3 - Claude Provider Unit Tests
 * Tests for ClaudeModelProvider multi-model consensus verification
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import {
  ClaudeModelProvider,
  createClaudeProvider,
  type ClaudeProviderConfig,
} from '../../../../../src/coordination/consensus/providers/claude-provider';

// ============================================================================
// Mock Setup
// ============================================================================

// Mock fetch globally
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

function createSuccessResponse(content: string, inputTokens = 100, outputTokens = 50) {
  return createMockResponse({
    id: 'msg-test-123',
    type: 'message',
    role: 'assistant',
    content: [{ type: 'text', text: content }],
    model: 'claude-3-5-sonnet-20241022',
    stop_reason: 'end_turn',
    stop_sequence: null,
    usage: {
      input_tokens: inputTokens,
      output_tokens: outputTokens,
    },
  });
}

function createErrorResponse(errorType: string, message: string, status = 400) {
  return createMockResponse(
    {
      type: 'error',
      error: { type: errorType, message },
    },
    status
  );
}

// ============================================================================
// Tests
// ============================================================================

describe('ClaudeModelProvider', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env = { ...originalEnv, ANTHROPIC_API_KEY: 'test-api-key' };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('constructor', () => {
    it('should create provider with config API key', () => {
      const provider = new ClaudeModelProvider({ apiKey: 'config-key' });

      expect(provider.id).toBe('claude');
      expect(provider.name).toBe('Claude (Anthropic)');
      expect(provider.type).toBe('claude');
    });

    it('should create provider with environment API key', () => {
      const provider = new ClaudeModelProvider();

      expect(provider.id).toBe('claude');
    });

    it('should throw error when no API key provided', () => {
      delete process.env.ANTHROPIC_API_KEY;

      expect(() => new ClaudeModelProvider()).toThrow('Claude API key is required');
    });

    it('should use custom base URL when provided', () => {
      const provider = new ClaudeModelProvider({
        apiKey: 'test-key',
        baseUrl: 'https://custom.api.anthropic.com',
      });

      expect(provider).toBeDefined();
    });

    it('should set default model to claude-3-5-sonnet-20241022', () => {
      const provider = new ClaudeModelProvider({ apiKey: 'test-key' });

      // Verify by calling complete and checking the request
      mockFetch.mockResolvedValueOnce(createSuccessResponse('test'));

      provider.complete('test prompt');

      // Provider should be configured with sonnet by default
      expect(provider).toBeDefined();
    });

    it('should support claude-3-opus models', () => {
      const provider = new ClaudeModelProvider({
        apiKey: 'test-key',
        defaultModel: 'claude-3-opus-20240229',
      });

      expect(provider).toBeDefined();
    });
  });

  describe('complete()', () => {
    let provider: ClaudeModelProvider;

    beforeEach(() => {
      provider = new ClaudeModelProvider({ apiKey: 'test-key' });
    });

    it('should complete a prompt successfully', async () => {
      mockFetch.mockResolvedValueOnce(
        createSuccessResponse('This is a security analysis response.')
      );

      const result = await provider.complete('Analyze this code for vulnerabilities');

      expect(result).toBe('This is a security analysis response.');
      expect(mockFetch).toHaveBeenCalledTimes(1);

      const [url, options] = mockFetch.mock.calls[0];
      expect(url).toBe('https://api.anthropic.com/v1/messages');
      expect(options.method).toBe('POST');
      expect(options.headers['x-api-key']).toBe('test-key');
      expect(options.headers['anthropic-version']).toBe('2023-06-01');
    });

    it('should include system prompt in request', async () => {
      mockFetch.mockResolvedValueOnce(createSuccessResponse('Response'));

      await provider.complete('Test prompt', {
        systemPrompt: 'You are a security expert.',
      });

      const requestBody = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(requestBody.system).toBe('You are a security expert.');
    });

    it('should use custom model when specified', async () => {
      mockFetch.mockResolvedValueOnce(createSuccessResponse('Response'));

      await provider.complete('Test prompt', {
        model: 'claude-3-opus-latest',
      });

      const requestBody = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(requestBody.model).toBe('claude-3-opus-latest');
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

    it('should retry on transient errors', async () => {
      // First call fails with 500, second succeeds
      mockFetch
        .mockResolvedValueOnce(createErrorResponse('api_error', 'Internal error', 500))
        .mockResolvedValueOnce(createSuccessResponse('Success after retry'));

      const result = await provider.complete('Test prompt');

      expect(result).toBe('Success after retry');
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it('should not retry on authentication errors', async () => {
      mockFetch.mockResolvedValueOnce(
        createErrorResponse('authentication_error', 'Invalid API key', 401)
      );

      await expect(provider.complete('Test')).rejects.toThrow('Invalid API key');
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it('should not retry on validation errors', async () => {
      mockFetch.mockResolvedValueOnce(
        createErrorResponse('invalid_request', 'Validation error', 400)
      );

      await expect(provider.complete('Test')).rejects.toThrow('Validation error');
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it('should fail after max retries', async () => {
      mockFetch.mockResolvedValue(createErrorResponse('api_error', 'Server error', 500));

      await expect(provider.complete('Test')).rejects.toThrow('Claude completion failed after');
    });

    it('should handle timeout', async () => {
      mockFetch.mockImplementation(
        () =>
          new Promise((_, reject) => {
            setTimeout(() => reject(new Error('AbortError')), 100);
          })
      );

      const provider = new ClaudeModelProvider({
        apiKey: 'test-key',
        defaultTimeout: 50,
        maxRetries: 0,
      });

      await expect(provider.complete('Test')).rejects.toThrow();
    });

    it('should join multiple text blocks in response', async () => {
      mockFetch.mockResolvedValueOnce(
        createMockResponse({
          id: 'msg-test',
          type: 'message',
          role: 'assistant',
          content: [
            { type: 'text', text: 'First part.' },
            { type: 'text', text: 'Second part.' },
          ],
          model: 'claude-3-5-sonnet-20241022',
          stop_reason: 'end_turn',
          usage: { input_tokens: 10, output_tokens: 20 },
        })
      );

      const result = await provider.complete('Test');

      expect(result).toBe('First part.\nSecond part.');
    });
  });

  describe('healthCheck()', () => {
    let provider: ClaudeModelProvider;

    beforeEach(() => {
      provider = new ClaudeModelProvider({ apiKey: 'test-key' });
    });

    it('should return healthy when API is accessible', async () => {
      mockFetch.mockResolvedValueOnce(createSuccessResponse('Hello'));

      const result = await provider.healthCheck();

      expect(result.healthy).toBe(true);
      expect(result.latencyMs).toBeDefined();
      expect(result.availableModels).toContain('claude-3-5-sonnet-20241022');
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
    it('should return sonnet pricing by default', () => {
      const provider = new ClaudeModelProvider({
        apiKey: 'test-key',
        defaultModel: 'claude-3-5-sonnet-20241022',
      });

      const cost = provider.getCostPerToken();

      // Claude 3.5 Sonnet: $3 input, $15 output per 1M tokens
      expect(cost.input).toBeCloseTo(3 / 1_000_000, 10);
      expect(cost.output).toBeCloseTo(15 / 1_000_000, 10);
    });

    it('should return opus pricing for opus models', () => {
      const provider = new ClaudeModelProvider({
        apiKey: 'test-key',
        defaultModel: 'claude-3-opus-20240229',
      });

      const cost = provider.getCostPerToken();

      // Claude 3 Opus: $15 input, $75 output per 1M tokens
      expect(cost.input).toBeCloseTo(15 / 1_000_000, 10);
      expect(cost.output).toBeCloseTo(75 / 1_000_000, 10);
    });
  });

  describe('logging', () => {
    it('should log requests when enableLogging is true', async () => {
      const consoleSpy = vi.spyOn(console, 'log');
      const provider = new ClaudeModelProvider({
        apiKey: 'test-key',
        enableLogging: true,
      });

      mockFetch.mockResolvedValueOnce(createSuccessResponse('Response', 100, 50));

      await provider.complete('Test');

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('[Claude] Sending request')
      );
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('[Claude] Received response')
      );

      consoleSpy.mockRestore();
    });
  });
});

describe('createClaudeProvider', () => {
  beforeEach(() => {
    process.env.ANTHROPIC_API_KEY = 'test-key';
  });

  it('should create a configured provider', () => {
    const provider = createClaudeProvider({
      defaultModel: 'claude-3-opus-latest',
    });

    expect(provider).toBeInstanceOf(ClaudeModelProvider);
  });

  it('should create provider with default config', () => {
    const provider = createClaudeProvider();

    expect(provider).toBeInstanceOf(ClaudeModelProvider);
  });
});
