/**
 * BTSPLearningEngine - One-shot Learning Integration
 *
 * Integrates BTSPAdapter with the existing LearningEngine to enable
 * one-shot learning from single failures (vs 10+ examples with traditional RL).
 *
 * Key capabilities:
 * - Learn from single failure (one-shot BTSP association)
 * - BTSP pattern recall before Q-learning fallback
 * - Plateau detection for stability monitoring
 * - EWC consolidation to prevent catastrophic forgetting
 *
 * Architecture:
 * - Wraps LearningEngine for hybrid learning
 * - Uses BTSP for negative reward (failure) learning
 * - Falls back to Q-learning for positive reward learning
 * - Consolidates periodically to prevent forgetting
 *
 * @module nervous-system/integration/BTSPLearningEngine
 */

import { Logger } from '../../utils/Logger.js';
import { BTSPAdapter, BTSPAdapterConfig, RecallResult, PlateauDetectionResult } from '../adapters/BTSPAdapter.js';
import { LearningEngine, ExtendedLearningConfig } from '../../learning/LearningEngine.js';
import { SwarmMemoryManager } from '../../core/memory/SwarmMemoryManager.js';
import type {
  TaskExperience,
  TaskState,
  AgentAction,
  LearningFeedback,
  LearningOutcome,
  LearnedPattern,
  StrategyRecommendation,
} from '../../learning/types.js';

/**
 * Configuration for BTSPLearningEngine
 */
export interface BTSPLearningEngineConfig {
  /** BTSP adapter configuration */
  btsp?: Partial<BTSPAdapterConfig>;
  /** Learning engine configuration */
  learning?: Partial<ExtendedLearningConfig>;
  /** Threshold for using BTSP one-shot learning (reward below this triggers BTSP) */
  oneShotThreshold: number;
  /** Confidence threshold for trusting BTSP recall results */
  recallConfidenceThreshold: number;
  /** Consolidation interval (number of experiences before consolidation) */
  consolidationInterval: number;
  /** Enable automatic consolidation */
  autoConsolidate: boolean;
  /** Weight for BTSP recommendations vs Q-learning (0-1, higher = more BTSP influence) */
  btspWeight: number;
}

/**
 * Default configuration
 */
const DEFAULT_CONFIG: BTSPLearningEngineConfig = {
  oneShotThreshold: 0, // Reward < 0 triggers BTSP
  recallConfidenceThreshold: 0.6, // 60% confidence required to trust BTSP
  consolidationInterval: 100, // Consolidate every 100 experiences
  autoConsolidate: true,
  btspWeight: 0.7, // 70% BTSP, 30% Q-learning when both available
};

/**
 * BTSP learning outcome with additional metrics
 */
export interface BTSPLearningOutcome extends LearningOutcome {
  /** Whether BTSP one-shot learning was used */
  usedBTSP: boolean;
  /** BTSP plateau detection result */
  plateauResult?: PlateauDetectionResult;
  /** BTSP confidence for this learning event */
  btspConfidence?: number;
  /** Whether consolidation was triggered */
  consolidationTriggered: boolean;
}

/**
 * Enhanced strategy recommendation with BTSP context
 */
export interface BTSPStrategyRecommendation extends StrategyRecommendation {
  /** Source of recommendation */
  source: 'btsp' | 'q-learning' | 'hybrid' | 'default';
  /** BTSP recall confidence */
  btspConfidence?: number;
  /** Q-learning confidence */
  qLearningConfidence?: number;
  /** Whether BTSP associations were found */
  hasBTSPAssociations: boolean;
}

/**
 * Metrics for BTSPLearningEngine
 */
export interface BTSPLearningMetrics {
  /** Total experiences processed */
  totalExperiences: number;
  /** Experiences learned via BTSP one-shot */
  btspLearningCount: number;
  /** Experiences learned via Q-learning */
  qLearningCount: number;
  /** Number of consolidations performed */
  consolidationCount: number;
  /** Average BTSP recall confidence */
  avgBTSPRecallConfidence: number;
  /** Number of plateau detections */
  plateauDetectionCount: number;
  /** BTSP capacity utilization */
  btspCapacityUtilization: number;
  /** Last consolidation timestamp */
  lastConsolidation?: Date;
}

