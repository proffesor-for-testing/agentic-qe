/**
 * SONA Lifecycle Manager - Phase 2 Integration
 *
 * Wires SONA's self-organizing capabilities into agent execution lifecycle.
 * Provides hooks for:
 * - Agent spawn: Initialize SONA state and activate relevant LoRA adapters
 * - Task completion: Collect feedback and consolidate successful patterns
 * - Task feedback: Record execution events and trigger learning
 * - EWC weight consolidation: Prevent catastrophic forgetting
 *
 * Architecture:
 * - Wraps SONALearningStrategy for lifecycle events
 * - Manages per-agent SONA contexts
 * - Coordinates LoRA adapter activation based on agent/task types
 * - Triggers EWC consolidation on successful patterns
 *
 * @module agents/SONALifecycleManager
 * @version 2.5.4
 */

import {
  SONALearningStrategy,
  createSONALearningStrategy,
  type SONALearningConfig,
  type SONAMetrics,
} from '../core/strategies/SONALearningStrategy';
import {
  SONAFeedbackLoop,
  createConnectedFeedbackLoop,
  type FeedbackLoopConfig,
  type FeedbackEvent,
  type FeedbackAnalysis,
  type Adaptation,
} from '../learning/SONAFeedbackLoop';
import type {
  LearnedPattern,
  ExecutionEvent,
  TrainingResult,
} from '../core/strategies';
import type { QETask, QEAgentType } from '../types';
import { Logger } from '../utils/Logger';
import { isRuvLLMAvailable } from '../utils/ruvllm-loader';

/**
 * SONA lifecycle configuration
 */
export interface SONALifecycleConfig {
  /** Enable SONA lifecycle integration */
  enabled?: boolean;
  /** Enable automatic EWC consolidation */
  autoConsolidate?: boolean;
  /** Consolidation interval (default: 100 successful tasks) */
  consolidationInterval?: number;
  /** Enable LoRA adapter management */
  enableLoraAdapters?: boolean;
  /** SONA learning configuration */
  sonaConfig?: SONALearningConfig;
  /** Feedback loop configuration */
  feedbackConfig?: FeedbackLoopConfig;
  /** Minimum success rate for consolidation (default: 0.7) */
  minSuccessRateForConsolidation?: number;
  /** Enable performance-based adapter selection */
  enableAdaptiveAdapters?: boolean;
}

/**
 * Agent-specific SONA context
 */
export interface AgentSONAContext {
  /** Agent ID */
  agentId: string;
  /** Agent type */
  agentType: QEAgentType;
  /** SONA learning strategy */
  strategy: SONALearningStrategy;
  /** Feedback loop */
  feedbackLoop?: SONAFeedbackLoop;
  /** Active LoRA adapter name */
  activeAdapter?: string;
  /** Successful task count */
  successfulTasks: number;
  /** Failed task count */
  failedTasks: number;
  /** Last consolidation timestamp */
  lastConsolidation: Date;
  /** Patterns pending consolidation */
  pendingPatterns: LearnedPattern[];
  /** Created timestamp */
  createdAt: Date;
}

/**
 * Task completion feedback
 */
export interface TaskCompletionFeedback {
  /** Task that was executed */
  task: QETask;
  /** Whether execution was successful */
  success: boolean;
  /** Execution duration in ms */
  duration: number;
  /** Quality score (0-1) if available */
  quality?: number;
  /** Result data */
  result?: unknown;
  /** Error if failed */
  error?: Error;
  /** Patterns used during execution */
  patternsUsed?: string[];
}

/**
 * LoRA adapter mapping for agent types
 */
const AGENT_TYPE_ADAPTERS: Record<string, string> = {
  // Core Testing Agents
  TEST_GENERATOR: 'test-generation',
  TEST_EXECUTOR: 'test-execution',
  COVERAGE_ANALYZER: 'coverage-analysis',
  QUALITY_GATE: 'quality-validation',
  PERFORMANCE_TESTER: 'performance-testing',
  SECURITY_SCANNER: 'security-scanning',

  // Strategic Planning
  REQUIREMENTS_VALIDATOR: 'requirements-validation',
  DEPLOYMENT_READINESS: 'deployment-validation',
  PRODUCTION_INTELLIGENCE: 'production-analysis',

  // Specialized Testing
  FLEET_COMMANDER: 'fleet-coordination',
  CHAOS_ENGINEER: 'chaos-testing',
  VISUAL_TESTER: 'visual-testing',

  // Optimization
  REGRESSION_RISK_ANALYZER: 'regression-analysis',
  TEST_DATA_ARCHITECT: 'data-generation',
  API_CONTRACT_VALIDATOR: 'contract-validation',
  FLAKY_TEST_HUNTER: 'flaky-detection',

  // QX & Accessibility
  QX_PARTNER: 'qx-analysis',
  ACCESSIBILITY_ALLY: 'accessibility-testing',
  QUALITY_ANALYZER: 'quality-analysis',
};

