/**
 * AlertManager - Core Alert Evaluation Engine
 *
 * Evaluates metrics against alert rules and manages alert lifecycle.
 * This is the ACTUAL implementation, not documentation.
 *
 * @module alerting/AlertManager
 * @version 1.0.0
 */

import { EventEmitter } from 'events';
import * as crypto from 'crypto';
import {
  Alert,
  AlertRule,
  AlertEvaluation,
  AlertSeverity,
  AlertStatus,
  AlertingConfig,
  MetricValue,
  FeedbackActionType
} from './types';

const DEFAULT_CONFIG: AlertingConfig = {
  evaluationInterval: 15000, // 15 seconds
  cooldownPeriod: 300000,    // 5 minutes
  maxAlertsPerHour: 100,
  enableFeedbackLoop: true,
  feedbackDelay: 1000
};

/**
 * AlertManager handles alert evaluation, firing, and lifecycle management.
 *
 * @example
 * ```typescript
 * const manager = new AlertManager();
 * manager.loadRules(rules);
 * manager.on('alert:fired', (alert) => console.log('Alert!', alert));
 * manager.evaluate(metrics);
 * ```
 */
export class AlertManager extends EventEmitter {
  private rules: Map<string, AlertRule> = new Map();
  private activeAlerts: Map<string, Alert> = new Map();
  private alertHistory: Alert[] = [];
  private cooldowns: Map<string, Date> = new Map();
  private config: AlertingConfig;
  private evaluationTimer?: NodeJS.Timeout;
  private alertCountThisHour = 0;
  private hourlyResetTimer?: NodeJS.Timeout;

  constructor(config: Partial<AlertingConfig> = {}) {
    super();
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.startHourlyReset();
  }

  /**
   * Load alert rules from configuration
   */
  loadRules(rules: AlertRule[]): void {
    this.rules.clear();
    for (const rule of rules) {
      this.rules.set(rule.name, rule);
    }
    this.emit('rules:loaded', rules.length);
  }

  /**
   * Parse rules from YAML-style config object
   */
  loadRulesFromConfig(config: { groups: Array<{ name: string; rules: unknown[] }> }): void {
    const rules: AlertRule[] = [];

    for (const group of config.groups) {
      for (const rawRule of group.rules) {
        const rule = rawRule as {
          alert: string;
          expr: string;
          for?: string;
          labels?: Record<string, string>;
          annotations?: Record<string, string>;
        };

        rules.push({
          name: rule.alert,
          expr: rule.expr,
          forDuration: rule.for || '0s',
          labels: {
            severity: (rule.labels?.severity as AlertSeverity) || 'warning',
            component: rule.labels?.component || 'unknown',
            alert_type: rule.labels?.alert_type || 'generic',
            feedback_action: (rule.labels?.feedback_action as FeedbackActionType) || 'adjust_strategy',
            agent_scope: rule.labels?.agent_scope
          },
          annotations: {
            summary: rule.annotations?.summary || '',
            description: rule.annotations?.description || '',
            feedback_strategy: rule.annotations?.feedback_strategy,
            feedback_action: rule.annotations?.feedback_action,
            runbook_url: rule.annotations?.runbook_url
          }
        });
      }
    }

    this.loadRules(rules);
  }

  /**
   * Evaluate metrics against all rules
   */
  evaluate(metrics: MetricValue[]): AlertEvaluation[] {
    const evaluations: AlertEvaluation[] = [];

    for (const rule of Array.from(this.rules.values())) {
      const relevantMetrics = this.findRelevantMetrics(rule, metrics);

      for (const metric of relevantMetrics) {
        const evaluation = this.evaluateRule(rule, metric);
        evaluations.push(evaluation);

        if (evaluation.isFiring) {
          this.handleFiringAlert(rule, metric, evaluation);
        } else {
          this.handleResolvedAlert(rule, metric);
        }
      }
    }

    return evaluations;
  }

  /**
   * Evaluate a single rule against a metric
   */
  private evaluateRule(rule: AlertRule, metric: MetricValue): AlertEvaluation {
    const threshold = this.extractThreshold(rule.expr);
    const comparison = this.extractComparison(rule.expr);
    const isFiring = this.compareValues(metric.value, threshold, comparison);

    return {
      rule,
      metric,
      threshold,
      actual: metric.value,
      isFiring,
      message: isFiring
        ? `${rule.name}: ${metric.value} ${comparison} ${threshold}`
        : `${rule.name}: OK (${metric.value})`
    };
  }

  /**
   * Extract threshold value from expression
   */
  private extractThreshold(expr: string): number {
    // Match patterns like "> 0.05", "< 80", ">= 5"
    const match = expr.match(/[<>=]+\s*([\d.]+)\s*$/);
    return match ? parseFloat(match[1]) : 0;
  }

  /**
   * Extract comparison operator from expression
   */
  private extractComparison(expr: string): string {
    const match = expr.match(/([<>=]+)\s*[\d.]+\s*$/);
    return match ? match[1] : '>';
  }

  /**
   * Compare values based on operator
   */
  private compareValues(actual: number, threshold: number, operator: string): boolean {
    switch (operator) {
      case '>': return actual > threshold;
      case '>=': return actual >= threshold;
      case '<': return actual < threshold;
      case '<=': return actual <= threshold;
      case '==': return actual === threshold;
      case '!=': return actual !== threshold;
      default: return actual > threshold;
    }
  }