/**
 * BTSPLearningEngine - Hybrid one-shot + RL learning
 *
 * Provides bio-inspired one-shot learning for failures while maintaining
 * Q-learning for positive reinforcement. This enables learning from
 * single test failures instead of requiring 10+ examples.
 *
 * @example
 * ```typescript
 * const engine = new BTSPLearningEngine('agent-1', memoryStore, {
 *   oneShotThreshold: 0,
 *   recallConfidenceThreshold: 0.6
 * });
 * await engine.initialize();
 *
 * // Learn from execution - BTSP for failures, Q-learning for success
 * const outcome = await engine.learnFromExecution(task, result, feedback);
 *
 * // Get recommendation - checks BTSP associations first
 * const recommendation = await engine.recommendWithBTSP(state);
 * ```
 */
export class BTSPLearningEngine {
  private readonly logger: Logger;
  private readonly config: BTSPLearningEngineConfig;
  private readonly agentId: string;

  /** BTSP adapter for one-shot learning */
  private btspAdapter: BTSPAdapter;

  /** Base learning engine with Q-learning */
  private baseLearningEngine: LearningEngine;

  /** Memory store reference */
  private readonly memoryStore: SwarmMemoryManager;

  /** Initialization state */
  private initialized = false;

  /** Metrics tracking */
  private metrics: BTSPLearningMetrics;

  /** Accumulated recall confidences for averaging */
  private recallConfidences: number[] = [];

  /** Experience count since last consolidation */
  private experiencesSinceConsolidation = 0;

  constructor(
    agentId: string,
    memoryStore: SwarmMemoryManager,
    config: Partial<BTSPLearningEngineConfig> = {}
  ) {
    this.logger = Logger.getInstance();
    this.agentId = agentId;
    this.memoryStore = memoryStore;
    this.config = { ...DEFAULT_CONFIG, ...config };

    // Initialize BTSP adapter
    this.btspAdapter = new BTSPAdapter(this.config.btsp);

    // Initialize base learning engine
    this.baseLearningEngine = new LearningEngine(agentId, memoryStore, this.config.learning);

    // Initialize metrics
    this.metrics = {
      totalExperiences: 0,
      btspLearningCount: 0,
      qLearningCount: 0,
      consolidationCount: 0,
      avgBTSPRecallConfidence: 0,
      plateauDetectionCount: 0,
      btspCapacityUtilization: 0,
    };

    this.logger.info(`BTSPLearningEngine created for agent ${agentId}`, {
      config: this.config,
    });
  }

  /**
   * Initialize both BTSP adapter and base learning engine
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    try {
      // Initialize BTSP adapter (loads WASM)
      await this.btspAdapter.initialize();

      // Initialize base learning engine
      await this.baseLearningEngine.initialize();

      this.initialized = true;
      this.logger.info(`BTSPLearningEngine initialized for agent ${this.agentId}`);
    } catch (error) {
      this.logger.error('Failed to initialize BTSPLearningEngine:', error);
      throw new Error(`BTSPLearningEngine initialization failed: ${error}`);
    }
  }

  /**
   * Ensure engine is initialized
   */
  private ensureInitialized(): void {
    if (!this.initialized) {
      throw new Error('BTSPLearningEngine not initialized. Call initialize() first.');
    }
  }

