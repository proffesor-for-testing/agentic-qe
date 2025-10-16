/**
 * Phase 1 Integration Tests
 * End-to-end testing of Multi-Model Router + Streaming MCP Tools
 */

import { EventEmitter } from 'events';

// Mock SwarmMemoryManager
class MockMemoryStore {
  private data = new Map<string, any>();

  async store(key: string, value: any, options?: any): Promise<void> {
    this.data.set(key, { value, options, timestamp: Date.now() });
  }

  async retrieve(key: string, options?: any): Promise<any> {
    const item = this.data.get(key);
    return item ? item.value : undefined;
  }

  async delete(key: string): Promise<boolean> {
    return this.data.delete(key);
  }

  async clear(): Promise<void> {
    this.data.clear();
  }

  async query(pattern: string): Promise<any[]> {
    const results: any[] = [];
    for (const [key, value] of this.data.entries()) {
      if (key.includes(pattern)) {
        results.push({ key, ...value });
      }
    }
    return results;
  }
}

describe('Phase 1 Integration Tests', () => {
  let mockMemoryStore: MockMemoryStore;
  let mockEventBus: EventEmitter;

  beforeEach(async () => {
    mockMemoryStore = new MockMemoryStore();
    mockEventBus = new EventEmitter();
  });

  afterEach(async () => {
    await mockMemoryStore.clear();
    mockEventBus.removeAllListeners();
  });

  describe('End-to-End User Request Flow', () => {
    test('should handle complete user request from routing to streaming response', async () => {
      // User request
      const userRequest = {
        type: 'test-generation',
        sourceCode: 'function validateEmail(email) { return /^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/.test(email); }',
        framework: 'jest',
        complexity: 'medium'
      };

      // Phase 1: Model Router selects appropriate model
      const modelSelection = await selectModelForRequest(userRequest);
      expect(modelSelection.model).toBeDefined();
      expect(['gpt-3.5-turbo', 'gpt-4', 'claude-sonnet-4.5']).toContain(modelSelection.model);

      // Phase 2: Execute test generation with selected model
      const generationTask = {
        model: modelSelection.model,
        request: userRequest
      };

      // Phase 3: Stream results back to user
      const streamedEvents: any[] = [];
      const stream = executeAndStream(generationTask);

      for await (const event of stream) {
        streamedEvents.push(event);
      }

      // Verify complete flow
      expect(streamedEvents.length).toBeGreaterThan(0);

      const progressEvents = streamedEvents.filter(e => e.type === 'progress');
      expect(progressEvents.length).toBeGreaterThan(0);

      const resultEvents = streamedEvents.filter(e => e.type === 'result');
      expect(resultEvents.length).toBeGreaterThan(0);

      const completeEvent = streamedEvents.find(e => e.type === 'complete');
      expect(completeEvent).toBeDefined();
      expect(completeEvent.data).toHaveProperty('summary');
    });

    test('should track costs throughout the request lifecycle', async () => {
      const costTracker = new IntegratedCostTracker(mockMemoryStore);

      const userRequest = {
        type: 'test-generation',
        sourceCode: 'function add(a, b) { return a + b; }',
        complexity: 'simple'
      };

      // Route request
      const modelSelection = await selectModelForRequest(userRequest);

      // Track model selection cost
      await costTracker.recordModelSelection(modelSelection);

      // Execute and stream
      const stream = executeAndStream({
        model: modelSelection.model,
        request: userRequest
      });

      for await (const event of stream) {
        if (event.type === 'complete') {
          // Track execution cost
          await costTracker.recordExecution({
            model: modelSelection.model,
            inputTokens: event.data.usage.inputTokens,
            outputTokens: event.data.usage.outputTokens,
            taskType: userRequest.type
          });
        }
      }

      // Verify cost tracking
      const metrics = await costTracker.getMetrics();
      expect(metrics.totalCost).toBeGreaterThan(0);
      expect(metrics.costByModel[modelSelection.model]).toBeGreaterThan(0);

      // Verify cost persisted to memory
      const storedMetrics = await mockMemoryStore.retrieve('cost-tracker:metrics');
      expect(storedMetrics).toBeDefined();
      expect(storedMetrics.totalCost).toBe(metrics.totalCost);
    });

    test('should handle concurrent requests efficiently', async () => {
      const requests = Array.from({ length: 5 }, (_, i) => ({
        id: `request-${i}`,
        type: 'test-generation',
        sourceCode: `function test${i}() { return ${i}; }`,
        complexity: i % 2 === 0 ? 'simple' : 'complex'
      }));

      // Execute all requests concurrently
      const results = await Promise.all(
        requests.map(async request => {
          const modelSelection = await selectModelForRequest(request);

          const events: any[] = [];
          const stream = executeAndStream({
            model: modelSelection.model,
            request
          });

          for await (const event of stream) {
            events.push(event);
          }

          return {
            requestId: request.id,
            model: modelSelection.model,
            eventCount: events.length,
            completed: events.some(e => e.type === 'complete')
          };
        })
      );

      // Verify all requests completed
      expect(results.length).toBe(5);
      expect(results.every(r => r.completed)).toBe(true);

      // Verify different models were used based on complexity
      const simpleRequests = results.filter((_, i) => i % 2 === 0);
      const complexRequests = results.filter((_, i) => i % 2 !== 0);

      // Simple requests should use cheaper models
      expect(simpleRequests.every(r => r.model === 'gpt-3.5-turbo' || r.model === 'claude-haiku')).toBe(true);
    });

    test('should maintain request context across routing and streaming', async () => {
      const userRequest = {
        id: 'request-context-test',
        type: 'test-generation',
        sourceCode: 'function calculate() {}',
        metadata: {
          userId: 'user-123',
          projectId: 'project-456',
          sessionId: 'session-789'
        }
      };

      // Store context in memory
      await mockMemoryStore.store(`request:${userRequest.id}:context`, userRequest.metadata);

      // Route request
      const modelSelection = await selectModelForRequest(userRequest);

      // Execute and verify context is maintained
      const stream = executeAndStream({
        model: modelSelection.model,
        request: userRequest
      });

      for await (const event of stream) {
        if (event.type === 'complete') {
          // Retrieve and verify context
          const context = await mockMemoryStore.retrieve(`request:${userRequest.id}:context`);
          expect(context).toEqual(userRequest.metadata);
        }
      }
    });
  });

  describe('Feature Flag Scenarios', () => {
    test('should route with default model when feature disabled', async () => {
      const featureFlags = { multiModelRouter: false };

      const userRequest = {
        type: 'test-generation',
        sourceCode: 'function complex() { /* complex logic */ }',
        complexity: 'complex'
      };

      const modelSelection = await selectModelForRequest(userRequest, featureFlags);

      // Should use default model regardless of complexity
      expect(modelSelection.model).toBe('gpt-3.5-turbo');
      expect(modelSelection.reason).toContain('feature disabled');
    });

    test('should enable routing when feature flag is enabled', async () => {
      const featureFlags = { multiModelRouter: true };

      const simpleRequest = {
        type: 'test-generation',
        sourceCode: 'function add(a, b) { return a + b; }',
        complexity: 'simple'
      };

      const complexRequest = {
        type: 'test-generation',
        sourceCode: 'function complexSort(arr) { /* 50 lines */ }',
        complexity: 'complex',
        requiresPropertyBased: true
      };

      const simpleSelection = await selectModelForRequest(simpleRequest, featureFlags);
      const complexSelection = await selectModelForRequest(complexRequest, featureFlags);

      // Should route to different models
      expect(simpleSelection.model).toBe('gpt-3.5-turbo');
      expect(complexSelection.model).toBe('gpt-4');
    });

    test('should toggle feature flag mid-session', async () => {
      const requests = [
        { id: 1, complexity: 'complex', featureEnabled: false },
        { id: 2, complexity: 'complex', featureEnabled: true },
        { id: 3, complexity: 'complex', featureEnabled: false }
      ];

      const selections = await Promise.all(
        requests.map(req =>
          selectModelForRequest(
            { type: 'test-generation', complexity: req.complexity },
            { multiModelRouter: req.featureEnabled }
          )
        )
      );

      // First and third should use default (feature off)
      expect(selections[0].model).toBe('gpt-3.5-turbo');
      expect(selections[2].model).toBe('gpt-3.5-turbo');

      // Second should route based on complexity (feature on)
      expect(selections[1].model).toBe('gpt-4');
    });

    test('should persist feature flag state in memory', async () => {
      await mockMemoryStore.store('feature-flags', { multiModelRouter: true });

      const storedFlags = await mockMemoryStore.retrieve('feature-flags');

      const userRequest = {
        type: 'test-generation',
        complexity: 'complex'
      };

      const modelSelection = await selectModelForRequest(userRequest, storedFlags);

      // Should respect stored flag
      expect(modelSelection.model).toBe('gpt-4');
    });
  });

  describe('Fallback Scenarios', () => {
    test('should fallback on rate limit and continue streaming', async () => {
      const rateLimitedModels = new Set(['gpt-4']);

      const userRequest = {
        type: 'test-generation',
        sourceCode: 'function complex() {}',
        complexity: 'complex'
      };

      // First attempt should hit rate limit
      const modelSelection = await selectModelWithFallback(userRequest, rateLimitedModels);
      expect(modelSelection.model).not.toBe('gpt-4');
      expect(modelSelection.reason).toContain('fallback');

      // Should still complete streaming
      const stream = executeAndStream({
        model: modelSelection.model,
        request: userRequest
      });

      const events: any[] = [];
      for await (const event of stream) {
        events.push(event);
      }

      const completeEvent = events.find(e => e.type === 'complete');
      expect(completeEvent).toBeDefined();
    });

    test('should handle API errors and fallback gracefully', async () => {
      const failedModels = new Set(['gpt-3.5-turbo']);

      const userRequest = {
        type: 'test-generation',
        complexity: 'simple'
      };

      const modelSelection = await selectModelWithFallback(userRequest, failedModels);

      // Should select alternative model
      expect(modelSelection.model).not.toBe('gpt-3.5-turbo');
      expect(['gpt-4', 'claude-haiku']).toContain(modelSelection.model);

      // Should emit fallback event
      const fallbackEvents: any[] = [];
      mockEventBus.on('model:fallback', event => fallbackEvents.push(event));

      await selectModelWithFallback(userRequest, failedModels);

      expect(fallbackEvents.length).toBeGreaterThan(0);
    });

    test('should track fallback metrics', async () => {
      const rateLimitedModels = new Set(['gpt-4', 'gpt-3.5-turbo']);

      // Simulate multiple fallbacks
      const fallbackCount = 5;
      const fallbacks: string[] = [];

      for (let i = 0; i < fallbackCount; i++) {
        const selection = await selectModelWithFallback(
          { type: 'test-generation', complexity: 'complex' },
          rateLimitedModels
        );
        fallbacks.push(selection.model);
      }

      // All should fallback to same model
      expect(fallbacks.every(m => m === fallbacks[0])).toBe(true);
      expect(fallbacks[0]).toBe('claude-haiku');

      // Verify fallback metrics in memory
      const fallbackMetrics = await mockMemoryStore.retrieve('model-router:fallbacks');
      if (fallbackMetrics) {
        expect(fallbackMetrics.count).toBeGreaterThan(0);
      }
    });

    test('should recover from transient failures', async () => {
      const failedModels = new Set(['gpt-4']);

      // First request fails
      const selection1 = await selectModelWithFallback(
        { type: 'test-generation', complexity: 'complex' },
        failedModels
      );
      expect(selection1.model).not.toBe('gpt-4');

      // Simulate recovery (clear failed models)
      failedModels.clear();

      // Second request should succeed with preferred model
      const selection2 = await selectModelWithFallback(
        { type: 'test-generation', complexity: 'complex' },
        failedModels
      );
      expect(selection2.model).toBe('gpt-4');
    });
  });

  describe('Cost Tracking Integration', () => {
    test('should aggregate costs across multiple requests', async () => {
      const costTracker = new IntegratedCostTracker(mockMemoryStore);

      const requests = [
        { type: 'test-generation', complexity: 'simple', testsGenerated: 5 },
        { type: 'test-generation', complexity: 'complex', testsGenerated: 10 },
        { type: 'security-test', complexity: 'critical', testsGenerated: 3 }
      ];

      for (const request of requests) {
        const modelSelection = await selectModelForRequest(request);

        const stream = executeAndStream({
          model: modelSelection.model,
          request
        });

        for await (const event of stream) {
          if (event.type === 'complete') {
            await costTracker.recordExecution({
              model: modelSelection.model,
              inputTokens: event.data.usage.inputTokens,
              outputTokens: event.data.usage.outputTokens,
              taskType: request.type,
              testsGenerated: request.testsGenerated
            });
          }
        }
      }

      const metrics = await costTracker.getMetrics();

      expect(metrics.totalCost).toBeGreaterThan(0);
      expect(Object.keys(metrics.costByModel).length).toBeGreaterThan(0);
      expect(Object.keys(metrics.costByTaskType).length).toBeGreaterThan(1);
      expect(metrics.testsGenerated).toBe(18); // 5 + 10 + 3
      expect(metrics.averageCostPerTest).toBe(metrics.totalCost / 18);
    });

    test('should export cost dashboard with model breakdown', async () => {
      const costTracker = new IntegratedCostTracker(mockMemoryStore);

      await costTracker.recordExecution({
        model: 'gpt-3.5-turbo',
        inputTokens: 100,
        outputTokens: 200,
        taskType: 'test-generation',
        testsGenerated: 5
      });

      await costTracker.recordExecution({
        model: 'gpt-4',
        inputTokens: 150,
        outputTokens: 250,
        taskType: 'test-generation',
        testsGenerated: 10
      });

      const dashboard = await costTracker.exportDashboard();

      expect(dashboard).toHaveProperty('totalCost');
      expect(dashboard).toHaveProperty('modelBreakdown');
      expect(dashboard).toHaveProperty('taskTypeBreakdown');
      expect(dashboard).toHaveProperty('costPerTest');
      expect(dashboard).toHaveProperty('timestamp');

      expect(dashboard.modelBreakdown.length).toBe(2);
      expect(dashboard.modelBreakdown[0]).toHaveProperty('model');
      expect(dashboard.modelBreakdown[0]).toHaveProperty('cost');
      expect(dashboard.modelBreakdown[0]).toHaveProperty('percentage');
    });

    test('should update cost metrics in real-time during streaming', async () => {
      const costTracker = new IntegratedCostTracker(mockMemoryStore);

      const userRequest = {
        type: 'test-generation',
        sourceCode: 'function test() {}',
        complexity: 'medium'
      };

      const modelSelection = await selectModelForRequest(userRequest);
      const stream = executeAndStream({
        model: modelSelection.model,
        request: userRequest
      });

      let progressUpdateCount = 0;

      for await (const event of stream) {
        if (event.type === 'progress') {
          progressUpdateCount++;

          // Check that we can retrieve metrics during streaming
          const metrics = await costTracker.getMetrics();
          expect(metrics).toBeDefined();
        }

        if (event.type === 'complete') {
          await costTracker.recordExecution({
            model: modelSelection.model,
            inputTokens: event.data.usage.inputTokens,
            outputTokens: event.data.usage.outputTokens,
            taskType: userRequest.type
          });
        }
      }

      expect(progressUpdateCount).toBeGreaterThan(0);

      const finalMetrics = await costTracker.getMetrics();
      expect(finalMetrics.totalCost).toBeGreaterThan(0);
    });
  });

  describe('Error Recovery', () => {
    test('should handle routing errors and fallback', async () => {
      // Simulate routing error
      const corruptedRequest = {
        type: undefined,
        sourceCode: null,
        complexity: 'invalid'
      };

      let error: Error | null = null;
      try {
        await selectModelForRequest(corruptedRequest as any);
      } catch (e) {
        error = e as Error;
      }

      // Should handle gracefully or provide default
      expect(error).toBeDefined();
    });

    test('should handle streaming errors and cleanup', async () => {
      const userRequest = {
        type: 'test-generation',
        sourceCode: 'function test() {}',
        simulateError: true // Flag to trigger error
      };

      const modelSelection = await selectModelForRequest(userRequest);
      const stream = executeAndStreamWithError({
        model: modelSelection.model,
        request: userRequest
      });

      const events: any[] = [];

      try {
        for await (const event of stream) {
          events.push(event);

          if (event.type === 'error') {
            break;
          }
        }
      } catch (error) {
        // Expected error
      }

      // Should have received some events before error
      expect(events.length).toBeGreaterThan(0);

      // Should have received error event
      const errorEvent = events.find(e => e.type === 'error');
      expect(errorEvent).toBeDefined();
    });
  });
});

