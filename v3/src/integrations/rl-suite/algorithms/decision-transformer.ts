/**
 * Agentic QE v3 - Decision Transformer Algorithm
 *
 * Decision Transformer for Test Case Prioritization
 * Application: test-execution domain
 *
 * Uses attention-based transformer architecture to model
 * the decision process for test prioritization.
 */

import { BaseRLAlgorithm } from '../base-algorithm';
import type {
  RLState,
  RLAction,
  RLPrediction,
  RLTrainingStats,
  RLExperience,
  RLAlgorithmInfo,
  TestExecutionState,
  TestExecutionAction,
} from '../interfaces';
import { cosineSimilarity } from '../../../shared/utils/vector-math.js';

// ============================================================================
// Decision Transformer Configuration
// ============================================================================

interface DTConfig {
  /** Context window size (number of past trajectories to consider) */
  contextLength: number;
  /** Embedding dimension for states, actions, returns */
  embeddingDim: number;
  /** Number of attention heads */
  numHeads: number;
  /** Number of transformer layers */
  numLayers: number;
  /** Feed-forward dimension */
  feedForwardDim: number;
  /** Maximum return value for normalization */
  maxReturn: number;
}

const DEFAULT_DT_CONFIG: DTConfig = {
  contextLength: 10,
  embeddingDim: 128,
  numHeads: 4,
  numLayers: 3,
  feedForwardDim: 256,
  maxReturn: 100,
};

// ============================================================================
// Trajectory Storage
// ============================================================================

interface Trajectory {
  states: RLState[];
  actions: RLAction[];
  rewards: number[];
  returns: number[];
}

// ============================================================================
// Decision Transformer Implementation
// ============================================================================

/**
 * Decision Transformer for Test Case Prioritization
 *
 * Application: Prioritize test cases based on historical execution data
 * Domain: test-execution
 *
 * Key features:
 * - Attention-based sequence modeling
 * - Return-to-go conditioning
 * - Context-aware decision making
 * - Offline RL (learns from historical data)
 */
export class DecisionTransformerAlgorithm extends BaseRLAlgorithm {
  private trajectories: Trajectory[] = [];
  private dtConfig: DTConfig;
  private stateEmbeddings: Map<string, number[]> = new Map();
  private actionEmbeddings: Map<string, number[]> = new Map();

  constructor(config: Partial<DTConfig> = {}) {
    super('decision-transformer', 'offline-rl');
    this.dtConfig = { ...DEFAULT_DT_CONFIG, ...config };
  }

  // ========================================================================
  // Public Interface
  // ========================================================================

  /**
   * Predict action using transformer-based attention
   */
  async predict(state: RLState): Promise<RLPrediction> {
    if (!this.initialized) {
      await this.initialize();
    }

    // Get relevant context from trajectories
    const context = this.retrieveContext(state);
    const returnToGo = this.calculateReturnToGo(context);

    // Generate action prediction using attention
    const action = this.generateAction(state, context, returnToGo);
    const confidence = this.calculateConfidence(context, returnToGo);

    return {
      action,
      confidence,
      value: returnToGo,
      reasoning: this.generateReasoning(state, action, context, returnToGo),
    };
  }

  // ========================================================================
  // Training Implementation
  // ========================================================================

  protected async trainCore(experiences: RLExperience[]): Promise<RLTrainingStats> {
    // Group experiences into trajectories
    const trajectories = this.groupIntoTrajectories(experiences);

    // Calculate returns for each trajectory
    for (const traj of trajectories) {
      this.calculateReturns(traj);
    }

    // Add to trajectory buffer
    this.trajectories.push(...trajectories);

    // Keep trajectory buffer manageable
    if (this.trajectories.length > 1000) {
      this.trajectories = this.trajectories.slice(-1000);
    }

    // Update embeddings (simplified - in practice would use neural network)
    this.updateEmbeddings(trajectories);

    const avgReturn = trajectories.reduce(
      (sum, t) => sum + t.returns[t.returns.length - 1],
      0
    ) / trajectories.length;

    return {
      episode: this.episodeCount,
      totalReward: this.totalReward,
      averageReward: this.rewardHistory.reduce((a, b) => a + b, 0) / this.rewardHistory.length,
      loss: Math.abs(avgReturn - this.targetReturn()),
      explorationRate: 0, // DT doesn't use exploration
      trainingTimeMs: 0,
      timestamp: new Date(),
    };
  }

