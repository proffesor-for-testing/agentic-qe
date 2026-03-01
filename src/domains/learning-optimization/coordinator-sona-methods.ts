/**
 * Learning Optimization - QESONA Pattern Learning Methods
 * Extracted from coordinator.ts for CQ-004 (file size reduction)
 *
 * Contains: SONA pattern CRUD, adaptation, performance verification, export/import
 */

import type {
  DomainName,
} from '../../shared/types/index.js';
import type { RLState, RLAction } from '../../integrations/rl-suite/interfaces.js';
import type {
  QESONAPattern,
  QEPatternType,
  QESONAStats,
  QESONAAdaptationResult,
} from '../../integrations/ruvector/wrappers.js';
import type { PersistentSONAEngine } from '../../integrations/ruvector/sona-persistence.js';

/**
 * Learn a pattern using QESONA neural architecture.
 */
export function learnPattern(
  sona: PersistentSONAEngine,
  state: RLState,
  action: RLAction,
  outcome: QESONAPattern['outcome'],
  patternType: QEPatternType,
  domain: DomainName,
  metadata?: Record<string, unknown>
): QESONAPattern {
  return sona.createPattern(state, action, outcome, patternType, domain, metadata);
}

/**
 * Adapt a pattern based on current context using QESONA.
 */
export async function adaptPattern(
  sona: PersistentSONAEngine,
  state: RLState,
  patternType: QEPatternType,
  domain: DomainName
): Promise<QESONAAdaptationResult> {
  return sona.adaptPattern(state, patternType, domain);
}

/**
 * Get QESONA statistics.
 */
export function getSONAStats(sona: PersistentSONAEngine): QESONAStats {
  return sona.getStats();
}

/**
 * Get all QESONA patterns.
 */
export function getSONAPatterns(sona: PersistentSONAEngine): QESONAPattern[] {
  return sona.getAllPatterns();
}

/**
 * Get QESONA patterns by type.
 */
export function getSONAPatternsByType(sona: PersistentSONAEngine, type: QEPatternType): QESONAPattern[] {
  return sona.getPatternsByType(type);
}

/**
 * Get QESONA patterns by domain.
 */
export function getSONAPatternsByDomain(sona: PersistentSONAEngine, domain: DomainName): QESONAPattern[] {
  return sona.getPatternsByDomain(domain);
}

/**
 * Update QESONA pattern with feedback.
 */
export function updateSONAPattern(sona: PersistentSONAEngine, patternId: string, success: boolean, quality: number): boolean {
  return sona.updatePattern(patternId, success, quality);
}

/**
 * Force QESONA learning cycle.
 */
export function forceSONALearning(sona: PersistentSONAEngine): string {
  return sona.forceLearn();
}

/**
 * Export all QESONA patterns.
 */
export function exportSONAPatterns(sona: PersistentSONAEngine): QESONAPattern[] {
  return sona.exportPatterns();
}

/**
 * Import QESONA patterns.
 */
export function importSONAPatterns(sona: PersistentSONAEngine, patterns: QESONAPattern[]): void {
  sona.importPatterns(patterns);
}

/**
 * Verify QESONA performance meets <0.05ms adaptation target.
 */
export async function verifySONAPerformance(
  sona: PersistentSONAEngine,
  iterations: number = 100
): Promise<{
  targetMet: boolean;
  avgTimeMs: number;
  minTimeMs: number;
  maxTimeMs: number;
  details: Array<{ iteration: number; timeMs: number }>;
}> {
  return sona.verifyPerformance(iterations);
}
