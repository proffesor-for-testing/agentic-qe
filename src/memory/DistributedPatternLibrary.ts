/**
 * DistributedPatternLibrary - Distributed Pattern Storage with Eventual Consistency
 *
 * Features:
 * - Vector clock-based versioning for distributed consistency
 * - Eventual consistency model with conflict resolution
 * - Pattern CRUD operations with distributed coordination
 * - Compression for large patterns (>10KB)
 * - High-performance pattern lookup (<100ms p99)
 *
 * @module memory/DistributedPatternLibrary
 * @version 1.0.0
 */

import { TestPattern, PatternStoreConfig } from '../core/memory/IPatternStore';
import { CompressionManager } from '../core/memory/CompressionManager';
import * as crypto from 'crypto';

/**
 * Vector clock for distributed versioning
 * Maps agent ID to logical timestamp
 */
export interface VectorClock {
  [agentId: string]: number;
}

/**
 * Versioned pattern with vector clock
 */
export interface VersionedPattern {
  pattern: TestPattern;
  vectorClock: VectorClock;
  checksum: string;
  compressedContent?: string;
  isCompressed: boolean;
  createdBy: string;
  updatedAt: number;
}

/**
 * Conflict resolution strategy
 */
export enum ConflictResolution {
  LAST_WRITE_WINS = 'last_write_wins',
  HIGHEST_CONFIDENCE = 'highest_confidence',
  MOST_USAGE = 'most_usage',
  VECTOR_CLOCK = 'vector_clock'
}

/**
 * Pattern library statistics
 */
export interface DistributedPatternStats {
  totalPatterns: number;
  compressedPatterns: number;
  averageCompressionRatio: number;
  vectorClockSize: number;
  conflictsResolved: number;
  lastSyncTimestamp: number;
}

/**
 * Configuration for distributed pattern library
 */
export interface DistributedPatternConfig extends PatternStoreConfig {
  /** Agent ID for this instance */
  agentId: string;
  /** Compression threshold in bytes (default: 10KB) */
  compressionThreshold?: number;
  /** Conflict resolution strategy */
  conflictResolution?: ConflictResolution;
  /** Enable automatic compression */
  autoCompress?: boolean;
}

/**
 * DistributedPatternLibrary - Manages distributed pattern storage with eventual consistency
 *
 * This class provides:
 * - Vector clock-based versioning for tracking distributed updates
 * - Automatic conflict resolution using configurable strategies
 * - Pattern compression for efficient storage and network transfer
 * - Checksum validation for data integrity
 * - High-performance pattern lookup with caching
 */
export class DistributedPatternLibrary {
  private patterns: Map<string, VersionedPattern>;
  private vectorClock: VectorClock;
  private compression: CompressionManager;
  private config: DistributedPatternConfig;
  private conflictsResolved: number;
  private lastSyncTimestamp: number;
  private lookupCache: Map<string, { pattern: VersionedPattern; timestamp: number }>;
  private readonly CACHE_TTL = 5000; // 5 seconds cache TTL
  private readonly COMPRESSION_THRESHOLD: number;

  constructor(config: DistributedPatternConfig) {
    this.config = config;
    this.patterns = new Map();
    this.vectorClock = { [config.agentId]: 0 };
    this.compression = new CompressionManager();
    this.conflictsResolved = 0;
    this.lastSyncTimestamp = Date.now();
    this.lookupCache = new Map();
    this.COMPRESSION_THRESHOLD = config.compressionThreshold || 10240; // 10KB default
  }

  /**
   * Initialize the pattern library
   */
  async initialize(): Promise<void> {
    // Clear cache and reset state
    this.lookupCache.clear();
    this.lastSyncTimestamp = Date.now();
  }

  /**
   * Store a pattern with vector clock versioning
   */
  async storePattern(pattern: TestPattern, sourceAgentId?: string): Promise<void> {
    const agentId = sourceAgentId || this.config.agentId;

    // Increment vector clock for this agent
    this.vectorClock[agentId] = (this.vectorClock[agentId] || 0) + 1;

    // Create checksum for integrity validation
    const patternJson = JSON.stringify(pattern);
    const checksum = crypto.createHash('sha256').update(patternJson).digest('hex');

    // Compress if needed
    let compressedContent: string | undefined;
    let isCompressed = false;

    if (this.config.autoCompress && this.compression.shouldCompress(patternJson, this.COMPRESSION_THRESHOLD)) {
      compressedContent = await this.compression.compress(patternJson);
      isCompressed = true;
    }

    const versionedPattern: VersionedPattern = {
      pattern,
      vectorClock: { ...this.vectorClock },
      checksum,
      compressedContent,
      isCompressed,
      createdBy: agentId,
      updatedAt: Date.now()
    };

    // Check for conflicts if pattern already exists
    const existing = this.patterns.get(pattern.id);
    if (existing) {
      const resolved = await this.resolveConflict(existing, versionedPattern);
      this.patterns.set(pattern.id, resolved);
      this.conflictsResolved++;
    } else {
      this.patterns.set(pattern.id, versionedPattern);
    }

    // Invalidate cache for this pattern
    this.lookupCache.delete(pattern.id);
  }

