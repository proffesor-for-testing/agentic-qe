/**
 * AlertManager - Phase 3 Alert System
 *
 * Manages alerts for learning metrics that exceed thresholds.
 * Tracks alert state and acknowledgments.
 */

import { SwarmMemoryManager } from '../../core/memory/SwarmMemoryManager';
import { Logger } from '../../utils/Logger';
import { AggregatedMetrics } from './MetricsCollector';

/**
 * Alert severity levels
 */
export enum AlertSeverity {
  INFO = 'info',
  WARNING = 'warning',
  ERROR = 'error'
}

/**
 * Alert status
 */
export enum AlertStatus {
  ACTIVE = 'active',
  ACKNOWLEDGED = 'acknowledged',
  RESOLVED = 'resolved'
}

/**
 * Alert definition
 */
export interface Alert {
  id: string;
  severity: AlertSeverity;
  metric: string;
  message: string;
  currentValue: number;
  threshold: number;
  status: AlertStatus;
  createdAt: Date;
  acknowledgedAt?: Date;
  resolvedAt?: Date;
}

/**
 * Alert threshold configuration
 */
export interface AlertThreshold {
  metric: string;
  warningThreshold: number;
  errorThreshold: number;
  comparison: 'gt' | 'lt'; // greater than or less than
}

/**
 * AlertManager - Manages learning metric alerts
 */
export class AlertManager {
  private readonly logger: Logger;
  private readonly memoryManager: SwarmMemoryManager;
  private alerts: Map<string, Alert>;

  // Default thresholds
  private readonly DEFAULT_THRESHOLDS: AlertThreshold[] = [
    { metric: 'errorRate', warningThreshold: 0.1, errorThreshold: 0.2, comparison: 'gt' },
    { metric: 'cycleCompletionRate', warningThreshold: 0.8, errorThreshold: 0.6, comparison: 'lt' },
    { metric: 'avgAccuracy', warningThreshold: 0.7, errorThreshold: 0.5, comparison: 'lt' },
    { metric: 'transferSuccessRate', warningThreshold: 0.6, errorThreshold: 0.4, comparison: 'lt' },
    { metric: 'discoveryRate', warningThreshold: 1.0, errorThreshold: 0.5, comparison: 'lt' }
  ];

  constructor(memoryManager: SwarmMemoryManager) {
    this.logger = Logger.getInstance();
    this.memoryManager = memoryManager;
    this.alerts = new Map();
  }

  /**
   * Initialize alert manager
   */
  async initialize(): Promise<void> {
    await this.loadAlerts();
  }

  /**
   * Check metrics against thresholds and create alerts
   */
  async checkMetrics(metrics: AggregatedMetrics): Promise<Alert[]> {
    const newAlerts: Alert[] = [];

    // Check each threshold
    for (const threshold of this.DEFAULT_THRESHOLDS) {
      const value = this.getMetricValue(metrics, threshold.metric);
      if (value === null) continue;

      const alert = this.checkThreshold(threshold, value);
      if (alert) {
        newAlerts.push(alert);
        await this.storeAlert(alert);
      }
    }

    return newAlerts;
  }

  /**
   * Get all active alerts
   */
  getActiveAlerts(): Alert[] {
    return Array.from(this.alerts.values())
      .filter(a => a.status === AlertStatus.ACTIVE)
      .sort((a, b) => {
        // Sort by severity (error > warning > info) then by date
        const severityOrder = { error: 0, warning: 1, info: 2 };
        const severityDiff = severityOrder[a.severity] - severityOrder[b.severity];
        if (severityDiff !== 0) return severityDiff;
        return b.createdAt.getTime() - a.createdAt.getTime();
      });
  }

  /**
   * Get all alerts (including acknowledged)
   */
  getAllAlerts(): Alert[] {
    return Array.from(this.alerts.values())
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }

  /**
   * Acknowledge an alert
   */
  async acknowledgeAlert(alertId: string): Promise<void> {
    const alert = this.alerts.get(alertId);
    if (!alert) {
      throw new Error(`Alert not found: ${alertId}`);
    }

    alert.status = AlertStatus.ACKNOWLEDGED;
    alert.acknowledgedAt = new Date();

    this.alerts.set(alertId, alert);
    await this.storeAlert(alert);

    this.logger.info(`Alert acknowledged: ${alertId}`);
  }

  /**
   * Resolve an alert
   */
  async resolveAlert(alertId: string): Promise<void> {
    const alert = this.alerts.get(alertId);
    if (!alert) {
      throw new Error(`Alert not found: ${alertId}`);
    }

    alert.status = AlertStatus.RESOLVED;
    alert.resolvedAt = new Date();

    this.alerts.set(alertId, alert);
    await this.storeAlert(alert);

    this.logger.info(`Alert resolved: ${alertId}`);
  }

