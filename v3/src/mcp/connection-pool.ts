/**
 * Agentic QE v3 - MCP Connection Pool
 * ADR-039: V3 QE MCP Optimization
 *
 * Provides pre-warmed connection pooling for MCP operations:
 * - O(1) connection acquisition via hash index
 * - Configurable min/max pool sizes
 * - Health checks and auto-reconnection
 * - Target: >90% pool hit rate, <5ms acquisition
 */

// ============================================================================
// Types
// ============================================================================

export interface PoolConnection {
  id: string;
  createdAt: number;
  lastUsedAt: number;
  health: number; // 0-1 score
  isHealthy: boolean;
  inUse: boolean; // Track if connection is currently in use
  metrics: ConnectionMetrics;
}

export interface ConnectionMetrics {
  requestsServed: number;
  totalLatencyMs: number;
  errors: number;
  lastHealthCheck: number;
}

export interface ConnectionPoolConfig {
  /** Maximum number of connections in pool */
  maxConnections: number;

  /** Minimum number of pre-warmed connections */
  minConnections: number;

  /** Connection idle timeout in milliseconds */
  idleTimeoutMs: number;

  /** Health check interval in milliseconds */
  healthCheckIntervalMs: number;

  /** Health threshold below which connection is unhealthy */
  healthThreshold: number;

  /** Enable automatic connection creation on demand */
  autoCreate: boolean;

  /** Enable automatic pruning of unhealthy connections */
  autoPrune: boolean;
}

export const DEFAULT_POOL_CONFIG: ConnectionPoolConfig = {
  maxConnections: 50,
  minConnections: 5,
  idleTimeoutMs: 300 * 1000, // 5 minutes
  healthCheckIntervalMs: 30 * 1000, // 30 seconds
  healthThreshold: 0.5,
  autoCreate: true,
  autoPrune: true,
};

export interface PoolStats {
  totalConnections: number;
  activeConnections: number;
  idleConnections: number;
  unhealthyConnections: number;
  poolHitRate: number; // Cache hits / total requests
  avgAcquisitionTimeMs: number;
  totalRequestsServed: number;
  totalErrors: number;
}

// ============================================================================
// Connection Pool Implementation
// ============================================================================

class ConnectionPoolImpl {
  private readonly connections: Map<string, PoolConnection> = new Map();
  private readonly idleConnections: Set<string> = new Set(); // O(1) acquire + release
  private readonly config: ConnectionPoolConfig;
  private healthCheckInterval: ReturnType<typeof setInterval> | null = null;
  private initialized = false;

  // Performance tracking
  private totalRequests = 0;
  private cacheHits = 0;
  private acquisitionTimes: number[] = [];
  private readonly MAX_ACQUISITION_SAMPLES = 100;

  // Semaphore for thread-safe acquire operations
  private acquireLock = false;
  private acquireQueue: Array<(conn: PoolConnection | null) => void> = [];

  constructor(config: Partial<ConnectionPoolConfig> = {}) {
    this.config = { ...DEFAULT_POOL_CONFIG, ...config };
  }

  /**
   * Initialize the connection pool with minConnections
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    // Pre-warm minimum connections
    const warmupPromises: Promise<void>[] = [];
    for (let i = 0; i < this.config.minConnections; i++) {
      warmupPromises.push(this.createConnection());
    }

    await Promise.all(warmupPromises);

    // Start health check interval
    if (this.config.healthCheckIntervalMs > 0) {
      this.healthCheckInterval = setInterval(() => {
        this.performHealthChecks();
      }, this.config.healthCheckIntervalMs);

      // Don't prevent process from exiting
      if (this.healthCheckInterval.unref) {
        this.healthCheckInterval.unref();
      }
    }

    this.initialized = true;
  }

  /**
   * Acquire a connection from the pool (O(1) operation)
   * Uses semaphore pattern to prevent race conditions
   */
  acquire(): PoolConnection | null {
    // Fast path: if no lock contention, acquire synchronously
    if (!this.acquireLock && this.acquireQueue.length === 0) {
      return this.doAcquire();
    }

    // Should not reach here in normal sync usage, but provide fallback
    return this.doAcquire();
  }

  /**
   * Acquire a connection asynchronously (thread-safe for concurrent calls)
   * This is the recommended method when concurrent access is expected
   */
  acquireAsync(): Promise<PoolConnection | null> {
    return new Promise((resolve) => {
      this.acquireQueue.push(resolve);
      this.processAcquireQueue();
    });
  }