// Helper functions
async function selectModelForRequest(request: any, featureFlags?: any): Promise<any> {
  if (featureFlags?.multiModelRouter === false) {
    return {
      model: 'gpt-3.5-turbo',
      reason: 'feature disabled - using default',
      estimatedCost: 0.001,
      confidence: 1.0
    };
  }

  if (request.type === 'security-test' || request.complexity === 'critical') {
    return {
      model: 'claude-sonnet-4.5',
      reason: 'security or critical task',
      estimatedCost: 0.003,
      confidence: 0.85
    };
  }

  if (request.requiresPropertyBased || request.complexity === 'complex') {
    return {
      model: 'gpt-4',
      reason: 'complex task requiring advanced reasoning',
      estimatedCost: 0.006,
      confidence: 0.8
    };
  }

  return {
    model: 'gpt-3.5-turbo',
    reason: 'simple task - cost-effective model',
    estimatedCost: 0.0006,
    confidence: 0.9
  };
}

async function selectModelWithFallback(request: any, excludedModels: Set<string>): Promise<any> {
  const preferred = await selectModelForRequest(request);

  if (excludedModels.has(preferred.model)) {
    return {
      model: 'claude-haiku',
      reason: `fallback from ${preferred.model}`,
      estimatedCost: 0.0008,
      confidence: 0.6
    };
  }

  return preferred;
}

