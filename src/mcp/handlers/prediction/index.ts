/**
 * Prediction Handlers Index
 *
 * Exports all prediction-related MCP handlers for the Agentic QE Fleet.
 *
 * @version 1.0.0
 * @author Agentic QE Team
 */

export { PredictDefectsAIHandler } from './predict-defects-ai.js';
export { VisualTestRegressionHandler } from './visual-test-regression.js';
export { FlakyTestDetectHandler } from './flaky-test-detect.js';
export { RegressionRiskAnalyzeHandler } from './regression-risk-analyze.js';
export { DeploymentReadinessCheckHandler } from './deployment-readiness-check.js';

export type {
  PredictDefectsAIArgs,
  DefectPredictionResult,
  CodeDefectPrediction
} from './predict-defects-ai.js';

export type {
  VisualTestRegressionArgs,
  VisualRegressionResult,
  VisualComparison
} from './visual-test-regression.js';

export type {
  FlakyTestDetectArgs,
  FlakyTestResult,
  FlakyTest
} from './flaky-test-detect.js';

export type {
  RegressionRiskAnalyzeArgs,
  RegressionRiskResult,
  FileRiskAnalysis
} from './regression-risk-analyze.js';

export type {
  DeploymentReadinessCheckArgs,
  DeploymentReadinessResult,
  DeploymentCheck
} from './deployment-readiness-check.js';
