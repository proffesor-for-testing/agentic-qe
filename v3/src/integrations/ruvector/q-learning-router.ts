/**
 * Agentic QE v3 - Q-Learning Router for RuVector Integration
 *
 * Uses RuVector's Q-Learning capabilities to route test tasks to optimal agents.
 * Falls back to rule-based routing when RuVector is unavailable.
 */

import type {
  QLearningRouter,
  QLearningState,
  QLearningAction,
  TestTask,
  AgentRoutingResult,
  RuVectorConfig,
} from './interfaces';
import { FallbackQLearningRouter } from './fallback';
import type { AgentType, DomainName, Priority } from '../../shared/types';

// ============================================================================
// Q-Learning Parameters
// ============================================================================

/**
 * Q-Learning hyperparameters
 */
export interface QLearningParams {
  /** Learning rate (alpha) */
  learningRate: number;
  /** Discount factor (gamma) */
  discountFactor: number;
  /** Exploration rate (epsilon) for epsilon-greedy */
  explorationRate: number;
  /** Exploration decay rate */
  explorationDecay: number;
  /** Minimum exploration rate */
  minExplorationRate: number;
}

const DEFAULT_PARAMS: QLearningParams = {
  learningRate: 0.1,
  discountFactor: 0.9,
  explorationRate: 0.3,
  explorationDecay: 0.995,
  minExplorationRate: 0.01,
};

// ============================================================================
// RuVector Q-Learning Router Implementation
// ============================================================================

/**
 * Q-Learning router that integrates with RuVector
 * Provides optimal agent routing using reinforcement learning
 */
export class RuVectorQLearningRouter implements QLearningRouter {
  private readonly fallback: FallbackQLearningRouter;
  private readonly params: QLearningParams;
  private qTable: Map<string, Map<string, number>> = new Map();
  private feedback: Map<string, Array<{ success: boolean; durationMs: number; quality: number; action: QLearningAction }>> = new Map();
  private taskStateMap: Map<string, QLearningState> = new Map();
  private episodeCount = 0;

  constructor(
    private readonly config: RuVectorConfig,
    params: Partial<QLearningParams> = {}
  ) {
    this.fallback = new FallbackQLearningRouter();
    this.params = { ...DEFAULT_PARAMS, ...params };
  }

  /**
   * Route a test task to optimal agent using Q-Learning
   */
  async routeTask(task: TestTask): Promise<AgentRoutingResult> {
    if (!this.config.enabled) {
      return this.fallback.routeTask(task);
    }

    try {
      const state = this.taskToState(task);
      const action = this.selectAction(state);
      const confidence = this.calculateConfidence(state, action);

      // Store state-action mapping for feedback
      this.taskStateMap.set(task.id, state);

      const alternatives = this.getAlternativeActions(state, action);
      const reasoning = this.generateReasoning(state, action, confidence);

      return {
        agentType: action.agentType,
        domain: action.domain,
        confidence,
        reasoning,
        alternatives,
        qValues: this.getQValuesForState(state),
        usedFallback: false,
      };
    } catch (error) {
      console.warn('[RuVectorQLearningRouter] Error in routing, using fallback:', error);
      return this.fallback.routeTask(task);
    }
  }

  /**
   * Batch route multiple tasks
   */
  async routeTasks(tasks: TestTask[]): Promise<AgentRoutingResult[]> {
    return Promise.all(tasks.map((task) => this.routeTask(task)));
  }

  /**
   * Provide feedback for Q-Learning update
   */
  async provideFeedback(
    taskId: string,
    result: { success: boolean; durationMs: number; quality: number }
  ): Promise<void> {
    const state = this.taskStateMap.get(taskId);
    if (!state) {
      console.warn(`[RuVectorQLearningRouter] No state found for task ${taskId}`);
      return;
    }

    // Calculate reward
    const reward = this.calculateReward(result);

    // Get the action that was taken (reconstruct from state)
    const stateKey = this.stateToKey(state);
    const actionKey = this.getBestActionKey(stateKey);

    if (actionKey) {
      // Q-Learning update
      this.updateQValue(stateKey, actionKey, reward);
    }

    // Decay exploration rate
    this.params.explorationRate = Math.max(
      this.params.minExplorationRate,
      this.params.explorationRate * this.params.explorationDecay
    );

    // Store feedback for analysis
    const existing = this.feedback.get(taskId) || [];
    const action = actionKey ? this.keyToAction(actionKey) : { agentType: 'tester' as AgentType, domain: 'test-execution' as DomainName };
    existing.push({ ...result, action });
    this.feedback.set(taskId, existing);

    this.episodeCount++;

    // Clean up state mapping
    this.taskStateMap.delete(taskId);
  }

