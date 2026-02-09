/**
 * Agentic QE v3 - Competing Hypotheses Module
 * ADR-064 Phase 4A: Multi-agent competing hypotheses for root cause analysis
 *
 * Provides a pattern where N agents each investigate a defect from a
 * different angle in parallel, collect weighted evidence, and the system
 * converges on the strongest hypothesis via evidence scoring.
 *
 * @example
 * ```typescript
 * import {
 *   createHypothesisManager,
 *   HypothesisManager,
 * } from './coordination/competing-hypotheses';
 *
 * const manager = createHypothesisManager({ convergenceThreshold: 0.25 });
 *
 * // Create an investigation for a flaky test
 * const inv = manager.createInvestigation('task-42', 'test-execution', 'Flaky CI failure');
 *
 * // Add competing hypotheses
 * manager.addHypothesis(inv.id, 'Race condition in DB pool', 'code-analysis', 'agent-1');
 * manager.addHypothesis(inv.id, 'Network timeout under load', 'log-analysis', 'agent-2');
 * manager.addHypothesis(inv.id, 'Known flaky pattern match', 'historical-pattern', 'agent-3');
 *
 * // Agents submit evidence, then converge
 * const result = manager.converge(inv.id);
 * console.log(`Winner: ${result.winningHypothesisId} (${result.confidence})`);
 * ```
 */

// ============================================================================
// Type Exports
// ============================================================================

export type {
  Hypothesis,
  HypothesisStatus,
  Evidence,
  EvidenceType,
  Investigation,
  InvestigationStatus,
  InvestigationStrategy,
  ConvergenceResult,
  ConvergenceMethod,
  CompetingHypothesesConfig,
} from './types.js';

// ============================================================================
// Constant Exports
// ============================================================================

export { DEFAULT_COMPETING_HYPOTHESES_CONFIG } from './types.js';

// ============================================================================
// Class & Factory Exports
// ============================================================================

export {
  HypothesisManager,
  createHypothesisManager,
} from './hypothesis-manager.js';
