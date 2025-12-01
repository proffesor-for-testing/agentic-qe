/**
 * StrategyApplicator - Applies Feedback Strategies to Agents
 *
 * Takes feedback events and applies the recommended strategies
 * by updating agent memory, triggering retraining, or executing commands.
 *
 * @module alerting/StrategyApplicator
 * @version 1.0.0
 */

import { EventEmitter } from 'events';
import {
  FeedbackEvent,
  Strategy,
  StrategyAction,
  FeedbackActionType
} from './types';

/**
 * Result of applying a strategy
 */
export interface ApplicationResult {
  feedbackId: string;
  strategyId: string;
  success: boolean;
  actionsExecuted: number;
  actionsFailed: number;
  results: ActionResult[];
  duration: number;
  timestamp: Date;
}

export interface ActionResult {
  action: StrategyAction;
  success: boolean;
  error?: string;
  output?: unknown;
}

/**
 * Memory interface for agent memory updates
 */
export interface MemoryInterface {
  store(namespace: string, key: string, value: unknown): Promise<void>;
  retrieve(namespace: string, key: string): Promise<unknown>;
}

/**
 * Agent interface for notifications
 */
export interface AgentInterface {
  notify(agentId: string, event: { type: string; data: unknown }): Promise<void>;
}

/**
 * StrategyApplicator applies feedback strategies to agents and systems.
 *
 * @example
 * ```typescript
 * const applicator = new StrategyApplicator(memoryStore, agentBus);
 * const result = await applicator.apply(feedbackEvent, strategy);
 * ```
 */
export class StrategyApplicator extends EventEmitter {
  private memory?: MemoryInterface;
  private agents?: AgentInterface;
  private applicationHistory: ApplicationResult[] = [];
  private successfulStrategies: Map<string, number> = new Map();
  private failedStrategies: Map<string, number> = new Map();

  constructor(memory?: MemoryInterface, agents?: AgentInterface) {
    super();
    this.memory = memory;
    this.agents = agents;
  }

  /**
   * Apply a feedback event's strategy
   */
  async apply(feedback: FeedbackEvent, strategy?: Strategy): Promise<ApplicationResult> {
    const startTime = Date.now();
    const results: ActionResult[] = [];

    // Get strategy actions
    const actions = strategy?.actions || this.getDefaultActions(feedback);

    // Execute each action
    for (const action of actions) {
      const result = await this.executeAction(action, feedback);
      results.push(result);
    }

    const successful = results.filter(r => r.success).length;
    const failed = results.filter(r => !r.success).length;

    const applicationResult: ApplicationResult = {
      feedbackId: feedback.id,
      strategyId: strategy?.id || 'default',
      success: failed === 0,
      actionsExecuted: successful,
      actionsFailed: failed,
      results,
      duration: Date.now() - startTime,
      timestamp: new Date()
    };

    this.applicationHistory.push(applicationResult);
    this.updateStats(strategy?.id || 'default', applicationResult.success);

    this.emit('strategy:applied', applicationResult);

    return applicationResult;
  }

