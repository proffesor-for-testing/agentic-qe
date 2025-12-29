/**
 * GOAP Integration Modules
 *
 * Bridges GOAP planning with various AQE subsystems:
 * - Quality Gate evaluation (Phase 2)
 * - Task orchestration (Phase 3)
 * - Fleet management (Phase 3)
 *
 * @module planning/integration
 * @version 1.1.0
 */

export {
  GOAPQualityGateIntegration,
  QualityGateMetrics,
  QualityGateContext,
  RemediationPlan,
  RemediationAction,
  AlternativePath,
  QUALITY_GATE_GOALS,
  createQualityGateIntegration
} from './GOAPQualityGateIntegration';

// Task Orchestration Integration (Phase 3)
export {
  GOAPTaskOrchestration,
  OrchestrationContext,
  TaskSpec,
  GOAPWorkflowStep,
  GOAPWorkflowResult,
  createGOAPTaskOrchestration
} from './GOAPTaskOrchestration';