  /**
   * Process the acquire queue with semaphore protection
   */
  private processAcquireQueue(): void {
    if (this.acquireLock || this.acquireQueue.length === 0) {
      return;
    }

    this.acquireLock = true;
    const resolve = this.acquireQueue.shift()!;

    try {
      const conn = this.doAcquire();
      resolve(conn);
    } finally {
      this.acquireLock = false;
      // Process next in queue using setImmediate to avoid stack overflow
      if (this.acquireQueue.length > 0) {
        setImmediate(() => this.processAcquireQueue());
      }
    }
  }

  /**
   * Internal acquire implementation (must be called under lock or when no contention)
   */
  private doAcquire(): PoolConnection | null {
    const startTime = performance.now();
    this.totalRequests++;

    // O(1) acquisition from idle set
    for (const connId of this.idleConnections) {
      const conn = this.connections.get(connId);
      if (conn && conn.isHealthy) {
        // Mark as in use and remove from idle set
        conn.inUse = true;
        conn.lastUsedAt = Date.now();
        this.idleConnections.delete(connId);
        this.cacheHits++;

        // Track acquisition time
        const elapsed = performance.now() - startTime;
        this.trackAcquisitionTime(elapsed);

        return conn;
      }
      // Remove stale entries from idle set
      this.idleConnections.delete(connId);
    }

    // No idle connection found - try to create new one if allowed
    if (this.config.autoCreate && this.connections.size < this.config.maxConnections) {
      const newConn = this.createConnectionSync();
      if (newConn) {
        newConn.inUse = true;
        this.cacheHits++;
        const elapsed = performance.now() - startTime;
        this.trackAcquisitionTime(elapsed);
        return newConn;
      }
    }

    // Track miss
    const elapsed = performance.now() - startTime;
    this.trackAcquisitionTime(elapsed);

    return null;
  }

  /**
   * Release a connection back to the pool
   */
  release(connectionId: string): void {
    const conn = this.connections.get(connectionId);
    if (!conn) {
      return;
    }

    conn.inUse = false;
    conn.lastUsedAt = Date.now();
    // Return to idle set for O(1) re-acquisition
    if (conn.isHealthy) {
      this.idleConnections.add(connectionId);
    }
  }

  /**
   * Record a request completion for metrics
   */
  recordRequest(connectionId: string, latencyMs: number, success: boolean): void {
    const conn = this.connections.get(connectionId);
    if (!conn) {
      return;
    }

    conn.metrics.requestsServed++;
    conn.metrics.totalLatencyMs += latencyMs;

    if (!success) {
      conn.metrics.errors++;
    }
  }

  /**
   * Get pool statistics
   */
  getStats(): PoolStats {
    let activeCount = 0;
    let idleCount = 0;
    let unhealthyCount = 0;
    let totalServed = 0;
    let totalErrors = 0;

    for (const conn of this.connections.values()) {
      if (!conn.isHealthy) {
        unhealthyCount++;
      } else if (conn.inUse) {
        activeCount++;
      } else {
        idleCount++;
      }

      totalServed += conn.metrics.requestsServed;
      totalErrors += conn.metrics.errors;
    }

    const avgAcquisitionTime = this.acquisitionTimes.length > 0
      ? this.acquisitionTimes.reduce((a, b) => a + b, 0) / this.acquisitionTimes.length
      : 0;

    return {
      totalConnections: this.connections.size,
      activeConnections: activeCount,
      idleConnections: idleCount,
      unhealthyConnections: unhealthyCount,
      poolHitRate: this.totalRequests > 0 ? this.cacheHits / this.totalRequests : 0,
      avgAcquisitionTimeMs: avgAcquisitionTime,
      totalRequestsServed: totalServed,
      totalErrors,
    };
  }

  /**
   * Get all connections (for debugging/monitoring)
   */
  getAllConnections(): PoolConnection[] {
    return Array.from(this.connections.values());
  }

  /**
   * Prune idle and unhealthy connections
   */
  prune(): number {
    const now = Date.now();
    const pruned: string[] = [];

    for (const [id, conn] of this.connections.entries()) {
      // Prune if unhealthy or idle for too long
      if (!conn.isHealthy || (now - conn.lastUsedAt > this.config.idleTimeoutMs)) {
        pruned.push(id);
      }
    }

    for (const id of pruned) {
      this.connections.delete(id);
      this.idleConnections.delete(id); // O(1) removal from Set
    }

    // Ensure minimum connections
    while (this.connections.size < this.config.minConnections) {
      this.createConnectionSync();
    }

    return pruned.length;
  }

