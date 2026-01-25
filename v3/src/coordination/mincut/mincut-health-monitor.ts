/**
 * Agentic QE v3 - MinCut Health Monitor
 * ADR-047: MinCut Self-Organizing QE Integration
 *
 * Monitors swarm topology health using MinCut analysis.
 * Integrates with Queen Coordinator for health reporting and alerting.
 *
 * Features:
 * - Real-time MinCut value tracking
 * - Threshold-based alerting
 * - Historical trend analysis
 * - Integration with Queen health interface
 */

import { v4 as uuidv4 } from 'uuid';
import { Severity, DomainEvent } from '../../shared/types';
import { EventBus } from '../../kernel/interfaces';
import { MinCutPriority } from './interfaces';
import { SwarmGraph } from './swarm-graph';
import { MinCutCalculator, createMinCutCalculator } from './mincut-calculator';
import {
  MinCutHealth,
  MinCutHealthConfig,
  MinCutHistoryEntry,
  MinCutAlert,
  WeakVertex,
  MinCutEvent,
  MinCutEventType,
  DEFAULT_MINCUT_HEALTH_CONFIG,
} from './interfaces';

/**
 * MinCut Health Monitor - Tracks swarm topology health
 */
export class MinCutHealthMonitor {
  private readonly calculator: MinCutCalculator;
  private readonly config: MinCutHealthConfig;
  private readonly eventBus?: EventBus;

  private graph: SwarmGraph;
  private history: MinCutHistoryEntry[] = [];
  private alerts: Map<string, MinCutAlert> = new Map();
  private lastAlertTime: Map<string, number> = new Map();
  private monitoringInterval: NodeJS.Timeout | null = null;
  private isMonitoring: boolean = false;

  constructor(
    graph: SwarmGraph,
    config: Partial<MinCutHealthConfig> = {},
    eventBus?: EventBus
  ) {
    this.graph = graph;
    this.config = { ...DEFAULT_MINCUT_HEALTH_CONFIG, ...config };
    this.calculator = createMinCutCalculator();
    this.eventBus = eventBus;
  }

  // ==========================================================================
  // Lifecycle
  // ==========================================================================

  /**
   * Start health monitoring
   */
  start(): void {
    if (this.isMonitoring) return;

    this.isMonitoring = true;
    this.monitoringInterval = setInterval(
      () => this.checkHealth(),
      this.config.checkIntervalMs
    );

    // Initial check
    this.checkHealth();
  }

