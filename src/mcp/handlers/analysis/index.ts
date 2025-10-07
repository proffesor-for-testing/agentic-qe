/**
 * Analysis MCP Tools - Main Export
 * Exports all 5 analysis handlers for MCP server integration
 */

export { coverageAnalyzeSublinear } from './coverageAnalyzeSublinear';
export { coverageGapsDetect } from './coverageGapsDetect';
export { performanceBenchmarkRun } from './performanceBenchmarkRun';
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

export type {
  PerformanceBenchmarkRunParams,
  PerformanceBenchmarkRunResult,
  BenchmarkMetrics
} from './performanceBenchmarkRun';

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
