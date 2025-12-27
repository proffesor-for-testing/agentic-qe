/**
 * ClaudeProvider Unit Tests
 *
 * Tests for the Claude API provider including:
 * - Initialization
 * - Completion requests
 * - Streaming
 * - Token counting
 * - Cost tracking
 * - Health checks
 * - Error handling
 */

import { ClaudeProvider, ClaudeProviderConfig } from '../../src/providers/ClaudeProvider';
import { LLMProviderError } from '../../src/providers/ILLMProvider';

// Create shared mock functions that can be accessed from tests
const mockMessagesCreate = jest.fn();
const mockMessagesCountTokens = jest.fn();
const mockMessagesStream = jest.fn();

// Mock Anthropic constructor
jest.mock('@anthropic-ai/sdk', () => {
  // Create APIError class for mocking inside factory
  class MockAPIError extends Error {
    status: number;
    constructor(status: number, body: any, message: string) {
      super(message);
      this.status = status;
      this.name = 'APIError';
    }
  }

  // Use the outer scope mock functions
  const mockAnthropicClass = function(this: any) {
    this.messages = {
      create: mockMessagesCreate,
      countTokens: mockMessagesCountTokens,
      stream: mockMessagesStream
    };
  };

  // Attach APIError to the constructor
  (mockAnthropicClass as any).APIError = MockAPIError;

  return {
    __esModule: true,
    default: mockAnthropicClass,
    APIError: MockAPIError
  };
});

