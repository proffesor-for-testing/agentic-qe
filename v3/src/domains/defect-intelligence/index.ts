/**
 * Agentic QE v3 - Defect Intelligence Domain
 * ML-based defect prediction, root cause analysis, and pattern learning
 *
 * This module exports the public API for the defect-intelligence domain.
 */

// ============================================================================
// Domain Plugin (Primary Export)
// ============================================================================

export {
  DefectIntelligencePlugin,
  createDefectIntelligencePlugin,
  type DefectIntelligencePluginConfig,
  type DefectIntelligenceExtendedAPI,
} from './plugin';

// ============================================================================
// Coordinator
// ============================================================================

export {
  DefectIntelligenceCoordinator,
  type IDefectIntelligenceCoordinator,
  type WorkflowStatus,
  type CoordinatorConfig,
} from './coordinator';

// ============================================================================
// Services
// ============================================================================

export {
  DefectPredictorService,
  type IDefectPredictorService,
  type DefectPredictorConfig,
  type PredictionFeedback,
  type ModelMetrics,
} from './services/defect-predictor';

export {
  PatternLearnerService,
  type IPatternLearnerService,
  type PatternLearnerConfig,
  type FlashAttentionStatus,
} from './services/pattern-learner';

export {
  RootCauseAnalyzerService,
  type IRootCauseAnalyzerService,
  type RootCauseAnalyzerConfig,
} from './services/root-cause-analyzer';

// ============================================================================
// Interfaces (Types Only)
// ============================================================================

export type {
  // API interface
  DefectIntelligenceAPI,

  // Request types
  PredictRequest,
  RootCauseRequest,
  RegressionRequest,
  ClusterRequest,
  LearnRequest,

  // Response types
  PredictionResult,
  FilePrediction,
  PredictionFeature,
  RootCauseAnalysis,
  ContributingFactor,
  TimelineEvent,
  RegressionRisk,
  ImpactedArea,
  DefectClusters,
  DefectCluster,
  LearnedDefectPatterns,
  DefectPattern,
  DefectInfo,
} from './interfaces';
