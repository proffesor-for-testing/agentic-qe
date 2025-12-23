/**
 * AgentLearningStrategy - Strategy interface for agent learning and adaptation
 *
 * Handles pattern learning, strategy recommendation, and performance tracking.
 * Integrates with LearningEngine and PerformanceTracker.
 * Part of Phase 2 (B1.3c) layered architecture refactoring.
 *
 * @module core/strategies/AgentLearningStrategy
 * @version 1.0.0
 */

import type { QETask } from '../../types';

/**
 * Learned pattern from experience
 */
export interface LearnedPattern {
  id: string;
  type: string;
  domain: string;
  embedding?: number[];
  content: string;
  confidence: number;
  usageCount: number;
  successRate: number;
  createdAt: Date;
  updatedAt: Date;
  metadata?: Record<string, unknown>;
}

/**
 * Pattern query options
 */
export interface PatternQuery {
  /** Filter by pattern type */
  type?: string;
  /** Filter by domain */
  domain?: string;
  /** Minimum confidence threshold */
  minConfidence?: number;
  /** Maximum results */
  limit?: number;
  /** Semantic search query */
  semanticQuery?: string;
  /** Vector for similarity search */
  embedding?: number[];
}

/**
 * Strategy recommendation from learning engine
 */
export interface StrategyRecommendation {
  strategy: string;
  confidence: number;
  reasoning: string;
  alternatives?: Array<{
    strategy: string;
    confidence: number;
  }>;
  metadata?: Record<string, unknown>;
}

/**
 * Task execution event for learning
 */
export interface ExecutionEvent {
  task: QETask;
  result?: unknown;
  error?: Error;
  success: boolean;
  duration: number;
  resourceUsage?: {
    memory: number;
    cpu: number;
  };
  metadata?: Record<string, unknown>;
}

/**
 * Training result
 */
export interface TrainingResult {
  iterations: number;
  improvement: number;
  patternsLearned: number;
  duration: number;
  metrics: {
    accuracy: number;
    loss: number;
    recall: number;
  };
}

/**
 * Learning status
 */
export interface LearningStatus {
  enabled: boolean;
  initialized: boolean;
  patternsCount: number;
  executionsRecorded: number;
  lastTraining?: Date;
  accuracy: number;
  modelVersion?: string;
}

/**
 * Learning metrics
 */
export interface LearningMetrics {
  totalExecutions: number;
  successfulExecutions: number;
  failedExecutions: number;
  patternsStored: number;
  recommendationsGiven: number;
  recommendationAccuracy: number;
  averageConfidence: number;
  trainingIterations: number;
  lastActivity: Date;
}

/**
 * AgentLearningStrategy interface
 *
 * Implementations:
 * - DefaultLearningStrategy: PerformanceTracker + LearningEngine
 * - AcceleratedLearningStrategy: Binary cache for patterns
 * - DisabledLearningStrategy: No-op for benchmarks/testing
 */
export interface AgentLearningStrategy {
  // === Pattern Management ===

  /**
   * Store a learned pattern
   * @param pattern - Pattern to store
   */
  storePattern(pattern: LearnedPattern): Promise<void>;

  /**
   * Query learned patterns
   * @param query - Query options
   */
  getPatterns(query: PatternQuery): Promise<LearnedPattern[]>;

  /**
   * Find similar patterns using vector similarity
   * @param embedding - Query embedding
   * @param limit - Maximum results
   */
  findSimilarPatterns(embedding: number[], limit?: number): Promise<LearnedPattern[]>;

  /**
   * Update pattern confidence based on feedback
   * @param patternId - Pattern ID
   * @param success - Whether the pattern was successful
   */
  updatePatternConfidence(patternId: string, success: boolean): Promise<void>;

  // === Strategy Recommendation ===

  /**
   * Recommend a strategy based on task state
   * @param taskState - Current task state/context
   */
  recommendStrategy(taskState: unknown): Promise<StrategyRecommendation | null>;

  /**
   * Record whether a recommendation was successful
   * @param recommendation - The recommendation that was used
   * @param success - Whether it succeeded
   */
  recordRecommendationOutcome(
    recommendation: StrategyRecommendation,
    success: boolean
  ): Promise<void>;

  // === Execution Recording ===

  /**
   * Record a task execution for learning
   * @param event - Execution event
   */
  recordExecution(event: ExecutionEvent): Promise<void>;

  /**
   * Get execution history
   * @param limit - Maximum results
   */
  getExecutionHistory(limit?: number): Promise<ExecutionEvent[]>;

  // === Training ===

  /**
   * Train the learning model
   * @param iterations - Number of training iterations
   */
  train(iterations?: number): Promise<TrainingResult>;

  /**
   * Export learned patterns for transfer
   */
  exportPatterns(): Promise<LearnedPattern[]>;

  /**
   * Import patterns from another agent
   * @param patterns - Patterns to import
   */
  importPatterns(patterns: LearnedPattern[]): Promise<number>;

  // === Lifecycle ===

  /**
   * Initialize the learning strategy
   */
  initialize(): Promise<void>;

  /**
   * Get learning status
   */
  getStatus(): LearningStatus;

  /**
   * Get learning metrics
   */
  getMetrics(): Promise<LearningMetrics>;

  /**
   * Reset learning state (use with caution)
   */
  reset?(): Promise<void>;
}

/**
 * Factory function type for creating learning strategies
 */
export type LearningStrategyFactory = (
  config?: Record<string, unknown>
) => AgentLearningStrategy;