  /**
   * Stop health monitoring
   */
  stop(): void {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = null;
    }
    this.isMonitoring = false;
  }

  /**
   * Update the graph being monitored
   */
  updateGraph(graph: SwarmGraph): void {
    this.graph = graph;

    // Trigger immediate health check if monitoring
    if (this.isMonitoring) {
      this.checkHealth();
    }
  }

  // ==========================================================================
  // Health Analysis
  // ==========================================================================

  /**
   * Issue #205 fix: Check if topology is empty/fresh (no agents spawned yet)
   * An empty topology is normal for a fresh install - not a critical issue
   *
   * Note: Domain coordinator vertices and workflow edges are always created,
   * so we check for actual agent vertices instead of raw counts.
   */
  private isEmptyTopology(): boolean {
    // Empty if no agent vertices (domain coordinators don't count - they're always present)
    const agentVertices = this.graph.getVerticesByType('agent');
    return agentVertices.length === 0;
  }

  /**
   * Perform health check
   */
  checkHealth(): MinCutHealth {
    const minCutValue = this.calculator.getMinCutValue(this.graph);
    const weakVertices = this.calculator.findWeakVertices(this.graph);

    // Issue #205 fix: Empty topology should be 'idle', not 'critical'
    const status = this.isEmptyTopology()
      ? 'idle'
      : this.determineStatus(minCutValue);
    const trend = this.calculateTrend();

    // Record history
    this.recordHistory(minCutValue);

    // Issue #205 fix: Only check alert conditions if NOT an empty topology
    // Empty topology is expected for fresh installs
    if (!this.isEmptyTopology()) {
      this.checkAlertConditions(minCutValue, weakVertices, status);
    }

    // Emit event
    this.emitEvent('mincut.updated', minCutValue, { status, weakVertexCount: weakVertices.length });

    return {
      status,
      minCutValue,
      healthyThreshold: this.config.healthyThreshold,
      warningThreshold: this.config.warningThreshold,
      weakVertexCount: weakVertices.length,
      topWeakVertices: weakVertices.slice(0, 5),
      trend,
      history: this.history.slice(-20),
      lastUpdated: new Date(),
    };
  }

  /**
   * Get current health status (without triggering full check)
   */
  getHealth(): MinCutHealth {
    const minCutValue = this.calculator.getMinCutValue(this.graph);
    const weakVertices = this.calculator.findWeakVertices(this.graph);

    // Issue #205 fix: Empty topology should be 'idle', not 'critical'
    const status = this.isEmptyTopology()
      ? 'idle'
      : this.determineStatus(minCutValue);

    return {
      status,
      minCutValue,
      healthyThreshold: this.config.healthyThreshold,
      warningThreshold: this.config.warningThreshold,
      weakVertexCount: weakVertices.length,
      topWeakVertices: weakVertices.slice(0, 5),
      trend: this.calculateTrend(),
      history: this.history.slice(-20),
      lastUpdated: new Date(),
    };
  }

  /**
   * Get current MinCut value
   */
  getMinCutValue(): number {
    return this.calculator.getMinCutValue(this.graph);
  }

  /**
   * Get weak vertices
   */
  getWeakVertices(): WeakVertex[] {
    return this.calculator.findWeakVertices(this.graph);
  }

  /**
   * Check if topology is critical
   */
  isCritical(): boolean {
    const minCutValue = this.calculator.getMinCutValue(this.graph);
    return minCutValue < this.config.warningThreshold;
  }

  /**
   * Check if topology is healthy
   */
  isHealthy(): boolean {
    const minCutValue = this.calculator.getMinCutValue(this.graph);
    return minCutValue >= this.config.healthyThreshold;
  }

  // ==========================================================================
  // Alert Management
  // ==========================================================================

  /**
   * Get active alerts
   */
  getActiveAlerts(): MinCutAlert[] {
    return Array.from(this.alerts.values())
      .filter(a => !a.acknowledged)
      .sort((a, b) => {
        const severityOrder = { critical: 0, high: 1, medium: 2, low: 3, info: 4 };
        return severityOrder[a.severity] - severityOrder[b.severity];
      });
  }

  /**
   * Get all alerts
   */
  getAllAlerts(): MinCutAlert[] {
    return Array.from(this.alerts.values());
  }

  /**
   * Acknowledge an alert
   */
  acknowledgeAlert(alertId: string): boolean {
    const alert = this.alerts.get(alertId);
    if (alert) {
      alert.acknowledged = true;
      return true;
    }
    return false;
  }

  /**
   * Clear acknowledged alerts
   */
  clearAcknowledgedAlerts(): number {
    const toRemove: string[] = [];
    for (const [id, alert] of this.alerts) {
      if (alert.acknowledged) {
        toRemove.push(id);
      }
    }
    for (const id of toRemove) {
      this.alerts.delete(id);
    }
    return toRemove.length;
  }

  // ==========================================================================
  // History & Trends
  // ==========================================================================

  /**
   * Get history
   */
  getHistory(): MinCutHistoryEntry[] {
    return [...this.history];
  }

  /**
   * Get trend direction
   */
  getTrend(): 'improving' | 'stable' | 'degrading' {
    return this.calculateTrend();
  }

  /**
   * Get statistics over time window
   */
  getStats(windowMs: number = 60000): {
    min: number;
    max: number;
    average: number;
    count: number;
  } {
    const cutoff = Date.now() - windowMs;
    const entries = this.history.filter(e => e.timestamp.getTime() > cutoff);

    if (entries.length === 0) {
      const current = this.calculator.getMinCutValue(this.graph);
      return { min: current, max: current, average: current, count: 0 };
    }

    const values = entries.map(e => e.value);
    return {
      min: Math.min(...values),
      max: Math.max(...values),
      average: values.reduce((a, b) => a + b, 0) / values.length,
      count: entries.length,
    };
  }

  // ==========================================================================
  // Configuration
  // ==========================================================================

  /**
   * Update configuration
   */
  updateConfig(config: Partial<MinCutHealthConfig>): void {
    Object.assign(this.config, config);

    // Restart monitoring with new interval if needed
    if (config.checkIntervalMs && this.isMonitoring) {
      this.stop();
      this.start();
    }
  }

  /**
   * Get current configuration
   */
  getConfig(): MinCutHealthConfig {
    return { ...this.config };
  }

  // ==========================================================================
  // Private Helpers
  // ==========================================================================

  /**
   * Determine health status from MinCut value
   */
  private determineStatus(minCutValue: number): MinCutHealth['status'] {
    if (minCutValue >= this.config.healthyThreshold) {
      return 'healthy';
    } else if (minCutValue >= this.config.warningThreshold) {
      return 'warning';
    } else {
      return 'critical';
    }
  }

  /**
   * Calculate trend from history
   */
  private calculateTrend(): 'improving' | 'stable' | 'degrading' {
    if (this.history.length < 3) {
      return 'stable';
    }

    // Take last 5 entries
    const recent = this.history.slice(-5);
    const first = recent[0].value;
    const last = recent[recent.length - 1].value;
    const diff = last - first;

    // Calculate threshold based on average value
    const avgValue = recent.reduce((s, e) => s + e.value, 0) / recent.length;
    const threshold = avgValue * 0.1; // 10% change threshold

    if (diff > threshold) {
      return 'improving';
    } else if (diff < -threshold) {
      return 'degrading';
    } else {
      return 'stable';
    }
  }

  /**
   * Record history entry
   */
  private recordHistory(minCutValue: number): void {
    const entry: MinCutHistoryEntry = {
      timestamp: new Date(),
      value: minCutValue,
      vertexCount: this.graph.vertexCount,
      edgeCount: this.graph.edgeCount,
    };

    this.history.push(entry);

    // Trim history if too long
    while (this.history.length > this.config.maxHistoryEntries) {
      this.history.shift();
    }
  }

  /**
   * Check alert conditions and generate alerts
   */
  private checkAlertConditions(
    minCutValue: number,
    weakVertices: WeakVertex[],
    status: MinCutHealth['status']
  ): void {
    if (!this.config.alertsEnabled) return;

    const now = Date.now();

    // Check threshold crossing
    if (status === 'critical') {
      this.maybeGenerateAlert(
        'critical-threshold',
        'critical',
        `MinCut value (${minCutValue.toFixed(2)}) is below critical threshold (${this.config.warningThreshold})`,
        minCutValue,
        this.config.warningThreshold,
        weakVertices
      );
    } else if (status === 'warning') {
      this.maybeGenerateAlert(
        'warning-threshold',
        'high',
        `MinCut value (${minCutValue.toFixed(2)}) is below healthy threshold (${this.config.healthyThreshold})`,
        minCutValue,
        this.config.healthyThreshold,
        weakVertices
      );
    }

    // Check for isolated vertices
    const isolatedVertices = weakVertices.filter(v => v.weightedDegree === 0);
    if (isolatedVertices.length > 0) {
      this.maybeGenerateAlert(
        'isolated-vertices',
        'high',
        `${isolatedVertices.length} isolated vertex(es) detected`,
        minCutValue,
        0,
        isolatedVertices
      );
    }

    // Check for single-point-of-failure vertices
    const criticalVertices = weakVertices.filter(v => v.riskScore > 0.8);
    if (criticalVertices.length > 0) {
      this.maybeGenerateAlert(
        'critical-vertices',
        'medium',
        `${criticalVertices.length} critical vertex(es) with high risk score`,
        minCutValue,
        0,
        criticalVertices
      );
    }
  }

  /**
   * Generate alert if cooldown has passed
   */
  private maybeGenerateAlert(
    alertKey: string,
    severity: Severity,
    message: string,
    minCutValue: number,
    threshold: number,
    weakVertices: WeakVertex[]
  ): void {
    const now = Date.now();
    const lastAlert = this.lastAlertTime.get(alertKey) || 0;

    if (now - lastAlert < this.config.alertCooldownMs) {
      return;
    }

    const alert: MinCutAlert = {
      id: uuidv4(),
      severity,
      message,
      minCutValue,
      threshold,
      affectedVertices: weakVertices.map(v => v.vertexId),
      timestamp: new Date(),
      acknowledged: false,
      remediations: weakVertices.flatMap(v => v.suggestions).slice(0, 5),
    };

    this.alerts.set(alert.id, alert);
    this.lastAlertTime.set(alertKey, now);

    this.emitEvent('mincut.alert.generated', minCutValue, { alert });
  }

  /**
   * Emit MinCut event
   */
  private emitEvent(
    type: MinCutEventType,
    minCutValue: number,
    payload: Record<string, unknown>
  ): void {
    if (!this.eventBus) return;

    const event: DomainEvent = {
      id: uuidv4(),
      type,
      source: 'coordination',
      timestamp: new Date(),
      correlationId: uuidv4(),
      payload: {
        minCutValue,
        ...payload,
      },
    };

    this.eventBus.publish(event).catch(err => {
      console.error('Failed to publish MinCut event:', err);
    });
  }
}

/**
 * Create a MinCut health monitor
 */
export function createMinCutHealthMonitor(
  graph: SwarmGraph,
  config?: Partial<MinCutHealthConfig>,
  eventBus?: EventBus
): MinCutHealthMonitor {
  return new MinCutHealthMonitor(graph, config, eventBus);
}
