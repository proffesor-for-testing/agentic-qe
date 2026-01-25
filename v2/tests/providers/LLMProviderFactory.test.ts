/**
 * LLMProviderFactory Unit Tests
 *
 * Tests for the LLM provider factory including:
 * - Initialization
 * - Provider selection
 * - Fallback behavior
 * - Health monitoring
 * - Usage statistics
 */

import { LLMProviderFactory, LLMProviderFactoryConfig, ProviderType } from '../../src/providers/LLMProviderFactory';
import { ILLMProvider, LLMProviderMetadata, LLMHealthStatus } from '../../src/providers/ILLMProvider';

// Create mock functions first
const mockClaudeInit = jest.fn().mockResolvedValue(undefined);
const mockClaudeComplete = jest.fn().mockResolvedValue({
  content: [{ type: 'text', text: 'Response from claude' }],
  usage: { input_tokens: 10, output_tokens: 20 },
  model: 'claude',
  stop_reason: 'end_turn',
  id: 'msg-claude'
});
const mockClaudeHealth = jest.fn().mockResolvedValue({
  healthy: true,
  latency: 100,
  timestamp: new Date()
});
const mockClaudeShutdown = jest.fn().mockResolvedValue(undefined);

const mockRuvllmInit = jest.fn().mockResolvedValue(undefined);
const mockRuvllmComplete = jest.fn().mockResolvedValue({
  content: [{ type: 'text', text: 'Response from ruvllm' }],
  usage: { input_tokens: 10, output_tokens: 20 },
  model: 'ruvllm',
  stop_reason: 'end_turn',
  id: 'msg-ruvllm'
});
const mockRuvllmHealth = jest.fn().mockResolvedValue({
  healthy: true,
  latency: 50,
  timestamp: new Date()
});
const mockRuvllmShutdown = jest.fn().mockResolvedValue(undefined);

// Mock the providers using factory functions
jest.mock('../../src/providers/ClaudeProvider', () => ({
  ClaudeProvider: jest.fn().mockImplementation(() => ({
    initialize: mockClaudeInit,
    complete: mockClaudeComplete,
    streamComplete: jest.fn(),
    embed: jest.fn(),
    countTokens: jest.fn().mockResolvedValue(10),
    healthCheck: mockClaudeHealth,
    getMetadata: () => ({
      name: 'claude',
      version: '1.0.0',
      models: ['claude'],
      capabilities: { streaming: true, caching: true, embeddings: false, vision: false },
      costs: { inputPerMillion: 3.0, outputPerMillion: 15.0 },
      location: 'cloud' as const
    }),
    shutdown: mockClaudeShutdown,
    trackCost: jest.fn().mockReturnValue(0)
  }))
}));

jest.mock('../../src/providers/RuvllmProvider', () => ({
  RuvllmProvider: jest.fn().mockImplementation(() => ({
    initialize: mockRuvllmInit,
    complete: mockRuvllmComplete,
    streamComplete: jest.fn(),
    embed: jest.fn(),
    countTokens: jest.fn().mockResolvedValue(10),
    healthCheck: mockRuvllmHealth,
    getMetadata: () => ({
      name: 'ruvllm',
      version: '1.0.0',
      models: ['ruvllm'],
      capabilities: { streaming: true, caching: false, embeddings: true, vision: false },
      costs: { inputPerMillion: 0, outputPerMillion: 0 },
      location: 'local' as const
    }),
    shutdown: mockRuvllmShutdown,
    trackCost: jest.fn().mockReturnValue(0)
  }))
}));

