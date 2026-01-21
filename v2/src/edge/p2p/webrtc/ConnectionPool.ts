/**
 * Connection Pool for WebRTC Peer Connections
 *
 * Manages a pool of active peer connections with connection limits,
 * eviction policies, peer prioritization, and health monitoring.
 *
 * @module edge/p2p/webrtc/ConnectionPool
 * @version 1.0.0
 */

import {
  PeerId,
  PeerConnection,
  ConnectionState,
  ConnectionPoolConfig,
  ConnectionPoolStats,
  ConnectionQuality,
  EvictionPolicy,
  DEFAULT_POOL_CONFIG,
  createDefaultConnectionQuality,
} from './types';

/**
 * Pool entry with usage tracking
 */
interface PoolEntry {
  connection: PeerConnection;
  lastUsedAt: number;
  usageCount: number;
  priority: number;
  bytesReceived: number;
  bytesSent: number;
}

/**
 * Health check result
 */
interface HealthCheckResult {
  peerId: PeerId;
  isHealthy: boolean;
  state: ConnectionState;
  quality: ConnectionQuality;
  lastActivity: number;
  reason?: string;
}

/**
 * Connection Pool - Manages pool of WebRTC peer connections
 *
 * @example
 * ```typescript
 * const pool = new ConnectionPool({
 *   maxConnections: 20,
 *   idleTimeout: 60000,
 *   evictionPolicy: EvictionPolicy.LRU,
 * });
 *
 * // Add connection to pool
 * pool.add(connection);
 *
 * // Get connection with usage tracking
 * const conn = pool.get('peer-123');
 *
 * // Check pool health
 * const unhealthy = pool.checkHealth();
 *
 * // Get pool statistics
 * const stats = pool.getStats();
 * ```
 */
export class ConnectionPool {
  private readonly config: Required<ConnectionPoolConfig>;
  private readonly entries: Map<PeerId, PoolEntry> = new Map();
  private healthCheckInterval: ReturnType<typeof setInterval> | null = null;
  private readonly healthCheckCallbacks: Set<(results: HealthCheckResult[]) => void> = new Set();
  private readonly evictionCallbacks: Set<(peerId: PeerId, reason: string) => void> = new Set();
  private readonly createdAt: number = Date.now();
  private totalBytesSent: number = 0;
  private totalBytesReceived: number = 0;

  /**
   * Create a new ConnectionPool instance
   *
   * @param config - Pool configuration
   */
  constructor(config: Partial<ConnectionPoolConfig> = {}) {
    this.config = {
      ...DEFAULT_POOL_CONFIG,
      ...config,
      priorityFunction: config.priorityFunction ?? this.defaultPriorityFunction.bind(this),
    } as Required<ConnectionPoolConfig>;

    // Start health check interval
    if (this.config.healthCheckInterval && this.config.healthCheckInterval > 0) {
      this.startHealthChecking();
    }
  }

  /**
   * Get pool configuration
   */
  public getConfig(): Readonly<ConnectionPoolConfig> {
    return { ...this.config };
  }

  /**
   * Get current pool size
   */
  public size(): number {
    return this.entries.size;
  }

  /**
   * Check if pool is full
   */
  public isFull(): boolean {
    return this.entries.size >= this.config.maxConnections;
  }

  /**
   * Check if pool has connection for peer
   *
   * @param peerId - Peer identifier
   */
  public has(peerId: PeerId): boolean {
    return this.entries.has(peerId);
  }

  /**
   * Add connection to pool
   *
   * @param connection - Peer connection to add
   * @returns true if added, false if pool is full
   */
  public add(connection: PeerConnection): boolean {
    // Check if already exists
    if (this.entries.has(connection.id)) {
      this.update(connection);
      return true;
    }

    // Check if pool is full
    if (this.isFull()) {
      // Try to evict a connection
      if (!this.evictOne()) {
        return false;
      }
    }

    const entry: PoolEntry = {
      connection,
      lastUsedAt: Date.now(),
      usageCount: 0,
      priority: this.config.priorityFunction!(connection),
      bytesReceived: 0,
      bytesSent: 0,
    };

    this.entries.set(connection.id, entry);
    return true;
  }

  /**
   * Get connection from pool (updates usage tracking)
   *
   * @param peerId - Peer identifier
   * @returns Peer connection or undefined
   */
  public get(peerId: PeerId): PeerConnection | undefined {
    const entry = this.entries.get(peerId);
    if (!entry) {
      return undefined;
    }

    // Update usage tracking
    entry.lastUsedAt = Date.now();
    entry.usageCount++;

    return entry.connection;
  }

