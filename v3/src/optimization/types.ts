/**
 * Optimization Module Types
 * ADR-024: Self-Optimization Engine
 *
 * Types for auto-tuning system parameters based on performance metrics.
 */

// ============================================================================
// Tunable Parameter Types
// ============================================================================

/**
 * Base interface for tunable parameters
 */
export interface TunableParameterBase {
  /** Unique parameter name (dot notation: 'hnsw.efSearch') */
  name: string;
  /** Human-readable description */
  description: string;
  /** Metric used to evaluate parameter effectiveness */
  metric: string;
  /** Target value for the metric */
  target: number;
  /** Whether higher metric values are better */
  higherIsBetter: boolean;
  /** Weight for multi-objective optimization (0-1) */
  weight: number;
  /** Whether the parameter is currently being tuned */
  enabled: boolean;
}

/**
 * Numeric tunable parameter
 */
export interface NumericTunableParameter extends TunableParameterBase {
  type: 'numeric';
  current: number;
  min: number;
  max: number;
  step?: number;
}

/**
 * Categorical tunable parameter
 */
export interface CategoricalTunableParameter extends TunableParameterBase {
  type: 'categorical';
  current: string;
  options: string[];
}

/**
 * Union type for all tunable parameters
 */
export type TunableParameter = NumericTunableParameter | CategoricalTunableParameter;

// ============================================================================
// Metric Collection Types
// ============================================================================

/**
 * A collected metric sample
 */
export interface MetricSample {
  name: string;
  value: number;
  timestamp: Date;
  tags?: Record<string, string>;
}

/**
 * Aggregated metric statistics
 */
export interface MetricStats {
  name: string;
  count: number;
  min: number;
  max: number;
  mean: number;
  median: number;
  stdDev: number;
  p95: number;
  p99: number;
  trend: 'improving' | 'stable' | 'degrading';
  periodStart: Date;
  periodEnd: Date;
}

/**
 * Metric collector interface
 */
export interface MetricCollector {
  /** Unique collector ID */
  id: string;
  /** Metric name this collector handles */
  metricName: string;
  /** Collect current metric value */
  collect(): Promise<MetricSample>;
  /** Get aggregated stats for a time period */
  getStats(periodMs: number): Promise<MetricStats>;
}

// ============================================================================
// Tuning Algorithm Types
// ============================================================================

/**
 * Result of evaluating a parameter configuration
 */
export interface EvaluationResult {
  /** Parameter values used */
  parameterValues: Record<string, number | string>;
  /** Metric values achieved */
  metricValues: Record<string, number>;
  /** Overall score (weighted combination) */
  overallScore: number;
  /** When this evaluation was performed */
  timestamp: Date;
  /** Duration of evaluation */
  durationMs: number;
}

/**
 * Suggested parameter adjustment
 */
export interface ParameterSuggestion {
  parameterName: string;
  currentValue: number | string;
  suggestedValue: number | string;
  expectedImprovement: number;
  confidence: number;
  reasoning: string;
}

/**
 * Tuning cycle result
 */
export interface TuningCycleResult {
  cycleId: string;
  startedAt: Date;
  completedAt: Date;
  evaluationsPerformed: number;
  bestConfiguration: Record<string, number | string>;
  bestScore: number;
  suggestions: ParameterSuggestion[];
  appliedChanges: Array<{
    parameter: string;
    oldValue: number | string;
    newValue: number | string;
  }>;
}

/**
 * Tuning algorithm configuration
 */
export interface TuningConfig {
  /** Minimum samples before tuning */
  minSamplesBeforeTuning: number;
  /** How often to run tuning cycles (ms) */
  tuningIntervalMs: number;
  /** Maximum parameter change per cycle (as fraction) */
  maxChangePerCycle: number;
  /** Exploration vs exploitation balance (0-1) */
  explorationRate: number;
  /** Number of evaluations per tuning cycle */
  evaluationsPerCycle: number;
  /** Minimum improvement required to apply change */
  minImprovementThreshold: number;
  /** Enable automatic parameter updates */
  autoApply: boolean;
}

