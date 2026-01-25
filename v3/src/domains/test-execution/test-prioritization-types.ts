/**
 * Agentic QE v3 - Test Prioritization Types
 * @deprecated This file has been merged into interfaces.ts - import from there instead
 *
 * Re-exports for backward compatibility
 */

export type {
  // State types
  TestPrioritizationState,
  TestPrioritizationFeatures,

  // Action types
  PriorityAction,
  TestPrioritizationAction,

  // Context types
  TestPrioritizationContext,
  TestExecutionHistory,

  // Reward types
  TestPrioritizationReward,

  // Metadata types
  TestPrioritizationMetadata,
} from './interfaces';

export {
  // Utility functions
  mapToFeatures,
  featuresToArray,
  priorityToScore,
  priorityActionToPriority,
  calculatePrioritizationReward,
  createTestPrioritizationState,
} from './interfaces';
