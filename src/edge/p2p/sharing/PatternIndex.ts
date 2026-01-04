/**
 * Pattern Index with Vector Similarity Search
 *
 * In-memory index of shared patterns with efficient vector similarity search
 * using cosine distance. Includes LRU eviction, deduplication, and versioning.
 *
 * @module edge/p2p/sharing/PatternIndex
 * @version 1.0.0
 */

import type {
  SharedPattern,
  PatternQuery,
  PatternMatch,
  PatternSearchResults,
  PatternVersion,
  PatternIndexConfig,
  PatternIndexStats,
  PatternConflict,
  VectorClock,
  PatternSummary,
} from './types';
import {
  PatternCategory,
  PatternQuality,
  SharingError,
  SharingErrorCode,
  SharingEventType,
  DEFAULT_EMBEDDING_DIMENSION,
  DEFAULT_CACHE_SIZE,
  DEFAULT_PATTERN_TTL,
} from './types';
import type { SharingEvent, SharingEventHandler } from './types';

// ============================================
// LRU Cache Implementation
// ============================================

/**
 * LRU cache node
 */
interface LRUNode<K, V> {
  key: K;
  value: V;
  prev: LRUNode<K, V> | null;
  next: LRUNode<K, V> | null;
  accessTime: number;
}

/**
 * Simple LRU cache implementation
 */
class LRUCache<K, V> {
  private capacity: number;
  private cache: Map<K, LRUNode<K, V>> = new Map();
  private head: LRUNode<K, V> | null = null;
  private tail: LRUNode<K, V> | null = null;

  constructor(capacity: number) {
    this.capacity = capacity;
  }

  get(key: K): V | undefined {
    const node = this.cache.get(key);
    if (!node) return undefined;

    // Move to front
    this.moveToFront(node);
    node.accessTime = Date.now();
    return node.value;
  }

  set(key: K, value: V): V | undefined {
    let evicted: V | undefined;

    if (this.cache.has(key)) {
      const node = this.cache.get(key)!;
      node.value = value;
      node.accessTime = Date.now();
      this.moveToFront(node);
      return undefined;
    }

    // Evict if at capacity
    if (this.cache.size >= this.capacity) {
      evicted = this.evictLRU();
    }

    // Add new node at front
    const node: LRUNode<K, V> = {
      key,
      value,
      prev: null,
      next: this.head,
      accessTime: Date.now(),
    };

    if (this.head) {
      this.head.prev = node;
    }
    this.head = node;

    if (!this.tail) {
      this.tail = node;
    }

    this.cache.set(key, node);
    return evicted;
  }

  delete(key: K): boolean {
    const node = this.cache.get(key);
    if (!node) return false;

    this.removeNode(node);
    this.cache.delete(key);
    return true;
  }

  has(key: K): boolean {
    return this.cache.has(key);
  }

  get size(): number {
    return this.cache.size;
  }

  keys(): K[] {
    return Array.from(this.cache.keys());
  }

  values(): V[] {
    return Array.from(this.cache.values()).map((n) => n.value);
  }

  clear(): void {
    this.cache.clear();
    this.head = null;
    this.tail = null;
  }

  private moveToFront(node: LRUNode<K, V>): void {
    if (node === this.head) return;

    this.removeNode(node);

    node.prev = null;
    node.next = this.head;

    if (this.head) {
      this.head.prev = node;
    }
    this.head = node;

    if (!this.tail) {
      this.tail = node;
    }
  }

  private removeNode(node: LRUNode<K, V>): void {
    if (node.prev) {
      node.prev.next = node.next;
    } else {
      this.head = node.next;
    }

    if (node.next) {
      node.next.prev = node.prev;
    } else {
      this.tail = node.prev;
    }
  }

  private evictLRU(): V | undefined {
    if (!this.tail) return undefined;

    const evicted = this.tail.value;
    this.cache.delete(this.tail.key);

    if (this.tail.prev) {
      this.tail.prev.next = null;
      this.tail = this.tail.prev;
    } else {
      this.head = null;
      this.tail = null;
    }

    return evicted;
  }
}

