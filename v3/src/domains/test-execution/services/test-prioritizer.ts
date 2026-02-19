/**
 * Agentic QE v3 - Test Prioritizer Service
 *
 * Uses Decision Transformer RL algorithm for intelligent test case prioritization.
 * Learns from historical execution data to order tests for optimal feedback speed.
 */

import { Result, ok, err, type DomainName } from '../../../shared/types';
import { MemoryBackend } from '../../../kernel/interfaces';
import type {
  RLState,
  RLAction,
  RLExperience,
} from '../../../integrations/rl-suite/interfaces';
import { DecisionTransformerAlgorithm } from '../../../integrations/rl-suite/algorithms/decision-transformer';
import { toError } from '../../../shared/error-utils.js';
import {
  createTestPrioritizationState,
  mapToFeatures,
  featuresToArray,
  type TestPrioritizationState,
  type TestPrioritizationAction,
  type TestPrioritizationContext,
  type TestPrioritizationReward,
  calculatePrioritizationReward,
  type TestExecutionHistory,
  priorityToScore,
  priorityActionToPriority,
  type PriorityAction,
} from '../test-prioritization-types';

// Re-export types for convenience
export type { TestPrioritizationContext, TestPrioritizationAction };

// ============================================================================
// Types
// ============================================================================

export interface TestMetadata {
  testId: string;
  filePath: string;
  testName: string;
  testType?: 'unit' | 'integration' | 'e2e' | 'performance' | 'security';
  priority?: 'p0' | 'p1' | 'p2' | 'p3';
  complexity?: number;
  domain?: DomainName;
  dependencies?: string[];
  estimatedDuration?: number;
  coverage?: number;
  failureHistory?: number[];
  flakinessScore?: number;
  executionCount?: number;
  timeSinceModification?: number;
  businessCriticality?: number;
  dependencyCount?: number;
}

export interface PrioritizedTest {
  testId: string;
  filePath: string;
  testName: string;
  priority: PriorityAction;
  score: number;
  confidence: number;
  reasoning: string;
}

export interface PrioritizationResult {
  /** Ordered list of tests */
  tests: PrioritizedTest[];
  /** Total priority score */
  totalScore: number;
  /** Average confidence */
  averageConfidence: number;
  /** Method used */
  method: 'dt-prediction' | 'heuristic' | 'hybrid';
  /** Learning status */
  learningStatus: {
    trained: boolean;
    trajectoryCount: number;
    averageReturn: number;
  };
}

// ============================================================================
// Configuration
// ============================================================================

export interface TestPrioritizerConfig {
  /** Enable Decision Transformer for prioritization */
  enableDT: boolean;
  /** Minimum number of trajectories before using DT */
  minTrajectoriesForDT: number;
  /** Fallback to heuristic when DT confidence is low */
  enableHeuristicFallback: boolean;
  /** Minimum confidence threshold for DT predictions */
  minConfidence: number;
  /** Enable automatic training from execution results */
  enableAutoTraining: boolean;
  /** Training interval (number of executions) */
  trainingInterval: number;
  /** Context window size for DT */
  contextLength: number;
  /** Embedding dimension */
  embeddingDim: number;
}

const DEFAULT_CONFIG: TestPrioritizerConfig = {
  enableDT: true,
  minTrajectoriesForDT: 5,
  enableHeuristicFallback: true,
  minConfidence: 0.4,
  enableAutoTraining: true,
  trainingInterval: 10,
  contextLength: 10,
  embeddingDim: 768,
};

// ============================================================================
// Test Prioritizer Service
// ============================================================================

export class TestPrioritizerService {
  private readonly decisionTransformer: DecisionTransformerAlgorithm;
  private readonly config: TestPrioritizerConfig;
  private executionHistory = new Map<string, TestExecutionHistory[]>();
  private executionsSinceLastTraining = 0;

