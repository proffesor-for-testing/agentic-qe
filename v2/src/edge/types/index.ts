/**
 * Edge Types - Browser Storage and Vector Search Types
 *
 * Type definitions for browser-compatible vector storage and HNSW search.
 *
 * @module edge/types
 * @version 1.0.0
 */

export type {
  StoredVectorEntry,
  StoredPatternMetadata,
  IndexedDBStoreConfig,
  HNSWIndexState,
  HNSWIndexConfig,
  IBrowserStorage,
  BrowserSearchResult,
  BrowserHNSWConfig,
  BrowserStorageStats,
} from './storage.types';

export {
  isBrowserEnvironment,
  float32ToArrayBuffer,
  arrayBufferToFloat32,
  toFloat32Array,
} from './storage.types';
