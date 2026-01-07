/**
 * Agentic QE v3 - Coverage Analysis Services
 * Export all service implementations
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
