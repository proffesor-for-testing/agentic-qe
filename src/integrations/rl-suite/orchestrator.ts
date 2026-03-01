/**
 * Agentic QE v3 - QE RL Suite Orchestrator
 *
 * Main orchestrator for all 9 RL algorithms in QE.
 * Provides unified interface for algorithm selection, training, and inference.
 */

import { BaseRLAlgorithm } from './base-algorithm';
import { QLearningAlgorithm } from './algorithms/q-learning';
import { DecisionTransformerAlgorithm } from './algorithms/decision-transformer';
import { SARSAAlgorithm } from './algorithms/sarsa';
import { ActorCriticAlgorithm } from './algorithms/actor-critic';
import { PolicyGradientAlgorithm } from './algorithms/policy-gradient';
import { DQNAlgorithm } from './algorithms/dqn';
import { PPOAlgorithm } from './algorithms/ppo';
import { A2CAlgorithm } from './algorithms/a2c';
import { DDPGAlgorithm } from './algorithms/ddpg';
import type {
  RLAlgorithm,
  RLAlgorithmType,
  RLState,
  RLAction,
  RLPrediction,
  RLExperience,
  RLTrainingStats,
  RLSuiteConfig,
  AlgorithmDomainMapping,
  DomainName,
  RewardSignal,
  RewardContext,
  RewardCalculation,
} from './interfaces';
import { ALGORITHM_DOMAIN_MAPPINGS } from './interfaces';
import { getRewardSignalsForDomain, calculateReward } from './reward-signals';

// ============================================================================
// Suite Statistics
// ============================================================================

export interface RLSuiteStats {
  totalPredictions: number;
  totalTrainingEpisodes: number;
  averageReward: number;
  algorithmUsage: Record<RLAlgorithmType, number>;
  domainUsage: Record<string, number>;
  lastUpdated: Date;
}

// ============================================================================
// RL Suite Orchestrator
// ============================================================================

/**
 * Main orchestrator for QE RL Suite
 *
 * Manages all 9 RL algorithms and provides:
 * - Algorithm selection based on domain/task
 * - Unified training interface
 * - Prediction with automatic algorithm routing
 * - Model persistence
 * - Performance monitoring
 */
export class QERLSuite {
  private algorithms: Map<RLAlgorithmType, RLAlgorithm> = new Map();
  private config: RLSuiteConfig;
  private stats: RLSuiteStats;
  private domainMappings: AlgorithmDomainMapping[];

  constructor(config: Partial<RLSuiteConfig> = {}) {
    this.config = this.createDefaultConfig(config);
    this.domainMappings = ALGORITHM_DOMAIN_MAPPINGS;
    this.stats = this.createInitialStats();

    this.initializeAlgorithms();
  }

  // ========================================================================
  // Algorithm Management
  // ========================================================================

  /**
   * Get algorithm by type
   */
  getAlgorithm(type: RLAlgorithmType): RLAlgorithm | undefined {
    return this.algorithms.get(type);
  }

  /**
   * Get all available algorithms
   */
  getAlgorithms(): Map<RLAlgorithmType, RLAlgorithm> {
    return new Map(this.algorithms);
  }

  /**
   * Get algorithm for specific domain
   */
  getAlgorithmForDomain(domain: DomainName): RLAlgorithm | undefined {
    const mapping = this.domainMappings.find((m) => m.domains.includes(domain));

    if (!mapping) {
      // Fallback to first available algorithm
      return this.algorithms.values().next().value;
    }

    return this.algorithms.get(mapping.algorithm);
  }

  /**
   * Get all algorithms that can handle a domain
   */
  getAlgorithmsForDomain(domain: DomainName): RLAlgorithm[] {
    const mappings = this.domainMappings.filter((m) => m.domains.includes(domain));

    return mappings
      .map((m) => this.algorithms.get(m.algorithm))
      .filter((alg) => alg !== undefined) as RLAlgorithm[];
  }

  // ========================================================================
  // Prediction
  // ========================================================================

  /**
   * Make prediction using appropriate algorithm for domain
   */
  async predict(state: RLState, domain?: DomainName): Promise<RLPrediction> {
    let algorithm: RLAlgorithm | undefined;

    if (domain) {
      algorithm = this.getAlgorithmForDomain(domain);
    }

    // Fallback: try to infer from state metadata
    if (!algorithm && state.metadata?.domain) {
      algorithm = this.getAlgorithmForDomain(state.metadata.domain as DomainName);
    }

    // Default: use Q-Learning
    if (!algorithm) {
      algorithm = this.algorithms.get('q-learning');
    }

    if (!algorithm) {
      throw new Error('No algorithm available for prediction');
    }

    const prediction = await algorithm.predict(state);

    // Update stats
    this.stats.totalPredictions++;
    this.stats.algorithmUsage[algorithm.type]++;

    if (domain) {
      this.stats.domainUsage[domain] = (this.stats.domainUsage[domain] || 0) + 1;
    }

    return prediction;
  }

