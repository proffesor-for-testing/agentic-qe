/**
 * GOAP Planning Module
 *
 * Goal-Oriented Action Planning for Agentic QE:
 * - Quality Gate decisions with A* search
 * - Test Strategy generation
 * - Fleet Orchestration
 * - Adaptive replanning on failure
 *
 * @module planning
 * @version 1.0.0
 */

// Core Types
export {
  WorldState,
  ConditionOperators,
  StateConditions,
  EffectOperators,
  ActionEffects,
  GOAPAction,
  GOAPGoal,
  GOAPPlan,
  PlanConstraints,
  PlanNode,
  ExecutedAction,
  ExecutionStep,
  ExecutionResult,
  GOAPGoalRecord,
  GOAPActionRecord,
  GOAPPlanRecord,
  GOAPExecutionStepRecord,
  DEFAULT_WORLD_STATE
} from './types';

// Planner
export { GOAPPlanner } from './GOAPPlanner';

// World State Builder
export {
  WorldStateBuilder,
  QualityMetricsInput,
  FleetStatusInput,
  ResourceInput,
  ContextInput,
  createWorldState
} from './WorldStateBuilder';

// Integration Modules
export {
  GOAPQualityGateIntegration,
  QualityGateMetrics,
  QualityGateContext,
  RemediationPlan,
  RemediationAction,
  AlternativePath,
  QUALITY_GATE_GOALS,
  createQualityGateIntegration,
  // Task Orchestration (Phase 3)
  GOAPTaskOrchestration,
  OrchestrationContext,
  TaskSpec,
  GOAPWorkflowStep,
  GOAPWorkflowResult,
  createGOAPTaskOrchestration
} from './integration';

// Goals Module
export {
  TASK_WORKFLOW_GOALS,
  TaskGoalDefinition,
  getGoalForType,
  getAvailableTaskTypes,
  customizeGoalConditions,
  toGOAPGoal,
  validateGoalAchievability
} from './goals';

// Execution Module
export {
  PlanExecutor,
  createPlanExecutor,
  executeQualityGateRemediation,
  type ActionExecutionResult,
  type PlanExecutionResult,
  type PlanExecutionConfig
} from './execution';

// Action Library
export {
  // All actions
  allActions,
  getAction,
  getActionsByCategory,
  getActionsForAgentType,
  getActionsWithinCost,
  getActionsWithinTime,
  getReliableActions,
  actionStats,

  // Quality Gate
  qualityGateActions,
  getQualityGateAction,
  getQualityGateActionsByCategory,
  runUnitTests,
  runIntegrationTests,
  generateMissingTests,
  runSecurityScan,
  fixCriticalVulnerabilities,
  runPerformanceBenchmark,
  analyzeCodeComplexity,
  requestGateException,
  runSmokeTests,
  evaluateQualityGate,
  finalizeQualityGate,

  // Test Strategy
  testStrategyActions,
  getTestStrategyAction,
  getQuickTestStrategyActions,
  getCoverageImprovementActions,
  analyzeChangeImpact,
  prioritizeTestsByRisk,
  selectMinimalTestSuite,
  analyzeCoverageGaps,
  generateTargetedTests,
  runCriticalPathTests,
  detectFlakyTests,
  stabilizeFlakyTests,
  generateBDDScenarios,
  optimizeParallelExecution,

  // Fleet Orchestration
  fleetActions,
  getFleetAction,
  getSpawnActions,
  getScalingActions,
  getSpawnActionForAgentType,
  spawnTestGenerator,
  spawnCoverageAnalyzer,
  spawnSecurityScanner,
  spawnPerformanceTester,
  spawnFlakyHunter,
  terminateIdleAgent,
  scaleUpParallel,
  scaleDownFleet,
  optimizeTopology,
  initHierarchicalCoordination,
  redistributeWorkload
} from './actions';

import type { GOAPPlanner as GOAPPlannerType } from './GOAPPlanner';

/**
 * Quick factory for creating a planner with default actions
 */
export async function createPlanner(dbPath?: string): Promise<GOAPPlannerType> {
  const Database = (await import('better-sqlite3')).default;
  const path = await import('path');
  const fs = await import('fs');
  const { GOAPPlanner: Planner } = await import('./GOAPPlanner');
  const { allActions: actions } = await import('./actions');

  const resolvedPath = dbPath || '.agentic-qe/memory.db';
  const dir = path.dirname(resolvedPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  const db = new Database(resolvedPath);
  const planner = new Planner(db);

  // Add all default actions
  planner.addActions(actions);

  return planner;
}

/**
 * Planning module metadata
 */
export const planningInfo = {
  version: '1.0.0',
  actionCount: 31,  // 10 QG + 10 TS + 11 Fleet
  categories: ['test', 'security', 'performance', 'process', 'fleet', 'analysis'],
  capabilities: [
    'A* goal-oriented planning',
    'Quality gate decisions',
    'Test strategy generation',
    'Fleet orchestration',
    'Adaptive replanning',
    'Plan persistence and learning'
  ]
};