  /**
   * Get connection without updating usage tracking
   *
   * @param peerId - Peer identifier
   * @returns Peer connection or undefined
   */
  public peek(peerId: PeerId): PeerConnection | undefined {
    return this.entries.get(peerId)?.connection;
  }

  /**
   * Update connection in pool
   *
   * @param connection - Updated peer connection
   */
  public update(connection: PeerConnection): void {
    const entry = this.entries.get(connection.id);
    if (!entry) {
      return;
    }

    entry.connection = connection;
    entry.priority = this.config.priorityFunction!(connection);
  }

  /**
   * Remove connection from pool
   *
   * @param peerId - Peer identifier
   * @returns Removed connection or undefined
   */
  public remove(peerId: PeerId): PeerConnection | undefined {
    const entry = this.entries.get(peerId);
    if (!entry) {
      return undefined;
    }

    // Update aggregate stats
    this.totalBytesSent += entry.bytesSent;
    this.totalBytesReceived += entry.bytesReceived;

    this.entries.delete(peerId);
    return entry.connection;
  }

  /**
   * Get all connections
   */
  public getAll(): PeerConnection[] {
    return Array.from(this.entries.values()).map((entry) => entry.connection);
  }

  /**
   * Get all peer IDs
   */
  public getAllPeerIds(): PeerId[] {
    return Array.from(this.entries.keys());
  }

  /**
   * Get connections by state
   *
   * @param state - Connection state to filter by
   */
  public getByState(state: ConnectionState): PeerConnection[] {
    return Array.from(this.entries.values())
      .filter((entry) => entry.connection.state === state)
      .map((entry) => entry.connection);
  }

  /**
   * Get connections sorted by priority (highest first)
   */
  public getByPriority(): PeerConnection[] {
    return Array.from(this.entries.values())
      .sort((a, b) => b.priority - a.priority)
      .map((entry) => entry.connection);
  }

  /**
   * Get connections sorted by latency (lowest first)
   */
  public getByLatency(): PeerConnection[] {
    return Array.from(this.entries.values())
      .sort((a, b) => a.connection.quality.rttMs - b.connection.quality.rttMs)
      .map((entry) => entry.connection);
  }

  /**
   * Get connections sorted by last used (most recent first)
   */
  public getByRecentUsage(): PeerConnection[] {
    return Array.from(this.entries.values())
      .sort((a, b) => b.lastUsedAt - a.lastUsedAt)
      .map((entry) => entry.connection);
  }

  /**
   * Record bytes sent for a connection
   *
   * @param peerId - Peer identifier
   * @param bytes - Number of bytes sent
   */
  public recordBytesSent(peerId: PeerId, bytes: number): void {
    const entry = this.entries.get(peerId);
    if (entry) {
      entry.bytesSent += bytes;
      entry.lastUsedAt = Date.now();
    }
  }

  /**
   * Record bytes received for a connection
   *
   * @param peerId - Peer identifier
   * @param bytes - Number of bytes received
   */
  public recordBytesReceived(peerId: PeerId, bytes: number): void {
    const entry = this.entries.get(peerId);
    if (entry) {
      entry.bytesReceived += bytes;
      entry.lastUsedAt = Date.now();
    }
  }

  /**
   * Evict connections based on eviction policy
   *
   * @param count - Number of connections to evict (default: 1)
   * @returns Number of connections actually evicted
   */
  public evict(count: number = 1): number {
    let evicted = 0;

    for (let i = 0; i < count && this.entries.size > this.config.minConnections!; i++) {
      if (this.evictOne()) {
        evicted++;
      } else {
        break;
      }
    }

    return evicted;
  }

  /**
   * Evict idle connections (exceeded idle timeout)
   *
   * @returns Number of connections evicted
   */
  public evictIdle(): number {
    const now = Date.now();
    const idleTimeout = this.config.idleTimeout!;
    const toEvict: PeerId[] = [];

    this.entries.forEach((entry, peerId) => {
      if (now - entry.lastUsedAt > idleTimeout) {
        toEvict.push(peerId);
      }
    });

    // Respect minimum connections
    const maxEvictions = Math.max(0, this.entries.size - this.config.minConnections!);
    const actualEvictions = toEvict.slice(0, maxEvictions);

    actualEvictions.forEach((peerId) => {
      this.remove(peerId);
      this.notifyEviction(peerId, 'idle-timeout');
    });

    return actualEvictions.length;
  }

