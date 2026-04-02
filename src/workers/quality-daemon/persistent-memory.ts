/**
 * IMP-10: QE Quality Daemon — Persistent WorkerMemory Adapter
 *
 * Bridges the WorkerMemory interface to the unified SQLite persistence
 * layer (UnifiedMemoryManager). All daemon state is persisted to the
 * `quality-daemon` namespace in kv_store, surviving restarts.
 *
 * Resolves Finding 2: CLI daemon previously used throwaway in-memory Map.
 */

import type { WorkerMemory } from '../interfaces';

/**
 * Interface matching the subset of UnifiedMemoryManager we need,
 * to avoid circular dependency on the full kernel module.
 */
export interface KVBackend {
  kvGet<T>(key: string, namespace?: string): Promise<T | undefined>;
  kvSet(key: string, value: unknown, namespace?: string, ttl?: number): Promise<void>;
  kvSearch(pattern: string, namespace?: string, limit?: number): Promise<string[]>;
}

const NAMESPACE = 'quality-daemon';

/**
 * WorkerMemory backed by unified SQLite persistence.
 * All keys are stored in the 'quality-daemon' namespace.
 */
export class PersistentWorkerMemory implements WorkerMemory {
  constructor(private readonly backend: KVBackend) {}

  async get<T>(key: string): Promise<T | undefined> {
    return this.backend.kvGet<T>(key, NAMESPACE);
  }

  async set<T>(key: string, value: T): Promise<void> {
    await this.backend.kvSet(key, value, NAMESPACE);
  }

  async search(pattern: string): Promise<string[]> {
    return this.backend.kvSearch(pattern, NAMESPACE);
  }
}
