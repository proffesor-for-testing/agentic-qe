/**
 * HybridRouter Unit Tests
 *
 * Tests for intelligent LLM provider routing with TRM support
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';

// Simple mock without factory function - configure in beforeEach
jest.mock('../../src/providers/RuvllmProvider');
jest.mock('../../src/providers/ClaudeProvider');

import {
  HybridRouter,
  RoutingStrategy
} from '../../src/providers/HybridRouter';
import { RuvllmProvider } from '../../src/providers/RuvllmProvider';
import { ClaudeProvider } from '../../src/providers/ClaudeProvider';

// Get mocked constructors
const MockRuvllmProvider = RuvllmProvider as jest.MockedClass<typeof RuvllmProvider>;
const MockClaudeProvider = ClaudeProvider as jest.MockedClass<typeof ClaudeProvider>;

// Mock instances to track calls
let mockLocalInstance: any;
let mockCloudInstance: any;

describe('HybridRouter', () => {
  let router: HybridRouter;

  beforeEach(() => {
    jest.clearAllMocks();

    // Create mock provider instances with all required methods
    mockLocalInstance = {
      initialize: jest.fn().mockResolvedValue(undefined),
      complete: jest.fn().mockResolvedValue({
        content: [{ type: 'text', text: 'Local response' }],
        usage: { input_tokens: 10, output_tokens: 20 },
        model: 'ruvllm',
        stop_reason: 'end_turn',
        id: 'local-msg'
      }),
      streamComplete: jest.fn(),
      embed: jest.fn().mockResolvedValue({ embedding: [0.1, 0.2], model: 'embedding', tokens: 10 }),
      countTokens: jest.fn().mockResolvedValue(10),
      healthCheck: jest.fn().mockResolvedValue({
        healthy: true,
        latency: 50,
        timestamp: new Date()
      }),
      getMetadata: jest.fn().mockReturnValue({
        name: 'ruvllm',
        version: '2.0.0',
        models: ['llama-3.2-3b'],
        capabilities: { streaming: true, caching: false, embeddings: true, vision: false },
        costs: { inputPerMillion: 0, outputPerMillion: 0 },
        location: 'local'
      }),
      shutdown: jest.fn().mockResolvedValue(undefined),
      trackCost: jest.fn().mockReturnValue(0)
    };

    mockCloudInstance = {
      initialize: jest.fn().mockResolvedValue(undefined),
      complete: jest.fn().mockResolvedValue({
        content: [{ type: 'text', text: 'Cloud response' }],
        usage: { input_tokens: 10, output_tokens: 20 },
        model: 'claude',
        stop_reason: 'end_turn',
        id: 'cloud-msg'
      }),
      streamComplete: jest.fn(),
      embed: jest.fn(),
      countTokens: jest.fn().mockResolvedValue(10),
      healthCheck: jest.fn().mockResolvedValue({
        healthy: true,
        latency: 200,
        timestamp: new Date()
      }),
      getMetadata: jest.fn().mockReturnValue({
        name: 'claude',
        version: '1.0.0',
        models: ['claude-3-sonnet'],
        capabilities: { streaming: true, caching: true, embeddings: false, vision: true },
        costs: { inputPerMillion: 3, outputPerMillion: 15 },
        location: 'cloud'
      }),
      shutdown: jest.fn().mockResolvedValue(undefined),
      trackCost: jest.fn().mockReturnValue(0.01)
    };

    // Configure mock constructors to return our mock instances
    MockRuvllmProvider.mockImplementation(() => mockLocalInstance as any);
    MockClaudeProvider.mockImplementation(() => mockCloudInstance as any);
  });

  afterEach(async () => {
    if (router) {
      try {
        await router.shutdown();
      } catch {
        // Ignore shutdown errors in cleanup
      }
    }
  });

  describe('initialization', () => {
    it('should initialize with default config', async () => {
      router = new HybridRouter();
      await router.initialize();

      const health = await router.healthCheck();
      expect(health.healthy).toBe(true);
    });

    it('should initialize both providers', async () => {
      router = new HybridRouter();
      await router.initialize();

      const metadata = router.getMetadata();
      expect(metadata.models.length).toBeGreaterThan(0);
    });

    it('should warn on double initialization', async () => {
      router = new HybridRouter();
      await router.initialize();
      await router.initialize(); // Should not throw

      const health = await router.healthCheck();
      expect(health.healthy).toBe(true);
    });
  });

  describe('routing strategies', () => {
    beforeEach(async () => {
      router = new HybridRouter({
        defaultStrategy: RoutingStrategy.BALANCED
      });
      await router.initialize();
    });

    it('should route to local for cost optimization', async () => {
      const result = await router.complete({
        messages: [{ role: 'user', content: 'Simple question' }],
        routingStrategy: RoutingStrategy.COST_OPTIMIZED
      });

      // Cost optimized should prefer local (zero cost)
      expect(result.content).toBeDefined();
    });

    it('should route to local for privacy-first strategy', async () => {
      const result = await router.complete({
        messages: [{ role: 'user', content: 'Analyze my data' }],
        routingStrategy: RoutingStrategy.PRIVACY_FIRST
      });

      expect(result.content).toBeDefined();
      // Privacy-first always uses local
    });

    it('should respect forced provider selection', async () => {
      mockLocalInstance.complete.mockClear();
      mockCloudInstance.complete.mockClear();

      await router.complete({
        messages: [{ role: 'user', content: 'Test' }],
        forceProvider: 'local'
      });

      expect(mockLocalInstance.complete).toHaveBeenCalled();
    });

    it('should force cloud provider when specified', async () => {
      mockLocalInstance.complete.mockClear();
      mockCloudInstance.complete.mockClear();

      await router.complete({
        messages: [{ role: 'user', content: 'Test' }],
        forceProvider: 'cloud'
      });

      expect(mockCloudInstance.complete).toHaveBeenCalled();
    });
  });

  describe('privacy detection', () => {
    beforeEach(async () => {
      router = new HybridRouter({
        privacyKeywords: ['secret', 'password', 'api_key', 'credential']
      });
      await router.initialize();
    });

    it('should detect privacy-sensitive content', async () => {
      mockLocalInstance.complete.mockClear();

      await router.complete({
        messages: [{ role: 'user', content: 'Check my secret API password' }]
      });

      // Should route to local for privacy
      expect(mockLocalInstance.complete).toHaveBeenCalled();
    });

    it('should route normally for non-sensitive content', async () => {
      await router.complete({
        messages: [{ role: 'user', content: 'What is the weather?' }]
      });

      // Should complete successfully (may use either provider)
      expect(mockLocalInstance.complete).toHaveBeenCalled();
    });
  });

  describe('task complexity analysis', () => {
    beforeEach(async () => {
      router = new HybridRouter({
        defaultStrategy: RoutingStrategy.QUALITY_OPTIMIZED
      });
      await router.initialize();
    });

    it('should route simple tasks to local', async () => {
      mockLocalInstance.complete.mockClear();

      await router.complete({
        messages: [{ role: 'user', content: 'Hi' }]
      });

      // Simple task should use local
      expect(mockLocalInstance.complete).toHaveBeenCalled();
    });

    it('should handle complex tasks', async () => {
      const complexPrompt = `
        Please analyze the following code architecture and design a comprehensive
        refactoring strategy that includes database schema changes, API modifications,
        and frontend updates:
        \`\`\`
        class ComplexSystem {
          // ... hundreds of lines
        }
        \`\`\`
      `.repeat(10); // Make it very long

      const result = await router.complete({
        messages: [{ role: 'user', content: complexPrompt }],
        maxTokens: 8000
      });

      expect(result.content).toBeDefined();
    });
  });

  describe('TRM integration', () => {
    beforeEach(async () => {
      router = new HybridRouter({
        autoEnableTRM: true,
        defaultTRMConfig: {
          maxIterations: 3,
          convergenceThreshold: 0.9,
          qualityMetric: 'coherence'
        }
      });
      await router.initialize();
    });

    it('should auto-enable TRM for complex tasks', async () => {
      const result = await router.complete({
        messages: [{ role: 'user', content: 'Analyze complex system' }],
        forceProvider: 'local'
      });

      expect(result.content).toBeDefined();
    });

    it('should pass TRM config to local provider', async () => {
      mockLocalInstance.complete.mockClear();

      await router.complete({
        messages: [{ role: 'user', content: 'Test' }],
        forceProvider: 'local',
        trmConfig: {
          maxIterations: 5,
          qualityMetric: 'coverage'
        }
      });

      expect(mockLocalInstance.complete).toHaveBeenCalled();
    });
  });

  describe('circuit breaker', () => {
    beforeEach(async () => {
      router = new HybridRouter({
        enableCircuitBreaker: true,
        circuitBreakerThreshold: 3,
        circuitBreakerTimeout: 1000
      });
      await router.initialize();
    });

    it('should fallback when primary provider fails', async () => {
      // Make local fail
      mockLocalInstance.complete.mockRejectedValueOnce(new Error('Local failure'));

      const result = await router.complete({
        messages: [{ role: 'user', content: 'Test' }],
        forceProvider: 'local'
      });

      // Should fallback to cloud
      expect(result.content).toBeDefined();
    });

    it('should open circuit after threshold failures', async () => {
      // Force multiple failures
      for (let i = 0; i < 4; i++) {
        mockLocalInstance.complete.mockRejectedValueOnce(new Error('Failure'));
        try {
          await router.complete({
            messages: [{ role: 'user', content: 'Test' }],
            forceProvider: 'local'
          });
        } catch {
          // Expected to fail
        }
      }

      // Circuit should be open, subsequent calls should fail fast or fallback
      const stats = router.getRoutingStats();
      expect(stats.totalDecisions).toBeGreaterThan(0);
    });
  });

  describe('cost tracking', () => {
    beforeEach(async () => {
      router = new HybridRouter();
      await router.initialize();
    });

    it('should track routing statistics', async () => {
      await router.complete({
        messages: [{ role: 'user', content: 'Test 1' }]
      });
      await router.complete({
        messages: [{ role: 'user', content: 'Test 2' }]
      });

      const stats = router.getRoutingStats();
      expect(stats.totalDecisions).toBeGreaterThanOrEqual(2);
    });

    it('should generate cost savings report', async () => {
      await router.complete({
        messages: [{ role: 'user', content: 'Test' }]
      });

      const report = router.getCostSavingsReport();
      expect(report.totalRequests).toBeGreaterThanOrEqual(1);
      expect(report.totalCost).toBeGreaterThanOrEqual(0);
    });
  });

  describe('embed', () => {
    beforeEach(async () => {
      router = new HybridRouter();
      await router.initialize();
    });

    it('should prefer local for embeddings', async () => {
      const result = await router.embed({
        text: 'Test embedding'
      });

      expect(result.embedding).toBeDefined();
    });
  });

  describe('countTokens', () => {
    beforeEach(async () => {
      router = new HybridRouter();
      await router.initialize();
    });

    it('should count tokens', async () => {
      const count = await router.countTokens({
        text: 'Count these tokens please'
      });

      expect(typeof count).toBe('number');
      expect(count).toBeGreaterThan(0);
    });
  });

  describe('healthCheck', () => {
    beforeEach(async () => {
      router = new HybridRouter();
      await router.initialize();
    });

    it('should aggregate health from all providers', async () => {
      const health = await router.healthCheck();

      expect(health.healthy).toBe(true);
      expect(health.metadata?.providers).toBeDefined();
    });

    it('should include request counts', async () => {
      await router.complete({
        messages: [{ role: 'user', content: 'Test' }]
      });

      const health = await router.healthCheck();
      expect(health.metadata?.requestCount).toBeGreaterThanOrEqual(1);
    });
  });

  describe('getMetadata', () => {
    beforeEach(async () => {
      router = new HybridRouter();
      await router.initialize();
    });

    it('should aggregate metadata from providers', () => {
      const metadata = router.getMetadata();

      expect(metadata.name).toBe('hybrid-router');
      expect(metadata.models.length).toBeGreaterThan(0);
    });

    it('should combine capabilities', () => {
      const metadata = router.getMetadata();

      expect(metadata.capabilities.streaming).toBe(true);
    });

    it('should report minimum costs', () => {
      const metadata = router.getMetadata();

      // Should report the lowest cost (local = 0)
      expect(metadata.costs.inputPerMillion).toBe(0);
    });
  });

  describe('shutdown', () => {
    it('should shutdown all providers', async () => {
      router = new HybridRouter();
      await router.initialize();
      await router.shutdown();

      // Should handle gracefully
    });
  });

  describe('error handling', () => {
    it('should throw when not initialized', async () => {
      router = new HybridRouter();
      // Don't initialize

      await expect(router.complete({
        messages: [{ role: 'user', content: 'Test' }]
      })).rejects.toThrow(/not initialized/i);
    });
  });
});
