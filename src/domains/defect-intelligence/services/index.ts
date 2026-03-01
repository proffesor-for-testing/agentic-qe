/**
 * Agentic QE v3 - Defect Intelligence Services
 * Service layer exports for the defect-intelligence domain
 */

export {
  DefectPredictorService,
  type IDefectPredictorService,
  type DefectPredictorConfig,
  type PredictionFeedback,
  type ModelMetrics,
} from './defect-predictor';

export {
  PatternLearnerService,
  type IPatternLearnerService,
  type PatternLearnerConfig,
} from './pattern-learner';

export {
  RootCauseAnalyzerService,
  type IRootCauseAnalyzerService,
  type RootCauseAnalyzerConfig,
} from './root-cause-analyzer';

// ADR-035: Causal Discovery for Root Cause Analysis
export {
  CausalRootCauseAnalyzerService,
  type ICausalRootCauseAnalyzerService,
  type CausalRootCauseAnalyzerConfig,
  type CausalAnalysisRequest,
  type CausalAnalysisResponse,
  DEFAULT_CAUSAL_ANALYZER_CONFIG,
  createCausalRootCauseAnalyzer,
  createTestEvent,
  testResultToEvents,
} from './causal-root-cause-analyzer';