  /**
   * Execute a single strategy action
   */
  private async executeAction(action: StrategyAction, feedback: FeedbackEvent): Promise<ActionResult> {
    try {
      switch (action.type) {
        case 'config_change':
          return await this.executeConfigChange(action, feedback);

        case 'agent_retrain':
          return await this.executeAgentRetrain(action, feedback);

        case 'threshold_adjust':
          return await this.executeThresholdAdjust(action, feedback);

        case 'notify':
          return await this.executeNotify(action, feedback);

        case 'execute_command':
          return await this.executeCommand(action, feedback);

        default:
          return {
            action,
            success: false,
            error: `Unknown action type: ${action.type}`
          };
      }
    } catch (error) {
      return {
        action,
        success: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  /**
   * Execute config change action
   */
  private async executeConfigChange(action: StrategyAction, feedback: FeedbackEvent): Promise<ActionResult> {
    if (!this.memory) {
      return { action, success: false, error: 'Memory interface not configured' };
    }

    const namespace = `aqe/config/${action.target}`;
    const key = `strategy_${feedback.id}`;

    await this.memory.store(namespace, key, {
      parameters: action.parameters,
      appliedAt: new Date().toISOString(),
      feedbackId: feedback.id,
      alertId: feedback.alertId
    });

    this.emit('action:config_change', { action, feedback, target: action.target });

    return {
      action,
      success: true,
      output: { namespace, key, parameters: action.parameters }
    };
  }

  /**
   * Execute agent retrain action
   */
  private async executeAgentRetrain(action: StrategyAction, feedback: FeedbackEvent): Promise<ActionResult> {
    if (!this.memory) {
      return { action, success: false, error: 'Memory interface not configured' };
    }

    const namespace = `aqe/learning/${action.target}`;

    // Store retrain signal
    await this.memory.store(namespace, 'retrain_signal', {
      triggered: true,
      reason: feedback.type,
      feedbackId: feedback.id,
      parameters: action.parameters,
      timestamp: new Date().toISOString()
    });

    // Store experience for learning
    await this.memory.store(namespace, `experience_${feedback.id}`, {
      alertType: feedback.metadata.alertName,
      strategy: feedback.strategy,
      suggestions: feedback.suggestions,
      confidence: feedback.confidence
    });

    this.emit('action:retrain', { action, feedback, target: action.target });

    return {
      action,
      success: true,
      output: { namespace, retrainTriggered: true }
    };
  }

  /**
   * Execute threshold adjustment action
   */
  private async executeThresholdAdjust(action: StrategyAction, feedback: FeedbackEvent): Promise<ActionResult> {
    if (!this.memory) {
      return { action, success: false, error: 'Memory interface not configured' };
    }

    const namespace = 'aqe/thresholds';
    const currentThresholds = await this.memory.retrieve(namespace, action.target) || {};

    const newThresholds = {
      ...(currentThresholds as object),
      ...action.parameters,
      updatedAt: new Date().toISOString(),
      updatedBy: `feedback_${feedback.id}`
    };

    await this.memory.store(namespace, action.target, newThresholds);

    this.emit('action:threshold_adjust', { action, feedback, newThresholds });

    return {
      action,
      success: true,
      output: { target: action.target, thresholds: newThresholds }
    };
  }

  /**
   * Execute notify action
   */
  private async executeNotify(action: StrategyAction, feedback: FeedbackEvent): Promise<ActionResult> {
    const targetAgent = action.target;

    // If we have an agent interface, use it
    if (this.agents) {
      await this.agents.notify(targetAgent, {
        type: 'feedback_action',
        data: {
          feedbackId: feedback.id,
          alertId: feedback.alertId,
          action: action.parameters.action,
          parameters: action.parameters,
          severity: feedback.severity,
          suggestions: feedback.suggestions
        }
      });
    }

    // Also store in memory for agents to pick up
    if (this.memory) {
      await this.memory.store(`aqe/notifications/${targetAgent}`, feedback.id, {
        type: 'feedback_action',
        action: action.parameters,
        timestamp: new Date().toISOString(),
        read: false
      });
    }

    this.emit('action:notify', { action, feedback, target: targetAgent });

    return {
      action,
      success: true,
      output: { notified: targetAgent, action: action.parameters }
    };
  }

  /**
   * Execute command action
   */
  private async executeCommand(action: StrategyAction, feedback: FeedbackEvent): Promise<ActionResult> {
    // For safety, we don't execute arbitrary commands
    // Instead, we emit an event for a controlled executor
    this.emit('action:execute_command', {
      action,
      feedback,
      command: action.target,
      parameters: action.parameters
    });

    return {
      action,
      success: true,
      output: { commandQueued: action.target, parameters: action.parameters }
    };
  }

  /**
   * Get default actions for feedback type
   */
  private getDefaultActions(feedback: FeedbackEvent): StrategyAction[] {
    const actionsByType: Record<FeedbackActionType, StrategyAction[]> = {
      'adjust_strategy': [
        { type: 'notify', target: feedback.targetAgent || 'qe-coordinator', parameters: { action: 'adjust' } },
        { type: 'config_change', target: 'strategy', parameters: { suggestions: feedback.suggestions } }
      ],
      'retrain_model': [
        { type: 'agent_retrain', target: feedback.targetAgent || 'default', parameters: {} },
        { type: 'notify', target: feedback.targetAgent || 'qe-coordinator', parameters: { action: 'retrain' } }
      ],
      'auto_remediate': [
        { type: 'notify', target: feedback.targetAgent || 'qe-coordinator', parameters: { action: 'remediate' } },
        { type: 'config_change', target: 'remediation', parameters: { suggestions: feedback.suggestions } }
      ],
      'escalate': [
        { type: 'notify', target: 'human-operator', parameters: { action: 'review', severity: feedback.severity } }
      ]
    };

    return actionsByType[feedback.type] || actionsByType['adjust_strategy'];
  }

  /**
   * Update success/failure statistics
   */
  private updateStats(strategyId: string, success: boolean): void {
    if (success) {
      const count = this.successfulStrategies.get(strategyId) || 0;
      this.successfulStrategies.set(strategyId, count + 1);
    } else {
      const count = this.failedStrategies.get(strategyId) || 0;
      this.failedStrategies.set(strategyId, count + 1);
    }
  }

  /**
   * Get strategy effectiveness statistics
   */
  getStrategyStats(): Map<string, { success: number; failed: number; rate: number }> {
    const stats = new Map<string, { success: number; failed: number; rate: number }>();

    const allStrategies = new Set([
      ...Array.from(this.successfulStrategies.keys()),
      ...Array.from(this.failedStrategies.keys())
    ]);

    for (const strategyId of Array.from(allStrategies)) {
      const success = this.successfulStrategies.get(strategyId) || 0;
      const failed = this.failedStrategies.get(strategyId) || 0;
      const total = success + failed;
      stats.set(strategyId, {
        success,
        failed,
        rate: total > 0 ? success / total : 0
      });
    }

    return stats;
  }

  /**
   * Get application history
   */
  getApplicationHistory(limit = 100): ApplicationResult[] {
    return this.applicationHistory.slice(-limit);
  }

  /**
   * Set memory interface
   */
  setMemoryInterface(memory: MemoryInterface): void {
    this.memory = memory;
  }

  /**
   * Set agent interface
   */
  setAgentInterface(agents: AgentInterface): void {
    this.agents = agents;
  }
}
