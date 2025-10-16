/**
 * LearningEngine - Phase 2 (Milestone 2.2)
 *
 * Implements reinforcement learning for agent performance improvement.
 * Uses Q-learning algorithm to optimize task execution strategies.
 */

import { v4 as uuidv4 } from 'uuid';
import { Logger } from '../utils/Logger';
import { SwarmMemoryManager } from '../core/memory/SwarmMemoryManager';
import {
  LearningConfig,
  TaskExperience,
  TaskState,
  AgentAction,
  LearningFeedback,
  LearningOutcome,
  LearnedPattern,
  LearningModelState,
  FailurePattern,
  StrategyRecommendation,
  LearningEvent
} from './types';

/**
 * Default learning configuration
 */
const DEFAULT_CONFIG: LearningConfig = {
  enabled: true,
  learningRate: 0.1,
  discountFactor: 0.95,
  explorationRate: 0.3,
  explorationDecay: 0.995,
  minExplorationRate: 0.01,
  maxMemorySize: 100 * 1024 * 1024, // 100MB
  batchSize: 32,
  updateFrequency: 10
};

/**
 * LearningEngine - Reinforcement learning for agents
 */
export class LearningEngine {
  private readonly logger: Logger;
  private readonly memoryStore: SwarmMemoryManager;
  private readonly agentId: string;
  private config: LearningConfig;
  private qTable: Map<string, Map<string, number>>; // state-action values
  private experiences: TaskExperience[];
  private patterns: Map<string, LearnedPattern>;
  private failurePatterns: Map<string, FailurePattern>;
  private taskCount: number;

  constructor(
    agentId: string,
    memoryStore: SwarmMemoryManager,
    config: Partial<LearningConfig> = {}
  ) {
    this.logger = Logger.getInstance();
    this.agentId = agentId;
    this.memoryStore = memoryStore;
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.qTable = new Map();
    this.experiences = [];
    this.patterns = new Map();
    this.failurePatterns = new Map();
    this.taskCount = 0;
  }

  /**
   * Initialize the learning engine
   */
  async initialize(): Promise<void> {
    this.logger.info(`Initializing LearningEngine for agent ${this.agentId}`);

    // Load previous learning state if exists
    await this.loadState();

    // Store config in memory
    await this.memoryStore.store(
      `phase2/learning/${this.agentId}/config`,
      this.config,
      { partition: 'learning' }
    );

    this.logger.info('LearningEngine initialized successfully');
  }

  /**
   * Learn from a task execution
   */
  async learnFromExecution(
    task: any,
    result: any,
    feedback?: LearningFeedback
  ): Promise<LearningOutcome> {
    if (!this.config.enabled) {
      return this.createOutcome(false, 0, 0);
    }

    // Extract experience from task execution
    const experience = this.extractExperience(task, result, feedback);
    this.experiences.push(experience);

    // Calculate reward
    const reward = this.calculateReward(result, feedback);
    experience.reward = reward;

    // Update Q-table
    await this.updateQTable(experience);

    // Update patterns
    await this.updatePatterns(experience);

    // Detect failure patterns
    if (!result.success) {
      await this.detectFailurePattern(experience);
    }

    // Increment task count
    this.taskCount++;

    // Periodic model update
    if (this.taskCount % this.config.updateFrequency === 0) {
      await this.performBatchUpdate();
    }

    // Decay exploration rate
    this.decayExploration();

    // Calculate improvement
    const improvement = await this.calculateImprovement();

    // Emit learning event
    await this.emitLearningEvent('training', {
      experience,
      reward,
      improvement
    });

    // Save state periodically
    if (this.taskCount % 50 === 0) {
      await this.saveState();
    }

    return improvement;
  }

  /**
   * Recommend best strategy for a given state
   */
  async recommendStrategy(state: TaskState): Promise<StrategyRecommendation> {
    const stateKey = this.encodeState(state);

    // Get Q-values for all actions in this state
    const actionValues = this.qTable.get(stateKey) || new Map();

    if (actionValues.size === 0) {
      // No learned strategies yet, return default
      return {
        strategy: 'default',
        confidence: 0.5,
        expectedImprovement: 0,
        reasoning: 'No learned strategies available yet',
        alternatives: []
      };
    }

    // Find best action
    let bestAction = '';
    let bestValue = -Infinity;
    const alternatives: { strategy: string; confidence: number }[] = [];

    for (const [action, value] of actionValues.entries()) {
      if (value > bestValue) {
        if (bestAction) {
          alternatives.push({
            strategy: bestAction,
            confidence: this.valueToConfidence(bestValue)
          });
        }
        bestValue = value;
        bestAction = action;
      } else {
        alternatives.push({
          strategy: action,
          confidence: this.valueToConfidence(value)
        });
      }
    }

    // Sort alternatives by confidence
    alternatives.sort((a, b) => b.confidence - a.confidence);

    return {
      strategy: bestAction,
      confidence: this.valueToConfidence(bestValue),
      expectedImprovement: Math.max(0, bestValue * 100),
      reasoning: `Learned from ${this.experiences.length} experiences`,
      alternatives: alternatives.slice(0, 3)
    };
  }

