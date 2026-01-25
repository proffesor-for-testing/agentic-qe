/**
 * Edge Adapters - Browser-Compatible Storage and Vector Search
 *
 * Provides browser-compatible implementations of storage and vector search
 * that match the Node.js IPatternStore interface.
 *
 * @module edge/adapters
 * @version 1.0.0
 */

// IndexedDB Storage
export {
  IndexedDBStorage,
  createIndexedDBStorage,
} from './IndexedDBStorage';

// Browser HNSW Adapter
export {
  BrowserHNSWAdapter,
  createBrowserHNSWAdapter,
  isBrowserHNSWSupported,
} from './BrowserHNSWAdapter';
