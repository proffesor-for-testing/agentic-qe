/**
 * Embedding Storage Backends
 *
 * Provides pluggable storage backends for the embedding cache:
 * - Memory: Fast, in-process, LRU eviction
 * - Redis: Distributed, automatic TTL
 * - SQLite: Persistent, local storage
 *
 * @module code-intelligence/embeddings/backends
 * @see Issue #146 - Security Hardening: SP-2 Dedicated Embedding Cache
 */

// Types
export {
  type EmbeddingStorageBackend,
  type BackendType,
  type BackendConfig,
  type BackendStats,
  type BaseBackendConfig,
  type MemoryBackendConfig,
  type RedisBackendConfig,
  type SQLiteBackendConfig,
  DEFAULT_TTL_MS,
  DEFAULT_MAX_SIZE,
  EMBEDDING_DIMENSIONS,
  BYTES_PER_ENTRY,
} from './types.js';

// Backends
export { MemoryStorageBackend } from './MemoryBackend.js';
export { RedisStorageBackend } from './RedisBackend.js';
export { SQLiteStorageBackend } from './SQLiteBackend.js';