  constructor(
    private readonly memory: MemoryBackend,
    config: Partial<TestPrioritizerConfig> = {}
  ) {
    this.config = { ...DEFAULT_CONFIG, ...config };

    // Initialize Decision Transformer with test execution reward signals
    this.decisionTransformer = new DecisionTransformerAlgorithm({
      contextLength: this.config.contextLength,
      embeddingDim: this.config.embeddingDim,
    });
  }

  // ========================================================================
  // Public API
  // ========================================================================

  /**
   * Initialize the prioritizer
   */
  async initialize(): Promise<void> {
    // Load training history from memory
    await this.loadHistory();

    // Load trained model if available
    await this.loadModel();
  }

  /**
   * Prioritize tests for execution using DT predictions
   */
  async prioritize(
    tests: TestMetadata[],
    context: TestPrioritizationContext
  ): Promise<Result<PrioritizationResult, Error>> {
    try {
      // Create RL states from test metadata
      const states = tests.map(test => createTestPrioritizationState(
        test.testId,
        test
      ));

      // Get DT predictions for each test
      const predictions = await Promise.all(
        states.map(state => this.getPrediction(state))
      );

      // Combine tests with predictions
      const prioritizedTests: PrioritizedTest[] = tests.map((test, i) => {
        const prediction = predictions[i];
        const priorityAction = (prediction.action.value as PriorityAction) ?? 'standard';

        return {
          testId: test.testId,
          filePath: test.filePath,
          testName: test.testName,
          priority: priorityAction,
          score: priorityToScore(priorityAction),
          confidence: prediction.confidence,
          reasoning: prediction.reasoning ?? 'No reasoning provided',
        };
      });

      // Sort by priority score (highest first)
      prioritizedTests.sort((a, b) => b.score - a.score);

      // Get DT learning status
      const dtInfo = this.decisionTransformer.getInfo();
      const learningStatus = {
        trained: dtInfo.stats.episode > 0,
        trajectoryCount: this.countTrajectories(),
        averageReturn: dtInfo.stats.averageReward,
      };

      // Determine method used
      const method = learningStatus.trained && learningStatus.trajectoryCount >= this.config.minTrajectoriesForDT
        ? 'dt-prediction'
        : this.config.enableHeuristicFallback
        ? 'heuristic'
        : 'dt-prediction';

      const totalScore = prioritizedTests.reduce((sum, t) => sum + t.score, 0);
      const averageConfidence = prioritizedTests.reduce((sum, t) => sum + t.confidence, 0) / prioritizedTests.length;

      return ok({
        tests: prioritizedTests,
        totalScore,
        averageConfidence,
        method,
        learningStatus,
      });
    } catch (error) {
      return err(toError(error));
    }
  }

  /**
   * Record execution result for learning
   */
  async recordExecution(
    testId: string,
    result: {
      passed: boolean;
      duration: number;
      priority: PriorityAction;
      failedEarly?: boolean;
      coverageImproved?: boolean;
      flakyDetected?: boolean;
    },
    context: TestPrioritizationContext
  ): Promise<void> {
    // Store in history
    const history: TestExecutionHistory = {
      testId,
      timestamp: new Date(),
      passed: result.passed,
      duration: result.duration,
      priority: priorityActionToPriority(result.priority),
      failureReason: result.passed ? undefined : 'Test failed',
    };

    const testHistory = this.executionHistory.get(testId) ?? [];
    testHistory.push(history);

    // Keep only last 100 executions per test
    if (testHistory.length > 100) {
      testHistory.shift();
    }

    this.executionHistory.set(testId, testHistory);

    // Persist to memory
    await this.persistHistory();

    // Create RL experience for training
    const experience = this.createExperience(testId, result, context);

    // Train Decision Transformer
    await this.decisionTransformer.train(experience);

    this.executionsSinceLastTraining++;

    // Trigger batch training if interval reached
    if (this.config.enableAutoTraining &&
        this.executionsSinceLastTraining >= this.config.trainingInterval) {
      await this.trainBatch();
      this.executionsSinceLastTraining = 0;
    }
  }