// ============================================
// Pattern Index Class
// ============================================

/**
 * In-memory pattern index with vector similarity search
 *
 * @example
 * ```typescript
 * const index = new PatternIndex({ maxPatterns: 1000 });
 *
 * // Add patterns
 * await index.add(pattern);
 *
 * // Search by embedding
 * const matches = await index.search({
 *   embedding: queryVector,
 *   similarityThreshold: 0.7,
 *   limit: 10,
 * });
 *
 * // Get by ID
 * const pattern = index.get('pattern-id');
 * ```
 */
export class PatternIndex {
  private patterns: LRUCache<string, SharedPattern>;
  private contentHashes: Map<string, string>; // hash -> patternId
  private embeddings: Map<string, Float32Array>;
  private config: PatternIndexConfig;
  private eventHandlers: SharingEventHandler[] = [];
  private lastUpdated: string;

  constructor(config?: Partial<PatternIndexConfig>) {
    this.config = {
      maxPatterns: config?.maxPatterns ?? DEFAULT_CACHE_SIZE,
      embeddingDimension: config?.embeddingDimension ?? DEFAULT_EMBEDDING_DIMENSION,
      enableEviction: config?.enableEviction ?? true,
      evictionThreshold: config?.evictionThreshold ?? 0.9,
      enableDeduplication: config?.enableDeduplication ?? true,
      enableExpiration: config?.enableExpiration ?? true,
    };

    this.patterns = new LRUCache(this.config.maxPatterns);
    this.contentHashes = new Map();
    this.embeddings = new Map();
    this.lastUpdated = new Date().toISOString();
  }

  // ============================================
  // CRUD Operations
  // ============================================

  /**
   * Add a pattern to the index
   */
  add(pattern: SharedPattern): SharedPattern | null {
    // Check for duplicates by content hash
    if (this.config.enableDeduplication) {
      const existing = this.findByContentHash(pattern.content.contentHash);
      if (existing) {
        throw new SharingError(
          `Duplicate pattern: ${existing}`,
          SharingErrorCode.DUPLICATE_PATTERN
        );
      }
    }

    // Check capacity
    if (this.patterns.size >= this.config.maxPatterns) {
      if (!this.config.enableEviction) {
        throw new SharingError(
          'Pattern index is full',
          SharingErrorCode.INDEX_FULL
        );
      }
    }

    // Normalize embedding
    const embedding = this.normalizeEmbedding(pattern.embedding);

    // Add to LRU cache (may evict)
    const evicted = this.patterns.set(pattern.id, pattern);

    // Track content hash
    this.contentHashes.set(pattern.content.contentHash, pattern.id);

    // Store embedding
    this.embeddings.set(pattern.id, embedding);

    // Update timestamp
    this.lastUpdated = new Date().toISOString();

    // Emit event
    this.emit({
      type: SharingEventType.PATTERN_ADDED,
      timestamp: Date.now(),
      details: { patternId: pattern.id, category: pattern.category },
    });

    // Clean up evicted pattern's hash
    if (evicted) {
      this.contentHashes.delete(evicted.content.contentHash);
      this.embeddings.delete(evicted.id);
      this.emit({
        type: SharingEventType.PATTERN_REMOVED,
        timestamp: Date.now(),
        details: { patternId: evicted.id, reason: 'eviction' },
      });
    }

    return evicted ?? null;
  }

  /**
   * Get a pattern by ID
   */
  get(id: string): SharedPattern | undefined {
    const pattern = this.patterns.get(id);

    // Check expiration
    if (pattern && this.config.enableExpiration && pattern.expiresAt) {
      if (new Date(pattern.expiresAt) < new Date()) {
        this.remove(id);
        return undefined;
      }
    }

    return pattern;
  }

