/**
 * Quality Gates Domain Tools
 *
 * Comprehensive quality gate evaluation and deployment readiness assessment.
 *
 * This module provides domain-specific tools for:
 * - Quality gate evaluation with multi-factor decision trees
 * - Deployment risk assessment with historical analysis
 * - Quality metrics validation with anomaly detection
 * - Quality report generation with actionable insights
 *
 * @module tools/qe/quality-gates
 * @version 1.0.0
 * @author Agentic QE Team - Phase 3
 * @date 2025-11-09
 */

// Quality Gate Evaluation
export {
  evaluateQualityGate,
  type EvaluateQualityGateParams,
  type QualityGateEvaluation,
  type DeploymentContext,
  type CodeChange,
  type PreviousDeployment,
  type CriterionEvaluation,
  type RiskFactor,
  type PolicyCompliance,
  type PolicyViolation,
  type PolicyWarning,
  type EvaluationMetadata,
  type ComplexityIndicators
} from './evaluate-quality-gate.js';

// Deployment Risk Assessment
export {
  assessDeploymentRisk,
  type AssessDeploymentRiskParams,
  type DeploymentRiskAssessment,
  type DeploymentConfig,
  type HistoricalDeployment,
  type CodeChangeInfo,
  type RiskCategories,
  type CategoryRisk,
  type MitigationStrategy,
  type ReadinessIndicators,
  type PredictionAnalysis
} from './assess-deployment-risk.js';

// Quality Metrics Validation
export {
  validateQualityMetrics,
  type ValidateQualityMetricsParams,
  type QualityMetricsValidation,
  type QualityStandards,
  type CategoryValidation,
  type MetricValidation,
  type Anomaly,
  type TrendAnalysis,
  type CategoryTrend,
  type Recommendation,
  type ValidationSummary
} from './validate-quality-metrics.js';

// Quality Report Generation
export {
  generateQualityReport,
  type GenerateQualityReportParams,
  type QualityReport,
  type ReportConfiguration,
  type ReportInputMetadata,
  type ReportMetadata,
  type ExecutiveSummary,
  type MetricsSection,
  type MetricsSummary,
  type KeyMetric,
  type MetricsComparison,
  type TrendsSection,
  type CategoryTrendInfo,
  type TrendPredictions,
  type RisksSection,
  type RiskInfo,
  type RiskMatrix,
  type RecommendationsSection,
  type PriorityRecommendation,
  type ActionItem,
  type DetailedFindings,
  type TestResultsBreakdown,
  type TestSuiteInfo,
  type CoverageGap,
  type SecurityVulnerability,
  type PerformanceBottleneck,
  type CodeQualityIssue
} from './generate-quality-report.js';

// Import for internal use
import { evaluateQualityGate } from './evaluate-quality-gate.js';
import { assessDeploymentRisk } from './assess-deployment-risk.js';
import { validateQualityMetrics } from './validate-quality-metrics.js';
import { generateQualityReport } from './generate-quality-report.js';

/**
 * Quality Gates Domain API
 *
 * Provides a unified interface for all quality gate operations
 */
export const QualityGateTools = {
  // Quality Gate Evaluation
  evaluateGate: evaluateQualityGate,

  // Deployment Risk Assessment
  assessRisk: assessDeploymentRisk,

  // Metrics Validation
  validateMetrics: validateQualityMetrics,

  // Report Generation
  generateReport: generateQualityReport
} as const;

/**
 * Default export for convenience
 */
export default QualityGateTools;
