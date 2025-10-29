/**
 * Comprehensive Tests for AdaptiveModelRouter
 * Tests model selection logic, cost calculation, fallback chains, and feature flags
 *
 * @module tests/routing/AdaptiveModelRouter
 */

import { EventEmitter } from 'events';

// ===========================================================================
// Mock Types and Interfaces
// ===========================================================================

interface ModelConfig {
  name: string;
  costPerToken: number;
  rateLimit: number;
  capabilities: string[];
  priority?: number;
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
  fallbackChain?: string[];
}

interface CostMetrics {
  totalCost: number;
  costByModel: Record<string, number>;
  costByTaskType: Record<string, number>;
  testsGenerated: number;
  averageCostPerTest: number;
  savingsVsBaseline?: number;
}

interface RouterConfig {
  enabled: boolean;
  defaultModel?: string;
  costSensitivity?: number;
  qualityThreshold?: number;
  cacheTTL?: number;
  maxHistorySize?: number;
}

// ===========================================================================
// Mock SwarmMemoryManager
// ===========================================================================

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

// ===========================================================================
// AdaptiveModelRouter Implementation
// ===========================================================================

class AdaptiveModelRouter {
  private cache = new Map<string, TaskComplexity>();
  private selectionHistory: any[] = [];
  private modelConfigs: ModelConfig[];
  private rateLimitedModels = new Set<string>();

  constructor(
    private memoryStore: MockMemoryStore,
    private eventBus: EventEmitter,
    private config: RouterConfig = { enabled: true },
    modelConfigs?: ModelConfig[]
  ) {
    this.modelConfigs = modelConfigs || this.getDefaultModels();
  }

  private getDefaultModels(): ModelConfig[] {
    return [
      {
        name: 'gpt-3.5-turbo',
        costPerToken: 0.000002,
        rateLimit: 10000,
        capabilities: ['simple-generation', 'unit-tests'],
        priority: 1
      },
      {
        name: 'gpt-4',
        costPerToken: 0.00006,
        rateLimit: 5000,
        capabilities: ['complex-generation', 'property-based', 'integration-tests'],
        priority: 2
      },
      {
        name: 'claude-sonnet-4.5',
        costPerToken: 0.00003,
        rateLimit: 8000,
        capabilities: ['security-tests', 'critical-analysis', 'architecture-review'],
        priority: 3
      },
      {
        name: 'claude-haiku',
        costPerToken: 0.000008,
        rateLimit: 15000,
        capabilities: ['fallback', 'simple-generation'],
        priority: 0
      }
    ];
  }

  async analyzeComplexity(task: any): Promise<TaskComplexity> {
    const cacheKey = `complexity:${task.id}`;

    // Check cache
    if (this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey)!;
    }

    const complexity = this.calculateComplexity(task);

    // Store in cache
    this.cache.set(cacheKey, complexity);

    // Store in memory with TTL
    await this.memoryStore.store(cacheKey, complexity, {
      ttl: this.config.cacheTTL || 3600
    });

    // Emit event
    this.eventBus.emit('complexity:analyzed', {
      taskId: task.id,
      complexity
    });