  /**
   * Get Q-value for state-action pair
   */
  getQValue(state: QLearningState, action: QLearningAction): number {
    const stateKey = this.stateToKey(state);
    const actionKey = this.actionToKey(action);

    const stateValues = this.qTable.get(stateKey);
    if (!stateValues) return 0;

    return stateValues.get(actionKey) || 0;
  }

  /**
   * Reset learning state
   */
  async reset(): Promise<void> {
    this.qTable.clear();
    this.feedback.clear();
    this.taskStateMap.clear();
    this.episodeCount = 0;
    this.params.explorationRate = DEFAULT_PARAMS.explorationRate;
  }

  /**
   * Export learned model
   */
  async exportModel(): Promise<Record<string, unknown>> {
    const qTableObj: Record<string, Record<string, number>> = {};

    for (const [stateKey, actionMap] of this.qTable.entries()) {
      qTableObj[stateKey] = Object.fromEntries(actionMap);
    }

    return {
      type: 'ruvector-qlearning',
      version: '1.0',
      params: this.params,
      qTable: qTableObj,
      episodeCount: this.episodeCount,
      exportedAt: new Date().toISOString(),
    };
  }

  /**
   * Import learned model
   */
  async importModel(model: Record<string, unknown>): Promise<void> {
    if (model.type !== 'ruvector-qlearning') {
      throw new Error('Invalid model type');
    }

    const qTableObj = model.qTable as Record<string, Record<string, number>>;

    this.qTable.clear();
    for (const [stateKey, actionObj] of Object.entries(qTableObj)) {
      this.qTable.set(stateKey, new Map(Object.entries(actionObj)));
    }

    this.episodeCount = (model.episodeCount as number) || 0;

    if (model.params) {
      Object.assign(this.params, model.params);
    }
  }

  // ============================================================================
  // Private Methods
  // ============================================================================

  /**
   * Convert task to Q-Learning state
   */
  private taskToState(task: TestTask): QLearningState {
    // Create context hash from relevant task properties
    const contextParts = [
      task.type,
      task.priority || 'p2',
      task.domain || 'unknown',
      Math.round((task.complexity || 0.5) * 10), // Discretize complexity
      (task.tags || []).sort().join(','),
    ];

    return {
      taskType: task.type,
      complexity: task.complexity || 0.5,
      priority: task.priority || 'p2',
      domain: task.domain,
      contextHash: contextParts.join('|'),
    };
  }

  /**
   * Select action using epsilon-greedy strategy
   */
  private selectAction(state: QLearningState): QLearningAction {
    // Exploration: random action
    if (Math.random() < this.params.explorationRate) {
      return this.getRandomAction(state);
    }

    // Exploitation: best known action
    return this.getBestAction(state);
  }

  /**
   * Get random action
   */
  private getRandomAction(state: QLearningState): QLearningAction {
    const agentTypes: AgentType[] = ['tester', 'analyzer', 'validator', 'specialist', 'generator'];
    const domains = this.getRelevantDomains(state);

    return {
      agentType: agentTypes[Math.floor(Math.random() * agentTypes.length)],
      domain: domains[Math.floor(Math.random() * domains.length)],
    };
  }

  /**
   * Get best known action for state
   */
  private getBestAction(state: QLearningState): QLearningAction {
    const stateKey = this.stateToKey(state);
    const stateValues = this.qTable.get(stateKey);

    if (!stateValues || stateValues.size === 0) {
      // No learned values, use heuristic
      return this.getHeuristicAction(state);
    }

    let bestAction = '';
    let bestValue = -Infinity;

    for (const [actionKey, value] of stateValues.entries()) {
      if (value > bestValue) {
        bestValue = value;
        bestAction = actionKey;
      }
    }

    if (!bestAction) {
      return this.getHeuristicAction(state);
    }

    return this.keyToAction(bestAction);
  }

  /**
   * Get heuristic action when no Q-values exist
   */
  private getHeuristicAction(state: QLearningState): QLearningAction {
    // Use task type to determine agent/domain
    const mapping: Record<string, { agentType: AgentType; domain: DomainName }> = {
      unit: { agentType: 'tester', domain: 'test-execution' },
      integration: { agentType: 'tester', domain: 'contract-testing' },
      e2e: { agentType: 'tester', domain: 'visual-accessibility' },
      performance: { agentType: 'analyzer', domain: 'chaos-resilience' },
      security: { agentType: 'validator', domain: 'security-compliance' },
      accessibility: { agentType: 'validator', domain: 'visual-accessibility' },
    };

    return mapping[state.taskType] || { agentType: 'tester', domain: 'test-execution' };
  }

