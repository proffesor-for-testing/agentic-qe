/**
 * Agentic QE v3 - MinCut Shared Singleton
 * ADR-047: MinCut Self-Organizing QE Integration
 *
 * Provides a singleton SwarmGraph and MinCutHealthMonitor that can be shared
 * between MCP tools and QueenCoordinator.
 *
 * This solves the "two separate graph instances" problem where:
 * - MCP tools were creating their own graph singleton
 * - QueenMinCutBridge was creating another graph
 * - Data added via MCP tools was invisible to QueenCoordinator
 *
 * Usage:
 * ```typescript
 * import { getSharedMinCutGraph, getSharedMinCutMonitor } from './shared-singleton';
 *
 * // Both MCP tools and QueenCoordinator use the same instance
 * const graph = getSharedMinCutGraph();
 * ```
 */

import { SwarmGraph, createSwarmGraph } from './swarm-graph';
import { MinCutHealthMonitor, createMinCutHealthMonitor } from './mincut-health-monitor';

// ============================================================================
// Shared Singleton State
// ============================================================================

let sharedGraph: SwarmGraph | null = null;
let sharedMonitor: MinCutHealthMonitor | null = null;

/**
 * Get the shared SwarmGraph singleton.
 * Creates it lazily on first access.
 */
export function getSharedMinCutGraph(): SwarmGraph {
  if (!sharedGraph) {
    sharedGraph = createSwarmGraph();
  }
  return sharedGraph;
}

/**
 * Get the shared MinCutHealthMonitor singleton.
 * Creates it lazily on first access.
 */
export function getSharedMinCutMonitor(): MinCutHealthMonitor {
  if (!sharedMonitor) {
    sharedMonitor = createMinCutHealthMonitor(getSharedMinCutGraph());
  }
  return sharedMonitor;
}

/**
 * Reset the shared singleton state.
 * Used primarily for testing to ensure clean state between tests.
 */
export function resetSharedMinCutState(): void {
  if (sharedMonitor) {
    sharedMonitor.stop();
    sharedMonitor = null;
  }
  sharedGraph = null;
}

/**
 * Check if shared graph is initialized.
 */
export function isSharedMinCutGraphInitialized(): boolean {
  return sharedGraph !== null;
}

/**
 * Check if shared monitor is initialized.
 */
export function isSharedMinCutMonitorInitialized(): boolean {
  return sharedMonitor !== null;
}
