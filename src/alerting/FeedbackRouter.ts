/**
 * FeedbackRouter - Routes Alerts to Appropriate Actions
 *
 * Takes fired alerts and routes them to the appropriate feedback actions
 * based on alert type, severity, and configured strategies.
 *
 * @module alerting/FeedbackRouter
 * @version 1.0.0
 */

import { EventEmitter } from 'events';
import * as crypto from 'crypto';
import {
  Alert,
  FeedbackEvent,
  FeedbackActionType,
  AlertSeverity,
  Strategy
} from './types';

/**
 * Feedback routing configuration
 */
export interface FeedbackRouterConfig {
  /** Default confidence threshold for auto-actions */
  confidenceThreshold: number;
  /** Enable automatic escalation for critical alerts */
  autoEscalate: boolean;
  /** Escalation delay in milliseconds */
  escalationDelay: number;
  /** Maximum retry attempts for failed actions */
  maxRetries: number;
}

const DEFAULT_CONFIG: FeedbackRouterConfig = {
  confidenceThreshold: 0.7,
  autoEscalate: true,
  escalationDelay: 300000, // 5 minutes
  maxRetries: 3
};

/**
 * Suggestion generated for feedback
 */
interface FeedbackSuggestion {
  action: string;
  confidence: number;
  reason: string;
}

/**
 * FeedbackRouter routes alerts to feedback actions and strategies.
 *
 * @example
 * ```typescript
 * const router = new FeedbackRouter();
 * router.on('feedback:generated', (event) => strategyApplicator.apply(event));
 * router.route(alert);
 * ```
 */
export class FeedbackRouter extends EventEmitter {
  private config: FeedbackRouterConfig;
  private strategies: Map<string, Strategy> = new Map();
  private feedbackHistory: FeedbackEvent[] = [];
  private pendingEscalations: Map<string, NodeJS.Timeout> = new Map();

  constructor(config: Partial<FeedbackRouterConfig> = {}) {
    super();
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.initializeDefaultStrategies();
  }

  /**
   * Initialize default feedback strategies
   */
  private initializeDefaultStrategies(): void {
    const defaultStrategies: Strategy[] = [
      {
        id: 'increase_test_isolation',
        name: 'Increase Test Isolation',
        description: 'Isolate failing tests and increase parallelization safety',
        actions: [
          { type: 'config_change', target: 'jest.config', parameters: { maxWorkers: 1 } },
          { type: 'notify', target: 'qe-test-executor', parameters: { action: 'isolate_failures' } }
        ],
        priority: 1,
        applicableAlerts: ['HighTestFailureRate', 'FlakyTestsIncreasing']
      },
      {
        id: 'generate_additional_tests',
        name: 'Generate Additional Tests',
        description: 'Trigger test generation for uncovered code paths',
        actions: [
          { type: 'notify', target: 'qe-test-generator', parameters: { focus: 'uncovered_paths' } },
          { type: 'notify', target: 'qe-coverage-analyzer', parameters: { action: 'analyze_gaps' } }
        ],
        priority: 2,
        applicableAlerts: ['CriticalCoverageDrop', 'WarningCoverageDrop', 'BranchCoverageLow']
      },
      {
        id: 'stabilize_flaky_tests',
        name: 'Stabilize Flaky Tests',
        description: 'Analyze and fix flaky test patterns',
        actions: [
          { type: 'notify', target: 'qe-flaky-detector', parameters: { action: 'deep_analysis' } },
          { type: 'config_change', target: 'test.retry', parameters: { retries: 2 } }
        ],
        priority: 1,
        applicableAlerts: ['FlakyTestsIncreasing', 'CriticalFlakyTestCount']
      },
      {
        id: 'security_remediation',
        name: 'Security Remediation',
        description: 'Trigger security scan and remediation workflow',
        actions: [
          { type: 'notify', target: 'qe-security-scanner', parameters: { action: 'full_scan' } },
          { type: 'notify', target: 'qe-security-auditor', parameters: { action: 'audit' } }
        ],
        priority: 0, // Highest priority
        applicableAlerts: ['SecurityVulnerabilityDetected', 'CriticalSecurityVulnerability']
      },
      {
        id: 'performance_optimization',
        name: 'Performance Optimization',
        description: 'Analyze and optimize performance bottlenecks',
        actions: [
          { type: 'notify', target: 'qe-performance-tester', parameters: { action: 'profile' } },
          { type: 'config_change', target: 'test.timeout', parameters: { timeout: 60000 } }
        ],
        priority: 2,
        applicableAlerts: ['SlowTestExecution', 'PerformanceDegradation', 'HighMemoryUsage']
      }
    ];

    for (const strategy of defaultStrategies) {
      this.strategies.set(strategy.id, strategy);
    }
  }