  /**
   * Retrieve a pattern by ID with caching
   */
  async getPattern(id: string): Promise<TestPattern | null> {
    const startTime = Date.now();

    // Check cache first
    const cached = this.lookupCache.get(id);
    if (cached && (Date.now() - cached.timestamp) < this.CACHE_TTL) {
      return this.decompressPattern(cached.pattern);
    }

    // Fetch from storage
    const versionedPattern = this.patterns.get(id);
    if (!versionedPattern) {
      return null;
    }

    // Validate checksum
    const isValid = await this.validateChecksum(versionedPattern);
    if (!isValid) {
      throw new Error(`Checksum validation failed for pattern: ${id}`);
    }

    // Update cache
    this.lookupCache.set(id, {
      pattern: versionedPattern,
      timestamp: Date.now()
    });

    // Cleanup old cache entries
    this.cleanupCache();

    const lookupTime = Date.now() - startTime;
    if (lookupTime > 100) {
      console.warn(`Pattern lookup exceeded 100ms threshold: ${lookupTime}ms for pattern ${id}`);
    }

    return this.decompressPattern(versionedPattern);
  }

  /**
   * Update an existing pattern
   */
  async updatePattern(pattern: TestPattern): Promise<void> {
    const existing = this.patterns.get(pattern.id);
    if (!existing) {
      throw new Error(`Pattern not found: ${pattern.id}`);
    }

    await this.storePattern(pattern);
  }

  /**
   * Delete a pattern
   */
  async deletePattern(id: string): Promise<boolean> {
    const deleted = this.patterns.delete(id);
    if (deleted) {
      this.lookupCache.delete(id);
    }
    return deleted;
  }

  /**
   * Get all patterns matching a filter
   */
  async getPatterns(filter?: {
    type?: string;
    domain?: string;
    framework?: string;
    minConfidence?: number;
  }): Promise<TestPattern[]> {
    const patterns: TestPattern[] = [];

    for (const versionedPattern of Array.from(this.patterns.values())) {
      const pattern = await this.decompressPattern(versionedPattern);

      // Apply filters
      if (filter) {
        if (filter.type && pattern.type !== filter.type) continue;
        if (filter.domain && pattern.domain !== filter.domain) continue;
        if (filter.framework && pattern.framework !== filter.framework) continue;
        if (filter.minConfidence && (pattern.coverage || 0) < filter.minConfidence) continue;
      }

      patterns.push(pattern);
    }

    return patterns;
  }

  /**
   * Merge patterns from another agent with conflict resolution
   */
  async mergePatterns(remotePatterns: VersionedPattern[]): Promise<number> {
    let mergedCount = 0;

    for (const remotePattern of remotePatterns) {
      const localPattern = this.patterns.get(remotePattern.pattern.id);

      if (!localPattern) {
        // New pattern, just add it
        this.patterns.set(remotePattern.pattern.id, remotePattern);
        mergedCount++;
      } else {
        // Resolve conflict
        const resolved = await this.resolveConflict(localPattern, remotePattern);
        if (resolved !== localPattern) {
          this.patterns.set(remotePattern.pattern.id, resolved);
          this.conflictsResolved++;
          mergedCount++;
        }
      }

      // Merge vector clocks
      this.mergeVectorClocks(remotePattern.vectorClock);
    }

    this.lastSyncTimestamp = Date.now();
    return mergedCount;
  }

  /**
   * Get library statistics
   */
  async getStats(): Promise<DistributedPatternStats> {
    let compressedCount = 0;
    const compressionRatios: number[] = [];

    for (const versionedPattern of Array.from(this.patterns.values())) {
      if (versionedPattern.isCompressed && versionedPattern.compressedContent) {
        compressedCount++;
        const originalSize = JSON.stringify(versionedPattern.pattern).length;
        const compressedSize = versionedPattern.compressedContent.length;
        compressionRatios.push(compressedSize / originalSize);
      }
    }

    const averageCompressionRatio = compressionRatios.length > 0
      ? compressionRatios.reduce((a, b) => a + b, 0) / compressionRatios.length
      : 0;

    return {
      totalPatterns: this.patterns.size,
      compressedPatterns: compressedCount,
      averageCompressionRatio,
      vectorClockSize: Object.keys(this.vectorClock).length,
      conflictsResolved: this.conflictsResolved,
      lastSyncTimestamp: this.lastSyncTimestamp
    };
  }

