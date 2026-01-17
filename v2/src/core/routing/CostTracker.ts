/**
 * Cost Tracker
 * Tracks model usage costs and provides analytics
 */

import { AIModel, ModelCost, RouterStats, CostDashboardData } from './types';
import { MODEL_CAPABILITIES } from './ModelRules';
import { SwarmMemoryManager } from '../memory/SwarmMemoryManager';
import { EventBus } from '../EventBus';

export class CostTracker {
  private memoryStore: SwarmMemoryManager;
  private eventBus: EventBus;
  private costs: Map<AIModel, ModelCost>;
  private sessionStartTime: number;

  constructor(memoryStore: SwarmMemoryManager, eventBus: EventBus) {
    this.memoryStore = memoryStore;
    this.eventBus = eventBus;
    this.costs = new Map();
    this.sessionStartTime = Date.now();
    this.initializeCosts();
  }

  /**
   * Initialize cost tracking for all models
   */
  private initializeCosts(): void {
    Object.values(AIModel).forEach((model) => {
      this.costs.set(model, {
        modelId: model,
        tokensUsed: 0,
        estimatedCost: 0,
        requestCount: 0,
        avgTokensPerRequest: 0,
        timestamp: Date.now(),
      });
    });
  }

  /**
   * Track cost for a model usage
   */
  async trackCost(modelId: AIModel, tokens: number): Promise<void> {
    const cost = this.costs.get(modelId);
    if (!cost) {
      throw new Error(`Unknown model: ${modelId}`);
    }

    const capability = MODEL_CAPABILITIES[modelId];
    const estimatedCost = tokens * capability.costPerToken;

    // Update local cost tracking
    cost.tokensUsed += tokens;
    cost.estimatedCost += estimatedCost;
    cost.requestCount += 1;
    cost.avgTokensPerRequest = cost.tokensUsed / cost.requestCount;
    cost.timestamp = Date.now();

    this.costs.set(modelId, cost);

    // Persist to SwarmMemoryManager
    await this.persistCosts();

    // Emit cost tracking event
    this.eventBus.emit('router:cost-tracked', {
      model: modelId,
      tokens,
      cost: estimatedCost,
      totalCost: cost.estimatedCost,
    });
  }

  /**
   * Convert ModelCost to JSON-serializable object
   */
  private serializeModelCost(cost: ModelCost): { [key: string]: string | number } {
    return {
      modelId: cost.modelId,
      tokensUsed: cost.tokensUsed,
      estimatedCost: cost.estimatedCost,
      requestCount: cost.requestCount,
      avgTokensPerRequest: cost.avgTokensPerRequest,
      timestamp: cost.timestamp,
    };
  }

  /**
   * Persist costs to SwarmMemoryManager
   */
  private async persistCosts(): Promise<void> {
    const costsArray = Array.from(this.costs.values());
    // Convert to JsonValue[] (array of serializable objects)
    const serializableCosts = costsArray.map(cost => this.serializeModelCost(cost));
    await this.memoryStore.store('routing/costs', serializableCosts, {
      partition: 'coordination',
      ttl: 86400, // 24 hours
    });
  }

  /**
   * Type guard to check if value is a valid ModelCost object
   */
  private isModelCost(value: unknown): value is ModelCost {
    if (typeof value !== 'object' || value === null) {
      return false;
    }
    const obj = value as Record<string, unknown>;
    return (
      typeof obj.modelId === 'string' &&
      typeof obj.tokensUsed === 'number' &&
      typeof obj.estimatedCost === 'number' &&
      typeof obj.requestCount === 'number' &&
      typeof obj.avgTokensPerRequest === 'number' &&
      typeof obj.timestamp === 'number'
    );
  }

  /**
   * Load costs from SwarmMemoryManager
   */
  async loadCosts(): Promise<void> {
    try {
      const stored = await this.memoryStore.retrieve('routing/costs', {
        partition: 'coordination',
      });

      if (stored && Array.isArray(stored)) {
        stored.forEach((item: unknown) => {
          if (this.isModelCost(item)) {
            this.costs.set(item.modelId, item);
          }
        });
      }
    } catch (error) {
      // No stored costs, use initialized values
    }
  }

