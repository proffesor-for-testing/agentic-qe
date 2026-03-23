/**
 * Agentic QE v3 - Time Crystal Persistence
 * ADR-047: MinCut Self-Organizing QE Integration - Phase 4
 *
 * Standalone persistence functions for Time Crystal state snapshots.
 * These operate on state passed as parameters rather than accessing class internals.
 */

import { getUnifiedMemory, type UnifiedMemoryManager } from '../../kernel/unified-memory.js';
import { toErrorMessage } from '../../shared/error-utils.js';
import type {
  CrystalObservation,
  TimeCrystalPhase,
  ExecutionMetrics,
  TemporalAttractor,
} from './time-crystal-types';

/** kv_store namespace for time crystal metrics */
const KV_NAMESPACE = 'time-crystal-metrics';

/** kv_store key for the state snapshot */
const KV_KEY = 'time-crystal-snapshot';

/** TTL for persisted snapshots (24 hours) */
const KV_TTL = 86400;

/** Persist every N state changes */
export const PERSIST_INTERVAL = 20;

/**
 * Snapshot shape persisted to / loaded from kv_store
 */
export interface TimeCrystalSnapshot {
  observations: CrystalObservation[];
  phases: [string, TimeCrystalPhase][];
  metricsHistory: ExecutionMetrics[];
  currentAttractor: TemporalAttractor;
  stats: Record<string, unknown>;
  savedAt: number;
}

/**
 * Initialize kv_store persistence - returns the UnifiedMemoryManager or null on failure
 */
export async function initializeTimeCrystalDb(): Promise<UnifiedMemoryManager | null> {
  try {
    const db = getUnifiedMemory();
    if (!db.isInitialized()) await db.initialize();
    return db;
  } catch (error) {
    console.warn('[TimeCrystalController] DB init failed, using memory-only:', toErrorMessage(error));
    return null;
  }
}

/**
 * Persist current state snapshot to kv_store
 */
export async function persistTimeCrystalToKv(
  db: UnifiedMemoryManager,
  observations: CrystalObservation[],
  phases: Map<string, TimeCrystalPhase>,
  metricsHistory: ExecutionMetrics[],
  currentAttractor: TemporalAttractor,
  stats: Record<string, unknown>,
): Promise<void> {
  const snapshot: TimeCrystalSnapshot = {
    observations: observations.slice(-100),
    phases: Array.from(phases.entries()),
    metricsHistory: metricsHistory.slice(-100),
    currentAttractor,
    stats,
    savedAt: Date.now(),
  };

  await db.kvSet(KV_KEY, snapshot, KV_NAMESPACE, KV_TTL);
}

/**
 * Load state snapshot from kv_store and return restored state (or null if no snapshot)
 */
export async function loadTimeCrystalFromKv(
  db: UnifiedMemoryManager,
): Promise<TimeCrystalSnapshot | null> {
  const snapshot = await db.kvGet<TimeCrystalSnapshot>(KV_KEY, KV_NAMESPACE);

  if (!snapshot) return null;

  // Convert Date strings back to Date objects in observations
  if (snapshot.observations?.length) {
    snapshot.observations = snapshot.observations.map(obs => ({
      ...obs,
      timestamp: new Date(obs.timestamp),
      metrics: { ...obs.metrics, timestamp: new Date(obs.metrics.timestamp) },
    }));
  }

  // Convert Date strings in phases
  if (snapshot.phases?.length) {
    snapshot.phases = snapshot.phases.map(([key, phase]) => [
      key,
      {
        ...phase,
        lastActivation: phase.lastActivation ? new Date(phase.lastActivation) : undefined,
      },
    ]);
  }

  // Convert Date strings in metrics history
  if (snapshot.metricsHistory?.length) {
    snapshot.metricsHistory = snapshot.metricsHistory.map(m => ({
      ...m,
      timestamp: new Date(m.timestamp),
    }));
  }

  return snapshot;
}
