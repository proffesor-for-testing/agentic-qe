/**
 * Alerting System Types
 *
 * Type definitions for the autonomous alerting and feedback loop system.
 *
 * @module alerting/types
 * @version 1.0.0
 */

export type AlertSeverity = 'info' | 'warning' | 'error' | 'critical';
export type AlertStatus = 'pending' | 'firing' | 'resolved';
export type FeedbackActionType = 'adjust_strategy' | 'retrain_model' | 'auto_remediate' | 'escalate';

/**
 * Alert rule definition (matches Prometheus alerting rules)
 */
export interface AlertRule {
  name: string;
  expr: string;
  forDuration: string;
  labels: AlertLabels;
  annotations: AlertAnnotations;
}

export interface AlertLabels {
  severity: AlertSeverity;
  component: string;
  alert_type: string;
  feedback_action: FeedbackActionType;
  agent_scope?: string;
}

export interface AlertAnnotations {
  summary: string;
  description: string;
  feedback_strategy?: string;
  feedback_focus?: string;
  feedback_action?: string;
  runbook_url?: string;
}

/**
 * Fired alert instance
 */
export interface Alert {
  id: string;
  name: string;
  status: AlertStatus;
  severity: AlertSeverity;
  labels: Record<string, string>;
  annotations: Record<string, string>;
  value: number;
  firedAt: Date;
  resolvedAt?: Date;
  fingerprint: string;
}

/**
 * Metric value for evaluation
 */
export interface MetricValue {
  name: string;
  value: number;
  labels: Record<string, string>;
  timestamp: Date;
}

/**
 * Alert evaluation result
 */
export interface AlertEvaluation {
  rule: AlertRule;
  metric: MetricValue;
  threshold: number;
  actual: number;
  isFiring: boolean;
  message: string;
}

/**
 * Feedback event generated from alert
 */
export interface FeedbackEvent {
  id: string;
  alertId: string;
  type: FeedbackActionType;
  severity: AlertSeverity;
  targetAgent?: string;
  strategy: string;
  suggestions: string[];
  confidence: number;
  timestamp: Date;
  metadata: Record<string, unknown>;
}

/**
 * Strategy to apply based on feedback
 */
export interface Strategy {
  id: string;
  name: string;
  description: string;
  actions: StrategyAction[];
  priority: number;
  applicableAlerts: string[];
}

export interface StrategyAction {
  type: 'config_change' | 'agent_retrain' | 'threshold_adjust' | 'notify' | 'execute_command';
  target: string;
  parameters: Record<string, unknown>;
}

/**
 * Configuration for the alerting system
 */
export interface AlertingConfig {
  /** Evaluation interval in milliseconds */
  evaluationInterval: number;
  /** Alert cooldown period in milliseconds */
  cooldownPeriod: number;
  /** Maximum alerts before suppression */
  maxAlertsPerHour: number;
  /** Enable feedback loop */
  enableFeedbackLoop: boolean;
  /** Feedback action delay in milliseconds */
  feedbackDelay: number;
}