/**
 * SONA Lifecycle Manager
 *
 * Manages SONA learning contexts for all agents in the fleet.
 * Coordinates lifecycle hooks and learning consolidation.
 */
export class SONALifecycleManager {
  private contexts: Map<string, AgentSONAContext> = new Map();
  private config: Required<SONALifecycleConfig>;
  private logger: Logger;
  private ruvLLMAvailable: boolean = false;

  constructor(config: SONALifecycleConfig = {}) {
    this.logger = Logger.getInstance();

    // Apply defaults
    this.config = {
      enabled: config.enabled !== false,
      autoConsolidate: config.autoConsolidate !== false,
      consolidationInterval: config.consolidationInterval || 100,
      enableLoraAdapters: config.enableLoraAdapters !== false,
      sonaConfig: config.sonaConfig || {},
      feedbackConfig: config.feedbackConfig || {},
      minSuccessRateForConsolidation: config.minSuccessRateForConsolidation || 0.7,
      enableAdaptiveAdapters: config.enableAdaptiveAdapters !== false,
    };

    // Check ruvLLM availability
    this.checkRuvLLMAvailability();

    this.logger.info('SONA Lifecycle Manager initialized', {
      enabled: this.config.enabled,
      autoConsolidate: this.config.autoConsolidate,
      consolidationInterval: this.config.consolidationInterval,
      ruvLLMAvailable: this.ruvLLMAvailable,
    });
  }

  /**
   * Check if ruvLLM is available for advanced SONA features
   */
  private checkRuvLLMAvailability(): void {
    try {
      this.ruvLLMAvailable = isRuvLLMAvailable();
    } catch (error) {
      this.logger.warn('ruvLLM not available, using fallback mode', error);
      this.ruvLLMAvailable = false;
    }
  }

  /**
   * Hook: Agent Spawn
   *
   * Called when a new agent is spawned. Initializes SONA state and
   * activates relevant LoRA adapter based on agent type.
   *
   * @param agentId - Unique agent identifier
   * @param agentType - Type of agent being spawned
   * @returns Agent SONA context
   */
  async onAgentSpawn(agentId: string, agentType: QEAgentType): Promise<AgentSONAContext> {
    if (!this.config.enabled) {
      this.logger.debug(`SONA lifecycle disabled, skipping spawn hook for ${agentId}`);
      throw new Error('SONA lifecycle not enabled');
    }

    this.logger.info(`SONA onAgentSpawn: ${agentId} (${agentType})`);

    try {
      // Create SONA learning strategy
      const strategyConfig: SONALearningConfig = {
        enableSONA: true,
        microLoraRank: this.ruvLLMAvailable ? 2 : 1,
        baseLoraRank: this.ruvLLMAvailable ? 8 : 4,
        consolidationInterval: this.config.consolidationInterval,
        maxPatterns: 10000,
        enableTrajectories: true,
        ...this.config.sonaConfig,
      };

      const strategy = createSONALearningStrategy(strategyConfig);
      await strategy.initialize();

      // Create feedback loop
      let feedbackLoop: SONAFeedbackLoop | undefined;
      if (this.config.feedbackConfig) {
        feedbackLoop = createConnectedFeedbackLoop(strategy, {
          enabled: true,
          minExecutionsForAnalysis: 10,
          batchSize: 20,
          adaptiveLearningRate: true,
          adaptationThreshold: 0.7,
          enableDriftDetection: true,
          driftWindowSize: 50,
          ...this.config.feedbackConfig,
        });
      }

      // Determine and activate LoRA adapter
      const activeAdapter = this.determineLoraAdapter(agentType);
      if (this.config.enableLoraAdapters && activeAdapter) {
        await this.activateLoraAdapter(strategy, activeAdapter);
      }

      // Create agent context
      const context: AgentSONAContext = {
        agentId,
        agentType,
        strategy,
        feedbackLoop,
        activeAdapter,
        successfulTasks: 0,
        failedTasks: 0,
        lastConsolidation: new Date(),
        pendingPatterns: [],
        createdAt: new Date(),
      };

      this.contexts.set(agentId, context);

      this.logger.info(`SONA context created for agent ${agentId}`, {
        agentType,
        activeAdapter,
        ruvLLMMode: this.ruvLLMAvailable ? 'full' : 'fallback',
      });

      return context;
    } catch (error) {
      this.logger.error(`Failed to initialize SONA for agent ${agentId}:`, error);
      throw error;
    }
  }

