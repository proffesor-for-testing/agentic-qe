/**
 * Learning Event Listener
 *
 * Automatic learning persistence system that listens to agent execution events
 * and stores learning data as a safety net when agents don't explicitly call
 * MCP learning tools.
 *
 * This implements a hybrid approach:
 * 1. PRIMARY: Agents call MCP tools explicitly (Claude Flow's proven pattern)
 * 2. FALLBACK: Event listeners auto-persist (our innovation for reliability)
 *
 * @version 1.0.0
 */

import { EventEmitter } from 'events';
import type { SwarmMemoryManager } from '../../core/memory/SwarmMemoryManager';
import type { LearningStoreExperienceHandler } from '../handlers/learning/learning-store-experience';
import type { LearningStoreQValueHandler } from '../handlers/learning/learning-store-qvalue';
import type { LearningStorePatternHandler } from '../handlers/learning/learning-store-pattern';

export interface AgentExecutionEvent {
  agentId: string;
  taskType: string;
  taskDescription: string;
  startTime: number;
  endTime?: number;
  result?: any;
  error?: Error;
  metadata?: Record<string, any>;
}

export interface LearningData {
  experiences: number;
  qValues: number;
  patterns: number;
  source: 'explicit' | 'auto';
}

export class LearningEventListener {
  private eventBus: EventEmitter;
  private memoryManager: SwarmMemoryManager;
  private storeExperienceHandler: LearningStoreExperienceHandler;
  private storeQValueHandler: LearningStoreQValueHandler;
  private storePatternHandler: LearningStorePatternHandler;

  private activeExecutions: Map<string, AgentExecutionEvent>;
  private learningStats: Map<string, LearningData>;

  private enabled: boolean;
  private autoStore: boolean;

  constructor(
    eventBus: EventEmitter,
    memoryManager: SwarmMemoryManager,
    handlers: {
      storeExperienceHandler: LearningStoreExperienceHandler;
      storeQValueHandler: LearningStoreQValueHandler;
      storePatternHandler: LearningStorePatternHandler;
    },
    options: {
      enabled?: boolean;
      autoStore?: boolean;
    } = {}
  ) {
    this.eventBus = eventBus;
    this.memoryManager = memoryManager;
    this.storeExperienceHandler = handlers.storeExperienceHandler;
    this.storeQValueHandler = handlers.storeQValueHandler;
    this.storePatternHandler = handlers.storePatternHandler;

    this.activeExecutions = new Map();
    this.learningStats = new Map();

    this.enabled = options.enabled !== false;
    this.autoStore = options.autoStore !== false;

    if (this.enabled) {
      this.attachListeners();
    }
  }

  /**
   * Attach event listeners to capture agent execution
   */
  private attachListeners(): void {
    // Listen for agent task start
    this.eventBus.on('agent:task:start', this.handleTaskStart.bind(this));

    // Listen for agent task completion
    this.eventBus.on('agent:task:complete', this.handleTaskComplete.bind(this));

    // Listen for agent task error
    this.eventBus.on('agent:task:error', this.handleTaskError.bind(this));

    // Listen for explicit learning calls (to track and avoid duplicates)
    this.eventBus.on('learning:experience:stored', this.handleExplicitLearning.bind(this));
    this.eventBus.on('learning:qvalue:stored', this.handleExplicitLearning.bind(this));
    this.eventBus.on('learning:pattern:stored', this.handleExplicitLearning.bind(this));

    console.log('[LearningEventListener] Event listeners attached');
  }

  /**
   * Handle agent task start
   */
  private handleTaskStart(event: AgentExecutionEvent): void {
    const executionId = this.getExecutionId(event.agentId, event.startTime);

    this.activeExecutions.set(executionId, {
      ...event,
      startTime: Date.now()
    });

    console.log(`[LearningEventListener] Task started: ${event.agentId} - ${event.taskType}`);
  }

