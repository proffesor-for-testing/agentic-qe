/**
 * Auto-Tuner Core Implementation
 * ADR-024: Self-Optimization Engine
 *
 * Main orchestrator for automatic parameter tuning.
 */

import type {
  TunableParameter,
  TuningConfig,
  EvaluationResult,
  TuningCycleResult,
  ParameterSuggestion,
  AutoTunerState,
  AutoTunerStats,
  MetricStats,
  ParameterApplicator,
  ParameterApplicatorRegistry,
} from './types.js';
import {
  DEFAULT_TUNABLE_PARAMETERS,
  DEFAULT_TUNING_CONFIG,
} from './types.js';
import type {
  SearchLatencyCollector,
  RoutingAccuracyCollector,
  PatternQualityCollector,
  TestMaintainabilityCollector,
} from './metric-collectors.js';
import {
  MetricCollectorRegistry,
  createDefaultCollectorRegistry,
} from './metric-collectors.js';
import { toError } from '../shared/error-utils.js';
import { secureRandom } from '../shared/utils/crypto-random.js';
import {
  TuningAlgorithm,
  createTuningAlgorithm,
} from './tuning-algorithm.js';

// ============================================================================
// Auto-Tuner Events
// ============================================================================

/**
 * Events emitted by the auto-tuner
 */
export type AutoTunerEvent =
  | { type: 'cycle-started'; cycleId: string }
  | { type: 'cycle-completed'; result: TuningCycleResult }
  | { type: 'parameter-changed'; parameter: string; oldValue: number | string; newValue: number | string }
  | { type: 'suggestion-generated'; suggestions: ParameterSuggestion[] }
  | { type: 'error'; error: Error };

export type AutoTunerEventHandler = (event: AutoTunerEvent) => void;

// ============================================================================
// Parameter Applicator Registry Implementation
// ============================================================================

/**
 * Default implementation of ParameterApplicatorRegistry
 * Manages applicators that bridge tuning suggestions to real system changes
 */
export class DefaultParameterApplicatorRegistry implements ParameterApplicatorRegistry {
  private applicators = new Map<string, ParameterApplicator>();

  register(applicator: ParameterApplicator): void {
    this.applicators.set(applicator.parameterName, applicator);
  }

  get(parameterName: string): ParameterApplicator | undefined {
    return this.applicators.get(parameterName);
  }

  getAll(): ParameterApplicator[] {
    return Array.from(this.applicators.values());
  }

  async applyConfiguration(config: Record<string, number | string>): Promise<void> {
    const errors: Error[] = [];

    for (const [paramName, value] of Object.entries(config)) {
      const applicator = this.applicators.get(paramName);
      if (applicator) {
        try {
          // Validate if validator exists
          if (applicator.validate && !applicator.validate(value)) {
            errors.push(new Error(`Validation failed for ${paramName}: ${value}`));
            continue;
          }
          await applicator.setValue(value);
        } catch (error) {
          errors.push(toError(error));
        }
      }
    }

    if (errors.length > 0) {
      throw new AggregateError(errors, `Failed to apply ${errors.length} parameter(s)`);
    }
  }
}

/**
 * Create a default (empty) parameter applicator registry
 * Users should register their own applicators for real system integration
 */
export function createParameterApplicatorRegistry(): ParameterApplicatorRegistry {
  return new DefaultParameterApplicatorRegistry();
}

// ============================================================================
// AQE Auto-Tuner
// ============================================================================

/**
 * AQE Auto-Tuner
 *
 * Automatically tunes system parameters based on performance metrics.
 * Uses gradient-free optimization to find optimal configurations.
 */
export class AQEAutoTuner {
  private parameters: TunableParameter[];
  private config: TuningConfig & { evaluationPeriodMs: number };
  private collectorRegistry: MetricCollectorRegistry;
  private applicatorRegistry: ParameterApplicatorRegistry;
  private algorithm: TuningAlgorithm;

  private state: AutoTunerState;
  private evaluationHistory: EvaluationResult[] = [];
  private eventHandlers: AutoTunerEventHandler[] = [];

  private tuningTimer?: ReturnType<typeof setInterval>;
  private collectionTimer?: ReturnType<typeof setInterval>;

