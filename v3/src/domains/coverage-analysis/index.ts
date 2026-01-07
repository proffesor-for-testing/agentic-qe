/**
 * Agentic QE v3 - Coverage Analysis Domain
 *
 * This domain provides O(log n) coverage analysis capabilities using HNSW
 * vector indexing for efficient gap detection across large codebases.
 *
 * Features:
 * - Coverage report analysis with threshold validation
 * - Gap detection using vector similarity search
 * - Risk scoring with multi-factor analysis
 * - Trend analysis and forecasting
 * - Test suggestions for coverage gaps
 *
 * @module coverage-analysis
 */

// Domain Interface and Types
export type {
  CoverageAnalysisAPI,
  AnalyzeCoverageRequest,
  CoverageData,
  FileCoverage,
  CoverageSummary,
  CoverageReport,
  CoverageDelta,
  GapDetectionRequest,
  CoverageGaps,
  CoverageGap,
  RiskCalculationRequest,
  RiskFactor,
  RiskReport,
  TrendRequest,
  CoverageTrend,
  TrendPoint,
  SimilarityRequest,
  SimilarPatterns,
} from './interfaces';

// Services
export {
  CoverageAnalyzerService,
  type ICoverageAnalysisService,
} from './services/coverage-analyzer';

export {
  GapDetectorService,
  type IGapDetectionService,
  type TestSuggestion,
} from './services/gap-detector';

export {
  RiskScorerService,
  type IRiskScoringService,
  type RiskTrend,
  type RiskTrendPoint,
} from './services/risk-scorer';

// Coordinator
export {
  CoverageAnalysisCoordinator,
  type ICoverageAnalysisCoordinator,
} from './coordinator';

// Plugin
export {
  CoverageAnalysisPlugin,
  createCoverageAnalysisPlugin,
} from './plugin';
