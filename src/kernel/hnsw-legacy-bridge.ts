/**
 * HNSW Legacy Bridge (ADR-071)
 *
 * Bridges the old IHNSWIndex interface (string keys, number[]) to the
 * unified IHnswIndexProvider interface (numeric IDs, Float32Array).
 * This allows existing consumers (PatternStore, UnifiedMemory, Learning)
 * to route through the single unified HNSW backend without code changes.
 *
 * After shadow validation confirms <2% divergence, old HNSW implementations
 * are decommissioned and consumers migrate directly to IHnswIndexProvider.
 *
 * @module kernel/hnsw-legacy-bridge
 */

import type {
  IHnswIndexProvider,
  SearchResult,
} from './hnsw-index-provider.js';
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
 * Adapts IHnswIndexProvider (unified numeric ID interface) behind the
 * old IHNSWIndex interface (string key interface).
 *
 * Maintains a bidirectional string↔number ID map, same pattern used by
 * RvfNativeAdapter for its string-ID mapping.
 */
export class HnswLegacyBridge implements IHNSWIndex {
  private readonly provider: IHnswIndexProvider;
  private readonly strToNum = new Map<string, number>();
  private readonly numToStr = new Map<number, string>();
  private readonly metadataMap = new Map<string, CoverageVectorMetadata>();
  private nextId = 1;

  constructor(provider: IHnswIndexProvider) {
    this.provider = provider;
  }

  // --------------------------------------------------------------------------
  // IHNSWIndex Implementation
  // --------------------------------------------------------------------------

  async initialize(): Promise<void> {
    // Provider is already initialized via HnswAdapter
  }

  async insert(
    key: string,
    vector: number[],
    metadata?: CoverageVectorMetadata,
  ): Promise<void> {
    const numId = this.getOrCreateNumericId(key);
    const floatVec = new Float32Array(vector);
    this.provider.add(numId, floatVec, metadata as unknown as Record<string, unknown>);
    if (metadata) {
      this.metadataMap.set(key, metadata);
    }
  }

  async search(query: number[], k: number): Promise<HNSWSearchResult[]> {
    const floatQuery = new Float32Array(query);
    const results: SearchResult[] = this.provider.search(floatQuery, k);

    const mapped: HNSWSearchResult[] = [];
    for (const r of results) {
      const key = this.numToStr.get(r.id);
      if (!key) continue;
      mapped.push({
        key,
        score: r.score,
        distance: 1 - r.score,
        metadata: this.metadataMap.get(key),
      });
    }
    return mapped;
  }

  async batchInsert(items: HNSWInsertItem[]): Promise<void> {
    for (const item of items) {
      await this.insert(item.key, item.vector, item.metadata);
    }
  }

  async delete(key: string): Promise<boolean> {
    const numId = this.strToNum.get(key);
    if (numId === undefined) return false;

    const removed = this.provider.remove(numId);
    if (removed) {
      this.strToNum.delete(key);
      this.numToStr.delete(numId);
      this.metadataMap.delete(key);
    }
    return removed;
  }

  async getStats(): Promise<HNSWIndexStats> {
    return {
      nativeHNSW: true,
      backendType: 'ruvector-gnn' as HNSWBackendType,
      vectorCount: this.provider.size(),
      indexSizeBytes: this.provider.size() * this.provider.dimensions() * 4,
      avgSearchLatencyMs: 0,
      p95SearchLatencyMs: 0,
      p99SearchLatencyMs: 0,
      searchOperations: 0,
      insertOperations: this.strToNum.size,
    };
  }

  async clear(): Promise<void> {
    this.provider.clear?.();
    this.strToNum.clear();
    this.numToStr.clear();
    this.metadataMap.clear();
    this.nextId = 1;
  }

  isNativeAvailable(): boolean {
    return true; // unified provider always available
  }

  // --------------------------------------------------------------------------
  // ID Mapping
  // --------------------------------------------------------------------------

  private getOrCreateNumericId(key: string): number {
    let numId = this.strToNum.get(key);
    if (numId !== undefined) return numId;

    numId = this.nextId++;
    this.strToNum.set(key, numId);
    this.numToStr.set(numId, key);
    return numId;
  }
}
