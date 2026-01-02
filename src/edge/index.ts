/**
 * @ruvector/edge Integration for Agentic QE Fleet
 *
 * This module provides browser-compatible agent capabilities using WASM-compiled
 * vector operations for in-browser AI agent memory and pattern matching.
 *
 * Phase 0: Proof of Concept
 * - Browser-compatible BaseAgent
 * - HNSW adapter with IndexedDB storage
 * - Chrome DevTools panel
 *
 * @module @agentic-qe/edge
 * @version 0.1.0
 */

// Re-export browser-compatible types
export * from './types/browser-agent.types';
export * from './types/storage.types';

// Browser Agent (WASM-compatible)
export {
  BrowserAgent,
  BrowserAgentBase,
  type BrowserAgentConfig,
  type BrowserAgentState,
  type BrowserAgentFullConfig,
  type BrowserMemoryAdapter,
  type MemoryUsage,
} from './browser/BrowserAgent';

// Storage Adapters
export { IndexedDBStorage } from './adapters/IndexedDBStorage';
export { BrowserHNSWAdapter } from './adapters/BrowserHNSWAdapter';

// WASM Shims
export {
  wasmShims,
  BrowserCrypto,
  BrowserEventEmitterImpl,
  IndexedDBMemoryStore,
  LocalStorageMemoryStore,
  BrowserLogger,
  createBrowserCrypto,
  createBrowserEventEmitter,
  createBrowserMemoryStore,
  createBrowserLogger,
  hrtime,
  elapsed,
} from './wasm/shims';

// Edge runtime detection
export function isEdgeRuntime(): boolean {
  return typeof window !== 'undefined' && typeof document !== 'undefined';
}

// Edge capability detection
export function getEdgeCapabilities(): EdgeCapabilities {
  return {
    hasIndexedDB: typeof indexedDB !== 'undefined',
    hasWebWorker: typeof Worker !== 'undefined',
    hasWASM: typeof WebAssembly !== 'undefined',
    hasSharedArrayBuffer: typeof SharedArrayBuffer !== 'undefined',
    hasAtomics: typeof Atomics !== 'undefined',
  };
}

export interface EdgeCapabilities {
  hasIndexedDB: boolean;
  hasWebWorker: boolean;
  hasWASM: boolean;
  hasSharedArrayBuffer: boolean;
  hasAtomics: boolean;
}

// Version information
export const EDGE_VERSION = '0.1.0';
export const EDGE_PHASE = 'P0-POC';
