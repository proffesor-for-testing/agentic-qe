/**
 * HNSW Legacy Bridge (ADR-071)
 *
 * Bridges the old IHNSWIndex interface (string keys, number[]) to the
 * unified HnswAdapter which already provides string-ID APIs.
 *
 * Delegates ID mapping to HnswAdapter.addByStringId/searchByArray/removeByStringId
 * instead of maintaining a duplicate in-memory map. This means the ID mapping
 * lives in one place (the adapter) and stays consistent.
 *
 * Metadata is stored in a local Map since HnswAdapter does not track
 * domain-specific CoverageVectorMetadata.
 *
 * @module kernel/hnsw-legacy-bridge
 */

import type { HnswAdapter } from './hnsw-adapter.js';
import type {
  IHNSWIndex,
  HNSWSearchResult,
  HNSWInsertItem,
  HNSWIndexStats,
  HNSWBackendType,
  CoverageVectorMetadata,
} from '../domains/coverage-analysis/services/hnsw-index.js';

// ============================================================================
// HnswLegacyBridge
// ============================================================================

/**
 * Adapts HnswAdapter (unified string+numeric ID interface) behind the
 * old IHNSWIndex interface (string key interface).
 *
 * All ID mapping is delegated to HnswAdapter — no duplicate maps here.
 */
export class HnswLegacyBridge implements IHNSWIndex {
  private readonly adapter: HnswAdapter;
  private readonly metadataMap = new Map<string, CoverageVectorMetadata>();
  private insertCount = 0;

  constructor(adapter: HnswAdapter) {
    this.adapter = adapter;
  }

  // --------------------------------------------------------------------------
  // IHNSWIndex Implementation
  // --------------------------------------------------------------------------

  async initialize(): Promise<void> {
    // Adapter is already initialized at construction
  }

  async insert(
    key: string,
    vector: number[],
    metadata?: CoverageVectorMetadata,
  ): Promise<void> {
    this.adapter.addByStringId(key, vector);
    this.insertCount++;
    if (metadata) {
      this.metadataMap.set(key, metadata);
    }
  }

  async search(query: number[], k: number): Promise<HNSWSearchResult[]> {
    const results = this.adapter.searchByArray(query, k);
    return results.map(r => ({
      key: r.id,
      score: r.score,
      distance: 1 - r.score,
      metadata: this.metadataMap.get(r.id),
    }));
  }

  async batchInsert(items: HNSWInsertItem[]): Promise<void> {
    for (const item of items) {
      await this.insert(item.key, item.vector, item.metadata);
    }
  }

  async delete(key: string): Promise<boolean> {
    const removed = this.adapter.removeByStringId(key);
    if (removed) {
      this.metadataMap.delete(key);
    }
    return removed;
  }

  async getStats(): Promise<HNSWIndexStats> {
    return {
      nativeHNSW: true,
      backendType: 'ruvector-gnn' as HNSWBackendType,
      vectorCount: this.adapter.size(),
      indexSizeBytes: this.adapter.size() * this.adapter.dimensions() * 4,
      avgSearchLatencyMs: this.adapter.lastSearchLatencyMs,
      p95SearchLatencyMs: 0,
      p99SearchLatencyMs: 0,
      searchOperations: 0,
      insertOperations: this.insertCount,
    };
  }

  async clear(): Promise<void> {
    this.adapter.clear();
    this.metadataMap.clear();
    this.insertCount = 0;
  }

  isNativeAvailable(): boolean {
    return true; // unified adapter is always available
  }
}
