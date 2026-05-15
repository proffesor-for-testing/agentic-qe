/**
 * Routing Topology Safety Gate (ADR-095 — CRITICAL #1 follow-up)
 *
 * Resolves whether the agent dependency graph is in a "critical" topology
 * state for the purpose of dampening exploration in QEReasoningBank.routeTask.
 *
 * Why this lives in its own module:
 *
 * 1. Testability. The reasoning-bank's full init path (real embeddings,
 *    HNSW, pretrained patterns) is OOM-heavy in test environments. Putting
 *    the topology gate here lets us unit-test it against a fresh
 *    SwarmGraph singleton without spinning up the kernel + bank stack.
 *
 * 2. The empty-graph regression. `MinCutCalculator.getMinCutValue` returns
 *    0 on an empty graph; `MinCutHealthMonitor.isCritical()` is defined as
 *    `minCutValue < warningThreshold`, so an empty graph reports as
 *    critical. CLI hook routing — the only place this gate fires in
 *    practice — sees an empty graph because Queen coordinator activity
 *    is what populates it. Without the emptiness check, exploration is
 *    permanently dampened in the exact deployment case ADR-095 was meant
 *    to help.
 *
 * Treat empty/uninitialized graph as "no signal" (full ε rate). Only
 * consult `isCritical()` when the graph has actual vertices.
 */

import {
  getSharedMinCutGraph,
  getSharedMinCutMonitor,
  isSharedMinCutGraphInitialized,
  isSharedMinCutMonitorInitialized,
} from '../coordination/mincut/shared-singleton.js';

/**
 * Returns true ONLY when:
 *   1. The shared monitor + graph are both initialized
 *   2. The graph has at least one vertex (so the mincut value is real,
 *      not the degenerate 0 of an empty graph)
 *   3. The monitor's `isCritical()` returns true
 *
 * Any other state returns false (full ε rate / no dampening).
 *
 * All errors are swallowed — the gate is a best-effort signal that must
 * never block routing. Caller defaults safetyMultiplier to 1.0 when this
 * returns false.
 */
export function resolveTopologyCriticalFromSharedMincut(): boolean {
  try {
    if (!isSharedMinCutMonitorInitialized()) return false;
    if (!isSharedMinCutGraphInitialized()) return false;
    const graph = getSharedMinCutGraph();
    if (graph.isEmpty()) return false;
    return getSharedMinCutMonitor().isCritical();
  } catch {
    return false;
  }
}
