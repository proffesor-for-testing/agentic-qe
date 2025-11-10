/**
 * Flaky Detection Domain Tools
 *
 * Phase 3: Domain-Specific Tool Refactoring
 *
 * This module exports all flaky detection tools:
 * 1. detect-statistical.ts - Statistical detection with ML
 * 2. analyze-patterns.ts - Pattern analysis and classification
 * 3. stabilize-auto.ts - Auto-stabilization with fix generation
 *
 * @version 1.0.0
 * @author Agentic QE Team - Phase 3
 * @date 2025-11-08
 */

// Statistical Detection
export {
  detectFlakyTestsStatistical,
  calculatePassRate,
  calculateVariance,
  calculateConfidence,
  countStatusTransitions,
  calculateMetrics,
  identifyFailurePattern,
  analyzeRootCause,
  calculateSeverity,
  type StatisticalDetectionResult,
  type FlakyTestInfo,
  type DetectionSummary,
  type MLMetrics,
  type RootCauseAnalysis,
  type FixRecommendation
} from './detect-statistical'

// Pattern Analysis
export {
  analyzeFlakyTestPatterns,
  detectTimingPattern,
  detectEnvironmentPattern,
  detectRaceConditionPattern,
  detectDependencyPattern,
  detectResourceContentionPattern,
  type PatternAnalysisParams,
  type PatternType,
  type PatternAnalysisResult,
  type FlakyPattern,
  type PatternRootCause,
  type PatternStatistics,
  type PatternCorrelation,
  type PatternTrend,
  type TrendDataPoint
} from './analyze-patterns'

// Auto-Stabilization
export {
  stabilizeFlakyTestAuto,
  generateRetryPatch,
  generateWaitPatch,
  generateIsolationPatch,
  generateMockPatch,
  generateRefactorPatch,
  type StabilizationParams,
  type StabilizationStrategy,
  type ValidationConfig,
  type StabilizationResult,
  type CodePatch,
  type ValidationResult,
  type BeforeAfterComparison
} from './stabilize-auto'

// Import statements for internal use
import { detectFlakyTestsStatistical } from './detect-statistical'
import { analyzeFlakyTestPatterns } from './analyze-patterns'
import { stabilizeFlakyTestAuto } from './stabilize-auto'

/**
 * Flaky Detection Domain API
 *
 * Provides a unified interface for all flaky detection operations
 */
export const FlakyDetectionTools = {
  // Statistical Detection
  detectStatistical: detectFlakyTestsStatistical,

  // Pattern Analysis
  analyzePatterns: analyzeFlakyTestPatterns,

  // Auto-Stabilization
  stabilize: stabilizeFlakyTestAuto
} as const;

/**
 * Default export for convenience
 */
export default FlakyDetectionTools;
