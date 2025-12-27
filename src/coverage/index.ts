/**
 * Coverage Analysis Module
 *
 * Provides coverage collection, reporting, and critical path detection
 * for intelligent test prioritization.
 */

export { CoverageCollector } from './coverage-collector.js';
export type {
  CoverageData,
  FileCoverage,
  CoverageCollectorConfig,
} from './coverage-collector.js';

export { CoverageReporter } from './coverage-reporter.js';
export type { ReportConfig, CoverageReport } from './coverage-reporter.js';

export { CriticalPathDetector } from './CriticalPathDetector.js';
export type {
  CoverageNode,
  CoverageEdge,
  CriticalPathInput,
  CriticalPath,
  PrioritizedCoverageGap,
  CriticalPathResult,
  BottleneckNode,
  GraphMetrics,
  CriticalPathConfig,
} from './CriticalPathDetector.js';