  /**
   * Learn from task execution with hybrid BTSP/Q-learning
   *
   * Uses BTSP one-shot learning for failures (reward < threshold) and
   * Q-learning for positive experiences. This enables learning from
   * single failures instead of requiring many examples.
   *
   * @param task - Task that was executed
   * @param result - Execution result
   * @param feedback - Optional user/system feedback
   * @returns Learning outcome with BTSP-specific metrics
   */
  async learnFromExecution(
    task: unknown,
    result: unknown,
    feedback?: LearningFeedback
  ): Promise<BTSPLearningOutcome> {
    this.ensureInitialized();

    const startTime = Date.now();

    try {
      // First, let base engine learn (this handles Q-learning)
      const baseOutcome = await this.baseLearningEngine.learnFromExecution(task, result, feedback);

      // Extract reward from the experience (we need to calculate it)
      const taskObj = (typeof task === 'object' && task !== null ? task : {}) as Record<string, unknown>;
      const resultObj = (typeof result === 'object' && result !== null ? result : {}) as Record<string, unknown>;
      const reward = this.calculateReward(resultObj, feedback);

      let usedBTSP = false;
      let plateauResult: PlateauDetectionResult | undefined;
      let btspConfidence: number | undefined;
      let consolidationTriggered = false;

      // Check if this should trigger BTSP one-shot learning
      if (reward < this.config.oneShotThreshold) {
        // Failure case - use BTSP one-shot learning
        const pattern = this.taskToPattern(taskObj, resultObj);
        plateauResult = this.btspAdapter.detectPlateau(0, Math.abs(reward));

        if (plateauResult.detected) {
          // Significant learning signal - perform one-shot association
          this.btspAdapter.learnFromFailure(pattern, reward);
          usedBTSP = true;
          this.metrics.btspLearningCount++;
          this.metrics.plateauDetectionCount++;

          this.logger.debug('BTSP one-shot learning from failure', {
            agentId: this.agentId,
            reward,
            plateauMagnitude: plateauResult.magnitude,
          });
        }
      } else {
        // Success case - rely on Q-learning (already done by base engine)
        this.metrics.qLearningCount++;
      }

      // Update metrics
      this.metrics.totalExperiences++;
      this.experiencesSinceConsolidation++;
      this.metrics.btspCapacityUtilization = this.btspAdapter.getCapacity().utilization;

      // Auto-consolidate if enabled and interval reached
      if (
        this.config.autoConsolidate &&
        this.experiencesSinceConsolidation >= this.config.consolidationInterval
      ) {
        await this.consolidate();
        consolidationTriggered = true;
      }

      // Create enhanced outcome
      const outcome: BTSPLearningOutcome = {
        ...baseOutcome,
        usedBTSP,
        plateauResult,
        btspConfidence,
        consolidationTriggered,
      };

      this.logger.debug('Learning completed', {
        agentId: this.agentId,
        usedBTSP,
        reward,
        durationMs: Date.now() - startTime,
      });

      return outcome;
    } catch (error) {
      this.logger.error('Learning from execution failed:', error);
      // Return a minimal outcome on error
      return {
        improved: false,
        previousPerformance: 0,
        newPerformance: 0,
        improvementRate: 0,
        confidence: 0,
        patterns: [],
        timestamp: new Date(),
        usedBTSP: false,
        consolidationTriggered: false,
      };
    }
  }

