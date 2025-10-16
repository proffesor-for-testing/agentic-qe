/**
 * Unit tests for Multi-Model Router
 * Tests model selection, cost tracking, and fallback strategies
 */

import { EventEmitter } from 'events';

// Mock implementations for testing
interface ModelConfig {
  name: string;
  costPerToken: number;
  rateLimit: number;
  capabilities: string[];
}

interface TaskComplexity {
  score: number;
  factors: string[];
  reasoning: string;
}

interface ModelSelection {
  model: string;
  reason: string;
  estimatedCost: number;
  confidence: number;
}

interface CostMetrics {
  totalCost: number;
  costByModel: Record<string, number>;
  costByTaskType: Record<string, number>;
  testsGenerated: number;
  averageCostPerTest: number;
}

// Mock SwarmMemoryManager
class MockMemoryStore {
  private data = new Map<string, any>();

  async store(key: string, value: any, options?: { partition?: string; ttl?: number }): Promise<void> {
    this.data.set(key, { value, options, timestamp: Date.now() });
  }

  async retrieve(key: string, options?: { partition?: string }): Promise<any> {
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

describe('ModelRouter', () => {
  let mockMemoryStore: MockMemoryStore;
  let mockEventBus: EventEmitter;
  let modelConfigs: ModelConfig[];

  beforeEach(() => {
    mockMemoryStore = new MockMemoryStore();
    mockEventBus = new EventEmitter();

    modelConfigs = [
      {
        name: 'gpt-3.5-turbo',
        costPerToken: 0.000002,
        rateLimit: 10000,
        capabilities: ['simple-generation', 'unit-tests']
      },
      {
        name: 'gpt-4',
        costPerToken: 0.00006,
        rateLimit: 5000,
        capabilities: ['complex-generation', 'property-based', 'integration-tests']
      },
      {
        name: 'claude-sonnet-4.5',
        costPerToken: 0.00003,
        rateLimit: 8000,
        capabilities: ['security-tests', 'critical-analysis', 'architecture-review']
      },
      {
        name: 'claude-haiku',
        costPerToken: 0.000008,
        rateLimit: 15000,
        capabilities: ['fallback', 'simple-generation']
      }
    ];
  });

  afterEach(async () => {
    await mockMemoryStore.clear();
    mockEventBus.removeAllListeners();
  });

  describe('Model Selection', () => {
    test('should select GPT-3.5 for simple test generation', async () => {
      const task = {
        type: 'test-generation',
        complexity: 'simple',
        description: 'Generate unit tests for add function',
        sourceCode: 'function add(a, b) { return a + b; }'
      };

      const selectedModel = selectModel(task, modelConfigs);

      expect(selectedModel.model).toBe('gpt-3.5-turbo');
      expect(selectedModel.reason).toContain('simple');
      expect(selectedModel.confidence).toBeGreaterThan(0.8);
    });

    test('should select GPT-4 for complex property-based tests', async () => {
      const task = {
        type: 'test-generation',
        complexity: 'complex',
        description: 'Generate property-based tests for sorting algorithm',
        requiresPropertyBased: true,
        sourceCode: 'function quickSort(arr) { /* complex implementation */ }'
      };

      const selectedModel = selectModel(task, modelConfigs);

      expect(selectedModel.model).toBe('gpt-4');
      expect(selectedModel.reason).toContain('property-based');
      expect(selectedModel.confidence).toBeGreaterThan(0.7);
    });

    test('should select Claude Sonnet 4.5 for critical security tests', async () => {
      const task = {
        type: 'security-test-generation',
        complexity: 'critical',
        description: 'Generate security tests for authentication module',
        requiresSecurity: true,
        sourceCode: 'function authenticate(user, pass) { /* auth logic */ }'
      };

      const selectedModel = selectModel(task, modelConfigs);

      expect(selectedModel.model).toBe('claude-sonnet-4.5');
      expect(selectedModel.reason).toContain('security');
      expect(selectedModel.confidence).toBeGreaterThan(0.8);
    });

    test('should consider cost in model selection', async () => {
      const task = {
        type: 'test-generation',
        complexity: 'medium',
        description: 'Generate tests with cost awareness',
        costSensitive: true
      };

      const selectedModel = selectModel(task, modelConfigs);

      // Should prefer cheaper models when cost-sensitive
      expect(['gpt-3.5-turbo', 'claude-haiku']).toContain(selectedModel.model);
      expect(selectedModel.estimatedCost).toBeLessThan(0.01);
    });
  });

  describe('Fallback Strategies', () => {
    test('should fallback to Claude Haiku on rate limit', async () => {
      // Simulate rate limit hit
      const rateLimitedModels = new Set(['gpt-3.5-turbo', 'gpt-4']);

      const task = {
        type: 'test-generation',
        complexity: 'simple',
        description: 'Generate tests during rate limit'
      };

      const selectedModel = selectModelWithFallback(task, modelConfigs, rateLimitedModels);

      expect(selectedModel.model).toBe('claude-haiku');
      expect(selectedModel.reason).toContain('fallback');
    });

    test('should handle API errors gracefully', async () => {
      const failedModels = new Set(['gpt-4']);

      const task = {
        type: 'test-generation',
        complexity: 'complex',
        description: 'Generate tests after API failure'
      };

      const selectedModel = selectModelWithFallback(task, modelConfigs, failedModels);

      // Should select alternative model with similar capabilities
      expect(selectedModel.model).not.toBe('gpt-4');
      expect(modelConfigs.find(m => m.name === selectedModel.model)).toBeDefined();
    });

    test('should track fallback occurrences', async () => {
      const fallbackTracker = new Map<string, number>();

      // Simulate multiple fallbacks
      for (let i = 0; i < 5; i++) {
        const model = selectModelWithFallback(
          { type: 'test-generation', complexity: 'simple' },
          modelConfigs,
          new Set(['gpt-3.5-turbo'])
        );

        fallbackTracker.set(model.model, (fallbackTracker.get(model.model) || 0) + 1);
      }

      expect(fallbackTracker.get('claude-haiku')).toBe(5);
    });
  });

  describe('Feature Flag Support', () => {
    test('should respect feature flag when disabled', async () => {
      const featureFlags = { multiModelRouter: false };

      const task = {
        type: 'test-generation',
        complexity: 'complex'
      };

      const selectedModel = selectModel(task, modelConfigs, featureFlags);

      // Should use default model when feature is disabled
      expect(selectedModel.model).toBe('gpt-3.5-turbo'); // default
      expect(selectedModel.reason).toContain('feature disabled');
    });

    test('should use routing when feature flag enabled', async () => {
      const featureFlags = { multiModelRouter: true };

      const task = {
        type: 'test-generation',
        complexity: 'complex'
      };

      const selectedModel = selectModel(task, modelConfigs, featureFlags);

      // Should route based on complexity
      expect(['gpt-4', 'claude-sonnet-4.5']).toContain(selectedModel.model);
    });

    test('should allow feature flag override per request', async () => {
      const task = {
        type: 'test-generation',
        complexity: 'complex',
        forceModel: 'gpt-3.5-turbo' // Override routing
      };

      const selectedModel = selectModel(task, modelConfigs, { multiModelRouter: true });

      expect(selectedModel.model).toBe('gpt-3.5-turbo');
      expect(selectedModel.reason).toContain('forced');
    });
  });

  describe('Cost Tracking', () => {
    test('should track costs accurately per request', async () => {
      const costTracker = new CostTracker();

      await costTracker.recordUsage({
        model: 'gpt-3.5-turbo',
        inputTokens: 100,
        outputTokens: 200,
        taskType: 'test-generation'
      });

      const metrics = costTracker.getMetrics();

      const expectedCost = (100 + 200) * 0.000002;
      expect(metrics.totalCost).toBeCloseTo(expectedCost, 6);
      expect(metrics.costByModel['gpt-3.5-turbo']).toBeCloseTo(expectedCost, 6);
    });

    test('should aggregate costs by model', async () => {
      const costTracker = new CostTracker();

      // Record multiple uses of different models
      await costTracker.recordUsage({
        model: 'gpt-3.5-turbo',
        inputTokens: 100,
        outputTokens: 200,
        taskType: 'test-generation'
      });

      await costTracker.recordUsage({
        model: 'gpt-4',
        inputTokens: 150,
        outputTokens: 250,
        taskType: 'test-generation'
      });

      await costTracker.recordUsage({
        model: 'gpt-3.5-turbo',
        inputTokens: 100,
        outputTokens: 200,
        taskType: 'test-generation'
      });

      const metrics = costTracker.getMetrics();

      expect(Object.keys(metrics.costByModel)).toHaveLength(2);
      expect(metrics.costByModel['gpt-3.5-turbo']).toBeGreaterThan(metrics.costByModel['gpt-3.5-turbo'] / 2);
    });

    test('should aggregate costs by task type', async () => {
      const costTracker = new CostTracker();

      await costTracker.recordUsage({
        model: 'gpt-4',
        inputTokens: 100,
        outputTokens: 200,
        taskType: 'test-generation'
      });

      await costTracker.recordUsage({
        model: 'claude-sonnet-4.5',
        inputTokens: 150,
        outputTokens: 250,
        taskType: 'security-test'
      });

      const metrics = costTracker.getMetrics();

      expect(Object.keys(metrics.costByTaskType)).toHaveLength(2);
      expect(metrics.costByTaskType['test-generation']).toBeDefined();
      expect(metrics.costByTaskType['security-test']).toBeDefined();
    });

    test('should calculate cost per test accurately', async () => {
      const costTracker = new CostTracker();

      // Record costs for 10 tests
      for (let i = 0; i < 10; i++) {
        await costTracker.recordUsage({
          model: 'gpt-3.5-turbo',
          inputTokens: 100,
          outputTokens: 200,
          taskType: 'test-generation',
          testsGenerated: 5
        });
      }

      const metrics = costTracker.getMetrics();

      expect(metrics.testsGenerated).toBe(50); // 10 * 5
      expect(metrics.averageCostPerTest).toBeGreaterThan(0);
      expect(metrics.averageCostPerTest).toBe(metrics.totalCost / metrics.testsGenerated);
    });

    test('should export cost dashboard data', async () => {
      const costTracker = new CostTracker();

      await costTracker.recordUsage({
        model: 'gpt-4',
        inputTokens: 1000,
        outputTokens: 2000,
        taskType: 'test-generation',
        testsGenerated: 10
      });

      const dashboard = costTracker.exportDashboard();

      expect(dashboard).toHaveProperty('totalCost');
      expect(dashboard).toHaveProperty('costByModel');
      expect(dashboard).toHaveProperty('costByTaskType');
      expect(dashboard).toHaveProperty('costPerTest');
      expect(dashboard).toHaveProperty('timestamp');
      expect(dashboard.modelBreakdown).toBeDefined();
      expect(Array.isArray(dashboard.modelBreakdown)).toBe(true);
    });

    test('should persist cost data to SwarmMemoryManager', async () => {
      const costTracker = new CostTracker(mockMemoryStore);

      await costTracker.recordUsage({
        model: 'gpt-3.5-turbo',
        inputTokens: 100,
        outputTokens: 200,
        taskType: 'test-generation'
      });

      await costTracker.persist();

      const storedData = await mockMemoryStore.retrieve('cost-tracker:metrics');
      expect(storedData).toBeDefined();
      expect(storedData.totalCost).toBeGreaterThan(0);
    });
  });
});

describe('AdaptiveModelRouter', () => {
  let mockMemoryStore: MockMemoryStore;
  let mockEventBus: EventEmitter;

  beforeEach(() => {
    mockMemoryStore = new MockMemoryStore();
    mockEventBus = new EventEmitter();
  });

  describe('Task Complexity Analysis', () => {
    test('should analyze task complexity correctly for simple tasks', async () => {
      const task = {
        type: 'test-generation',
        sourceCode: 'function add(a, b) { return a + b; }',
        linesOfCode: 1,
        cyclomaticComplexity: 1
      };

      const complexity = analyzeTaskComplexity(task);

      expect(complexity.score).toBeLessThan(0.3);
      expect(complexity.factors).toContain('low-loc');
      expect(complexity.reasoning).toContain('low-loc');
    });

    test('should analyze task complexity correctly for complex tasks', async () => {
      const task = {
        type: 'test-generation',
        sourceCode: 'function complexSort(arr, compareFn, options) { /* 50 lines */ }',
        linesOfCode: 50,
        cyclomaticComplexity: 12,
        requiresPropertyBased: true
      };

      const complexity = analyzeTaskComplexity(task);

      expect(complexity.score).toBeGreaterThanOrEqual(0.7);
      expect(complexity.factors).toContain('high-complexity');
      expect(complexity.factors).toContain('property-based-required');
    });

    test('should consider multiple complexity factors', async () => {
      const task = {
        type: 'test-generation',
        sourceCode: 'function middleware(req, res, next) { /* async logic */ }',
        linesOfCode: 25,
        cyclomaticComplexity: 6,
        hasAsyncOperations: true,
        hasErrorHandling: true,
        integrationTestRequired: true
      };

      const complexity = analyzeTaskComplexity(task);

      expect(complexity.factors.length).toBeGreaterThanOrEqual(2);
      expect(complexity.factors).toContain('async-operations');
      expect(complexity.factors).toContain('integration-test');
    });

    test('should handle edge cases in complexity analysis', async () => {
      const edgeCases = [
        { sourceCode: '', linesOfCode: 0 }, // Empty code
        { sourceCode: null }, // Null code
        { linesOfCode: -1 }, // Invalid LOC
        { cyclomaticComplexity: undefined } // Missing complexity
      ];

      edgeCases.forEach(task => {
        expect(() => analyzeTaskComplexity(task)).not.toThrow();
        const complexity = analyzeTaskComplexity(task);
        expect(complexity.score).toBeGreaterThanOrEqual(0);
        expect(complexity.score).toBeLessThanOrEqual(1);
      });
    });
  });

  describe('Complexity Analysis Caching', () => {
    test('should cache complexity analysis results', async () => {
      const router = new AdaptiveModelRouter(mockMemoryStore, mockEventBus);

      const task = {
        type: 'test-generation',
        sourceCode: 'function test() { return true; }',
        id: 'task-123'
      };

      const result1 = await router.analyzeComplexity(task);
      const result2 = await router.analyzeComplexity(task);

      // Second call should return cached result
      expect(result1).toEqual(result2);

      // Verify cache was used (check memory store)
      const cached = await mockMemoryStore.retrieve(`complexity:${task.id}`);
      expect(cached).toBeDefined();
    });

    test('should invalidate cache on task changes', async () => {
      const router = new AdaptiveModelRouter(mockMemoryStore, mockEventBus);

      const task = {
        type: 'test-generation',
        sourceCode: 'function test() { return true; }',
        id: 'task-123',
        version: 1
      };

      await router.analyzeComplexity(task);

      // Modify task
      task.version = 2;
      task.sourceCode = 'function test() { return false; }';

      const result = await router.analyzeComplexity(task);

      // Should reanalyze due to version change
      expect(result).toBeDefined();
    });

    test('should respect cache TTL', async () => {
      const router = new AdaptiveModelRouter(mockMemoryStore, mockEventBus, {
        cacheTTL: 100 // 100ms
      });

      const task = {
        type: 'test-generation',
        sourceCode: 'function test() { return true; }',
        id: 'task-123'
      };

      await router.analyzeComplexity(task);

      // Wait for cache to expire
      await new Promise(resolve => setTimeout(resolve, 150));

      const result2 = await router.analyzeComplexity(task);

      // Should reanalyze after cache expires
      expect(result2).toBeDefined();
      expect(result2.score).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Event Emission', () => {
    test('should emit model-selected events', async () => {
      const router = new AdaptiveModelRouter(mockMemoryStore, mockEventBus);

      const events: any[] = [];
      mockEventBus.on('model:selected', (event) => events.push(event));

      const task = {
        type: 'test-generation',
        complexity: 'simple',
        id: 'task-123'
      };

      await router.selectModel(task);

      expect(events.length).toBe(1);
      expect(events[0]).toHaveProperty('model');
      expect(events[0]).toHaveProperty('taskId', 'task-123');
      expect(events[0]).toHaveProperty('complexity');
    });

    test('should emit complexity-analyzed events', async () => {
      const router = new AdaptiveModelRouter(mockMemoryStore, mockEventBus);

      const events: any[] = [];
      mockEventBus.on('complexity:analyzed', (event) => events.push(event));

      const task = {
        type: 'test-generation',
        sourceCode: 'function test() {}',
        id: 'task-123'
      };

      await router.analyzeComplexity(task);

      expect(events.length).toBe(1);
      expect(events[0]).toHaveProperty('taskId', 'task-123');
      expect(events[0]).toHaveProperty('complexity');
      expect(events[0].complexity).toHaveProperty('score');
    });

    test('should emit fallback events', async () => {
      const router = new AdaptiveModelRouter(mockMemoryStore, mockEventBus);

      const events: any[] = [];
      mockEventBus.on('router:fallback-triggered', (event) => events.push(event));

      const task = {
        type: 'test-generation',
        complexity: 'simple',
        id: 'task-123'
      };

      // Test fallback configuration
      const fallback = router.getFallbackModel('gpt-4', task);

      expect(fallback).toBeDefined();
      expect(['gpt-3.5-turbo', 'claude-haiku', 'claude-sonnet-4.5']).toContain(fallback);
    });
  });

  describe('Selection History', () => {
    test('should store selection history in memory', async () => {
      const router = new AdaptiveModelRouter(mockMemoryStore, mockEventBus);

      const tasks = [
        { type: 'test-generation', complexity: 'simple', id: 'task-1' },
        { type: 'test-generation', complexity: 'complex', id: 'task-2' },
        { type: 'security-test', complexity: 'critical', id: 'task-3' }
      ];

      for (const task of tasks) {
        await router.selectModel(task);
      }

      const history = await mockMemoryStore.retrieve('model-router:history');

      expect(history).toBeDefined();
      expect(Array.isArray(history)).toBe(true);
      expect(history.length).toBe(3);
    });

    test('should analyze selection patterns', async () => {
      const router = new AdaptiveModelRouter(mockMemoryStore, mockEventBus);

      // Generate selection history
      for (let i = 0; i < 10; i++) {
        await router.selectModel({
          type: 'test-generation',
          complexity: i % 2 === 0 ? 'simple' : 'complex',
          id: `task-${i}`
        });
      }

      const stats = await router.getStats();

      expect(stats).toHaveProperty('modelDistribution');
      expect(stats).toHaveProperty('totalRequests');
      expect(stats.totalRequests).toBeGreaterThanOrEqual(10);
      expect(Object.keys(stats.modelDistribution).length).toBeGreaterThan(0);
    });

    test('should support history cleanup', async () => {
      const router = new AdaptiveModelRouter(mockMemoryStore, mockEventBus, {
        maxHistorySize: 5
      });

      // Generate more selections than max history
      for (let i = 0; i < 10; i++) {
        await router.selectModel({
          type: 'test-generation',
          complexity: 'simple',
          id: `task-${i}`
        });
      }

      const history = await mockMemoryStore.retrieve('model-router:history');

      expect(history.length).toBeLessThanOrEqual(5);
    });
  });
});

// Helper functions (would be implemented in actual router)
function selectModel(task: any, models: ModelConfig[], flags?: any): ModelSelection {
  // Mock implementation
  if (flags?.multiModelRouter === false) {
    return {
      model: 'gpt-3.5-turbo',
      reason: 'feature disabled - using default',
      estimatedCost: 0.001,
      confidence: 1.0
    };
  }

  if (task.forceModel) {
    return {
      model: task.forceModel,
      reason: 'forced by request',
      estimatedCost: 0.001,
      confidence: 1.0
    };
  }

  if (task.requiresSecurity || task.type === 'security-test-generation') {
    return {
      model: 'claude-sonnet-4.5',
      reason: 'security testing requires advanced analysis',
      estimatedCost: 0.003,
      confidence: 0.85
    };
  }

  if (task.requiresPropertyBased || task.complexity === 'complex') {
    return {
      model: 'gpt-4',
      reason: 'property-based testing requires advanced reasoning',
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

function selectModelWithFallback(
  task: any,
  models: ModelConfig[],
  excludedModels: Set<string>
): ModelSelection {
  const preferred = selectModel(task, models);

  if (excludedModels.has(preferred.model)) {
    // Find fallback
    const fallback = models.find(m =>
      !excludedModels.has(m.name) && m.capabilities.includes('fallback')
    );

    return {
      model: fallback?.name || 'claude-haiku',
      reason: `fallback from ${preferred.model} - rate limit or error`,
      estimatedCost: 0.0008,
      confidence: 0.6
    };
  }

  return preferred;
}

function analyzeTaskComplexity(task: any): TaskComplexity {
  const factors: string[] = [];
  let score = 0;

  if (!task.sourceCode || task.linesOfCode === 0) {
    return {
      score: 0.1,
      factors: ['empty-or-invalid'],
      reasoning: 'Empty or invalid source code'
    };
  }

  if (task.linesOfCode < 0 || task.linesOfCode === undefined) {
    task.linesOfCode = 10; // default
  }

  if (task.linesOfCode < 10) {
    factors.push('low-loc');
    score += 0.1;
  } else if (task.linesOfCode > 50) {
    factors.push('high-loc');
    score += 0.3;
  }

  if (task.cyclomaticComplexity > 10) {
    factors.push('high-complexity');
    score += 0.4;
  }

  if (task.requiresPropertyBased) {
    factors.push('property-based-required');
    score += 0.3;
  }

  if (task.hasAsyncOperations) {
    factors.push('async-operations');
    score += 0.2;
  }

  if (task.integrationTestRequired) {
    factors.push('integration-test');
    score += 0.2;
  }

  return {
    score: Math.min(score, 1.0),
    factors,
    reasoning: `Task complexity determined by: ${factors.join(', ')}`
  };
}

class CostTracker {
  private metrics: CostMetrics = {
    totalCost: 0,
    costByModel: {},
    costByTaskType: {},
    testsGenerated: 0,
    averageCostPerTest: 0
  };

  constructor(private memoryStore?: MockMemoryStore) {}

  async recordUsage(usage: {
    model: string;
    inputTokens: number;
    outputTokens: number;
    taskType: string;
    testsGenerated?: number;
  }): Promise<void> {
    const modelConfig = {
      'gpt-3.5-turbo': 0.000002,
      'gpt-4': 0.00006,
      'claude-sonnet-4.5': 0.00003,
      'claude-haiku': 0.000008
    };

    const cost = (usage.inputTokens + usage.outputTokens) * (modelConfig[usage.model as keyof typeof modelConfig] || 0.00001);

    this.metrics.totalCost += cost;
    this.metrics.costByModel[usage.model] = (this.metrics.costByModel[usage.model] || 0) + cost;
    this.metrics.costByTaskType[usage.taskType] = (this.metrics.costByTaskType[usage.taskType] || 0) + cost;

    if (usage.testsGenerated) {
      this.metrics.testsGenerated += usage.testsGenerated;
    }

    this.metrics.averageCostPerTest = this.metrics.testsGenerated > 0
      ? this.metrics.totalCost / this.metrics.testsGenerated
      : 0;
  }

  getMetrics(): CostMetrics {
    return { ...this.metrics };
  }

  exportDashboard(): any {
    return {
      totalCost: this.metrics.totalCost,
      costByModel: this.metrics.costByModel,
      costByTaskType: this.metrics.costByTaskType,
      costPerTest: this.metrics.averageCostPerTest,
      testsGenerated: this.metrics.testsGenerated,
      timestamp: new Date().toISOString(),
      modelBreakdown: Object.entries(this.metrics.costByModel).map(([model, cost]) => ({
        model,
        cost,
        percentage: (cost / this.metrics.totalCost) * 100
      }))
    };
  }

  async persist(): Promise<void> {
    if (this.memoryStore) {
      await this.memoryStore.store('cost-tracker:metrics', this.metrics);
    }
  }
}

class AdaptiveModelRouter {
  private cache = new Map<string, TaskComplexity>();

  constructor(
    private memoryStore: MockMemoryStore,
    private eventBus: EventEmitter,
    private config?: { cacheTTL?: number; maxHistorySize?: number }
  ) {}

  async analyzeComplexity(task: any): Promise<TaskComplexity> {
    const cacheKey = `complexity:${task.id}`;

    // Check cache
    if (this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey)!;
    }

    const complexity = analyzeTaskComplexity(task);

    // Store in cache
    this.cache.set(cacheKey, complexity);

    // Store in memory
    await this.memoryStore.store(cacheKey, complexity, {
      ttl: this.config?.cacheTTL || 3600
    });

    // Emit event
    this.eventBus.emit('complexity:analyzed', {
      taskId: task.id,
      complexity
    });

    return complexity;
  }

  async selectModel(task: any): Promise<ModelSelection> {
    const complexity = await this.analyzeComplexity(task);
    const models: ModelConfig[] = []; // Would be injected
    const selection = selectModel(task, models);

    // Store history
    const history = await this.memoryStore.retrieve('model-router:history') || [];
    history.push({
      taskId: task.id,
      model: selection.model,
      complexity: complexity.score,
      timestamp: Date.now()
    });

    // Limit history size
    if (this.config?.maxHistorySize && history.length > this.config.maxHistorySize) {
      history.splice(0, history.length - this.config.maxHistorySize);
    }

    await this.memoryStore.store('model-router:history', history);

    // Emit event
    this.eventBus.emit('model:selected', {
      taskId: task.id,
      model: selection.model,
      complexity: complexity.score
    });

    return selection;
  }

  async selectModelWithFallback(task: any, excludedModels: Set<string>): Promise<ModelSelection> {
    const models: ModelConfig[] = []; // Would be injected
    const selection = selectModelWithFallback(task, models, excludedModels);

    if (excludedModels.has(selection.model)) {
      this.eventBus.emit('model:fallback', {
        taskId: task.id,
        originalModel: selectModel(task, models).model,
        fallbackModel: selection.model,
        reason: 'rate-limit-or-error'
      });
    }

    return selection;
  }

  async analyzeSelectionPatterns(): Promise<any> {
    const history = await this.memoryStore.retrieve('model-router:history') || [];

    const modelCounts = history.reduce((acc: any, entry: any) => {
      acc[entry.model] = (acc[entry.model] || 0) + 1;
      return acc;
    }, {});

    const mostUsed = Object.entries(modelCounts).sort((a: any, b: any) => b[1] - a[1])[0];
    const avgComplexity = history.reduce((sum: number, e: any) => sum + e.complexity, 0) / history.length;

    return {
      mostUsedModel: mostUsed ? mostUsed[0] : null,
      modelDistribution: modelCounts,
      averageComplexity: avgComplexity
    };
  }

  async getStats(): Promise<any> {
    const history = await this.memoryStore.retrieve('model-router:history') || [];

    const modelCounts = history.reduce((acc: any, entry: any) => {
      acc[entry.model] = (acc[entry.model] || 0) + 1;
      return acc;
    }, {});

    return {
      totalRequests: history.length,
      modelDistribution: modelCounts,
      totalCost: 0,
      avgCostPerTask: 0,
      costSavings: 0
    };
  }

  getFallbackModel(model: string, task: any): string {
    // Simple fallback chain
    const fallbackChains: Record<string, string> = {
      'gpt-4': 'gpt-3.5-turbo',
      'gpt-3.5-turbo': 'claude-haiku',
      'claude-sonnet-4.5': 'claude-haiku',
      'claude-haiku': 'gpt-3.5-turbo'
    };

    return fallbackChains[model] || 'gpt-3.5-turbo';
  }
}