  /**
   * Get prioritization statistics
   */
  getStats(): {
    totalTests: number;
    totalExecutions: number;
    trajectoryCount: number;
    dtStats: Record<string, unknown>;
  } {
    const totalTests = this.executionHistory.size;
    const totalExecutions = Array.from(this.executionHistory.values())
      .reduce((sum, history) => sum + history.length, 0);

    return {
      totalTests,
      totalExecutions,
      trajectoryCount: this.countTrajectories(),
      dtStats: this.decisionTransformer.getStats() as unknown as Record<string, unknown>,
    };
  }

  /**
   * Export trained model
   */
  async exportModel(): Promise<Record<string, unknown>> {
    return this.decisionTransformer.exportModel();
  }

  /**
   * Import trained model
   */
  async importModel(model: Record<string, unknown>): Promise<void> {
    await this.decisionTransformer.importModel(model);
  }

  // ========================================================================
  // Private Methods
  // ========================================================================

  /**
   * Get DT prediction for a test state
   */
  private async getPrediction(state: TestPrioritizationState): Promise<{
    action: RLAction;
    confidence: number;
    reasoning?: string;
  }> {
    try {
      const prediction = await this.decisionTransformer.predict(state);

      // Check if we should use heuristic fallback
      if (this.config.enableHeuristicFallback &&
          prediction.confidence < this.config.minConfidence) {
        return this.getHeuristicPrediction(state);
      }

      return {
        action: prediction.action,
        confidence: prediction.confidence,
        reasoning: prediction.reasoning,
      };
    } catch (error) {
      // Fall back to heuristic on error
      return this.getHeuristicPrediction(state);
    }
  }

  /**
   * Get heuristic-based prediction (fallback)
   */
  private getHeuristicPrediction(state: TestPrioritizationState): {
    action: RLAction;
    confidence: number;
    reasoning: string;
  } {
    const features = mapToFeatures(state);

    // Calculate heuristic priority score
    let score = 0;

    // High failure probability -> high priority
    score += features.failureProbability * 30;

    // High flakiness -> moderate priority (catch early)
    score += features.flakiness * 15;

    // High complexity -> moderate priority
    score += features.complexity * 10;

    // High coverage gap -> high priority
    score += features.coverageGap * 20;

    // High criticality -> high priority
    score += features.criticality * 15;

    // Fast tests get slight boost (run early for quick feedback)
    score += features.speed * 5;

    // New tests get priority boost
    score += features.age * 5;

    // Map score to priority action
    let priority: PriorityAction;
    if (score > 60) {
      priority = 'critical';
    } else if (score > 45) {
      priority = 'high';
    } else if (score > 30) {
      priority = 'standard';
    } else if (score > 15) {
      priority = 'low';
    } else {
      priority = 'defer';
    }

    return {
      action: {
        type: 'prioritize',
        value: priority,
      },
      confidence: 0.6,
      reasoning: `Heuristic: score ${score.toFixed(1)} (failure: ${features.failureProbability.toFixed(2)}, ` +
        `flaky: ${features.flakiness.toFixed(2)}, coverage gap: ${features.coverageGap.toFixed(2)})`,
    };
  }

  /**
   * Create RL experience from execution result
   */
  private createExperience(
    testId: string,
    result: {
      passed: boolean;
      duration: number;
      priority: PriorityAction;
      failedEarly?: boolean;
      coverageImproved?: boolean;
      flakyDetected?: boolean;
    },
    context: TestPrioritizationContext
  ): RLExperience {
    // Get current state
    const history = this.executionHistory.get(testId) ?? [];
    const latestHistory = history[history.length - 1];

    const state = createTestPrioritizationState(testId, {
      filePath: '', // Will be filled from context if needed
      testName: testId,
      failureHistory: history.map(h => h.passed ? 1 : 0),
      executionCount: history.length,
      flakinessScore: this.calculateFlakinessScore(history),
      estimatedDuration: result.duration,
    });

    // Action that was taken
    const action: RLAction = {
      type: 'prioritize',
      value: result.priority,
    };

    // Calculate reward
    const reward = calculatePrioritizationReward(context, {
      failedEarly: result.failedEarly ?? !result.passed,
      executionTime: result.duration,
      coverageImproved: result.coverageImproved ?? false,
      flakyDetected: result.flakyDetected ?? false,
    });

    // Next state (same as current for single-step decisions)
    const nextState: RLState = { ...state };

    return {
      state,
      action,
      reward: reward.total,
      nextState,
      done: true,
      timestamp: new Date(),
    };
  }