  /**
   * Update a pattern
   */
  update(id: string, updates: Partial<SharedPattern>): SharedPattern | undefined {
    const existing = this.patterns.get(id);
    if (!existing) return undefined;

    // Check for content hash changes
    if (
      updates.content?.contentHash &&
      updates.content.contentHash !== existing.content.contentHash
    ) {
      // Update hash mapping
      this.contentHashes.delete(existing.content.contentHash);
      this.contentHashes.set(updates.content.contentHash, id);
    }

    // Merge updates
    const updated: SharedPattern = {
      ...existing,
      ...updates,
      id, // Preserve ID
      updatedAt: new Date().toISOString(),
    };

    // Update embedding if provided
    if (updates.embedding) {
      const embedding = this.normalizeEmbedding(updates.embedding);
      this.embeddings.set(id, embedding);
      updated.embedding = Array.from(embedding);
    }

    this.patterns.set(id, updated);
    this.lastUpdated = new Date().toISOString();

    this.emit({
      type: SharingEventType.PATTERN_UPDATED,
      timestamp: Date.now(),
      details: { patternId: id },
    });

    return updated;
  }

  /**
   * Remove a pattern by ID
   */
  remove(id: string): boolean {
    const pattern = this.patterns.get(id);
    if (!pattern) return false;

    this.contentHashes.delete(pattern.content.contentHash);
    this.embeddings.delete(id);
    const removed = this.patterns.delete(id);
    this.lastUpdated = new Date().toISOString();

    if (removed) {
      this.emit({
        type: SharingEventType.PATTERN_REMOVED,
        timestamp: Date.now(),
        details: { patternId: id },
      });
    }

    return removed;
  }

  /**
   * Check if pattern exists
   */
  has(id: string): boolean {
    return this.patterns.has(id);
  }

  /**
   * Clear all patterns
   */
  clear(): void {
    this.patterns.clear();
    this.contentHashes.clear();
    this.embeddings.clear();
    this.lastUpdated = new Date().toISOString();
  }

  // ============================================
  // Search Operations
  // ============================================

  /**
   * Search patterns by query
   */
  search(query: PatternQuery): PatternSearchResults {
    const startTime = Date.now();
    const matches: PatternMatch[] = [];
    const threshold = query.similarityThreshold ?? 0.5;
    const limit = query.limit ?? 10;
    const offset = query.offset ?? 0;

    // Get query embedding
    const queryEmbedding = query.embedding
      ? this.normalizeEmbedding(query.embedding)
      : null;

    // Iterate through patterns
    for (const pattern of this.patterns.values()) {
      // Apply filters
      if (!this.matchesFilters(pattern, query)) continue;

      // Check expiration
      if (
        this.config.enableExpiration &&
        !query.includeExpired &&
        pattern.expiresAt
      ) {
        if (new Date(pattern.expiresAt) < new Date()) continue;
      }

      // Calculate similarity
      let similarity = 0;
      let textScore = 0;

      if (queryEmbedding) {
        const patternEmbedding = this.embeddings.get(pattern.id);
        if (patternEmbedding) {
          similarity = this.cosineSimilarity(queryEmbedding, patternEmbedding);
        }
      }

      // Text search
      if (query.textQuery) {
        textScore = this.textMatch(pattern, query.textQuery);
      }

      // Combined relevance
      const relevance = queryEmbedding
        ? similarity * 0.7 + textScore * 0.3
        : textScore;

      if (relevance >= threshold || (!queryEmbedding && textScore > 0)) {
        matches.push({
          pattern,
          similarity,
          textScore,
          relevance,
          matchReason: this.generateMatchReason(similarity, textScore, query),
        });
      }
    }

    // Sort by relevance
    matches.sort((a, b) => b.relevance - a.relevance);

    // Apply pagination
    const paginatedMatches = matches.slice(offset, offset + limit);

    return {
      matches: paginatedMatches,
      totalCount: matches.length,
      query,
      duration: Date.now() - startTime,
      cached: false,
    };
  }

