/**
 * GOAP Goals Module
 *
 * Exports goal definitions for GOAP planning.
 *
 * @module planning/goals
 * @version 1.0.0
 */

export {
  TASK_WORKFLOW_GOALS,
  TaskGoalDefinition,
  getGoalForType,
  getAvailableTaskTypes,
  customizeGoalConditions,
  toGOAPGoal,
  validateGoalAchievability
} from './TaskWorkflowGoals';