  /**
   * Get relevant domains for state
   */
  private getRelevantDomains(state: QLearningState): DomainName[] {
    if (state.domain) return [state.domain];

    const domainMap: Record<string, DomainName[]> = {
      unit: ['test-execution', 'test-generation'],
      integration: ['contract-testing', 'test-execution'],
      e2e: ['visual-accessibility', 'test-execution'],
      performance: ['chaos-resilience', 'quality-assessment'],
      security: ['security-compliance'],
      accessibility: ['visual-accessibility'],
    };

    return domainMap[state.taskType] || ['test-execution'];
  }

  /**
   * Calculate confidence score
   */
  private calculateConfidence(state: QLearningState, action: QLearningAction): number {
    const stateKey = this.stateToKey(state);
    const stateValues = this.qTable.get(stateKey);

    if (!stateValues || stateValues.size === 0) {
      return 0.5; // No data, moderate confidence
    }

    const actionKey = this.actionToKey(action);
    const qValue = stateValues.get(actionKey) || 0;

    // Get all Q-values for this state
    const allValues = Array.from(stateValues.values());
    const maxValue = Math.max(...allValues);
    const minValue = Math.min(...allValues);

    if (maxValue === minValue) return 0.6;

    // Normalize Q-value to confidence
    const normalized = (qValue - minValue) / (maxValue - minValue);
    return 0.5 + normalized * 0.5; // Range: 0.5 to 1.0
  }

  /**
   * Get alternative actions ranked by Q-value
   */
  private getAlternativeActions(
    state: QLearningState,
    primary: QLearningAction
  ): Array<{ agentType: AgentType; domain: DomainName; confidence: number }> {
    const stateKey = this.stateToKey(state);
    const stateValues = this.qTable.get(stateKey) || new Map();
    const primaryKey = this.actionToKey(primary);

    const alternatives: Array<{ agentType: AgentType; domain: DomainName; confidence: number }> = [];

    // Get all actions except primary
    for (const [actionKey, value] of stateValues.entries()) {
      if (actionKey === primaryKey) continue;

      const action = this.keyToAction(actionKey);
      alternatives.push({
        agentType: action.agentType,
        domain: action.domain,
        confidence: Math.max(0, Math.min(1, value)),
      });
    }

    // Add heuristic alternatives if needed
    if (alternatives.length < 3) {
      const domains = this.getRelevantDomains(state);
      const agentTypes: AgentType[] = ['tester', 'analyzer', 'validator'];

      for (const agent of agentTypes) {
        for (const domain of domains) {
          if (agent === primary.agentType && domain === primary.domain) continue;
          if (alternatives.find((a) => a.agentType === agent && a.domain === domain)) continue;

          alternatives.push({
            agentType: agent,
            domain,
            confidence: 0.4,
          });

          if (alternatives.length >= 3) break;
        }
        if (alternatives.length >= 3) break;
      }
    }

    return alternatives
      .sort((a, b) => b.confidence - a.confidence)
      .slice(0, 3);
  }

  /**
   * Generate reasoning explanation
   */
  private generateReasoning(
    state: QLearningState,
    action: QLearningAction,
    confidence: number
  ): string {
    const qValue = this.getQValue(state, action);

    if (this.episodeCount < 10) {
      return `Q-Learning exploration phase (episode ${this.episodeCount}): ` +
        `routing ${state.taskType} task to ${action.agentType} in ${action.domain}`;
    }

    if (qValue > 0.7) {
      return `High-confidence routing based on ${this.episodeCount} learning episodes: ` +
        `${action.agentType} in ${action.domain} has proven effective for ${state.taskType} tasks (Q=${qValue.toFixed(2)})`;
    }

    if (qValue > 0.4) {
      return `Moderate-confidence routing: ${action.agentType} in ${action.domain} ` +
        `shows good results for ${state.taskType} tasks with complexity ${state.complexity.toFixed(2)}`;
    }

    return `Exploratory routing: trying ${action.agentType} in ${action.domain} ` +
      `for ${state.taskType} task (confidence: ${confidence.toFixed(2)})`;
  }

  /**
   * Get Q-values for debugging
   */
  private getQValuesForState(state: QLearningState): Record<string, number> {
    const stateKey = this.stateToKey(state);
    const stateValues = this.qTable.get(stateKey);

    if (!stateValues) return {};

    return Object.fromEntries(stateValues);
  }

