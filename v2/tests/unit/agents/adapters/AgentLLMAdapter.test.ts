/**
 * AgentLLMAdapter Tests
 *
 * Phase 1.2.2: Verify the adapter correctly wraps ILLMProvider
 * and exposes the simplified IAgentLLM interface.
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { AgentLLMAdapter, createAgentLLM } from '../../../../src/agents/adapters/AgentLLMAdapter';
import { AgentLLMError } from '../../../../src/agents/interfaces/IAgentLLM';
import type {
  ILLMProvider,
  LLMCompletionResponse,
  LLMProviderMetadata,
  LLMHealthStatus,
  LLMEmbeddingResponse,
} from '../../../../src/providers/ILLMProvider';

describe('AgentLLMAdapter', () => {
  let mockProvider: ILLMProvider;

  beforeEach(() => {
    // Create mock provider
    mockProvider = {
      initialize: jest.fn().mockResolvedValue(undefined),
      complete: jest.fn(),
      streamComplete: jest.fn(),
      embed: jest.fn(),
      countTokens: jest.fn(),
      healthCheck: jest.fn(),
      getMetadata: jest.fn(),
      shutdown: jest.fn(),
      trackCost: jest.fn(),
    } as unknown as ILLMProvider;

    // Setup default metadata
    (mockProvider.getMetadata as any).mockReturnValue({
      name: 'test-provider',
      version: '1.0.0',
      models: ['model-1', 'model-2'],
      capabilities: {
        streaming: true,
        caching: true,
        embeddings: true,
        vision: false,
      },
      costs: {
        inputPerMillion: 1.0,
        outputPerMillion: 2.0,
      },
      location: 'local',
    } as LLMProviderMetadata);
  });

  describe('complete()', () => {
    it('should complete a simple prompt', async () => {
      const mockResponse: LLMCompletionResponse = {
        id: 'test-1',
        content: [{ type: 'text', text: 'Test response' }],
        usage: {
          input_tokens: 10,
          output_tokens: 5,
        },
        model: 'model-1',
        stop_reason: 'end_turn',
      };

      (mockProvider.complete as any).mockResolvedValue(mockResponse);

      const adapter = new AgentLLMAdapter({
        provider: mockProvider,
        agentId: 'test-agent',
      });

      const result = await adapter.complete('Test prompt');

      expect(result).toBe('Test response');
      expect(mockProvider.complete).toHaveBeenCalledWith(
        expect.objectContaining({
          messages: [{ role: 'user', content: 'Test prompt' }],
          metadata: expect.objectContaining({ agentId: 'test-agent' }),
        })
      );
    });

    it('should apply completion options', async () => {
      const mockResponse: LLMCompletionResponse = {
        id: 'test-2',
        content: [{ type: 'text', text: 'Response' }],
        usage: { input_tokens: 10, output_tokens: 5 },
        model: 'model-1',
        stop_reason: 'end_turn',
      };

      (mockProvider.complete as any).mockResolvedValue(mockResponse);

      const adapter = new AgentLLMAdapter({
        provider: mockProvider,
        agentId: 'test-agent',
      });

      await adapter.complete('Prompt', {
        temperature: 0.2,
        maxTokens: 1000,
        systemPrompt: 'You are a helpful assistant',
        complexity: 'complex',
      });

      expect(mockProvider.complete).toHaveBeenCalledWith(
        expect.objectContaining({
          temperature: 0.2,
          maxTokens: 1000,
          system: [
            expect.objectContaining({
              type: 'text',
              text: 'You are a helpful assistant',
            }),
          ],
          metadata: expect.objectContaining({ complexity: 'complex' }),
        })
      );
    });

    it('should track usage statistics', async () => {
      const mockResponse: LLMCompletionResponse = {
        id: 'test-3',
        content: [{ type: 'text', text: 'Response' }],
        usage: {
          input_tokens: 100,
          output_tokens: 50,
        },
        model: 'model-1',
        stop_reason: 'end_turn',
      };

      (mockProvider.complete as any).mockResolvedValue(mockResponse);
      (mockProvider.trackCost as any).mockReturnValue(0.0003);

      const adapter = new AgentLLMAdapter({
        provider: mockProvider,
        agentId: 'test-agent',
      });

      await adapter.complete('Prompt 1');
      await adapter.complete('Prompt 2');

      const stats = adapter.getUsageStats();

      expect(stats.requestCount).toBe(2);
      expect(stats.tokensUsed).toBe(300); // (100+50) * 2
      expect(stats.costIncurred).toBe(0.0006); // 0.0003 * 2
      expect(stats.averageLatency).toBeGreaterThanOrEqual(0); // Can be 0 in fast tests
    });

    it('should translate provider errors', async () => {
      const providerError = new Error('Provider failed');
      (mockProvider.complete as any).mockRejectedValue(providerError);

      const adapter = new AgentLLMAdapter({
        provider: mockProvider,
        agentId: 'test-agent',
      });

      await expect(adapter.complete('Test')).rejects.toThrow(AgentLLMError);
    });
  });

  describe('embed()', () => {
    it('should generate embeddings', async () => {
      const mockEmbedding: LLMEmbeddingResponse = {
        embedding: [0.1, 0.2, 0.3],
        model: 'embedding-model',
        tokens: 5,
      };

      (mockProvider.embed as any).mockResolvedValue(mockEmbedding);

      const adapter = new AgentLLMAdapter({
        provider: mockProvider,
        agentId: 'test-agent',
      });

      const result = await adapter.embed('test text');

      expect(result).toEqual([0.1, 0.2, 0.3]);
      expect(mockProvider.embed).toHaveBeenCalledWith({ text: 'test text' });
    });
  });

  describe('getAvailableModels()', () => {
    it('should return available models', async () => {
      const adapter = new AgentLLMAdapter({
        provider: mockProvider,
        agentId: 'test-agent',
      });

      const models = await adapter.getAvailableModels();

      expect(models).toHaveLength(2);
      expect(models[0]).toMatchObject({
        id: 'model-1',
        name: 'model-1',
        provider: 'test-provider',
        capabilities: {
          streaming: true,
          vision: false,
        },
      });
    });
  });

  describe('switchModel()', () => {
    it('should switch to an available model', async () => {
      const adapter = new AgentLLMAdapter({
        provider: mockProvider,
        agentId: 'test-agent',
        defaultModel: 'model-1',
      });

      expect(adapter.getCurrentModel()).toBe('model-1');

      await adapter.switchModel('model-2');

      expect(adapter.getCurrentModel()).toBe('model-2');
    });

    it('should throw error for unavailable model', async () => {
      const adapter = new AgentLLMAdapter({
        provider: mockProvider,
        agentId: 'test-agent',
      });

      await expect(adapter.switchModel('non-existent-model')).rejects.toThrow(AgentLLMError);
    });
  });

  describe('isHealthy()', () => {
    it('should return true when provider is healthy', async () => {
      const mockHealth: LLMHealthStatus = {
        healthy: true,
        timestamp: new Date(),
      };

      (mockProvider.healthCheck as any).mockResolvedValue(mockHealth);

      const adapter = new AgentLLMAdapter({
        provider: mockProvider,
        agentId: 'test-agent',
      });

      const healthy = await adapter.isHealthy();

      expect(healthy).toBe(true);
    });

    it('should return false when provider is unhealthy', async () => {
      (mockProvider.healthCheck as any).mockRejectedValue(new Error('Unhealthy'));

      const adapter = new AgentLLMAdapter({
        provider: mockProvider,
        agentId: 'test-agent',
      });

      const healthy = await adapter.isHealthy();

      expect(healthy).toBe(false);
    });
  });

  describe('resetStats()', () => {
    it('should reset usage statistics', async () => {
      const mockResponse: LLMCompletionResponse = {
        id: 'test-4',
        content: [{ type: 'text', text: 'Response' }],
        usage: { input_tokens: 10, output_tokens: 5 },
        model: 'model-1',
        stop_reason: 'end_turn',
      };

      (mockProvider.complete as any).mockResolvedValue(mockResponse);

      const adapter = new AgentLLMAdapter({
        provider: mockProvider,
        agentId: 'test-agent',
      });

      await adapter.complete('Test');
      expect(adapter.getUsageStats().requestCount).toBe(1);

      adapter.resetStats();
      expect(adapter.getUsageStats().requestCount).toBe(0);
    });
  });

  describe('createAgentLLM() factory', () => {
    it('should create an adapter instance', async () => {
      const llm = createAgentLLM(mockProvider, {
        agentId: 'factory-test',
        defaultModel: 'model-2',
      });

      expect(llm).toBeInstanceOf(AgentLLMAdapter);
      expect(llm.getCurrentModel()).toBe('model-2');
    });
  });

  describe('cache tracking', () => {
    it('should track cache hits', async () => {
      const mockResponse: LLMCompletionResponse = {
        id: 'test-5',
        content: [{ type: 'text', text: 'Cached response' }],
        usage: {
          input_tokens: 10,
          output_tokens: 5,
          cache_read_input_tokens: 10,
        },
        model: 'model-1',
        stop_reason: 'end_turn',
      };

      (mockProvider.complete as any).mockResolvedValue(mockResponse);

      const adapter = new AgentLLMAdapter({
        provider: mockProvider,
        agentId: 'test-agent',
      });

      await adapter.complete('Test');

      const stats = adapter.getUsageStats();
      expect(stats.cacheHitRate).toBeGreaterThan(0);
    });
  });
});