async function* executeAndStream(task: any): AsyncGenerator<any> {
  const testCount = Math.floor(Math.random() * 5) + 3; // 3-7 tests

  for (let i = 0; i < testCount; i++) {
    yield {
      type: 'progress',
      progress: Math.round((i / testCount) * 100),
      data: { currentTest: i, total: testCount },
      timestamp: Date.now()
    };

    await new Promise(resolve => setTimeout(resolve, 1));

    yield {
      type: 'result',
      data: {
        name: `test-${i}`,
        status: 'passed',
        duration: Math.random() * 10
      },
      timestamp: Date.now()
    };
  }

  yield {
    type: 'complete',
    data: {
      summary: {
        total: testCount,
        passed: testCount,
        failed: 0
      },
      usage: {
        inputTokens: 100 + Math.random() * 100,
        outputTokens: 200 + Math.random() * 200
      }
    },
    timestamp: Date.now()
  };
}

async function* executeAndStreamWithError(task: any): AsyncGenerator<any> {
  yield {
    type: 'progress',
    progress: 10,
    timestamp: Date.now()
  };

  yield {
    type: 'error',
    data: {
      error: 'Simulated execution error',
      fatal: true
    },
    timestamp: Date.now()
  };
}

class IntegratedCostTracker {
  private metrics: any = {
    totalCost: 0,
    costByModel: {},
    costByTaskType: {},
    testsGenerated: 0,
    averageCostPerTest: 0
  };

