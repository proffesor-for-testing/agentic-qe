/**
 * SPOFMonitor - Real-time Single Point of Failure Monitoring
 *
 * Monitors fleet topology changes and automatically detects SPOFs.
 * Emits events when:
 * - Critical SPOFs are detected
 * - Resilience score drops below threshold
 * - Topology changes significantly
 */

import { EventEmitter } from 'events';
import { TopologyMinCutAnalyzer } from './TopologyMinCutAnalyzer.js';
import {
  FleetTopology,
  ResilienceResult,
  SPOFResult,
  TopologyAnalysisConfig,
  DEFAULT_TOPOLOGY_ANALYSIS_CONFIG,
} from './types.js';
import { Logger } from '../../utils/Logger.js';

const logger = Logger.getInstance();

/**
 * Configuration for SPOF monitoring
 */
export interface SPOFMonitorConfig {
  /** Enable/disable monitoring */
  enabled?: boolean;
  /** Minimum time between analyses (debounce) in ms */
  debounceInterval?: number;
  /** Resilience score threshold for warnings */
  resilienceThreshold?: number;
  /** Maximum number of critical SPOFs before alert */
  maxCriticalSpofs?: number;
  /** History size for trend analysis */
  historySize?: number;
  /** Analysis configuration */
  analysisConfig?: TopologyAnalysisConfig;
}

/**
 * Default SPOF monitor configuration
 */
export const DEFAULT_SPOF_MONITOR_CONFIG: Required<SPOFMonitorConfig> = {
  enabled: true,
  debounceInterval: 5000,
  resilienceThreshold: 0.6,
  maxCriticalSpofs: 0,
  historySize: 50,
  analysisConfig: DEFAULT_TOPOLOGY_ANALYSIS_CONFIG,
};

/**
 * SPOF monitoring events
 */
export type SPOFMonitorEvents = {
  /** Emitted when critical SPOFs are detected */
  'spof:critical': { spofs: SPOFResult[]; result: ResilienceResult };
  /** Emitted when resilience drops below threshold */
  'resilience:low': { score: number; threshold: number; result: ResilienceResult };
  /** Emitted when resilience is restored above threshold */
  'resilience:restored': { score: number; previousScore: number };
  /** Emitted when topology changes significantly */
  'topology:changed': { nodesDelta: number; edgesDelta: number };
  /** Emitted after each analysis */
  'analysis:complete': { result: ResilienceResult };
  /** Emitted on analysis error */
  'analysis:error': { error: Error };
};

/**
 * Resilience history entry
 */
interface ResilienceHistoryEntry {
  timestamp: Date;
  score: number;
  grade: ResilienceResult['grade'];
  criticalSpofs: number;
  totalNodes: number;
  totalEdges: number;
}

/**
 * Real-time SPOF Monitor
 *
 * @example
 * ```typescript
 * const monitor = new SPOFMonitor({
 *   resilienceThreshold: 0.7,
 *   maxCriticalSpofs: 0,
 * });
 *
 * monitor.on('spof:critical', ({ spofs, result }) => {
 *   console.log(`ALERT: ${spofs.length} critical SPOFs detected!`);
 * });
 *
 * // Feed topology updates
 * monitor.onTopologyChanged(newTopology);
 * ```
 */
export class SPOFMonitor extends EventEmitter {
  private config: Required<SPOFMonitorConfig>;
  private analyzer: TopologyMinCutAnalyzer;
  private lastTopology?: FleetTopology;
  private lastResult?: ResilienceResult;
  private history: ResilienceHistoryEntry[] = [];
  private analysisTimeout?: ReturnType<typeof setTimeout>;
  private isAnalyzing = false;
  private started = false;

  constructor(config: SPOFMonitorConfig = {}) {
    super();
    this.config = { ...DEFAULT_SPOF_MONITOR_CONFIG, ...config };
    this.analyzer = new TopologyMinCutAnalyzer(this.config.analysisConfig);

    logger.info('SPOFMonitor initialized', {
      resilienceThreshold: this.config.resilienceThreshold,
      maxCriticalSpofs: this.config.maxCriticalSpofs,
      debounceInterval: this.config.debounceInterval,
    });
  }

  /**
   * Start monitoring
   */
  public start(): void {
    if (this.started) return;
    this.started = true;
    logger.info('SPOFMonitor started');
  }

  /**
   * Stop monitoring
   */
  public stop(): void {
    this.started = false;
    if (this.analysisTimeout) {
      clearTimeout(this.analysisTimeout);
      this.analysisTimeout = undefined;
    }
    logger.info('SPOFMonitor stopped');
  }

  /**
   * Check if monitoring is active
   */
  public isRunning(): boolean {
    return this.started && this.config.enabled;
  }

  /**
   * Handle topology change event
   *
   * @param topology - New fleet topology
   */
  public async onTopologyChanged(topology: FleetTopology): Promise<void> {
    if (!this.isRunning()) return;

    // Detect significant changes
    if (this.lastTopology) {
      const nodesDelta = topology.nodes.length - this.lastTopology.nodes.length;
      const edgesDelta = topology.edges.length - this.lastTopology.edges.length;

      if (nodesDelta !== 0 || edgesDelta !== 0) {
        this.emit('topology:changed', { nodesDelta, edgesDelta });
      }
    }

    this.lastTopology = topology;

    // Debounce analysis
    this.scheduleAnalysis(topology);
  }

