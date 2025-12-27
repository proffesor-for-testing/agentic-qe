/**
 * LearningEngineAdapter - Adapts LearningEngine to AgentLearningStrategy
 *
 * Provides backward compatibility during the B1.2 migration.
 * Wraps the existing LearningEngine to implement the strategy interface.
 *
 * @module agents/adapters/LearningEngineAdapter
 * @version 1.0.0
 */

import type {
  AgentLearningStrategy,
  LearnedPattern,
  PatternQuery,
  StrategyRecommendation,
  ExecutionEvent,
  TrainingResult,
  LearningStatus,
  LearningMetrics,
} from '../../core/strategies';
import type { LearningEngine } from '../../learning/LearningEngine';
import type {
  LearnedPattern as LearningEnginePattern,
  TaskState,
} from '../../learning/types';

/**
 * Interface for patterns stored in the memory store
 */
interface StoredPattern {
  id: string;
  name?: string;
  type?: string;
  confidence: number;
  data?: unknown;
  metadata?: Record<string, unknown>;
}

/**
 * Adapts LearningEngine to AgentLearningStrategy interface
 */
export class LearningEngineAdapter implements AgentLearningStrategy {
  private readonly engine: LearningEngine;
  private initialized = false;
  private executionHistory: ExecutionEvent[] = [];
  private recommendationsGiven = 0;
  private recommendationSuccesses = 0;

  constructor(engine: LearningEngine) {
    this.engine = engine;
  }

  // === Pattern Management ===

  async storePattern(pattern: LearnedPattern): Promise<void> {
    // LearningEngine stores patterns internally via updatePatterns()
    // which is called during learnFromExecution()
    // For direct pattern storage, we use the memoryStore if available
    const memoryStore = (this.engine as any).memoryStore;
    if (memoryStore && typeof memoryStore.storePattern === 'function') {
      await memoryStore.storePattern({
        id: pattern.id,
        pattern: `${pattern.type}:${pattern.domain}`,
        confidence: pattern.confidence,
        usageCount: pattern.usageCount,
        metadata: {
          content: pattern.content,
          success_rate: pattern.successRate,
          embedding: pattern.embedding,
          created_at: pattern.createdAt,
          updated_at: pattern.updatedAt,
          ...pattern.metadata,
        },
      });
    }
  }

  async getPatterns(query: PatternQuery): Promise<LearnedPattern[]> {
    const enginePatterns = await this.engine.getPatterns();

    // Filter by query criteria
    let filtered = enginePatterns;

    if (query.minConfidence !== undefined) {
      filtered = filtered.filter(p => p.confidence >= query.minConfidence!);
    }

    if (query.limit !== undefined) {
      filtered = filtered.slice(0, query.limit);
    }

    // Convert to strategy format
    return filtered.map(p => this.convertPattern(p));
  }

  async findSimilarPatterns(embedding: number[], limit = 10): Promise<LearnedPattern[]> {
    // LearningEngine doesn't natively support vector similarity
    // Return patterns sorted by confidence as fallback
    const patterns = await this.engine.getPatterns();
    const sorted = patterns.sort((a, b) => b.confidence - a.confidence);
    return sorted.slice(0, limit).map(p => this.convertPattern(p));
  }

  async updatePatternConfidence(patternId: string, success: boolean): Promise<void> {
    // Pattern confidence is updated automatically during learnFromExecution
    // For direct updates, we need to update via memoryStore
    const memoryStore = (this.engine as any).memoryStore;
    if (memoryStore && typeof memoryStore.queryPatternsByAgent === 'function') {
      const agentId = (this.engine as any).agentId;
      const patterns = await memoryStore.queryPatternsByAgent(agentId, 0);
      const pattern = patterns.find((p: StoredPattern) => p.id === patternId);

      if (pattern) {
        const newConfidence = success
          ? Math.min(0.99, pattern.confidence + 0.01)
          : Math.max(0.01, pattern.confidence - 0.02);

        await memoryStore.storePattern({
          ...pattern,
          confidence: newConfidence,
        });
      }
    }
  }

  // === Strategy Recommendation ===

  async recommendStrategy(taskState: unknown): Promise<StrategyRecommendation | null> {
    // Convert taskState to TaskState format
    const state = this.convertToTaskState(taskState);

    const engineRec = await this.engine.recommendStrategy(state);

    if (!engineRec || engineRec.confidence < 0.1) {
      return null;
    }

    this.recommendationsGiven++;

    return {
      strategy: engineRec.strategy,
      confidence: engineRec.confidence,
      reasoning: engineRec.reasoning,
      alternatives: engineRec.alternatives,
      metadata: {
        expectedImprovement: engineRec.expectedImprovement,
      },
    };
  }

  async recordRecommendationOutcome(
    recommendation: StrategyRecommendation,
    success: boolean
  ): Promise<void> {
    if (success) {
      this.recommendationSuccesses++;
    }
  }

  // === Execution Recording ===

  async recordExecution(event: ExecutionEvent): Promise<void> {
    // Store in history
    this.executionHistory.push(event);

    // Keep history bounded
    if (this.executionHistory.length > 1000) {
      this.executionHistory = this.executionHistory.slice(-1000);
    }

    // Convert to TaskResult format for LearningEngine
    const taskResult = {
      success: event.success,
      executionTime: event.duration,
      errors: event.error ? [event.error.message] : undefined,
      strategy: 'default',
      ...((event.result as Record<string, unknown>) || {}),
    };

    // Learn from the execution
    await this.engine.learnFromExecution(event.task, taskResult);
  }

