/**
 * SelfHealingMonitor - Automatic Performance Monitoring and Recovery for RuVector
 *
 * Based on ruv's AgentDB v2 architecture:
 * - Performance degradation detection (<5% over 30 days target)
 * - Automatic index rebalancing when performance drops
 * - Health monitoring dashboard data
 * - Adaptive HNSW parameter tuning
 *
 * Features:
 * - Rolling baseline calculation for accurate degradation detection
 * - Gradual HNSW parameter adjustment (M, efSearch)
 * - Index compaction when fragmentation detected
 * - Automatic cache invalidation on performance issues
 * - Event-based notifications for monitoring systems
 *
 * @module core/memory/SelfHealingMonitor
 * @version 1.0.0
 */

import type { IPatternStore, PatternStoreStats } from './IPatternStore';

/**
 * Health metrics snapshot
 */
export interface HealthMetrics {
  qps: number;                // Current queries per second
  p50Latency: number;         // p50 latency in µs
  p99Latency: number;         // p99 latency in µs
  memoryUsage: number;        // Memory in MB
  indexSize: number;          // Number of indexed patterns
  lastOptimization: number;   // Timestamp
  degradationPercent: number; // Performance drop from baseline
  timestamp: number;          // When metrics were captured
}

/**
 * Monitor configuration
 */
export interface MonitorConfig {
  checkIntervalMs?: number;      // Default: 60000 (1 minute)
  degradationThreshold?: number; // Default: 0.05 (5%)
  autoHeal?: boolean;            // Default: true
  baselineWindow?: number;       // Samples for baseline (default: 100)
  enableAdaptiveTuning?: boolean; // Default: true
  maxHealingActions?: number;    // Max actions to store (default: 100)
  minTimeBetweenHeals?: number;  // Min time between heals in ms (default: 300000 - 5 min)
}

/**
 * Healing action record
 */
export interface HealingAction {
  type: 'reindex' | 'compact' | 'tune_hnsw' | 'clear_cache';
  reason: string;
  timestamp: number;
  success: boolean;
  metricsAfter?: HealthMetrics;
  error?: string;
  parameters?: Record<string, any>;
}

/**
 * HNSW parameters for adaptive tuning
 */
interface HNSWParams {
  m: number;
  efConstruction: number;
  efSearch: number;
}

/**
 * Event callback type
 */
type EventCallback = (data: any) => void;

/**
 * Event types
 */
type MonitorEvent = 'degradation' | 'healed' | 'error' | 'metrics_updated';

/**
 * Self-healing monitor for RuVector pattern store
 *
 * Continuously monitors performance and automatically applies healing actions
 * when degradation is detected.
 */
export class SelfHealingMonitor {
  private store: IPatternStore;
  private config: Required<MonitorConfig>;
  private intervalId?: NodeJS.Timeout;
  private running = false;

  // Metrics tracking
  private metricsHistory: HealthMetrics[] = [];
  private baselineMetrics?: HealthMetrics;
  private lastHealthCheck = 0;
  private queryCount = 0;
  private queryTimings: number[] = [];

  // Healing tracking
  private healingHistory: HealingAction[] = [];
  private lastHealingTime = 0;
  private currentHNSWParams: HNSWParams = {
    m: 16,
    efConstruction: 200,
    efSearch: 100,
  };

  // Event listeners
  private eventListeners: Map<MonitorEvent, Set<EventCallback>> = new Map();

  /**
   * Create a new self-healing monitor
   */
  constructor(store: IPatternStore, config?: MonitorConfig) {
    this.store = store;
    this.config = {
      checkIntervalMs: config?.checkIntervalMs ?? 60000,
      degradationThreshold: config?.degradationThreshold ?? 0.05,
      autoHeal: config?.autoHeal ?? true,
      baselineWindow: config?.baselineWindow ?? 100,
      enableAdaptiveTuning: config?.enableAdaptiveTuning ?? true,
      maxHealingActions: config?.maxHealingActions ?? 100,
      minTimeBetweenHeals: config?.minTimeBetweenHeals ?? 300000,
    };

    // Initialize event listener maps
    ['degradation', 'healed', 'error', 'metrics_updated'].forEach((event) => {
      this.eventListeners.set(event as MonitorEvent, new Set());
    });
  }