  /**
   * Handle agent task completion
   */
  private async handleTaskComplete(event: AgentExecutionEvent): Promise<void> {
    const executionId = this.getExecutionId(event.agentId, event.startTime);
    const execution = this.activeExecutions.get(executionId);

    if (!execution) {
      console.warn(`[LearningEventListener] No active execution found for ${executionId}`);
      return;
    }

    // Update execution with results
    execution.endTime = Date.now();
    execution.result = event.result;
    execution.metadata = event.metadata;

    // Check if agent already called learning tools explicitly
    const stats = this.learningStats.get(event.agentId);
    const hasExplicitLearning = stats && stats.source === 'explicit';

    if (hasExplicitLearning) {
      console.log(`[LearningEventListener] ✅ Agent ${event.agentId} already called learning tools explicitly`);
      this.activeExecutions.delete(executionId);
      return;
    }

    // Auto-store learning data as fallback
    if (this.autoStore) {
      console.log(`[LearningEventListener] 🔄 Auto-storing learning data for ${event.agentId}`);
      await this.autoStoreLearningData(execution);
    }

    this.activeExecutions.delete(executionId);
  }

  /**
   * Handle agent task error
   */
  private async handleTaskError(event: AgentExecutionEvent): Promise<void> {
    const executionId = this.getExecutionId(event.agentId, event.startTime);
    const execution = this.activeExecutions.get(executionId);

    if (!execution) {
      return;
    }

    execution.endTime = Date.now();
    execution.error = event.error;

    // Still store learning data from failures (important for learning!)
    if (this.autoStore) {
      console.log(`[LearningEventListener] 🔄 Auto-storing learning data from failed task: ${event.agentId}`);
      await this.autoStoreLearningData(execution);
    }

    this.activeExecutions.delete(executionId);
  }

  /**
   * Handle explicit learning tool calls (to avoid duplicates)
   */
  private handleExplicitLearning(event: { agentId: string; type: string }): void {
    const stats = this.learningStats.get(event.agentId) || {
      experiences: 0,
      qValues: 0,
      patterns: 0,
      source: 'explicit'
    };

    if (event.type === 'experience') stats.experiences++;
    if (event.type === 'qvalue') stats.qValues++;
    if (event.type === 'pattern') stats.patterns++;

    this.learningStats.set(event.agentId, stats);

    console.log(`[LearningEventListener] ✅ Explicit learning call detected: ${event.agentId} - ${event.type}`);
  }

  /**
   * Auto-store learning data as fallback
   */
  private async autoStoreLearningData(execution: AgentExecutionEvent): Promise<void> {
    try {
      const { agentId, taskType, result, error, startTime, endTime, metadata } = execution;

      // Calculate reward based on success/failure
      const executionTime = endTime ? endTime - startTime : 0;
      const success = !error && result;
      const reward = this.calculateReward(success, executionTime, result);

      // 1. Store experience
      await this.storeExperienceHandler.handle({
        agentId,
        taskType: taskType || 'unknown',
        reward,
        outcome: result || { error: error?.message },
        metadata: {
          ...metadata,
          autoStored: true,
          executionTime,
          success
        }
      });

      // 2. Store Q-value for the strategy used
      const stateKey = `${taskType}-state`;
      const actionKey = this.extractActionKey(result, metadata);
      const qValue = this.calculateQValue(reward, executionTime);

      await this.storeQValueHandler.handle({
        agentId,
        stateKey,
        actionKey,
        qValue,
        metadata: {
          autoStored: true,
          reward,
          executionTime
        }
      });

      // 3. Store pattern if successful and noteworthy
      if (success && reward > 0.8) {
        const pattern = this.extractPattern(agentId, taskType, result, metadata);
        if (pattern) {
          await this.storePatternHandler.handle({
            agentId,
            pattern,
            confidence: reward,
            domain: taskType,
            metadata: {
              autoStored: true,
              executionTime
            }
          });
        }
      }

      // Update stats
      const stats = this.learningStats.get(agentId) || {
        experiences: 0,
        qValues: 0,
        patterns: 0,
        source: 'auto'
      };

      stats.experiences++;
      stats.qValues++;
      if (success && reward > 0.8) stats.patterns++;

      this.learningStats.set(agentId, stats);

      console.log(`[LearningEventListener] ✅ Auto-stored learning data for ${agentId}`);

    } catch (error) {
      console.error(`[LearningEventListener] Failed to auto-store learning data:`, error);
    }
  }