describe('ClaudeProvider', () => {
  let provider: ClaudeProvider;

  const defaultConfig: ClaudeProviderConfig = {
    apiKey: 'test-api-key',
    defaultModel: 'claude-sonnet-4-20250514',
    enableCaching: true,
    timeout: 30000,
    maxRetries: 3
  };

  beforeEach(() => {
    jest.clearAllMocks();
    provider = new ClaudeProvider(defaultConfig);
  });

  afterEach(async () => {
    await provider.shutdown();
  });

  describe('initialization', () => {
    it('should initialize successfully with API key', async () => {
      await expect(provider.initialize()).resolves.not.toThrow();
    });

    it('should throw error without API key', async () => {
      const noKeyProvider = new ClaudeProvider({});
      // Clear env var for test
      const originalKey = process.env.ANTHROPIC_API_KEY;
      delete process.env.ANTHROPIC_API_KEY;

      await expect(noKeyProvider.initialize()).rejects.toThrow('API key not provided');

      // Restore env var
      if (originalKey) process.env.ANTHROPIC_API_KEY = originalKey;
    });

    it('should warn on double initialization', async () => {
      await provider.initialize();
      // Should not throw, just warn
      await expect(provider.initialize()).resolves.not.toThrow();
    });

    it('should use environment variable if no key provided', async () => {
      const originalKey = process.env.ANTHROPIC_API_KEY;
      process.env.ANTHROPIC_API_KEY = 'env-api-key';

      const envProvider = new ClaudeProvider({});
      await expect(envProvider.initialize()).resolves.not.toThrow();

      if (originalKey) {
        process.env.ANTHROPIC_API_KEY = originalKey;
      } else {
        delete process.env.ANTHROPIC_API_KEY;
      }
    });
  });

  describe('complete', () => {
    beforeEach(async () => {
      await provider.initialize();
    });

    it('should complete a prompt successfully', async () => {
      const mockResponse = {
        id: 'msg-123',
        model: 'claude-sonnet-4-20250514',
        content: [{ type: 'text', text: 'Hello! How can I help?' }],
        usage: { input_tokens: 10, output_tokens: 20 },
        stop_reason: 'end_turn'
      };

      mockMessagesCreate.mockResolvedValue(mockResponse);

      const result = await provider.complete({
        messages: [{ role: 'user', content: 'Hello' }],
        maxTokens: 100
      });

      expect(result.content).toHaveLength(1);
      expect(result.content[0].text).toBe('Hello! How can I help?');
      expect(result.usage.input_tokens).toBe(10);
      expect(result.usage.output_tokens).toBe(20);
      expect(result.id).toBe('msg-123');
    });

    it('should handle system messages', async () => {
      const mockResponse = {
        id: 'msg-124',
        model: 'claude-sonnet-4-20250514',
        content: [{ type: 'text', text: 'I am a helpful assistant.' }],
        usage: { input_tokens: 15, output_tokens: 10 },
        stop_reason: 'end_turn'
      };

      mockMessagesCreate.mockResolvedValue(mockResponse);

      await provider.complete({
        messages: [{ role: 'user', content: 'Who are you?' }],
        system: [{ type: 'text', text: 'You are a helpful assistant.' }],
        maxTokens: 100
      });

      expect(mockMessagesCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          system: 'You are a helpful assistant.'
        })
      );
    });

    it('should track cost correctly', async () => {
      const mockResponse = {
        id: 'msg-125',
        model: 'claude-sonnet-4-20250514',
        content: [{ type: 'text', text: 'Response' }],
        usage: { input_tokens: 1000, output_tokens: 500 },
        stop_reason: 'end_turn'
      };

      mockMessagesCreate.mockResolvedValue(mockResponse);

      const result = await provider.complete({
        messages: [{ role: 'user', content: 'Test' }]
      });

      // Cost should be calculated based on pricing
      expect(result.metadata?.cost).toBeGreaterThan(0);
      expect(provider.getTotalCost()).toBeGreaterThan(0);
    });

    it('should throw error when not initialized', async () => {
      const uninitProvider = new ClaudeProvider(defaultConfig);

      await expect(uninitProvider.complete({
        messages: [{ role: 'user', content: 'Hello' }]
      })).rejects.toThrow('not initialized');
    });

    it('should handle API errors', async () => {
      const Anthropic = require('@anthropic-ai/sdk').default;
      const APIError = require('@anthropic-ai/sdk').APIError;

      mockMessagesCreate.mockRejectedValue(new APIError(429, {}, 'Rate limited'));

      await expect(provider.complete({
        messages: [{ role: 'user', content: 'Hello' }]
      })).rejects.toThrow(LLMProviderError);
    });

    it('should handle array content in messages', async () => {
      const mockResponse = {
        id: 'msg-126',
        model: 'claude-sonnet-4-20250514',
        content: [{ type: 'text', text: 'Response' }],
        usage: { input_tokens: 10, output_tokens: 5 },
        stop_reason: 'end_turn'
      };

      mockMessagesCreate.mockResolvedValue(mockResponse);

      await provider.complete({
        messages: [{
          role: 'user',
          content: [
            { type: 'text', text: 'Part 1' },
            { type: 'text', text: 'Part 2' }
          ]
        }]
      });

      // Should concatenate array content
      expect(mockMessagesCreate).toHaveBeenCalled();
    });
  });

  describe('streamComplete', () => {
    beforeEach(async () => {
      await provider.initialize();
    });

    it('should stream completion events', async () => {
      // Create an async iterable for streaming
      const mockStreamIterator = {
        async *[Symbol.asyncIterator]() {
          yield { type: 'message_start', message: { id: 'msg-stream', model: 'claude-sonnet-4-20250514', stop_reason: null, usage: { input_tokens: 10, output_tokens: 0 } } };
          yield { type: 'content_block_start', content_block: { type: 'text', text: '' } };
          yield { type: 'content_block_delta', delta: { type: 'text_delta', text: 'Hello' } };
          yield { type: 'content_block_delta', delta: { type: 'text_delta', text: ' world' } };
          yield { type: 'content_block_stop' };
          yield { type: 'message_delta', usage: { output_tokens: 10 } };
          yield { type: 'message_stop' };
        }
      };

      mockMessagesStream.mockReturnValue(mockStreamIterator);

      const events: any[] = [];
      for await (const event of provider.streamComplete({
        messages: [{ role: 'user', content: 'Say hello' }]
      })) {
        events.push(event);
      }

      expect(events.length).toBeGreaterThan(0);
      expect(events.some(e => e.type === 'message_start')).toBe(true);
      expect(events.some(e => e.type === 'content_block_delta')).toBe(true);
      expect(events.some(e => e.type === 'message_stop')).toBe(true);
    });
  });

  describe('countTokens', () => {
    beforeEach(async () => {
      await provider.initialize();
    });

    it('should count tokens using API', async () => {
      mockMessagesCountTokens.mockResolvedValue({
        input_tokens: 15
      });

      const count = await provider.countTokens({ text: 'Hello, world!' });
      expect(count).toBe(15);
    });

    it('should fallback to estimation on error', async () => {
      mockMessagesCountTokens.mockRejectedValue(new Error('API error'));

      const count = await provider.countTokens({ text: 'Hello, world!' });
      // Fallback: ~4 chars per token
      expect(count).toBeGreaterThan(0);
    });
  });

  describe('healthCheck', () => {
    it('should return healthy status when working', async () => {
      const mockResponse = {
        id: 'msg-health',
        model: 'claude-sonnet-4-20250514',
        content: [{ type: 'text', text: 'pong' }],
        usage: { input_tokens: 1, output_tokens: 1 },
        stop_reason: 'end_turn'
      };

      mockMessagesCreate.mockResolvedValue(mockResponse);

      const health = await provider.healthCheck();

      expect(health.healthy).toBe(true);
      expect(health.latency).toBeGreaterThanOrEqual(0);
      expect(health.timestamp).toBeInstanceOf(Date);
    });

    it('should return unhealthy status on error', async () => {
      mockMessagesCreate.mockRejectedValue(new Error('Connection failed'));

      const health = await provider.healthCheck();

      expect(health.healthy).toBe(false);
      expect(health.error).toBeDefined();
    });
  });

  describe('getMetadata', () => {
    it('should return provider metadata', () => {
      const metadata = provider.getMetadata();

      expect(metadata.name).toBe('claude');
      expect(metadata.version).toBe('1.0.0');
      expect(metadata.models).toContain('claude-sonnet-4-20250514');
      expect(metadata.capabilities.streaming).toBe(true);
      expect(metadata.capabilities.caching).toBe(true);
      expect(metadata.capabilities.embeddings).toBe(false);
      expect(metadata.location).toBe('cloud');
    });
  });

  describe('embed', () => {
    beforeEach(async () => {
      await provider.initialize();
    });

    it('should throw unsupported error for embeddings', async () => {
      await expect(provider.embed({
        texts: ['Hello']
      })).rejects.toThrow('does not support native embeddings');
    });
  });

  describe('cost tracking', () => {
    beforeEach(async () => {
      await provider.initialize();
    });

    it('should track cumulative cost', async () => {
      const mockResponse = {
        id: 'msg-cost',
        model: 'claude-sonnet-4-20250514',
        content: [{ type: 'text', text: 'Response' }],
        usage: { input_tokens: 1000, output_tokens: 500 },
        stop_reason: 'end_turn'
      };

      mockMessagesCreate.mockResolvedValue(mockResponse);

      await provider.complete({ messages: [{ role: 'user', content: 'Test 1' }] });
      const cost1 = provider.getTotalCost();

      await provider.complete({ messages: [{ role: 'user', content: 'Test 2' }] });
      const cost2 = provider.getTotalCost();

      expect(cost2).toBeGreaterThan(cost1);
    });

    it('should handle cache pricing', async () => {
      const mockResponse = {
        id: 'msg-cache',
        model: 'claude-sonnet-4-20250514',
        content: [{ type: 'text', text: 'Response' }],
        usage: {
          input_tokens: 1000,
          output_tokens: 500,
          cache_creation_input_tokens: 500,
          cache_read_input_tokens: 200
        },
        stop_reason: 'end_turn'
      };

      mockMessagesCreate.mockResolvedValue(mockResponse);

      const result = await provider.complete({
        messages: [{ role: 'user', content: 'Test with cache' }]
      });

      // Should include cache costs in metadata
      expect(result.usage.cache_creation_input_tokens).toBe(500);
      expect(result.usage.cache_read_input_tokens).toBe(200);
      expect(result.metadata?.cost).toBeGreaterThan(0);
    });
  });

  describe('shutdown', () => {
    it('should shutdown gracefully', async () => {
      await provider.initialize();
      await expect(provider.shutdown()).resolves.not.toThrow();
    });

    it('should be safe to call multiple times', async () => {
      await provider.initialize();
      await provider.shutdown();
      await expect(provider.shutdown()).resolves.not.toThrow();
    });
  });
});
