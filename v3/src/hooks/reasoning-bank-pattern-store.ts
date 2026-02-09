/**
 * ReasoningBank Pattern Store Adapter
 * ADR-064 Phase 3: Learning & Observability
 *
 * Bridges the TaskCompletedHook's PatternStore interface to the
 * QEReasoningBank, enabling automatic pattern training from completed tasks.
 *
 * @module reasoning-bank-pattern-store
 */

import type { PatternStore, ExtractedPattern } from './task-completed-hook.js';
import type { IQEReasoningBank, LearningOutcome } from '../learning/qe-reasoning-bank.js';
import type { CreateQEPatternOptions } from '../learning/qe-patterns.js';
import type { QEPatternType, QEDomain } from '../learning/qe-patterns.js';
import { detectQEDomain } from '../learning/qe-patterns.js';

// ============================================================================
// Type Mapping
// ============================================================================

/**
 * Maps ExtractedPattern.type strings to the closest QEPatternType.
 * Falls back to 'test-template' for unrecognized types.
 */
const PATTERN_TYPE_MAP: Record<string, QEPatternType> = {
  'test-template': 'test-template',
  'assertion-pattern': 'assertion-pattern',
  'mock-pattern': 'mock-pattern',
  'coverage-strategy': 'coverage-strategy',
  'mutation-strategy': 'mutation-strategy',
  'security-pattern': 'error-handling',
  'vulnerability-fix': 'error-handling',
  'quality-rule': 'test-template',
  'threshold-pattern': 'test-template',
  'defect-pattern': 'error-handling',
  'root-cause': 'error-handling',
  'api-contract': 'api-contract',
  'schema-pattern': 'api-contract',
  'flaky-fix': 'flaky-fix',
  'retry-strategy': 'flaky-fix',
  'visual-baseline': 'visual-baseline',
  'a11y-check': 'a11y-check',
  'perf-benchmark': 'perf-benchmark',
  'resilience-pattern': 'perf-benchmark',
  'generic': 'test-template',
};

/**
 * Map a raw pattern type string to a QEPatternType enum value.
 */
function mapPatternType(type: string): QEPatternType {
  return PATTERN_TYPE_MAP[type] ?? 'test-template';
}

/**
 * Detect the QE domain from an ExtractedPattern's domain string.
 * Falls back to domain detection from content, then 'test-generation'.
 */
function resolveQEDomain(pattern: ExtractedPattern): QEDomain {
  // Try direct domain match first
  const direct = detectQEDomain(pattern.domain);
  if (direct) return direct;

  // Try detection from content
  const fromContent = detectQEDomain(pattern.content);
  if (fromContent) return fromContent;

  return 'test-generation';
}

/**
 * Generate a deterministic short hash from a string.
 */
function shortHash(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  return Math.abs(hash).toString(36).slice(0, 8);
}

// ============================================================================
// ReasoningBankPatternStore
// ============================================================================

/**
 * Adapter that implements the TaskCompletedHook's PatternStore interface
 * by delegating to a QEReasoningBank instance.
 *
 * This bridges the gap between the hook's pattern extraction and the
 * ReasoningBank's learning pipeline, enabling automatic pattern training
 * from completed tasks.
 *
 * @example
 * ```typescript
 * const bank = createQEReasoningBank(memory);
 * await bank.initialize();
 *
 * const adapter = new ReasoningBankPatternStore(bank);
 * const hook = createTaskCompletedHook({}, adapter);
 *
 * // Now completed tasks automatically train the ReasoningBank
 * await hook.onTaskCompleted(taskResult);
 * ```
 */
export class ReasoningBankPatternStore implements PatternStore {
  constructor(private readonly reasoningBank: IQEReasoningBank) {}

  /**
   * Store a pattern by converting ExtractedPattern to CreateQEPatternOptions
   * and delegating to the ReasoningBank.
   *
   * @param pattern - The extracted pattern from a completed task
   * @returns The stored pattern's ID
   */
  async store(pattern: ExtractedPattern): Promise<string> {
    const qeDomain = resolveQEDomain(pattern);
    const patternType = mapPatternType(pattern.type);
    const contentHash = shortHash(pattern.content);
    const name = `${qeDomain}-${pattern.type}-${contentHash}`;

    const tags = [
      qeDomain,
      pattern.type,
      ...(pattern.metadata.sourceTaskId ? [`task:${pattern.metadata.sourceTaskId}`] : []),
    ];

    const options: CreateQEPatternOptions = {
      patternType,
      name,
      description: `Auto-extracted ${pattern.type} pattern from ${pattern.domain} domain`,
      template: {
        type: 'prompt',
        content: pattern.content,
        variables: [],
      },
      context: {
        tags,
      },
      confidence: pattern.confidence,
    };

    try {
      const result = await this.reasoningBank.storePattern(options);
      if (result.success) {
        return result.value.id;
      }
      console.error(
        `[ReasoningBankPatternStore] Failed to store pattern: ${result.error.message}`
      );
      throw result.error;
    } catch (error) {
      console.error(
        `[ReasoningBankPatternStore] Store error: ${error instanceof Error ? error.message : String(error)}`
      );
      throw error;
    }
  }

  /**
   * Record whether a stored pattern led to a successful outcome.
   * Delegates to QEReasoningBank.recordOutcome which automatically
   * triggers promotion checks.
   *
   * @param patternId - The pattern ID returned from store()
   * @param success - Whether the pattern usage was successful
   */
  async recordOutcome(patternId: string, success: boolean): Promise<void> {
    const outcome: LearningOutcome = {
      patternId,
      success,
    };

    try {
      const result = await this.reasoningBank.recordOutcome(outcome);
      if (!result.success) {
        console.error(
          `[ReasoningBankPatternStore] Failed to record outcome: ${result.error.message}`
        );
      }
    } catch (error) {
      console.error(
        `[ReasoningBankPatternStore] recordOutcome error: ${error instanceof Error ? error.message : String(error)}`
      );
      // Fire-and-forget: don't throw
    }
  }
}

/**
 * Factory function for creating a ReasoningBankPatternStore.
 *
 * @param reasoningBank - The QEReasoningBank instance to delegate to
 * @returns A new ReasoningBankPatternStore
 */
export function createReasoningBankPatternStore(
  reasoningBank: IQEReasoningBank
): ReasoningBankPatternStore {
  return new ReasoningBankPatternStore(reasoningBank);
}
