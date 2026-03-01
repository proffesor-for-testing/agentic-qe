/**
 * GOAP (Goal-Oriented Action Planning) Module for Agentic QE V3
 *
 * Exports all GOAP types and utilities for A* planning.
 *
 * @module planning
 * @version 3.0.0
 */

// Type exports
export type {
  V3WorldState,
  StateConditions,
  ActionEffects,
  GOAPAction,
  GOAPGoal,
  GOAPPlan,
  ExecutionStep,
  PlanConstraints,
  GOAPGoalRecord,
  GOAPActionRecord,
  GOAPPlanRecord,
} from './types.js';

// Constant exports
export { DEFAULT_V3_WORLD_STATE } from './types.js';

// Action Library exports
export {
  QE_ACTIONS,
  QE_GOALS,
  getAllQEActions,
  getActionsByCategory,
  getActionsByDomain,
  getActionsByAgentType,
  getActionByName,
  seedQEActions,
  getActionStats,
  validateActionLibrary,
  toGOAPAction,
} from './actions/qe-action-library.js';

export type { QEActionTemplate, QEGoalTemplate } from './actions/qe-action-library.js';

// Planner exports
export {
  GOAPPlanner,
  getSharedGOAPPlanner,
  resetSharedGOAPPlanner,
} from './goap-planner.js';

// Executor exports
export {
  PlanExecutor,
  MockAgentSpawner,
  ClaudeFlowSpawner,
  createMockExecutor,
  createClaudeFlowExecutor,
} from './plan-executor.js';

export type {
  ExecutionConfig,
  ExecutionResult,
  ExecutedStep,
  AgentSpawner,
  AgentSpawnResult,
} from './plan-executor.js';