  /**
   * Get router statistics
   */
  async getStats(): Promise<RouterStats> {
    const costsArray = Array.from(this.costs.values());
    const totalRequests = costsArray.reduce((sum, c) => sum + c.requestCount, 0);
    const totalCost = costsArray.reduce((sum, c) => sum + c.estimatedCost, 0);

    // Calculate cost savings vs single model (Claude Sonnet 4.5)
    const baselineModel = MODEL_CAPABILITIES[AIModel.CLAUDE_SONNET_4_5];
    const totalTokens = costsArray.reduce((sum, c) => sum + c.tokensUsed, 0);
    const baselineCost = totalTokens * baselineModel.costPerToken;
    const costSavings = baselineCost - totalCost;

    // Model distribution
    const modelDistribution = {} as Record<AIModel, number>;
    Object.values(AIModel).forEach((model) => {
      const cost = this.costs.get(model);
      modelDistribution[model] = cost?.requestCount || 0;
    });

    // Average costs
    const avgCostPerTask = totalRequests > 0 ? totalCost / totalRequests : 0;
    const avgCostPerTest = await this.calculateAvgCostPerTest();

    return {
      totalRequests,
      totalCost,
      costSavings,
      modelDistribution,
      avgCostPerTask,
      avgCostPerTest,
    };
  }

  /**
   * Calculate average cost per test generated
   */
  private async calculateAvgCostPerTest(): Promise<number> {
    try {
      // Get test count from memory
      const testMetrics = await this.memoryStore.retrieve('aqe/test-metrics', {
        partition: 'coordination',
      });

      if (testMetrics && typeof testMetrics === 'object' && 'totalTests' in testMetrics) {
        const totalTests = (testMetrics as Record<string, unknown>).totalTests;
        if (typeof totalTests === 'number' && totalTests > 0) {
          const stats = await this.getStats();
          return stats.totalCost / totalTests;
        }
      }
    } catch (error) {
      // No test metrics available
    }

    return 0;
  }

  /**
   * Export cost dashboard data
   */
  async exportCostDashboard(): Promise<CostDashboardData> {
    const stats = await this.getStats();
    const costsArray = Array.from(this.costs.values());

    return {
      summary: {
        totalCost: stats.totalCost.toFixed(4),
        totalRequests: stats.totalRequests,
        costSavings: stats.costSavings.toFixed(4),
        savingsPercentage: stats.totalCost > 0
          ? ((stats.costSavings / (stats.totalCost + stats.costSavings)) * 100).toFixed(2)
          : '0.00',
        avgCostPerTask: stats.avgCostPerTask.toFixed(4),
        avgCostPerTest: stats.avgCostPerTest.toFixed(4),
        sessionDuration: this.formatDuration(Date.now() - this.sessionStartTime),
      },
      models: costsArray.map((cost) => {
        const capability = MODEL_CAPABILITIES[cost.modelId];
        return {
          model: cost.modelId,
          requests: cost.requestCount,
          tokensUsed: cost.tokensUsed,
          cost: cost.estimatedCost.toFixed(4),
          avgTokensPerRequest: Math.round(cost.avgTokensPerRequest),
          costPerToken: capability.costPerToken,
          percentage: stats.totalCost > 0
            ? ((cost.estimatedCost / stats.totalCost) * 100).toFixed(2)
            : '0.00',
        };
      }),
      distribution: stats.modelDistribution,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Format duration in human-readable format
   */
  private formatDuration(ms: number): string {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);

    if (hours > 0) {
      return `${hours}h ${minutes % 60}m`;
    } else if (minutes > 0) {
      return `${minutes}m ${seconds % 60}s`;
    } else {
      return `${seconds}s`;
    }
  }

  /**
   * Reset cost tracking (for testing)
   */
  async reset(): Promise<void> {
    this.costs.clear();
    this.initializeCosts();
    this.sessionStartTime = Date.now();
    await this.persistCosts();
  }

  /**
   * Get cost for specific model
   */
  getModelCost(modelId: AIModel): ModelCost | undefined {
    return this.costs.get(modelId);
  }
}