  async getExecutionHistory(limit = 100): Promise<ExecutionEvent[]> {
    return this.executionHistory.slice(-limit);
  }

  // === Training ===

  async train(iterations = 10): Promise<TrainingResult> {
    const startTime = Date.now();

    // LearningEngine trains incrementally during learnFromExecution
    // For explicit training, we trigger batch updates
    const engineAny = this.engine as any;

    // Perform batch updates if experiences exist
    if (engineAny.experiences && engineAny.experiences.length > 0) {
      for (let i = 0; i < iterations; i++) {
        await engineAny.performBatchUpdate?.();
      }
    }

    const patterns = await this.engine.getPatterns();
    const duration = Date.now() - startTime;

    // Calculate improvement from recent experiences
    const improvement = this.calculateImprovement();

    return {
      iterations,
      improvement,
      patternsLearned: patterns.length,
      duration,
      metrics: {
        accuracy: this.recommendationsGiven > 0
          ? this.recommendationSuccesses / this.recommendationsGiven
          : 0,
        loss: 1 - improvement,
        recall: patterns.length > 0 ? Math.min(1, patterns.length / 100) : 0,
      },
    };
  }

  async exportPatterns(): Promise<LearnedPattern[]> {
    const patterns = await this.engine.getPatterns();
    return patterns.map(p => this.convertPattern(p));
  }

  async importPatterns(patterns: LearnedPattern[]): Promise<number> {
    let imported = 0;

    for (const pattern of patterns) {
      try {
        await this.storePattern(pattern);
        imported++;
      } catch {
        // Skip failed imports
      }
    }

    return imported;
  }

  // === Lifecycle ===

  async initialize(): Promise<void> {
    await this.engine.initialize();
    this.initialized = true;
  }

  getStatus(): LearningStatus {
    const stats = this.engine.getAlgorithmStats();

    return {
      enabled: this.engine.isEnabled(),
      initialized: this.initialized,
      patternsCount: stats.stats?.tableSize || 0,
      executionsRecorded: this.engine.getTotalExperiences(),
      accuracy: this.recommendationsGiven > 0
        ? this.recommendationSuccesses / this.recommendationsGiven
        : 0,
      modelVersion: stats.algorithm,
    };
  }

  async getMetrics(): Promise<LearningMetrics> {
    const patterns = await this.engine.getPatterns();
    const successfulExecutions = this.executionHistory.filter(e => e.success).length;

    return {
      totalExecutions: this.executionHistory.length,
      successfulExecutions,
      failedExecutions: this.executionHistory.length - successfulExecutions,
      patternsStored: patterns.length,
      recommendationsGiven: this.recommendationsGiven,
      recommendationAccuracy: this.recommendationsGiven > 0
        ? this.recommendationSuccesses / this.recommendationsGiven
        : 0,
      averageConfidence: patterns.length > 0
        ? patterns.reduce((sum, p) => sum + p.confidence, 0) / patterns.length
        : 0,
      trainingIterations: this.engine.getTotalExperiences(),
      lastActivity: new Date(),
    };
  }

  async reset(): Promise<void> {
    this.executionHistory = [];
    this.recommendationsGiven = 0;
    this.recommendationSuccesses = 0;
    // Note: LearningEngine doesn't have a public reset method
    // Full reset would require reinitializing the engine
  }

  // === Private Helpers ===

  private convertPattern(p: LearningEnginePattern): LearnedPattern {
    const parts = p.pattern.split(':');
    return {
      id: p.id,
      type: parts[0] || 'unknown',
      domain: parts[1] || 'default',
      content: p.pattern,
      confidence: p.confidence,
      usageCount: p.usageCount,
      successRate: p.successRate,
      createdAt: p.createdAt,
      updatedAt: p.lastUsedAt,
    };
  }

  private convertToTaskState(taskState: unknown): TaskState {
    if (typeof taskState !== 'object' || taskState === null) {
      return {
        taskComplexity: 0.5,
        requiredCapabilities: [],
        contextFeatures: {},
        previousAttempts: 0,
        availableResources: 1,
      };
    }

    const state = taskState as Record<string, unknown>;
    return {
      taskComplexity: (state.complexity as number) || 0.5,
      requiredCapabilities: (state.capabilities as string[]) || [],
      contextFeatures: (state.context as Record<string, unknown>) || {},
      previousAttempts: (state.attempts as number) || 0,
      availableResources: (state.resources as number) || 1,
      timeConstraint: state.timeout as number | undefined,
    };
  }

  private calculateImprovement(): number {
    if (this.executionHistory.length < 10) {
      return 0;
    }

    const recent = this.executionHistory.slice(-20);
    const baseline = this.executionHistory.slice(0, 20);

    const recentSuccess = recent.filter(e => e.success).length / recent.length;
    const baselineSuccess = baseline.filter(e => e.success).length / baseline.length;

    return baselineSuccess > 0
      ? (recentSuccess - baselineSuccess) / baselineSuccess
      : recentSuccess > 0 ? 1 : 0;
  }
}

/**
 * Create a learning strategy adapter from an existing engine
 */
export function createLearningAdapter(engine: LearningEngine): AgentLearningStrategy {
  return new LearningEngineAdapter(engine);
}