// ============================================================================
// Parameter Applicator Interface
// ============================================================================

/**
 * Interface for applying parameter changes to actual systems
 * This bridges the gap between tuning suggestions and real system configuration
 */
export interface ParameterApplicator {
  /** Parameter name this applicator handles */
  parameterName: string;
  /** Get the current value from the real system */
  getCurrentValue(): Promise<number | string>;
  /** Apply a new value to the real system */
  setValue(value: number | string): Promise<void>;
  /** Validate a value before applying (optional) */
  validate?(value: number | string): boolean;
}

/**
 * Registry of parameter applicators
 */
export interface ParameterApplicatorRegistry {
  register(applicator: ParameterApplicator): void;
  get(parameterName: string): ParameterApplicator | undefined;
  getAll(): ParameterApplicator[];
  applyConfiguration(config: Record<string, number | string>): Promise<void>;
}

// ============================================================================
// Auto-Tuner Types
// ============================================================================

/**
 * Auto-tuner state
 */
export interface AutoTunerState {
  status: 'idle' | 'collecting' | 'tuning' | 'applying' | 'error';
  lastTuningCycle?: TuningCycleResult;
  totalCycles: number;
  totalImprovements: number;
  currentParameters: Record<string, number | string>;
  parameterHistory: Array<{
    timestamp: Date;
    parameter: string;
    oldValue: number | string;
    newValue: number | string;
    reason: string;
  }>;
}

/**
 * Auto-tuner statistics
 */
export interface AutoTunerStats {
  totalCycles: number;
  successfulCycles: number;
  failedCycles: number;
  totalImprovements: number;
  avgImprovementPerCycle: number;
  parametersTracked: number;
  metricsCollected: number;
  lastCycleAt?: Date;
  nextCycleAt?: Date;
}

// ============================================================================
// Default Configurations
// ============================================================================

/**
 * Default tunable parameters for AQE
 */
export const DEFAULT_TUNABLE_PARAMETERS: TunableParameter[] = [
  {
    type: 'numeric',
    name: 'hnsw.efSearch',
    description: 'HNSW search quality vs speed tradeoff',
    current: 100,
    min: 50,
    max: 500,
    step: 25,
    metric: 'search_latency_ms',
    target: 1,
    higherIsBetter: false,
    weight: 0.3,
    enabled: true,
  },
  {
    type: 'numeric',
    name: 'routing.confidenceThreshold',
    description: 'Minimum confidence for routing decisions',
    current: 0.7,
    min: 0.5,
    max: 0.95,
    step: 0.05,
    metric: 'routing_accuracy',
    target: 0.9,
    higherIsBetter: true,
    weight: 0.25,
    enabled: true,
  },
  {
    type: 'numeric',
    name: 'pattern.promotionThreshold',
    description: 'Success count required for pattern promotion',
    current: 3,
    min: 2,
    max: 10,
    step: 1,
    metric: 'pattern_quality_score',
    target: 0.8,
    higherIsBetter: true,
    weight: 0.2,
    enabled: true,
  },
  {
    type: 'categorical',
    name: 'testGen.complexityLimit',
    description: 'Maximum test complexity to generate',
    current: 'complex',
    options: ['simple', 'medium', 'complex'],
    metric: 'test_maintainability',
    target: 0.7,
    higherIsBetter: true,
    weight: 0.25,
    enabled: true,
  },
];

/**
 * Default tuning configuration
 */
export const DEFAULT_TUNING_CONFIG: TuningConfig = {
  minSamplesBeforeTuning: 50,
  tuningIntervalMs: 7 * 24 * 60 * 60 * 1000, // Weekly
  maxChangePerCycle: 0.2, // 20% max change
  explorationRate: 0.3,
  evaluationsPerCycle: 10,
  minImprovementThreshold: 0.01, // 1% improvement required
  autoApply: false, // Manual approval by default
};