  /**
   * Recommend strategy with BTSP association check first
   *
   * Checks BTSP associations for the state before falling back to
   * Q-learning. This provides faster recommendations from one-shot
   * learned patterns.
   *
   * @param state - Current task state
   * @returns Strategy recommendation with source information
   */
  async recommendWithBTSP(state: TaskState): Promise<BTSPStrategyRecommendation> {
    this.ensureInitialized();

    try {
      // Convert state to pattern for BTSP recall
      const queryPattern = this.stateToPattern(state);

      // Try BTSP recall first
      const btspResult = this.btspAdapter.recallWithConfidence(queryPattern);

      // Track recall confidence
      this.recallConfidences.push(btspResult.confidence);
      if (this.recallConfidences.length > 100) {
        this.recallConfidences.shift();
      }
      this.metrics.avgBTSPRecallConfidence = this.calculateAverageConfidence();

      // Also get Q-learning recommendation
      const qLearningRecommendation = await this.baseLearningEngine.recommendStrategy(state);

      // Determine which source to use
      const hasBTSPAssociations = btspResult.confidence >= this.config.recallConfidenceThreshold;

      if (hasBTSPAssociations && qLearningRecommendation.confidence > 0.5) {
        // Both have recommendations - hybrid approach
        const hybridConfidence =
          this.config.btspWeight * btspResult.confidence +
          (1 - this.config.btspWeight) * qLearningRecommendation.confidence;

        return {
          ...qLearningRecommendation,
          source: 'hybrid',
          confidence: hybridConfidence,
          btspConfidence: btspResult.confidence,
          qLearningConfidence: qLearningRecommendation.confidence,
          hasBTSPAssociations: true,
          reasoning: `Hybrid recommendation (BTSP: ${(btspResult.confidence * 100).toFixed(1)}%, Q-learning: ${(qLearningRecommendation.confidence * 100).toFixed(1)}%)`,
        };
      } else if (hasBTSPAssociations) {
        // BTSP has strong association - use it
        const strategy = this.patternToStrategy(btspResult.pattern);

        return {
          strategy: strategy.name,
          confidence: btspResult.confidence,
          expectedImprovement: strategy.expectedImprovement,
          reasoning: `BTSP one-shot learned pattern (${(btspResult.confidence * 100).toFixed(1)}% confidence)`,
          alternatives: qLearningRecommendation.alternatives,
          source: 'btsp',
          btspConfidence: btspResult.confidence,
          qLearningConfidence: qLearningRecommendation.confidence,
          hasBTSPAssociations: true,
        };
      } else if (qLearningRecommendation.confidence > 0.5) {
        // Q-learning has recommendation
        return {
          ...qLearningRecommendation,
          source: 'q-learning',
          btspConfidence: btspResult.confidence,
          qLearningConfidence: qLearningRecommendation.confidence,
          hasBTSPAssociations: false,
        };
      } else {
        // No strong recommendation from either - return default
        return {
          strategy: 'default',
          confidence: 0.5,
          expectedImprovement: 0,
          reasoning: 'No learned associations available yet',
          alternatives: [],
          source: 'default',
          btspConfidence: btspResult.confidence,
          qLearningConfidence: qLearningRecommendation.confidence,
          hasBTSPAssociations: false,
        };
      }
    } catch (error) {
      this.logger.error('Recommendation failed:', error);
      return {
        strategy: 'default',
        confidence: 0.5,
        expectedImprovement: 0,
        reasoning: 'Error during recommendation, using default',
        alternatives: [],
        source: 'default',
        hasBTSPAssociations: false,
      };
    }
  }

  /**
   * Get patterns from both BTSP and Q-learning
   *
   * Combines BTSP-learned associations with patterns from the base
   * learning engine for a complete view of learned knowledge.
   */
  async getPatterns(): Promise<LearnedPattern[]> {
    this.ensureInitialized();

    try {
      // Get patterns from base learning engine
      const basePatterns = await this.baseLearningEngine.getPatterns();

      // Add BTSP capacity info to patterns metadata
      const btspCapacity = this.btspAdapter.getCapacity();

      // Annotate patterns with source info
      const annotatedPatterns = basePatterns.map(pattern => ({
        ...pattern,
        // Mark patterns that might also have BTSP associations
        contexts: [...pattern.contexts, `btsp_capacity_${Math.round(btspCapacity.utilization * 100)}%`],
      }));

      return annotatedPatterns;
    } catch (error) {
      this.logger.warn('Failed to get patterns:', error);
      return [];
    }
  }

  /**
   * Perform EWC consolidation to prevent catastrophic forgetting
   *
   * This should be called periodically (automatically if autoConsolidate is enabled)
   * to preserve important synaptic weights.
   */
  async consolidate(): Promise<void> {
    this.ensureInitialized();

    try {
      await this.btspAdapter.consolidate();

      this.metrics.consolidationCount++;
      this.metrics.lastConsolidation = new Date();
      this.experiencesSinceConsolidation = 0;

      this.logger.info('BTSP consolidation completed', {
        agentId: this.agentId,
        consolidationCount: this.metrics.consolidationCount,
      });
    } catch (error) {
      this.logger.error('Consolidation failed:', error);
      throw error;
    }
  }

  /**
   * Check if BTSP learning has reached a plateau (stable state)
   *
   * Returns true if recent learning signals have stabilized, indicating
   * the model has converged on important associations.
   */
  isPlateauReached(): boolean {
    this.ensureInitialized();

    // Check recent plateau detections - if most recent experiences
    // didn't trigger plateaus, we're stable
    const recentStability = this.metrics.totalExperiences > 10 &&
      this.metrics.plateauDetectionCount / this.metrics.totalExperiences < 0.1;

    // Also check capacity utilization - high utilization suggests saturation
    const capacityStable = this.btspAdapter.getCapacity().utilization > 0.5;

    return recentStability || capacityStable;
  }

