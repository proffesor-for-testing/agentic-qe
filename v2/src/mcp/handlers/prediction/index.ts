/**
 * Prediction Handlers Index
 *
 * Exports all prediction-related MCP handlers for the Agentic QE Fleet.
 *
 * @version 1.0.0
 * @author Agentic QE Team
 */

export { PredictDefectsAIHandler } from './predict-defects-ai';
export { VisualTestRegressionHandler } from './visual-test-regression';
export { FlakyTestDetectHandler } from './flaky-test-detect';
// NOTE: RegressionRiskAnalyzeHandler removed in Issue #115 - use QE_REGRESSION_ANALYZE_RISK instead
export { DeploymentReadinessCheckHandler } from './deployment-readiness-check';

export type {
  PredictDefectsAIArgs,
  DefectPredictionResult,
  CodeDefectPrediction
} from './predict-defects-ai';

export type {
  VisualTestRegressionArgs,
  VisualRegressionResult,
  VisualComparison
} from './visual-test-regression';

export type {
  FlakyTestDetectArgs,
  FlakyTestResult,
  FlakyTest
} from './flaky-test-detect';

// NOTE: RegressionRiskAnalyze types removed in Issue #115 - use QE_REGRESSION_ANALYZE_RISK instead

export type {
  DeploymentReadinessCheckArgs,
  DeploymentReadinessResult,
  DeploymentCheck
} from './deployment-readiness-check';
