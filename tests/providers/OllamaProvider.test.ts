/**
 * OllamaProvider Unit Tests
 *
 * Tests for the Ollama local LLM provider including:
 * - Initialization
 * - Model discovery
 * - Completion requests
 * - Streaming
 * - Embeddings
 * - Error handling (Ollama not running, model not found)
 * - Health checks
 *
 * Uses mocked HTTP endpoints to avoid requiring Ollama installation.
 */

import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import { OllamaProvider, OllamaProviderConfig } from '../../src/providers/OllamaProvider';
import { LLMProviderError } from '../../src/providers/ILLMProvider';
import { createSeededRandom } from '../../src/utils/SeededRandom';

// Mock fetch for HTTP requests
const mockFetch = jest.fn();
global.fetch = mockFetch as any;

describe('OllamaProvider', () => {
  let provider: OllamaProvider;

  const defaultConfig: OllamaProviderConfig = {
    baseUrl: 'http://localhost:11434',
    defaultModel: 'llama2',
    timeout: 30000,
    maxRetries: 3
  };

  beforeEach(() => {
    jest.clearAllMocks();
    provider = new OllamaProvider(defaultConfig);
  });

  afterEach(async () => {
    await provider.shutdown();
  });

  describe('initialization', () => {
    /**
     * Test successful initialization with Ollama running
     */
    it('should initialize successfully when Ollama is running', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ models: [{ name: 'llama2' }, { name: 'codellama' }] })
      });

      await expect(provider.initialize()).resolves.not.toThrow();
      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:11434/api/tags',
        expect.any(Object)
      );
    });

    /**
     * Test error when Ollama is not running
     */
    it('should throw error when Ollama is not running', async () => {
      mockFetch.mockRejectedValueOnce(new Error('ECONNREFUSED'));

      await expect(provider.initialize()).rejects.toThrow(LLMProviderError);
      await expect(provider.initialize()).rejects.toThrow('Ollama is not running');
    });

    /**
     * Test error when default model not found
     */
    it('should throw error when default model is not available', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ models: [{ name: 'codellama' }] })
      });

      await expect(provider.initialize()).rejects.toThrow(LLMProviderError);
      await expect(provider.initialize()).rejects.toThrow('Model not found');
    });

    /**
     * Test custom base URL
     */
    it('should support custom base URL', async () => {
      const customProvider = new OllamaProvider({
        ...defaultConfig,
        baseUrl: 'http://custom-host:8080'
      });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ models: [{ name: 'llama2' }] })
      });

      await customProvider.initialize();

      expect(mockFetch).toHaveBeenCalledWith(
        'http://custom-host:8080/api/tags',
        expect.any(Object)
      );

      await customProvider.shutdown();
    });

    /**
     * Test warning on double initialization
     */
    it('should warn on double initialization', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ models: [{ name: 'llama2' }] })
      });

      await provider.initialize();
      await expect(provider.initialize()).resolves.not.toThrow();
    });
  });

  describe('model discovery', () => {
    beforeEach(async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          models: [
            { name: 'llama2', size: 3800000000 },
            { name: 'codellama', size: 7000000000 },
            { name: 'mistral', size: 4100000000 }
          ]
        })
      });
      await provider.initialize();
    });

    /**
     * Test listing available models
     */
    it('should list available models', () => {
      const metadata = provider.getMetadata();
      expect(metadata.models).toEqual(['llama2', 'codellama', 'mistral']);
    });

    /**
     * Test model validation
     */
    it('should validate model exists before completion', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        statusText: 'Not Found'
      });

      await expect(
        provider.complete({
          model: 'nonexistent-model',
          messages: [{ role: 'user', content: 'Hello' }]
        })
      ).rejects.toThrow(LLMProviderError);
    });
  });

  describe('complete', () => {
    beforeEach(async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ models: [{ name: 'llama2' }] })
      });
      await provider.initialize();
    });

    /**
     * Test successful completion
     */
    it('should complete a prompt successfully', async () => {
      const mockResponse = {
        model: 'llama2',
        created_at: '2024-01-01T00:00:00Z',
        response: 'Hello! How can I help you?',
        done: true,
        context: [],
        total_duration: 1000000000,
        load_duration: 100000000,
        prompt_eval_count: 10,
        eval_count: 20
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse
      });

      const result = await provider.complete({
        model: 'llama2',
        messages: [{ role: 'user', content: 'Hello' }],
        maxTokens: 100
      });

      expect(result.content).toHaveLength(1);
      expect(result.content[0].text).toBe('Hello! How can I help you?');
      expect(result.usage.input_tokens).toBe(10);
      expect(result.usage.output_tokens).toBe(20);
      expect(result.model).toBe('llama2');
      expect(result.stop_reason).toBe('end_turn');
    });

    /**
     * Test system message handling
     */
    it('should handle system messages', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          response: 'I am a helpful assistant.',
          done: true,
          prompt_eval_count: 15,
          eval_count: 10
        })
      });

      await provider.complete({
        model: 'llama2',
        system: [{ type: 'text', text: 'You are a helpful assistant.' }],
        messages: [{ role: 'user', content: 'Hello' }]
      });

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/generate'),
        expect.objectContaining({
          body: expect.stringContaining('You are a helpful assistant.')
        })
      );
    });

    /**
     * Test temperature parameter
     */
    it('should support temperature parameter', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          response: 'Creative response',
          done: true,
          prompt_eval_count: 10,
          eval_count: 15
        })
      });

      await provider.complete({
        model: 'llama2',
        messages: [{ role: 'user', content: 'Write a story' }],
        temperature: 0.9
      });

      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          body: expect.stringContaining('"temperature":0.9')
        })
      );
    });

    /**
     * Test max tokens parameter
     */
    it('should support max tokens parameter', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          response: 'Short response',
          done: true,
          prompt_eval_count: 10,
          eval_count: 5
        })
      });

      await provider.complete({
        model: 'llama2',
        messages: [{ role: 'user', content: 'Hello' }],
        maxTokens: 50
      });

      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          body: expect.stringContaining('"num_predict":50')
        })
      );
    });

    /**
     * Test HTTP error handling
     */
    it('should handle HTTP errors', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error'
      });

      await expect(
        provider.complete({
          model: 'llama2',
          messages: [{ role: 'user', content: 'Hello' }]
        })
      ).rejects.toThrow(LLMProviderError);
    });

    /**
     * Test network error handling
     */
    it('should handle network errors', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      await expect(
        provider.complete({
          model: 'llama2',
          messages: [{ role: 'user', content: 'Hello' }]
        })
      ).rejects.toThrow(LLMProviderError);
    });

    /**
     * Test timeout handling
     */
    it('should handle timeout errors', async () => {
      mockFetch.mockImplementationOnce(() =>
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Timeout')), 100)
        )
      );

      const timeoutProvider = new OllamaProvider({
        ...defaultConfig,
        timeout: 50
      });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ models: [{ name: 'llama2' }] })
      });
      await timeoutProvider.initialize();

      await expect(
        timeoutProvider.complete({
          model: 'llama2',
          messages: [{ role: 'user', content: 'Hello' }]
        })
      ).rejects.toThrow();

      await timeoutProvider.shutdown();
    });
  });

  describe('streamComplete', () => {
    beforeEach(async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ models: [{ name: 'llama2' }] })
      });
      await provider.initialize();
    });

    /**
     * Test streaming completion
     */
    it('should stream completions successfully', async () => {
      const mockStreamData = [
        { response: 'Hello', done: false },
        { response: ' there', done: false },
        { response: '!', done: true, prompt_eval_count: 10, eval_count: 15 }
      ];

      // Mock ReadableStream
      const stream = new ReadableStream({
        async start(controller) {
          for (const chunk of mockStreamData) {
            controller.enqueue(new TextEncoder().encode(JSON.stringify(chunk) + '\n'));
          }
          controller.close();
        }
      });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        body: stream
      });

      const events: any[] = [];
      const streamIterator = provider.streamComplete({
        model: 'llama2',
        messages: [{ role: 'user', content: 'Hello' }]
      });

      for await (const event of streamIterator) {
        events.push(event);
      }

      expect(events.length).toBeGreaterThan(0);
      expect(events[0].type).toBe('message_start');
      expect(events.some(e => e.type === 'content_block_delta')).toBe(true);
      expect(events[events.length - 1].type).toBe('message_stop');
    });

    /**
     * Test streaming error handling
     */
    it('should handle streaming errors', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: 'Server Error'
      });

      const streamIterator = provider.streamComplete({
        model: 'llama2',
        messages: [{ role: 'user', content: 'Hello' }]
      });

      await expect(streamIterator.next()).rejects.toThrow(LLMProviderError);
    });
  });

  describe('embed', () => {
    beforeEach(async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ models: [{ name: 'llama2' }] })
      });
      await provider.initialize();
    });

    /**
     * Test embedding generation
     */
    it('should generate embeddings successfully', async () => {
      const rng = createSeededRandom(19000);
      const mockEmbedding = Array.from({ length: 384 }, () => rng.random());

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          embedding: mockEmbedding
        })
      });

      const result = await provider.embed({
        text: 'Hello world',
        model: 'llama2'
      });

      expect(result.embedding).toHaveLength(384);
      expect(result.model).toBe('llama2');
      expect(result.tokens).toBeGreaterThan(0);
    });

    /**
     * Test embedding dimensions parameter
     */
    it('should support custom dimensions', async () => {
      const rng = createSeededRandom(19001);
      const mockEmbedding = Array.from({ length: 768 }, () => rng.random());

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          embedding: mockEmbedding
        })
      });

      const result = await provider.embed({
        text: 'Hello world',
        dimensions: 768
      });

      expect(result.embedding).toHaveLength(768);
    });

    /**
     * Test embedding error handling
     */
    it('should handle embedding errors', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: 'Server Error'
      });

      await expect(
        provider.embed({
          text: 'Hello world'
        })
      ).rejects.toThrow(LLMProviderError);
    });
  });

  describe('countTokens', () => {
    beforeEach(async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ models: [{ name: 'llama2' }] })
      });
      await provider.initialize();
    });

    /**
     * Test token counting
     */
    it('should count tokens approximately', async () => {
      const count = await provider.countTokens({
        text: 'Hello world, how are you?',
        model: 'llama2'
      });

      expect(count).toBeGreaterThan(0);
      expect(count).toBeLessThan(100);
    });

    /**
     * Test token counting scales with text length
     */
    it('should scale token count with text length', async () => {
      const shortText = 'Hi';
      const longText = 'This is a much longer text that should have more tokens than the short one';

      const shortCount = await provider.countTokens({ text: shortText });
      const longCount = await provider.countTokens({ text: longText });

      expect(longCount).toBeGreaterThan(shortCount);
    });
  });

  describe('healthCheck', () => {
    /**
     * Test health check when Ollama is running
     */
    it('should return healthy status when Ollama is running', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ models: [{ name: 'llama2' }] })
      });

      await provider.initialize();

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ status: 'ok' })
      });

      const health = await provider.healthCheck();

      expect(health.healthy).toBe(true);
      expect(health.latency).toBeGreaterThanOrEqual(0);
      expect(health.timestamp).toBeInstanceOf(Date);
    });

    /**
     * Test health check when Ollama is not running
     */
    it('should return unhealthy status when Ollama is not running', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ models: [{ name: 'llama2' }] })
      });

      await provider.initialize();

      mockFetch.mockRejectedValueOnce(new Error('ECONNREFUSED'));

      const health = await provider.healthCheck();

      expect(health.healthy).toBe(false);
      expect(health.error).toBeDefined();
    });
  });

  describe('getMetadata', () => {
    /**
     * Test provider metadata
     */
    it('should return provider metadata', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          models: [
            { name: 'llama2' },
            { name: 'codellama' },
            { name: 'mistral' }
          ]
        })
      });

      await provider.initialize();

      const metadata = provider.getMetadata();

      expect(metadata.name).toBe('ollama');
      expect(metadata.version).toBeDefined();
      expect(metadata.models).toEqual(['llama2', 'codellama', 'mistral']);
      expect(metadata.capabilities.streaming).toBe(true);
      expect(metadata.capabilities.embeddings).toBe(true);
      expect(metadata.capabilities.caching).toBe(false);
      expect(metadata.capabilities.vision).toBe(false);
      expect(metadata.location).toBe('local');
      expect(metadata.costs.inputPerMillion).toBe(0);
      expect(metadata.costs.outputPerMillion).toBe(0);
    });
  });

  describe('shutdown', () => {
    /**
     * Test graceful shutdown
     */
    it('should shutdown gracefully', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ models: [{ name: 'llama2' }] })
      });

      await provider.initialize();
      await expect(provider.shutdown()).resolves.not.toThrow();
    });
  });

  describe('trackCost', () => {
    /**
     * Test cost tracking (should be zero for local provider)
     */
    it('should return zero cost for local provider', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ models: [{ name: 'llama2' }] })
      });

      await provider.initialize();

      const cost = provider.trackCost({
        input_tokens: 100,
        output_tokens: 50
      });

      expect(cost).toBe(0);
    });
  });
});
