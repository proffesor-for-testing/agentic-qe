/**
 * Agentic QE v3 - Quality Assessment Domain
 * Intelligent quality gate decisions and deployment recommendations
 *
 * This module exports the public API for the quality-assessment domain.
 */

// ============================================================================
// Domain Plugin (Primary Export)
// ============================================================================

export {
  QualityAssessmentPlugin,
  createQualityAssessmentPlugin,
  type QualityAssessmentPluginConfig,
  type QualityAssessmentExtendedAPI,
} from './plugin';

// ============================================================================
// Coordinator
// ============================================================================

export {
  QualityAssessmentCoordinator,
  type IQualityAssessmentCoordinator,
  type WorkflowStatus,
  type CoordinatorConfig,
} from './coordinator';

// ============================================================================
// Services
// ============================================================================

export {
  QualityGateService,
  type IQualityGateService,
  type QualityGateConfig,
} from './services/quality-gate';

export {
  QualityAnalyzerService,
  type IQualityAnalyzerService,
  type QualityAnalyzerConfig,
} from './services/quality-analyzer';

export {
  DeploymentAdvisorService,
  type IDeploymentAdvisorService,
  type DeploymentAdvisorConfig,
  type DeploymentAccuracy,
} from './services/deployment-advisor';

// ============================================================================
// Interfaces (Types Only)
// ============================================================================

export type {
  // API interface
  QualityAssessmentAPI,

  // Request types
  GateEvaluationRequest,
  QualityAnalysisRequest,
  DeploymentRequest,
  ComplexityRequest,

  // Response types
  GateResult,
  GateCheck,
  QualityReport,
  QualityMetricDetail,
  QualityTrend,
  Recommendation,
  DeploymentAdvice,
  ComplexityReport,
  FileComplexity,
  ComplexitySummary,
  ComplexityHotspot,

  // Supporting types
  QualityMetrics,
  GateThresholds,
} from './interfaces';