  /**
   * Register a custom strategy
   */
  registerStrategy(strategy: Strategy): void {
    this.strategies.set(strategy.id, strategy);
    this.emit('strategy:registered', strategy);
  }

  /**
   * Route an alert to appropriate feedback action
   */
  route(alert: Alert): FeedbackEvent | null {
    const feedbackAction = this.determineFeedbackAction(alert);
    const suggestions = this.generateSuggestions(alert);
    const strategy = this.selectStrategy(alert);

    if (!strategy && suggestions.length === 0) {
      this.emit('feedback:no_action', { alert, reason: 'No applicable strategy' });
      return null;
    }

    const feedbackEvent: FeedbackEvent = {
      id: crypto.randomUUID(),
      alertId: alert.id,
      type: feedbackAction,
      severity: alert.severity,
      targetAgent: alert.labels.agent_scope || this.inferTargetAgent(alert),
      strategy: strategy?.id || 'default',
      suggestions: suggestions.map(s => s.action),
      confidence: this.calculateConfidence(suggestions),
      timestamp: new Date(),
      metadata: {
        alertName: alert.name,
        alertValue: alert.value,
        strategyName: strategy?.name,
        actions: strategy?.actions || []
      }
    };

    this.feedbackHistory.push(feedbackEvent);
    this.emit('feedback:generated', feedbackEvent);

    // Handle escalation for critical alerts
    if (this.shouldEscalate(alert, feedbackEvent)) {
      this.scheduleEscalation(alert, feedbackEvent);
    }

    return feedbackEvent;
  }

  /**
   * Determine feedback action based on alert labels
   */
  private determineFeedbackAction(alert: Alert): FeedbackActionType {
    const labelAction = alert.labels.feedback_action as FeedbackActionType;
    if (labelAction) return labelAction;

    // Default based on severity
    switch (alert.severity) {
      case 'critical': return 'auto_remediate';
      case 'error': return 'adjust_strategy';
      case 'warning': return 'adjust_strategy';
      default: return 'adjust_strategy';
    }
  }

  /**
   * Generate suggestions based on alert type
   */
  private generateSuggestions(alert: Alert): FeedbackSuggestion[] {
    const suggestions: FeedbackSuggestion[] = [];
    const alertType = alert.labels.alert_type;

    switch (alertType) {
      case 'test_failure':
        suggestions.push(
          { action: 'isolate_failing_tests', confidence: 0.9, reason: 'Prevent cascade failures' },
          { action: 'increase_test_timeout', confidence: 0.6, reason: 'May be timing issue' },
          { action: 'analyze_test_dependencies', confidence: 0.7, reason: 'Check for shared state' }
        );
        break;

      case 'coverage_drop':
        suggestions.push(
          { action: 'generate_additional_tests', confidence: 0.95, reason: 'Direct coverage improvement' },
          { action: 'analyze_uncovered_paths', confidence: 0.85, reason: 'Identify critical gaps' },
          { action: 'review_recent_changes', confidence: 0.7, reason: 'Find removed coverage' }
        );
        break;

      case 'flaky_tests':
        suggestions.push(
          { action: 'quarantine_flaky_tests', confidence: 0.8, reason: 'Prevent false failures' },
          { action: 'add_retry_logic', confidence: 0.7, reason: 'Temporary stabilization' },
          { action: 'analyze_race_conditions', confidence: 0.85, reason: 'Root cause analysis' }
        );
        break;

      case 'security':
        suggestions.push(
          { action: 'block_deployment', confidence: 0.99, reason: 'Security critical' },
          { action: 'run_full_security_scan', confidence: 0.95, reason: 'Comprehensive check' },
          { action: 'notify_security_team', confidence: 0.9, reason: 'Human review needed' }
        );
        break;

      case 'performance':
        suggestions.push(
          { action: 'profile_slow_tests', confidence: 0.85, reason: 'Identify bottlenecks' },
          { action: 'optimize_test_data', confidence: 0.7, reason: 'Reduce setup overhead' },
          { action: 'parallelize_execution', confidence: 0.75, reason: 'Speed improvement' }
        );
        break;

      default:
        suggestions.push(
          { action: 'notify_team', confidence: 0.5, reason: 'Unknown alert type' }
        );
    }

    // Sort by confidence
    return suggestions.sort((a, b) => b.confidence - a.confidence);
  }

