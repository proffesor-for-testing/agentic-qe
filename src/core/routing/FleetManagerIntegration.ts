/**
 * FleetManager Integration for Multi-Model Router
 * Integrates the AdaptiveModelRouter with FleetManager
 */

import { FleetManager } from '../FleetManager';
import { Task } from '../Task';
import { AdaptiveModelRouter } from './AdaptiveModelRouter';
import { SwarmMemoryManager } from '../memory/SwarmMemoryManager';
import { EventBus } from '../EventBus';
import { ModelSelection, AIModel, RouterConfig } from './types';
import { taskToQETask } from './QETask';

/**
 * Extended FleetManager with routing capabilities
 */
export class RoutingEnabledFleetManager {
  private fleetManager: FleetManager;
  private router: AdaptiveModelRouter;
  private memoryStore: SwarmMemoryManager;
  private eventBus: EventBus;

  constructor(
    fleetManager: FleetManager,
    memoryStore: SwarmMemoryManager,
    eventBus: EventBus,
    routerConfig?: Partial<RouterConfig>
  ) {
    this.fleetManager = fleetManager;
    this.memoryStore = memoryStore;
    this.eventBus = eventBus;
    this.router = new AdaptiveModelRouter(memoryStore, eventBus, routerConfig);

    this.setupEventHandlers();
  }

  /**
   * Setup event handlers for router integration
   */
  private setupEventHandlers(): void {
    // Listen for task submissions to perform model selection
    this.eventBus.on('task:submitted', async (data: { task: Task }) => {
      await this.handleTaskSubmitted(data.task);
    });

    // Listen for task completions to track costs
    this.eventBus.on('task:completed', async (data: { task: Task; result: any }) => {
      await this.handleTaskCompleted(data.task, data.result);
    });

    // Listen for model failures to trigger fallback
    this.eventBus.on('model:failed', async (data: { task: Task; model: AIModel; error: Error }) => {
      await this.handleModelFailure(data.task, data.model, data.error);
    });
  }

  /**
   * Handle task submission - select optimal model
   */
  private async handleTaskSubmitted(task: Task): Promise<void> {
    try {
      const qeTask = taskToQETask(task);
      const selection = await this.router.selectModel(qeTask);

      // Store model selection in task metadata
      (task as any).metadata = {
        ...(task as any).metadata,
        modelSelection: selection,
      };

      // Emit model selection event
      this.eventBus.emit('router:model-assigned', {
        taskId: task.getId(),
        model: selection.model,
        complexity: selection.complexity,
        estimatedCost: selection.estimatedCost,
      });
    } catch (error) {
      console.error('Failed to select model for task:', error);
      // Continue with default model
    }
  }

  /**
   * Handle task completion - track actual costs
   */
  private async handleTaskCompleted(task: Task, result: any): Promise<void> {
    try {
      const metadata = (task as any).metadata;
      if (!metadata || !metadata.modelSelection) {
        return;
      }

      const selection = metadata.modelSelection as ModelSelection;
      const actualTokens = result.tokensUsed || this.estimateTokensFromResult(result);

      // Track actual cost
      await this.router.trackCost(selection.model, actualTokens);

      // Calculate accuracy of cost estimation
      const estimatedTokens = selection.estimatedCost / 0.00005; // Rough reverse calculation
      const accuracy = actualTokens > 0 ? Math.abs(1 - estimatedTokens / actualTokens) : 0;

      this.eventBus.emit('router:cost-accuracy', {
        taskId: task.getId(),
        model: selection.model,
        estimatedTokens,
        actualTokens,
        accuracy,
      });
    } catch (error) {
      console.error('Failed to track task cost:', error);
    }
  }

  /**
   * Handle model failure - select fallback
   */
  private async handleModelFailure(task: Task, failedModel: AIModel, error: Error): Promise<void> {
    try {
      const qeTask = taskToQETask(task);
      const fallbackModel = this.router.getFallbackModel(failedModel, qeTask);

      // Update task metadata with fallback model
      (task as any).metadata = {
        ...(task as any).metadata,
        fallbackModel,
        originalModel: failedModel,
        failureReason: error.message,
      };

      this.eventBus.emit('router:fallback-triggered', {
        taskId: task.getId(),
        failedModel,
        fallbackModel,
        error: error.message,
      });
    } catch (error) {
      console.error('Failed to handle model failure:', error);
    }
  }

  /**
   * Estimate tokens from result (fallback when not provided)
   */
  private estimateTokensFromResult(result: any): number {
    if (!result) return 0;

    const resultStr = JSON.stringify(result);
    return Math.round(resultStr.length / 4); // Rough estimate
  }

  /**
   * Get router statistics
   */
  async getRouterStats() {
    return await this.router.getStats();
  }

  /**
   * Export cost dashboard
   */
  async exportCostDashboard() {
    return await this.router.exportCostDashboard();
  }

  /**
   * Enable or disable routing
   */
  setRoutingEnabled(enabled: boolean): void {
    this.router.setEnabled(enabled);
  }

  /**
   * Update router configuration
   */
  updateRouterConfig(config: Partial<RouterConfig>): void {
    this.router.updateConfig(config);
  }

  /**
   * Get underlying router instance
   */
  getRouter(): AdaptiveModelRouter {
    return this.router;
  }

  /**
   * Get underlying fleet manager instance
   */
  getFleetManager(): FleetManager {
    return this.fleetManager;
  }
}

/**
 * Factory function to create routing-enabled fleet manager
 */
export function createRoutingEnabledFleetManager(
  fleetManager: FleetManager,
  memoryStore: SwarmMemoryManager,
  eventBus: EventBus,
  routerConfig?: Partial<RouterConfig>
): RoutingEnabledFleetManager {
  return new RoutingEnabledFleetManager(
    fleetManager,
    memoryStore,
    eventBus,
    routerConfig
  );
}