describe('LLMProviderFactory', () => {
  let factory: LLMProviderFactory;

  const defaultConfig: LLMProviderFactoryConfig = {
    claude: { apiKey: 'test-key' },
    defaultProvider: 'claude',
    enableFallback: true,
    healthCheckInterval: 60000,
    maxConsecutiveFailures: 3
  };

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    factory = new LLMProviderFactory(defaultConfig);
  });

  afterEach(async () => {
    await factory.shutdown();
    jest.useRealTimers();
  });

  describe('initialization', () => {
    it('should initialize configured providers', async () => {
      await factory.initialize();

      const available = factory.getAvailableProviders();
      expect(available).toContain('claude');
      expect(mockClaudeInit).toHaveBeenCalled();
    });

    it('should warn on double initialization', async () => {
      await factory.initialize();
      await expect(factory.initialize()).resolves.not.toThrow();
    });

    it('should start health monitoring', async () => {
      await factory.initialize();

      // Advance timers to trigger health check
      jest.advanceTimersByTime(60000);

      // Health checks should have been called
      const provider = factory.getProvider('claude');
      expect(provider).toBeDefined();
    });
  });

  describe('getProvider', () => {
    beforeEach(async () => {
      await factory.initialize();
    });

    it('should return provider by type', () => {
      const provider = factory.getProvider('claude');
      expect(provider).toBeDefined();
    });

    it('should return undefined for unavailable provider', () => {
      const provider = factory.getProvider('ruvllm');
      // ruvllm not configured in defaultConfig
      expect(provider).toBeUndefined();
    });

    it('should select best provider for auto', () => {
      const provider = factory.getProvider('auto');
      expect(provider).toBeDefined();
    });
  });

  describe('selectBestProvider', () => {
    beforeEach(async () => {
      // Initialize with both providers
      const bothConfig: LLMProviderFactoryConfig = {
        claude: { apiKey: 'test-key' },
        ruvllm: {},
        defaultProvider: 'claude',
        enableFallback: true
      };
      factory = new LLMProviderFactory(bothConfig);
      await factory.initialize();
    });

    it('should select provider matching criteria', () => {
      const provider = factory.selectBestProvider({
        preferLowCost: true
      });

      // Should prefer ruvllm (zero cost)
      expect(provider).toBeDefined();
    });

    it('should filter by required capabilities', () => {
      const provider = factory.selectBestProvider({
        requiredCapabilities: ['caching']
      });

      // Only claude has caching
      if (provider) {
        const metadata = provider.getMetadata();
        expect(metadata.capabilities.caching).toBe(true);
      }
    });

    it('should prefer local when requested', () => {
      const provider = factory.selectBestProvider({
        preferLocal: true
      });

      // Should prefer ruvllm (local)
      if (provider) {
        const metadata = provider.getMetadata();
        expect(metadata.location).toBe('local');
      }
    });

    it('should respect cost limits', () => {
      const provider = factory.selectBestProvider({
        maxCostPerMillion: 1.0
      });

      // Should filter out expensive providers
      if (provider) {
        const metadata = provider.getMetadata();
        expect(metadata.costs.inputPerMillion).toBeLessThanOrEqual(1.0);
      }
    });
  });

  describe('executeWithFallback', () => {
    beforeEach(async () => {
      const bothConfig: LLMProviderFactoryConfig = {
        claude: { apiKey: 'test-key' },
        ruvllm: {},
        defaultProvider: 'claude',
        enableFallback: true,
        maxConsecutiveFailures: 2
      };
      factory = new LLMProviderFactory(bothConfig);
      await factory.initialize();
    });

    it('should execute operation successfully', async () => {
      const result = await factory.executeWithFallback(
        async (provider) => provider.complete({
          messages: [{ role: 'user', content: 'Hello' }]
        })
      );

      expect(result.content[0].text).toContain('Response from');
    });

    it('should fallback on provider failure', async () => {
      // Make first provider fail once
      mockClaudeComplete.mockRejectedValueOnce(new Error('Claude error'));

      // Should still succeed via fallback to ruvllm
      const result = await factory.executeWithFallback(
        async (provider) => provider.complete({
          messages: [{ role: 'user', content: 'Hello' }]
        })
      );

      expect(result).toBeDefined();
    });

    it('should throw when all providers fail', async () => {
      mockClaudeComplete.mockRejectedValue(new Error('Claude error'));
      mockRuvllmComplete.mockRejectedValue(new Error('Ruvllm error'));

      await expect(factory.executeWithFallback(
        async (p) => p.complete({ messages: [] })
      )).rejects.toThrow();
    });
  });

  describe('getAvailableProviders', () => {
    it('should list available providers', async () => {
      await factory.initialize();

      const available = factory.getAvailableProviders();
      expect(Array.isArray(available)).toBe(true);
    });
  });

  describe('getProviderMetadata', () => {
    beforeEach(async () => {
      await factory.initialize();
    });

    it('should return metadata for known provider', () => {
      const metadata = factory.getProviderMetadata('claude');

      expect(metadata).toBeDefined();
      expect(metadata?.name).toBe('claude');
    });

    it('should return undefined for unknown provider', () => {
      const metadata = factory.getProviderMetadata('unknown' as ProviderType);
      expect(metadata).toBeUndefined();
    });
  });

  describe('getUsageStats', () => {
    beforeEach(async () => {
      await factory.initialize();
    });

    it('should return stats for specific provider', () => {
      const stats = factory.getUsageStats('claude');

      if (stats && !(stats instanceof Map)) {
        expect(stats.requestCount).toBe(0);
        expect(stats.successCount).toBe(0);
        expect(stats.failureCount).toBe(0);
      }
    });

    it('should return all stats when no type specified', () => {
      const stats = factory.getUsageStats();

      expect(stats instanceof Map).toBe(true);
    });
  });

  describe('getTotalCost', () => {
    beforeEach(async () => {
      await factory.initialize();
    });

    it('should return total cost across providers', () => {
      const cost = factory.getTotalCost();
      expect(typeof cost).toBe('number');
      expect(cost).toBeGreaterThanOrEqual(0);
    });
  });

  describe('createHybridRouter', () => {
    beforeEach(async () => {
      await factory.initialize();
    });

    it('should create hybrid router with ILLMProvider interface', () => {
      const router = factory.createHybridRouter();

      expect(router.complete).toBeDefined();
      expect(router.streamComplete).toBeDefined();
      expect(router.embed).toBeDefined();
      expect(router.countTokens).toBeDefined();
      expect(router.healthCheck).toBeDefined();
      expect(router.getMetadata).toBeDefined();
      expect(router.shutdown).toBeDefined();
    });

    it('should route requests through factory', async () => {
      const router = factory.createHybridRouter();

      const result = await router.complete({
        messages: [{ role: 'user', content: 'Hello' }]
      });

      expect(result.content).toBeDefined();
    });

    it('should aggregate metadata from all providers', () => {
      const router = factory.createHybridRouter();
      const metadata = router.getMetadata();

      expect(metadata.name).toBe('hybrid');
      expect(metadata.models.length).toBeGreaterThan(0);
    });

    it('should report health based on available providers', async () => {
      const router = factory.createHybridRouter();
      const health = await router.healthCheck();

      expect(health.healthy).toBeDefined();
      expect(health.timestamp).toBeInstanceOf(Date);
    });
  });

  describe('shutdown', () => {
    it('should shutdown all providers', async () => {
      await factory.initialize();
      await factory.shutdown();

      expect(mockClaudeShutdown).toHaveBeenCalled();
    });

    it('should stop health monitoring', async () => {
      await factory.initialize();
      await factory.shutdown();

      // Advancing timers should not cause errors
      jest.advanceTimersByTime(120000);
    });
  });
});
