/**
 * Agentic QE v3 - Load Testing Framework
 * Barrel export for load testing utilities
 *
 * Issue #177 Targets:
 * - 100+ agents coordinated simultaneously
 * - Memory usage < 4GB at scale
 * - No agent starvation or deadlocks
 * - Coordination latency < 100ms p95
 */

// ============================================================================
// Agent Load Tester
// ============================================================================

export {
  AgentLoadTester,
  createAgentLoadTester,
  createLoadTesterForTarget,
  DEFAULT_LOAD_TEST_CONFIG,
  DEFAULT_SUCCESS_CRITERIA,
  WORKLOAD_PROFILES,
  SCENARIO_RAMP_UP_100,
  SCENARIO_BURST_100,
  SCENARIO_CHURN_100,
  SCENARIO_STRESS_150,
} from './agent-load-tester.js';

export type {
  WorkloadProfile,
  AgentWorkload,
  LoadTestConfig,
  LoadTestResult,
  LoadTestStep,
  LoadTestScenario,
  SuccessCriteria,
} from './agent-load-tester.js';

// ============================================================================
// Metrics Collector
// ============================================================================

export {
  MetricsCollector,
  createMetricsCollector,
} from './metrics-collector.js';

export type {
  AgentLifecycleEvent,
  TaskEvent,
  CoordinationEvent,
  MemorySnapshot,
  LatencyPercentiles,
  ThroughputMetrics,
  ResourceMetrics,
  LoadTestReport,
  MetricsCollectorConfig,
} from './metrics-collector.js';

// ============================================================================
// Bottleneck Analyzer
// ============================================================================

export {
  BottleneckAnalyzer,
  createBottleneckAnalyzer,
  createBottleneckAnalyzerWithThresholds,
  DEFAULT_THRESHOLDS,
  DEFAULT_CONFIG as DEFAULT_ANALYZER_CONFIG,
} from './bottleneck-analyzer.js';

export type {
  BottleneckSeverity,
  BottleneckResult,
  BottleneckReport,
  BottleneckThresholds,
  BottleneckAnalyzerConfig,
} from './bottleneck-analyzer.js';
