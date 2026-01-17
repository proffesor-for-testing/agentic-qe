/**
 * Nervous System Persistence Module
 *
 * Provides persistence capabilities for nervous system components:
 * - HDC Memory (hypervector patterns)
 * - BTSP Learning (one-shot associations)
 * - Circadian Controller (phase state and metrics)
 *
 * @module nervous-system/persistence
 */

// Interface and types
export type {
  INervousSystemStore,
  NervousSystemComponent,
  HdcSerializedState,
  BTSPSerializedState,
  CircadianSerializedState,
  StoredStateMetadata,
  NervousSystemStoreFactory,
} from './INervousSystemStore.js';

// Serializers
export {
  serializeHypervector,
  deserializeHypervector,
  serializeHdcMemory,
  deserializeHdcMemory,
  calculateStateSize as calculateHdcStateSize,
  validateHdcState,
} from './HdcSerializer.js';
export type { HdcSerializerOptions } from './HdcSerializer.js';

export {
  serializeBTSP,
  deserializeBTSP,
  calculateStateSize as calculateBtspStateSize,
  validateBTSPState,
  createEmptyBTSPState,
} from './BTSPSerializer.js';
export type {
  BTSPSerializerOptions,
  SerializableBTSPAdapter,
  RestorableBTSPAdapter,
} from './BTSPSerializer.js';

export {
  serializeCircadian,
  deserializeCircadian,
  calculateStateSize as calculateCircadianStateSize,
  validateCircadianState,
  createDefaultCircadianState,
  calculateEnergySavings,
} from './CircadianSerializer.js';
export type {
  CircadianSerializerOptions,
  SerializableCircadianController,
  RestorableCircadianController,
} from './CircadianSerializer.js';

// SQLite Store
export {
  SQLiteNervousSystemStore,
  createSQLiteNervousSystemStore,
} from './SQLiteNervousSystemStore.js';
export type { SQLiteNervousSystemStoreConfig } from './SQLiteNervousSystemStore.js';

// Persistence Manager
export {
  NervousSystemPersistenceManager,
  createNervousSystemPersistenceManager,
  getSharedPersistenceManager,
  resetSharedPersistenceManager,
} from './NervousSystemPersistenceManager.js';
export type {
  NervousSystemPersistenceManagerConfig,
  PersistenceManagerEvents,
} from './NervousSystemPersistenceManager.js';