  constructor(
    parameters: TunableParameter[] = DEFAULT_TUNABLE_PARAMETERS,
    config: Partial<TuningConfig> & { evaluationPeriodMs?: number } = {},
    collectorRegistry?: MetricCollectorRegistry,
    algorithm?: TuningAlgorithm,
    applicatorRegistry?: ParameterApplicatorRegistry
  ) {
    this.parameters = [...parameters];
    this.config = {
      ...DEFAULT_TUNING_CONFIG,
      ...config,
      evaluationPeriodMs: config.evaluationPeriodMs ?? 5000, // 5 seconds default for evaluation
    };
    this.collectorRegistry = collectorRegistry || createDefaultCollectorRegistry();
    this.applicatorRegistry = applicatorRegistry || createParameterApplicatorRegistry();
    this.algorithm = algorithm || createTuningAlgorithm();

    this.state = {
      status: 'idle',
      totalCycles: 0,
      totalImprovements: 0,
      currentParameters: this.getCurrentParameterValues(),
      parameterHistory: [],
    };
  }

  /**
   * Register a parameter applicator for real system integration
   */
  registerApplicator(applicator: ParameterApplicator): void {
    this.applicatorRegistry.register(applicator);
  }

  /**
   * Get the applicator registry
   */
  getApplicatorRegistry(): ParameterApplicatorRegistry {
    return this.applicatorRegistry;
  }

  // ============================================================================
  // Lifecycle Methods
  // ============================================================================

  /**
   * Start the auto-tuner
   */
  start(): void {
    if (this.tuningTimer) {
      return; // Already running
    }

    // Start metric collection (every 5 minutes)
    this.collectionTimer = setInterval(
      () => this.collectMetrics(),
      5 * 60 * 1000
    );

    // Start tuning cycles
    this.tuningTimer = setInterval(
      () => this.runTuningCycle(),
      this.config.tuningIntervalMs
    );

    this.state.status = 'collecting';
  }

  /**
   * Stop the auto-tuner
   */
  stop(): void {
    if (this.tuningTimer) {
      clearInterval(this.tuningTimer);
      this.tuningTimer = undefined;
    }
    if (this.collectionTimer) {
      clearInterval(this.collectionTimer);
      this.collectionTimer = undefined;
    }
    this.state.status = 'idle';
  }

  /**
   * Check if the tuner is running
   */
  isRunning(): boolean {
    return this.tuningTimer !== undefined;
  }

  // ============================================================================
  // Metric Collection
  // ============================================================================

  /**
   * Collect current metrics
   */
  async collectMetrics(): Promise<void> {
    try {
      await this.collectorRegistry.collectAll();
    } catch (error) {
      this.emit({ type: 'error', error: error as Error });
    }
  }

  /**
   * Record a search latency metric
   */
  recordSearchLatency(latencyMs: number): void {
    const collector = this.collectorRegistry.get('search_latency_ms') as SearchLatencyCollector | undefined;
    if (collector && 'recordLatency' in collector) {
      collector.recordLatency(latencyMs);
    }
  }

  /**
   * Record a routing outcome (properly handles the two-boolean interface)
   */
  recordRoutingOutcome(followedRecommendation: boolean, wasSuccessful: boolean): void {
    const collector = this.collectorRegistry.get('routing_accuracy') as RoutingAccuracyCollector | undefined;
    if (collector && 'recordOutcome' in collector) {
      collector.recordOutcome(followedRecommendation, wasSuccessful);
    }
  }

  /**
   * Record a pattern quality score
   */
  recordPatternQuality(score: number): void {
    const collector = this.collectorRegistry.get('pattern_quality_score') as PatternQualityCollector | undefined;
    if (collector && 'recordQuality' in collector) {
      collector.recordQuality(score);
    }
  }

  /**
   * Record a test maintainability score
   */
  recordTestMaintainability(score: number): void {
    const collector = this.collectorRegistry.get('test_maintainability') as TestMaintainabilityCollector | undefined;
    if (collector && 'recordMaintainability' in collector) {
      collector.recordMaintainability(score);
    }
  }

  /**
   * Generic metric recording (for numeric values only)
   * @deprecated Use specific record methods for type safety
   */
  recordMetric(metricName: string, value: number): void {
    const collector = this.collectorRegistry.get(metricName);
    if (!collector) return;

    // Type-safe dispatch based on metric name
    switch (metricName) {
      case 'search_latency_ms':
        this.recordSearchLatency(value);
        break;
      case 'pattern_quality_score':
        this.recordPatternQuality(value);
        break;
      case 'test_maintainability':
        this.recordTestMaintainability(value);
        break;
      case 'routing_accuracy':
        // Cannot use generic recordMetric for routing_accuracy - it needs two booleans
        console.warn('Use recordRoutingOutcome(followed, success) for routing_accuracy metric');
        break;
      default:
        // For custom collectors, try common interfaces
        if ('recordLatency' in collector) {
          (collector as { recordLatency: (v: number) => void }).recordLatency(value);
        } else if ('recordQuality' in collector) {
          (collector as { recordQuality: (v: number) => void }).recordQuality(value);
        }
    }
  }

