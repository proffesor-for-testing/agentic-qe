/**
 * Learning Optimization - Dream Scheduler Methods
 * Extracted from coordinator.ts for CQ-004 (file size reduction)
 *
 * Contains: Dream cycle triggering, status, results
 */

import type {
  DreamScheduler,
  DreamSchedulerStatus,
  EngineResult as DreamCycleResult,
} from '../../learning/dream/index.js';

/**
 * Trigger a dream cycle manually.
 */
export async function triggerDreamCycle(
  dreamScheduler: DreamScheduler,
  durationMs?: number
): Promise<DreamCycleResult> {
  return dreamScheduler.triggerDream(durationMs);
}

/**
 * Get the current status of the DreamScheduler.
 */
export function getDreamStatus(
  dreamScheduler: DreamScheduler | null
): DreamSchedulerStatus | null {
  return dreamScheduler?.getStatus() ?? null;
}

/**
 * Check if the DreamScheduler is available and running.
 */
export function isDreamSchedulerAvailable(
  dreamScheduler: DreamScheduler | null
): boolean {
  return dreamScheduler !== null;
}

/**
 * Get the last dream cycle result from the scheduler.
 */
export function getLastDreamResult(
  dreamScheduler: DreamScheduler | null
): DreamCycleResult | null {
  return dreamScheduler?.getLastDreamResult() ?? null;
}

/**
 * Trigger a quick dream cycle for rapid insight generation.
 */
export async function triggerQuickDream(
  dreamScheduler: DreamScheduler
): Promise<DreamCycleResult> {
  return dreamScheduler.triggerQuickDream();
}

/**
 * Trigger a full dream cycle for comprehensive pattern consolidation.
 */
export async function triggerFullDream(
  dreamScheduler: DreamScheduler
): Promise<DreamCycleResult> {
  return dreamScheduler.triggerFullDream();
}
