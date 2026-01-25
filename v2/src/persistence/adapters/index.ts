/**
 * Persistence Adapters
 *
 * Sync adapters that wrap existing stores to provide automatic
 * synchronization with cloud persistence.
 *
 * @module persistence/adapters
 */

// Memory Sync Adapter - wraps SwarmMemoryManager
export {
  MemorySyncAdapter,
  createMemorySyncAdapter,
  type MemorySyncAdapterConfig,
} from './MemorySyncAdapter.js';

// Code Intelligence Sync Adapter - wraps CodeChunkStore
export {
  CodeIntelligenceSyncAdapter,
  createCodeIntelligenceSyncAdapter,
  type CodeIntelligenceSyncAdapterConfig,
} from './CodeIntelligenceSyncAdapter.js';
