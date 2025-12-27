/**
 * MetricsDashboard - Phase 3 Dashboard Utilities
 *
 * Provides utilities for displaying metrics in CLI dashboard format.
 */

import chalk from 'chalk';
import { AggregatedMetrics } from '../metrics/MetricsCollector';
import { TrendDirection, TrendAnalysis, TrendAnalyzer } from '../metrics/TrendAnalyzer';
import { Alert, AlertSeverity, AlertManager } from '../metrics/AlertManager';

/**
 * Dashboard display options
 */
export interface DashboardOptions {
  detailed?: boolean;
  format?: 'table' | 'json';
  showTrends?: boolean;
  showAlerts?: boolean;
}

/**
 * MetricsDashboard - Formats and displays learning metrics
 */
export class MetricsDashboard {
  /**
   * Display complete metrics dashboard
   */
  static displayMetrics(metrics: AggregatedMetrics, options: DashboardOptions = {}): void {
    if (options.format === 'json') {
      console.log(JSON.stringify(metrics, null, 2));
      return;
    }

    const periodDays = Math.round(
      (metrics.period.end.getTime() - metrics.period.start.getTime()) / (1000 * 60 * 60 * 24)
    );

    console.log(chalk.blue(`\n📊 Learning Metrics (Last ${periodDays} Days)\n`));

    // Discovery Metrics
    this.displaySection('🔍 Discovery Metrics', {
      'Patterns Discovered': metrics.discovery.patternsDiscovered.toString(),
      'Discovery Rate': `${metrics.discovery.discoveryRate.toFixed(2)} patterns/day`,
      'Unique Patterns': metrics.discovery.uniquePatterns.toString()
    });

    // Quality Metrics
    this.displaySection('✨ Quality Metrics', {
      'Avg Accuracy': this.formatPercentage(metrics.quality.avgAccuracy),
      'Avg Actionability': this.formatPercentage(metrics.quality.avgActionability),
      'High Confidence Rate': this.formatPercentage(metrics.quality.highConfidenceRate)
    });

    // Transfer Metrics
    this.displaySection('📤 Transfer Metrics', {
      'Success Rate': this.formatPercentage(metrics.transfer.successRate),
      'Adoption Rate': this.formatPercentage(metrics.transfer.adoptionRate),
      'Transfers Attempted': metrics.transfer.transfersAttempted.toString(),
      'Transfers Succeeded': metrics.transfer.transfersSucceeded.toString()
    });

    // Impact Metrics
    this.displaySection('💥 Impact Metrics', {
      'Avg Time Reduction': this.formatPercentage(metrics.impact.avgTimeReduction / 100),
      'Avg Coverage Improvement': this.formatPercentage(metrics.impact.avgCoverageImprovement / 100),
      'Tasks Optimized': metrics.impact.tasksOptimized.toString()
    });

    // System Health
    this.displaySection('🏥 System Health', {
      'Cycle Completion Rate': this.formatPercentage(metrics.system.cycleCompletionRate),
      'Avg Cycle Duration': `${(metrics.system.avgCycleDuration / 1000).toFixed(1)}s`,
      'Error Rate': this.formatPercentage(metrics.system.errorRate, true),
      'Uptime': this.formatPercentage(metrics.system.uptime)
    });

    console.log();
  }

  /**
   * Display trend analysis
   */
  static displayTrends(trends: TrendAnalysis[], options: DashboardOptions = {}): void {
    if (options.format === 'json') {
      console.log(JSON.stringify(trends, null, 2));
      return;
    }

    console.log(chalk.blue('\n📈 Trend Analysis\n'));

    // Group by category
    const discovery = trends.filter(t => ['patternsDiscovered', 'discoveryRate'].includes(t.metric));
    const quality = trends.filter(t => ['avgAccuracy', 'avgActionability'].includes(t.metric));
    const transfer = trends.filter(t => t.metric === 'transferSuccessRate');
    const impact = trends.filter(t => ['avgTimeReduction', 'avgCoverageImprovement'].includes(t.metric));
    const system = trends.filter(t => ['cycleCompletionRate', 'errorRate'].includes(t.metric));

    if (discovery.length > 0) this.displayTrendSection('🔍 Discovery', discovery);
    if (quality.length > 0) this.displayTrendSection('✨ Quality', quality);
    if (transfer.length > 0) this.displayTrendSection('📤 Transfer', transfer);
    if (impact.length > 0) this.displayTrendSection('💥 Impact', impact);
    if (system.length > 0) this.displayTrendSection('🏥 System', system);

    console.log();
  }