  /**
   * Make prediction using specific algorithm
   */
  async predictWithAlgorithm(
    algorithmType: RLAlgorithmType,
    state: RLState
  ): Promise<RLPrediction> {
    const algorithm = this.algorithms.get(algorithmType);

    if (!algorithm) {
      throw new Error(`Algorithm ${algorithmType} not found`);
    }

    return algorithm.predict(state);
  }

  // ========================================================================
  // Training
  // ========================================================================

  /**
   * Train algorithm with experience
   */
  async train(
    algorithmType: RLAlgorithmType,
    experience: RLExperience
  ): Promise<RLTrainingStats> {
    const algorithm = this.algorithms.get(algorithmType);

    if (!algorithm) {
      throw new Error(`Algorithm ${algorithmType} not found`);
    }

    const stats = await algorithm.train(experience);

    // Update suite stats
    this.updateTrainingStats(stats);

    return stats;
  }

  /**
   * Train algorithm with batch of experiences
   */
  async trainBatch(
    algorithmType: RLAlgorithmType,
    experiences: RLExperience[]
  ): Promise<RLTrainingStats> {
    const algorithm = this.algorithms.get(algorithmType);

    if (!algorithm) {
      throw new Error(`Algorithm ${algorithmType} not found`);
    }

    const stats = await algorithm.trainBatch(experiences);

    // Update suite stats
    this.updateTrainingStats(stats);

    return stats;
  }

  /**
   * Train all algorithms (for multi-task learning)
   */
  async trainAll(experiencesByAlgorithm: Record<RLAlgorithmType, RLExperience[]>): Promise<RLTrainingStats[]> {
    const results: RLTrainingStats[] = [];

    for (const [algorithmType, experiences] of Object.entries(experiencesByAlgorithm)) {
      try {
        const stats = await this.trainBatch(algorithmType as RLAlgorithmType, experiences);
        results.push(stats);
      } catch (error) {
        console.error(`Failed to train ${algorithmType}:`, error);
      }
    }

    return results;
  }

  // ========================================================================
  // Reward Calculation
  // ========================================================================

  /**
   * Calculate reward for domain-specific context
   */
  calculateReward(domain: DomainName, context: RewardContext): RewardCalculation {
    const rewardSignals = getRewardSignalsForDomain(domain);
    return calculateReward(rewardSignals, context);
  }

  /**
   * Create experience tuple with automatic reward calculation
   */
  createExperience(
    domain: DomainName,
    state: RLState,
    action: RLAction,
    nextState: RLState,
    result: { success: boolean; durationMs: number; quality: number },
    metadata?: Record<string, unknown>
  ): RLExperience {
    const context: RewardContext = {
      action,
      result,
      state,
      metadata,
    };

    const rewardCalc = this.calculateReward(domain, context);

    return {
      state,
      action,
      reward: rewardCalc.totalReward,
      nextState,
      done: metadata?.done === true,
      timestamp: new Date(),
    };
  }

  // ========================================================================
  // Model Persistence
  // ========================================================================

  /**
   * Export all trained models
   */
  async exportAllModels(): Promise<Record<RLAlgorithmType, Record<string, unknown>>> {
    const models: Record<string, Record<string, unknown>> = {};

    for (const [type, algorithm] of this.algorithms.entries()) {
      try {
        models[type] = await algorithm.exportModel();
      } catch (error) {
        console.error(`Failed to export ${type}:`, error);
      }
    }

    return models as Record<RLAlgorithmType, Record<string, unknown>>;
  }

  /**
   * Import trained models
   */
  async importAllModels(
    models: Record<RLAlgorithmType, Record<string, unknown>>
  ): Promise<void> {
    for (const [type, model] of Object.entries(models)) {
      const algorithm = this.algorithms.get(type as RLAlgorithmType);

      if (algorithm) {
        try {
          await algorithm.importModel(model);
        } catch (error) {
          console.error(`Failed to import ${type}:`, error);
        }
      }
    }
  }

  /**
   * Export suite state
   */
  async exportState(): Promise<Record<string, unknown>> {
    return {
      version: '1.0.0',
      config: this.config,
      stats: this.stats,
      domainMappings: this.domainMappings,
      exportedAt: new Date().toISOString(),
    };
  }

  /**
   * Import suite state
   */
  async importState(state: Record<string, unknown>): Promise<void> {
    if (state.config) {
      this.config = { ...this.config, ...state.config as Partial<RLSuiteConfig> };
    }

    if (state.stats) {
      this.stats = { ...this.stats, ...state.stats as RLSuiteStats };
    }

    if (state.domainMappings) {
      this.domainMappings = state.domainMappings as AlgorithmDomainMapping[];
    }
  }

