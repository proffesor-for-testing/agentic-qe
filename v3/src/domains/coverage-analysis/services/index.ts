/**
 * Agentic QE v3 - Coverage Analysis Services
 * Export all service implementations
 *
 * Includes ADR-003 Sublinear Algorithms for O(log n) coverage gap detection
 */

export {
  CoverageAnalyzerService,
  type ICoverageAnalysisService,
} from './coverage-analyzer';

export {
  GapDetectorService,
  type IGapDetectionService,
  type TestSuggestion,
} from './gap-detector';

export {
  RiskScorerService,
  type IRiskScoringService,
  type RiskTrend,
  type RiskTrendPoint,
} from './risk-scorer';

// ============================================================================
// ADR-003: Sublinear Algorithms for Coverage Analysis
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
} from './hnsw-index';

export {
  CoverageEmbedder,
  type ICoverageEmbedder,
  type CoverageEmbedderConfig,
  type CoverageQuery,
  type EmbeddingResult,
  createCoverageEmbedder,
  DEFAULT_EMBEDDER_CONFIG,
} from './coverage-embedder';

export {
  SublinearCoverageAnalyzer,
  type ISublinearCoverageAnalyzer,
  type SublinearAnalyzerConfig,
  type SublinearAnalyzerStats,
  type IndexingResult,
  type RiskZone,
  createSublinearAnalyzer,
  DEFAULT_ANALYZER_CONFIG,
} from './sublinear-analyzer';

// ============================================================================
// ADR-059: Ghost Intent Coverage Analysis
// ============================================================================

export {
  GhostCoverageAnalyzerService,
  createGhostCoverageAnalyzer,
  type GhostCoverageConfig,
  type PhantomGap as GhostPhantomGap,
  type PhantomSurface as GhostPhantomSurface,
  type GhostCoverageAnalyzerDependencies,
} from './ghost-coverage-analyzer';