  /**
   * Find similar patterns by embedding
   */
  findSimilar(
    embedding: Float32Array | number[],
    limit: number = 10,
    threshold: number = 0.5
  ): PatternMatch[] {
    const queryEmbedding = this.normalizeEmbedding(embedding);
    const matches: PatternMatch[] = [];

    for (const pattern of this.patterns.values()) {
      const patternEmbedding = this.embeddings.get(pattern.id);
      if (!patternEmbedding) continue;

      const similarity = this.cosineSimilarity(queryEmbedding, patternEmbedding);

      if (similarity >= threshold) {
        matches.push({
          pattern,
          similarity,
          relevance: similarity,
          matchReason: `Similarity: ${(similarity * 100).toFixed(1)}%`,
        });
      }
    }

    matches.sort((a, b) => b.similarity - a.similarity);
    return matches.slice(0, limit);
  }

  /**
   * Find pattern by content hash (deduplication)
   */
  findByContentHash(hash: string): string | undefined {
    return this.contentHashes.get(hash);
  }

  /**
   * Find patterns by category
   */
  findByCategory(category: PatternCategory): SharedPattern[] {
    return this.patterns.values().filter((p) => p.category === category);
  }

  /**
   * Find patterns by domain
   */
  findByDomain(domain: string): SharedPattern[] {
    return this.patterns.values().filter((p) => p.domain === domain);
  }

  /**
   * Find patterns by tags
   */
  findByTags(tags: string[]): SharedPattern[] {
    const tagSet = new Set(tags.map((t) => t.toLowerCase()));
    return this.patterns.values().filter((p) =>
      p.metadata.tags.some((t) => tagSet.has(t.toLowerCase()))
    );
  }

  // ============================================
  // Version and Conflict Detection
  // ============================================

  /**
   * Check if a pattern version conflicts with existing
   */
  checkConflict(pattern: SharedPattern): PatternConflict | null {
    const existing = this.get(pattern.id);
    if (!existing) return null;

    // Compare vector clocks
    const comparison = this.compareVectorClocks(
      existing.version.vectorClock,
      pattern.version.vectorClock
    );

    if (comparison === 'concurrent') {
      return {
        patternId: pattern.id,
        localVersion: existing.version,
        remoteVersion: pattern.version,
        conflictType: 'concurrent_update',
      };
    }

    if (comparison === 'equal' && existing.content.contentHash !== pattern.content.contentHash) {
      return {
        patternId: pattern.id,
        localVersion: existing.version,
        remoteVersion: pattern.version,
        conflictType: 'content_divergence',
      };
    }

    return null;
  }

  /**
   * Compare two vector clocks
   * Returns: 'before', 'after', 'equal', 'concurrent'
   */
  compareVectorClocks(
    a: VectorClock,
    b: VectorClock
  ): 'before' | 'after' | 'equal' | 'concurrent' {
    const allKeys = new Set([...Object.keys(a.clock), ...Object.keys(b.clock)]);

    let aLessOrEqual = true; // All a values <= b values
    let bLessOrEqual = true; // All b values <= a values

    for (const key of allKeys) {
      const aVal = a.clock[key] || 0;
      const bVal = b.clock[key] || 0;

      // If a has a larger value than b for any key, a is NOT <= b
      if (aVal > bVal) aLessOrEqual = false;
      // If b has a larger value than a for any key, b is NOT <= a
      if (bVal > aVal) bLessOrEqual = false;
    }

    // Both <= means equal
    if (aLessOrEqual && bLessOrEqual) return 'equal';
    // a <= b (and not b <= a) means a happened before b
    if (aLessOrEqual) return 'before';
    // b <= a (and not a <= b) means a happened after b
    if (bLessOrEqual) return 'after';
    // Neither is <= the other means concurrent
    return 'concurrent';
  }

  /**
   * Increment vector clock for local agent
   */
  incrementClock(clock: VectorClock, agentId: string): VectorClock {
    return {
      clock: {
        ...clock.clock,
        [agentId]: (clock.clock[agentId] || 0) + 1,
      },
    };
  }

