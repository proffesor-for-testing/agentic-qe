/**
 * MCP Handlers for RVF Migration (ADR-072 Phase 3)
 *
 * Exposes migration status, consistency checks, and stage promotion
 * via MCP tools for user-facing verification.
 */

import {
  RvfMigrationCoordinator,
  type MigrationStatus,
} from '../../persistence/rvf-migration-coordinator.js';
import type { ConsistencyCheckResult } from '../../persistence/rvf-consistency-validator.js';
import type { StageGateResult } from '../../persistence/rvf-stage-gate.js';
import type { MigrationStage } from '../../persistence/rvf-migration-adapter.js';

// ============================================================================
// Types
// ============================================================================

export interface MigrationStatusResult {
  success: boolean;
  data: MigrationStatus | null;
  error?: string;
}

export interface MigrationCheckResult {
  success: boolean;
  data: ConsistencyCheckResult | null;
  error?: string;
}

export interface MigrationPromoteResult {
  success: boolean;
  data: {
    promoted: boolean;
    previousStage: MigrationStage;
    newStage: MigrationStage;
    gateResult: StageGateResult;
  } | null;
  error?: string;
}

// ============================================================================
// Lazy Coordinator Init
// ============================================================================

let coordinator: RvfMigrationCoordinator | null = null;

async function getCoordinator(): Promise<RvfMigrationCoordinator> {
  if (!coordinator) {
    coordinator = RvfMigrationCoordinator.getInstance();
    await coordinator.initialize();
  }
  return coordinator;
}

/** Reset for testing */
export function resetMigrationHandlers(): void {
  coordinator = null;
  RvfMigrationCoordinator.resetInstance();
}

// ============================================================================
// Handlers
// ============================================================================

/**
 * Get comprehensive RVF migration status including stage, metrics,
 * consistency history, engine status, and gate evaluation.
 */
export async function handleMigrationStatus(): Promise<MigrationStatusResult> {
  try {
    const coord = await getCoordinator();
    return { success: true, data: coord.getStatus() };
  } catch (err) {
    return {
      success: false,
      data: null,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * Run a consistency check comparing SQLite and RVF search results.
 * Samples random patterns and reports divergences.
 */
export async function handleMigrationCheck(): Promise<MigrationCheckResult> {
  try {
    const coord = await getCoordinator();
    const result = coord.runConsistencyCheck();
    return { success: true, data: result };
  } catch (err) {
    return {
      success: false,
      data: null,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * Attempt to promote to the next migration stage.
 * Evaluates stage gate criteria and records result in witness chain.
 *
 * @param params.force - Skip gate checks (force promotion)
 */
export async function handleMigrationPromote(
  params: { force?: boolean } = {},
): Promise<MigrationPromoteResult> {
  try {
    const coord = await getCoordinator();
    const { promoted, previousStage, newStage, result } = coord.promote(
      params.force ?? false,
    );
    return {
      success: true,
      data: { promoted, previousStage, newStage, gateResult: result },
    };
  } catch (err) {
    return {
      success: false,
      data: null,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