    return complexity;
  }

  private calculateComplexity(task: any): TaskComplexity {
    const factors: string[] = [];
    let score = 0;

    // Handle edge cases
    if (!task.sourceCode || task.linesOfCode === 0) {
      return {
        score: 0.1,
        factors: ['empty-or-invalid'],
        reasoning: 'Empty or invalid source code'
      };
    }

    const loc = task.linesOfCode || 10;

    // Lines of code factor
    if (loc < 10) {
      factors.push('low-loc');
      score += 0.1;
    } else if (loc > 50) {
      factors.push('high-loc');
      score += 0.3;
    } else {
      score += 0.2;
    }

    // Cyclomatic complexity
    if (task.cyclomaticComplexity > 10) {
      factors.push('high-complexity');
      score += 0.4;
    }

    // Special requirements
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

  async selectModel(task: any): Promise<ModelSelection> {
    // Check if routing is enabled
    if (!this.config.enabled) {
      return {
        model: this.config.defaultModel || 'gpt-3.5-turbo',
        reason: 'Routing disabled - using default model',
        estimatedCost: 0.001,
        confidence: 1.0
      };
    }

    // Check for forced model
    if (task.forceModel) {
      return {
        model: task.forceModel,
        reason: 'Model forced by request',
        estimatedCost: this.estimateCost(task.forceModel, task),
        confidence: 1.0
      };
    }

    // Analyze complexity
    const complexity = await this.analyzeComplexity(task);

    // Select model based on complexity and requirements
    const selection = this.selectModelByComplexity(task, complexity);

    // Store in history
    this.selectionHistory.push({
      taskId: task.id,
      model: selection.model,
      complexity: complexity.score,
      timestamp: Date.now()
    });

    // Limit history size
    if (this.config.maxHistorySize && this.selectionHistory.length > this.config.maxHistorySize) {
      this.selectionHistory.splice(0, this.selectionHistory.length - this.config.maxHistorySize);
    }

    await this.memoryStore.store('model-router:history', this.selectionHistory);

    // Emit event
    this.eventBus.emit('model:selected', {
      taskId: task.id,
      model: selection.model,
      complexity: complexity.score
    });

    return selection;
  }

  private selectModelByComplexity(task: any, complexity: TaskComplexity): ModelSelection {
    // Security tests require Claude Sonnet
    if (task.requiresSecurity || task.type === 'security-test-generation') {
      return {
        model: 'claude-sonnet-4.5',
        reason: 'Security testing requires advanced analysis',
        estimatedCost: 0.003,
        confidence: 0.85
      };
    }

    // Complex tasks or property-based testing
    if (task.requiresPropertyBased || complexity.score >= 0.7) {
      return {
        model: 'gpt-4',
        reason: 'High complexity requires advanced reasoning',
        estimatedCost: 0.006,
        confidence: 0.8
      };
    }

    // Cost-sensitive tasks
    if (task.costSensitive) {
      return {
        model: 'claude-haiku',
        reason: 'Cost-sensitive task - using cheapest model',
        estimatedCost: 0.0004,
        confidence: 0.7
      };
    }

    // Default to GPT-3.5 for simple tasks
    return {
      model: 'gpt-3.5-turbo',
      reason: 'Simple task - cost-effective model',
      estimatedCost: 0.0006,
      confidence: 0.9
    };
  }

  async selectModelWithFallback(task: any, excludedModels: Set<string>): Promise<ModelSelection> {
    const preferred = await this.selectModel(task);

    if (excludedModels.has(preferred.model)) {
      // Find fallback
      const fallbackChain = this.getFallbackChain(preferred.model);

      for (const fallbackModel of fallbackChain) {
        if (!excludedModels.has(fallbackModel)) {
          this.eventBus.emit('router:fallback-triggered', {
            taskId: task.id,
            originalModel: preferred.model,
            fallbackModel,
            reason: 'rate-limit-or-error'
          });

          return {
            model: fallbackModel,
            reason: `Fallback from ${preferred.model} - rate limit or error`,
            estimatedCost: this.estimateCost(fallbackModel, task),
            confidence: 0.6,
            fallbackChain
          };
        }
      }

      // No valid fallback found
      throw new Error('No available fallback model');
    }

    return preferred;
  }

  getFallbackChain(model: string): string[] {
    const chains: Record<string, string[]> = {
      'gpt-4': ['gpt-3.5-turbo', 'claude-haiku'],
      'gpt-3.5-turbo': ['claude-haiku', 'gpt-4'],
      'claude-sonnet-4.5': ['gpt-4', 'claude-haiku'],
      'claude-haiku': ['gpt-3.5-turbo']
    };

    return chains[model] || ['claude-haiku'];
  }

  private estimateCost(model: string, task: any): number {
    const modelConfig = this.modelConfigs.find(m => m.name === model);
    if (!modelConfig) return 0.001;

    const estimatedTokens = (task.linesOfCode || 100) * 10; // rough estimate
    return estimatedTokens * modelConfig.costPerToken;
  }

  async getStats(): Promise<any> {
    const history = this.selectionHistory;

    const modelCounts = history.reduce((acc: any, entry: any) => {
      acc[entry.model] = (acc[entry.model] || 0) + 1;
      return acc;
    }, {});

    return {
      totalRequests: history.length,
      modelDistribution: modelCounts,
      averageComplexity: history.reduce((sum, e) => sum + e.complexity, 0) / (history.length || 1)
    };
  }

  simulateRateLimit(model: string): void {
    this.rateLimitedModels.add(model);
  }

  clearRateLimit(model: string): void {
    this.rateLimitedModels.delete(model);
  }
}

// ===========================================================================
// Unit Tests
// ===========================================================================

