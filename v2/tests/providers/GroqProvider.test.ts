/**
 * GroqProvider Tests
 *
 * Comprehensive test suite for Groq LLM provider implementation
 * Tests cover all core functionality with mocked fetch responses
 */

import { GroqProvider, GroqProviderConfig } from '../../src/providers/GroqProvider';
import { LLMProviderError } from '../../src/providers/ILLMProvider';

// Mock global fetch
const originalFetch = global.fetch;
let mockFetch: jest.Mock;

describe('GroqProvider', () => {
  beforeEach(() => {
    // Reset mock fetch before each test
    mockFetch = jest.fn();
    global.fetch = mockFetch;

    // Clear environment variables
    delete process.env.GROQ_API_KEY;
  });

  afterEach(() => {
    // Restore original fetch
    global.fetch = originalFetch;
    jest.clearAllMocks();
  });

  describe('initialization', () => {
    it('should initialize successfully with valid API key', async () => {
      const config: GroqProviderConfig = {
        apiKey: 'test-api-key-12345'
      };

      // Mock health check (models endpoint)
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          data: [
            { id: 'llama-3.3-70b-versatile' },
            { id: 'mixtral-8x7b-32768' }
          ]
        })
      } as Response);

      const provider = new GroqProvider(config);
      await provider.initialize();

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.groq.com/openai/v1/models',
        expect.objectContaining({
          method: 'GET',
          headers: {
            'Authorization': 'Bearer test-api-key-12345'
          }
        })
      );
    });

    it('should use GROQ_API_KEY environment variable', async () => {
      process.env.GROQ_API_KEY = 'env-api-key-67890';

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ data: [] })
      } as Response);

      const provider = new GroqProvider();
      await provider.initialize();

      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: {
            'Authorization': 'Bearer env-api-key-67890'
          }
        })
      );
    });

    it('should throw error if API key is missing', async () => {
      const provider = new GroqProvider();

      await expect(provider.initialize()).rejects.toThrow(LLMProviderError);
      await expect(provider.initialize()).rejects.toThrow(/API key is required/);
    });

    it('should throw error if health check fails', async () => {
      const config: GroqProviderConfig = {
        apiKey: 'test-api-key'
      };

      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 503,
        json: async () => ({ error: { message: 'Service unavailable' } })
      } as Response);

      const provider = new GroqProvider(config);

      await expect(provider.initialize()).rejects.toThrow(LLMProviderError);
    });

    it('should not re-initialize if already initialized', async () => {
      const config: GroqProviderConfig = {
        apiKey: 'test-api-key'
      };

      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ data: [] })
      } as Response);

      const provider = new GroqProvider(config);
      await provider.initialize();

      mockFetch.mockClear();
      await provider.initialize();

      expect(mockFetch).not.toHaveBeenCalled();
    });
  });

  describe('complete', () => {
    let provider: GroqProvider;

    beforeEach(async () => {
      const config: GroqProviderConfig = {
        apiKey: 'test-api-key'
      };

      // Mock health check
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ data: [] })
      } as Response);

      provider = new GroqProvider(config);
      await provider.initialize();
      mockFetch.mockClear();
    });

    it('should complete successfully with token counting', async () => {
      const mockResponse = {
        id: 'chatcmpl-123',
        object: 'chat.completion',
        created: 1234567890,
        model: 'llama-3.3-70b-versatile',
        choices: [{
          index: 0,
          message: {
            role: 'assistant',
            content: 'Hello! How can I help you today?'
          },
          finish_reason: 'stop',
          logprobs: null
        }],
        usage: {
          prompt_tokens: 10,
          completion_tokens: 15,
          total_tokens: 25,
          queue_time: 0.05,
          prompt_time: 0.1,
          completion_time: 0.2,
          total_time: 0.35
        },
        system_fingerprint: 'fp_123abc'
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => mockResponse
      } as Response);

      const response = await provider.complete({
        model: 'llama-3.3-70b-versatile',
        messages: [
          { role: 'user', content: 'Hello' }
        ]
      });

      expect(response.content[0].text).toBe('Hello! How can I help you today?');
      expect(response.usage.input_tokens).toBe(10);
      expect(response.usage.output_tokens).toBe(15);
      expect(response.model).toBe('llama-3.3-70b-versatile');
      expect(response.stop_reason).toBe('end_turn');
      expect(response.metadata?.cost).toBe(0); // Free tier
    });

    it('should include system messages in request', async () => {
      const mockResponse = {
        id: 'chatcmpl-123',
        object: 'chat.completion',
        created: 1234567890,
        model: 'llama-3.3-70b-versatile',
        choices: [{
          index: 0,
          message: { role: 'assistant', content: 'Response' },
          finish_reason: 'stop',
          logprobs: null
        }],
        usage: { prompt_tokens: 20, completion_tokens: 10, total_tokens: 30 },
        system_fingerprint: 'fp_123'
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => mockResponse
      } as Response);

      await provider.complete({
        model: 'llama-3.3-70b-versatile',
        system: [
          { type: 'text', text: 'You are a helpful assistant.' }
        ],
        messages: [
          { role: 'user', content: 'Hello' }
        ]
      });

      const requestBody = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(requestBody.messages).toHaveLength(2);
      expect(requestBody.messages[0].role).toBe('system');
      expect(requestBody.messages[0].content).toBe('You are a helpful assistant.');
      expect(requestBody.messages[1].role).toBe('user');
    });

    it('should handle rate limiting with retry', async () => {
      // First request: rate limited
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 429,
        headers: new Headers({ 'retry-after': '2' }),
        json: async () => ({ error: { message: 'Rate limit exceeded' } })
      } as Response);

      // Second request: success
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          id: 'chatcmpl-123',
          object: 'chat.completion',
          created: 1234567890,
          model: 'llama-3.3-70b-versatile',
          choices: [{
            index: 0,
            message: { role: 'assistant', content: 'Success after retry' },
            finish_reason: 'stop',
            logprobs: null
          }],
          usage: { prompt_tokens: 10, completion_tokens: 10, total_tokens: 20 },
          system_fingerprint: 'fp_123'
        })
      } as Response);

      const response = await provider.complete({
        model: 'llama-3.3-70b-versatile',
        messages: [{ role: 'user', content: 'Test' }]
      });

      expect(response.content[0].text).toBe('Success after retry');
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it('should throw LLMProviderError on repeated rate limiting', async () => {
      // Mock 4 rate limit responses (exceeds maxRetries=3)
      for (let i = 0; i < 4; i++) {
        mockFetch.mockResolvedValueOnce({
          ok: false,
          status: 429,
          headers: new Headers(),
          json: async () => ({ error: { message: 'Rate limit exceeded' } })
        } as Response);
      }

      try {
        await provider.complete({
          model: 'llama-3.3-70b-versatile',
          messages: [{ role: 'user', content: 'Test' }]
        });
        fail('Should have thrown LLMProviderError');
      } catch (error) {
        expect(error).toBeInstanceOf(LLMProviderError);
        expect((error as LLMProviderError).code).toBe('RATE_LIMITED');
        expect((error as Error).message).toContain('Rate limit exceeded');
      }
    });

    it('should handle authentication errors', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        json: async () => ({
          error: {
            message: 'Invalid API key',
            type: 'invalid_request_error',
            code: null
          }
        })
      } as Response);

      try {
        await provider.complete({
          model: 'llama-3.3-70b-versatile',
          messages: [{ role: 'user', content: 'Test' }]
        });
        fail('Should have thrown LLMProviderError');
      } catch (error) {
        expect(error).toBeInstanceOf(LLMProviderError);
        expect((error as LLMProviderError).code).toBe('AUTH_ERROR');
        expect((error as LLMProviderError).retryable).toBe(false);
        expect((error as Error).message).toContain('Authentication failed');
      }
    });

    it('should map finish reasons correctly', async () => {
      const testCases = [
        { finish_reason: 'stop', expected: 'end_turn' },
        { finish_reason: 'length', expected: 'max_tokens' },
        { finish_reason: 'content_filter', expected: 'stop_sequence' }
      ];

      for (const testCase of testCases) {
        mockFetch.mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: async () => ({
            id: 'chatcmpl-123',
            object: 'chat.completion',
            created: 1234567890,
            model: 'llama-3.3-70b-versatile',
            choices: [{
              index: 0,
              message: { role: 'assistant', content: 'Test' },
              finish_reason: testCase.finish_reason,
              logprobs: null
            }],
            usage: { prompt_tokens: 10, completion_tokens: 10, total_tokens: 20 },
            system_fingerprint: 'fp_123'
          })
        } as Response);

        const response = await provider.complete({
          model: 'llama-3.3-70b-versatile',
          messages: [{ role: 'user', content: 'Test' }]
        });

        expect(response.stop_reason).toBe(testCase.expected);
      }
    });

    it('should throw error if not initialized', async () => {
      const uninitializedProvider = new GroqProvider({ apiKey: 'test' });

      await expect(
        uninitializedProvider.complete({
          model: 'llama-3.3-70b-versatile',
          messages: [{ role: 'user', content: 'Test' }]
        })
      ).rejects.toThrow(/not initialized/);
    });
  });

  describe('streamComplete', () => {
    let provider: GroqProvider;

    beforeEach(async () => {
      const config: GroqProviderConfig = {
        apiKey: 'test-api-key'
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ data: [] })
      } as Response);

      provider = new GroqProvider(config);
      await provider.initialize();
      mockFetch.mockClear();
    });

    it('should stream completion successfully', async () => {
      const chunks = [
        'data: {"id":"chatcmpl-123","object":"chat.completion.chunk","created":1234567890,"model":"llama-3.3-70b-versatile","choices":[{"index":0,"delta":{"role":"assistant"},"finish_reason":null}]}\n',
        'data: {"id":"chatcmpl-123","object":"chat.completion.chunk","created":1234567890,"model":"llama-3.3-70b-versatile","choices":[{"index":0,"delta":{"content":"Hello"},"finish_reason":null}]}\n',
        'data: {"id":"chatcmpl-123","object":"chat.completion.chunk","created":1234567890,"model":"llama-3.3-70b-versatile","choices":[{"index":0,"delta":{"content":"!"},"finish_reason":null}]}\n',
        'data: {"id":"chatcmpl-123","object":"chat.completion.chunk","created":1234567890,"model":"llama-3.3-70b-versatile","choices":[{"index":0,"delta":{},"finish_reason":"stop"}]}\n',
        'data: [DONE]\n'
      ];

      const encoder = new TextEncoder();
      const stream = new ReadableStream({
        start(controller) {
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
      } as Response);

      const events = [];
      for await (const event of provider.streamComplete({
        model: 'llama-3.3-70b-versatile',
        messages: [{ role: 'user', content: 'Hi' }]
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
        delta: { type: 'text_delta', text: '!' }
      });
      expect(events).toContainEqual({ type: 'content_block_stop' });
      expect(events).toContainEqual({ type: 'message_stop' });
    });

    it('should handle streaming rate limit errors', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 429,
        json: async () => ({ error: { message: 'Rate limit exceeded' } })
      } as Response);

      const stream = provider.streamComplete({
        model: 'llama-3.3-70b-versatile',
        messages: [{ role: 'user', content: 'Test' }]
      });

      await expect(async () => {
        for await (const event of stream) {
          // Should not reach here
        }
      }).rejects.toThrow(LLMProviderError);
    });

    it('should handle streaming authentication errors', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        json: async () => ({ error: { message: 'Invalid API key' } })
      } as Response);

      const stream = provider.streamComplete({
        model: 'llama-3.3-70b-versatile',
        messages: [{ role: 'user', content: 'Test' }]
      });

      try {
        for await (const event of stream) {
          // Should not reach here
        }
        fail('Should have thrown error');
      } catch (error) {
        expect((error as LLMProviderError).code).toBe('AUTH_ERROR');
      }
    });
  });

  describe('embed', () => {
    let provider: GroqProvider;

    beforeEach(async () => {
      const config: GroqProviderConfig = {
        apiKey: 'test-api-key'
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ data: [] })
      } as Response);

      provider = new GroqProvider(config);
      await provider.initialize();
      mockFetch.mockClear();
    });

    it('should throw error for unsupported embeddings', async () => {
      await expect(
        provider.embed({ text: 'Test text' })
      ).rejects.toThrow(LLMProviderError);

      await expect(
        provider.embed({ text: 'Test text' })
      ).rejects.toThrow(/does not support embeddings/);
    });
  });

  describe('healthCheck', () => {
    it('should return healthy status on success', async () => {
      const config: GroqProviderConfig = {
        apiKey: 'test-api-key'
      };

      // Health check during initialization
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ data: [] })
      } as Response);

      const provider = new GroqProvider(config);
      await provider.initialize();

      // Actual health check
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ data: [] })
      } as Response);

      const health = await provider.healthCheck();

      expect(health.healthy).toBe(true);
      expect(health.latency).toBeGreaterThanOrEqual(0);
      expect(health.timestamp).toBeInstanceOf(Date);
      expect(health.metadata?.baseUrl).toBe('https://api.groq.com/openai/v1');
    });

    it('should return unhealthy status on failure', async () => {
      const config: GroqProviderConfig = {
        apiKey: 'test-api-key'
      };

      // Successful initialization
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ data: [] })
      } as Response);

      const provider = new GroqProvider(config);
      await provider.initialize();

      // Failed health check
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 503,
        json: async () => ({ error: { message: 'Service unavailable' } })
      } as Response);

      const health = await provider.healthCheck();

      expect(health.healthy).toBe(false);
      expect(health.error).toBeDefined();
    });
  });

  describe('getMetadata', () => {
    it('should return correct provider metadata', () => {
      const provider = new GroqProvider({ apiKey: 'test' });
      const metadata = provider.getMetadata();

      expect(metadata.name).toBe('groq');
      expect(metadata.version).toBe('1.0.0');
      expect(metadata.models).toContain('llama-3.3-70b-versatile');
      expect(metadata.models).toContain('deepseek-r1-distill-llama-70b');
      expect(metadata.models).toContain('mixtral-8x7b-32768');
      expect(metadata.capabilities.streaming).toBe(true);
      expect(metadata.capabilities.caching).toBe(false); // No caching implementation
      expect(metadata.capabilities.embeddings).toBe(false);
      expect(metadata.capabilities.vision).toBe(false);
      expect(metadata.costs.inputPerMillion).toBe(0);
      expect(metadata.costs.outputPerMillion).toBe(0);
      expect(metadata.location).toBe('cloud');
    });
  });

  describe('trackCost', () => {
    it('should return zero cost for free tier', () => {
      const provider = new GroqProvider({ apiKey: 'test' });

      const cost = provider.trackCost({
        input_tokens: 1000,
        output_tokens: 500
      });

      expect(cost).toBe(0);
    });
  });

  describe('countTokens', () => {
    let provider: GroqProvider;

    beforeEach(async () => {
      const config: GroqProviderConfig = {
        apiKey: 'test-api-key'
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ data: [] })
      } as Response);

      provider = new GroqProvider(config);
      await provider.initialize();
      mockFetch.mockClear();
    });

    it('should estimate token count correctly', async () => {
      const text = 'Hello, world!'; // 13 characters ≈ 4 tokens
      const tokenCount = await provider.countTokens({ text });

      expect(tokenCount).toBe(Math.ceil(text.length / 4));
    });
  });

  describe('shutdown', () => {
    it('should shutdown successfully', async () => {
      const config: GroqProviderConfig = {
        apiKey: 'test-api-key'
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ data: [] })
      } as Response);

      const provider = new GroqProvider(config);
      await provider.initialize();
      await provider.shutdown();

      // Should throw error after shutdown
      await expect(
        provider.complete({
          model: 'llama-3.3-70b-versatile',
          messages: [{ role: 'user', content: 'Test' }]
        })
      ).rejects.toThrow(/not initialized/);
    });
  });
});
