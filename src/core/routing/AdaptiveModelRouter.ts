/**
 * Adaptive Model Router
 * Implements intelligent model selection with cost optimization
 */

import { QETask } from './types';
import {
  ModelRouter,
  ModelSelection,
  AIModel,
  TaskComplexity,
  RouterStats,
  RouterConfig,
} from './types';
import { MODEL_RULES, FALLBACK_CHAINS, DEFAULT_ROUTER_CONFIG } from './ModelRules';
import { ComplexityAnalyzer } from './ComplexityAnalyzer';
import { CostTracker } from './CostTracker';
import { SwarmMemoryManager } from '../memory/SwarmMemoryManager';
import { EventBus } from '../EventBus';

export class AdaptiveModelRouter implements ModelRouter {
  private config: RouterConfig;
  private complexityAnalyzer: ComplexityAnalyzer;
  private costTracker: CostTracker;
  private memoryStore: SwarmMemoryManager;
  private eventBus: EventBus;
  private failureCount: Map<AIModel, number>;

  constructor(
    memoryStore: SwarmMemoryManager,
    eventBus: EventBus,
    config?: Partial<RouterConfig>
  ) {
    this.memoryStore = memoryStore;
    this.eventBus = eventBus;
    this.config = { ...DEFAULT_ROUTER_CONFIG, ...config };
    this.complexityAnalyzer = new ComplexityAnalyzer();
    this.costTracker = new CostTracker(memoryStore, eventBus);
    this.failureCount = new Map();

    this.initialize();
  }

  /**
   * Initialize router
   */
  private async initialize(): Promise<void> {
    // Load costs from memory
    await this.costTracker.loadCosts();

    // Emit initialization event
    this.eventBus.emit('router:initialized', {
      config: this.config,
      timestamp: Date.now(),
    });
  }

  /**
   * Select the optimal model for a given task
   */
  async selectModel(task: QETask): Promise<ModelSelection> {
    // If routing is disabled, use default model
    if (!this.config.enabled) {
      return this.createDefaultSelection(task);
    }

    try {
      // Analyze task complexity
      const analysis = this.complexityAnalyzer.analyzeComplexity(task);

      // Select model based on task type and complexity
      const agentType = this.extractAgentType(task);
      const model = this.selectModelForTask(agentType, analysis.complexity);

      // Calculate estimated cost
      const estimatedCost = await this.estimateCost(model, analysis.estimatedTokens);

      // Check if cost exceeds threshold
      if (estimatedCost > this.config.costThreshold) {
        return await this.selectCostOptimizedModel(task, analysis.complexity, estimatedCost);
      }

      // Get fallback models
      const fallbackModels = FALLBACK_CHAINS[model] || [];

      // Create selection
      const selection: ModelSelection = {
        model,
        complexity: analysis.complexity,
        reasoning: this.buildReasoning(agentType, analysis),
        estimatedCost,
        fallbackModels,
        confidence: analysis.confidence,
      };

      // Store selection in memory
      await this.storeSelection(task, selection);

      // Emit selection event
      this.eventBus.emit('router:model-selected', {
        task: task.id,
        model,
        complexity: analysis.complexity,
        estimatedCost,
      });

      return selection;
    } catch (error) {
      console.error('Model selection failed:', error);
      return this.createDefaultSelection(task);
    }
  }

  /**
   * Track cost for a model usage
   */
  async trackCost(modelId: AIModel, tokens: number): Promise<void> {
    if (!this.config.enableCostTracking) {
      return;
    }

    await this.costTracker.trackCost(modelId, tokens);
  }

  /**
   * Get fallback model when primary fails
   */
  getFallbackModel(failedModel: AIModel, task: QETask): AIModel {
    if (!this.config.enableFallback) {
      return this.config.defaultModel;
    }

    // Track failure
    const failures = this.failureCount.get(failedModel) || 0;
    this.failureCount.set(failedModel, failures + 1);

    // Get fallback chain
    const fallbacks = FALLBACK_CHAINS[failedModel] || [];

    // Find first fallback that hasn't failed too many times
    for (const fallback of fallbacks) {
      const fallbackFailures = this.failureCount.get(fallback) || 0;
      if (fallbackFailures < this.config.maxRetries) {
        this.eventBus.emit('router:fallback-selected', {
          failedModel,
          fallbackModel: fallback,
          task: task.id,
        });
        return fallback;
      }
    }

    // All fallbacks exhausted, use default
    return this.config.defaultModel;
  }

  /**
   * Get router statistics
   */
  async getStats(): Promise<RouterStats> {
    return await this.costTracker.getStats();
  }

