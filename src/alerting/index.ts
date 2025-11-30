/**
 * Alerting System - Main Entry Point
 *
 * Exports all alerting components for the autonomous feedback loop.
 *
 * @module alerting
 * @version 1.0.0
 */

export * from './types';
export { AlertManager } from './AlertManager';
export { FeedbackRouter, type FeedbackRouterConfig } from './FeedbackRouter';
export {
  StrategyApplicator,
  type ApplicationResult,
  type ActionResult,
  type MemoryInterface,
  type AgentInterface
} from './StrategyApplicator';

import { AlertManager } from './AlertManager';
import { FeedbackRouter } from './FeedbackRouter';
import { StrategyApplicator, MemoryInterface, AgentInterface } from './StrategyApplicator';
import { AlertingConfig, FeedbackEvent, Alert, Strategy } from './types';

/**
 * Complete alerting system with connected components
 */
export class AlertingSystem {
  public readonly alertManager: AlertManager;
  public readonly feedbackRouter: FeedbackRouter;
  public readonly strategyApplicator: StrategyApplicator;

  constructor(
    config?: Partial<AlertingConfig>,
    memory?: MemoryInterface,
    agents?: AgentInterface
  ) {
    this.alertManager = new AlertManager(config);
    this.feedbackRouter = new FeedbackRouter();
    this.strategyApplicator = new StrategyApplicator(memory, agents);

    this.wireComponents();
  }

  /**
   * Wire components together for autonomous operation
   */
  private wireComponents(): void {
    // Alert fires -> generate feedback
    this.alertManager.on('alert:feedback', (data: {
      alert: Alert;
      feedbackAction: string;
      strategy: string;
      targetAgent?: string;
    }) => {
      const feedback = this.feedbackRouter.route(data.alert);
      if (feedback) {
        // Find strategy and apply
        const strategies = this.feedbackRouter.getStrategies();
        const strategy = strategies.find(s => s.id === feedback.strategy);
        this.strategyApplicator.apply(feedback, strategy);
      }
    });

    // Alert resolves -> cancel escalation
    this.alertManager.on('alert:resolved', (alert: Alert) => {
      this.feedbackRouter.cancelEscalation(alert.id);
    });

    // Forward events
    this.strategyApplicator.on('strategy:applied', (result) => {
      this.alertManager.emit('feedback:applied', result);
    });
  }

  /**
   * Load alerting rules from configuration
   */
  loadRules(config: { groups: Array<{ name: string; rules: unknown[] }> }): void {
    this.alertManager.loadRulesFromConfig(config);
  }

  /**
   * Register custom strategy
   */
  registerStrategy(strategy: Strategy): void {
    this.feedbackRouter.registerStrategy(strategy);
  }

  /**
   * Start autonomous monitoring
   */
  start(metricsProvider: () => Array<{ name: string; value: number; labels: Record<string, string>; timestamp: Date }>): void {
    this.alertManager.startEvaluation(metricsProvider);
  }

  /**
   * Stop autonomous monitoring
   */
  stop(): void {
    this.alertManager.stopEvaluation();
  }

  /**
   * Get system statistics
   */
  getStats(): {
    alerts: ReturnType<AlertManager['getStats']>;
    strategies: ReturnType<StrategyApplicator['getStrategyStats']>;
    feedbackCount: number;
  } {
    return {
      alerts: this.alertManager.getStats(),
      strategies: this.strategyApplicator.getStrategyStats(),
      feedbackCount: this.feedbackRouter.getFeedbackHistory().length
    };
  }

  /**
   * Cleanup resources
   */
  destroy(): void {
    this.alertManager.destroy();
    this.feedbackRouter.destroy();
  }
}
