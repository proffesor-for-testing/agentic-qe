/**
 * CRDT Module for P2P Conflict Resolution
 *
 * Conflict-free Replicated Data Types (CRDTs) for automatic conflict
 * resolution in distributed pattern storage. Enables eventual consistency
 * without coordination between peers.
 *
 * CRDTs Included:
 * - GCounter: Grow-only counter (increment only)
 * - LWWRegister: Last-Writer-Wins register (timestamp-based)
 * - ORSet: Observed-Remove set (add-wins semantics)
 * - PatternCRDT: Composite CRDT for SharedPattern objects
 *
 * @module edge/p2p/crdt
 * @version 1.0.0
 *
 * @example
 * ```typescript
 * import {
 *   CRDTStore,
 *   GCounter,
 *   LWWRegister,
 *   ORSet,
 *   PatternCRDT,
 *   VectorClock,
 * } from '@ruvector/edge/p2p/crdt';
 *
 * // Create a store
 * const store = new CRDTStore({
 *   replicaId: 'agent-1',
 *   autoGC: true,
 * });
 *
 * // Create CRDTs
 * const counter = store.createGCounter('page-views');
 * counter.increment();
 *
 * const tags = store.createORSet<string>('tags');
 * tags.add('typescript');
 * tags.add('testing');
 *
 * const pattern = store.createPattern({
 *   id: 'pattern-1',
 *   content: 'test code...',
 *   type: 'unit-test',
 *   category: 'test',
 *   domain: 'api',
 * });
 *
 * // Merge remote state
 * store.applyState(remoteState);
 *
 * // Generate deltas for sync
 * const deltas = store.generateDeltas(lastSyncClock);
 * ```
 */

// Export all types
export * from './types';

// Export VectorClock
export { VectorClock } from './VectorClock';

// Export CRDTs
export { GCounter } from './GCounter';
export { LWWRegister } from './LWWRegister';
export { ORSet } from './ORSet';
export { PatternCRDT, type PatternInput, type PatternData, type ModificationEntry } from './PatternCRDT';

// Export Store
export { CRDTStore } from './CRDTStore';

/**
 * CRDT module version
 */
export const CRDT_VERSION = '1.0.0';

/**
 * CRDT module capabilities
 */
export const CRDT_CAPABILITIES = {
  // Counter CRDTs
  gCounter: true,
  pnCounter: false, // Not yet implemented

  // Register CRDTs
  lwwRegister: true,
  mvRegister: false, // Not yet implemented

  // Set CRDTs
  orSet: true,
  twoPhaseSet: false, // Not yet implemented

  // Map CRDTs
  lwwMap: false, // Not yet implemented
  orMap: false, // Not yet implemented

  // Composite CRDTs
  patternCRDT: true,

  // Features
  vectorClocks: true,
  deltaSync: true,
  tombstoneGC: true,
  conflictTracking: true,
  eventEmission: true,
};
