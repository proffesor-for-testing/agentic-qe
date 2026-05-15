/**
 * Self-Learning Loop Health (#488 B.2)
 *
 * Records per-component liveness signals for the AQE self-learning loop:
 *
 *   captured_experiences (SQLite)
 *     → CapturedExperienceBridge.drain        (component: 'bridge')
 *       → learning:experience:* kv
 *         → LearningConsolidationWorker.tick  (component: 'learningWorker')
 *           → learning:pattern:* kv
 *             → DreamScheduler.tick           (component: 'dreamScheduler')
 *               → dream_insights / qe_patterns
 *
 * Each tick records `{ success: true }` so operators can answer "is the
 * loop closing end-to-end?" without DB-mining `dream_cycles`, `kv_store`,
 * and `routing_outcomes` separately. Cumulative counters in `aqe learning
 * stats` are not enough: they grow forever and can't distinguish "healthy
 * loop" from "loop wedged 3 hours ago with stale totals".
 *
 * Persists as a single JSON value under `learning:loop-health` in the
 * unified memory. Cheap to write (~200 bytes), cheap to read.
 */

import type { MemoryBackend } from '../kernel/interfaces.js';

export const LOOP_HEALTH_KEY = 'learning:loop-health';

export type LoopComponent = 'bridge' | 'dreamScheduler' | 'learningWorker';

export interface ComponentHealth {
  /** ISO timestamp of the most recent successful tick. Empty string when never succeeded. */
  lastSuccessAt: string;
  /** Total ticks attempted since this loop-health record was created. */
  ticksSinceBoot: number;
  /** Total successful ticks since this loop-health record was created. */
  successesSinceBoot: number;
  /** Most recent error captured during a failed tick. Cleared on next success. */
  lastError?: { message: string; at: string };
}

export interface LoopHealth {
  /** Max(lastSuccessAt across components). Empty string when nothing has succeeded yet. */
  overallLastSuccess: string;
  /** ISO timestamp when this record was first written. */
  bootedAt: string;
  /** Per-component status. Components are added on first tick — absence means never invoked. */
  components: {
    bridge?: ComponentHealth;
    dreamScheduler?: ComponentHealth;
    learningWorker?: ComponentHealth;
  };
}

/**
 * Minimal memory interface this module needs. Both `MemoryBackend` (kernel)
 * and `WorkerMemory` (worker context) satisfy this — the helper stays
 * transport-agnostic so writers can call it without knowing which they hold.
 */
export interface LoopHealthMemory {
  get<T>(key: string): Promise<T | undefined>;
  set<T>(key: string, value: T): Promise<void>;
}

/**
 * Record one tick of a component. Always best-effort: a write failure here
 * MUST NOT propagate to the calling component (the bridge / worker should
 * keep running even if the health key can't be persisted).
 */
export async function recordLoopHealth(
  memory: LoopHealthMemory | MemoryBackend,
  component: LoopComponent,
  result: { success: boolean; error?: Error | string },
): Promise<void> {
  try {
    const now = new Date().toISOString();
    const state =
      (await memory.get<LoopHealth>(LOOP_HEALTH_KEY)) ?? {
        overallLastSuccess: '',
        bootedAt: now,
        components: {},
      };

    const existing: ComponentHealth = state.components[component] ?? {
      lastSuccessAt: '',
      ticksSinceBoot: 0,
      successesSinceBoot: 0,
    };

    existing.ticksSinceBoot += 1;
    if (result.success) {
      existing.lastSuccessAt = now;
      existing.successesSinceBoot += 1;
      delete existing.lastError;
    } else if (result.error) {
      const message =
        result.error instanceof Error ? result.error.message : String(result.error);
      existing.lastError = { message, at: now };
    }

    state.components[component] = existing;

    // Recompute overallLastSuccess as max(component.lastSuccessAt). ISO 8601
    // strings sort lexicographically the same as chronologically.
    const successTimes = Object.values(state.components)
      .map((c) => c?.lastSuccessAt ?? '')
      .filter((t) => t !== '');
    state.overallLastSuccess = successTimes.length > 0 ? successTimes.sort().pop()! : '';

    await memory.set(LOOP_HEALTH_KEY, state);
  } catch {
    // Loop-health is itself best-effort observability. Never throw.
  }
}

/**
 * Read the current loop-health record. Returns undefined if no tick has
 * ever fired — operators reading via `aqe learning loop-health` should
 * interpret undefined as "the loop hasn't started yet (or workers aren't
 * running)" rather than "the loop is healthy".
 */
export async function getLoopHealth(
  memory: LoopHealthMemory | MemoryBackend,
): Promise<LoopHealth | undefined> {
  try {
    return await memory.get<LoopHealth>(LOOP_HEALTH_KEY);
  } catch {
    return undefined;
  }
}

/**
 * Compute a staleness verdict per component given a "stale after" threshold.
 * Caller chooses the threshold based on the component's expected cadence:
 *   - bridge: 5s poll → stale after ~30s
 *   - learningWorker: 30 min tick → stale after ~2h
 *   - dreamScheduler: variable → caller's call
 */
export function isComponentStale(
  health: ComponentHealth | undefined,
  staleAfterMs: number,
  now: Date = new Date(),
): boolean {
  if (!health || !health.lastSuccessAt) return true;
  return now.getTime() - new Date(health.lastSuccessAt).getTime() > staleAfterMs;
}