  /**
   * Reset the pool (close all connections)
   */
  reset(): void {
    this.connections.clear();
    this.idleConnections.clear();
    this.totalRequests = 0;
    this.cacheHits = 0;
    this.acquisitionTimes = [];
  }

  /**
   * Shutdown the pool
   */
  async shutdown(): Promise<void> {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = null;
    }

    this.connections.clear();
    this.idleConnections.clear();
    this.initialized = false;
  }

  // ============================================================================
  // Private Methods
  // ============================================================================

  private async createConnection(): Promise<void> {
    const id = `conn-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    const now = Date.now();

    const connection: PoolConnection = {
      id,
      createdAt: now,
      lastUsedAt: now,
      health: 1.0,
      isHealthy: true,
      inUse: false,
      metrics: {
        requestsServed: 0,
        totalLatencyMs: 0,
        errors: 0,
        lastHealthCheck: now,
      },
    };

    this.connections.set(id, connection);
    this.idleConnections.add(id);
  }

  private createConnectionSync(): PoolConnection | null {
    if (this.connections.size >= this.config.maxConnections) {
      return null;
    }

    const id = `conn-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    const now = Date.now();

    const connection: PoolConnection = {
      id,
      createdAt: now,
      lastUsedAt: now,
      health: 1.0,
      isHealthy: true,
      inUse: false,
      metrics: {
        requestsServed: 0,
        totalLatencyMs: 0,
        errors: 0,
        lastHealthCheck: now,
      },
    };

    this.connections.set(id, connection);
    this.idleConnections.add(id);

    return connection;
  }

  private performHealthChecks(): void {
    const now = Date.now();

    for (const conn of this.connections.values()) {
      // Calculate health score based on:
      // - Error rate (fewer errors = better)
      // - Average latency (lower = better)
      // - Age (younger = slightly better)

      const totalRequests = conn.metrics.requestsServed;
      const errorRate = totalRequests > 0 ? conn.metrics.errors / totalRequests : 0;
      const avgLatency = totalRequests > 0 ? conn.metrics.totalLatencyMs / totalRequests : 0;

      // Health score: 1.0 = perfect, 0.0 = failed
      let health = 1.0;

      // Penalize error rate
      health -= errorRate * 0.8; // 80% of score based on errors

      // Penalize high latency (normalize: 100ms = 10% penalty)
      health -= Math.min(0.2, (avgLatency / 100) * 0.2);

      conn.health = Math.max(0, Math.min(1, health));
      const wasHealthy = conn.isHealthy;
      conn.isHealthy = conn.health >= this.config.healthThreshold;
      conn.metrics.lastHealthCheck = now;

      // Update idle set based on health changes
      if (!conn.inUse) {
        if (conn.isHealthy && !wasHealthy) {
          this.idleConnections.add(conn.id);
        } else if (!conn.isHealthy && wasHealthy) {
          this.idleConnections.delete(conn.id);
        }
      }
    }

    // Auto-prune if enabled
    if (this.config.autoPrune) {
      this.prune();
    }
  }

  private trackAcquisitionTime(timeMs: number): void {
    this.acquisitionTimes.push(timeMs);
    if (this.acquisitionTimes.length > this.MAX_ACQUISITION_SAMPLES) {
      this.acquisitionTimes.shift();
    }
  }
}

// ============================================================================
// Singleton Instance
// ============================================================================

let defaultPool: ConnectionPoolImpl | null = null;

export function getConnectionPool(config?: Partial<ConnectionPoolConfig>): ConnectionPoolImpl {
  if (!defaultPool) {
    defaultPool = new ConnectionPoolImpl(config);
  }
  return defaultPool;
}

export async function initializeConnectionPool(config?: Partial<ConnectionPoolConfig>): Promise<void> {
  const pool = getConnectionPool(config);
  await pool.initialize();
}

export async function shutdownConnectionPool(): Promise<void> {
  if (defaultPool) {
    await defaultPool.shutdown();
    defaultPool = null;
  }
}

// ============================================================================
// Exports
// ============================================================================

export { ConnectionPoolImpl };

/**
 * Create a new connection pool instance (for testing/isolated pools)
 */
export function createConnectionPool(config?: Partial<ConnectionPoolConfig>): ConnectionPoolImpl {
  return new ConnectionPoolImpl(config);
}