  /**
   * Calculate flakiness score from execution history
   */
  private calculateFlakinessScore(history: TestExecutionHistory[]): number {
    if (history.length < 3) return 0;

    const recentHistory = history.slice(-10);
    const failures = recentHistory.filter(h => !h.passed).length;

    // Flakiness is high if tests alternate between pass/fail
    let alternations = 0;
    for (let i = 1; i < recentHistory.length; i++) {
      if (recentHistory[i].passed !== recentHistory[i - 1].passed) {
        alternations++;
      }
    }

    const failureRate = failures / recentHistory.length;
    const alternationRate = alternations / Math.max(1, recentHistory.length - 1);

    return (failureRate * 0.5 + alternationRate * 0.5);
  }

  /**
   * Train DT on batch of experiences
   */
  private async trainBatch(): Promise<void> {
    const experiences: RLExperience[] = [];

    for (const [testId, history] of this.executionHistory.entries()) {
      for (const execution of history) {
        const context: TestPrioritizationContext = {
          runId: `historical-${testId}-${execution.timestamp.getTime()}`,
          totalTests: 1,
          availableTime: 60000,
          workers: 1,
          mode: 'sequential',
          phase: 'regression',
        };

        const experience = this.createExperience(testId, {
          passed: execution.passed,
          duration: execution.duration,
          priority: this.priorityFromEnum(execution.priority),
          failedEarly: !execution.passed,
        }, context);

        experiences.push(experience);
      }
    }

    if (experiences.length > 0) {
      await this.decisionTransformer.trainBatch(experiences);
      await this.saveModel();
    }
  }

  /**
   * Convert Priority enum to PriorityAction
   */
  private priorityFromEnum(priority: string): PriorityAction {
    const mapping: Record<string, PriorityAction> = {
      'p0': 'critical',
      'p1': 'high',
      'p2': 'standard',
      'p3': 'low',
      'p4': 'defer',
    };
    return mapping[priority] ?? 'standard';
  }

  /**
   * Count total trajectories in DT
   */
  private countTrajectories(): number {
    const stats = this.decisionTransformer.getStats();
    return stats.episode;
  }

  /**
   * Load history from memory
   */
  private async loadHistory(): Promise<void> {
    try {
      const stored = await this.memory.get<Record<string, TestExecutionHistory[]>>(
        'test-prioritizer:history'
      );

      if (stored) {
        this.executionHistory = new Map(Object.entries(stored));
      }
    } catch {
      // No history found, start fresh
    }
  }

  /**
   * Persist history to memory
   */
  private async persistHistory(): Promise<void> {
    const obj = Object.fromEntries(this.executionHistory);
    await this.memory.set('test-prioritizer:history', obj, {
      namespace: 'test-execution',
      persist: true,
    });
  }

  /**
   * Load trained model from memory
   */
  private async loadModel(): Promise<void> {
    try {
      const stored = await this.memory.get<Record<string, unknown>>(
        'test-prioritizer:model'
      );

      if (stored) {
        await this.decisionTransformer.importModel(stored);
      }
    } catch {
      // No model found, start fresh
    }
  }

  /**
   * Save trained model to memory
   */
  private async saveModel(): Promise<void> {
    const model = await this.decisionTransformer.exportModel();
    await this.memory.set('test-prioritizer:model', model, {
      namespace: 'test-execution',
      persist: true,
    });
  }
}
