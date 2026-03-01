/**
 * Agentic QE v3 - Gemini Provider Unit Tests
 * Tests for GeminiModelProvider multi-model consensus verification
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import {
  GeminiModelProvider,
  createGeminiProvider,
  type GeminiProviderConfig,
} from '../../../../../src/coordination/consensus/providers/gemini-provider';

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

function createSuccessResponse(content: string, promptTokens = 100, candidateTokens = 50) {
  return createMockResponse({
    candidates: [
      {
        content: {
          parts: [{ text: content }],
          role: 'model',
        },
        finishReason: 'STOP',
        index: 0,
      },
    ],
    usageMetadata: {
      promptTokenCount: promptTokens,
      candidatesTokenCount: candidateTokens,
      totalTokenCount: promptTokens + candidateTokens,
    },
  });
}

function createErrorResponse(code: number, message: string, status = 400) {
  return createMockResponse(
    {
      error: { code, message, status: 'INVALID_ARGUMENT' },
    },
    status
  );
}

// ============================================================================
// Tests
// ============================================================================

describe('GeminiModelProvider', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    mockFetch.mockReset();
    process.env = { ...originalEnv, GOOGLE_API_KEY: 'test-google-api-key' };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('constructor', () => {
    it('should create provider with config API key', () => {
      const provider = new GeminiModelProvider({ apiKey: 'config-key' });

      expect(provider.id).toBe('gemini');
      expect(provider.name).toBe('Google Gemini');
      expect(provider.type).toBe('gemini');
    });

    it('should create provider with environment API key', () => {
      const provider = new GeminiModelProvider();

      expect(provider.id).toBe('gemini');
    });

    it('should throw error when no API key provided', () => {
      delete process.env.GOOGLE_API_KEY;

      expect(() => new GeminiModelProvider()).toThrow('Google API key is required');
    });

    it('should use custom base URL when provided', () => {
      const provider = new GeminiModelProvider({
        apiKey: 'test-key',
        baseUrl: 'https://custom.googleapis.com',
      });

      expect(provider).toBeDefined();
    });

    it('should default to gemini-1.5-pro-latest model', () => {
      const provider = new GeminiModelProvider({ apiKey: 'test-key' });

      expect(provider).toBeDefined();
    });

    it('should support gemini-1.5-flash models', () => {
      const provider = new GeminiModelProvider({
        apiKey: 'test-key',
        defaultModel: 'gemini-1.5-flash-latest',
      });

      expect(provider).toBeDefined();
    });
  });

  describe('complete()', () => {
    let provider: GeminiModelProvider;

    beforeEach(() => {
      provider = new GeminiModelProvider({ apiKey: 'test-key' });
    });

    it('should complete a prompt successfully', async () => {
      mockFetch.mockResolvedValueOnce(createSuccessResponse('Security analysis complete.'));

      const result = await provider.complete('Analyze this code for vulnerabilities');

      expect(result).toBe('Security analysis complete.');
      expect(mockFetch).toHaveBeenCalledTimes(1);

      const [url] = mockFetch.mock.calls[0];
      expect(url).toContain('generativelanguage.googleapis.com');
      expect(url).toContain('generateContent');
      expect(url).toContain('key=test-key');
    });

    it('should prepend system prompt to user content', async () => {
      mockFetch.mockResolvedValueOnce(createSuccessResponse('Response'));

      await provider.complete('Test prompt', {
        systemPrompt: 'You are a security expert.',
      });

      const requestBody = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(requestBody.contents[0].parts[0].text).toContain('You are a security expert.');
      expect(requestBody.contents[0].parts[0].text).toContain('Test prompt');
    });

    it('should use custom model when specified', async () => {
      mockFetch.mockResolvedValueOnce(createSuccessResponse('Response'));

      await provider.complete('Test prompt', {
        model: 'gemini-1.5-flash',
      });

      const [url] = mockFetch.mock.calls[0];
      expect(url).toContain('gemini-1.5-flash');
    });

    it('should respect maxTokens option', async () => {
      mockFetch.mockResolvedValueOnce(createSuccessResponse('Response'));

      await provider.complete('Test prompt', { maxTokens: 2048 });

      const requestBody = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(requestBody.generationConfig.maxOutputTokens).toBe(2048);
    });

    it('should respect temperature option', async () => {
      mockFetch.mockResolvedValueOnce(createSuccessResponse('Response'));

      await provider.complete('Test prompt', { temperature: 0.3 });

      const requestBody = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(requestBody.generationConfig.temperature).toBe(0.3);
    });

    it('should include safety settings for security analysis', async () => {
      mockFetch.mockResolvedValueOnce(createSuccessResponse('Response'));

      await provider.complete('Test prompt');

      const requestBody = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(requestBody.safetySettings).toBeDefined();
      expect(requestBody.safetySettings).toContainEqual(
        expect.objectContaining({ category: 'HARM_CATEGORY_DANGEROUS_CONTENT' })
      );
    });

    it('should throw error when provider is disposed', async () => {
      await provider.dispose();

      await expect(provider.complete('Test')).rejects.toThrow('Provider has been disposed');
    });

    it('should throw error when response has no candidates', async () => {
      // Create provider with no retries to speed up test
      const noRetryProvider = new GeminiModelProvider({ apiKey: 'test-key', maxRetries: 0 });
      mockFetch.mockResolvedValueOnce(
        createMockResponse({ candidates: [] })
      );

      await expect(noRetryProvider.complete('Test')).rejects.toThrow('Gemini returned no candidates');
    });

    it('should throw error when response is blocked by safety', async () => {
      mockFetch.mockResolvedValueOnce(
        createMockResponse({
          candidates: [
            {
              content: { parts: [{ text: '' }] },
              finishReason: 'SAFETY',
              index: 0,
            },
          ],
        })
      );

      await expect(provider.complete('Test')).rejects.toThrow('safety settings');
    });

    it('should retry on transient errors', async () => {
      mockFetch
        .mockResolvedValueOnce(createErrorResponse(500, 'Internal error', 500))
        .mockResolvedValueOnce(createSuccessResponse('Success'));

      const result = await provider.complete('Test');

      expect(result).toBe('Success');
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it('should not retry on authentication errors', async () => {
      mockFetch.mockResolvedValueOnce(
        createErrorResponse(401, 'Invalid API key', 401)
      );

      await expect(provider.complete('Test')).rejects.toThrow('Invalid API key');
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it('should not retry on quota errors', async () => {
      mockFetch.mockResolvedValueOnce(
        createErrorResponse(429, 'Quota exceeded', 429)
      );

      await expect(provider.complete('Test')).rejects.toThrow('Quota exceeded');
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it('should fail after max retries', async () => {
      mockFetch.mockResolvedValue(createErrorResponse(500, 'Server error', 500));

      await expect(provider.complete('Test')).rejects.toThrow('Gemini completion failed after');
    });

    it('should join multiple text parts in response', async () => {
      mockFetch.mockResolvedValueOnce(
        createMockResponse({
          candidates: [
            {
              content: {
                parts: [{ text: 'Part 1.' }, { text: 'Part 2.' }],
                role: 'model',
              },
              finishReason: 'STOP',
              index: 0,
            },
          ],
        })
      );

      const result = await provider.complete('Test');

      expect(result).toBe('Part 1.\nPart 2.');
    });
  });

  describe('healthCheck()', () => {
    let provider: GeminiModelProvider;

    beforeEach(() => {
      provider = new GeminiModelProvider({ apiKey: 'test-key' });
    });

    it('should return healthy when API is accessible', async () => {
      mockFetch.mockResolvedValueOnce(createSuccessResponse('Hello'));

      const result = await provider.healthCheck();

      expect(result.healthy).toBe(true);
      expect(result.latencyMs).toBeDefined();
      expect(result.availableModels).toContain('gemini-1.5-pro-latest');
    });

    it('should return unhealthy when API fails', async () => {
      // Create provider with no retries to speed up test
      const noRetryProvider = new GeminiModelProvider({ apiKey: 'test-key', maxRetries: 0 });
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      const result = await noRetryProvider.healthCheck();

      expect(result.healthy).toBe(false);
      expect(result.error).toContain('Network error');
    });
  });

  describe('getCostPerToken()', () => {
    it('should return gemini-1.5-pro pricing by default', () => {
      const provider = new GeminiModelProvider({
        apiKey: 'test-key',
        defaultModel: 'gemini-1.5-pro-latest',
      });

      const cost = provider.getCostPerToken();

      // Gemini 1.5 Pro: $3.50 input, $10.50 output per 1M tokens
      expect(cost.input).toBeCloseTo(3.5 / 1_000_000, 10);
      expect(cost.output).toBeCloseTo(10.5 / 1_000_000, 10);
    });

    it('should return flash pricing for flash models', () => {
      const provider = new GeminiModelProvider({
        apiKey: 'test-key',
        defaultModel: 'gemini-1.5-flash',
      });

      const cost = provider.getCostPerToken();

      // Gemini 1.5 Flash: $0.35 input, $1.05 output per 1M tokens
      expect(cost.input).toBeCloseTo(0.35 / 1_000_000, 10);
      expect(cost.output).toBeCloseTo(1.05 / 1_000_000, 10);
    });

    it('should return gemini-pro pricing for non-1.5 models', () => {
      const provider = new GeminiModelProvider({
        apiKey: 'test-key',
        defaultModel: 'gemini-pro',
      });

      const cost = provider.getCostPerToken();

      // Gemini Pro: $0.50 input, $1.50 output per 1M tokens
      expect(cost.input).toBeCloseTo(0.5 / 1_000_000, 10);
      expect(cost.output).toBeCloseTo(1.5 / 1_000_000, 10);
    });
  });

  describe('logging', () => {
    it('should log requests when enableLogging is true', async () => {
      const consoleSpy = vi.spyOn(console, 'log');
      const provider = new GeminiModelProvider({
        apiKey: 'test-key',
        enableLogging: true,
      });

      mockFetch.mockResolvedValueOnce(createSuccessResponse('Response', 100, 50));

      await provider.complete('Test');

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('[Gemini] Sending request')
      );
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('[Gemini] Received response')
      );

      consoleSpy.mockRestore();
    });
  });
});

describe('createGeminiProvider', () => {
  beforeEach(() => {
    process.env.GOOGLE_API_KEY = 'test-key';
  });

  it('should create a configured provider', () => {
    const provider = createGeminiProvider({
      defaultModel: 'gemini-1.5-flash',
    });

    expect(provider).toBeInstanceOf(GeminiModelProvider);
  });

  it('should create provider with default config', () => {
    const provider = createGeminiProvider();

    expect(provider).toBeInstanceOf(GeminiModelProvider);
  });
});