  /**
   * Export cost dashboard data
   */
  async exportCostDashboard(): Promise<any> {
    return await this.costTracker.exportCostDashboard();
  }

  /**
   * Analyze task complexity
   */
  async analyzeComplexity(task: QETask): Promise<TaskComplexity> {
    const analysis = this.complexityAnalyzer.analyzeComplexity(task);
    return analysis.complexity;
  }

  /**
   * Create default selection when routing is disabled
   */
  private createDefaultSelection(task: QETask): ModelSelection {
    return {
      model: this.config.defaultModel,
      complexity: TaskComplexity.MODERATE,
      reasoning: 'Using default model (routing disabled)',
      estimatedCost: 0,
      fallbackModels: [],
      confidence: 1.0,
    };
  }

  /**
   * Extract agent type from task
   */
  private extractAgentType(task: QETask): string {
    // Try to extract from task type or context
    if (task.type && task.type.startsWith('qe-')) {
      return task.type;
    }

    // Try to extract from context
    if (task.data && typeof task.data === 'object' && 'agentType' in task.data) {
      return (task.data as any).agentType;
    }

    return 'default';
  }

  /**
   * Select model based on task type and complexity
   */
  private selectModelForTask(agentType: string, complexity: TaskComplexity): AIModel {
    const rules = MODEL_RULES[agentType] || MODEL_RULES['default'];
    return rules[complexity];
  }

  /**
   * Estimate cost for a model and token count
   */
  private async estimateCost(model: AIModel, tokens: number): Promise<number> {
    const capability = require('./ModelRules').MODEL_CAPABILITIES[model];
    return tokens * capability.costPerToken;
  }

  /**
   * Select cost-optimized model when primary exceeds threshold
   */
  private async selectCostOptimizedModel(
    task: QETask,
    complexity: TaskComplexity,
    originalCost: number
  ): Promise<ModelSelection> {
    // Downgrade complexity to reduce cost
    let optimizedComplexity = complexity;

    if (complexity === TaskComplexity.CRITICAL) {
      optimizedComplexity = TaskComplexity.COMPLEX;
    } else if (complexity === TaskComplexity.COMPLEX) {
      optimizedComplexity = TaskComplexity.MODERATE;
    }

    const agentType = this.extractAgentType(task);
    const model = this.selectModelForTask(agentType, optimizedComplexity);
    const estimatedCost = await this.estimateCost(model, 1000); // Rough estimate

    this.eventBus.emit('router:cost-optimized', {
      task: task.id,
      originalComplexity: complexity,
      optimizedComplexity,
      originalCost,
      optimizedCost: estimatedCost,
    });

    return {
      model,
      complexity: optimizedComplexity,
      reasoning: `Cost-optimized: Reduced from ${complexity} to ${optimizedComplexity} (original cost: $${originalCost.toFixed(4)})`,
      estimatedCost,
      fallbackModels: FALLBACK_CHAINS[model] || [],
      confidence: 0.8, // Lower confidence for cost-optimized selection
    };
  }

  /**
   * Build reasoning string for selection
   */
  private buildReasoning(agentType: string, analysis: any): string {
    const reasons: string[] = [];

    reasons.push(`Complexity: ${analysis.complexity}`);
    reasons.push(`Confidence: ${(analysis.confidence * 100).toFixed(0)}%`);

    if (analysis.requiresSecurity) {
      reasons.push('Security analysis required');
    }
    if (analysis.requiresPerformance) {
      reasons.push('Performance analysis required');
    }
    if (analysis.requiresReasoning) {
      reasons.push('Advanced reasoning required');
    }

    return reasons.join(', ');
  }

  /**
   * Store selection in memory for analytics
   */
  private async storeSelection(task: QETask, selection: ModelSelection): Promise<void> {
    const key = `routing/selection/${task.id}`;
    await this.memoryStore.store(key, selection, {
      partition: 'coordination',
      ttl: 3600, // 1 hour
    });
  }

  /**
   * Enable or disable routing
   */
  setEnabled(enabled: boolean): void {
    this.config.enabled = enabled;
    this.eventBus.emit('router:config-changed', {
      enabled,
      timestamp: Date.now(),
    });
  }

  /**
   * Update router configuration
   */
  updateConfig(config: Partial<RouterConfig>): void {
    this.config = { ...this.config, ...config };
    this.eventBus.emit('router:config-changed', {
      config: this.config,
      timestamp: Date.now(),
    });
  }

  /**
   * Reset failure counts (for testing)
   */
  resetFailures(): void {
    this.failureCount.clear();
  }
}