  /**
   * Get comprehensive metrics for the BTSP learning engine
   */
  getMetrics(): BTSPLearningMetrics {
    // Update real-time metrics
    this.metrics.btspCapacityUtilization = this.btspAdapter.isInitialized()
      ? this.btspAdapter.getCapacity().utilization
      : 0;
    this.metrics.avgBTSPRecallConfidence = this.calculateAverageConfidence();

    return { ...this.metrics };
  }

  /**
   * Get BTSP adapter statistics
   */
  getBTSPStats(): ReturnType<BTSPAdapter['getStats']> | null {
    if (!this.btspAdapter.isInitialized()) {
      return null;
    }
    return this.btspAdapter.getStats();
  }

  /**
   * Get BTSP adapter for direct access (for serialization/persistence)
   */
  getBTSPAdapter(): BTSPAdapter {
    return this.btspAdapter;
  }

  /**
   * Get base learning engine statistics
   */
  getBaseLearningStats() {
    return {
      algorithm: this.baseLearningEngine.getAlgorithm(),
      algorithmStats: this.baseLearningEngine.getAlgorithmStats(),
      totalExperiences: this.baseLearningEngine.getTotalExperiences(),
      explorationRate: this.baseLearningEngine.getExplorationRate(),
      qLearningStats: this.baseLearningEngine.getQLearningStats(),
    };
  }

  /**
   * Check if the engine is initialized
   */
  isInitialized(): boolean {
    return this.initialized;
  }

  /**
   * Reset BTSP adapter (clears one-shot associations)
   */
  resetBTSP(): void {
    this.ensureInitialized();
    this.btspAdapter.reset();
    this.metrics.btspLearningCount = 0;
    this.metrics.plateauDetectionCount = 0;
    this.metrics.btspCapacityUtilization = 0;
    this.recallConfidences = [];

    this.logger.info(`BTSP reset for agent ${this.agentId}`);
  }

  /**
   * Dispose of resources
   */
  dispose(): void {
    if (this.btspAdapter.isInitialized()) {
      this.btspAdapter.dispose();
    }
    this.baseLearningEngine.dispose();
    this.initialized = false;

    this.logger.debug(`BTSPLearningEngine disposed for agent ${this.agentId}`);
  }

  // ============================================================================
  // Private Helper Methods
  // ============================================================================

  /**
   * Calculate reward from execution result and feedback
   */
  private calculateReward(result: Record<string, unknown>, feedback?: LearningFeedback): number {
    let reward = 0;

    // Success/failure (primary component)
    reward += result.success ? 1.0 : -1.0;

    // Execution time (faster is better)
    const executionTime = result.executionTime as number | undefined;
    if (executionTime) {
      const timeFactor = Math.max(0, 1 - executionTime / 30000); // 30 sec baseline
      reward += timeFactor * 0.5;
    }

    // Error rate penalty
    const errors = result.errors as unknown[] | undefined;
    if (errors) {
      reward -= errors.length * 0.1;
    }

    // User feedback
    if (feedback) {
      reward += (feedback.rating - 0.5) * 2; // -1 to +1
      reward -= feedback.issues.length * 0.2;
    }

    return Math.max(-2, Math.min(2, reward)); // clamp to [-2, 2]
  }