  /**
   * Force immediate analysis
   *
   * @param topology - Fleet topology to analyze
   */
  public async analyzeNow(topology: FleetTopology): Promise<ResilienceResult> {
    // Cancel any pending debounced analysis
    if (this.analysisTimeout) {
      clearTimeout(this.analysisTimeout);
      this.analysisTimeout = undefined;
    }

    return this.performAnalysis(topology);
  }

  /**
   * Get current resilience status
   */
  public getStatus(): {
    lastResult?: ResilienceResult;
    isHealthy: boolean;
    trend: 'improving' | 'stable' | 'declining' | 'unknown';
  } {
    const trend = this.calculateTrend();
    const isHealthy =
      !this.lastResult ||
      (this.lastResult.score >= this.config.resilienceThreshold &&
        this.lastResult.criticalSpofs.length <= this.config.maxCriticalSpofs);

    return {
      lastResult: this.lastResult,
      isHealthy,
      trend,
    };
  }

  /**
   * Get resilience history
   */
  public getHistory(): ResilienceHistoryEntry[] {
    return [...this.history];
  }

  /**
   * Schedule debounced analysis
   */
  private scheduleAnalysis(topology: FleetTopology): void {
    if (this.analysisTimeout) {
      clearTimeout(this.analysisTimeout);
    }

    this.analysisTimeout = setTimeout(async () => {
      await this.performAnalysis(topology);
    }, this.config.debounceInterval);
  }

  /**
   * Perform resilience analysis
   */
  private async performAnalysis(topology: FleetTopology): Promise<ResilienceResult> {
    if (this.isAnalyzing) {
      logger.warn('Analysis already in progress, skipping');
      return this.lastResult!;
    }

    this.isAnalyzing = true;

    try {
      const result = await this.analyzer.analyzeResilience(topology);
      const previousScore = this.lastResult?.score;

      this.lastResult = result;
      this.addToHistory(result, topology);

      // Emit events based on analysis
      this.processResult(result, previousScore);

      this.emit('analysis:complete', { result });

      return result;
    } catch (error) {
      logger.error('SPOF analysis failed', { error });
      this.emit('analysis:error', { error: error as Error });
      throw error;
    } finally {
      this.isAnalyzing = false;
    }
  }

  /**
   * Process analysis result and emit appropriate events
   */
  private processResult(result: ResilienceResult, previousScore?: number): void {
    // Check for critical SPOFs
    if (result.criticalSpofs.length > this.config.maxCriticalSpofs) {
      logger.warn('Critical SPOFs detected', {
        count: result.criticalSpofs.length,
        spofs: result.criticalSpofs.map(s => s.agentId),
      });
      this.emit('spof:critical', { spofs: result.criticalSpofs, result });
    }

    // Check for low resilience
    if (result.score < this.config.resilienceThreshold) {
      logger.warn('Low resilience detected', {
        score: result.score,
        threshold: this.config.resilienceThreshold,
        grade: result.grade,
      });
      this.emit('resilience:low', {
        score: result.score,
        threshold: this.config.resilienceThreshold,
        result,
      });
    }

    // Check for resilience restoration
    if (
      previousScore !== undefined &&
      previousScore < this.config.resilienceThreshold &&
      result.score >= this.config.resilienceThreshold
    ) {
      logger.info('Resilience restored', {
        previousScore,
        currentScore: result.score,
      });
      this.emit('resilience:restored', {
        score: result.score,
        previousScore,
      });
    }
  }

  /**
   * Add result to history
   */
  private addToHistory(result: ResilienceResult, topology: FleetTopology): void {
    this.history.push({
      timestamp: new Date(),
      score: result.score,
      grade: result.grade,
      criticalSpofs: result.criticalSpofs.length,
      totalNodes: topology.nodes.length,
      totalEdges: topology.edges.length,
    });

    // Trim history to max size
    if (this.history.length > this.config.historySize) {
      this.history = this.history.slice(-this.config.historySize);
    }
  }

  /**
   * Calculate resilience trend from history
   */
  private calculateTrend(): 'improving' | 'stable' | 'declining' | 'unknown' {
    if (this.history.length < 3) {
      return 'unknown';
    }

    // Get last 5 entries (or all if less than 5)
    const recentHistory = this.history.slice(-5);
    const scores = recentHistory.map(h => h.score);

    // Calculate trend using simple linear regression
    const n = scores.length;
    const sumX = (n * (n - 1)) / 2;
    const sumY = scores.reduce((a, b) => a + b, 0);
    const sumXY = scores.reduce((sum, score, i) => sum + i * score, 0);
    const sumX2 = (n * (n - 1) * (2 * n - 1)) / 6;

    const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);

    if (slope > 0.05) {
      return 'improving';
    } else if (slope < -0.05) {
      return 'declining';
    }
    return 'stable';
  }

  /**
   * Get the underlying analyzer
   */
  public getAnalyzer(): TopologyMinCutAnalyzer {
    return this.analyzer;
  }

  /**
   * Override EventEmitter.emit for type safety
   */
  public emit<K extends keyof SPOFMonitorEvents>(
    event: K,
    data: SPOFMonitorEvents[K]
  ): boolean {
    return super.emit(event, data);
  }

  /**
   * Override EventEmitter.on for type safety
   */
  public on<K extends keyof SPOFMonitorEvents>(
    event: K,
    listener: (data: SPOFMonitorEvents[K]) => void
  ): this {
    return super.on(event, listener);
  }

  /**
   * Override EventEmitter.once for type safety
   */
  public once<K extends keyof SPOFMonitorEvents>(
    event: K,
    listener: (data: SPOFMonitorEvents[K]) => void
  ): this {
    return super.once(event, listener);
  }
}