describe('AdaptiveModelRouter', () => {
  let router: AdaptiveModelRouter;
  let mockMemoryStore: MockMemoryStore;
  let mockEventBus: EventEmitter;

  beforeEach(() => {
    mockMemoryStore = new MockMemoryStore();
    mockEventBus = new EventEmitter();
    router = new AdaptiveModelRouter(mockMemoryStore, mockEventBus);
  });

  afterEach(async () => {
    await mockMemoryStore.clear();
    mockEventBus.removeAllListeners();
  });

  // -------------------------------------------------------------------------
  // Model Selection Tests
  // -------------------------------------------------------------------------

  describe('Model Selection', () => {
    it('should select GPT-3.5 for simple tasks', async () => {
      const task = {
        id: 'task-1',
        type: 'test-generation',
        complexity: 'simple',
        sourceCode: 'function add(a, b) { return a + b; }',
        linesOfCode: 1,
        cyclomaticComplexity: 1
      };

      const selection = await router.selectModel(task);

      expect(selection.model).toBe('gpt-3.5-turbo');
      expect(selection.reason).toContain('simple');
      expect(selection.confidence).toBeGreaterThan(0.8);
    });

    it('should select GPT-4 for complex tasks', async () => {
      const task = {
        id: 'task-2',
        type: 'test-generation',
        complexity: 'complex',
        sourceCode: 'function complexSort(arr) { /* 50 lines */ }',
        linesOfCode: 50,
        cyclomaticComplexity: 12,
        requiresPropertyBased: true
      };

      const selection = await router.selectModel(task);

      expect(selection.model).toBe('gpt-4');
      expect(selection.reason).toContain('complexity');
    });

    it('should select Claude Sonnet 4.5 for security tests', async () => {
      const task = {
        id: 'task-3',
        type: 'security-test-generation',
        sourceCode: 'function authenticate(user, pass) {}',
        linesOfCode: 25,
        requiresSecurity: true
      };

      const selection = await router.selectModel(task);

      expect(selection.model).toBe('claude-sonnet-4.5');
      expect(selection.reason).toContain('security');
    });

    it('should respect cost-sensitive flag', async () => {
      const task = {
        id: 'task-4',
        type: 'test-generation',
        sourceCode: 'function test() {}',
        linesOfCode: 10,
        costSensitive: true
      };

      const selection = await router.selectModel(task);

      expect(selection.model).toBe('claude-haiku');
      expect(selection.estimatedCost).toBeLessThan(0.001);
    });

    it('should honor forced model selection', async () => {
      const task = {
        id: 'task-5',
        type: 'test-generation',
        forceModel: 'gpt-4',
        sourceCode: 'function simple() {}'
      };

      const selection = await router.selectModel(task);

      expect(selection.model).toBe('gpt-4');
      expect(selection.reason).toContain('forced');
    });
  });

  // -------------------------------------------------------------------------
  // Complexity Analysis Tests
  // -------------------------------------------------------------------------

  describe('Complexity Analysis', () => {
    it('should analyze simple tasks correctly', async () => {
      const task = {
        id: 'task-6',
        sourceCode: 'function add(a, b) { return a + b; }',
        linesOfCode: 1,
        cyclomaticComplexity: 1
      };

      const complexity = await router.analyzeComplexity(task);

      expect(complexity.score).toBeLessThan(0.3);
      expect(complexity.factors).toContain('low-loc');
    });

    it('should analyze complex tasks correctly', async () => {
      const task = {
        id: 'task-7',
        sourceCode: 'function complex() { /* 100 lines */ }',
        linesOfCode: 100,
        cyclomaticComplexity: 15,
        hasAsyncOperations: true,
        requiresPropertyBased: true
      };

      const complexity = await router.analyzeComplexity(task);

      expect(complexity.score).toBeGreaterThanOrEqual(0.7);
      expect(complexity.factors).toContain('high-loc');
      expect(complexity.factors).toContain('high-complexity');
      expect(complexity.factors).toContain('async-operations');
    });

    it('should handle empty source code', async () => {
      const task = {
        id: 'task-8',
        sourceCode: '',
        linesOfCode: 0
      };

      const complexity = await router.analyzeComplexity(task);

      expect(complexity.score).toBeLessThan(0.2);
      expect(complexity.factors).toContain('empty-or-invalid');
    });

    it('should cache complexity results', async () => {
      const task = {
        id: 'task-9',
        sourceCode: 'function test() { return true; }',
        linesOfCode: 1
      };

      const result1 = await router.analyzeComplexity(task);
      const result2 = await router.analyzeComplexity(task);

      expect(result1).toEqual(result2);

      // Verify cache hit by checking memory store
      const cached = await mockMemoryStore.retrieve('complexity:task-9');
      expect(cached).toBeDefined();
    });

    it('should emit complexity-analyzed events', async () => {
      const events: any[] = [];
      mockEventBus.on('complexity:analyzed', (event) => events.push(event));

      const task = {
        id: 'task-10',
        sourceCode: 'function test() {}',
        linesOfCode: 5
      };

      await router.analyzeComplexity(task);

      expect(events.length).toBe(1);
      expect(events[0].taskId).toBe('task-10');
      expect(events[0].complexity).toBeDefined();
    });
  });

  // -------------------------------------------------------------------------
  // Fallback Strategy Tests
  // -------------------------------------------------------------------------

  describe('Fallback Strategies', () => {
    it('should fallback on rate limit', async () => {
      const task = {
        id: 'task-11',
        type: 'test-generation',
        sourceCode: 'function test() {}',
        linesOfCode: 5
      };

      const excludedModels = new Set(['gpt-3.5-turbo']);
      const selection = await router.selectModelWithFallback(task, excludedModels);

      expect(selection.model).not.toBe('gpt-3.5-turbo');
      expect(selection.reason).toContain('Fallback');
      expect(selection.fallbackChain).toBeDefined();
    });

    it('should try multiple fallbacks in chain', async () => {
      const task = {
        id: 'task-12',
        type: 'test-generation',
        sourceCode: 'function test() {}',
        linesOfCode: 5,
        complexity: 'complex'
      };

      // Exclude GPT-4 and its first fallback
      const excludedModels = new Set(['gpt-4', 'gpt-3.5-turbo']);
      const selection = await router.selectModelWithFallback(task, excludedModels);

      expect(selection.model).toBe('claude-haiku');
      expect(selection.reason).toContain('Fallback');
    });

    it('should emit fallback events', async () => {
      const events: any[] = [];
      mockEventBus.on('router:fallback-triggered', (event) => events.push(event));

      const task = {
        id: 'task-13',
        sourceCode: 'function test() {}',
        linesOfCode: 5
      };

      const excludedModels = new Set(['gpt-3.5-turbo']);
      await router.selectModelWithFallback(task, excludedModels);

      expect(events.length).toBe(1);
      expect(events[0].originalModel).toBe('gpt-3.5-turbo');
      expect(events[0].fallbackModel).toBeDefined();
    });

    it('should throw error when no fallback available', async () => {
      const task = {
        id: 'task-14',
        sourceCode: 'function test() {}',
        linesOfCode: 5
      };

      // Exclude all models
      const excludedModels = new Set(['gpt-3.5-turbo', 'gpt-4', 'claude-sonnet-4.5', 'claude-haiku']);

      await expect(router.selectModelWithFallback(task, excludedModels))
        .rejects.toThrow('No available fallback model');
    });
  });

  // -------------------------------------------------------------------------
  // Feature Flag Tests
  // -------------------------------------------------------------------------

  describe('Feature Flags', () => {
    it('should use default model when routing disabled', async () => {
      const disabledRouter = new AdaptiveModelRouter(
        mockMemoryStore,
        mockEventBus,
        { enabled: false, defaultModel: 'gpt-3.5-turbo' }
      );

      const task = {
        id: 'task-15',
        type: 'test-generation',
        complexity: 'complex', // Would normally use GPT-4
        requiresPropertyBased: true
      };

      const selection = await disabledRouter.selectModel(task);

      expect(selection.model).toBe('gpt-3.5-turbo');
      expect(selection.reason).toContain('disabled');
    });

    it('should route normally when enabled', async () => {
      const enabledRouter = new AdaptiveModelRouter(
        mockMemoryStore,
        mockEventBus,
        { enabled: true }
      );

      const task = {
        id: 'task-16',
        type: 'security-test-generation',
        requiresSecurity: true,
        sourceCode: 'function auth() {}'
      };

      const selection = await enabledRouter.selectModel(task);

      expect(selection.model).toBe('claude-sonnet-4.5');
    });
  });

  // -------------------------------------------------------------------------
  // Statistics and History Tests
  // -------------------------------------------------------------------------

  describe('Statistics and History', () => {
    it('should track selection history', async () => {
      const tasks = [
        { id: 'task-17', sourceCode: 'test1', linesOfCode: 5 },
        { id: 'task-18', sourceCode: 'test2', linesOfCode: 50, cyclomaticComplexity: 15 },
        { id: 'task-19', sourceCode: 'test3', linesOfCode: 10, requiresSecurity: true, type: 'security-test-generation' }
      ];

      for (const task of tasks) {
        await router.selectModel(task);
      }

      const stats = await router.getStats();

      expect(stats.totalRequests).toBe(3);
      expect(Object.keys(stats.modelDistribution).length).toBeGreaterThan(0);
    });

    it('should limit history size', async () => {
      const limitedRouter = new AdaptiveModelRouter(
        mockMemoryStore,
        mockEventBus,
        { enabled: true, maxHistorySize: 5 }
      );

      // Generate 10 selections
      for (let i = 0; i < 10; i++) {
        await limitedRouter.selectModel({
          id: `task-${i}`,
          sourceCode: 'test',
          linesOfCode: 5
        });
      }

      const history = await mockMemoryStore.retrieve('model-router:history');
      expect(history.length).toBeLessThanOrEqual(5);
    });

    it('should calculate model distribution', async () => {
      const tasks = [
        { id: 'task-20', sourceCode: 'test', linesOfCode: 5 },
        { id: 'task-21', sourceCode: 'test', linesOfCode: 5 },
        { id: 'task-22', sourceCode: 'test', linesOfCode: 100, cyclomaticComplexity: 15, requiresPropertyBased: true }
      ];

      for (const task of tasks) {
        await router.selectModel(task);
      }

      const stats = await router.getStats();

      expect(stats.modelDistribution['gpt-3.5-turbo']).toBeGreaterThanOrEqual(2);
      expect(stats.modelDistribution['gpt-4']).toBeGreaterThanOrEqual(1);
    });
  });

  // -------------------------------------------------------------------------
  // Edge Cases
  // -------------------------------------------------------------------------

  describe('Edge Cases', () => {
    it('should handle task with missing properties', async () => {
      const task = {
        id: 'task-23'
        // Missing sourceCode, linesOfCode, etc.
      };

      const selection = await router.selectModel(task);

      expect(selection).toBeDefined();
      expect(selection.model).toBeDefined();
    });

    it('should handle concurrent selections', async () => {
      const tasks = Array.from({ length: 10 }, (_, i) => ({
        id: `task-${24 + i}`,
        sourceCode: 'test',
        linesOfCode: Math.random() * 100
      }));

      const promises = tasks.map(task => router.selectModel(task));
      const results = await Promise.all(promises);

      expect(results.length).toBe(10);
      results.forEach(result => {
        expect(result.model).toBeDefined();
      });
    });

    it('should handle extreme complexity values', async () => {
      const extremeTasks = [
        { id: 'task-34', sourceCode: 'x', linesOfCode: 0, cyclomaticComplexity: 0 },
        { id: 'task-35', sourceCode: 'huge', linesOfCode: 10000, cyclomaticComplexity: 1000 }
      ];

      for (const task of extremeTasks) {
        const complexity = await router.analyzeComplexity(task);
        expect(complexity.score).toBeGreaterThanOrEqual(0);
        expect(complexity.score).toBeLessThanOrEqual(1);
      }
    });
  });

  // -------------------------------------------------------------------------
  // Cost Estimation Tests
  // -------------------------------------------------------------------------

  describe('Cost Estimation', () => {
    it('should estimate costs for different models', async () => {
      const task = {
        id: 'task-36',
        sourceCode: 'function test() { return true; }',
        linesOfCode: 20
      };

      const selection = await router.selectModel(task);

      expect(selection.estimatedCost).toBeGreaterThan(0);
      expect(selection.estimatedCost).toBeLessThan(0.1); // Reasonable upper bound
    });

    it('should estimate lower cost for simpler models', async () => {
      const simpleTask = {
        id: 'task-37',
        sourceCode: 'test',
        linesOfCode: 5,
        costSensitive: true
      };

      const complexTask = {
        id: 'task-38',
        sourceCode: 'complex',
        linesOfCode: 100,
        cyclomaticComplexity: 15,
        requiresPropertyBased: true
      };

      const simpleSelection = await router.selectModel(simpleTask);
      const complexSelection = await router.selectModel(complexTask);

      expect(simpleSelection.estimatedCost).toBeLessThan(complexSelection.estimatedCost);
    });
  });
});