  /**
   * Get learned patterns
   */
  getPatterns(): LearnedPattern[] {
    return Array.from(this.patterns.values())
      .sort((a, b) => b.confidence - a.confidence);
  }

  /**
   * Get failure patterns
   */
  getFailurePatterns(): FailurePattern[] {
    return Array.from(this.failurePatterns.values())
      .sort((a, b) => b.frequency - a.frequency);
  }

  /**
   * Extract features from state for learning
   */
  private extractFeatures(state: TaskState): number[] {
    return [
      state.taskComplexity,
      state.requiredCapabilities.length / 10, // normalize
      state.previousAttempts / 5, // normalize
      state.availableResources,
      state.timeConstraint ? Math.min(state.timeConstraint / 300000, 1) : 1 // normalize to 5 min
    ];
  }

  /**
   * Encode state to string key for Q-table
   */
  private encodeState(state: TaskState): string {
    const features = this.extractFeatures(state);
    return features.map(f => Math.round(f * 10) / 10).join(',');
  }

  /**
   * Encode action to string key
   */
  private encodeAction(action: AgentAction): string {
    return `${action.strategy}:${action.parallelization.toFixed(1)}:${action.retryPolicy}`;
  }

  /**
   * Extract experience from task execution
   */
  private extractExperience(
    task: any,
    result: any,
    feedback?: LearningFeedback
  ): TaskExperience {
    const state: TaskState = {
      taskComplexity: this.estimateComplexity(task),
      requiredCapabilities: task.requirements?.capabilities || [],
      contextFeatures: task.context || {},
      previousAttempts: task.previousAttempts || 0,
      availableResources: 0.8, // TODO: get from system
      timeConstraint: task.timeout
    };

    const action: AgentAction = {
      strategy: result.strategy || 'default',
      toolsUsed: result.toolsUsed || [],
      parallelization: result.parallelization || 0.5,
      retryPolicy: result.retryPolicy || 'exponential',
      resourceAllocation: result.resourceAllocation || 0.5
    };

    // Next state (after execution)
    const nextState: TaskState = {
      ...state,
      previousAttempts: state.previousAttempts + 1,
      availableResources: state.availableResources * 0.9 // resource consumption
    };

    return {
      taskId: task.id || uuidv4(),
      taskType: task.type,
      state,
      action,
      reward: 0, // will be calculated
      nextState,
      timestamp: new Date(),
      agentId: this.agentId
    };
  }

  /**
   * Calculate reward from execution result and feedback
   */
  private calculateReward(result: any, feedback?: LearningFeedback): number {
    let reward = 0;

    // Success/failure (primary component)
    reward += result.success ? 1.0 : -1.0;

    // Execution time (faster is better)
    if (result.executionTime) {
      const timeFactor = Math.max(0, 1 - result.executionTime / 30000); // 30 sec baseline
      reward += timeFactor * 0.5;
    }

    // Error rate penalty
    if (result.errors) {
      reward -= result.errors.length * 0.1;
    }

    // User feedback
    if (feedback) {
      reward += (feedback.rating - 0.5) * 2; // -1 to +1
      reward -= feedback.issues.length * 0.2;
    }

    // Coverage/quality bonus (for test generation)
    if (result.coverage) {
      reward += (result.coverage - 0.8) * 2; // bonus above 80%
    }

    return Math.max(-2, Math.min(2, reward)); // clamp to [-2, 2]
  }

  /**
   * Update Q-table with new experience (Q-learning algorithm)
   */
  private async updateQTable(experience: TaskExperience): Promise<void> {
    const stateKey = this.encodeState(experience.state);
    const actionKey = this.encodeAction(experience.action);
    const nextStateKey = this.encodeState(experience.nextState);

    // Get or create state-action map
    if (!this.qTable.has(stateKey)) {
      this.qTable.set(stateKey, new Map());
    }
    const stateActions = this.qTable.get(stateKey)!;

    // Get current Q-value
    const currentQ = stateActions.get(actionKey) || 0;

    // Get max Q-value for next state
    const nextStateActions = this.qTable.get(nextStateKey) || new Map();
    const maxNextQ = nextStateActions.size > 0
      ? Math.max(...Array.from(nextStateActions.values()))
      : 0;

    // Q-learning update: Q(s,a) = Q(s,a) + α * [r + γ * max(Q(s',a')) - Q(s,a)]
    const newQ = currentQ + this.config.learningRate * (
      experience.reward + this.config.discountFactor * maxNextQ - currentQ
    );

    stateActions.set(actionKey, newQ);
  }