  // ========================================================================
  // Statistics and Monitoring
  // ========================================================================

  /**
   * Get suite statistics
   */
  getStats(): RLSuiteStats {
    return { ...this.stats };
  }

  /**
   * Get algorithm statistics
   */
  getAlgorithmStats(algorithmType: RLAlgorithmType): RLTrainingStats | undefined {
    const algorithm = this.algorithms.get(algorithmType);
    return algorithm?.getStats();
  }

  /**
   * Get all algorithm statistics
   */
  getAllAlgorithmStats(): Record<RLAlgorithmType, RLTrainingStats> {
    const stats: Record<string, RLTrainingStats> = {};

    for (const [type, algorithm] of this.algorithms.entries()) {
      stats[type] = algorithm.getStats();
    }

    return stats as Record<RLAlgorithmType, RLTrainingStats>;
  }

  // ========================================================================
  // Reset and Management
  // ========================================================================

  /**
   * Reset specific algorithm
   */
  async resetAlgorithm(algorithmType: RLAlgorithmType): Promise<void> {
    const algorithm = this.algorithms.get(algorithmType);

    if (algorithm) {
      await algorithm.reset();
    }
  }

  /**
   * Reset all algorithms
   */
  async resetAll(): Promise<void> {
    for (const algorithm of this.algorithms.values()) {
      await algorithm.reset();
    }

    this.stats = this.createInitialStats();
  }

  /**
   * Reset suite statistics
   */
  resetStats(): void {
    this.stats = this.createInitialStats();
  }

  // ========================================================================
  // Private Methods
  // ========================================================================

  private createDefaultConfig(config: Partial<RLSuiteConfig>): RLSuiteConfig {
    return {
      enabled: true,
      algorithms: [
        'decision-transformer',
        'q-learning',
        'sarsa',
        'actor-critic',
        'policy-gradient',
        'dqn',
        'ppo',
        'a2c',
        'ddpg',
      ],
      rewardSignals: [],
      domainMappings: ALGORITHM_DOMAIN_MAPPINGS,
      trainingConfig: {
        learningRate: 0.001,
        discountFactor: 0.99,
        explorationRate: 0.3,
      },
      modelPersistenceEnabled: true,
      autoTrainingEnabled: false,
      fallbackEnabled: true,
    };
  }

  private createInitialStats(): RLSuiteStats {
    return {
      totalPredictions: 0,
      totalTrainingEpisodes: 0,
      averageReward: 0,
      algorithmUsage: {
        'decision-transformer': 0,
        'q-learning': 0,
        'sarsa': 0,
        'actor-critic': 0,
        'policy-gradient': 0,
        'dqn': 0,
        'ppo': 0,
        'a2c': 0,
        'ddpg': 0,
      },
      domainUsage: {},
      lastUpdated: new Date(),
    };
  }

  private initializeAlgorithms(): void {
    for (const algorithmType of this.config.algorithms) {
      try {
        const algorithm = this.createAlgorithm(algorithmType);
        this.algorithms.set(algorithmType, algorithm);
      } catch (error) {
        console.error(`Failed to initialize ${algorithmType}:`, error);
      }
    }
  }

  private createAlgorithm(type: RLAlgorithmType): RLAlgorithm {
    switch (type) {
      case 'decision-transformer':
        return new DecisionTransformerAlgorithm();

      case 'q-learning':
        return new QLearningAlgorithm();

      case 'sarsa':
        return new SARSAAlgorithm();

      case 'actor-critic':
        return new ActorCriticAlgorithm();

      case 'policy-gradient':
        return new PolicyGradientAlgorithm();

      case 'dqn':
        return new DQNAlgorithm();

      case 'ppo':
        return new PPOAlgorithm();

      case 'a2c':
        return new A2CAlgorithm();

      case 'ddpg':
        return new DDPGAlgorithm();

      default:
        throw new Error(`Unknown algorithm type: ${type}`);
    }
  }

  private updateTrainingStats(stats: RLTrainingStats): void {
    this.stats.totalTrainingEpisodes++;
    const currentAvg = this.stats.averageReward ?? 0;
    const newAvg = stats.averageReward ?? 0;
    this.stats.averageReward =
      (currentAvg * (this.stats.totalTrainingEpisodes - 1) + newAvg) /
      this.stats.totalTrainingEpisodes;
    this.stats.lastUpdated = new Date();
  }
}

// ============================================================================
// Factory Function
// ============================================================================

/**
 * Create QE RL Suite with optional configuration
 */
export function createQERLSuite(config?: Partial<RLSuiteConfig>): QERLSuite {
  return new QERLSuite(config);
}