  // ============================================================================
  // Tuning Cycle
  // ============================================================================

  /**
   * Run a single tuning cycle
   */
  async runTuningCycle(): Promise<TuningCycleResult> {
    const cycleId = `cycle-${Date.now()}`;
    const startedAt = new Date();

    this.emit({ type: 'cycle-started', cycleId });
    this.state.status = 'tuning';

    try {
      // Get current metric stats
      const metricStats = await this.collectorRegistry.getAllStats(
        this.config.tuningIntervalMs
      );

      // Check if we have enough data
      const totalSamples = Array.from(metricStats.values())
        .reduce((sum, stat) => sum + stat.count, 0);

      if (totalSamples < this.config.minSamplesBeforeTuning) {
        const result = this.createSkippedCycleResult(cycleId, startedAt, 'Insufficient data');
        this.state.status = 'collecting';
        return result;
      }

      // Run evaluations
      const evaluations: EvaluationResult[] = [];
      for (let i = 0; i < this.config.evaluationsPerCycle; i++) {
        const evaluation = await this.runEvaluation(metricStats);
        evaluations.push(evaluation);
        this.evaluationHistory.push(evaluation);
      }

      // Trim history to last 1000 evaluations
      if (this.evaluationHistory.length > 1000) {
        this.evaluationHistory = this.evaluationHistory.slice(-1000);
      }

      // Find best configuration
      const bestEvaluation = evaluations.reduce(
        (best, curr) => curr.overallScore > best.overallScore ? curr : best,
        evaluations[0]
      );

      // Generate suggestions
      const suggestions = this.algorithm.generateSuggestions(
        this.parameters,
        this.evaluationHistory,
        metricStats
      );

      this.emit({ type: 'suggestion-generated', suggestions });

      // Apply changes if enabled and improvement is significant
      const appliedChanges = this.config.autoApply
        ? await this.applyBestConfiguration(bestEvaluation, metricStats)
        : [];

      const completedAt = new Date();
      const result: TuningCycleResult = {
        cycleId,
        startedAt,
        completedAt,
        evaluationsPerformed: evaluations.length,
        bestConfiguration: bestEvaluation.parameterValues,
        bestScore: bestEvaluation.overallScore,
        suggestions,
        appliedChanges,
      };

      // Update state
      this.state.lastTuningCycle = result;
      this.state.totalCycles++;
      this.state.totalImprovements += appliedChanges.length;
      this.state.status = 'collecting';

      this.emit({ type: 'cycle-completed', result });

      return result;
    } catch (error) {
      this.state.status = 'error';
      this.emit({ type: 'error', error: error as Error });
      throw error;
    }
  }

  /**
   * Run a single evaluation by actually applying a configuration
   * and measuring the resulting metrics
   */
  private async runEvaluation(
    metricStats: Map<string, MetricStats>
  ): Promise<EvaluationResult> {
    const startTime = Date.now();

    // Get suggested configuration from the algorithm
    const parameterValues = this.algorithm.suggestNextConfiguration(
      this.parameters,
      this.evaluationHistory,
      this.config
    );

    // Check if we have applicators registered for real system integration
    const hasApplicators = this.applicatorRegistry.getAll().length > 0;

    let metricValues: Record<string, number> = {};

    if (hasApplicators) {
      // REAL EVALUATION: Apply configuration to actual systems
      try {
        // Apply the suggested configuration to real systems
        await this.applicatorRegistry.applyConfiguration(parameterValues);

        // Wait for the evaluation period to collect meaningful metrics
        await this.sleep(this.config.evaluationPeriodMs);

        // Collect fresh metrics after applying the configuration
        await this.collectorRegistry.collectAll();

        // Get the new metric values
        const freshStats = await this.collectorRegistry.getAllStats(
          this.config.evaluationPeriodMs
        );

        for (const param of this.parameters) {
          const stat = freshStats.get(param.metric);
          if (stat && stat.count > 0) {
            metricValues[param.metric] = stat.mean;
          }
        }
      } catch (error) {
        // If application fails, log and fall back to baseline metrics
        this.emit({ type: 'error', error: error as Error });
        // Use historical stats as fallback
        for (const param of this.parameters) {
          const stat = metricStats.get(param.metric);
          if (stat) {
            metricValues[param.metric] = stat.mean;
          }
        }
      }
    } else {
      // SIMULATION MODE: No applicators, use historical metrics with simulated variance
      // This allows testing the tuning logic without real system integration
      for (const param of this.parameters) {
        const stat = metricStats.get(param.metric);
        if (stat && stat.count > 0) {
          // Add small variance to simulate different configurations
          // In real usage, users should register applicators for actual results
          const variance = stat.stdDev * (secureRandom() - 0.5) * 0.1;
          metricValues[param.metric] = stat.mean + variance;
        } else {
          // No data - use parameter target as baseline
          metricValues[param.metric] = param.target;
        }
      }
    }

    // Calculate overall score based on how well metrics meet targets
    const overallScore = this.algorithm.calculateScore(
      this.parameters,
      metricValues
    );

    return {
      parameterValues,
      metricValues,
      overallScore,
      timestamp: new Date(),
      durationMs: Date.now() - startTime,
    };
  }

