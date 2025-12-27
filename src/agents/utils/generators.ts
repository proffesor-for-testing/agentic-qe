/**
 * Agent ID and Event Generators
 *
 * Extracted from BaseAgent for B1.2 decomposition.
 * Provides consistent ID generation across all agents.
 *
 * @module agents/utils/generators
 */

import { SecureRandom } from '../../utils/SecureRandom.js';
import type { QEAgentType } from '../../types';

/**
 * Generate a unique agent ID
 * Format: {type}-{timestamp}-{random5chars}
 */
export function generateAgentId(type: QEAgentType): string {
  return `${type}-${Date.now()}-${SecureRandom.generateId(5)}`;
}

/**
 * Generate a unique event ID
 * Format: event-{timestamp}-{random5chars}
 */
export function generateEventId(): string {
  return `event-${Date.now()}-${SecureRandom.generateId(5)}`;
}

/**
 * Generate a unique message ID
 * Format: msg-{timestamp}-{random5chars}
 */
export function generateMessageId(): string {
  return `msg-${Date.now()}-${SecureRandom.generateId(5)}`;
}

/**
 * Generate a unique task ID
 * Format: task-{timestamp}-{random5chars}
 */
export function generateTaskId(): string {
  return `task-${Date.now()}-${SecureRandom.generateId(5)}`;
}