  /**
   * Display alerts
   */
  static displayAlerts(alerts: Alert[], options: DashboardOptions = {}): void {
    if (options.format === 'json') {
      console.log(JSON.stringify(alerts, null, 2));
      return;
    }

    console.log(chalk.blue('\n🚨 Active Alerts\n'));

    if (alerts.length === 0) {
      console.log(chalk.green('✅ No active alerts\n'));
      return;
    }

    alerts.forEach((alert, index) => {
      const prefix = index === alerts.length - 1 ? '└─' : '├─';
      const icon = AlertManager.getAlertIcon(alert.severity);
      const severityColor = this.getAlertColor(alert.severity);

      console.log(`${prefix} ${icon} ${severityColor(alert.message)}`);
      console.log(`   ${chalk.gray(`ID: ${alert.id}`)}`);
      console.log(`   ${chalk.gray(`Current: ${this.formatPercentage(alert.currentValue)} | Threshold: ${this.formatPercentage(alert.threshold)}`)}`);
      console.log(`   ${chalk.gray(`Created: ${alert.createdAt.toLocaleString()}`)}`);
      console.log();
    });
  }

  /**
   * Display a metrics section
   */
  private static displaySection(title: string, metrics: Record<string, string>): void {
    console.log(chalk.cyan(title));
    const entries = Object.entries(metrics);
    entries.forEach(([key, value], index) => {
      const prefix = index === entries.length - 1 ? '└─' : '├─';
      console.log(`${prefix} ${key}: ${chalk.yellow(value)}`);
    });
    console.log();
  }

  /**
   * Display trend section
   */
  private static displayTrendSection(title: string, trends: TrendAnalysis[]): void {
    console.log(chalk.cyan(title));
    trends.forEach((trend, index) => {
      const prefix = index === trends.length - 1 ? '└─' : '├─';
      const indicator = TrendAnalyzer.getTrendIndicator(trend.direction);
      const directionColor = this.getTrendColor(trend.direction);

      const metricName = this.formatMetricName(trend.metric);
      const change = trend.changePercentage >= 0
        ? `+${trend.changePercentage.toFixed(1)}%`
        : `${trend.changePercentage.toFixed(1)}%`;

      console.log(
        `${prefix} ${metricName}: ${directionColor(indicator)} ${directionColor(change)} ` +
        chalk.gray(`(confidence: ${(trend.confidence * 100).toFixed(0)}%)`)
      );
    });
    console.log();
  }

  /**
   * Format percentage
   */
  private static formatPercentage(value: number, isError: boolean = false): string {
    const percentage = (value * 100).toFixed(1) + '%';

    if (isError) {
      // For error rates, lower is better
      if (value < 0.05) return chalk.green(percentage);
      if (value < 0.15) return chalk.yellow(percentage);
      return chalk.red(percentage);
    }

    // For normal metrics, higher is better
    if (value > 0.8) return chalk.green(percentage);
    if (value > 0.6) return chalk.yellow(percentage);
    return chalk.red(percentage);
  }

  /**
   * Get color for trend direction
   */
  private static getTrendColor(direction: TrendDirection): typeof chalk.green {
    switch (direction) {
      case TrendDirection.IMPROVING:
        return chalk.green;
      case TrendDirection.STABLE:
        return chalk.yellow;
      case TrendDirection.DECLINING:
        return chalk.red;
    }
  }

  /**
   * Get color for alert severity
   */
  private static getAlertColor(severity: AlertSeverity): typeof chalk.yellow {
    switch (severity) {
      case AlertSeverity.ERROR:
        return chalk.red;
      case AlertSeverity.WARNING:
        return chalk.yellow;
      case AlertSeverity.INFO:
        return chalk.blue;
    }
  }

  /**
   * Format metric name for display
   */
  private static formatMetricName(metric: string): string {
    return metric
      .replace(/([A-Z])/g, ' $1')
      .replace(/^./, str => str.toUpperCase())
      .trim();
  }

  /**
   * Create summary table
   */
  static createSummaryTable(metrics: AggregatedMetrics): string {
    const table: string[] = [];

    table.push(chalk.cyan('Category'.padEnd(20)) + chalk.cyan('Key Metric'.padEnd(30)) + chalk.cyan('Value'));
    table.push('─'.repeat(70));

    // Discovery
    table.push(
      'Discovery'.padEnd(20) +
      'Discovery Rate'.padEnd(30) +
      chalk.yellow(`${metrics.discovery.discoveryRate.toFixed(2)} patterns/day`)
    );

    // Quality
    table.push(
      'Quality'.padEnd(20) +
      'Avg Accuracy'.padEnd(30) +
      this.formatPercentage(metrics.quality.avgAccuracy)
    );

    // Transfer
    table.push(
      'Transfer'.padEnd(20) +
      'Success Rate'.padEnd(30) +
      this.formatPercentage(metrics.transfer.successRate)
    );

    // Impact
    table.push(
      'Impact'.padEnd(20) +
      'Avg Time Reduction'.padEnd(30) +
      this.formatPercentage(metrics.impact.avgTimeReduction / 100)
    );

    // System
    table.push(
      'System'.padEnd(20) +
      'Cycle Completion'.padEnd(30) +
      this.formatPercentage(metrics.system.cycleCompletionRate)
    );

    return table.join('\n');
  }
}