  /**
   * Sleep utility for evaluation period
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Apply the best configuration found
   */
  private async applyBestConfiguration(
    bestEvaluation: EvaluationResult,
    metricStats: Map<string, MetricStats>
  ): Promise<Array<{ parameter: string; oldValue: number | string; newValue: number | string }>> {
    const changes: Array<{ parameter: string; oldValue: number | string; newValue: number | string }> = [];

    // Calculate current score
    const currentMetricValues: Record<string, number> = {};
    for (const param of this.parameters) {
      const stat = metricStats.get(param.metric);
      if (stat) {
        currentMetricValues[param.metric] = stat.mean;
      }
    }
    const currentScore = this.algorithm.calculateScore(this.parameters, currentMetricValues);

    // Check if improvement is significant
    const improvement = (bestEvaluation.overallScore - currentScore) / (currentScore || 1);
    if (improvement < this.config.minImprovementThreshold) {
      return changes;
    }

    // Apply changes
    for (const param of this.parameters) {
      const newValue = bestEvaluation.parameterValues[param.name];
      if (newValue !== undefined && newValue !== param.current) {
        const oldValue = param.current;

        // Update parameter
        if (param.type === 'numeric') {
          param.current = newValue as number;
        } else {
          param.current = newValue as string;
        }

        changes.push({
          parameter: param.name,
          oldValue,
          newValue,
        });

        // Record in history
        this.state.parameterHistory.push({
          timestamp: new Date(),
          parameter: param.name,
          oldValue,
          newValue,
          reason: `Auto-tuning cycle improved score by ${(improvement * 100).toFixed(1)}%`,
        });

        this.emit({
          type: 'parameter-changed',
          parameter: param.name,
          oldValue,
          newValue,
        });
      }
    }

    this.state.currentParameters = this.getCurrentParameterValues();

    return changes;
  }

  /**
   * Create a skipped cycle result
   */
  private createSkippedCycleResult(
    cycleId: string,
    startedAt: Date,
    reason: string
  ): TuningCycleResult {
    return {
      cycleId,
      startedAt,
      completedAt: new Date(),
      evaluationsPerformed: 0,
      bestConfiguration: this.getCurrentParameterValues(),
      bestScore: 0,
      suggestions: [{
        parameterName: 'system',
        currentValue: 'collecting',
        suggestedValue: 'collecting',
        expectedImprovement: 0,
        confidence: 0,
        reasoning: reason,
      }],
      appliedChanges: [],
    };
  }

  // ============================================================================
  // Parameter Management
  // ============================================================================

  /**
   * Get current parameter values
   */
  getCurrentParameterValues(): Record<string, number | string> {
    const values: Record<string, number | string> = {};
    for (const param of this.parameters) {
      values[param.name] = param.current;
    }
    return values;
  }

  /**
   * Get a specific parameter
   */
  getParameter(name: string): TunableParameter | undefined {
    return this.parameters.find(p => p.name === name);
  }

  /**
   * Update a parameter value manually
   */
  setParameter(name: string, value: number | string): boolean {
    const param = this.parameters.find(p => p.name === name);
    if (!param) return false;

    const oldValue = param.current;

    if (param.type === 'numeric') {
      const numValue = typeof value === 'number' ? value : parseFloat(value as string);
      if (numValue < param.min || numValue > param.max) return false;
      param.current = numValue;
    } else {
      if (!param.options.includes(value as string)) return false;
      param.current = value as string;
    }

    this.state.parameterHistory.push({
      timestamp: new Date(),
      parameter: name,
      oldValue,
      newValue: value,
      reason: 'Manual update',
    });

    this.state.currentParameters = this.getCurrentParameterValues();

    return true;
  }

