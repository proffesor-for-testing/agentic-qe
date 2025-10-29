/**
 * Feature Flag Tests for Multi-Model Router
 *
 * Tests routing enabled/disabled states, graceful fallback,
 * and configuration hot-reload scenarios
 *
 * @module tests/routing/feature-flags
 */

import { EventEmitter } from 'events';

// ===========================================================================
// Mock Types
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
}

// ===========================================================================
// AdaptiveModelRouter Implementation
// ===========================================================================

class AdaptiveModelRouter {
  private cache = new Map<string, TaskComplexity>();
  private selectionHistory: any[] = [];
  private modelConfigs: ModelConfig[];

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

  private estimateCost(model: string, task: any): number {
    const modelConfig = this.modelConfigs.find(m => m.name === model);
    if (!modelConfig) return 0.001;

    const estimatedTokens = (task.linesOfCode || 100) * 10;
    return estimatedTokens * modelConfig.costPerToken;
  }

  /**
   * Update router configuration (hot reload)
   */
  updateConfig(newConfig: Partial<RouterConfig>): void {
    this.config = { ...this.config, ...newConfig };

    this.eventBus.emit('router:config-updated', {
      config: this.config,
      timestamp: Date.now()
    });
  }

  /**
   * Get current configuration
   */
  getConfig(): RouterConfig {
    return { ...this.config };
  }

  /**
   * Enable/disable routing
   */
  setEnabled(enabled: boolean): void {
    this.config.enabled = enabled;

    this.eventBus.emit('router:enabled-changed', {
      enabled,
      timestamp: Date.now()
    });
  }
}

// ===========================================================================
// Feature Flag Tests
// ===========================================================================