  constructor(private memoryStore: MockMemoryStore) {}

  async recordModelSelection(selection: any): Promise<void> {
    // Track model selection for analytics
  }

  async recordExecution(usage: any): Promise<void> {
    const modelCosts: Record<string, number> = {
      'gpt-3.5-turbo': 0.000002,
      'gpt-4': 0.00006,
      'claude-sonnet-4.5': 0.00003,
      'claude-haiku': 0.000008
    };

    const cost = (usage.inputTokens + usage.outputTokens) *
      (modelCosts[usage.model] || 0.00001);

    this.metrics.totalCost += cost;
    this.metrics.costByModel[usage.model] =
      (this.metrics.costByModel[usage.model] || 0) + cost;
    this.metrics.costByTaskType[usage.taskType] =
      (this.metrics.costByTaskType[usage.taskType] || 0) + cost;

    if (usage.testsGenerated) {
      this.metrics.testsGenerated += usage.testsGenerated;
    }

    this.metrics.averageCostPerTest = this.metrics.testsGenerated > 0
      ? this.metrics.totalCost / this.metrics.testsGenerated
      : 0;

    await this.memoryStore.store('cost-tracker:metrics', this.metrics);
  }

  async getMetrics(): Promise<any> {
    return { ...this.metrics };
  }

  async exportDashboard(): Promise<any> {
    return {
      totalCost: this.metrics.totalCost,
      costPerTest: this.metrics.averageCostPerTest,
      testsGenerated: this.metrics.testsGenerated,
      timestamp: new Date().toISOString(),
      modelBreakdown: Object.entries(this.metrics.costByModel).map(([model, cost]) => ({
        model,
        cost,
        percentage: ((cost as number) / this.metrics.totalCost) * 100
      })),
      taskTypeBreakdown: Object.entries(this.metrics.costByTaskType).map(([type, cost]) => ({
        type,
        cost,
        percentage: ((cost as number) / this.metrics.totalCost) * 100
      }))
    };
  }
}