  /**
   * Add a new tunable parameter
   */
  addParameter(param: TunableParameter): void {
    const existing = this.parameters.find(p => p.name === param.name);
    if (!existing) {
      this.parameters.push(param);
    }
  }

  /**
   * Remove a tunable parameter
   */
  removeParameter(name: string): boolean {
    const index = this.parameters.findIndex(p => p.name === name);
    if (index >= 0) {
      this.parameters.splice(index, 1);
      return true;
    }
    return false;
  }

  /**
   * Enable or disable a parameter for tuning
   */
  setParameterEnabled(name: string, enabled: boolean): boolean {
    const param = this.parameters.find(p => p.name === name);
    if (param) {
      param.enabled = enabled;
      return true;
    }
    return false;
  }

  // ============================================================================
  // State and Statistics
  // ============================================================================

  /**
   * Get current state
   */
  getState(): AutoTunerState {
    return { ...this.state };
  }

  /**
   * Get statistics
   */
  getStats(): AutoTunerStats {
    const successfulCycles = this.state.parameterHistory.length > 0
      ? this.state.totalCycles
      : 0;

    return {
      totalCycles: this.state.totalCycles,
      successfulCycles,
      failedCycles: this.state.totalCycles - successfulCycles,
      totalImprovements: this.state.totalImprovements,
      avgImprovementPerCycle: this.state.totalCycles > 0
        ? this.state.totalImprovements / this.state.totalCycles
        : 0,
      parametersTracked: this.parameters.filter(p => p.enabled).length,
      metricsCollected: this.collectorRegistry.getAll().length,
      lastCycleAt: this.state.lastTuningCycle?.completedAt,
      nextCycleAt: this.tuningTimer
        ? new Date(Date.now() + this.config.tuningIntervalMs)
        : undefined,
    };
  }

  /**
   * Get evaluation history
   */
  getEvaluationHistory(): EvaluationResult[] {
    return [...this.evaluationHistory];
  }

  /**
   * Get parameter history
   */
  getParameterHistory(): AutoTunerState['parameterHistory'] {
    return [...this.state.parameterHistory];
  }

  // ============================================================================
  // Event Handling
  // ============================================================================

  /**
   * Subscribe to events
   */
  on(handler: AutoTunerEventHandler): () => void {
    this.eventHandlers.push(handler);
    return () => {
      const index = this.eventHandlers.indexOf(handler);
      if (index >= 0) {
        this.eventHandlers.splice(index, 1);
      }
    };
  }

  /**
   * Emit an event
   */
  private emit(event: AutoTunerEvent): void {
    for (const handler of this.eventHandlers) {
      try {
        handler(event);
      } catch (error) {
        console.error('Error in auto-tuner event handler:', error);
      }
    }
  }

  // ============================================================================
  // Persistence
  // ============================================================================

  /**
   * Export state for persistence
   */
  exportState(): {
    parameters: TunableParameter[];
    evaluationHistory: EvaluationResult[];
    parameterHistory: AutoTunerState['parameterHistory'];
  } {
    return {
      parameters: this.parameters.map(p => ({ ...p })),
      evaluationHistory: [...this.evaluationHistory],
      parameterHistory: [...this.state.parameterHistory],
    };
  }

  /**
   * Import state from persistence
   */
  importState(data: {
    parameters?: TunableParameter[];
    evaluationHistory?: EvaluationResult[];
    parameterHistory?: AutoTunerState['parameterHistory'];
  }): void {
    if (data.parameters) {
      this.parameters = data.parameters.map(p => ({ ...p }));
      this.state.currentParameters = this.getCurrentParameterValues();
    }
    if (data.evaluationHistory) {
      this.evaluationHistory = [...data.evaluationHistory];
    }
    if (data.parameterHistory) {
      this.state.parameterHistory = [...data.parameterHistory];
    }
  }

  /**
   * Clear all history
   */
  clearHistory(): void {
    this.evaluationHistory = [];
    this.state.parameterHistory = [];
    this.state.totalCycles = 0;
    this.state.totalImprovements = 0;
    this.state.lastTuningCycle = undefined;
  }
}

/**
 * Create a new AQE auto-tuner
 */
export function createAutoTuner(
  parameters?: TunableParameter[],
  config?: Partial<TuningConfig>
): AQEAutoTuner {
  return new AQEAutoTuner(parameters, config);
}
