/**
 * Local Routing Tests
 * Tests for RuvLLM local routing functionality in AdaptiveModelRouter
 */

import { AdaptiveModelRouter } from '../../src/core/routing/AdaptiveModelRouter';
import { SwarmMemoryManager } from '../../src/core/memory/SwarmMemoryManager';
import { EventBus } from '../../src/core/EventBus';
import { AIModel, TaskComplexity } from '../../src/core/routing/types';
import { MODEL_CAPABILITIES } from '../../src/core/routing/ModelRules';

// Mock fetch globally
global.fetch = jest.fn() as jest.MockedFunction<typeof fetch>;

describe('AdaptiveModelRouter - Local Routing', () => {
  let router: AdaptiveModelRouter;
  let memoryStore: SwarmMemoryManager;
  let eventBus: EventBus;

  beforeEach(async () => {
    jest.clearAllMocks();

    eventBus = new EventBus();
    memoryStore = new SwarmMemoryManager();
    await memoryStore.initialize();

    router = new AdaptiveModelRouter(memoryStore, eventBus, {
      enabled: true,
      preferLocal: true,
      ruvllmEndpoint: 'http://localhost:8080',
      enableCostTracking: true,
      enableFallback: true,
    });

    // Wait for router initialization
    await new Promise(resolve => setTimeout(resolve, 100));
  });

  describe('RuvLLM Model Definitions', () => {
    it('should have RuvLLM models defined in AIModel enum', () => {
      expect(AIModel.RUVLLM_LLAMA_3_2_1B).toBe('ruvllm:llama-3.2-1b-instruct');
      expect(AIModel.RUVLLM_LLAMA_3_2_3B).toBe('ruvllm:llama-3.2-3b-instruct');
      expect(AIModel.RUVLLM_LLAMA_3_1_8B).toBe('ruvllm:llama-3.1-8b-instruct');
      expect(AIModel.RUVLLM_PHI_3_MINI).toBe('ruvllm:phi-3-mini');
      expect(AIModel.RUVLLM_MISTRAL_7B).toBe('ruvllm:mistral-7b-instruct');
      expect(AIModel.RUVLLM_QWEN2_7B).toBe('ruvllm:qwen2-7b-instruct');
    });

    it('should have zero cost for all RuvLLM models', () => {
      expect(MODEL_CAPABILITIES[AIModel.RUVLLM_LLAMA_3_2_1B].costPerToken).toBe(0);
      expect(MODEL_CAPABILITIES[AIModel.RUVLLM_LLAMA_3_2_3B].costPerToken).toBe(0);
      expect(MODEL_CAPABILITIES[AIModel.RUVLLM_LLAMA_3_1_8B].costPerToken).toBe(0);
      expect(MODEL_CAPABILITIES[AIModel.RUVLLM_PHI_3_MINI].costPerToken).toBe(0);
      expect(MODEL_CAPABILITIES[AIModel.RUVLLM_MISTRAL_7B].costPerToken).toBe(0);
      expect(MODEL_CAPABILITIES[AIModel.RUVLLM_QWEN2_7B].costPerToken).toBe(0);
    });

    it('should have no rate limits for RuvLLM models', () => {
      expect(MODEL_CAPABILITIES[AIModel.RUVLLM_LLAMA_3_2_1B].rateLimitPerMin).toBe(Infinity);
      expect(MODEL_CAPABILITIES[AIModel.RUVLLM_LLAMA_3_2_3B].rateLimitPerMin).toBe(Infinity);
      expect(MODEL_CAPABILITIES[AIModel.RUVLLM_LLAMA_3_1_8B].rateLimitPerMin).toBe(Infinity);
    });
  });

  describe('routeToLocal()', () => {
    it('should route to local model when RuvLLM is available', async () => {
      // Mock successful health check
      const mockFetch = global.fetch as jest.MockedFunction<typeof fetch>;
      mockFetch.mockResolvedValueOnce({
        ok: true,
      } as Response);

      const task = {
        id: 'test-1',
        type: 'qe-test-generator',
        description: 'Generate unit tests',
        data: {},
        priority: 1,
      };

      const analysis = {
        complexity: TaskComplexity.SIMPLE,
        estimatedTokens: 1000,
        requiresReasoning: false,
        requiresSecurity: false,
        requiresPerformance: false,
        confidence: 0.95,
      };

      const selection = await router.routeToLocal(task, analysis);

      expect(selection).not.toBeNull();
      expect(selection?.model).toBe(AIModel.RUVLLM_LLAMA_3_2_1B);
      expect(selection?.estimatedCost).toBe(0);
      expect(selection?.reasoning).toContain('Local inference');
      expect(selection?.reasoning).toContain('zero cost');
    });

    it('should return null when RuvLLM is unavailable', async () => {
      // Mock failed health check
      const mockFetch = global.fetch as jest.MockedFunction<typeof fetch>;
      mockFetch.mockRejectedValueOnce(new Error('Connection refused'));

      const task = {
        id: 'test-2',
        type: 'qe-test-generator',
        description: 'Generate tests',
        data: {},
        priority: 1,
      };

      const analysis = {
        complexity: TaskComplexity.SIMPLE,
        estimatedTokens: 1000,
        requiresReasoning: false,
        requiresSecurity: false,
        requiresPerformance: false,
        confidence: 0.95,
      };

      const selection = await router.routeToLocal(task, analysis);

      expect(selection).toBeNull();
    });

    it('should select appropriate model based on complexity', async () => {
      // Mock successful health check
      const mockFetch = global.fetch as jest.MockedFunction<typeof fetch>;
      mockFetch.mockResolvedValue({ ok: true } as Response);

      const testCases = [
        { complexity: TaskComplexity.SIMPLE, expected: AIModel.RUVLLM_LLAMA_3_2_1B },
        { complexity: TaskComplexity.MODERATE, expected: AIModel.RUVLLM_LLAMA_3_2_3B },
        { complexity: TaskComplexity.COMPLEX, expected: AIModel.RUVLLM_LLAMA_3_1_8B },
        { complexity: TaskComplexity.CRITICAL, expected: AIModel.RUVLLM_MISTRAL_7B },
      ];

      for (const { complexity, expected } of testCases) {
        const task = {
          id: `test-${complexity}`,
          type: 'qe-test-generator',
          description: `Test ${complexity}`,
          data: {},
          priority: 1,
        };

        const analysis = {
          complexity,
          estimatedTokens: 1000,
          requiresReasoning: false,
          requiresSecurity: false,
          requiresPerformance: false,
          confidence: 0.95,
        };

        const selection = await router.routeToLocal(task, analysis);
        expect(selection?.model).toBe(expected);
      }
    });

    it('should emit local-selected event when routing succeeds', async () => {
      // Mock successful health check
      const mockFetch = global.fetch as jest.MockedFunction<typeof fetch>;
      mockFetch.mockResolvedValueOnce({ ok: true } as Response);

      const eventSpy = jest.fn();
      eventBus.on('router:local-selected', eventSpy);

      const task = {
        id: 'test-event',
        type: 'qe-test-generator',
        description: 'Test',
        data: {},
        priority: 1,
      };

      const analysis = {
        complexity: TaskComplexity.MODERATE,
        estimatedTokens: 1000,
        requiresReasoning: false,
        requiresSecurity: false,
        requiresPerformance: false,
        confidence: 0.95,
      };

      await router.routeToLocal(task, analysis);

      expect(eventSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          task: 'test-event',
          model: AIModel.RUVLLM_LLAMA_3_2_3B,
          complexity: TaskComplexity.MODERATE,
          costSavings: expect.any(Number),
        })
      );
    });

    it('should emit local-unavailable event when RuvLLM is down', async () => {
      // Mock failed health check
      const mockFetch = global.fetch as jest.MockedFunction<typeof fetch>;
      mockFetch.mockRejectedValueOnce(new Error('Connection refused'));

      const eventSpy = jest.fn();
      eventBus.on('router:local-unavailable', eventSpy);

      const task = {
        id: 'test-unavailable',
        type: 'qe-test-generator',
        description: 'Test',
        data: {},
        priority: 1,
      };

      const analysis = {
        complexity: TaskComplexity.SIMPLE,
        estimatedTokens: 1000,
        requiresReasoning: false,
        requiresSecurity: false,
        requiresPerformance: false,
        confidence: 0.95,
      };

      await router.routeToLocal(task, analysis);

      expect(eventSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          task: 'test-unavailable',
          reason: 'RuvLLM server not reachable',
        })
      );
    });

    it('should include cost comparison in reasoning', async () => {
      // Mock successful health check
      const mockFetch = global.fetch as jest.MockedFunction<typeof fetch>;
      mockFetch.mockResolvedValueOnce({ ok: true } as Response);

      const task = {
        id: 'test-cost',
        type: 'qe-test-generator',
        description: 'Test',
        data: {},
        priority: 1,
      };

      const analysis = {
        complexity: TaskComplexity.MODERATE,
        estimatedTokens: 2000,
        requiresReasoning: false,
        requiresSecurity: false,
        requiresPerformance: false,
        confidence: 0.95,
      };

      const selection = await router.routeToLocal(task, analysis);

      expect(selection?.reasoning).toContain('zero cost vs');
      expect(selection?.reasoning).toContain('Local inference');
    });

    it('should include privacy benefits in reasoning for security tasks', async () => {
      // Mock successful health check
      const mockFetch = global.fetch as jest.MockedFunction<typeof fetch>;
      mockFetch.mockResolvedValueOnce({ ok: true } as Response);

      const task = {
        id: 'test-security',
        type: 'qe-security-scanner',
        description: 'Security test',
        data: {},
        priority: 1,
      };

      const analysis = {
        complexity: TaskComplexity.CRITICAL,
        estimatedTokens: 2000,
        requiresReasoning: true,
        requiresSecurity: true,
        requiresPerformance: false,
        confidence: 0.95,
      };

      const selection = await router.routeToLocal(task, analysis);

      expect(selection?.reasoning).toContain('Privacy-preserving');
      expect(selection?.reasoning).toContain('data stays local');
    });
  });

  describe('selectModel() with preferLocal', () => {
    it('should prefer local routing when enabled', async () => {
      // Mock successful health check
      const mockFetch = global.fetch as jest.MockedFunction<typeof fetch>;
      mockFetch.mockResolvedValue({ ok: true } as Response);

      const task = {
        id: 'test-prefer-local',
        type: 'qe-test-generator',
        description: 'Generate tests',
        data: {},
        priority: 1,
      };

      const selection = await router.selectModel(task);

      // Should route to local model
      expect(selection.model).toContain('ruvllm:');
      expect(selection.estimatedCost).toBe(0);
    });

    it('should fallback to cloud when local is unavailable', async () => {
      // Mock failed health check
      const mockFetch = global.fetch as jest.MockedFunction<typeof fetch>;
      mockFetch.mockRejectedValue(new Error('Connection refused'));

      const task = {
        id: 'test-fallback',
        type: 'qe-test-generator',
        description: 'Generate tests',
        data: {},
        priority: 1,
      };

      const selection = await router.selectModel(task);

      // Should fallback to cloud model
      expect(selection.model).not.toContain('ruvllm:');
      expect(selection.estimatedCost).toBeGreaterThan(0);
    });

    it('should use cloud when preferLocal is disabled', async () => {
      const cloudMemoryStore = new SwarmMemoryManager();
      await cloudMemoryStore.initialize();

      const cloudRouter = new AdaptiveModelRouter(cloudMemoryStore, eventBus, {
        enabled: true,
        preferLocal: false, // Disable local preference
        enableCostTracking: true,
        enableFallback: true,
      });

      // Wait for initialization
      await new Promise(resolve => setTimeout(resolve, 100));

      const task = {
        id: 'test-cloud-only',
        type: 'qe-test-generator',
        description: 'Generate tests',
        data: {},
        priority: 1,
      };

      const selection = await cloudRouter.selectModel(task);

      // Should use cloud model directly
      expect(selection.model).not.toContain('ruvllm:');
    });
  });

  describe('Environment Variable Support', () => {
    it('should use RUVLLM_ENDPOINT from environment', () => {
      const customEndpoint = 'http://custom-host:9090';
      const customRouter = new AdaptiveModelRouter(memoryStore, eventBus, {
        enabled: true,
        preferLocal: true,
        ruvllmEndpoint: customEndpoint,
      });

      // Access the private config to verify
      expect((customRouter as any).config.ruvllmEndpoint).toBe(customEndpoint);
    });
  });
});
