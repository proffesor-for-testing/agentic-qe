/**
 * Agent Utilities - Unified Exports
 *
 * Extracted utilities from BaseAgent for B1.2 decomposition.
 *
 * @module agents/utils
 */

export {
  isSwarmMemoryManager,
  validateLearningConfig,
  type LearningValidationConfig,
  type ValidationResult,
} from './validation';

export {
  generateAgentId,
  generateEventId,
  generateMessageId,
  generateTaskId,
} from './generators';