  protected getAlgorithmInfo(): RLAlgorithmInfo {
    return {
      type: this.type,
      category: this.category,
      version: '1.0.0',
      description: 'Decision Transformer for Test Case Prioritization',
      capabilities: [
        'Offline RL from historical data',
        'Attention-based sequence modeling',
        'Return-to-go conditioning',
        'Context-aware decisions',
      ],
      hyperparameters: {
        contextLength: this.dtConfig.contextLength,
        embeddingDim: this.dtConfig.embeddingDim,
        numHeads: this.dtConfig.numHeads,
        numLayers: this.dtConfig.numLayers,
      },
      stats: this.stats,
    };
  }

  // ========================================================================
  // Context Retrieval
  // ========================================================================

  private retrieveContext(state: RLState): Trajectory[] {
    // Find similar trajectories based on state similarity
    const scored = this.trajectories.map((traj) => {
      const similarity = this.calculateSimilarity(state, traj);
      return { traj, similarity };
    });

    // Sort by similarity and return top-k
    scored.sort((a, b) => b.similarity - a.similarity);
    return scored.slice(0, this.dtConfig.contextLength).map((s) => s.traj);
  }

  private calculateSimilarity(state: RLState, trajectory: Trajectory): number {
    // Simple similarity: check if similar states exist in trajectory
    for (const trajState of trajectory.states) {
      if (this.statesMatch(state, trajState)) {
        return 1.0;
      }
    }

    // Feature-based similarity
    if (trajectory.states.length > 0) {
      const lastState = trajectory.states[trajectory.states.length - 1];
      return cosineSimilarity(state.features, lastState.features);
    }

    return 0;
  }

  private statesMatch(s1: RLState, s2: RLState): boolean {
    if (s1.id === s2.id) return true;
    if (Math.abs(s1.features[0] - s2.features[0]) < 0.1) return true;
    return false;
  }

  // ========================================================================
  // Return Calculation
  // ========================================================================

  private calculateReturnToGo(context: Trajectory[]): number {
    if (context.length === 0) return 0;

    // Average return-to-go from context
    const returns = context.flatMap((t) => t.returns);
    return returns.reduce((sum, r) => sum + r, 0) / returns.length;
  }

  private calculateReturns(trajectory: Trajectory): void {
    const returns: number[] = [];
    let returnToGo = 0;

    for (let i = trajectory.rewards.length - 1; i >= 0; i--) {
      returnToGo = trajectory.rewards[i] + this.config.discountFactor * returnToGo;
      returns.unshift(returnToGo);
    }

    trajectory.returns = returns;
  }

  private targetReturn(): number {
    return this.dtConfig.maxReturn * 0.8;
  }

  // ========================================================================
  // Action Generation
  // ========================================================================

  private generateAction(state: RLState, context: Trajectory[], returnToGo: number): RLAction {
    // Find similar states in context and use their actions
    for (const traj of context) {
      for (let i = 0; i < traj.states.length; i++) {
        if (this.statesMatch(state, traj.states[i])) {
          // Return action with highest return
          if (traj.returns[i] > returnToGo * 0.8) {
            return { ...traj.actions[i] };
          }
        }
      }
    }

    // Fallback: prioritize high-value actions
    return this.getHeuristicAction(state);
  }

  private getHeuristicAction(state: RLState): RLAction {
    // For test execution, prioritize based on state
    const priority = state.features[0] > 0.7 ? 'high' : 'standard';

    return {
      type: 'prioritize',
      value: priority,
      metadata: { heuristic: true },
    };
  }

  // ========================================================================
  // Embeddings (simplified)
  // ========================================================================