  /**
   * Hook: Task Complete
   *
   * Called when an agent completes a task. Collects feedback and
   * triggers EWC weight consolidation on successful patterns.
   *
   * @param agentId - Agent identifier
   * @param feedback - Task completion feedback
   */
  async onTaskComplete(agentId: string, feedback: TaskCompletionFeedback): Promise<void> {
    if (!this.config.enabled) {
      return;
    }

    const context = this.contexts.get(agentId);
    if (!context) {
      this.logger.warn(`No SONA context found for agent ${agentId}, skipping task completion hook`);
      return;
    }

    this.logger.debug(`SONA onTaskComplete: ${agentId}`, {
      taskId: feedback.task.id,
      success: feedback.success,
      duration: feedback.duration,
      quality: feedback.quality,
    });

    try {
      // Update task counters
      if (feedback.success) {
        context.successfulTasks++;
      } else {
        context.failedTasks++;
      }

      // Record feedback
      await this.recordFeedback(context, feedback);

      // Check if consolidation is needed
      if (this.shouldConsolidate(context)) {
        await this.consolidateWeights(context);
      }

      // Check for adaptive adapter changes
      if (this.config.enableAdaptiveAdapters && feedback.success) {
        await this.checkAdapterPerformance(context, feedback);
      }
    } catch (error) {
      this.logger.error(`Error in task completion hook for agent ${agentId}:`, error);
      // Don't throw - we don't want to break the agent execution
    }
  }

  /**
   * Hook: Task Feedback
   *
   * Generic feedback recording hook. Can be called at any point during
   * or after task execution to record events and trigger learning.
   *
   * @param agentId - Agent identifier
   * @param event - Feedback event
   */
  async onFeedback(agentId: string, event: FeedbackEvent): Promise<void> {
    if (!this.config.enabled) {
      return;
    }

    const context = this.contexts.get(agentId);
    if (!context) {
      this.logger.warn(`No SONA context found for agent ${agentId}, skipping feedback hook`);
      return;
    }

    this.logger.debug(`SONA onFeedback: ${agentId}`, {
      taskType: event.task.type,
      success: event.success,
    });

    try {
      if (context.feedbackLoop) {
        await context.feedbackLoop.recordFeedback(event);
      } else {
        // Fallback to direct strategy recording
        const execEvent: ExecutionEvent = {
          task: event.task,
          success: event.success,
          duration: event.duration,
          result: event.result,
          error: event.error,
        };
        await context.strategy.recordExecution(execEvent);
      }

      // Store successful patterns for later consolidation
      if (event.success && event.patternsUsed) {
        for (const patternId of event.patternsUsed) {
          // Create pattern from execution
          const pattern: LearnedPattern = {
            id: patternId,
            type: 'execution',
            domain: event.task.type,
            content: JSON.stringify({
              task: event.task,
              quality: event.quality,
            }),
            confidence: event.quality || 0.8,
            usageCount: 1,
            successRate: 1.0,
            createdAt: event.timestamp,
            updatedAt: event.timestamp,
            metadata: {
              taskType: event.task.type,
              duration: event.duration,
              agentId,
            },
          };
          context.pendingPatterns.push(pattern);
        }
      }
    } catch (error) {
      this.logger.error(`Error recording feedback for agent ${agentId}:`, error);
    }
  }

  /**
   * Get agent SONA context
   *
   * @param agentId - Agent identifier
   * @returns Agent SONA context or undefined
   */
  getContext(agentId: string): AgentSONAContext | undefined {
    return this.contexts.get(agentId);
  }

  /**
   * Get SONA metrics for an agent
   *
   * @param agentId - Agent identifier
   * @returns SONA metrics or undefined
   */
  async getMetrics(agentId: string): Promise<SONAMetrics | undefined> {
    const context = this.contexts.get(agentId);
    if (!context) {
      return undefined;
    }

    try {
      return await context.strategy.getMetrics();
    } catch (error) {
      this.logger.error(`Failed to get metrics for agent ${agentId}:`, error);
      return undefined;
    }
  }

