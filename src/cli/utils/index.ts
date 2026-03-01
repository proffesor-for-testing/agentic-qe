/**
 * CLI Utilities Index
 *
 * Re-exports all CLI utility functions and classes.
 */

export {
  FleetProgressManager,
  SimpleProgress,
  SpinnerManager,
  EtaEstimator,
  withSpinner,
  withProgress,
  trackParallelOperations,
  createTimedSpinner,
  type AgentProgress,
  type FleetProgressOptions,
  type SpinnerOptions,
  type EtaEstimate,
} from './progress';

export {
  // Streamers
  TestResultStreamer,
  CoverageStreamer,
  AgentActivityStreamer,
  UnifiedStreamer,
  // Factory functions
  createTestStreamHandler,
  createCoverageStreamHandler,
  createUnifiedStreamHandler,
  // Types
  type TestStatus,
  type TestCaseResult,
  type TestSuiteResult,
  type TestSummary,
  type FileCoverage,
  type CoverageSummary,
  type CoverageGap,
  type AgentActivity,
  type StreamingOptions,
  type StreamEventType,
  type StreamEvent,
} from './streaming';