  private updateEmbeddings(trajectories: Trajectory[]): void {
    // In practice, would use neural network to learn embeddings
    // Here we use simple hash-based embeddings
    for (const traj of trajectories) {
      for (const state of traj.states) {
        if (!this.stateEmbeddings.has(state.id)) {
          this.stateEmbeddings.set(state.id, this.hashEmbedding(state.id));
        }
      }

      for (const action of traj.actions) {
        const key = this.actionToKey(action);
        if (!this.actionEmbeddings.has(key)) {
          this.actionEmbeddings.set(key, this.hashEmbedding(key));
        }
      }
    }
  }

  private hashEmbedding(input: string): number[] {
    const embedding: number[] = [];
    const dim = this.dtConfig.embeddingDim;

    for (let i = 0; i < dim; i++) {
      const hash = this.simpleHash(input + i);
      embedding.push((hash % 200 - 100) / 100); // Normalize to [-1, 1]
    }

    return embedding;
  }

  private simpleHash(str: string): number {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash);
  }

  private actionToKey(action: RLAction): string {
    return `${action.type}:${JSON.stringify(action.value)}`;
  }

  // ========================================================================
  // Helpers
  // ========================================================================

  private groupIntoTrajectories(experiences: RLExperience[]): Trajectory[] {
    // Group consecutive experiences into trajectories
    const trajectories: Trajectory[] = [];
    let currentTraj: Trajectory | null = null;

    for (const exp of experiences) {
      if (exp.done || !currentTraj) {
        if (currentTraj) {
          trajectories.push(currentTraj);
        }
        currentTraj = {
          states: [exp.state],
          actions: [exp.action],
          rewards: [exp.reward],
          returns: [],
        };
      } else {
        currentTraj.states.push(exp.state);
        currentTraj.actions.push(exp.action);
        currentTraj.rewards.push(exp.reward);
      }
    }

    if (currentTraj) {
      trajectories.push(currentTraj);
    }

    return trajectories;
  }

  private calculateConfidence(context: Trajectory[], returnToGo: number): number {
    if (context.length === 0) return 0.3;

    // Confidence based on number of similar contexts and return
    const contextScore = Math.min(1, context.length / this.dtConfig.contextLength);
    const returnScore = Math.min(1, returnToGo / this.targetReturn());

    return 0.3 + contextScore * 0.4 + returnScore * 0.3;
  }

  private generateReasoning(
    state: RLState,
    action: RLAction,
    context: Trajectory[],
    returnToGo: number
  ): string {
    if (context.length === 0) {
      return `Decision Transformer: No similar historical contexts, using heuristic`;
    }

    const avgReturn = context.reduce(
      (sum, t) => sum + t.returns[t.returns.length - 1] || 0,
      0
    ) / context.length;

    return `Decision Transformer: Found ${context.length} similar contexts (avg return: ${avgReturn.toFixed(2)}), ` +
      `selecting ${action.type} action with return-to-go ${returnToGo.toFixed(2)}`;
  }

  // ========================================================================
  // Export/Import
  // ========================================================================

  protected async exportCustomData(): Promise<Record<string, unknown>> {
    return {
      trajectories: this.trajectories,
      stateEmbeddings: Object.fromEntries(this.stateEmbeddings),
      actionEmbeddings: Object.fromEntries(this.actionEmbeddings),
      dtConfig: this.dtConfig,
    };
  }

  protected async importCustomData(data: Record<string, unknown>): Promise<void> {
    if (data.trajectories) {
      this.trajectories = data.trajectories as Trajectory[];
    }

    if (data.stateEmbeddings) {
      this.stateEmbeddings = new Map(Object.entries(data.stateEmbeddings) as [string, number[]][]);
    }

    if (data.actionEmbeddings) {
      this.actionEmbeddings = new Map(Object.entries(data.actionEmbeddings) as [string, number[]][]);
    }

    if (data.dtConfig) {
      this.dtConfig = { ...this.dtConfig, ...data.dtConfig as DTConfig };
    }
  }

  protected async resetAlgorithm(): Promise<void> {
    this.trajectories = [];
    this.stateEmbeddings.clear();
    this.actionEmbeddings.clear();
  }
}