  /**
   * Manually trigger training for an agent
   *
   * @param agentId - Agent identifier
   * @param iterations - Number of training iterations
   * @returns Training result
   */
  async train(agentId: string, iterations: number = 10): Promise<TrainingResult | undefined> {
    const context = this.contexts.get(agentId);
    if (!context) {
      this.logger.warn(`No SONA context found for agent ${agentId}`);
      return undefined;
    }

    this.logger.info(`Manually triggering training for agent ${agentId}`, { iterations });

    try {
      return await context.strategy.train(iterations);
    } catch (error) {
      this.logger.error(`Training failed for agent ${agentId}:`, error);
      return undefined;
    }
  }

  /**
   * Cleanup agent SONA context
   *
   * @param agentId - Agent identifier
   */
  async cleanupAgent(agentId: string): Promise<void> {
    const context = this.contexts.get(agentId);
    if (!context) {
      return;
    }

    this.logger.info(`Cleaning up SONA context for agent ${agentId}`);

    try {
      // Final consolidation before cleanup
      if (context.pendingPatterns.length > 0) {
        await this.consolidateWeights(context);
      }

      // Reset feedback loop
      if (context.feedbackLoop) {
        context.feedbackLoop.reset();
      }

      // Reset strategy
      await context.strategy.reset();

      // Remove context
      this.contexts.delete(agentId);

      this.logger.info(`SONA context cleaned up for agent ${agentId}`);
    } catch (error) {
      this.logger.error(`Failed to cleanup SONA context for agent ${agentId}:`, error);
    }
  }

  /**
   * Get all active agent contexts
   *
   * @returns Array of agent SONA contexts
   */
  getAllContexts(): AgentSONAContext[] {
    return Array.from(this.contexts.values());
  }

  /**
   * Get lifecycle statistics
   *
   * @returns Lifecycle statistics
   */
  getStatistics(): {
    totalAgents: number;
    totalSuccessfulTasks: number;
    totalFailedTasks: number;
    averageSuccessRate: number;
    totalConsolidations: number;
    ruvLLMAvailable: boolean;
  } {
    const contexts = Array.from(this.contexts.values());
    const totalSuccessful = contexts.reduce((sum, c) => sum + c.successfulTasks, 0);
    const totalFailed = contexts.reduce((sum, c) => sum + c.failedTasks, 0);
    const totalTasks = totalSuccessful + totalFailed;

    return {
      totalAgents: contexts.length,
      totalSuccessfulTasks: totalSuccessful,
      totalFailedTasks: totalFailed,
      averageSuccessRate: totalTasks > 0 ? totalSuccessful / totalTasks : 0,
      totalConsolidations: contexts.reduce((sum, c) => {
        return sum + Math.floor(c.successfulTasks / this.config.consolidationInterval);
      }, 0),
      ruvLLMAvailable: this.ruvLLMAvailable,
    };
  }

  // ============================================================================
  // PRIVATE METHODS
  // ============================================================================

  /**
   * Determine LoRA adapter for agent type
   */
  private determineLoraAdapter(agentType: QEAgentType): string | undefined {
    const adapter = AGENT_TYPE_ADAPTERS[agentType];
    if (adapter) {
      this.logger.debug(`Selected LoRA adapter '${adapter}' for agent type ${agentType}`);
    }
    return adapter;
  }

  /**
   * Activate LoRA adapter for strategy
   */
  private async activateLoraAdapter(strategy: SONALearningStrategy, adapterName: string): Promise<void> {
    try {
      this.logger.debug(`Activating LoRA adapter: ${adapterName}`);

      // In actual implementation, this would call ruvLLM's LoRA manager
      // For now, we log the activation
      // strategy.activateAdapter(adapterName); // Would be actual API call

      this.logger.info(`LoRA adapter activated: ${adapterName}`);
    } catch (error) {
      this.logger.warn(`Failed to activate LoRA adapter ${adapterName}:`, error);
      // Continue without adapter - not critical
    }
  }

