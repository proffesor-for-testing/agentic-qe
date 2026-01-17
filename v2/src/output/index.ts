/**
 * Output Module - AI-Friendly Structured Output
 *
 * Exports all output-related types and utilities for structured AI output.
 *
 * @module output
 * @version 1.0.0
 */

export * from './OutputFormatter';
export * from './OutputFormatterImpl';
export * from './AIActionSuggester';

export {
  // Enums
  OutputMode,

  // Types
  OutputType,
  ExecutionStatus,
  ActionPriority,
  StreamType,

  // Base Schemas
  BaseAIOutput,
  ExecutionMetadata,

  // Action Suggestions
  ActionSuggestion,
  ActionAutomation,
  ActionImpact,

  // Warnings & Errors
  OutputWarning,
  OutputError,

  // Test Results
  TestResultsOutput,
  TestResultsData,
  TestSummary,
  TestSuite,
  TestFailure,
  FlakyTest,

  // Coverage Reports
  CoverageReportOutput,
  CoverageReportData,
  CoverageSummary,
  CoverageMetric,
  CoverageTrend,
  CoverageGap,
  FileCoverage,

  // Agent Status
  AgentStatusOutput,
  AgentStatusData,
  AgentInfo,
  AgentStats,
  LearningInfo,
  DependenciesStatus,
  Dependency,
  AgentConfiguration,

  // Quality Metrics
  QualityMetricsOutput,
  QualityMetricsData,
  QualityDimensions,
  QualityDimension,
  QualityGates,
  QualityGate,
  CodeSmells,
  CriticalSmell,
  TechnicalDebt,

  // Streaming
  StreamStart,
  StreamProgress,
  StreamComplete,
  StreamError,

  // Interfaces
  OutputFormatter,

  // Utilities
  OutputModeDetector,

  // Constants
  SCHEMA_VERSION,
  ActionTypes,
  PriorityWeights
} from './OutputFormatter';

// Export implementation instances
export { OutputFormatterImpl, outputFormatter } from './OutputFormatterImpl';
export { AIActionSuggester, actionSuggester } from './AIActionSuggester';

// Export CLI helpers
export {
  CLIOutputHelper,
  cliOutputHelper,
  StreamingOutputHelper,
  EnvironmentDetector,
  OutputOptions,
  outputTestResults,
  outputCoverageReport,
  outputAgentStatus,
  outputQualityMetrics,
  isAIMode,
  isHumanMode,
  createStreamingOutput
} from './CLIOutputHelper';
