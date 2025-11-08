/**
 * Performance Domain Tools
 *
 * Comprehensive performance testing and analysis tools for QE workflows.
 *
 * @module tools/qe/performance
 * @version 1.0.0
 */

// Bottleneck analysis
export {
  analyzePerformanceBottlenecks,
  type BottleneckAnalysisParams,
  type BottleneckThresholds,
  type BottleneckAnalysis,
  type Bottleneck,
  type ResourceUtilizationSummary,
  type OptimizationRecommendation,
  type TrendAnalysis
} from './analyze-bottlenecks.js';

// Report generation
export {
  generatePerformanceReport,
  type PerformanceReportParams,
  type BenchmarkData,
  type ReportMetadata,
  type PerformanceReport,
  type ReportSummary
} from './generate-report.js';

// Benchmark execution
export {
  runPerformanceBenchmark,
  type BenchmarkResult
} from './run-benchmark.js';

// Real-time monitoring
export {
  monitorPerformanceRealtime,
  type RealtimeMonitoringResult,
  type DataPoint,
  type MonitoringSummary,
  type Alert
} from './monitor-realtime.js';
