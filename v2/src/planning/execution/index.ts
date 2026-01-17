/**
 * GOAP Plan Execution Module
 *
 * Exports for plan execution functionality:
 * - PlanExecutor - Executes remediation plans with agent orchestration
 * - executeQualityGateRemediation - High-level function for quality gate remediation
 *
 * @module planning/execution
 * @version 1.0.0
 */

export {
  PlanExecutor,
  createPlanExecutor,
  executeQualityGateRemediation,
  type ActionExecutionResult,
  type PlanExecutionResult,
  type PlanExecutionConfig
} from './PlanExecutor';