  /**
   * Run health check on all connections
   *
   * @returns Array of health check results
   */
  public checkHealth(): HealthCheckResult[] {
    const results: HealthCheckResult[] = [];
    const now = Date.now();

    this.entries.forEach((entry, peerId) => {
      const { connection } = entry;
      let isHealthy = true;
      let reason: string | undefined;

      // Check connection state
      if (
        connection.state === ConnectionState.FAILED ||
        connection.state === ConnectionState.CLOSED
      ) {
        isHealthy = false;
        reason = `Connection in ${connection.state} state`;
      }

      // Check for stale connections
      if (isHealthy && now - connection.lastActivityAt > this.config.idleTimeout! * 2) {
        isHealthy = false;
        reason = 'Connection appears stale';
      }

      // Check for poor quality
      if (isHealthy && connection.quality.packetLossPercent > 30) {
        isHealthy = false;
        reason = `High packet loss: ${connection.quality.packetLossPercent.toFixed(1)}%`;
      }

      results.push({
        peerId,
        isHealthy,
        state: connection.state,
        quality: connection.quality,
        lastActivity: connection.lastActivityAt,
        reason,
      });
    });

    // Notify callbacks
    this.healthCheckCallbacks.forEach((callback) => {
      try {
        callback(results);
      } catch (error) {
        console.error('Health check callback error:', error);
      }
    });

    return results;
  }

  /**
   * Remove unhealthy connections
   *
   * @returns Number of connections removed
   */
  public removeUnhealthy(): number {
    const results = this.checkHealth();
    const unhealthy = results.filter((r) => !r.isHealthy);

    unhealthy.forEach((result) => {
      this.remove(result.peerId);
      this.notifyEviction(result.peerId, result.reason ?? 'unhealthy');
    });

    return unhealthy.length;
  }

  /**
   * Get pool statistics
   */
  public getStats(): ConnectionPoolStats {
    let activeCount = 0;
    let idleCount = 0;
    let failedCount = 0;
    let totalRtt = 0;
    let qualityCount = 0;

    this.entries.forEach((entry) => {
      const { connection } = entry;

      switch (connection.state) {
        case ConnectionState.CONNECTED:
          activeCount++;
          break;
        case ConnectionState.NEW:
        case ConnectionState.DISCONNECTED:
          idleCount++;
          break;
        case ConnectionState.FAILED:
          failedCount++;
          break;
      }

      if (connection.quality.rttMs > 0) {
        totalRtt += connection.quality.rttMs;
        qualityCount++;
      }
    });

    // Calculate aggregate stats from entries
    let currentBytesSent = this.totalBytesSent;
    let currentBytesReceived = this.totalBytesReceived;

    this.entries.forEach((entry) => {
      currentBytesSent += entry.bytesSent;
      currentBytesReceived += entry.bytesReceived;
    });

    const averageQuality: ConnectionQuality | null =
      qualityCount > 0
        ? {
            rttMs: totalRtt / qualityCount,
            packetLossPercent: 0, // Would need to aggregate from entries
            availableBandwidth: 0,
            localCandidateType: 'unknown',
            remoteCandidateType: 'unknown',
            measuredAt: Date.now(),
          }
        : null;

    return {
      totalConnections: this.entries.size,
      activeConnections: activeCount,
      idleConnections: idleCount,
      failedConnections: failedCount,
      averageQuality,
      totalBytesSent: currentBytesSent,
      totalBytesReceived: currentBytesReceived,
      createdAt: this.createdAt,
    };
  }

  /**
   * Register callback for health check results
   *
   * @param callback - Callback function
   * @returns Unsubscribe function
   */
  public onHealthCheck(callback: (results: HealthCheckResult[]) => void): () => void {
    this.healthCheckCallbacks.add(callback);
    return () => this.healthCheckCallbacks.delete(callback);
  }

  /**
   * Register callback for eviction events
   *
   * @param callback - Callback function
   * @returns Unsubscribe function
   */
  public onEviction(callback: (peerId: PeerId, reason: string) => void): () => void {
    this.evictionCallbacks.add(callback);
    return () => this.evictionCallbacks.delete(callback);
  }

