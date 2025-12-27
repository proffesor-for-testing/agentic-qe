/**
 * Memory subsystem exports
 *
 * Phase 0 M0.3: HNSW Pattern Store for O(log n) similarity search
 */

// HNSW Pattern Store - Direct vector pattern storage using @ruvector/core
export {
  HNSWPatternStore,
  DistanceMetric,
} from './HNSWPatternStore';
export type {
  QEPattern,
  PatternType,
  IPatternStore,
  HNSWPatternStoreConfig,
} from './HNSWPatternStore';