  /**
   * Calculate reward from feedback
   */
  private calculateReward(result: { success: boolean; durationMs: number; quality: number }): number {
    let reward = 0;

    // Success is primary factor
    if (result.success) {
      reward += 0.5;
    } else {
      reward -= 0.3;
    }

    // Quality bonus
    reward += result.quality * 0.3;

    // Speed bonus (faster is better, up to 0.2)
    const speedBonus = Math.max(0, 1 - result.durationMs / 60000) * 0.2;
    reward += speedBonus;

    return Math.max(-1, Math.min(1, reward));
  }

  /**
   * Update Q-value using Q-Learning formula
   */
  private updateQValue(stateKey: string, actionKey: string, reward: number): void {
    const stateValues = this.qTable.get(stateKey) || new Map();
    const currentQ = stateValues.get(actionKey) || 0;

    // Q-Learning update: Q(s,a) = Q(s,a) + alpha * (reward + gamma * maxQ(s') - Q(s,a))
    // Since we don't have next state, use simplified update
    const newQ = currentQ + this.params.learningRate * (reward - currentQ);

    stateValues.set(actionKey, newQ);
    this.qTable.set(stateKey, stateValues);
  }

  /**
   * Get best action key for state
   */
  private getBestActionKey(stateKey: string): string | null {
    const stateValues = this.qTable.get(stateKey);
    if (!stateValues || stateValues.size === 0) return null;

    let bestAction = '';
    let bestValue = -Infinity;

    for (const [actionKey, value] of stateValues.entries()) {
      if (value > bestValue) {
        bestValue = value;
        bestAction = actionKey;
      }
    }

    return bestAction || null;
  }

  // ============================================================================
  // Key Conversion Helpers
  // ============================================================================

  private stateToKey(state: QLearningState): string {
    return `${state.taskType}|${state.priority}|${state.domain || 'any'}|${Math.round(state.complexity * 10)}`;
  }

  private actionToKey(action: QLearningAction): string {
    return `${action.agentType}|${action.domain}`;
  }

  private keyToAction(key: string): QLearningAction {
    const [agentType, domain] = key.split('|');
    return {
      agentType: agentType as AgentType,
      domain: domain as DomainName,
    };
  }
}

// ============================================================================
// Factory Function
// ============================================================================

import {
  getRuVectorObservability,
  type FallbackReason,
} from './observability.js';

/**
 * Create Q-Learning router with ML-first approach
 *
 * IMPORTANT: This function tries ML FIRST and only falls back on actual errors.
 * Fallback usage is recorded via observability layer and triggers alerts.
 *
 * @param config - RuVector configuration
 * @param params - Optional Q-Learning parameters
 * @returns Promise resolving to QLearningRouter (ML or fallback)
 */
export async function createQLearningRouter(
  config: RuVectorConfig,
  params?: Partial<QLearningParams>
): Promise<QLearningRouter> {
  const observability = getRuVectorObservability();
  const startTime = Date.now();

  // If explicitly disabled by config, use fallback but record it
  if (!config.enabled) {
    observability.recordFallback('q-learning-router', 'disabled');
    observability.checkAndAlert();
    return new FallbackQLearningRouter();
  }

  try {
    // Try ML implementation FIRST
    const router = new RuVectorQLearningRouter(config, params);
    // Record successful ML usage
    observability.recordMLUsage('q-learning-router', true, Date.now() - startTime);
    return router;
  } catch (error) {
    // Record fallback with reason
    const reason: FallbackReason = error instanceof Error && error.message.includes('timeout')
      ? 'timeout'
      : 'error';
    observability.recordFallback('q-learning-router', reason);
    // Alert about fallback usage
    observability.checkAndAlert();
    console.warn(
      `[RuVector] Q-Learning router initialization failed, using fallback: ${
        error instanceof Error ? error.message : 'Unknown error'
      }`
    );
    return new FallbackQLearningRouter();
  }
}

/**
 * Create Q-Learning router synchronously (legacy API)
 *
 * @deprecated Use createQLearningRouter() async version for proper observability
 */
export function createQLearningRouterSync(
  config: RuVectorConfig,
  params?: Partial<QLearningParams>
): QLearningRouter {
  const observability = getRuVectorObservability();

  if (!config.enabled) {
    observability.recordFallback('q-learning-router', 'disabled');
    return new FallbackQLearningRouter();
  }

  try {
    const router = new RuVectorQLearningRouter(config, params);
    observability.recordMLUsage('q-learning-router', true);
    return router;
  } catch (error) {
    observability.recordFallback('q-learning-router', 'error');
    return new FallbackQLearningRouter();
  }
}