  /**
   * Merge two vector clocks
   */
  mergeClock(a: VectorClock, b: VectorClock): VectorClock {
    const merged: Record<string, number> = { ...a.clock };

    for (const [key, value] of Object.entries(b.clock)) {
      merged[key] = Math.max(merged[key] || 0, value);
    }

    return { clock: merged };
  }

  // ============================================
  // Cleanup and Maintenance
  // ============================================

  /**
   * Remove expired patterns
   */
  cleanupExpired(): number {
    if (!this.config.enableExpiration) return 0;

    const now = new Date();
    const toRemove: string[] = [];

    for (const pattern of this.patterns.values()) {
      if (pattern.expiresAt && new Date(pattern.expiresAt) < now) {
        toRemove.push(pattern.id);
      }
    }

    for (const id of toRemove) {
      this.remove(id);
    }

    return toRemove.length;
  }

  /**
   * Get all pattern IDs
   */
  getAllIds(): string[] {
    return this.patterns.keys();
  }

  /**
   * Get all patterns
   */
  getAll(): SharedPattern[] {
    return this.patterns.values();
  }

  /**
   * Get pattern summaries
   */
  getSummaries(): PatternSummary[] {
    return this.patterns.values().map((p) => ({
      id: p.id,
      category: p.category,
      type: p.type,
      domain: p.domain,
      contentHash: p.content.contentHash,
      quality: p.quality.level,
      tags: p.metadata.tags,
    }));
  }

  // ============================================
  // Statistics
  // ============================================

  /**
   * Get index statistics
   */
  getStats(): PatternIndexStats {
    const byCategory: Record<PatternCategory, number> = {
      [PatternCategory.TEST]: 0,
      [PatternCategory.CODE]: 0,
      [PatternCategory.REFACTOR]: 0,
      [PatternCategory.DEFECT_FIX]: 0,
      [PatternCategory.PERFORMANCE]: 0,
      [PatternCategory.SECURITY]: 0,
    };

    const byQuality: Record<PatternQuality, number> = {
      [PatternQuality.UNVERIFIED]: 0,
      [PatternQuality.LOW]: 0,
      [PatternQuality.MEDIUM]: 0,
      [PatternQuality.HIGH]: 0,
      [PatternQuality.CURATED]: 0,
    };

    for (const pattern of this.patterns.values()) {
      byCategory[pattern.category]++;
      byQuality[pattern.quality.level]++;
    }

    // Estimate memory usage
    let memoryUsage = 0;
    for (const embedding of this.embeddings.values()) {
      memoryUsage += embedding.byteLength;
    }
    // Add rough estimate for pattern objects
    memoryUsage += this.patterns.size * 1024; // ~1KB per pattern estimate

    return {
      totalPatterns: this.patterns.size,
      byCategory,
      byQuality,
      memoryUsage,
      lastUpdated: this.lastUpdated,
      version: '1.0.0',
    };
  }

  /**
   * Get current size
   */
  get size(): number {
    return this.patterns.size;
  }

  // ============================================
  // Events
  // ============================================

  /**
   * Subscribe to events
   */
  on(handler: SharingEventHandler): void {
    this.eventHandlers.push(handler);
  }

  /**
   * Unsubscribe from events
   */
  off(handler: SharingEventHandler): void {
    const index = this.eventHandlers.indexOf(handler);
    if (index !== -1) {
      this.eventHandlers.splice(index, 1);
    }
  }

  /**
   * Emit an event
   */
  private emit(event: SharingEvent): void {
    for (const handler of this.eventHandlers) {
      try {
        handler(event);
      } catch {
        // Ignore handler errors
      }
    }
  }

  // ============================================
  // Private Helpers
  // ============================================

  /**
   * Normalize embedding to Float32Array
   */
  private normalizeEmbedding(embedding: Float32Array | number[]): Float32Array {
    if (embedding instanceof Float32Array) {
      return embedding;
    }
    return new Float32Array(embedding);
  }