  /**
   * Export all patterns for replication
   */
  async exportPatterns(): Promise<VersionedPattern[]> {
    return Array.from(this.patterns.values());
  }

  /**
   * Clear all patterns
   */
  async clear(): Promise<void> {
    this.patterns.clear();
    this.lookupCache.clear();
    this.vectorClock = { [this.config.agentId]: 0 };
    this.conflictsResolved = 0;
  }

  /**
   * Resolve conflict between two versioned patterns
   */
  private async resolveConflict(
    local: VersionedPattern,
    remote: VersionedPattern
  ): Promise<VersionedPattern> {
    const strategy = this.config.conflictResolution || ConflictResolution.VECTOR_CLOCK;

    switch (strategy) {
      case ConflictResolution.LAST_WRITE_WINS:
        return local.updatedAt > remote.updatedAt ? local : remote;

      case ConflictResolution.HIGHEST_CONFIDENCE:
        const localConfidence = local.pattern.coverage || 0;
        const remoteConfidence = remote.pattern.coverage || 0;
        return localConfidence > remoteConfidence ? local : remote;

      case ConflictResolution.MOST_USAGE:
        const localUsage = local.pattern.usageCount || 0;
        const remoteUsage = remote.pattern.usageCount || 0;
        return localUsage > remoteUsage ? local : remote;

      case ConflictResolution.VECTOR_CLOCK:
      default:
        // Use vector clock comparison
        const comparison = this.compareVectorClocks(local.vectorClock, remote.vectorClock);
        if (comparison === 1) return local;
        if (comparison === -1) return remote;
        // Concurrent updates - use highest confidence as tiebreaker
        return (local.pattern.coverage || 0) > (remote.pattern.coverage || 0) ? local : remote;
    }
  }

  /**
   * Compare two vector clocks
   * Returns: 1 if v1 > v2, -1 if v1 < v2, 0 if concurrent
   */
  private compareVectorClocks(v1: VectorClock, v2: VectorClock): number {
    const allAgents = new Set([...Object.keys(v1), ...Object.keys(v2)]);
    let v1Greater = false;
    let v2Greater = false;

    for (const agent of Array.from(allAgents)) {
      const t1 = v1[agent] || 0;
      const t2 = v2[agent] || 0;

      if (t1 > t2) v1Greater = true;
      if (t2 > t1) v2Greater = true;
    }

    if (v1Greater && !v2Greater) return 1;
    if (v2Greater && !v1Greater) return -1;
    return 0; // Concurrent
  }

  /**
   * Merge remote vector clock into local
   */
  private mergeVectorClocks(remoteClock: VectorClock): void {
    for (const [agent, timestamp] of Object.entries(remoteClock)) {
      this.vectorClock[agent] = Math.max(this.vectorClock[agent] || 0, timestamp);
    }
  }

  /**
   * Validate pattern checksum
   */
  private async validateChecksum(versionedPattern: VersionedPattern): Promise<boolean> {
    const pattern = versionedPattern.isCompressed && versionedPattern.compressedContent
      ? JSON.parse(await this.compression.decompress(versionedPattern.compressedContent))
      : versionedPattern.pattern;

    const patternJson = JSON.stringify(pattern);
    const checksum = crypto.createHash('sha256').update(patternJson).digest('hex');

    return checksum === versionedPattern.checksum;
  }

  /**
   * Decompress pattern if needed
   */
  private async decompressPattern(versionedPattern: VersionedPattern): Promise<TestPattern> {
    if (!versionedPattern.isCompressed || !versionedPattern.compressedContent) {
      return versionedPattern.pattern;
    }

    const decompressed = await this.compression.decompress(versionedPattern.compressedContent);
    return JSON.parse(decompressed);
  }

  /**
   * Cleanup old cache entries
   */
  private cleanupCache(): void {
    const now = Date.now();
    const entriesToDelete: string[] = [];

    for (const [id, cached] of Array.from(this.lookupCache.entries())) {
      if (now - cached.timestamp > this.CACHE_TTL) {
        entriesToDelete.push(id);
      }
    }

    for (const id of entriesToDelete) {
      this.lookupCache.delete(id);
    }
  }
}
