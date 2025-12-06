/**
 * RuvllmProvider Unit Tests
 *
 * Tests for the local LLM provider including:
 * - Initialization
 * - Completion requests
 * - Streaming
 * - Health checks
 * - Server management
 */

import { RuvllmProvider, RuvllmProviderConfig } from '../../src/providers/RuvllmProvider';
import { LLMProviderError } from '../../src/providers/ILLMProvider';

// Mock fetch globally
const mockFetch = jest.fn();
global.fetch = mockFetch as any;

// Mock child_process
jest.mock('child_process', () => ({
  spawn: jest.fn().mockReturnValue({
    on: jest.fn(),
    kill: jest.fn(),
    stdout: { on: jest.fn() },
    stderr: { on: jest.fn() }
  })
}));

describe('RuvllmProvider', () => {
  let provider: RuvllmProvider;

  const defaultConfig: RuvllmProviderConfig = {
    defaultModel: 'llama-3.2-3b-instruct',
    port: 8080,
    gpuLayers: -1,
    contextSize: 4096,
    threads: 4,
    timeout: 60000
  };

  beforeEach(() => {
    jest.clearAllMocks();
    provider = new RuvllmProvider(defaultConfig);

    // Default: server is healthy
    mockFetch.mockImplementation((url: string) => {
      if (url.includes('/health')) {
        return Promise.resolve({ ok: true });
      }
      return Promise.reject(new Error('Unknown endpoint'));
    });
  });

  afterEach(async () => {
    await provider.shutdown();
  });

  describe('initialization', () => {
    it('should connect to existing server if running', async () => {
      mockFetch.mockResolvedValue({ ok: true });

      await expect(provider.initialize()).resolves.not.toThrow();
    });

    it('should warn on double initialization', async () => {
      mockFetch.mockResolvedValue({ ok: true });

      await provider.initialize();
      await expect(provider.initialize()).resolves.not.toThrow();
    });

    it('should use default configuration values', () => {
      const defaultProvider = new RuvllmProvider({});
      const metadata = defaultProvider.getMetadata();

      expect(metadata.name).toBe('ruvllm');
      expect(metadata.location).toBe('local');
    });
  });

  describe('complete', () => {
    beforeEach(async () => {
      // Mock server as healthy
      mockFetch.mockImplementation((url: string) => {
        if (url.includes('/health')) {
          return Promise.resolve({ ok: true });
        }
        if (url.includes('/v1/chat/completions')) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({
              id: 'ruvllm-123',
              model: 'llama-3.2-3b-instruct',
              choices: [{
                message: { content: 'Hello from local model!' },
                finish_reason: 'stop'
              }],
              usage: { prompt_tokens: 10, completion_tokens: 15 }
            })
          });
        }
        return Promise.reject(new Error('Unknown endpoint'));
      });

      await provider.initialize();
    });

    it('should complete a prompt successfully', async () => {
      const result = await provider.complete({
        messages: [{ role: 'user', content: 'Hello' }],
        maxTokens: 100
      });

      expect(result.content).toHaveLength(1);
      expect(result.content[0].text).toBe('Hello from local model!');
      expect(result.usage.input_tokens).toBe(10);
      expect(result.usage.output_tokens).toBe(15);
    });

    it('should have zero cost for local inference', async () => {
      const result = await provider.complete({
        messages: [{ role: 'user', content: 'Hello' }]
      });

      expect(result.metadata?.cost).toBe(0);
    });

    it('should handle system messages', async () => {
      await provider.complete({
        messages: [{ role: 'user', content: 'Who are you?' }],
        system: [{ type: 'text', text: 'You are a helpful assistant.' }]
      });

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/v1/chat/completions'),
        expect.objectContaining({
          method: 'POST',
          body: expect.stringContaining('system')
        })
      );
    });

    it('should throw error when not initialized', async () => {
      const uninitProvider = new RuvllmProvider(defaultConfig);

      await expect(uninitProvider.complete({
        messages: [{ role: 'user', content: 'Hello' }]
      })).rejects.toThrow('not initialized');
    });

    it('should handle server errors', async () => {
      mockFetch.mockImplementation((url: string) => {
        if (url.includes('/v1/chat/completions')) {
          return Promise.resolve({
            ok: false,
            status: 500,
            text: () => Promise.resolve('Internal server error')
          });
        }
        return Promise.resolve({ ok: true });
      });

      await expect(provider.complete({
        messages: [{ role: 'user', content: 'Hello' }]
      })).rejects.toThrow(LLMProviderError);
    });
  });

  describe('streamComplete', () => {
    beforeEach(async () => {
      mockFetch.mockImplementation((url: string) => {
        if (url.includes('/health')) {
          return Promise.resolve({ ok: true });
        }
        if (url.includes('/v1/chat/completions')) {
          // Mock streaming response
          const encoder = new TextEncoder();
          const streamData = [
            'data: {"choices":[{"delta":{"content":"Hello"}}]}\n',
            'data: {"choices":[{"delta":{"content":" world"}}]}\n',
            'data: [DONE]\n'
          ];
          let index = 0;

          const mockReader = {
            read: jest.fn().mockImplementation(() => {
              if (index < streamData.length) {
                return Promise.resolve({
                  done: false,
                  value: encoder.encode(streamData[index++])
                });
              }
              return Promise.resolve({ done: true, value: undefined });
            })
          };

          return Promise.resolve({
            ok: true,
            body: { getReader: () => mockReader }
          });
        }
        return Promise.reject(new Error('Unknown endpoint'));
      });

      await provider.initialize();
    });

    it('should stream completion events', async () => {
      const events: any[] = [];

      for await (const event of provider.streamComplete({
        messages: [{ role: 'user', content: 'Say hello' }]
      })) {
        events.push(event);
      }

      expect(events.length).toBeGreaterThan(0);
      expect(events.some(e => e.type === 'message_start')).toBe(true);
      expect(events.some(e => e.type === 'content_block_delta')).toBe(true);
    });
  });

  describe('countTokens', () => {
    it('should estimate token count', async () => {
      // RuvllmProvider uses estimation (~4 chars per token)
      const count = await provider.countTokens({ text: 'Hello, world!' });

      expect(count).toBeGreaterThan(0);
      expect(count).toBeLessThan(10);
    });
  });

  describe('embed', () => {
    beforeEach(async () => {
      mockFetch.mockResolvedValue({ ok: true });
      await provider.initialize();
    });

    it('should throw error when embeddings not enabled', async () => {
      await expect(provider.embed({
        texts: ['Hello']
      })).rejects.toThrow('Embeddings not enabled');
    });

    it('should generate embeddings when enabled', async () => {
      const embeddingProvider = new RuvllmProvider({
        ...defaultConfig,
        enableEmbeddings: true
      });

      mockFetch.mockImplementation((url: string) => {
        if (url.includes('/health')) {
          return Promise.resolve({ ok: true });
        }
        if (url.includes('/v1/embeddings')) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({
              data: [{ embedding: [0.1, 0.2, 0.3] }],
              model: 'embedding',
              usage: { total_tokens: 5 }
            })
          });
        }
        return Promise.reject(new Error('Unknown endpoint'));
      });

      await embeddingProvider.initialize();

      const result = await embeddingProvider.embed({
        text: 'Hello',
        texts: ['Hello']
      });

      expect(result.embedding).toHaveLength(3);
      expect(result.tokens).toBe(5);
    });
  });

  describe('healthCheck', () => {
    it('should return healthy when server responds', async () => {
      mockFetch.mockResolvedValue({ ok: true });

      const health = await provider.healthCheck();

      expect(health.healthy).toBe(true);
      expect(health.latency).toBeGreaterThanOrEqual(0);
    });

    it('should return unhealthy when server is down', async () => {
      mockFetch.mockRejectedValue(new Error('Connection refused'));

      const health = await provider.healthCheck();

      expect(health.healthy).toBe(false);
    });
  });

  describe('getMetadata', () => {
    it('should return provider metadata', () => {
      const metadata = provider.getMetadata();

      expect(metadata.name).toBe('ruvllm');
      expect(metadata.version).toBe('1.0.0');
      expect(metadata.models).toContain('llama-3.2-3b-instruct');
      expect(metadata.capabilities.streaming).toBe(true);
      expect(metadata.capabilities.embeddings).toBe(false);
      expect(metadata.location).toBe('local');
      expect(metadata.costs.inputPerMillion).toBe(0);
      expect(metadata.costs.outputPerMillion).toBe(0);
    });

    it('should reflect embeddings capability when enabled', () => {
      const embeddingProvider = new RuvllmProvider({
        ...defaultConfig,
        enableEmbeddings: true
      });

      const metadata = embeddingProvider.getMetadata();
      expect(metadata.capabilities.embeddings).toBe(true);
    });
  });

  describe('trackCost', () => {
    it('should always return zero for local inference', () => {
      const cost = provider.trackCost({
        input_tokens: 1000,
        output_tokens: 500
      });

      expect(cost).toBe(0);
    });
  });

  describe('shutdown', () => {
    it('should shutdown gracefully', async () => {
      mockFetch.mockResolvedValue({ ok: true });
      await provider.initialize();

      await expect(provider.shutdown()).resolves.not.toThrow();
    });

    it('should be safe to call multiple times', async () => {
      await provider.shutdown();
      await expect(provider.shutdown()).resolves.not.toThrow();
    });
  });
});