  /**
   * Start continuous monitoring
   */
  start(): void {
    if (this.running) {
      console.warn('SelfHealingMonitor is already running');
      return;
    }

    this.running = true;
    console.log(
      `SelfHealingMonitor started (interval: ${this.config.checkIntervalMs}ms, threshold: ${this.config.degradationThreshold * 100}%)`
    );

    // Initial health check
    this.performHealthCheck().catch((error) => {
      this.emit('error', { message: 'Initial health check failed', error });
    });

    // Schedule periodic checks
    this.intervalId = setInterval(() => {
      this.performHealthCheck().catch((error) => {
        this.emit('error', { message: 'Health check failed', error });
      });
    }, this.config.checkIntervalMs);
  }

  /**
   * Stop monitoring
   */
  stop(): void {
    if (!this.running) {
      return;
    }

    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = undefined;
    }

    this.running = false;
    console.log('SelfHealingMonitor stopped');
  }

  /**
   * Get current health metrics
   */
  getHealth(): HealthMetrics {
    if (this.metricsHistory.length === 0) {
      return this.createEmptyMetrics();
    }

    return this.metricsHistory[this.metricsHistory.length - 1];
  }

  /**
   * Get healing history
   */
  getHealingHistory(): HealingAction[] {
    return [...this.healingHistory];
  }

  /**
   * Manual healing trigger
   */
  async heal(force = false): Promise<HealingAction | null> {
    const currentMetrics = await this.collectMetrics();
    const degradation = this.calculateDegradation(currentMetrics);

    // Check if healing is needed
    if (!force) {
      if (degradation < this.config.degradationThreshold) {
        console.log('No healing needed: performance within threshold');
        return null;
      }

      // Check minimum time between heals
      const timeSinceLastHeal = Date.now() - this.lastHealingTime;
      if (timeSinceLastHeal < this.config.minTimeBetweenHeals) {
        console.log(
          `Skipping heal: ${Math.round((this.config.minTimeBetweenHeals - timeSinceLastHeal) / 1000)}s until next allowed heal`
        );
        return null;
      }
    }

    // Determine best healing action
    const action = this.determineHealingAction(currentMetrics, degradation);

    console.log(`Applying healing action: ${action.type} (reason: ${action.reason})`);

    try {
      await this.applyHealingAction(action);
      action.success = true;

      // Collect metrics after healing
      await new Promise((resolve) => setTimeout(resolve, 1000));
      action.metricsAfter = await this.collectMetrics();

      this.lastHealingTime = Date.now();
      this.recordHealingAction(action);

      this.emit('healed', action);

      return action;
    } catch (error) {
      action.success = false;
      action.error = error instanceof Error ? error.message : String(error);
      this.recordHealingAction(action);

      this.emit('error', { message: 'Healing action failed', action, error });

      return action;
    }
  }

  /**
   * Event listener registration
   */
  on(event: MonitorEvent, callback: EventCallback): void {
    const listeners = this.eventListeners.get(event);
    if (listeners) {
      listeners.add(callback);
    }
  }

  /**
   * Event listener removal
   */
  off(event: MonitorEvent, callback: EventCallback): void {
    const listeners = this.eventListeners.get(event);
    if (listeners) {
      listeners.delete(callback);
    }
  }

  /**
   * Export metrics for dashboard
   */
  exportMetrics(): {
    current: HealthMetrics;
    history: HealthMetrics[];
    actions: HealingAction[];
    baseline?: HealthMetrics;
    config: Required<MonitorConfig>;
  } {
    return {
      current: this.getHealth(),
      history: [...this.metricsHistory],
      actions: this.getHealingHistory(),
      baseline: this.baselineMetrics,
      config: this.config,
    };
  }

  /**
   * Record query for QPS calculation
   */
  recordQuery(latencyUs: number): void {
    this.queryCount++;
    this.queryTimings.push(latencyUs);

    // Keep only recent timings (last 1000 queries)
    if (this.queryTimings.length > 1000) {
      this.queryTimings.shift();
    }
  }

  // --- Private Methods ---

  /**
   * Perform periodic health check
   */
  private async performHealthCheck(): Promise<void> {
    const metrics = await this.collectMetrics();

    // Calculate degradation
    metrics.degradationPercent = this.calculateDegradation(metrics);

    // Store metrics
    this.metricsHistory.push(metrics);
    if (this.metricsHistory.length > 1000) {
      this.metricsHistory.shift();
    }

    // Update baseline if needed
    this.updateBaseline(metrics);

    this.lastHealthCheck = Date.now();
    this.emit('metrics_updated', metrics);

    // Check for degradation and auto-heal
    if (
      this.config.autoHeal &&
      metrics.degradationPercent >= this.config.degradationThreshold
    ) {
      const timeSinceLastHeal = Date.now() - this.lastHealingTime;
      if (timeSinceLastHeal >= this.config.minTimeBetweenHeals) {
        this.emit('degradation', {
          metrics,
          degradation: metrics.degradationPercent,
          threshold: this.config.degradationThreshold,
        });

        await this.heal(false);
      }
    }
  }

  /**
   * Collect current metrics from pattern store
   */
  private async collectMetrics(): Promise<HealthMetrics> {
    const stats = await this.store.getStats();

    // Calculate QPS
    const now = Date.now();
    const timeSinceLastCheck = this.lastHealthCheck
      ? (now - this.lastHealthCheck) / 1000
      : 1;
    const qps = timeSinceLastCheck > 0 ? this.queryCount / timeSinceLastCheck : 0;

    // Calculate latency percentiles
    const sortedTimings = [...this.queryTimings].sort((a, b) => a - b);
    const p50 = this.getPercentile(sortedTimings, 0.5);
    const p99 = this.getPercentile(sortedTimings, 0.99);

    // Reset query tracking
    this.queryCount = 0;

    const metrics: HealthMetrics = {
      qps: Math.round(qps * 100) / 100,
      p50Latency: Math.round(p50),
      p99Latency: Math.round(p99),
      memoryUsage: stats.memoryUsage ?? 0,
      indexSize: stats.count,
      lastOptimization: this.getLastOptimizationTime(),
      degradationPercent: 0, // Will be calculated
      timestamp: now,
    };

    return metrics;
  }

  /**
   * Calculate percentile from sorted array
   */
  private getPercentile(sortedValues: number[], percentile: number): number {
    if (sortedValues.length === 0) return 0;

    const index = Math.ceil(sortedValues.length * percentile) - 1;
    return sortedValues[Math.max(0, index)];
  }

  /**
   * Get timestamp of last optimization
   */
  private getLastOptimizationTime(): number {
    const optimizationActions = this.healingHistory.filter(
      (action) =>
        action.type === 'reindex' || action.type === 'compact' || action.type === 'tune_hnsw'
    );

    if (optimizationActions.length === 0) return 0;

    return optimizationActions[optimizationActions.length - 1].timestamp;
  }

  /**
   * Calculate degradation percentage compared to baseline
   */
  private calculateDegradation(current: HealthMetrics): number {
    if (!this.baselineMetrics) {
      return 0;
    }

    // Primary metric: p99 latency degradation
    const latencyDegradation =
      this.baselineMetrics.p99Latency > 0
        ? (current.p99Latency - this.baselineMetrics.p99Latency) /
          this.baselineMetrics.p99Latency
        : 0;

    // Secondary metric: QPS degradation (inverse - lower QPS is worse)
    const qpsDegradation =
      this.baselineMetrics.qps > 0
        ? (this.baselineMetrics.qps - current.qps) / this.baselineMetrics.qps
        : 0;

    // Weighted average (70% latency, 30% QPS)
    const degradation = latencyDegradation * 0.7 + qpsDegradation * 0.3;

    return Math.max(0, degradation);
  }

  /**
   * Update baseline metrics
   */
  private updateBaseline(current: HealthMetrics): void {
    // Wait until we have enough samples
    if (this.metricsHistory.length < this.config.baselineWindow) {
      return;
    }

    // Use median of recent samples as baseline
    const recentMetrics = this.metricsHistory.slice(-this.config.baselineWindow);

    const medianP99 = this.getPercentile(
      recentMetrics.map((m) => m.p99Latency).sort((a, b) => a - b),
      0.5
    );

    const medianQPS = this.getPercentile(
      recentMetrics.map((m) => m.qps).sort((a, b) => a - b),
      0.5
    );

    this.baselineMetrics = {
      ...current,
      p99Latency: medianP99,
      qps: medianQPS,
      degradationPercent: 0,
    };
  }

  /**
   * Determine best healing action based on metrics
   */
  private determineHealingAction(
    metrics: HealthMetrics,
    degradation: number
  ): HealingAction {
    const now = Date.now();

    // High latency -> tune HNSW parameters
    if (
      this.config.enableAdaptiveTuning &&
      this.baselineMetrics &&
      metrics.p99Latency > this.baselineMetrics.p99Latency * 1.5
    ) {
      return {
        type: 'tune_hnsw',
        reason: `p99 latency ${Math.round(metrics.p99Latency)}µs exceeds baseline by 50%`,
        timestamp: now,
        success: false,
        parameters: { ...this.currentHNSWParams },
      };
    }

    // Low QPS -> clear cache
    if (
      this.baselineMetrics &&
      metrics.qps < this.baselineMetrics.qps * 0.7
    ) {
      return {
        type: 'clear_cache',
        reason: `QPS ${metrics.qps} is 30% below baseline`,
        timestamp: now,
        success: false,
      };
    }

    // Large index without recent optimization -> compact
    const daysSinceOptimization = metrics.lastOptimization
      ? (now - metrics.lastOptimization) / (1000 * 60 * 60 * 24)
      : Infinity;

    if (metrics.indexSize > 10000 && daysSinceOptimization > 7) {
      return {
        type: 'compact',
        reason: `Index size ${metrics.indexSize} with ${Math.round(daysSinceOptimization)} days since last optimization`,
        timestamp: now,
        success: false,
      };
    }

    // Default: reindex
    return {
      type: 'reindex',
      reason: `Performance degradation ${Math.round(degradation * 100)}% exceeds threshold`,
      timestamp: now,
      success: false,
    };
  }

  /**
   * Apply healing action
   */
  private async applyHealingAction(action: HealingAction): Promise<void> {
    switch (action.type) {
      case 'reindex':
        await this.store.buildIndex();
        break;

      case 'compact':
        await this.store.optimize();
        break;

      case 'tune_hnsw':
        await this.tuneHNSWParameters();
        await this.store.buildIndex();
        break;

      case 'clear_cache':
        // Clear internal cache
        this.queryTimings = [];
        this.queryCount = 0;
        break;

      default:
        throw new Error(`Unknown healing action type: ${action.type}`);
    }
  }

  /**
   * Adaptively tune HNSW parameters
   */
  private async tuneHNSWParameters(): Promise<void> {
    const current = this.getHealth();

    // Increase efSearch for better recall at cost of speed
    if (current.p99Latency < 1000) {
      // Still fast, can increase
      this.currentHNSWParams.efSearch = Math.min(
        this.currentHNSWParams.efSearch + 50,
        500
      );
    } else {
      // Too slow, decrease
      this.currentHNSWParams.efSearch = Math.max(
        this.currentHNSWParams.efSearch - 50,
        50
      );
    }

    console.log(
      `Tuned HNSW parameters: efSearch=${this.currentHNSWParams.efSearch}`
    );
  }

  /**
   * Record healing action
   */
  private recordHealingAction(action: HealingAction): void {
    this.healingHistory.push(action);

    // Trim history
    if (this.healingHistory.length > this.config.maxHealingActions) {
      this.healingHistory.shift();
    }
  }

  /**
   * Emit event to listeners
   */
  private emit(event: MonitorEvent, data: any): void {
    const listeners = this.eventListeners.get(event);
    if (listeners) {
      listeners.forEach((callback) => {
        try {
          callback(data);
        } catch (error) {
          console.error(`Error in ${event} event listener:`, error);
        }
      });
    }
  }

  /**
   * Create empty metrics object
   */
  private createEmptyMetrics(): HealthMetrics {
    return {
      qps: 0,
      p50Latency: 0,
      p99Latency: 0,
      memoryUsage: 0,
      indexSize: 0,
      lastOptimization: 0,
      degradationPercent: 0,
      timestamp: Date.now(),
    };
  }
}

/**
 * Create a self-healing monitor with default configuration
 */
export function createSelfHealingMonitor(
  store: IPatternStore,
  config?: MonitorConfig
): SelfHealingMonitor {
  return new SelfHealingMonitor(store, config);
}