  /**
   * Check a single threshold
   */
  private checkThreshold(threshold: AlertThreshold, currentValue: number): Alert | null {
    let severity: AlertSeverity | null = null;
    let thresholdValue: number = 0;

    if (threshold.comparison === 'gt') {
      // Value should be LESS than threshold
      if (currentValue >= threshold.errorThreshold) {
        severity = AlertSeverity.ERROR;
        thresholdValue = threshold.errorThreshold;
      } else if (currentValue >= threshold.warningThreshold) {
        severity = AlertSeverity.WARNING;
        thresholdValue = threshold.warningThreshold;
      }
    } else {
      // Value should be GREATER than threshold
      if (currentValue <= threshold.errorThreshold) {
        severity = AlertSeverity.ERROR;
        thresholdValue = threshold.errorThreshold;
      } else if (currentValue <= threshold.warningThreshold) {
        severity = AlertSeverity.WARNING;
        thresholdValue = threshold.warningThreshold;
      }
    }

    if (!severity) return null;

    // Check if alert already exists for this metric
    const existingAlert = Array.from(this.alerts.values()).find(
      a => a.metric === threshold.metric && a.status === AlertStatus.ACTIVE
    );

    if (existingAlert) {
      // Update existing alert if value changed significantly
      if (Math.abs(existingAlert.currentValue - currentValue) > 0.01) {
        existingAlert.currentValue = currentValue;
        this.storeAlert(existingAlert);
      }
      return null;
    }

    // Create new alert
    const alert: Alert = {
      id: `alert-${threshold.metric}-${Date.now()}`,
      severity,
      metric: threshold.metric,
      message: this.generateAlertMessage(threshold.metric, currentValue, thresholdValue, threshold.comparison),
      currentValue,
      threshold: thresholdValue,
      status: AlertStatus.ACTIVE,
      createdAt: new Date()
    };

    this.alerts.set(alert.id, alert);
    return alert;
  }

  /**
   * Generate alert message
   */
  private generateAlertMessage(
    metric: string,
    currentValue: number,
    threshold: number,
    comparison: 'gt' | 'lt'
  ): string {
    const formatted = (v: number) => (v * 100).toFixed(1) + '%';
    const operator = comparison === 'gt' ? 'above' : 'below';

    return `${metric} is ${operator} threshold: ${formatted(currentValue)} (threshold: ${formatted(threshold)})`;
  }

  /**
   * Get metric value from aggregated metrics
   */
  private getMetricValue(metrics: AggregatedMetrics, metricName: string): number | null {
    switch (metricName) {
      case 'errorRate':
        return metrics.system.errorRate;
      case 'cycleCompletionRate':
        return metrics.system.cycleCompletionRate;
      case 'avgAccuracy':
        return metrics.quality.avgAccuracy;
      case 'transferSuccessRate':
        return metrics.transfer.successRate;
      case 'discoveryRate':
        return metrics.discovery.discoveryRate;
      default:
        return null;
    }
  }

  /**
   * Store alert in memory
   */
  private async storeAlert(alert: Alert): Promise<void> {
    await this.memoryManager.store(
      `phase3/alerts/${alert.id}`,
      alert as unknown as Record<string, unknown>,
      { partition: 'learning' }
    );
  }

  /**
   * Load alerts from memory
   */
  private async loadAlerts(): Promise<void> {
    try {
      const entries = await this.memoryManager.query(
        'phase3/alerts/%',
        { partition: 'learning' }
      );

      entries.forEach(entry => {
        const rawValue = entry.value as unknown;
        // Type guard to validate Alert structure
        if (
          typeof rawValue === 'object' &&
          rawValue !== null &&
          'id' in rawValue &&
          'severity' in rawValue &&
          'metric' in rawValue &&
          'message' in rawValue &&
          'status' in rawValue &&
          'createdAt' in rawValue
        ) {
          const alert = rawValue as Alert;
          // Convert date strings back to Date objects
          alert.createdAt = new Date(alert.createdAt);
          if (alert.acknowledgedAt) {
            alert.acknowledgedAt = new Date(alert.acknowledgedAt);
          }
          if (alert.resolvedAt) {
            alert.resolvedAt = new Date(alert.resolvedAt);
          }
          this.alerts.set(alert.id, alert);
        }
      });

      this.logger.info(`Loaded ${this.alerts.size} alerts from memory`);
    } catch (error) {
      this.logger.warn('Failed to load alerts from memory', { error });
    }
  }

  /**
   * Get alert icon
   */
  static getAlertIcon(severity: AlertSeverity): string {
    switch (severity) {
      case AlertSeverity.ERROR:
        return '❌';
      case AlertSeverity.WARNING:
        return '⚠️';
      case AlertSeverity.INFO:
        return 'ℹ️';
    }
  }
}