  /**
   * Clear all connections from pool
   */
  public clear(): void {
    const peerIds = Array.from(this.entries.keys());

    peerIds.forEach((peerId) => {
      this.remove(peerId);
    });
  }

  /**
   * Destroy pool and release resources
   */
  public destroy(): void {
    this.stopHealthChecking();
    this.clear();
    this.healthCheckCallbacks.clear();
    this.evictionCallbacks.clear();
  }

  // ============================================
  // Private Methods
  // ============================================

  private evictOne(): boolean {
    if (this.entries.size <= this.config.minConnections!) {
      return false;
    }

    const candidate = this.selectEvictionCandidate();
    if (!candidate) {
      return false;
    }

    this.remove(candidate);
    this.notifyEviction(candidate, `eviction-policy-${this.config.evictionPolicy}`);
    return true;
  }

  private selectEvictionCandidate(): PeerId | null {
    if (this.entries.size === 0) {
      return null;
    }

    const entries = Array.from(this.entries.entries());

    switch (this.config.evictionPolicy) {
      case EvictionPolicy.LRU:
        return this.selectLRU(entries);

      case EvictionPolicy.LFU:
        return this.selectLFU(entries);

      case EvictionPolicy.LOWEST_QUALITY:
        return this.selectLowestQuality(entries);

      case EvictionPolicy.OLDEST:
        return this.selectOldest(entries);

      case EvictionPolicy.RANDOM:
        return this.selectRandom(entries);

      default:
        return this.selectLRU(entries);
    }
  }

  private selectLRU(entries: [PeerId, PoolEntry][]): PeerId {
    let oldest = entries[0];

    for (const entry of entries) {
      if (entry[1].lastUsedAt < oldest[1].lastUsedAt) {
        oldest = entry;
      }
    }

    return oldest[0];
  }

  private selectLFU(entries: [PeerId, PoolEntry][]): PeerId {
    let leastUsed = entries[0];

    for (const entry of entries) {
      if (entry[1].usageCount < leastUsed[1].usageCount) {
        leastUsed = entry;
      }
    }

    return leastUsed[0];
  }

  private selectLowestQuality(entries: [PeerId, PoolEntry][]): PeerId {
    let lowestQuality = entries[0];
    let lowestScore = this.calculateQualityScore(lowestQuality[1].connection.quality);

    for (const entry of entries) {
      const score = this.calculateQualityScore(entry[1].connection.quality);
      if (score < lowestScore) {
        lowestScore = score;
        lowestQuality = entry;
      }
    }

    return lowestQuality[0];
  }

  private selectOldest(entries: [PeerId, PoolEntry][]): PeerId {
    let oldest = entries[0];

    for (const entry of entries) {
      if (entry[1].connection.createdAt < oldest[1].connection.createdAt) {
        oldest = entry;
      }
    }

    return oldest[0];
  }

  private selectRandom(entries: [PeerId, PoolEntry][]): PeerId {
    const index = Math.floor(Math.random() * entries.length);
    return entries[index][0];
  }

  private calculateQualityScore(quality: ConnectionQuality): number {
    // Higher score = better quality
    // Consider RTT (lower is better) and packet loss (lower is better)
    const rttScore = quality.rttMs > 0 ? 1000 / quality.rttMs : 100;
    const lossScore = 100 - quality.packetLossPercent;
    const bandwidthScore = quality.availableBandwidth > 0 ? Math.log10(quality.availableBandwidth) : 0;

    return rttScore * 0.4 + lossScore * 0.4 + bandwidthScore * 0.2;
  }

  private defaultPriorityFunction(connection: PeerConnection): number {
    // Default priority based on quality and activity
    const qualityScore = this.calculateQualityScore(connection.quality);
    const activityBonus = Date.now() - connection.lastActivityAt < 60000 ? 10 : 0;

    return qualityScore + activityBonus;
  }

  private startHealthChecking(): void {
    if (this.healthCheckInterval) {
      return;
    }

    this.healthCheckInterval = setInterval(() => {
      this.checkHealth();
      this.evictIdle();
    }, this.config.healthCheckInterval!);
  }

  private stopHealthChecking(): void {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = null;
    }
  }

  private notifyEviction(peerId: PeerId, reason: string): void {
    this.evictionCallbacks.forEach((callback) => {
      try {
        callback(peerId, reason);
      } catch (error) {
        console.error('Eviction callback error:', error);
      }
    });
  }
}

export default ConnectionPool;