  /**
   * Find metrics relevant to a rule
   */
  private findRelevantMetrics(rule: AlertRule, metrics: MetricValue[]): MetricValue[] {
    // Extract metric name from expression (e.g., "aqe_quality_coverage_line" from expr)
    const metricNameMatch = rule.expr.match(/([a-z_]+)/);
    const metricName = metricNameMatch ? metricNameMatch[1] : '';

    return metrics.filter(m =>
      m.name.includes(metricName) ||
      rule.expr.includes(m.name)
    );
  }

  /**
   * Handle a firing alert
   */
  private handleFiringAlert(rule: AlertRule, metric: MetricValue, evaluation: AlertEvaluation): void {
    const fingerprint = this.generateFingerprint(rule, metric);

    // Check cooldown
    if (this.isOnCooldown(fingerprint)) {
      return;
    }

    // Check rate limiting
    if (this.alertCountThisHour >= this.config.maxAlertsPerHour) {
      this.emit('alert:suppressed', { reason: 'rate_limit', rule: rule.name });
      return;
    }

    // Check if already firing
    if (this.activeAlerts.has(fingerprint)) {
      return;
    }

    const alert: Alert = {
      id: crypto.randomUUID(),
      name: rule.name,
      status: 'firing',
      severity: rule.labels.severity,
      labels: { ...rule.labels, ...metric.labels },
      annotations: {
        ...rule.annotations,
        actual_value: String(metric.value),
        threshold: String(evaluation.threshold)
      },
      value: metric.value,
      firedAt: new Date(),
      fingerprint
    };

    this.activeAlerts.set(fingerprint, alert);
    this.alertHistory.push(alert);
    this.alertCountThisHour++;
    this.cooldowns.set(fingerprint, new Date());

    this.emit('alert:fired', alert);

    // Trigger feedback loop if enabled
    if (this.config.enableFeedbackLoop) {
      setTimeout(() => {
        this.emit('alert:feedback', {
          alert,
          feedbackAction: rule.labels.feedback_action,
          strategy: rule.annotations.feedback_strategy,
          targetAgent: rule.labels.agent_scope
        });
      }, this.config.feedbackDelay);
    }
  }

  /**
   * Handle alert resolution
   */
  private handleResolvedAlert(rule: AlertRule, metric: MetricValue): void {
    const fingerprint = this.generateFingerprint(rule, metric);
    const existingAlert = this.activeAlerts.get(fingerprint);

    if (existingAlert && existingAlert.status === 'firing') {
      existingAlert.status = 'resolved';
      existingAlert.resolvedAt = new Date();
      this.activeAlerts.delete(fingerprint);
      this.emit('alert:resolved', existingAlert);
    }
  }

  /**
   * Generate unique fingerprint for alert deduplication
   */
  private generateFingerprint(rule: AlertRule, metric: MetricValue): string {
    const data = `${rule.name}:${metric.name}:${JSON.stringify(metric.labels)}`;
    return crypto.createHash('md5').update(data).digest('hex');
  }

  /**
   * Check if alert is on cooldown
   */
  private isOnCooldown(fingerprint: string): boolean {
    const lastFired = this.cooldowns.get(fingerprint);
    if (!lastFired) return false;
    return Date.now() - lastFired.getTime() < this.config.cooldownPeriod;
  }

  /**
   * Start periodic evaluation
   */
  startEvaluation(metricsProvider: () => MetricValue[]): void {
    this.stopEvaluation();
    this.evaluationTimer = setInterval(() => {
      const metrics = metricsProvider();
      this.evaluate(metrics);
    }, this.config.evaluationInterval);
  }

  /**
   * Stop periodic evaluation
   */
  stopEvaluation(): void {
    if (this.evaluationTimer) {
      clearInterval(this.evaluationTimer);
      this.evaluationTimer = undefined;
    }
  }

  /**
   * Start hourly counter reset
   */
  private startHourlyReset(): void {
    this.hourlyResetTimer = setInterval(() => {
      this.alertCountThisHour = 0;
    }, 3600000); // 1 hour
  }

  /**
   * Get all active alerts
   */
  getActiveAlerts(): Alert[] {
    return Array.from(this.activeAlerts.values());
  }

  /**
   * Get alert history
   */
  getAlertHistory(limit = 100): Alert[] {
    return this.alertHistory.slice(-limit);
  }

  /**
   * Get alert statistics
   */
  getStats(): {
    activeCount: number;
    totalFired: number;
    bySeverity: Record<AlertSeverity, number>;
    alertsThisHour: number;
  } {
    const bySeverity: Record<AlertSeverity, number> = {
      info: 0,
      warning: 0,
      error: 0,
      critical: 0
    };

    for (const alert of Array.from(this.activeAlerts.values())) {
      bySeverity[alert.severity]++;
    }

    return {
      activeCount: this.activeAlerts.size,
      totalFired: this.alertHistory.length,
      bySeverity,
      alertsThisHour: this.alertCountThisHour
    };
  }

  /**
   * Cleanup resources
   */
  destroy(): void {
    this.stopEvaluation();
    if (this.hourlyResetTimer) {
      clearInterval(this.hourlyResetTimer);
    }
    this.removeAllListeners();
  }
}
