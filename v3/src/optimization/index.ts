/**
 * Optimization Module
 * ADR-024: Self-Optimization Engine
 *
 * Auto-tuning system that optimizes parameters based on performance metrics.
 */

// Types
export type {
  TunableParameterBase,
  NumericTunableParameter,
  CategoricalTunableParameter,
  TunableParameter,
  MetricSample,
  MetricStats,
  MetricCollector,
  EvaluationResult,
  ParameterSuggestion,
  TuningCycleResult,
  TuningConfig,
  AutoTunerState,
  AutoTunerStats,
  ParameterApplicator,
  ParameterApplicatorRegistry,
} from './types.js';

export {
  DEFAULT_TUNABLE_PARAMETERS,
  DEFAULT_TUNING_CONFIG,
} from './types.js';

// Metric Collectors
export {
  BaseMetricCollector,
  SearchLatencyCollector,
  RoutingAccuracyCollector,
  PatternQualityCollector,
  TestMaintainabilityCollector,
  MetricCollectorRegistry,
  createDefaultCollectorRegistry,
} from './metric-collectors.js';

// Tuning Algorithm
export type { TuningAlgorithm } from './tuning-algorithm.js';
export {
  CoordinateDescentTuner,
  createTuningAlgorithm,
} from './tuning-algorithm.js';

// Auto-Tuner
export type { AutoTunerEvent, AutoTunerEventHandler } from './auto-tuner.js';
export {
  AQEAutoTuner,
  createAutoTuner,
  DefaultParameterApplicatorRegistry,
  createParameterApplicatorRegistry,
} from './auto-tuner.js';

// QE Optimization Workers
export {
  QE_OPTIMIZATION_WORKER_CONFIGS,
  PatternConsolidatorWorker,
  CoverageGapScannerWorker,
  FlakyTestDetectorWorker,
  RoutingAccuracyMonitorWorker,
  createPatternConsolidatorWorker,
  createCoverageGapScannerWorker,
  createFlakyTestDetectorWorker,
  createRoutingAccuracyMonitorWorker,
} from './qe-workers.js';

export type {
  PatternConsolidatorDeps,
  CoverageGapScannerDeps,
  FlakyTestDetectorDeps,
  RoutingAccuracyMonitorDeps,
} from './qe-workers.js';
