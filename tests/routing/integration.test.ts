/**
 * Integration Tests for Multi-Model Router
 *
 * Tests complete workflow: task → complexity analysis → model selection → cost tracking
 * Tests model fallback chains, cost accumulation, and real-world scenarios
 *
 * @module tests/routing/integration
 */

import { EventEmitter } from 'events';

// ===========================================================================
// Mock Types (same as AdaptiveModelRouter.test.ts)
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
  requestCount: number;
  tokenUsage: {
    total: number;
    byModel: Record<string, number>;
  };
}

interface RouterConfig {
  enabled: boolean;
  defaultModel?: string;
  costSensitivity?: number;
  qualityThreshold?: number;
  cacheTTL?: number;
  maxHistorySize?: number;
}

interface UsageRecord {
  model: string;
  inputTokens: number;
  outputTokens: number;
  taskType: string;
  testsGenerated?: number;
  timestamp?: number;
}

// Model cost configurations (per token)
const MODEL_COSTS: Record<string, number> = {
  'gpt-3.5-turbo': 0.000002,
  'gpt-4': 0.00006,
  'claude-sonnet-4.5': 0.00003,
  'claude-haiku': 0.000008,
  'gemini-pro': 0.00000025
};

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
// Import implementations from AdaptiveModelRouter.test.ts
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

    if (this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey)!;
    }

    const complexity = this.calculateComplexity(task);
    this.cache.set(cacheKey, complexity);

    await this.memoryStore.store(cacheKey, complexity, {
      ttl: this.config.cacheTTL || 3600
    });

    this.eventBus.emit('complexity:analyzed', {
      taskId: task.id,
      complexity
    });

    return complexity;
  }

  private calculateComplexity(task: any): TaskComplexity {
    const factors: string[] = [];
    let score = 0;

    if (!task.sourceCode || task.linesOfCode === 0) {
      return {
        score: 0.1,
        factors: ['empty-or-invalid'],
        reasoning: 'Empty or invalid source code'
      };
    }

    const loc = task.linesOfCode || 10;

    if (loc < 10) {
      factors.push('low-loc');
      score += 0.1;
    } else if (loc > 50) {
      factors.push('high-loc');
      score += 0.3;
    } else {
      score += 0.2;
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

  async selectModel(task: any): Promise<ModelSelection> {
    if (!this.config.enabled) {
      return {
        model: this.config.defaultModel || 'gpt-3.5-turbo',
        reason: 'Routing disabled - using default model',
        estimatedCost: 0.001,
        confidence: 1.0
      };
    }

    if (task.forceModel) {
      return {
        model: task.forceModel,
        reason: 'Model forced by request',
        estimatedCost: this.estimateCost(task.forceModel, task),
        confidence: 1.0
      };
    }

    const complexity = await this.analyzeComplexity(task);
    const selection = this.selectModelByComplexity(task, complexity);

    this.selectionHistory.push({
      taskId: task.id,
      model: selection.model,
      complexity: complexity.score,
      timestamp: Date.now()
    });

    if (this.config.maxHistorySize && this.selectionHistory.length > this.config.maxHistorySize) {
      this.selectionHistory.splice(0, this.selectionHistory.length - this.config.maxHistorySize);
    }

    await this.memoryStore.store('model-router:history', this.selectionHistory);

    this.eventBus.emit('model:selected', {
      taskId: task.id,
      model: selection.model,
      complexity: complexity.score
    });

    return selection;
  }

  private selectModelByComplexity(task: any, complexity: TaskComplexity): ModelSelection {
    if (task.requiresSecurity || task.type === 'security-test-generation') {
      return {
        model: 'claude-sonnet-4.5',
        reason: 'Security testing requires advanced analysis',
        estimatedCost: 0.003,
        confidence: 0.85
      };
    }

    if (task.requiresPropertyBased || complexity.score >= 0.7) {
      return {
        model: 'gpt-4',
        reason: 'High complexity requires advanced reasoning',
        estimatedCost: 0.006,
        confidence: 0.8
      };
    }

    if (task.costSensitive) {
      return {
        model: 'claude-haiku',
        reason: 'Cost-sensitive task - using cheapest model',
        estimatedCost: 0.0004,
        confidence: 0.7
      };
    }

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

    const estimatedTokens = (task.linesOfCode || 100) * 10;
    return estimatedTokens * modelConfig.costPerToken;
  }
}

class CostTracker {
  private metrics: CostMetrics = {
    totalCost: 0,
    costByModel: {},
    costByTaskType: {},
    testsGenerated: 0,
    averageCostPerTest: 0,
    requestCount: 0,
    tokenUsage: {
      total: 0,
      byModel: {}
    }
  };

  private usageHistory: UsageRecord[] = [];

  async recordUsage(usage: UsageRecord): Promise<void> {
    const totalTokens = usage.inputTokens + usage.outputTokens;
    const costPerToken = MODEL_COSTS[usage.model] || 0.00001;
    const cost = totalTokens * costPerToken;

    this.metrics.totalCost += cost;
    this.metrics.costByModel[usage.model] = (this.metrics.costByModel[usage.model] || 0) + cost;
    this.metrics.costByTaskType[usage.taskType] = (this.metrics.costByTaskType[usage.taskType] || 0) + cost;
    this.metrics.tokenUsage.total += totalTokens;
    this.metrics.tokenUsage.byModel[usage.model] = (this.metrics.tokenUsage.byModel[usage.model] || 0) + totalTokens;

    if (usage.testsGenerated) {
      this.metrics.testsGenerated += usage.testsGenerated;
    }

    this.metrics.requestCount++;
    this.metrics.averageCostPerTest = this.metrics.testsGenerated > 0
      ? this.metrics.totalCost / this.metrics.testsGenerated
      : 0;

    this.usageHistory.push({
      ...usage,
      timestamp: Date.now()
    });
  }

  getMetrics(): CostMetrics {
    return { ...this.metrics };
  }

  reset(): void {
    this.metrics = {
      totalCost: 0,
      costByModel: {},
      costByTaskType: {},
      testsGenerated: 0,
      averageCostPerTest: 0,
      requestCount: 0,
      tokenUsage: {
        total: 0,
        byModel: {}
      }
    };
    this.usageHistory = [];
  }
}

// ===========================================================================
// Integration Tests
// ===========================================================================

describe('Multi-Model Router Integration Tests', () => {
  let router: AdaptiveModelRouter;
  let costTracker: CostTracker;
  let mockMemoryStore: MockMemoryStore;
  let mockEventBus: EventEmitter;

  beforeEach(() => {
    mockMemoryStore = new MockMemoryStore();
    mockEventBus = new EventEmitter();
    router = new AdaptiveModelRouter(mockMemoryStore, mockEventBus);
    costTracker = new CostTracker();
  });

  afterEach(async () => {
    await mockMemoryStore.clear();
    mockEventBus.removeAllListeners();
    costTracker.reset();
  });

  // -------------------------------------------------------------------------
  // Complete Workflow Tests
  // -------------------------------------------------------------------------

  describe('Complete Workflow', () => {
    it('should execute full workflow: analyze → select → track', async () => {
      const task = {
        id: 'workflow-task-1',
        sourceCode: 'function complexFunction() { /* 100 lines */ }',
        linesOfCode: 100,
        cyclomaticComplexity: 15,
        requiresPropertyBased: true
      };

      // Step 1: Analyze complexity
      const complexity = await router.analyzeComplexity(task);
      expect(complexity.score).toBeGreaterThanOrEqual(0.7);

      // Step 2: Select model
      const selection = await router.selectModel(task);
      expect(selection.model).toBe('gpt-4');

      // Step 3: Track cost
      await costTracker.recordUsage({
        model: selection.model,
        inputTokens: 1000,
        outputTokens: 2000,
        taskType: 'test-generation',
        testsGenerated: 10
      });

      // Verify results
      const metrics = costTracker.getMetrics();
      expect(metrics.totalCost).toBeGreaterThan(0);
      expect(metrics.testsGenerated).toBe(10);
      expect(metrics.averageCostPerTest).toBeGreaterThan(0);
    });

    it('should handle multiple tasks in sequence', async () => {
      const tasks = [
        {
          id: 'seq-task-1',
          sourceCode: 'simple',
          linesOfCode: 5,
          cyclomaticComplexity: 1
        },
        {
          id: 'seq-task-2',
          sourceCode: 'medium',
          linesOfCode: 50,
          cyclomaticComplexity: 8
        },
        {
          id: 'seq-task-3',
          sourceCode: 'complex',
          linesOfCode: 150,
          cyclomaticComplexity: 20,
          requiresPropertyBased: true
        }
      ];

      for (const task of tasks) {
        const selection = await router.selectModel(task);

        await costTracker.recordUsage({
          model: selection.model,
          inputTokens: 500,
          outputTokens: 1000,
          taskType: 'test-generation',
          testsGenerated: 5
        });
      }

      const metrics = costTracker.getMetrics();
      expect(metrics.requestCount).toBe(3);
      expect(metrics.testsGenerated).toBe(15);
      expect(Object.keys(metrics.costByModel).length).toBeGreaterThan(0);
    });

    it('should accumulate costs across multiple tasks', async () => {
      const tasksWithModels = [
        { model: 'gpt-3.5-turbo', tokens: 1000 },
        { model: 'gpt-4', tokens: 2000 },
        { model: 'claude-haiku', tokens: 1500 }
      ];

      for (const { model, tokens } of tasksWithModels) {
        await costTracker.recordUsage({
          model,
          inputTokens: tokens / 2,
          outputTokens: tokens / 2,
          taskType: 'test-generation',
          testsGenerated: 3
        });
      }

      const metrics = costTracker.getMetrics();

      expect(metrics.totalCost).toBeGreaterThan(0);
      expect(metrics.costByModel['gpt-3.5-turbo']).toBeDefined();
      expect(metrics.costByModel['gpt-4']).toBeDefined();
      expect(metrics.costByModel['claude-haiku']).toBeDefined();
      expect(metrics.testsGenerated).toBe(9);
    });
  });

  // -------------------------------------------------------------------------
  // Fallback Chain Tests
  // -------------------------------------------------------------------------

  describe('Fallback Chain Execution', () => {
    it('should execute full fallback chain on failures', async () => {
      const task = {
        id: 'fallback-task-1',
        sourceCode: 'function test() {}',
        linesOfCode: 10
      };

      // Try primary model (should be gpt-3.5-turbo)
      const primarySelection = await router.selectModel(task);
      expect(primarySelection.model).toBe('gpt-3.5-turbo');

      // Simulate rate limit on primary
      const excludedModels = new Set([primarySelection.model]);
      const fallback1 = await router.selectModelWithFallback(task, excludedModels);
      expect(fallback1.model).not.toBe(primarySelection.model);

      // Simulate rate limit on first fallback
      excludedModels.add(fallback1.model);
      const fallback2 = await router.selectModelWithFallback(task, excludedModels);
      expect(fallback2.model).not.toBe(fallback1.model);
      expect(fallback2.model).not.toBe(primarySelection.model);
    });

    it('should track costs through fallback chain', async () => {
      const task = {
        id: 'fallback-cost-task',
        sourceCode: 'function test() {}',
        linesOfCode: 10
      };

      // Initial attempt
      const primary = await router.selectModel(task);
      await costTracker.recordUsage({
        model: primary.model,
        inputTokens: 100,
        outputTokens: 200,
        taskType: 'test-generation',
        testsGenerated: 2
      });

      // Fallback attempt
      const excludedModels = new Set([primary.model]);
      const fallback = await router.selectModelWithFallback(task, excludedModels);
      await costTracker.recordUsage({
        model: fallback.model,
        inputTokens: 100,
        outputTokens: 200,
        taskType: 'test-generation',
        testsGenerated: 2
      });

      const metrics = costTracker.getMetrics();
      expect(metrics.requestCount).toBe(2);
      expect(metrics.testsGenerated).toBe(4);
      expect(Object.keys(metrics.costByModel).length).toBeGreaterThanOrEqual(2);
    });

    it('should emit fallback events', async () => {
      const fallbackEvents: any[] = [];
      mockEventBus.on('router:fallback-triggered', (event) => fallbackEvents.push(event));

      const task = {
        id: 'fallback-event-task',
        sourceCode: 'function test() {}',
        linesOfCode: 10
      };

      const primary = await router.selectModel(task);
      const excludedModels = new Set([primary.model]);
      await router.selectModelWithFallback(task, excludedModels);

      expect(fallbackEvents.length).toBe(1);
      expect(fallbackEvents[0].originalModel).toBe(primary.model);
      expect(fallbackEvents[0].fallbackModel).toBeDefined();
    });
  });

  // -------------------------------------------------------------------------
  // Real-World Scenario Tests
  // -------------------------------------------------------------------------

  describe('Real-World Scenarios', () => {
    it('should handle test suite generation workflow', async () => {
      const testSuite = {
        name: 'UserService Test Suite',
        modules: [
          { id: 'mod-1', loc: 5, complexity: 1 },   // Simple
          { id: 'mod-2', loc: 50, complexity: 8 },  // Medium
          { id: 'mod-3', loc: 150, complexity: 20 }, // Complex
          { id: 'mod-4', loc: 25, complexity: 5 }   // Simple-Medium
        ]
      };

      for (const module of testSuite.modules) {
        const task = {
          id: module.id,
          sourceCode: 'code',
          linesOfCode: module.loc,
          cyclomaticComplexity: module.complexity
        };

        const selection = await router.selectModel(task);
        await costTracker.recordUsage({
          model: selection.model,
          inputTokens: module.loc * 10,
          outputTokens: module.loc * 20,
          taskType: 'test-generation',
          testsGenerated: Math.ceil(module.loc / 5)
        });
      }

      const metrics = costTracker.getMetrics();
      expect(metrics.requestCount).toBe(4);
      expect(metrics.testsGenerated).toBeGreaterThan(0);

      // Verify cost distribution
      const totalCost = metrics.totalCost;
      expect(totalCost).toBeGreaterThan(0);

      // Simple tasks should use cheaper models
      expect(metrics.costByModel['gpt-3.5-turbo']).toBeDefined();
    });

    it('should handle security audit workflow', async () => {
      const securityTasks = [
        { id: 'auth-1', type: 'security-test-generation', requiresSecurity: true },
        { id: 'auth-2', type: 'security-test-generation', requiresSecurity: true },
        { id: 'authz-1', type: 'security-test-generation', requiresSecurity: true }
      ];

      for (const task of securityTasks) {
        const selection = await router.selectModel({
          ...task,
          sourceCode: 'security code',
          linesOfCode: 50
        });

        expect(selection.model).toBe('claude-sonnet-4.5');

        await costTracker.recordUsage({
          model: selection.model,
          inputTokens: 1000,
          outputTokens: 2000,
          taskType: 'security-test-generation',
          testsGenerated: 5
        });
      }

      const metrics = costTracker.getMetrics();
      expect(metrics.costByModel['claude-sonnet-4.5']).toBeDefined();
      expect(metrics.costByTaskType['security-test-generation']).toBeDefined();
    });

    it('should handle mixed task types in CI/CD pipeline', async () => {
      const ciTasks = [
        { id: 'unit-1', type: 'unit-test', loc: 10, complexity: 2 },
        { id: 'unit-2', type: 'unit-test', loc: 15, complexity: 3 },
        { id: 'integration-1', type: 'integration-test', loc: 100, complexity: 15 },
        { id: 'security-1', type: 'security-test-generation', requiresSecurity: true, loc: 50 },
        { id: 'performance-1', type: 'performance-test', loc: 75, complexity: 12 }
      ];

      for (const task of ciTasks) {
        const selection = await router.selectModel({
          id: task.id,
          type: task.type,
          sourceCode: 'code',
          linesOfCode: task.loc,
          cyclomaticComplexity: task.complexity,
          requiresSecurity: task.requiresSecurity
        });

        await costTracker.recordUsage({
          model: selection.model,
          inputTokens: task.loc * 10,
          outputTokens: task.loc * 15,
          taskType: task.type,
          testsGenerated: Math.ceil(task.loc / 10)
        });
      }

      const metrics = costTracker.getMetrics();

      // Verify all task types tracked
      expect(metrics.costByTaskType['unit-test']).toBeDefined();
      expect(metrics.costByTaskType['integration-test']).toBeDefined();
      expect(metrics.costByTaskType['security-test-generation']).toBeDefined();
      expect(metrics.costByTaskType['performance-test']).toBeDefined();

      // Verify multiple models used
      expect(Object.keys(metrics.costByModel).length).toBeGreaterThan(1);
    });
  });

  // -------------------------------------------------------------------------
  // Memory and Caching Tests
  // -------------------------------------------------------------------------

  describe('Memory and Caching', () => {
    it('should cache complexity analysis', async () => {
      const task = {
        id: 'cache-task-1',
        sourceCode: 'function test() {}',
        linesOfCode: 20
      };

      const complexity1 = await router.analyzeComplexity(task);
      const complexity2 = await router.analyzeComplexity(task);

      expect(complexity1).toEqual(complexity2);

      // Verify memory storage
      const cached = await mockMemoryStore.retrieve('complexity:cache-task-1');
      expect(cached).toBeDefined();
      expect(cached.score).toBe(complexity1.score);
    });

    it('should persist selection history', async () => {
      const tasks = [
        { id: 'hist-1', sourceCode: 'code1', linesOfCode: 10 },
        { id: 'hist-2', sourceCode: 'code2', linesOfCode: 50 },
        { id: 'hist-3', sourceCode: 'code3', linesOfCode: 100 }
      ];

      for (const task of tasks) {
        await router.selectModel(task);
      }

      const history = await mockMemoryStore.retrieve('model-router:history');
      expect(history).toBeDefined();
      expect(Array.isArray(history)).toBe(true);
      expect(history.length).toBe(3);
    });
  });

  // -------------------------------------------------------------------------
  // Event Coordination Tests
  // -------------------------------------------------------------------------

  describe('Event Coordination', () => {
    it('should emit all coordination events', async () => {
      const events: Record<string, any[]> = {
        'complexity:analyzed': [],
        'model:selected': [],
        'router:fallback-triggered': []
      };

      Object.keys(events).forEach(eventName => {
        mockEventBus.on(eventName, (event) => events[eventName].push(event));
      });

      const task = {
        id: 'event-task-1',
        sourceCode: 'function test() {}',
        linesOfCode: 10
      };

      // Trigger events
      await router.analyzeComplexity(task);
      await router.selectModel(task);

      const excludedModels = new Set(['gpt-3.5-turbo']);
      await router.selectModelWithFallback(task, excludedModels);

      // Verify events
      expect(events['complexity:analyzed'].length).toBeGreaterThan(0);
      expect(events['model:selected'].length).toBeGreaterThan(0);
      expect(events['router:fallback-triggered'].length).toBeGreaterThan(0);
    });
  });
});
