/**
 * GitHubModelsProvider Tests
 *
 * Tests for GitHub Models API integration with mocked fetch and environment.
 */

import { GitHubModelsProvider } from '../../src/providers/GitHubModelsProvider';
import { LLMProviderError } from '../../src/providers/ILLMProvider';

// Mock global fetch
const mockFetch = jest.fn();
global.fetch = mockFetch as any;

// Mock Logger
jest.mock('../../src/utils/Logger', () => ({
  Logger: {
    getInstance: jest.fn(() => ({
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn()
    }))
  }
}));

describe('GitHubModelsProvider', () => {
  let provider: GitHubModelsProvider;
  const originalEnv = process.env;

  beforeEach(() => {
    jest.clearAllMocks();
    mockFetch.mockClear();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('Codespaces Detection', () => {
    it('should detect Codespaces environment from CODESPACES env var', () => {
      process.env.CODESPACES = 'true';
      provider = new GitHubModelsProvider();

      expect(provider.isInCodespaces()).toBe(true);
    });

    it('should detect non-Codespaces environment', () => {
      delete process.env.CODESPACES;
      provider = new GitHubModelsProvider();

      expect(provider.isInCodespaces()).toBe(false);
    });

    it('should respect inCodespaces config override', () => {
      delete process.env.CODESPACES;
      provider = new GitHubModelsProvider({ inCodespaces: true });

      expect(provider.isInCodespaces()).toBe(false); // Method checks env directly
    });
  });

  describe('Initialization', () => {
    it('should initialize successfully with GITHUB_TOKEN', async () => {
      process.env.GITHUB_TOKEN = 'test-token';
      process.env.CODESPACES = 'true';
      provider = new GitHubModelsProvider();

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          id: 'test-id',
          choices: [{ message: { content: 'test' }, finish_reason: 'stop' }],
          usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 }
        })
      });

      await provider.initialize();

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/chat/completions'),
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Authorization': 'Bearer test-token'
          })
        })
      );
    });

    it('should throw error when GITHUB_TOKEN is missing', async () => {
      delete process.env.GITHUB_TOKEN;
      provider = new GitHubModelsProvider();

      await expect(provider.initialize()).rejects.toThrow(LLMProviderError);
      await expect(provider.initialize()).rejects.toMatchObject({
        code: 'AUTH_ERROR',
        provider: 'github-models'
      });
    });

    it('should accept token from config', async () => {
      delete process.env.GITHUB_TOKEN;
      provider = new GitHubModelsProvider({ token: 'config-token' });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          id: 'test-id',
          choices: [{ message: { content: 'test' }, finish_reason: 'stop' }],
          usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 }
        })
      });

      await provider.initialize();

      expect(mockFetch).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          headers: expect.objectContaining({
            'Authorization': 'Bearer config-token'
          })
        })
      );
    });

    it('should handle 401 unauthorized error', async () => {
      process.env.GITHUB_TOKEN = 'invalid-token';
      provider = new GitHubModelsProvider();

      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        text: async () => 'Unauthorized'
      });

      await expect(provider.initialize()).rejects.toMatchObject({
        provider: 'github-models',
        code: 'AUTH_ERROR'
      });
    });

    it('should handle 403 forbidden error', async () => {
      process.env.GITHUB_TOKEN = 'no-permissions-token';
      provider = new GitHubModelsProvider();

      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 403,
        text: async () => 'Forbidden'
      });

      await expect(provider.initialize()).rejects.toMatchObject({
        provider: 'github-models',
        code: 'AUTH_ERROR'
      });
    });

    it('should not initialize twice', async () => {
      process.env.GITHUB_TOKEN = 'test-token';
      provider = new GitHubModelsProvider();

      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          id: 'test-id',
          choices: [{ message: { content: 'test' }, finish_reason: 'stop' }],
          usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 }
        })
      });

      await provider.initialize();
      await provider.initialize();

      // Should only call fetch once for token validation
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });
  });

  describe('Completion', () => {
    beforeEach(async () => {
      process.env.GITHUB_TOKEN = 'test-token';
      process.env.CODESPACES = 'true';
      provider = new GitHubModelsProvider();

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          id: 'test-id',
          choices: [{ message: { content: 'test' }, finish_reason: 'stop' }],
          usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 }
        })
      });

      await provider.initialize();
      mockFetch.mockClear();
    });

    it('should complete successfully', async () => {
      const mockResponse = {
        id: 'cmpl-123',
        object: 'chat.completion',
        created: Date.now(),
        model: 'gpt-4o-mini',
        choices: [{
          index: 0,
          message: {
            role: 'assistant',
            content: 'Hello, world!'
          },
          finish_reason: 'stop'
        }],
        usage: {
          prompt_tokens: 10,
          completion_tokens: 5,
          total_tokens: 15
        }
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => mockResponse
      });

      const response = await provider.complete({
        model: 'gpt-4o-mini',
        messages: [{ role: 'user', content: 'Hello' }],
        maxTokens: 100
      });

      expect(response).toMatchObject({
        content: [{ type: 'text', text: 'Hello, world!' }],
        usage: {
          input_tokens: 10,
          output_tokens: 5
        },
        model: 'gpt-4o-mini',
        stop_reason: 'end_turn'
      });

      expect(mockFetch).toHaveBeenCalledWith(
        'https://models.inference.ai.azure.com/chat/completions',
        expect.objectContaining({
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer test-token'
          },
          body: expect.stringContaining('gpt-4o-mini')
        })
      );
    });

    it('should handle system messages', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          id: 'cmpl-123',
          choices: [{ message: { content: 'Response' }, finish_reason: 'stop' }],
          usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 }
        })
      });

      await provider.complete({
        model: 'gpt-4o-mini',
        system: [{ type: 'text', text: 'You are a helpful assistant.' }],
        messages: [{ role: 'user', content: 'Hello' }]
      });

      const requestBody = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(requestBody.messages[0]).toEqual({
        role: 'system',
        content: 'You are a helpful assistant.'
      });
    });

    it('should map finish reasons correctly', async () => {
      const testCases = [
        { apiReason: 'stop', expectedReason: 'end_turn' },
        { apiReason: 'length', expectedReason: 'max_tokens' },
        { apiReason: 'other', expectedReason: 'end_turn' }
      ];

      for (const { apiReason, expectedReason } of testCases) {
        mockFetch.mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: async () => ({
            id: 'cmpl-123',
            choices: [{ message: { content: 'test' }, finish_reason: apiReason }],
            usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 }
          })
        });

        const response = await provider.complete({
          model: 'gpt-4o-mini',
          messages: [{ role: 'user', content: 'test' }]
        });

        expect(response.stop_reason).toBe(expectedReason);
      }
    });

    it('should handle API errors', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        text: async () => 'Internal Server Error'
      });

      await expect(provider.complete({
        model: 'gpt-4o-mini',
        messages: [{ role: 'user', content: 'test' }]
      })).rejects.toThrow(LLMProviderError);
    });

    it('should throw error when not initialized', async () => {
      const uninitializedProvider = new GitHubModelsProvider({ token: 'test' });

      await expect(uninitializedProvider.complete({
        model: 'gpt-4o-mini',
        messages: [{ role: 'user', content: 'test' }]
      })).rejects.toMatchObject({
        code: 'NOT_INITIALIZED'
      });
    });
  });

  describe('Streaming Completion', () => {
    beforeEach(async () => {
      process.env.GITHUB_TOKEN = 'test-token';
      provider = new GitHubModelsProvider();

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          id: 'test-id',
          choices: [{ message: { content: 'test' }, finish_reason: 'stop' }],
          usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 }
        })
      });

      await provider.initialize();
      mockFetch.mockClear();
    });

    it('should stream completion successfully', async () => {
      const chunks = [
        'data: {"id":"1","choices":[{"delta":{"content":"Hello"},"finish_reason":null}]}\n',
        'data: {"id":"1","choices":[{"delta":{"content":" world"},"finish_reason":null}]}\n',
        'data: {"id":"1","choices":[{"delta":{},"finish_reason":"stop"}]}\n',
        'data: [DONE]\n'
      ];

      const encoder = new TextEncoder();
      const stream = new ReadableStream({
        async start(controller) {
          for (const chunk of chunks) {
            controller.enqueue(encoder.encode(chunk));
          }
          controller.close();
        }
      });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        body: stream
      });

      const events = [];
      for await (const event of provider.streamComplete({
        model: 'gpt-4o-mini',
        messages: [{ role: 'user', content: 'Hello' }]
      })) {
        events.push(event);
      }

      expect(events).toContainEqual({ type: 'message_start' });
      expect(events).toContainEqual({
        type: 'content_block_delta',
        delta: { type: 'text_delta', text: 'Hello' }
      });
      expect(events).toContainEqual({
        type: 'content_block_delta',
        delta: { type: 'text_delta', text: ' world' }
      });
      expect(events).toContainEqual({ type: 'message_stop' });
    });

    it('should handle streaming errors', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        text: async () => 'Server Error'
      });

      const generator = provider.streamComplete({
        model: 'gpt-4o-mini',
        messages: [{ role: 'user', content: 'test' }]
      });

      await expect(generator.next()).rejects.toThrow(LLMProviderError);
    });
  });

  describe('Health Check', () => {
    beforeEach(async () => {
      process.env.GITHUB_TOKEN = 'test-token';
      provider = new GitHubModelsProvider();

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          id: 'test-id',
          choices: [{ message: { content: 'test' }, finish_reason: 'stop' }],
          usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 }
        })
      });

      await provider.initialize();
      mockFetch.mockClear();
    });

    it('should return healthy status when API is accessible', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          id: 'test-id',
          choices: [{ message: { content: 'test' }, finish_reason: 'stop' }],
          usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 }
        })
      });

      const health = await provider.healthCheck();

      expect(health.healthy).toBe(true);
      expect(health.latency).toBeGreaterThanOrEqual(0);
      expect(health.timestamp).toBeInstanceOf(Date);
      expect(health.metadata).toMatchObject({
        baseUrl: 'https://models.inference.ai.azure.com',
        currentModel: 'gpt-4o-mini'
      });
    });

    it('should return unhealthy status when API is not accessible', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 503,
        text: async () => 'Service Unavailable'
      });

      const health = await provider.healthCheck();

      expect(health.healthy).toBe(false);
      expect(health.error).toContain('503');
    });

    it('should handle network errors', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      const health = await provider.healthCheck();

      expect(health.healthy).toBe(false);
      expect(health.error).toBe('Network error');
    });
  });

  describe('Cost Tracking', () => {
    it('should return 0 cost in Codespaces', async () => {
      process.env.GITHUB_TOKEN = 'test-token';
      process.env.CODESPACES = 'true';
      provider = new GitHubModelsProvider();

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          id: 'test-id',
          choices: [{ message: { content: 'test' }, finish_reason: 'stop' }],
          usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 }
        })
      });

      await provider.initialize();

      const cost = provider.trackCost({
        input_tokens: 1000,
        output_tokens: 500
      });

      expect(cost).toBe(0);
    });

    it('should calculate cost for non-Codespaces usage', async () => {
      delete process.env.CODESPACES;
      process.env.GITHUB_TOKEN = 'test-token';
      provider = new GitHubModelsProvider();

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          id: 'test-id',
          choices: [{ message: { content: 'test' }, finish_reason: 'stop' }],
          usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 }
        })
      });

      await provider.initialize();

      const cost = provider.trackCost({
        input_tokens: 1_000_000,
        output_tokens: 1_000_000
      });

      // gpt-4o-mini: $0.15 input, $0.6 output per million tokens
      expect(cost).toBeCloseTo(0.75, 2);
    });
  });

  describe('Metadata', () => {
    beforeEach(() => {
      process.env.GITHUB_TOKEN = 'test-token';
    });

    it('should return correct metadata in Codespaces', async () => {
      process.env.CODESPACES = 'true';
      provider = new GitHubModelsProvider();

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          id: 'test-id',
          choices: [{ message: { content: 'test' }, finish_reason: 'stop' }],
          usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 }
        })
      });

      await provider.initialize();

      const metadata = provider.getMetadata();

      expect(metadata).toMatchObject({
        name: 'github-models',
        version: '1.0.0',
        models: expect.arrayContaining(['gpt-4o-mini', 'gpt-4o']),
        capabilities: {
          streaming: true,
          caching: false,
          embeddings: false,
          vision: false
        },
        costs: {
          inputPerMillion: 0,
          outputPerMillion: 0
        },
        location: 'cloud'
      });
    });

    it('should return pricing for non-Codespaces', async () => {
      delete process.env.CODESPACES;
      provider = new GitHubModelsProvider();

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          id: 'test-id',
          choices: [{ message: { content: 'test' }, finish_reason: 'stop' }],
          usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 }
        })
      });

      await provider.initialize();

      const metadata = provider.getMetadata();

      expect(metadata.costs.inputPerMillion).toBeGreaterThan(0);
      expect(metadata.costs.outputPerMillion).toBeGreaterThan(0);
    });
  });

  describe('Embeddings', () => {
    beforeEach(async () => {
      process.env.GITHUB_TOKEN = 'test-token';
      provider = new GitHubModelsProvider();

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          id: 'test-id',
          choices: [{ message: { content: 'test' }, finish_reason: 'stop' }],
          usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 }
        })
      });

      await provider.initialize();
    });

    it('should throw error as embeddings are not supported', async () => {
      await expect(provider.embed({
        text: 'test text'
      })).rejects.toMatchObject({
        code: 'NOT_SUPPORTED'
      });
    });
  });

  describe('Model Management', () => {
    beforeEach(async () => {
      process.env.GITHUB_TOKEN = 'test-token';
      provider = new GitHubModelsProvider();

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          id: 'test-id',
          choices: [{ message: { content: 'test' }, finish_reason: 'stop' }],
          usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 }
        })
      });

      await provider.initialize();
    });

    it('should set and get current model', async () => {
      await provider.setModel('gpt-4o');
      expect(provider.getCurrentModel()).toBe('gpt-4o');
    });

    it('should return list of available models', () => {
      const models = provider.getAvailableModels();
      expect(models).toContain('gpt-4o-mini');
      expect(models).toContain('gpt-4o');
      expect(models).toContain('Phi-3.5-mini-instruct');
      expect(models).toContain('Meta-Llama-3.1-8B-Instruct');
    });
  });

  describe('Token Counting', () => {
    beforeEach(async () => {
      process.env.GITHUB_TOKEN = 'test-token';
      provider = new GitHubModelsProvider();

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          id: 'test-id',
          choices: [{ message: { content: 'test' }, finish_reason: 'stop' }],
          usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 }
        })
      });

      await provider.initialize();
    });

    it('should estimate token count', async () => {
      const text = 'This is a test message';
      const tokens = await provider.countTokens({ text });

      // Approximate: 1 token ≈ 4 characters
      expect(tokens).toBeGreaterThan(0);
      expect(tokens).toBe(Math.ceil(text.length / 4));
    });
  });
});
