/**
 * Coverage Domain Tools
 * Comprehensive coverage analysis toolkit with ML-powered gap detection,
 * risk scoring, test recommendations, and trend analysis
 *
 * @module qe-tools/coverage
 */

// Core coverage analysis with risk scoring
export {
  analyzeWithRiskScoring,
  type CoverageWithRiskScore,
  type RiskScoringParams,
  type RiskScoringResult
} from './analyze-with-risk-scoring'

// ML-powered gap detection
export {
  detectGapsML,
  type GapDetectionParams,
  type MLGapDetectionResult
} from './detect-gaps-ml'

// Test recommendation engine
export {
  recommendTests,
  type TestRecommendation,
  type TestRecommendationParams,
  type TestRecommendationResult
} from './recommend-tests'

// Coverage trend analysis
export {
  calculateTrends,
  type CoverageSnapshot,
  type TrendCalculationParams,
  type CoverageTrend,
  type Regression,
  type TrendAnalysisResult
} from './calculate-trends'
