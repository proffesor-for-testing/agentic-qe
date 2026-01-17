/**
 * Agent Validation Utilities
 *
 * Extracted from BaseAgent for B1.2 decomposition.
 * Contains config validation and type guards.
 *
 * @module agents/utils/validation
 */

import { SwarmMemoryManager } from '../../core/memory/SwarmMemoryManager';
import type { MemoryStore } from '../../types';

/**
 * Check if a memory store is SwarmMemoryManager
 *
 * @remarks
 * This is a runtime check using instanceof. Use this to verify if learning
 * features are available before attempting to use them.
 *
 * Note: This is NOT a TypeScript type guard because MemoryStore and
 * SwarmMemoryManager have incompatible method signatures. After checking
 * with this function, use a type assertion: `store as SwarmMemoryManager`
 *
 * @example
 * ```typescript
 * if (isSwarmMemoryManager(config.memoryStore)) {
 *   const swarm = config.memoryStore as SwarmMemoryManager;
 *   // Use swarm's learning features
 * }
 * ```
 */
export function isSwarmMemoryManager(store: MemoryStore): boolean {
  return store instanceof SwarmMemoryManager;
}

/**
 * Configuration for learning validation
 */
export interface LearningValidationConfig {
  enableLearning?: boolean;
  memoryStore: MemoryStore;
}

/**
 * Validation result
 */
export interface ValidationResult {
  valid: boolean;
  warning?: string;
}

/**
 * Validate agent config for learning features
 *
 * @remarks
 * Call this early in agent initialization to fail fast with clear error message.
 * This helps developers identify configuration issues immediately rather than
 * discovering disabled learning features at runtime.
 *
 * Issue #137: FleetManager was passing MemoryManager instead of SwarmMemoryManager,
 * causing learning features to be silently disabled for all agents.
 *
 * @param config - Agent configuration to validate
 * @param options - Validation options
 * @param options.throwOnMismatch - If true, throws an error instead of returning warning
 * @returns Validation result with valid flag and optional warning message
 *
 * @example
 * ```typescript
 * // In agent constructor:
 * const validation = validateLearningConfig(config);
 * if (!validation.valid) {
 *   console.warn(validation.warning);
 * }
 * ```
 */
export function validateLearningConfig(
  config: LearningValidationConfig,
  options: { throwOnMismatch?: boolean } = {}
): ValidationResult {
  const enableLearning = config.enableLearning ?? true;

  if (enableLearning && !isSwarmMemoryManager(config.memoryStore)) {
    const warning =
      `Learning is enabled but memoryStore is not SwarmMemoryManager. ` +
      `Got ${config.memoryStore.constructor.name}. ` +
      `Learning features (Q-learning, patterns, metrics) will be DISABLED. ` +
      `To fix: Use SwarmMemoryManager or set enableLearning: false.`;

    if (options.throwOnMismatch) {
      throw new Error(warning);
    }

    return { valid: false, warning };
  }

  return { valid: true };
}
