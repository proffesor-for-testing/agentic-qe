/**
 * Agentic QE v3 - LLM Providers Unit Tests
 * Tests for Claude, OpenAI, and Ollama providers
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import {
  ClaudeProvider,
  OpenAIProvider,
  OllamaProvider,
  DEFAULT_CLAUDE_CONFIG,
  DEFAULT_OPENAI_CONFIG,
  DEFAULT_OLLAMA_CONFIG,
} from '../../../../src/shared/llm/providers';

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch;

describe('ClaudeProvider', () => {
  let provider: ClaudeProvider;

  beforeEach(() => {
    vi.clearAllMocks();
    provider = new ClaudeProvider({
      apiKey: 'test-api-key',
    });
  });

  describe('configuration', () => {
    it('should use default config', () => {
      const config = provider.getConfig();
      expect(config.model).toBe(DEFAULT_CLAUDE_CONFIG.model);
      expect(config.maxTokens).toBe(DEFAULT_CLAUDE_CONFIG.maxTokens);
    });

    it('should merge custom config', () => {
      const customProvider = new ClaudeProvider({
        model: 'claude-opus-4-5-20251101',
        maxTokens: 8192,
      });

      const config = customProvider.getConfig();
      expect(config.model).toBe('claude-opus-4-5-20251101');
      expect(config.maxTokens).toBe(8192);
    });

    it('should return supported models', () => {
      const models = provider.getSupportedModels();
      expect(models).toContain('claude-opus-4-5-20251101');
      expect(models).toContain('claude-sonnet-4-20250514');
      expect(models).toContain('claude-3-5-haiku-20241022');
    });

    it('should return cost per token', () => {
      const cost = provider.getCostPerToken();
      expect(cost.input).toBeGreaterThan(0);
      expect(cost.output).toBeGreaterThan(0);
    });
  });

  describe('availability check', () => {
    it('should return false without API key', async () => {
      const noKeyProvider = new ClaudeProvider({ apiKey: undefined });

      // Clear the environment variable for this test
      const originalKey = process.env.ANTHROPIC_API_KEY;
      delete process.env.ANTHROPIC_API_KEY;

      const available = await noKeyProvider.isAvailable();
      expect(available).toBe(false);

      // Restore
      if (originalKey) process.env.ANTHROPIC_API_KEY = originalKey;
    });
  });

  describe('health check', () => {
    it('should return healthy when API responds', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            id: 'msg_test',
            type: 'message',
            content: [{ type: 'text', text: 'Hi' }],
            model: 'claude-sonnet-4-20250514',
            usage: { input_tokens: 1, output_tokens: 1 },
          }),
      });

      const result = await provider.healthCheck();

      expect(result.healthy).toBe(true);
      expect(result.latencyMs).toBeDefined();
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
            id: 'msg_test',
            type: 'message',
            role: 'assistant',
            content: [{ type: 'text', text: 'Generated response' }],
            model: 'claude-sonnet-4-20250514',
            stop_reason: 'end_turn',
            usage: { input_tokens: 10, output_tokens: 20 },
          }),
      });

      const response = await provider.generate('Test prompt');

      expect(response.content).toBe('Generated response');
      expect(response.provider).toBe('claude');
      expect(response.usage.promptTokens).toBe(10);
      expect(response.usage.completionTokens).toBe(20);
      expect(response.cost.totalCost).toBeGreaterThan(0);
    });

    it('should generate text from message array', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            id: 'msg_test',
            type: 'message',
            role: 'assistant',
            content: [{ type: 'text', text: 'Response' }],
            model: 'claude-sonnet-4-20250514',
            stop_reason: 'end_turn',
            usage: { input_tokens: 15, output_tokens: 10 },
          }),
      });

      const response = await provider.generate([
        { role: 'user', content: 'Hello' },
        { role: 'assistant', content: 'Hi there!' },
        { role: 'user', content: 'How are you?' },
      ]);

      expect(response.content).toBe('Response');
    });

    it('should handle rate limiting', async () => {
      // Mock all retries to return 429
      mockFetch.mockResolvedValue({
        ok: false,
        status: 429,
        json: () =>
          Promise.resolve({
            error: { type: 'rate_limit_error', message: 'Rate limited' },
          }),
      });

      // Create a provider with no retries for this test
      const noRetryProvider = new ClaudeProvider({
        apiKey: 'test-api-key',
        maxRetries: 1,
      });

      await expect(noRetryProvider.generate('Test')).rejects.toMatchObject({
        code: 'RATE_LIMITED',
        retryable: true,
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
              message: 'context length exceeded',
            },
          }),
      });

      await expect(provider.generate('Test')).rejects.toMatchObject({
        code: 'CONTEXT_LENGTH_EXCEEDED',
        retryable: false,
      });
    });
  });

  describe('embed', () => {
    it('should throw error as Claude does not support embeddings', async () => {
      await expect(provider.embed('test')).rejects.toMatchObject({
        code: 'MODEL_NOT_FOUND',
      });
    });
  });

  describe('complete', () => {
    it('should complete text using generate', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            id: 'msg_test',
            type: 'message',
            role: 'assistant',
            content: [{ type: 'text', text: 'completed' }],
            model: 'claude-sonnet-4-20250514',
            stop_reason: 'end_turn',
            usage: { input_tokens: 5, output_tokens: 3 },
          }),
      });

      const response = await provider.complete('function add(');

      expect(response.completion).toBe('completed');
      expect(response.provider).toBe('claude');
    });
  });
});

describe('OpenAIProvider', () => {
  let provider: OpenAIProvider;

  beforeEach(() => {
    vi.clearAllMocks();
    provider = new OpenAIProvider({
      apiKey: 'test-api-key',
    });
  });

  describe('configuration', () => {
    it('should use default config', () => {
      const config = provider.getConfig();
      expect(config.model).toBe(DEFAULT_OPENAI_CONFIG.model);
    });

    it('should return supported models', () => {
      const models = provider.getSupportedModels();
      expect(models).toContain('gpt-4o');
      expect(models).toContain('gpt-4o-mini');
      expect(models).toContain('gpt-3.5-turbo');
    });
  });

  describe('generate', () => {
    it('should generate text', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            id: 'chatcmpl-test',
            object: 'chat.completion',
            model: 'gpt-4o',
            choices: [
              {
                index: 0,
                message: { role: 'assistant', content: 'OpenAI response' },
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

      expect(response.content).toBe('OpenAI response');
      expect(response.provider).toBe('openai');
      expect(response.finishReason).toBe('stop');
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
              model: 'gpt-4o',
              choices: [
                {
                  index: 0,
                  message: { role: 'assistant', content: 'Response' },
                  finish_reason: 'stop',
                },
              ],
              usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 },
            }),
        });
      });

      await provider.generate('Test', {
        systemPrompt: 'You are a helpful assistant',
      });
    });
  });

  describe('embed', () => {
    it('should generate embeddings', async () => {
      const mockEmbedding = new Array(1536).fill(0).map((_, i) => i / 1536);

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            object: 'list',
            data: [{ object: 'embedding', index: 0, embedding: mockEmbedding }],
            model: 'text-embedding-3-small',
            usage: { prompt_tokens: 5, total_tokens: 5 },
          }),
      });

      const response = await provider.embed('Test text');

      expect(response.embedding).toEqual(mockEmbedding);
      expect(response.provider).toBe('openai');
      expect(response.tokenCount).toBe(5);
    });
  });
});

describe('OllamaProvider', () => {
  let provider: OllamaProvider;

  beforeEach(() => {
    vi.clearAllMocks();
    provider = new OllamaProvider();
  });

  describe('configuration', () => {
    it('should use default config', () => {
      const config = provider.getConfig();
      expect(config.model).toBe(DEFAULT_OLLAMA_CONFIG.model);
      expect(config.baseUrl).toBe('http://localhost:11434');
    });

    it('should return zero cost', () => {
      const cost = provider.getCostPerToken();
      expect(cost.input).toBe(0);
      expect(cost.output).toBe(0);
    });

    it('should return supported models', () => {
      const models = provider.getSupportedModels();
      expect(models).toContain('llama3');
      expect(models).toContain('codellama');
      expect(models).toContain('mistral');
    });
  });

  describe('health check', () => {
    it('should return healthy when Ollama is running', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            models: [
              { name: 'llama3.1:latest', model: 'llama3.1' },
              { name: 'codellama:latest', model: 'codellama' },
            ],
          }),
      });

      const result = await provider.healthCheck();

      expect(result.healthy).toBe(true);
      expect(result.models).toContain('llama3.1');
      expect(result.models).toContain('codellama');
    });

    it('should return unhealthy when Ollama is not running', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Connection refused'));

      const result = await provider.healthCheck();

      expect(result.healthy).toBe(false);
      expect(result.error).toContain('Ollama not running');
    });
  });

  describe('generate', () => {
    it('should generate text using generate API', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            model: 'llama3.1',
            created_at: '2025-01-09T12:00:00Z',
            response: 'Ollama response',
            done: true,
            prompt_eval_count: 10,
            eval_count: 20,
          }),
      });

      const response = await provider.generate('Test prompt');

      expect(response.content).toBe('Ollama response');
      expect(response.provider).toBe('ollama');
      expect(response.cost.totalCost).toBe(0); // Local = free
    });

    it('should generate text using chat API for messages', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            model: 'llama3.1',
            created_at: '2025-01-09T12:00:00Z',
            message: { role: 'assistant', content: 'Chat response' },
            done: true,
            prompt_eval_count: 15,
            eval_count: 25,
          }),
      });

      const response = await provider.generate([
        { role: 'user', content: 'Hello' },
      ]);

      expect(response.content).toBe('Chat response');
    });

    it('should handle model not found', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        text: () => Promise.resolve('model not found'),
      });

      await expect(provider.generate('Test')).rejects.toMatchObject({
        code: 'MODEL_NOT_FOUND',
      });
    });
  });

  describe('embed', () => {
    it('should generate embeddings', async () => {
      const mockEmbedding = new Array(768).fill(0).map((_, i) => i / 768);

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ embedding: mockEmbedding }),
      });

      const response = await provider.embed('Test text');

      expect(response.embedding).toEqual(mockEmbedding);
      expect(response.provider).toBe('ollama');
    });
  });

  describe('complete', () => {
    it('should complete text with low temperature', async () => {
      mockFetch.mockImplementationOnce((url, options) => {
        const body = JSON.parse(options.body as string);
        expect(body.options.temperature).toBe(0.1); // Low for completion

        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              model: 'llama3.1',
              created_at: '2025-01-09T12:00:00Z',
              response: 'a, b) { return a + b; }',
              done: true,
              prompt_eval_count: 5,
              eval_count: 10,
            }),
        });
      });

      const response = await provider.complete('function add(');

      expect(response.completion).toBe('a, b) { return a + b; }');
    });
  });

  describe('pullModel', () => {
    it('should pull a model', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ status: 'success' }),
      });

      await expect(provider.pullModel('llama3.2')).resolves.toBeUndefined();
    });

    it('should handle pull failure', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        text: () => Promise.resolve('Pull failed'),
      });

      await expect(provider.pullModel('nonexistent')).rejects.toMatchObject({
        code: 'MODEL_NOT_FOUND',
      });
    });
  });
});
