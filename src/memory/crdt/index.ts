/**
 * CRDT Module - Conflict-free Replicated Data Types
 *
 * Provides eventually consistent distributed state for multi-agent coordination.
 * Implements standard CRDTs with support for delta-based replication.
 *
 * @module memory/crdt
 *
 * @example
 * ```typescript
 * import {
 *   createCRDTStore,
 *   createConvergenceTracker,
 * } from '@agentic-qe/v3/memory/crdt';
 *
 * // Agent A creates store
 * const storeA = createCRDTStore({ nodeId: 'agent-a' });
 * storeA.setRegister('config', { maxAgents: 100 });
 * storeA.incrementCounter('tasks');
 * storeA.addToSet('active', 'agent-a');
 *
 * // Agent B creates store (concurrent)
 * const storeB = createCRDTStore({ nodeId: 'agent-b' });
 * storeB.incrementCounter('tasks');
 * storeB.addToSet('active', 'agent-b');
 *
 * // Merge stores (order doesn't matter)
 * storeA.merge(storeB);
 * storeB.merge(storeA);
 *
 * // Both converge to same state
 * console.log(storeA.getCounter('tasks').get()); // 2
 * console.log(storeB.getCounter('tasks').get()); // 2
 *
 * // Track convergence across cluster
 * const tracker = createConvergenceTracker();
 * tracker.recordNodeState('agent-a', storeA.getState());
 * tracker.recordNodeState('agent-b', storeB.getState());
 * console.log(tracker.hasConverged()); // true
 * ```
 */

// =============================================================================
// Type Exports
// =============================================================================

export type {
  // Core CRDT Types
  CRDTType,
  CRDTBaseState,

  // LWW Register
  LWWRegister,
  LWWRegisterState,

  // G-Counter
  GCounter,
  GCounterState,

  // PN-Counter
  PNCounter,
  PNCounterState,

  // OR-Set
  ORSet,
  ORSetState,
  ORSetElement,

  // CRDT Store
  CRDTStore,
  CRDTStoreConfig,
  CRDTStoreState,
  CRDTStoreDelta,
  CRDTStoreStats,
  CRDTChangeEvent,
  CRDTChangeListener,

  // Convergence Tracker
  ConvergenceTracker,
  ConvergenceTrackerConfig,
  ConvergenceStatus,
  NodeStateSnapshot,

  // Utilities
  SerializationOptions,
  MergeResult,
} from './types.js';

// =============================================================================
// LWW Register Exports
// =============================================================================

export {
  createLWWRegister,
  createLWWRegisterFromState,
  isLWWRegisterState,
} from './lww-register.js';

// =============================================================================
// G-Counter Exports
// =============================================================================

export {
  createGCounter,
  createGCounterFromState,
  isGCounterState,
  getNodeCountFromState,
  getContributingNodes,
} from './g-counter.js';

// =============================================================================
// PN-Counter Exports
// =============================================================================

export {
  createPNCounter,
  createPNCounterFromState,
  isPNCounterState,
  getPNCounterBreakdown,
} from './pn-counter.js';

export type { PNCounterBreakdown } from './pn-counter.js';

// =============================================================================
// OR-Set Exports
// =============================================================================

export {
  createORSet,
  createORSetFromState,
  isORSetState,
  getORSetStats,
  compactORSetState,
} from './or-set.js';

export type { ORSetStats } from './or-set.js';

// =============================================================================
// CRDT Store Exports
// =============================================================================

export {
  createCRDTStore,
  createCRDTStoreFromState,
  isCRDTStoreState,
  isCRDTStoreDelta,
} from './crdt-store.js';

// =============================================================================
// Convergence Tracker Exports
// =============================================================================

export {
  createConvergenceTracker,
  createMetricsConvergenceTracker,
} from './convergence-tracker.js';

export type {
  ConvergenceMetrics,
  MetricsConvergenceTracker,
} from './convergence-tracker.js';