  /**
   * Calculate cosine similarity
   */
  private cosineSimilarity(a: Float32Array, b: Float32Array): number {
    if (a.length !== b.length) {
      const minLen = Math.min(a.length, b.length);
      a = a.slice(0, minLen);
      b = b.slice(0, minLen);
    }

    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }

    const denominator = Math.sqrt(normA) * Math.sqrt(normB);
    return denominator === 0 ? 0 : dotProduct / denominator;
  }

  /**
   * Check if pattern matches query filters
   */
  private matchesFilters(pattern: SharedPattern, query: PatternQuery): boolean {
    // Category filter
    if (query.categories && query.categories.length > 0) {
      if (!query.categories.includes(pattern.category)) return false;
    }

    // Type filter
    if (query.types && query.types.length > 0) {
      if (!query.types.includes(pattern.type)) return false;
    }

    // Domain filter
    if (query.domains && query.domains.length > 0) {
      if (!query.domains.includes(pattern.domain)) return false;
    }

    // Tag filter
    if (query.tags && query.tags.length > 0) {
      const patternTags = new Set(pattern.metadata.tags.map((t) => t.toLowerCase()));
      if (!query.tags.some((t) => patternTags.has(t.toLowerCase()))) return false;
    }

    // Language filter
    if (query.language && pattern.content.language !== query.language) {
      return false;
    }

    // Framework filter
    if (query.framework && pattern.content.framework !== query.framework) {
      return false;
    }

    // Quality filter
    if (query.minQuality) {
      const qualityOrder = [
        PatternQuality.UNVERIFIED,
        PatternQuality.LOW,
        PatternQuality.MEDIUM,
        PatternQuality.HIGH,
        PatternQuality.CURATED,
      ];
      const minIndex = qualityOrder.indexOf(query.minQuality);
      const patternIndex = qualityOrder.indexOf(pattern.quality.level);
      if (patternIndex < minIndex) return false;
    }

    // Success rate filter
    if (query.minSuccessRate !== undefined) {
      if (pattern.quality.successRate < query.minSuccessRate) return false;
    }

    // Usage count filter
    if (query.minUsageCount !== undefined) {
      if (pattern.quality.usageCount < query.minUsageCount) return false;
    }

    return true;
  }

  /**
   * Simple text matching score
   */
  private textMatch(pattern: SharedPattern, query: string): number {
    const queryLower = query.toLowerCase();
    const words = queryLower.split(/\s+/);
    let score = 0;

    // Check name
    if (pattern.metadata.name?.toLowerCase().includes(queryLower)) {
      score += 1;
    }

    // Check description
    if (pattern.metadata.description?.toLowerCase().includes(queryLower)) {
      score += 0.5;
    }

    // Check tags
    for (const tag of pattern.metadata.tags) {
      if (tag.toLowerCase().includes(queryLower)) {
        score += 0.3;
      }
    }

    // Check content
    const contentLower = pattern.content.raw.toLowerCase();
    for (const word of words) {
      if (word.length > 2 && contentLower.includes(word)) {
        score += 0.1;
      }
    }

    // Normalize
    return Math.min(1, score);
  }

  /**
   * Generate match reason string
   */
  private generateMatchReason(
    similarity: number,
    textScore: number,
    query: PatternQuery
  ): string {
    const reasons: string[] = [];

    if (similarity > 0) {
      reasons.push(`Vector similarity: ${(similarity * 100).toFixed(1)}%`);
    }

    if (textScore > 0) {
      reasons.push(`Text match: ${(textScore * 100).toFixed(1)}%`);
    }

    if (query.categories?.length) {
      reasons.push(`Category filter: ${query.categories.join(', ')}`);
    }

    if (query.tags?.length) {
      reasons.push(`Tag filter: ${query.tags.join(', ')}`);
    }

    return reasons.join('; ') || 'Matched filters';
  }
}

// ============================================
// Factory Functions
// ============================================

/**
 * Create a new pattern index
 */
export function createPatternIndex(
  config?: Partial<PatternIndexConfig>
): PatternIndex {
  return new PatternIndex(config);
}
