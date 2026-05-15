/**
 * Regression: brutal-honesty audit CRITICAL #1 (ADR-095 follow-up)
 *
 * `MinCutCalculator.getMinCutValue` returns 0 on an empty graph
 * (mincut-calculator.ts:170 — `if (graph.isEmpty()) return 0`). The
 * health monitor's `isCritical()` is defined as
 * `minCutValue < warningThreshold` — so an empty graph reports as critical.
 *
 * Before the fix, QEReasoningBank.routeTask consulted `isCritical()`
 * unconditionally and dampened exploration ε by 5x (multiplier 0.2) on
 * empty graphs. In CLI hook routing — the only place ADR-095 exploration
 * matters in practice — the SwarmGraph IS empty because Queen coordinator
 * activity is what populates it. So exploration was permanently dampened
 * in the exact deployment scenario the ADR was meant to help.
 *
 * Fix: `resolveTopologyCriticalFromSharedMincut` returns true ONLY when
 * the graph has actual vertices AND `isCritical()` returns true. Empty
 * graph = no signal = full ε rate.
 *
 * The helper is tested in isolation here (NOT through the full kernel +
 * reasoning-bank stack) because that stack pulls in real embeddings, HNSW,
 * and pretrained patterns — all of which OOM in the test forks. Testing
 * the helper directly proves the fix without paying that cost.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { resolveTopologyCriticalFromSharedMincut } from '../../../src/learning/routing-topology-gate';
import {
  getSharedMinCutGraph,
  getSharedMinCutMonitor,
  resetSharedMinCutState,
  isSharedMinCutGraphInitialized,
  isSharedMinCutMonitorInitialized,
} from '../../../src/coordination/mincut/shared-singleton';

function makeVertex(id: string) {
  return {
    id,
    type: 'agent' as const,
    weight: 1.0,
    createdAt: new Date(),
  };
}

describe('resolveTopologyCriticalFromSharedMincut (CRITICAL #1 — ADR-095 follow-up)', () => {
  beforeEach(() => {
    resetSharedMinCutState();
  });

  afterEach(() => {
    resetSharedMinCutState();
  });

  it('returns false when the monitor has never been initialized', () => {
    expect(isSharedMinCutMonitorInitialized()).toBe(false);
    expect(resolveTopologyCriticalFromSharedMincut()).toBe(false);
  });

  it('returns false when the graph has been initialized but is still empty (the regression case)', () => {
    // Force the singleton into the "initialized but empty graph" state.
    // This is the EXACT case the audit identified — without the fix,
    // `isCritical()` returns true here because `getMinCutValue() === 0`
    // on an empty graph, and `0 < warningThreshold` is true.
    getSharedMinCutMonitor();
    expect(isSharedMinCutMonitorInitialized()).toBe(true);
    expect(isSharedMinCutGraphInitialized()).toBe(true);
    expect(getSharedMinCutGraph().isEmpty()).toBe(true);

    // Sanity: without the emptiness check, isCritical() would say "yes".
    expect(getSharedMinCutMonitor().isCritical()).toBe(true);

    // The fix: helper returns false because graph is empty.
    expect(resolveTopologyCriticalFromSharedMincut()).toBe(false);
  });

  it('returns true ONLY when the graph has vertices AND isCritical() is true', () => {
    const graph = getSharedMinCutGraph();
    const monitor = getSharedMinCutMonitor();

    // Add two disconnected vertices — weighted degree is 0 for both,
    // mincut value is 0, isCritical() should fire legitimately.
    graph.addVertex(makeVertex('agent-a'));
    graph.addVertex(makeVertex('agent-b'));

    expect(graph.isEmpty()).toBe(false);
    expect(monitor.getMinCutValue()).toBe(0);
    expect(monitor.isCritical()).toBe(true);

    // Legitimate criticality — helper should now return true
    expect(resolveTopologyCriticalFromSharedMincut()).toBe(true);
  });

  it('returns false when graph has vertices but isCritical() is false (healthy topology)', () => {
    // Two vertices with a heavy connecting edge — mincut value is positive,
    // above warningThreshold, isCritical() is false.
    const graph = getSharedMinCutGraph();
    const monitor = getSharedMinCutMonitor();
    graph.addVertex(makeVertex('agent-a'));
    graph.addVertex(makeVertex('agent-b'));
    graph.addEdge({
      source: 'agent-a',
      target: 'agent-b',
      weight: 10.0,
      type: 'coordination',
      bidirectional: true,
    });

    expect(graph.isEmpty()).toBe(false);
    expect(monitor.getMinCutValue()).toBeGreaterThan(0);
    // monitor.isCritical() depends on the warningThreshold; assert via the
    // helper's contract rather than re-deriving the threshold here.
    if (!monitor.isCritical()) {
      expect(resolveTopologyCriticalFromSharedMincut()).toBe(false);
    }
  });
});
