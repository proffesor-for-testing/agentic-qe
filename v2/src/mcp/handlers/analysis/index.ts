/**
 * Analysis MCP Tools - Main Export
 * Exports all 5 analysis handlers for MCP server integration
 */

export { coverageAnalyzeSublinear } from './coverageAnalyzeSublinear';
export { coverageGapsDetect } from './coverageGapsDetect';
// NOTE: performanceBenchmarkRun removed in Issue #115 - use PERFORMANCE_RUN_BENCHMARK instead
export { performanceMonitorRealtime } from './performanceMonitorRealtime';
export { securityScanComprehensive } from './securityScanComprehensive';

export type {
  CoverageAnalyzeSublinearParams,
  CoverageAnalyzeSublinearResult
} from './coverageAnalyzeSublinear';

export type {
  CoverageGapsDetectParams,
  CoverageGapsDetectResult,
  CoverageGap
} from './coverageGapsDetect';

// NOTE: PerformanceBenchmarkRun types removed in Issue #115 - use PERFORMANCE_RUN_BENCHMARK instead

export type {
  PerformanceMonitorRealtimeParams,
  PerformanceMonitorRealtimeResult,
  RealtimeMetrics,
  Alert
} from './performanceMonitorRealtime';

export type {
  SecurityScanComprehensiveParams,
  SecurityScanComprehensiveResult,
  SecurityVulnerability,
  ComplianceCheck
} from './securityScanComprehensive';
