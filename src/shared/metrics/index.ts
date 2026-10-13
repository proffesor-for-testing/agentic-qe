/**
 * Agentic QE v3 - Metrics Module
 * Exports for code quality and system metrics analysis
 */

export { CodeMetricsAnalyzer, getCodeMetricsAnalyzer } from './code-metrics';
export type {
  FileMetrics,
  FileAnalysisOutcome,
  FileAnalysisStatus,
  FunctionMetrics,
  HalsteadMetrics,
  DuplicationResult,
  DuplicateBlock,
} from './code-metrics';

export { SystemMetricsCollector, getSystemMetricsCollector } from './system-metrics';
export type {
  SystemMetrics,
  CpuMetrics,
  MemoryMetrics,
  ProcessMetrics,
  MetricSample,
  HttpMetrics,
} from './system-metrics';