  /**
   * Calculate reward based on task success and performance
   */
  private calculateReward(success: boolean, executionTime: number, result: any): number {
    if (!success) {
      return 0.3; // Failed tasks still have learning value
    }

    // Base reward for success
    let reward = 0.7;

    // Bonus for fast execution (<10s)
    if (executionTime < 10000) {
      reward += 0.15;
    }

    // Bonus for high-quality results
    if (result) {
      // Check for quality indicators in result
      if (result.coverageImprovement > 0.2) reward += 0.05;
      if (result.testsGenerated > 50) reward += 0.05;
      if (result.accuracy > 0.95) reward += 0.05;
    }

    return Math.min(reward, 1.0);
  }

  /**
   * Calculate Q-value for strategy
   */
  private calculateQValue(reward: number, executionTime: number): number {
    // Q-value represents expected future reward
    // Discount factor for execution time (faster is better)
    const timeFactor = Math.max(0, 1 - executionTime / 60000); // Discount after 1 minute
    return reward * (0.8 + 0.2 * timeFactor);
  }

  /**
   * Extract action key from result/metadata
   */
  private extractActionKey(result: any, metadata: any): string {
    // Try to extract strategy/algorithm used
    if (result?.algorithm) return result.algorithm;
    if (metadata?.algorithm) return metadata.algorithm;
    if (result?.strategy) return result.strategy;
    if (metadata?.strategy) return metadata.strategy;

    return 'default-strategy';
  }

  /**
   * Extract pattern from successful execution
   */
  private extractPattern(
    agentId: string,
    taskType: string,
    result: any,
    metadata: any
  ): string | null {
    // Try to create a meaningful pattern description
    const algorithm = result?.algorithm || metadata?.algorithm;
    const successFactors: string[] = [];

    if (result?.coverageImprovement) {
      successFactors.push(`${(result.coverageImprovement * 100).toFixed(1)}% coverage improvement`);
    }
    if (result?.testsGenerated) {
      successFactors.push(`${result.testsGenerated} tests generated`);
    }
    if (result?.accuracy) {
      successFactors.push(`${(result.accuracy * 100).toFixed(1)}% accuracy`);
    }

    if (successFactors.length > 0) {
      return `${algorithm || 'Strategy'} achieved: ${successFactors.join(', ')}`;
    }

    return null;
  }

  /**
   * Get execution ID
   */
  private getExecutionId(agentId: string, startTime: number): string {
    return `${agentId}-${startTime}`;
  }

  /**
   * Get learning statistics for an agent
   */
  public getStats(agentId: string): LearningData | null {
    return this.learningStats.get(agentId) || null;
  }

  /**
   * Get all learning statistics
   */
  public getAllStats(): Map<string, LearningData> {
    return new Map(this.learningStats);
  }

  /**
   * Enable/disable auto-store
   */
  public setAutoStore(enabled: boolean): void {
    this.autoStore = enabled;
    console.log(`[LearningEventListener] Auto-store ${enabled ? 'enabled' : 'disabled'}`);
  }

  /**
   * Clean up event listeners
   */
  public destroy(): void {
    this.eventBus.removeAllListeners('agent:task:start');
    this.eventBus.removeAllListeners('agent:task:complete');
    this.eventBus.removeAllListeners('agent:task:error');
    this.eventBus.removeAllListeners('learning:experience:stored');
    this.eventBus.removeAllListeners('learning:qvalue:stored');
    this.eventBus.removeAllListeners('learning:pattern:stored');

    console.log('[LearningEventListener] Event listeners removed');
  }
}

/**
 * Singleton instance for easy access
 */
let learningEventListener: LearningEventListener | null = null;

export function initLearningEventListener(
  eventBus: EventEmitter,
  memoryManager: SwarmMemoryManager,
  handlers: {
    storeExperienceHandler: LearningStoreExperienceHandler;
    storeQValueHandler: LearningStoreQValueHandler;
    storePatternHandler: LearningStorePatternHandler;
  },
  options?: {
    enabled?: boolean;
    autoStore?: boolean;
  }
): LearningEventListener {
  if (learningEventListener) {
    learningEventListener.destroy();
  }

  learningEventListener = new LearningEventListener(
    eventBus,
    memoryManager,
    handlers,
    options
  );

  return learningEventListener;
}

export function getLearningEventListener(): LearningEventListener | null {
  return learningEventListener;
}
