/**
 * LearningEngine - Phase 2 (Milestone 2.2)
 *
 * Implements reinforcement learning for agent performance improvement.
 * Uses Q-learning algorithm to optimize task execution strategies.
 */

import { v4 as uuidv4 } from 'uuid';
import { Logger } from '../utils/Logger';
import { SwarmMemoryManager } from '../core/memory/SwarmMemoryManager';
import { QLearning, QLearningConfig } from './QLearning';
import { StateExtractor } from './StateExtractor';
import { RewardCalculator, TaskResult } from './RewardCalculator';
import packageJson from '../../package.json';

const PACKAGE_VERSION = packageJson.version;
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
  private qTable: Map<string, Map<string, number>>; // state-action values (legacy)
  private qLearning?: QLearning; // Q-learning integration
  private useQLearning: boolean;
  private experiences: TaskExperience[];
  // REMOVED: private patterns: Map<string, LearnedPattern>; (now persisted via memoryStore.storePattern)
  private failurePatterns: Map<string, FailurePattern>;
  private taskCount: number;
  private readonly stateExtractor: StateExtractor;
  private readonly rewardCalculator: RewardCalculator;

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
    this.useQLearning = false; // Default to legacy implementation
    this.experiences = [];
    // REMOVED: this.patterns = new Map(); (now using memoryStore.storePattern for persistence)
    this.failurePatterns = new Map();
    this.taskCount = 0;
    this.stateExtractor = new StateExtractor();
    this.rewardCalculator = new RewardCalculator();

    // Architecture Improvement (Phase 3): LearningEngine now accepts SwarmMemoryManager
    // directly for unified persistence. This ensures:
    // 1. All learning patterns persist to .agentic-qe/agentdb.db via SwarmMemoryManager
    // 2. Unified memory access across all agents
    // 3. Proper resource management and no duplicate connections
    // 4. Backward compatibility with QEReasoningBank
    this.logger.info(`LearningEngine initialized for agent ${agentId} - using ${memoryStore.constructor.name} for persistent storage`);
  }

  /**
   * Initialize the learning engine
   *
   * Architecture: Uses shared memoryStore (SwarmMemoryManager) for all persistence.
   * No database initialization needed - memoryStore handles the database connection.
   */
  async initialize(): Promise<void> {
    this.logger.info(`Initializing LearningEngine for agent ${this.agentId}`);

    // Load previous learning state if exists
    await this.loadState();

    // Load Q-values from memoryStore if available
    // Q-table loading done inline above

    // Store config in memory via reasoningBank's memoryStore
    if (this.memoryStore) {
      await this.memoryStore.store(
        `phase2/learning/${this.agentId}/config`,
        this.config,
        { partition: 'learning' }
      );
    }

    this.logger.info('LearningEngine initialized successfully');
  }

  /**
   * @deprecated Use learnFromExecution() instead. This method is maintained for backward compatibility.
   * Will be removed in v2.0.0
   *
   * Record experience from task execution (DEPRECATED)
   * Redirects to learnFromExecution() for consolidated implementation
   */
  async recordExperience(task: any, result: TaskResult, feedback?: LearningFeedback): Promise<void> {
    this.logger.warn('[LearningEngine] recordExperience() is deprecated. Use learnFromExecution() instead. This method will be removed in v2.0.0');

    // Redirect to unified method
    await this.learnFromExecution(task, result, feedback);
  }

  /**
   * Load patterns from memoryStore (AgentDB via SwarmMemoryManager)
   *
   * Architecture: Retrieves patterns from SwarmMemoryManager which
   * internally uses AgentDB (.agentic-qe/agentdb.db).
   *
   * Note: This method is legacy and not currently used (patterns loaded on-demand).
   */
  private async loadPatternsFromMemoryStore(): Promise<void> {
    try {
      // Query all patterns from AgentDB (confidence >= 0 returns all)
      const allPatterns = await this.memoryStore.queryPatternsByConfidence(0);

      if (allPatterns.length === 0) {
        this.logger.info('No existing patterns found in AgentDB');
        return;
      }

      this.logger.info(`Found ${allPatterns.length} patterns in AgentDB for agent ${this.agentId}`);
    } catch (error) {
      this.logger.warn(`Failed to load patterns from AgentDB:`, error);
    }
  }

  /**
   * Learn from task execution with automatic database persistence
   * This is the primary method called by BaseAgent.onPostTask()
   * Consolidates learnFromExecution() and recordExperience() functionality
   *
   * Architecture: Uses SwarmMemoryManager for all persistence (storeLearningExperience,
   * upsertQValue, storeLearningSnapshot) instead of LearningPersistence adapter.
   */
  async learnFromExecution(
    task: any,
    result: any,
    feedback?: LearningFeedback
  ): Promise<LearningOutcome> {
    if (!this.config.enabled) {
      return this.createOutcome(false, 0, 0);
    }

    try {
      // Extract experience from task execution
      const experience = this.extractExperience(task, result, feedback);
      const reward = this.calculateReward(result, feedback);
      experience.reward = reward;

      // Store in memory (fast)
      this.experiences.push(experience);

      // Update Q-table (in-memory)
      await this.updateQTable(experience);

      // Persist to database via memoryStore (replaces persistence adapter)
      // Only if memoryStore is SwarmMemoryManager
      if (this.memoryStore && typeof (this.memoryStore as any).storeLearningExperience === "function") {
        try {
          // Store experience
          await this.memoryStore.storeLearningExperience({
            agentId: this.agentId,
            taskId: experience.taskId,
            taskType: experience.taskType,
            state: JSON.stringify(experience.state),
            action: JSON.stringify(experience.action),
            reward: experience.reward,
            nextState: JSON.stringify(experience.nextState)
          });

          // Persist Q-value
          const stateKey = this.stateExtractor.encodeState(experience.state);
          const actionKey = this.stateExtractor.encodeAction(experience.action);
          const stateActions = this.qTable.get(stateKey);
          const qValue = stateActions?.get(actionKey) || 0;

          await this.memoryStore.upsertQValue(
            this.agentId,
            stateKey,
            actionKey,
            qValue
          );
        } catch (persistError) {
          this.logger.warn('Persistence failed, continuing with in-memory learning:', persistError);
          // Don't fail learning due to persistence errors
        }
      }

      // Update patterns
      await this.updatePatterns(experience);

      // Detect failure patterns
      if (!result.success) {
        await this.detectFailurePattern(experience);
      }

      // Increment task count
      this.taskCount++;

      // Periodic batch update and snapshot
      if (this.taskCount % this.config.updateFrequency === 0) {
        await this.performBatchUpdate();

        // Store learning snapshot via memoryStore
        if (this.memoryStore && typeof (this.memoryStore as any).storeLearningExperience === "function") {
          const improvement = await this.calculateImprovement();
          await this.memoryStore.storeLearningSnapshot({
            agentId: this.agentId,
            snapshotType: 'performance',
            metrics: {
              qTableSize: this.qTable.size
            },
            totalExperiences: this.experiences.length,
            improvementRate: improvement.improvementRate,
            explorationRate: this.config.explorationRate
          });
        }
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
    } catch (error) {
      this.logger.error(`Learning from execution failed:`, error);
      return this.createOutcome(false, 0, 0);
    }
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
   * Get learned patterns for this agent
   * Now queries from memoryStore (SwarmMemoryManager) with agent filtering
   */
  async getPatterns(): Promise<LearnedPattern[]> {
    try {
      // Query patterns from memoryStore if available
      if (!this.memoryStore || typeof this.memoryStore.queryPatternsByAgent !== 'function') {
        return [];
      }

      // Use agent-specific query to avoid mixing patterns from different agents
      const dbPatterns = await this.memoryStore.queryPatternsByAgent(this.agentId, 0);

      return dbPatterns.map((p: any) => ({
        id: p.id, // Use existing ID, don't generate new ones
        pattern: p.pattern,
        confidence: p.confidence,
        successRate: p.metadata?.success_rate || 0.5,
        usageCount: p.usageCount || 0,
        contexts: p.metadata?.contexts || [],
        createdAt: p.metadata?.created_at ? new Date(p.metadata.created_at) : new Date(),
        lastUsedAt: p.metadata?.last_used_at ? new Date(p.metadata.last_used_at) : new Date()
      }));
    } catch (error) {
      this.logger.warn('Failed to query patterns:', error);
      return [];
    }
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
      availableResources: this.stateExtractor.extractState(task).availableResources,
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
   * Now uses memoryStore persistence with agent filtering instead of in-memory Map
   */
  private async updatePatterns(experience: TaskExperience): Promise<void> {
    const patternKey = `${experience.taskType}:${experience.action.strategy}`;

    try {
      // Try to query existing pattern from memoryStore (agent-specific)
      let existingPattern: LearnedPattern | null = null;

      if (this.memoryStore && typeof this.memoryStore.queryPatternsByAgent === 'function') {
        const agentPatterns = await this.memoryStore.queryPatternsByAgent(this.agentId, 0);
        const found = agentPatterns.find((p: any) => p.pattern === patternKey);

        if (found && found.metadata) {
          const metadata = typeof found.metadata === 'string'
            ? JSON.parse(found.metadata)
            : found.metadata;

          existingPattern = {
            id: found.id || uuidv4(),
            pattern: found.pattern,
            confidence: found.confidence,
            successRate: metadata.success_rate || 0.5,
            usageCount: found.usageCount,
            contexts: metadata.contexts || [experience.taskType],
            createdAt: metadata.created_at ? new Date(metadata.created_at) : new Date(),
            lastUsedAt: metadata.last_used_at ? new Date(metadata.last_used_at) : new Date()
          };
        }
      }

      if (existingPattern) {
        // Update existing pattern
        existingPattern.usageCount++;
        existingPattern.lastUsedAt = new Date();

        // Update success rate
        if (experience.reward > 0) {
          existingPattern.successRate = (existingPattern.successRate * (existingPattern.usageCount - 1) + 1) / existingPattern.usageCount;
        } else {
          existingPattern.successRate = (existingPattern.successRate * (existingPattern.usageCount - 1)) / existingPattern.usageCount;
        }

        // Update confidence
        existingPattern.confidence = Math.min(0.95, existingPattern.confidence + 0.01);

        // Persist pattern update to database
        await this.memoryStore.storePattern({
          id: existingPattern.id,
          pattern: existingPattern.pattern,
          confidence: existingPattern.confidence,
          usageCount: existingPattern.usageCount,
          metadata: {
            agent_id: this.agentId,
            success_rate: existingPattern.successRate,
            contexts: existingPattern.contexts,
            created_at: existingPattern.createdAt,
            last_used_at: existingPattern.lastUsedAt
          }
        });
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

        // Persist new pattern to database
        await this.memoryStore.storePattern({
          id: pattern.id,
          pattern: pattern.pattern,
          confidence: pattern.confidence,
          usageCount: pattern.usageCount,
          metadata: {
            agent_id: this.agentId,
            success_rate: pattern.successRate,
            contexts: pattern.contexts,
            created_at: pattern.createdAt,
            last_used_at: pattern.lastUsedAt
          }
        });

        // Emit pattern discovered event
        await this.emitLearningEvent('pattern_discovered', pattern);
      }
    } catch (error) {
      this.logger.warn('Failed to update patterns:', error);
      // Continue execution even if pattern update fails
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
  private async createOutcome(
    improved: boolean,
    previous: number,
    current: number,
    rate: number = 0
  ): Promise<LearningOutcome> {
    const patterns = await this.getPatterns();
    return {
      improved,
      previousPerformance: previous,
      newPerformance: current,
      improvementRate: rate,
      confidence: Math.min(0.95, this.experiences.length / 100),
      patterns: patterns.slice(0, 5),
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
    const patterns = await this.getPatterns();
    const state: LearningModelState = {
      agentId: this.agentId,
      qTable: this.serializeQTable(),
      experiences: this.experiences.slice(-1000), // keep last 1000
      patterns,
      config: this.config,
      performance: await this.getCurrentPerformance(),
      version: PACKAGE_VERSION,
      lastUpdated: new Date(),
      size: await this.calculateStateSize()
    };

    // Check size limit
    if (state.size > this.config.maxMemorySize) {
      this.logger.warn(`Learning state exceeds max size (${state.size} bytes), pruning...`);
      // Fix: Prune in-memory array, not just saved state
      this.experiences = this.experiences.slice(-500);
      state.experiences = this.experiences;
      state.size = await this.calculateStateSize();
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
   * Pattern Map removed - patterns now persisted directly via memoryStore.storePattern()
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
        // REMOVED: this.patterns = new Map(state.patterns.map(p => [p.pattern, p]));
        // Patterns are now persisted via memoryStore.storePattern() and queried via queryPatternsByConfidence()
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
   * Serialize Q-table for QLearning import (converts to QValue format)
   */
  private serializeQTableForQLearning(): Record<string, Record<string, any>> {
    const serialized: Record<string, Record<string, any>> = {};
    for (const [state, actions] of this.qTable.entries()) {
      serialized[state] = {};
      for (const [action, value] of actions.entries()) {
        serialized[state][action] = {
          state,
          action,
          value,
          updateCount: 1,
          lastUpdated: Date.now()
        };
      }
    }
    return serialized;
  }

  /**
   * Deserialize Q-table from QLearning export (extracts values from QValue format)
   */
  private deserializeQTableFromQLearning(data: Record<string, Record<string, any>>): void {
    this.qTable.clear();
    for (const [state, actions] of Object.entries(data)) {
      const actionMap = new Map<string, number>();
      for (const [action, qValue] of Object.entries(actions)) {
        actionMap.set(action, qValue.value);
      }
      this.qTable.set(state, actionMap);
    }
  }

  /**
   * Calculate state size in bytes
   */
  private async calculateStateSize(): Promise<number> {
    const patterns = await this.getPatterns();
    return JSON.stringify({
      qTable: this.serializeQTable(),
      experiences: this.experiences,
      patterns
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

  /**
   * Enable Q-learning mode (Phase 2 Integration)
   * Switches from basic Q-table to full QLearning algorithm with experience replay
   */
  enableQLearning(config?: Partial<QLearningConfig>): void {
    const qLearningConfig: Partial<QLearningConfig> = {
      learningRate: this.config.learningRate,
      discountFactor: this.config.discountFactor,
      explorationRate: this.config.explorationRate,
      explorationDecay: this.config.explorationDecay,
      minExplorationRate: this.config.minExplorationRate,
      useExperienceReplay: true,
      replayBufferSize: 10000,
      batchSize: this.config.batchSize,
      ...config
    };

    this.qLearning = new QLearning(qLearningConfig);
    this.useQLearning = true;

    // Import existing Q-table into QLearning if we have data
    if (this.qTable.size > 0) {
      const serialized = this.serializeQTableForQLearning();
      this.qLearning.import({
        qTable: serialized,
        config: qLearningConfig as QLearningConfig,
        stepCount: this.taskCount,
        episodeCount: Math.floor(this.taskCount / 10)
      });
    }

    this.logger.info(`Q-learning mode enabled for agent ${this.agentId}`, {
      config: qLearningConfig
    });
  }

  /**
   * Disable Q-learning mode (revert to basic implementation)
   */
  disableQLearning(): void {
    if (this.qLearning && this.useQLearning) {
      // Export Q-learning state to basic Q-table
      const exported = this.qLearning.export();
      this.deserializeQTableFromQLearning(exported.qTable);
    }

    this.qLearning = undefined;
    this.useQLearning = false;

    this.logger.info(`Q-learning mode disabled for agent ${this.agentId}`);
  }

  /**
   * Learn from experience using Q-learning (when enabled)
   * This method integrates with the QLearning algorithm
   */
  async learnFromExperience(experience: TaskExperience): Promise<void> {
    if (!this.config.enabled) {
      return;
    }

    if (this.useQLearning && this.qLearning) {
      // Use QLearning algorithm
      this.qLearning.update(experience);
      this.experiences.push(experience);

      // Perform batch update periodically
      if (this.taskCount % this.config.updateFrequency === 0) {
        this.qLearning.batchUpdate();
      }

      // End episode periodically to trigger exploration decay
      if (this.taskCount % 10 === 0) {
        this.qLearning.endEpisode();
      }
    } else {
      // Use legacy Q-table implementation
      await this.updateQTable(experience);
      this.experiences.push(experience);
    }

    this.taskCount++;
    // Fix: Decay exploration rate after each experience
    this.decayExploration();
  }

  /**
   * Select action with policy (Q-learning integration)
   * Uses epsilon-greedy policy when Q-learning is enabled
   */
  async selectActionWithPolicy(state: TaskState, availableActions: AgentAction[]): Promise<AgentAction> {
    if (this.useQLearning && this.qLearning) {
      // Use Q-learning's epsilon-greedy policy
      return this.qLearning.selectAction(state, availableActions);
    }

    // Fallback to recommendation-based selection
    const recommendation = await this.recommendStrategy(state);

    // Find the action matching the recommended strategy
    const matchingAction = availableActions.find(
      action => action.strategy === recommendation.strategy
    );

    return matchingAction || availableActions[0];
  }

  /**
   * Get Q-learning statistics (when enabled)
   */
  getQLearningStats(): {
    enabled: boolean;
    stats?: {
      steps: number;
      episodes: number;
      tableSize: number;
      explorationRate: number;
      avgQValue: number;
      maxQValue: number;
      minQValue: number;
    };
  } {
    if (!this.useQLearning || !this.qLearning) {
      return { enabled: false };
    }

    return {
      enabled: true,
      stats: this.qLearning.getStatistics()
    };
  }

  /**
   * Check if Q-learning mode is enabled
   */
  isQLearningEnabled(): boolean {
    return this.useQLearning;
  }

  /**
   * Cleanup resources (timers, connections)
   * Call this before destroying the LearningEngine instance
   *
   * Architecture: No cleanup needed - LearningEngine no longer manages Database instances.
   * The shared SwarmMemoryManager handles database lifecycle management.
   */
  dispose(): void {
    // No resources to clean up - memoryStore is managed externally
    this.logger.debug(`LearningEngine disposed for agent ${this.agentId}`);
  }
}