  /**
   * Perform batch update on experiences
   */
  private async performBatchUpdate(): Promise<void> {
    if (this.experiences.length < this.config.batchSize) {
      return;
    }

    // Sample recent experiences
    const batch = this.experiences.slice(-this.config.batchSize);

    // Re-train on batch
    for (const experience of batch) {
      await this.updateQTable(experience);
    }

    this.logger.info(`Performed batch update on ${batch.length} experiences`);
  }

  /**
   * Update learned patterns
   */
  private async updatePatterns(experience: TaskExperience): Promise<void> {
    const patternKey = `${experience.taskType}:${experience.action.strategy}`;

    if (this.patterns.has(patternKey)) {
      const pattern = this.patterns.get(patternKey)!;
      pattern.usageCount++;
      pattern.lastUsedAt = new Date();

      // Update success rate
      if (experience.reward > 0) {
        pattern.successRate = (pattern.successRate * (pattern.usageCount - 1) + 1) / pattern.usageCount;
      } else {
        pattern.successRate = (pattern.successRate * (pattern.usageCount - 1)) / pattern.usageCount;
      }

      // Update confidence
      pattern.confidence = Math.min(0.95, pattern.confidence + 0.01);
    } else {
      // Create new pattern
      const pattern: LearnedPattern = {
        id: uuidv4(),
        pattern: patternKey,
        confidence: 0.5,
        successRate: experience.reward > 0 ? 1.0 : 0.0,
        usageCount: 1,
        contexts: [experience.taskType],
        createdAt: new Date(),
        lastUsedAt: new Date()
      };
      this.patterns.set(patternKey, pattern);

      // Emit pattern discovered event
      await this.emitLearningEvent('pattern_discovered', pattern);
    }
  }

  /**
   * Detect failure patterns
   */
  private async detectFailurePattern(experience: TaskExperience): Promise<void> {
    const patternKey = `${experience.taskType}:failure`;

    if (this.failurePatterns.has(patternKey)) {
      const pattern = this.failurePatterns.get(patternKey)!;
      pattern.frequency++;
      pattern.confidence = Math.min(0.95, pattern.frequency / this.experiences.length);
    } else {
      const pattern: FailurePattern = {
        id: uuidv4(),
        pattern: patternKey,
        frequency: 1,
        contexts: [experience.taskType],
        confidence: 0.1,
        identifiedAt: new Date()
      };
      this.failurePatterns.set(patternKey, pattern);
    }
  }

  /**
   * Calculate improvement over time
   */
  private async calculateImprovement(): Promise<LearningOutcome> {
    if (this.experiences.length < 10) {
      return this.createOutcome(false, 0, 0);
    }

    // Compare recent performance vs baseline
    const recentExperiences = this.experiences.slice(-20);
    const baselineExperiences = this.experiences.slice(0, 20);

    const recentAvgReward = recentExperiences.reduce((sum, e) => sum + e.reward, 0) / recentExperiences.length;
    const baselineAvgReward = baselineExperiences.reduce((sum, e) => sum + e.reward, 0) / baselineExperiences.length;

    const improvementRate = baselineAvgReward !== 0
      ? ((recentAvgReward - baselineAvgReward) / Math.abs(baselineAvgReward)) * 100
      : 0;

    return this.createOutcome(
      improvementRate > 0,
      baselineAvgReward,
      recentAvgReward,
      improvementRate
    );
  }

  /**
   * Create learning outcome
   */
  private createOutcome(
    improved: boolean,
    previous: number,
    current: number,
    rate: number = 0
  ): LearningOutcome {
    return {
      improved,
      previousPerformance: previous,
      newPerformance: current,
      improvementRate: rate,
      confidence: Math.min(0.95, this.experiences.length / 100),
      patterns: this.getPatterns().slice(0, 5),
      timestamp: new Date()
    };
  }

  /**
   * Estimate task complexity
   */
  private estimateComplexity(task: any): number {
    let complexity = 0.5; // baseline

    if (task.requirements?.capabilities) {
      complexity += task.requirements.capabilities.length * 0.1;
    }

    if (task.previousAttempts) {
      complexity += task.previousAttempts * 0.1;
    }

    return Math.min(1.0, complexity);
  }

