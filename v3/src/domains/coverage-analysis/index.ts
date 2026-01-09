/**
 * Agentic QE v3 - Coverage Analysis Domain
 *
 * This domain provides O(log n) coverage analysis capabilities using HNSW
 * vector indexing for efficient gap detection across large codebases.
 *
 * Features:
 * - Coverage report analysis with threshold validation
 * - Gap detection using vector similarity search (O(log n) via HNSW)
 * - Risk scoring with multi-factor analysis
 * - Trend analysis and forecasting
 * - Test suggestions for coverage gaps
 * - Sublinear gap detection (ADR-003 implementation)
 *
 * Performance (per ADR-003):
 * | Codebase Size | Traditional O(n) | v3 O(log n) | Improvement |
 * |---------------|-----------------|-------------|-------------|
 * | 1,000 files   | 1,000 ops       | 10 ops      | 100x        |
 * | 10,000 files  | 10,000 ops      | 13 ops      | 770x        |
 * | 100,000 files | 100,000 ops     | 17 ops      | 5,900x      |
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

// ============================================================================
// ADR-003: Sublinear Algorithms for Coverage Analysis
// O(log n) coverage gap detection using HNSW vector indexing
// ============================================================================

export {
  HNSWIndex,
  type IHNSWIndex,
  type HNSWIndexConfig,
  type HNSWSearchResult,
  type HNSWInsertItem,
  type HNSWIndexStats,
  type CoverageVectorMetadata,
  createHNSWIndex,
  DEFAULT_HNSW_CONFIG,
} from './services/hnsw-index';

export {
  CoverageEmbedder,
  type ICoverageEmbedder,
  type CoverageEmbedderConfig,
  type CoverageQuery,
  type EmbeddingResult,
  createCoverageEmbedder,
  DEFAULT_EMBEDDER_CONFIG,
} from './services/coverage-embedder';

export {
  SublinearCoverageAnalyzer,
  type ISublinearCoverageAnalyzer,
  type SublinearAnalyzerConfig,
  type SublinearAnalyzerStats,
  type IndexingResult,
  type RiskZone,
  createSublinearAnalyzer,
  DEFAULT_ANALYZER_CONFIG,
} from './services/sublinear-analyzer';

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