  /**
   * Convert task and result to a fixed-size pattern for BTSP
   */
  private taskToPattern(task: Record<string, unknown>, result: Record<string, unknown>): Float32Array {
    const inputSize = this.config.btsp?.inputSize ?? 256;
    const pattern = new Float32Array(inputSize);

    // Encode task features
    const requirements = task.requirements as Record<string, unknown> | undefined;
    const capabilities = (requirements?.capabilities as string[]) || [];

    pattern[0] = (task.complexity as number) || 0.5;
    pattern[1] = Math.min(1.0, capabilities.length / 10);
    pattern[2] = ((task.previousAttempts as number) || 0) / 5;
    pattern[3] = task.timeout ? Math.min(1.0, (task.timeout as number) / 300000) : 1.0;

    // Encode result features
    pattern[4] = result.success ? 1.0 : 0.0;
    pattern[5] = Math.min(1.0, ((result.executionTime as number) || 0) / 30000);
    pattern[6] = Math.min(1.0, ((result.errors as unknown[])?.length || 0) / 5);

    // Hash capabilities into pattern indices
    for (const cap of capabilities) {
      const hash = this.simpleHash(cap) % (inputSize - 10);
      pattern[10 + hash] = 1.0;
    }

    // Hash strategy into pattern
    const strategy = result.strategy as string | undefined;
    if (strategy) {
      const hash = this.simpleHash(strategy) % (inputSize - 10);
      pattern[10 + hash] = Math.min(1.0, pattern[10 + hash] + 0.5);
    }

    return pattern;
  }

  /**
   * Convert task state to pattern for BTSP recall
   */
  private stateToPattern(state: TaskState): Float32Array {
    const inputSize = this.config.btsp?.inputSize ?? 256;
    const pattern = new Float32Array(inputSize);

    // Encode state features
    pattern[0] = state.taskComplexity;
    pattern[1] = Math.min(1.0, state.requiredCapabilities.length / 10);
    pattern[2] = state.previousAttempts / 5;
    pattern[3] = state.availableResources;
    pattern[4] = state.timeConstraint ? Math.min(1.0, state.timeConstraint / 300000) : 1.0;

    // Hash capabilities into pattern
    for (const cap of state.requiredCapabilities) {
      const hash = this.simpleHash(cap) % (inputSize - 10);
      pattern[10 + hash] = 1.0;
    }

    // Hash context features
    for (const [key, value] of Object.entries(state.contextFeatures)) {
      const hash = this.simpleHash(key) % (inputSize - 10);
      const numValue = typeof value === 'number' ? value : (value ? 1.0 : 0.0);
      pattern[10 + hash] = Math.min(1.0, pattern[10 + hash] + numValue * 0.3);
    }

    return pattern;
  }

  /**
   * Convert BTSP pattern to strategy recommendation
   */
  private patternToStrategy(pattern: Float32Array): { name: string; expectedImprovement: number } {
    // Find the most active region in the pattern to infer strategy
    let maxActivation = 0;
    let maxIndex = 0;

    for (let i = 10; i < pattern.length; i++) {
      if (pattern[i] > maxActivation) {
        maxActivation = pattern[i];
        maxIndex = i;
      }
    }

    // Map pattern features to strategy names
    const strategies = [
      'parallel-execution',
      'sequential-execution',
      'retry-with-backoff',
      'resource-scaling',
      'timeout-adjustment',
      'capability-routing',
    ];

    const strategyIndex = maxIndex % strategies.length;
    const expectedImprovement = maxActivation * 20; // Scale to percentage

    return {
      name: strategies[strategyIndex],
      expectedImprovement,
    };
  }

  /**
   * Calculate average recall confidence
   */
  private calculateAverageConfidence(): number {
    if (this.recallConfidences.length === 0) {
      return 0;
    }
    const sum = this.recallConfidences.reduce((a, b) => a + b, 0);
    return sum / this.recallConfidences.length;
  }

  /**
   * Simple hash function for string to number
   */
  private simpleHash(str: string): number {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash);
  }
}

/**
 * Factory function to create a pre-configured BTSPLearningEngine
 */
export function createBTSPLearningEngine(
  agentId: string,
  memoryStore: SwarmMemoryManager,
  config: Partial<BTSPLearningEngineConfig> = {}
): BTSPLearningEngine {
  return new BTSPLearningEngine(agentId, memoryStore, {
    oneShotThreshold: 0,
    recallConfidenceThreshold: 0.6,
    consolidationInterval: 100,
    autoConsolidate: true,
    btspWeight: 0.7,
    ...config,
  });
}

/**
 * Default export
 */
export default BTSPLearningEngine;