  /**
   * Select best strategy for alert
   */
  private selectStrategy(alert: Alert): Strategy | null {
    const annotationStrategy = alert.annotations.feedback_strategy;

    // First try annotation-specified strategy
    if (annotationStrategy && this.strategies.has(annotationStrategy)) {
      return this.strategies.get(annotationStrategy)!;
    }

    // Find applicable strategies
    const applicable: Strategy[] = [];
    for (const strategy of Array.from(this.strategies.values())) {
      if (strategy.applicableAlerts.includes(alert.name)) {
        applicable.push(strategy);
      }
    }

    if (applicable.length === 0) return null;

    // Sort by priority (lower = higher priority)
    applicable.sort((a, b) => a.priority - b.priority);
    return applicable[0];
  }

  /**
   * Infer target agent from alert
   */
  private inferTargetAgent(alert: Alert): string {
    const alertType = alert.labels.alert_type;

    const agentMapping: Record<string, string> = {
      'test_failure': 'qe-test-executor',
      'coverage_drop': 'qe-coverage-analyzer',
      'flaky_tests': 'qe-flaky-detector',
      'security': 'qe-security-scanner',
      'performance': 'qe-performance-tester'
    };

    return agentMapping[alertType] || 'qe-quality-analyzer';
  }

  /**
   * Calculate overall confidence from suggestions
   */
  private calculateConfidence(suggestions: FeedbackSuggestion[]): number {
    if (suggestions.length === 0) return 0;
    const topSuggestions = suggestions.slice(0, 3);
    const sum = topSuggestions.reduce((acc, s) => acc + s.confidence, 0);
    return sum / topSuggestions.length;
  }

  /**
   * Check if escalation is needed
   */
  private shouldEscalate(alert: Alert, feedback: FeedbackEvent): boolean {
    if (!this.config.autoEscalate) return false;
    if (alert.severity !== 'critical' && alert.severity !== 'error') return false;
    if (feedback.confidence >= this.config.confidenceThreshold) return false;
    return true;
  }

  /**
   * Schedule escalation for unresolved critical alerts
   */
  private scheduleEscalation(alert: Alert, feedback: FeedbackEvent): void {
    const timer = setTimeout(() => {
      // Check if alert is still active
      this.emit('feedback:escalate', {
        alert,
        feedback,
        reason: 'Low confidence automatic action, escalating to human review'
      });
      this.pendingEscalations.delete(alert.id);
    }, this.config.escalationDelay);

    this.pendingEscalations.set(alert.id, timer);
  }

  /**
   * Cancel pending escalation (e.g., when alert resolves)
   */
  cancelEscalation(alertId: string): void {
    const timer = this.pendingEscalations.get(alertId);
    if (timer) {
      clearTimeout(timer);
      this.pendingEscalations.delete(alertId);
    }
  }

  /**
   * Get feedback history
   */
  getFeedbackHistory(limit = 100): FeedbackEvent[] {
    return this.feedbackHistory.slice(-limit);
  }

  /**
   * Get all registered strategies
   */
  getStrategies(): Strategy[] {
    return Array.from(this.strategies.values());
  }

  /**
   * Cleanup resources
   */
  destroy(): void {
    for (const timer of Array.from(this.pendingEscalations.values())) {
      clearTimeout(timer);
    }
    this.pendingEscalations.clear();
    this.removeAllListeners();
  }
}