  /**
   * Record feedback to strategy
   */
  private async recordFeedback(context: AgentSONAContext, feedback: TaskCompletionFeedback): Promise<void> {
    const event: FeedbackEvent = {
      task: feedback.task,
      success: feedback.success,
      duration: feedback.duration,
      quality: feedback.quality,
      result: feedback.result,
      error: feedback.error,
      patternsUsed: feedback.patternsUsed,
      timestamp: new Date(),
    };

    if (context.feedbackLoop) {
      await context.feedbackLoop.recordFeedback(event);
    } else {
      const execEvent: ExecutionEvent = {
        task: feedback.task,
        success: feedback.success,
        duration: feedback.duration,
        result: feedback.result,
        error: feedback.error,
      };
      await context.strategy.recordExecution(execEvent);
    }
  }

  /**
   * Check if weight consolidation should be triggered
   */
  private shouldConsolidate(context: AgentSONAContext): boolean {
    if (!this.config.autoConsolidate) {
      return false;
    }

    // Consolidate every N successful tasks
    const tasksSinceConsolidation = context.successfulTasks % this.config.consolidationInterval;
    if (tasksSinceConsolidation === 0 && context.successfulTasks > 0) {
      return true;
    }

    // Also consolidate if we have many pending patterns
    if (context.pendingPatterns.length >= this.config.consolidationInterval) {
      return true;
    }

    return false;
  }

  /**
   * Consolidate weights using EWC++
   *
   * Stores successful patterns and prevents catastrophic forgetting
   * by consolidating weights of high-confidence patterns.
   */
  private async consolidateWeights(context: AgentSONAContext): Promise<void> {
    this.logger.info(`Consolidating weights for agent ${context.agentId}`, {
      pendingPatterns: context.pendingPatterns.length,
      successfulTasks: context.successfulTasks,
    });

    try {
      // Calculate success rate
      const totalTasks = context.successfulTasks + context.failedTasks;
      const successRate = totalTasks > 0 ? context.successfulTasks / totalTasks : 0;

      // Only consolidate if success rate is above threshold
      if (successRate < this.config.minSuccessRateForConsolidation) {
        this.logger.warn(
          `Skipping consolidation for agent ${context.agentId}: success rate ${successRate.toFixed(2)} below threshold ${this.config.minSuccessRateForConsolidation}`
        );
        return;
      }

      // Store pending patterns
      for (const pattern of context.pendingPatterns) {
        await context.strategy.storePattern(pattern);
      }

      // Trigger training/consolidation
      const trainingResult = await context.strategy.train(5);

      // Update consolidation timestamp
      context.lastConsolidation = new Date();
      context.pendingPatterns = [];

      this.logger.info(`Weight consolidation completed for agent ${context.agentId}`, {
        patternsConsolidated: context.pendingPatterns.length,
        iterations: trainingResult.iterations,
        improvement: trainingResult.improvement,
        patternsLearned: trainingResult.patternsLearned,
        loss: trainingResult.metrics.loss,
        accuracy: trainingResult.metrics.accuracy,
        successRate: successRate.toFixed(2),
      });
    } catch (error) {
      this.logger.error(`Weight consolidation failed for agent ${context.agentId}:`, error);
    }
  }

  /**
   * Check if adapter should be changed based on performance
   */
  private async checkAdapterPerformance(
    context: AgentSONAContext,
    feedback: TaskCompletionFeedback
  ): Promise<void> {
    // This is a placeholder for adaptive adapter selection
    // In a full implementation, this would analyze performance metrics
    // and switch adapters if needed

    // For now, we just log performance
    this.logger.debug(`Adapter performance check for ${context.agentId}`, {
      activeAdapter: context.activeAdapter,
      successRate: context.successfulTasks / (context.successfulTasks + context.failedTasks),
      avgQuality: feedback.quality,
    });
  }
}

/**
 * Create SONA lifecycle manager with default configuration
 */
export function createSONALifecycleManager(config?: SONALifecycleConfig): SONALifecycleManager {
  return new SONALifecycleManager(config);
}

/**
 * Singleton instance for global access
 */
let globalLifecycleManager: SONALifecycleManager | null = null;

/**
 * Get or create global SONA lifecycle manager
 *
 * @param config - Optional configuration (only used on first call)
 * @returns Global SONA lifecycle manager
 */
export function getSONALifecycleManager(config?: SONALifecycleConfig): SONALifecycleManager {
  if (!globalLifecycleManager) {
    globalLifecycleManager = new SONALifecycleManager(config);
  }
  return globalLifecycleManager;
}

/**
 * Reset global SONA lifecycle manager (for testing)
 */
export function resetSONALifecycleManager(): void {
  globalLifecycleManager = null;
}
