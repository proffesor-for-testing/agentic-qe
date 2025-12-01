/**
 * LearningAgent - Phase 2 (Milestone 2.2)
 *
 * Example agent with integrated learning capabilities.
 * Demonstrates how to use LearningEngine, PerformanceTracker, and ImprovementLoop.
 */

import { BaseAgent, BaseAgentConfig } from './BaseAgent';
import { LearningEngine } from '../learning/LearningEngine';
import { PerformanceTracker } from '../learning/PerformanceTracker';
import { ImprovementLoop } from '../learning/ImprovementLoop';
import { QETask, PostTaskData } from '../types';
import type { SwarmMemoryManager } from '../core/memory/SwarmMemoryManager';

/**
 * LearningAgent configuration
 */
export interface LearningAgentConfig extends BaseAgentConfig {
  learningEnabled?: boolean;
  learningRate?: number;
  improvementLoopInterval?: number; // in milliseconds
}

/**
 * LearningAgent - Agent with reinforcement learning capabilities
 */
export class LearningAgent extends BaseAgent {
  private localLearningEngine: LearningEngine;
  private localPerformanceTracker: PerformanceTracker;
  private improvementLoop: ImprovementLoop;
  private learningEnabled: boolean;

  constructor(config: LearningAgentConfig) {
    super(config);

    this.learningEnabled = config.learningEnabled !== false; // default: enabled

    // Initialize learning components
    // Note: BaseAgent uses MemoryStore interface, but Phase 2 learning components
    // expect SwarmMemoryManager. This works because BaseAgent's memoryStore
    // is actually a SwarmMemoryManager instance at runtime.
    this.localLearningEngine = new LearningEngine(
      this.agentId.id,
      this.memoryStore as unknown as SwarmMemoryManager,
      {
        enabled: this.learningEnabled,
        learningRate: config.learningRate
      }
    );

    this.localPerformanceTracker = new PerformanceTracker(
      this.agentId.id,
      this.memoryStore as unknown as SwarmMemoryManager
    );

    this.improvementLoop = new ImprovementLoop(
      this.agentId.id,
      this.memoryStore as unknown as SwarmMemoryManager,
      this.localLearningEngine,
      this.localPerformanceTracker
    );
  }

  /**
   * Initialize agent with learning components
   */
  protected async initializeComponents(): Promise<void> {
    if (!this.learningEnabled) {
      return;
    }

    // Initialize learning components
    await this.localLearningEngine.initialize();
    await this.localPerformanceTracker.initialize();
    await this.improvementLoop.initialize();

    // Start improvement loop (runs every hour by default)
    await this.improvementLoop.start();

    this.emitEvent('learning.initialized', {
      agentId: this.agentId,
      enabled: this.learningEnabled
    });
  }

  /**
   * Post-task hook with learning integration
   */
  protected async onPostTask(data: PostTaskData): Promise<void> {
    // Call parent implementation
    await super.onPostTask(data);

    if (!this.learningEnabled) {
      return;
    }

    try {
      // Learn from task execution
      const learning = await this.localLearningEngine.learnFromExecution(
        data.assignment.task,
        data.result,
        await this.getUserFeedback(data.assignment.id)
      );

      // Record performance snapshot
      await this.recordPerformance(data);

      // Apply improvements if learned
      if (learning.improved) {
        await this.applyLearning(learning);
      }

      // Emit learning event
      this.emitEvent('learning.completed', {
        agentId: this.agentId,
        taskId: data.assignment.id,
        improvement: learning.improvementRate,
        patterns: learning.patterns.length
      });
    } catch (error) {
      console.error('Learning failed:', error);
      // Don't throw - allow task to complete even if learning fails
    }
  }

  /**
   * Record performance metrics
   */
  private async recordPerformance(data: PostTaskData): Promise<void> {
    const executionTime = data.result.executionTime || 0;
    const success = data.result.success !== false;

    await this.localPerformanceTracker.recordSnapshot({
      metrics: {
        tasksCompleted: this.performanceMetrics.tasksCompleted,
        successRate: success ? 1.0 : 0.0,
        averageExecutionTime: executionTime,
        errorRate: success ? 0.0 : 1.0,
        userSatisfaction: data.result.userRating || 0.8,
        resourceEfficiency: data.result.resourceEfficiency || 0.7
      },
      trends: []
    });
  }

  /**
   * Apply learned improvements
   */
  private async applyLearning(learning: any): Promise<void> {
    // Store learned patterns in agent memory
    for (const pattern of learning.patterns) {
      await this.storeMemory(`learned-pattern:${pattern.id}`, pattern);
    }

    // Emit improvement event
    this.emitEvent('learning.improved', {
      agentId: this.agentId,
      improvementRate: learning.improvementRate,
      patterns: learning.patterns
    }, 'high');
  }

  /**
   * Get user feedback (stub - implement based on your system)
   */
  private async getUserFeedback(_taskId: string): Promise<any> {
    // In a real system, this would fetch actual user feedback
    // For now, return undefined to use only system-calculated rewards
    return undefined;
  }

  /**
   * Get learning status - override from BaseAgent
   */
  public override async getLearningStatus(): Promise<{
    enabled: boolean;
    totalExperiences: number;
    explorationRate: number;
    patterns: number;
  } | null> {
    // Call parent implementation to maintain consistency
    const baseStatus = await super.getLearningStatus();
    if (baseStatus) {
      return baseStatus;
    }

    // Fallback to local learning engine
    if (!this.localLearningEngine) {
      return null;
    }

    return {
      enabled: this.learningEnabled,
      totalExperiences: this.localLearningEngine.getTotalExperiences(),
      explorationRate: this.localLearningEngine.getExplorationRate(),
      patterns: (await this.localLearningEngine.getPatterns()).length
    };
  }

  /**
   * Get detailed performance report (LearningAgent-specific)
   */
  public async getDetailedLearningStatus(): Promise<{
    enabled: boolean;
    totalExperiences: number;
    patterns: number;
    improvement: any;
    activeTests: number;
  }> {
    const improvement = await this.localPerformanceTracker.calculateImprovement();

    return {
      enabled: this.learningEnabled,
      totalExperiences: this.localLearningEngine.getTotalExperiences(),
      patterns: (await this.localLearningEngine.getPatterns()).length,
      improvement,
      activeTests: this.improvementLoop.getActiveTests().length
    };
  }

  /**
   * Get performance report
   */
  public async getPerformanceReport(): Promise<any> {
    return await this.localPerformanceTracker.generateReport();
  }

  /**
   * Enable/disable learning
   */
  public setLearningEnabled(enabled: boolean): void {
    this.learningEnabled = enabled;
    this.localLearningEngine.setEnabled(enabled);
  }

  /**
   * Create A/B test for strategy comparison
   */
  public async createABTest(
    name: string,
    strategies: { name: string; config: any }[],
    sampleSize: number = 100
  ): Promise<string> {
    return await this.improvementLoop.createABTest(name, strategies, sampleSize);
  }

  // ============================================================================
  // Abstract Methods Implementation
  // ============================================================================

  protected async performTask(_task: QETask): Promise<any> {
    // Default implementation - override in subclasses
    return {
      success: true,
      result: 'Task completed',
      executionTime: Date.now()
    };
  }

  protected async loadKnowledge(): Promise<void> {
    // Load agent-specific knowledge
    // Override in subclasses
  }

  protected async cleanup(): Promise<void> {
    // Stop improvement loop
    if (this.improvementLoop) {
      await this.improvementLoop.stop();
    }
  }
}