  /**
   * Convert Q-value to confidence score
   */
  private valueToConfidence(value: number): number {
    return Math.max(0, Math.min(1, (value + 2) / 4)); // map [-2, 2] to [0, 1]
  }

  /**
   * Decay exploration rate
   */
  private decayExploration(): void {
    this.config.explorationRate = Math.max(
      this.config.minExplorationRate,
      this.config.explorationRate * this.config.explorationDecay
    );
  }

  /**
   * Save learning state to memory
   */
  private async saveState(): Promise<void> {
    const state: LearningModelState = {
      agentId: this.agentId,
      qTable: this.serializeQTable(),
      experiences: this.experiences.slice(-1000), // keep last 1000
      patterns: this.getPatterns(),
      config: this.config,
      performance: await this.getCurrentPerformance(),
      version: '1.0.0',
      lastUpdated: new Date(),
      size: this.calculateStateSize()
    };

    // Check size limit
    if (state.size > this.config.maxMemorySize) {
      this.logger.warn(`Learning state exceeds max size (${state.size} bytes), pruning...`);
      state.experiences = state.experiences.slice(-500);
      state.size = this.calculateStateSize();
    }

    await this.memoryStore.store(
      `phase2/learning/${this.agentId}/state`,
      state,
      { partition: 'learning' }
    );

    this.logger.info(`Saved learning state (${state.size} bytes, ${state.experiences.length} experiences)`);
  }

  /**
   * Load learning state from memory
   */
  private async loadState(): Promise<void> {
    try {
      const state = await this.memoryStore.retrieve(
        `phase2/learning/${this.agentId}/state`,
        { partition: 'learning' }
      ) as LearningModelState | null;

      if (state) {
        this.deserializeQTable(state.qTable);
        this.experiences = state.experiences;
        this.patterns = new Map(state.patterns.map(p => [p.pattern, p]));
        this.taskCount = state.experiences.length;
        this.logger.info(`Loaded learning state: ${state.experiences.length} experiences`);
      }
    } catch (error) {
      this.logger.warn('No previous learning state found, starting fresh');
    }
  }

  /**
   * Serialize Q-table for storage
   */
  private serializeQTable(): Record<string, Record<string, number>> {
    const serialized: Record<string, Record<string, number>> = {};
    for (const [state, actions] of this.qTable.entries()) {
      serialized[state] = Object.fromEntries(actions.entries());
    }
    return serialized;
  }

  /**
   * Deserialize Q-table from storage
   */
  private deserializeQTable(data: Record<string, Record<string, number>>): void {
    this.qTable.clear();
    for (const [state, actions] of Object.entries(data)) {
      this.qTable.set(state, new Map(Object.entries(actions)));
    }
  }

  /**
   * Calculate state size in bytes
   */
  private calculateStateSize(): number {
    return JSON.stringify({
      qTable: this.serializeQTable(),
      experiences: this.experiences,
      patterns: this.getPatterns()
    }).length;
  }

  /**
   * Get current performance metrics
   */
  private async getCurrentPerformance(): Promise<any> {
    const recentExperiences = this.experiences.slice(-100);
    if (recentExperiences.length === 0) {
      return {
        avgReward: 0,
        successRate: 0,
        totalExperiences: 0
      };
    }

    return {
      avgReward: recentExperiences.reduce((sum, e) => sum + e.reward, 0) / recentExperiences.length,
      successRate: recentExperiences.filter(e => e.reward > 0).length / recentExperiences.length,
      totalExperiences: this.experiences.length
    };
  }

  /**
   * Emit learning event
   */
  private async emitLearningEvent(type: string, data: any): Promise<void> {
    const event: LearningEvent = {
      id: uuidv4(),
      type: type as any,
      agentId: this.agentId,
      data,
      timestamp: new Date()
    };

    await this.memoryStore.storeEvent({
      type: `learning:${type}`,
      payload: event,
      source: this.agentId,
      timestamp: Date.now()
    });
  }

  /**
   * Get current exploration rate
   */
  getExplorationRate(): number {
    return this.config.explorationRate;
  }

  /**
   * Get total experiences
   */
  getTotalExperiences(): number {
    return this.experiences.length;
  }

  /**
   * Enable/disable learning
   */
  setEnabled(enabled: boolean): void {
    this.config.enabled = enabled;
  }

  /**
   * Check if learning is enabled
   */
  isEnabled(): boolean {
    return this.config.enabled;
  }
}