describe('Feature Flag Tests', () => {
  let router: AdaptiveModelRouter;
  let mockMemoryStore: MockMemoryStore;
  let mockEventBus: EventEmitter;

  beforeEach(() => {
    mockMemoryStore = new MockMemoryStore();
    mockEventBus = new EventEmitter();
  });

  afterEach(async () => {
    await mockMemoryStore.clear();
    mockEventBus.removeAllListeners();
  });

  // -------------------------------------------------------------------------
  // Enabled/Disabled State Tests
  // -------------------------------------------------------------------------

  describe('Routing Enabled/Disabled', () => {
    it('should use intelligent routing when enabled', async () => {
      router = new AdaptiveModelRouter(mockMemoryStore, mockEventBus, {
        enabled: true
      });

      const simpleTask = {
        id: 'enabled-simple',
        sourceCode: 'function add(a, b) { return a + b; }',
        linesOfCode: 5,
        cyclomaticComplexity: 1
      };

      const complexTask = {
        id: 'enabled-complex',
        sourceCode: 'complex code',
        linesOfCode: 150,
        cyclomaticComplexity: 20,
        requiresPropertyBased: true
      };

      const simpleSelection = await router.selectModel(simpleTask);
      const complexSelection = await router.selectModel(complexTask);

      // Should select different models based on complexity
      expect(simpleSelection.model).toBe('gpt-3.5-turbo');
      expect(complexSelection.model).toBe('gpt-4');
      expect(simpleSelection.reason).not.toContain('disabled');
      expect(complexSelection.reason).not.toContain('disabled');
    });

    it('should use default model when disabled', async () => {
      router = new AdaptiveModelRouter(mockMemoryStore, mockEventBus, {
        enabled: false,
        defaultModel: 'gpt-3.5-turbo'
      });

      const tasks = [
        { id: 'disabled-1', sourceCode: 'simple', linesOfCode: 5 },
        { id: 'disabled-2', sourceCode: 'complex', linesOfCode: 150, requiresPropertyBased: true },
        { id: 'disabled-3', sourceCode: 'security', requiresSecurity: true, type: 'security-test-generation' }
      ];

      for (const task of tasks) {
        const selection = await router.selectModel(task);

        // Should always use default model
        expect(selection.model).toBe('gpt-3.5-turbo');
        expect(selection.reason).toContain('disabled');
      }
    });

    it('should respect disabled state regardless of task complexity', async () => {
      router = new AdaptiveModelRouter(mockMemoryStore, mockEventBus, {
        enabled: false,
        defaultModel: 'claude-haiku'
      });

      const criticalTask = {
        id: 'critical-disabled',
        sourceCode: 'critical security code',
        linesOfCode: 200,
        cyclomaticComplexity: 30,
        requiresSecurity: true,
        requiresPropertyBased: true,
        type: 'security-test-generation'
      };

      const selection = await router.selectModel(criticalTask);

      // Even for critical security task, should use default when disabled
      expect(selection.model).toBe('claude-haiku');
      expect(selection.reason).toContain('disabled');
    });
  });

  // -------------------------------------------------------------------------
  // Dynamic Toggle Tests
  // -------------------------------------------------------------------------

  describe('Dynamic Routing Toggle', () => {
    it('should toggle routing on/off dynamically', async () => {
      router = new AdaptiveModelRouter(mockMemoryStore, mockEventBus, {
        enabled: true
      });

      const task = {
        id: 'toggle-task',
        sourceCode: 'complex',
        linesOfCode: 100,
        cyclomaticComplexity: 15,
        requiresPropertyBased: true
      };

      // First selection with routing enabled
      const enabledSelection = await router.selectModel(task);
      expect(enabledSelection.model).toBe('gpt-4');

      // Disable routing
      router.setEnabled(false);
      router.updateConfig({ defaultModel: 'gpt-3.5-turbo' });

      // Second selection with routing disabled
      const disabledSelection = await router.selectModel(task);
      expect(disabledSelection.model).toBe('gpt-3.5-turbo');
      expect(disabledSelection.reason).toContain('disabled');

      // Re-enable routing
      router.setEnabled(true);

      // Third selection with routing re-enabled
      const reenabledSelection = await router.selectModel(task);
      expect(reenabledSelection.model).toBe('gpt-4');
    });

    it('should emit events on toggle', async () => {
      router = new AdaptiveModelRouter(mockMemoryStore, mockEventBus, {
        enabled: true
      });

      const events: any[] = [];
      mockEventBus.on('router:enabled-changed', (event) => events.push(event));

      router.setEnabled(false);
      router.setEnabled(true);

      expect(events.length).toBe(2);
      expect(events[0].enabled).toBe(false);
      expect(events[1].enabled).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // Configuration Hot-Reload Tests
  // -------------------------------------------------------------------------

  describe('Configuration Hot-Reload', () => {
    it('should update default model at runtime', async () => {
      router = new AdaptiveModelRouter(mockMemoryStore, mockEventBus, {
        enabled: false,
        defaultModel: 'gpt-3.5-turbo'
      });

      const task = {
        id: 'reload-task',
        sourceCode: 'test',
        linesOfCode: 10
      };

      // Initial selection
      const selection1 = await router.selectModel(task);
      expect(selection1.model).toBe('gpt-3.5-turbo');

      // Update default model
      router.updateConfig({ defaultModel: 'claude-haiku' });

      // New selection should use updated default
      const selection2 = await router.selectModel(task);
      expect(selection2.model).toBe('claude-haiku');
    });

    it('should emit config-updated events', async () => {
      router = new AdaptiveModelRouter(mockMemoryStore, mockEventBus, {
        enabled: true
      });

      const events: any[] = [];
      mockEventBus.on('router:config-updated', (event) => events.push(event));

      router.updateConfig({ defaultModel: 'gpt-4' });
      router.updateConfig({ cacheTTL: 7200 });
      router.updateConfig({ maxHistorySize: 100 });

      expect(events.length).toBe(3);
      expect(events[0].config.defaultModel).toBe('gpt-4');
      expect(events[1].config.cacheTTL).toBe(7200);
      expect(events[2].config.maxHistorySize).toBe(100);
    });

    it('should preserve existing config during partial updates', async () => {
      router = new AdaptiveModelRouter(mockMemoryStore, mockEventBus, {
        enabled: true,
        defaultModel: 'gpt-3.5-turbo',
        cacheTTL: 3600,
        maxHistorySize: 50
      });

      // Update only defaultModel
      router.updateConfig({ defaultModel: 'gpt-4' });

      const config = router.getConfig();
      expect(config.enabled).toBe(true); // Preserved
      expect(config.defaultModel).toBe('gpt-4'); // Updated
      expect(config.cacheTTL).toBe(3600); // Preserved
      expect(config.maxHistorySize).toBe(50); // Preserved
    });

    it('should handle multiple rapid config updates', async () => {
      router = new AdaptiveModelRouter(mockMemoryStore, mockEventBus, {
        enabled: true
      });

      // Rapid updates
      router.updateConfig({ defaultModel: 'gpt-3.5-turbo' });
      router.updateConfig({ cacheTTL: 1800 });
      router.updateConfig({ maxHistorySize: 100 });
      router.updateConfig({ defaultModel: 'gpt-4' });

      const config = router.getConfig();
      expect(config.defaultModel).toBe('gpt-4'); // Latest update
      expect(config.cacheTTL).toBe(1800);
      expect(config.maxHistorySize).toBe(100);
    });
  });

  // -------------------------------------------------------------------------
  // Graceful Fallback Tests
  // -------------------------------------------------------------------------

  describe('Graceful Fallback', () => {
    it('should provide graceful fallback when routing disabled', async () => {
      router = new AdaptiveModelRouter(mockMemoryStore, mockEventBus, {
        enabled: false,
        defaultModel: 'gpt-3.5-turbo'
      });

      const task = {
        id: 'fallback-task',
        sourceCode: 'code',
        linesOfCode: 100
      };

      const selection = await router.selectModel(task);

      // Should succeed with default model
      expect(selection).toBeDefined();
      expect(selection.model).toBe('gpt-3.5-turbo');
      expect(selection.confidence).toBe(1.0); // High confidence in fallback
    });

    it('should handle missing default model gracefully', async () => {
      router = new AdaptiveModelRouter(mockMemoryStore, mockEventBus, {
        enabled: false
        // No defaultModel specified
      });

      const task = {
        id: 'no-default',
        sourceCode: 'code',
        linesOfCode: 10
      };

      const selection = await router.selectModel(task);

      // Should use fallback default (gpt-3.5-turbo)
      expect(selection.model).toBe('gpt-3.5-turbo');
    });

    it('should continue serving requests during config reload', async () => {
      router = new AdaptiveModelRouter(mockMemoryStore, mockEventBus, {
        enabled: true
      });

      const task = {
        id: 'reload-during-request',
        sourceCode: 'code',
        linesOfCode: 50
      };

      // Start selection
      const selectionPromise = router.selectModel(task);

      // Update config during selection (simulate race condition)
      router.updateConfig({ cacheTTL: 7200 });

      // Selection should still complete
      const selection = await selectionPromise;
      expect(selection).toBeDefined();
      expect(selection.model).toBeDefined();
    });
  });

  // -------------------------------------------------------------------------
  // Environment-Based Configuration Tests
  // -------------------------------------------------------------------------

  describe('Environment-Based Configuration', () => {
    it('should support development mode (routing disabled)', async () => {
      router = new AdaptiveModelRouter(mockMemoryStore, mockEventBus, {
        enabled: false,
        defaultModel: 'gpt-3.5-turbo' // Fast, cheap model for dev
      });

      const tasks = [
        { id: 'dev-1', sourceCode: 'simple', linesOfCode: 5 },
        { id: 'dev-2', sourceCode: 'complex', linesOfCode: 150, requiresPropertyBased: true }
      ];

      for (const task of tasks) {
        const selection = await router.selectModel(task);
        expect(selection.model).toBe('gpt-3.5-turbo'); // Always fast model in dev
      }
    });

    it('should support production mode (routing enabled)', async () => {
      router = new AdaptiveModelRouter(mockMemoryStore, mockEventBus, {
        enabled: true // Cost-optimized routing for production
      });

      const simpleTask = {
        id: 'prod-simple',
        sourceCode: 'simple',
        linesOfCode: 5
      };

      const complexTask = {
        id: 'prod-complex',
        sourceCode: 'complex',
        linesOfCode: 150,
        requiresPropertyBased: true
      };

      const simpleSelection = await router.selectModel(simpleTask);
      const complexSelection = await router.selectModel(complexTask);

      // Should use intelligent routing in production
      expect(simpleSelection.model).toBe('gpt-3.5-turbo');
      expect(complexSelection.model).toBe('gpt-4');
    });

    it('should support staging mode (partial routing)', async () => {
      router = new AdaptiveModelRouter(mockMemoryStore, mockEventBus, {
        enabled: true,
        defaultModel: 'gpt-3.5-turbo'
      });

      // Staging: test routing but with fallback to safe default
      const task = {
        id: 'staging-task',
        sourceCode: 'code',
        linesOfCode: 50
      };

      const selection = await router.selectModel(task);

      // Should route intelligently
      expect(selection).toBeDefined();
      expect(selection.model).toBeDefined();
    });
  });

  // -------------------------------------------------------------------------
  // Error Handling Tests
  // -------------------------------------------------------------------------

  describe('Error Handling', () => {
    it('should handle invalid configuration gracefully', async () => {
      router = new AdaptiveModelRouter(mockMemoryStore, mockEventBus, {
        enabled: true,
        defaultModel: 'invalid-model' as any
      });

      router.setEnabled(false); // Force fallback to default

      const task = {
        id: 'invalid-config',
        sourceCode: 'code',
        linesOfCode: 10
      };

      const selection = await router.selectModel(task);

      // Should still work with fallback
      expect(selection).toBeDefined();
      expect(selection.model).toBe('invalid-model'); // Uses configured default
    });

    it('should handle config updates during selection', async () => {
      router = new AdaptiveModelRouter(mockMemoryStore, mockEventBus, {
        enabled: true
      });

      const task = {
        id: 'concurrent-update',
        sourceCode: 'code',
        linesOfCode: 50
      };

      // Start multiple selections and update config concurrently
      const promises = [
        router.selectModel(task),
        router.selectModel({ ...task, id: 'concurrent-update-2' }),
        router.selectModel({ ...task, id: 'concurrent-update-3' })
      ];

      router.updateConfig({ cacheTTL: 9999 });

      const results = await Promise.all(promises);

      // All selections should complete successfully
      results.forEach(result => {
        expect(result).toBeDefined();
        expect(result.model).toBeDefined();
      });
    });
  });
});
