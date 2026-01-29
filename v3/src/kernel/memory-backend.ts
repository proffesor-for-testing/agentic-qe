/**
 * Agentic QE v3 - Memory Backend
 * Hybrid memory implementation (in-memory + optional persistence)
 */

import { MemoryBackend, StoreOptions, VectorSearchResult } from './interfaces';
import { cosineSimilarity } from '../shared/utils/vector-math.js';
import { MEMORY_CONSTANTS } from './constants.js';

interface StoredEntry {
  value: unknown;
  namespace: string;
  expiresAt?: number;
  createdAt: number;
}

interface VectorEntry {
  embedding: number[];
  metadata?: unknown;
}

export class InMemoryBackend implements MemoryBackend {
  private store: Map<string, StoredEntry> = new Map();
  private vectors: Map<string, VectorEntry> = new Map();
  private cleanupInterval?: ReturnType<typeof setInterval>;

  async initialize(): Promise<void> {
    // Start periodic cleanup of expired entries
    this.cleanupInterval = setInterval(() => this.cleanup(), MEMORY_CONSTANTS.CLEANUP_INTERVAL_MS);
  }

  async dispose(): Promise<void> {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
    this.store.clear();
    this.vectors.clear();
  }

  async set<T>(key: string, value: T, options?: StoreOptions): Promise<void> {
    const entry: StoredEntry = {
      value,
      namespace: options?.namespace ?? 'default',
      createdAt: Date.now(),
    };

    if (options?.ttl) {
      entry.expiresAt = Date.now() + options.ttl * MEMORY_CONSTANTS.TTL_MULTIPLIER_MS;
    }

    const fullKey = this.buildKey(key, options?.namespace);
    this.store.set(fullKey, entry);
  }

  async get<T>(key: string, namespace?: string): Promise<T | undefined> {
    const fullKey = this.buildKey(key, namespace);
    const entry = this.store.get(fullKey);

    if (!entry) {
      return undefined;
    }

    // Check expiration
    if (entry.expiresAt && Date.now() > entry.expiresAt) {
      this.store.delete(fullKey);
      return undefined;
    }

    return entry.value as T;
  }

  async delete(key: string, namespace?: string): Promise<boolean> {
    const fullKey = this.buildKey(key, namespace);
    return this.store.delete(fullKey);
  }

  async has(key: string, namespace?: string): Promise<boolean> {
    const value = await this.get(key, namespace);
    return value !== undefined;
  }

  async search(pattern: string, limit: number = MEMORY_CONSTANTS.DEFAULT_SEARCH_LIMIT): Promise<string[]> {
    const regex = new RegExp(pattern.replace(/\*/g, '.*'));
    const results: string[] = [];

    for (const key of this.store.keys()) {
      if (regex.test(key)) {
        results.push(key);
        if (results.length >= limit) break;
      }
    }

    return results;
  }

  async vectorSearch(embedding: number[], k: number): Promise<VectorSearchResult[]> {
    const results: VectorSearchResult[] = [];

    for (const [key, entry] of this.vectors.entries()) {
      const score = cosineSimilarity(embedding, entry.embedding);
      results.push({ key, score, metadata: entry.metadata });
    }

    // Sort by score descending and take top k
    return results
      .sort((a, b) => b.score - a.score)
      .slice(0, k);
  }

  async storeVector(
    key: string,
    embedding: number[],
    metadata?: unknown
  ): Promise<void> {
    this.vectors.set(key, { embedding, metadata });
  }

  private buildKey(key: string, namespace?: string): string {
    return namespace ? `${namespace}:${key}` : key;
  }

  private cleanup(): void {
    const now = Date.now();
    for (const [key, entry] of this.store.entries()) {
      if (entry.expiresAt && now > entry.expiresAt) {
        this.store.delete(key);
      }
    }
  }

  // Utility methods

  getStats(): { entries: number; vectors: number } {
    return {
      entries: this.store.size,
      vectors: this.vectors.size,
    };
  }

  async clear(namespace?: string): Promise<void> {
    if (namespace) {
      const prefix = `${namespace}:`;
      for (const key of this.store.keys()) {
        if (key.startsWith(prefix)) {
          this.store.delete(key);
        }
      }
    } else {
      this.store.clear();
    }
  }

  /**
   * Count entries in a namespace
   * Iterates through all stored keys and counts those matching the namespace prefix.
   * @param namespace - The namespace to count entries for
   * @returns The number of entries in the namespace
   */
  async count(namespace: string): Promise<number> {
    let count = 0;
    const prefix = `${namespace}:`;
    for (const key of this.store.keys()) {
      if (key.startsWith(prefix)) {
        // Verify the entry hasn't expired before counting
        const entry = this.store.get(key);
        if (entry && (!entry.expiresAt || Date.now() <= entry.expiresAt)) {
          count++;
        }
      }
    }
    return count;
  }

  /**
   * Check if code intelligence index exists
   * Returns true if code-intelligence:kg namespace has entries.
   * This is used to determine if a project has been indexed and can
   * leverage semantic search for improved accuracy.
   * @returns True if the code intelligence knowledge graph has been indexed
   */
  async hasCodeIntelligenceIndex(): Promise<boolean> {
    const count = await this.count('code-intelligence:kg');
    return count > 0;
  }
}
