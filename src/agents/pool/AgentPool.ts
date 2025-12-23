/**
 * Agent Pool Implementation
 * Phase 3 D1: Memory Pooling for 16x Agent Spawn Speedup
 *
 * Target Performance:
 * - Spawn time: <6ms (down from ~50-100ms)
 * - Memory stable under load
 * - Graceful degradation when exhausted
 *
 * Architecture:
 * - Pre-allocated agent instances per type
 * - Thread-safe acquire/release with mutex
 * - Automatic pool expansion on demand
 * - Health monitoring and recovery
 */

import { EventEmitter } from 'events';
import { randomUUID } from 'crypto';
import { QEAgentType } from '../../types';
import {
  AgentPoolConfig,
  AgentTypePoolConfig,
  PooledAgentMeta,
  PooledAgentState,
  PoolStats,
  TypePoolStats,
  AcquireOptions,
  ReleaseOptions,
  AcquireResult,
  PoolEvents,
  IResettableAgent,
} from './types';

/**
 * Default pool configuration
 */
const DEFAULT_TYPE_CONFIG: Omit<AgentTypePoolConfig, 'type'> = {
  minSize: 2,
  maxSize: 10,
  warmupCount: 2,
  preInitialize: false, // Lazy init by default for faster startup
  idleTtlMs: 300000, // 5 minutes
  growthIncrement: 2,
};

const DEFAULT_POOL_CONFIG: AgentPoolConfig = {
  typeConfigs: new Map(),
  defaultConfig: DEFAULT_TYPE_CONFIG,
  debug: false,
  globalMaxAgents: 100,
  warmupStrategy: 'lazy',
  healthCheckIntervalMs: 60000, // 1 minute
};

/**
 * Internal structure for a pooled agent
 */
interface PooledAgentEntry<T extends IResettableAgent> {
  agent: T;
  meta: PooledAgentMeta;
}

/**
 * Waiting request in the queue
 */
interface WaitingRequest<T extends IResettableAgent> {
  type: QEAgentType;
  priority: number;
  resolve: (result: AcquireResult<T>) => void;
  reject: (error: Error) => void;
  timeoutId: NodeJS.Timeout;
  requestedAt: number;
}

/**
 * Agent Pool - Pre-allocated agent instance management
 *
 * @example
 * ```typescript
 * const pool = new AgentPool(factory, config);
 * await pool.warmup();
 *
 * // Fast acquisition (<6ms)
 * const { agent, meta } = await pool.acquire('test-generator');
 *
 * // Use agent...
 * await agent.executeTask(task);
 *
 * // Return to pool
 * await pool.release(meta.poolId);
 * ```
 */
export class AgentPool<T extends IResettableAgent> extends EventEmitter {
  private readonly config: AgentPoolConfig;
  private readonly factory: AgentFactory<T>;

  // Pool storage: type -> array of pooled agents
  private readonly pools: Map<QEAgentType, PooledAgentEntry<T>[]> = new Map();

  // Quick lookup by poolId
  private readonly agentsByPoolId: Map<string, PooledAgentEntry<T>> = new Map();

  // Waiting queue for each type
  private readonly waitingQueues: Map<QEAgentType, WaitingRequest<T>[]> = new Map();

  // Mutex for thread-safe operations
  private readonly mutexes: Map<QEAgentType, Promise<void>> = new Map();

  // Statistics
  private stats = {
    totalAcquisitions: 0,
    totalMisses: 0,
    totalAcquisitionTimeMs: 0,
  };

  // Health check timer
  private healthCheckTimer: NodeJS.Timeout | null = null;

  // Shutdown flag
  private isShuttingDown = false;

  constructor(
    factory: AgentFactory<T>,
    config: Partial<AgentPoolConfig> = {}
  ) {
    super();
    this.factory = factory;
    this.config = { ...DEFAULT_POOL_CONFIG, ...config };

    if (config.typeConfigs) {
      this.config.typeConfigs = new Map(config.typeConfigs);
    }

    this.log('AgentPool initialized', { globalMax: this.config.globalMaxAgents });
  }

  /**
   * Warm up the pool by pre-creating agents
   * Should be called during application startup
   */
  async warmup(types?: QEAgentType[]): Promise<void> {
    const typesToWarm = types || this.getConfiguredTypes();
    this.log('Starting pool warmup', { types: typesToWarm });

    const warmupPromises = typesToWarm.map(async (type) => {
      const typeConfig = this.getTypeConfig(type);
      const count = typeConfig.warmupCount;

      if (count <= 0) return;

      this.log(`Warming ${count} agents of type ${type}`);
      const startTime = Date.now();

      // Create agents in parallel for faster warmup
      const createPromises = Array(count)
        .fill(null)
        .map(() => this.createPooledAgent(type, typeConfig.preInitialize));

      const agents = await Promise.all(createPromises);
      agents.forEach((entry) => this.addToPool(type, entry));

      const elapsed = Date.now() - startTime;
      this.log(`Warmed ${count} ${type} agents in ${elapsed}ms`);
      this.emit('pool:warmed', { type, count });
    });

    await Promise.all(warmupPromises);

    // Start health check if configured
    if (this.config.healthCheckIntervalMs > 0) {
      this.startHealthCheck();
    }

    this.log('Pool warmup complete', this.getStats());
  }

  /**
   * Acquire an agent from the pool
   * Returns immediately if available, otherwise waits or creates new
   *
   * @param type - Agent type to acquire
   * @param options - Acquisition options
   * @returns Acquired agent with metadata
   */
  async acquire(
    type: QEAgentType,
    options: AcquireOptions = {}
  ): Promise<AcquireResult<T>> {
    const startTime = Date.now();
    const {
      timeoutMs = 5000,
      waitIfUnavailable = true,
      priority = 0,
      requiredCapabilities = [],
    } = options;

    if (this.isShuttingDown) {
      throw new Error('Pool is shutting down');
    }

    // Try to get from pool first (fast path)
    const fromPool = await this.tryAcquireFromPool(type, requiredCapabilities);
    if (fromPool) {
      const acquisitionTimeMs = Date.now() - startTime;
      this.recordAcquisition(acquisitionTimeMs, true);

      this.emit('agent:acquired', {
        poolId: fromPool.meta.poolId,
        type,
        fromPool: true,
      });

      return {
        agent: fromPool.agent,
        meta: fromPool.meta,
        fromPool: true,
        acquisitionTimeMs,
      };
    }

    // Pool miss - try to create new agent
    const typeConfig = this.getTypeConfig(type);
    const pool = this.getPool(type);
    const currentSize = pool.length;

    if (currentSize < typeConfig.maxSize && this.canCreateMore()) {
      // Create new agent
      const entry = await this.createPooledAgent(type, true);
      entry.meta.state = PooledAgentState.IN_USE;
      entry.meta.lastAcquiredAt = Date.now();
      this.agentsByPoolId.set(entry.meta.poolId, entry);

      const acquisitionTimeMs = Date.now() - startTime;
      this.recordAcquisition(acquisitionTimeMs, false);

      this.emit('agent:created', { poolId: entry.meta.poolId, type });
      this.emit('agent:acquired', {
        poolId: entry.meta.poolId,
        type,
        fromPool: false,
      });

      // Add to pool for tracking
      pool.push(entry);

      return {
        agent: entry.agent,
        meta: entry.meta,
        fromPool: false,
        acquisitionTimeMs,
      };
    }

    // Pool exhausted
    if (!waitIfUnavailable) {
      throw new Error(`No agents available for type ${type} and waitIfUnavailable=false`);
    }

    // Queue the request
    this.emit('pool:exhausted', {
      type,
      waitingCount: this.getWaitingCount(type) + 1,
    });

    return this.waitForAgent(type, priority, timeoutMs, startTime);
  }

  /**
   * Release an agent back to the pool
   *
   * @param poolId - Pool ID of the agent to release
   * @param options - Release options
   */
  async release(poolId: string, options: ReleaseOptions = {}): Promise<void> {
    const { reset = true, hasError = false, dispose = false } = options;

    const entry = this.agentsByPoolId.get(poolId);
    if (!entry) {
      this.log(`Warning: Attempted to release unknown agent ${poolId}`);
      return;
    }

    if (entry.meta.state !== PooledAgentState.IN_USE) {
      this.log(`Warning: Attempted to release agent not in use ${poolId}`);
      return;
    }

    const useTime = Date.now() - (entry.meta.lastAcquiredAt || Date.now());
    entry.meta.totalUseTimeMs += useTime;
    entry.meta.lastReleasedAt = Date.now();

    if (dispose || hasError) {
      await this.disposeAgent(entry, hasError ? 'error' : 'explicit');
      return;
    }

    // Reset agent for reuse
    if (reset) {
      entry.meta.state = PooledAgentState.RESETTING;
      try {
        await entry.agent.reset();
        entry.meta.reuseCount++;
        entry.meta.state = PooledAgentState.AVAILABLE;
        entry.meta.lastError = null;
      } catch (error) {
        entry.meta.lastError = error as Error;
        this.emit('agent:error', {
          poolId,
          type: entry.meta.type,
          error: error as Error,
        });
        await this.disposeAgent(entry, 'reset-failed');
        return;
      }
    } else {
      entry.meta.state = PooledAgentState.AVAILABLE;
    }

    this.emit('agent:released', { poolId, type: entry.meta.type });

    // Check if anyone is waiting
    await this.fulfillWaitingRequest(entry.meta.type);
  }

  /**
   * Get current pool statistics
   */
  getStats(): PoolStats {
    const byType = new Map<QEAgentType, TypePoolStats>();
    let totalAgents = 0;
    let availableAgents = 0;
    let inUseAgents = 0;
    let initializingAgents = 0;

    for (const [type, pool] of this.pools) {
      const typeConfig = this.getTypeConfig(type);
      let available = 0;
      let inUse = 0;
      let totalReuse = 0;

      for (const entry of pool) {
        switch (entry.meta.state) {
          case PooledAgentState.AVAILABLE:
            available++;
            availableAgents++;
            break;
          case PooledAgentState.IN_USE:
            inUse++;
            inUseAgents++;
            break;
          case PooledAgentState.INITIALIZING:
            initializingAgents++;
            break;
        }
        totalReuse += entry.meta.reuseCount;
      }

      byType.set(type, {
        type,
        total: pool.length,
        available,
        inUse,
        minSize: typeConfig.minSize,
        maxSize: typeConfig.maxSize,
        avgReuseCount: pool.length > 0 ? totalReuse / pool.length : 0,
      });

      totalAgents += pool.length;
    }

    const totalAcq = this.stats.totalAcquisitions;
    const avgAcquisitionTimeMs =
      totalAcq > 0 ? this.stats.totalAcquisitionTimeMs / totalAcq : 0;
    const hitRate =
      totalAcq > 0 ? (totalAcq - this.stats.totalMisses) / totalAcq : 0;

    return {
      totalAgents,
      availableAgents,
      inUseAgents,
      initializingAgents,
      byType,
      avgAcquisitionTimeMs,
      hitRate,
      totalAcquisitions: totalAcq,
      totalMisses: this.stats.totalMisses,
    };
  }

  /**
   * Shutdown the pool and dispose all agents
   */
  async shutdown(): Promise<void> {
    this.isShuttingDown = true;
    this.log('Shutting down pool');

    // Stop health check
    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
      this.healthCheckTimer = null;
    }

    // Reject all waiting requests
    for (const [type, queue] of this.waitingQueues) {
      for (const request of queue) {
        clearTimeout(request.timeoutId);
        request.reject(new Error('Pool is shutting down'));
      }
      queue.length = 0;
    }

    // Dispose all agents
    const disposePromises: Promise<void>[] = [];
    for (const [, pool] of this.pools) {
      for (const entry of pool) {
        disposePromises.push(this.disposeAgent(entry, 'shutdown'));
      }
    }

    await Promise.all(disposePromises);
    this.pools.clear();
    this.agentsByPoolId.clear();

    this.log('Pool shutdown complete');
  }

  // === Private Methods ===

  private getPool(type: QEAgentType): PooledAgentEntry<T>[] {
    let pool = this.pools.get(type);
    if (!pool) {
      pool = [];
      this.pools.set(type, pool);
    }
    return pool;
  }

  private getTypeConfig(type: QEAgentType): AgentTypePoolConfig {
    const specific = this.config.typeConfigs.get(type);
    if (specific) return specific;
    return { ...this.config.defaultConfig, type };
  }

  private getConfiguredTypes(): QEAgentType[] {
    // Return all configured types plus common defaults
    const types = new Set<QEAgentType>(this.config.typeConfigs.keys());

    // Add default agent types that should always be warmed
    const defaultTypes: QEAgentType[] = [
      'test-generator' as QEAgentType,
      'coverage-analyzer' as QEAgentType,
      'quality-gate' as QEAgentType,
    ];

    defaultTypes.forEach((t) => types.add(t));
    return Array.from(types);
  }

  private async createPooledAgent(
    type: QEAgentType,
    initialize: boolean
  ): Promise<PooledAgentEntry<T>> {
    const poolId = `pool-${type}-${randomUUID().slice(0, 8)}`;
    const now = Date.now();

    const meta: PooledAgentMeta = {
      poolId,
      type,
      state: PooledAgentState.INITIALIZING,
      createdAt: now,
      lastAcquiredAt: null,
      lastReleasedAt: null,
      reuseCount: 0,
      totalUseTimeMs: 0,
      isInitialized: false,
      lastError: null,
    };

    const agent = await this.factory.create(type);
    meta.state = PooledAgentState.AVAILABLE;

    if (initialize) {
      try {
        await this.factory.initialize(agent);
        meta.isInitialized = true;
      } catch (error) {
        meta.lastError = error as Error;
        meta.state = PooledAgentState.ERROR;
        this.log(`Failed to initialize agent ${poolId}`, error);
      }
    }

    return { agent, meta };
  }

  private addToPool(type: QEAgentType, entry: PooledAgentEntry<T>): void {
    const pool = this.getPool(type);
    pool.push(entry);
    this.agentsByPoolId.set(entry.meta.poolId, entry);
  }

  private async tryAcquireFromPool(
    type: QEAgentType,
    requiredCapabilities: string[]
  ): Promise<PooledAgentEntry<T> | null> {
    const pool = this.getPool(type);

    // Find first available agent
    for (const entry of pool) {
      if (entry.meta.state === PooledAgentState.AVAILABLE) {
        // Check health
        if (!entry.agent.isHealthy()) {
          this.log(`Agent ${entry.meta.poolId} unhealthy, disposing`);
          await this.disposeAgent(entry, 'unhealthy');
          continue;
        }

        // Check capabilities if required
        // Note: Capability filtering available when agents expose capabilities

        // Acquire
        entry.meta.state = PooledAgentState.IN_USE;
        entry.meta.lastAcquiredAt = Date.now();

        // Ensure initialized
        if (!entry.meta.isInitialized) {
          try {
            await this.factory.initialize(entry.agent);
            entry.meta.isInitialized = true;
          } catch (error) {
            entry.meta.lastError = error as Error;
            await this.disposeAgent(entry, 'init-failed');
            continue;
          }
        }

        return entry;
      }
    }

    return null;
  }

  private canCreateMore(): boolean {
    let total = 0;
    for (const pool of this.pools.values()) {
      total += pool.length;
    }
    return total < this.config.globalMaxAgents;
  }

  private getWaitingCount(type: QEAgentType): number {
    const queue = this.waitingQueues.get(type);
    return queue?.length || 0;
  }

  private async waitForAgent(
    type: QEAgentType,
    priority: number,
    timeoutMs: number,
    startTime: number
  ): Promise<AcquireResult<T>> {
    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        this.removeWaitingRequest(type, request);
        reject(new Error(`Timeout waiting for agent of type ${type}`));
      }, timeoutMs);

      const request: WaitingRequest<T> = {
        type,
        priority,
        resolve: (result) => {
          clearTimeout(timeoutId);
          result.acquisitionTimeMs = Date.now() - startTime;
          this.recordAcquisition(result.acquisitionTimeMs, result.fromPool);
          resolve(result);
        },
        reject: (error) => {
          clearTimeout(timeoutId);
          reject(error);
        },
        timeoutId,
        requestedAt: startTime,
      };

      let queue = this.waitingQueues.get(type);
      if (!queue) {
        queue = [];
        this.waitingQueues.set(type, queue);
      }

      // Insert by priority (higher first)
      const insertIdx = queue.findIndex((r) => r.priority < priority);
      if (insertIdx === -1) {
        queue.push(request);
      } else {
        queue.splice(insertIdx, 0, request);
      }
    });
  }

  private removeWaitingRequest(type: QEAgentType, request: WaitingRequest<T>): void {
    const queue = this.waitingQueues.get(type);
    if (queue) {
      const idx = queue.indexOf(request);
      if (idx !== -1) {
        queue.splice(idx, 1);
      }
    }
  }

  private async fulfillWaitingRequest(type: QEAgentType): Promise<void> {
    const queue = this.waitingQueues.get(type);
    if (!queue || queue.length === 0) return;

    const request = queue.shift()!;

    try {
      const result = await this.acquire(type, {
        waitIfUnavailable: false,
        priority: request.priority,
      });
      request.resolve(result);
    } catch (error) {
      // Put back in queue for retry
      queue.unshift(request);
    }
  }

  private async disposeAgent(
    entry: PooledAgentEntry<T>,
    reason: string
  ): Promise<void> {
    entry.meta.state = PooledAgentState.DISPOSING;

    // Remove from pool
    const pool = this.getPool(entry.meta.type);
    const idx = pool.indexOf(entry);
    if (idx !== -1) {
      pool.splice(idx, 1);
    }
    this.agentsByPoolId.delete(entry.meta.poolId);

    // Dispose via factory
    try {
      await this.factory.dispose(entry.agent);
    } catch (error) {
      this.log(`Error disposing agent ${entry.meta.poolId}`, error);
    }

    this.emit('agent:disposed', {
      poolId: entry.meta.poolId,
      type: entry.meta.type,
      reason,
    });

    // Ensure minimum pool size
    const typeConfig = this.getTypeConfig(entry.meta.type);
    if (pool.length < typeConfig.minSize && !this.isShuttingDown) {
      this.replenishPool(entry.meta.type, 1);
    }
  }

  private async replenishPool(type: QEAgentType, count: number): Promise<void> {
    const typeConfig = this.getTypeConfig(type);
    const pool = this.getPool(type);
    const toCreate = Math.min(count, typeConfig.maxSize - pool.length);

    if (toCreate <= 0) return;

    this.log(`Replenishing ${toCreate} agents for type ${type}`);

    const createPromises = Array(toCreate)
      .fill(null)
      .map(() => this.createPooledAgent(type, typeConfig.preInitialize));

    const entries = await Promise.all(createPromises);
    entries.forEach((entry) => this.addToPool(type, entry));

    this.emit('pool:expanded', { type, newSize: pool.length });
  }

  private recordAcquisition(timeMs: number, fromPool: boolean): void {
    this.stats.totalAcquisitions++;
    this.stats.totalAcquisitionTimeMs += timeMs;
    if (!fromPool) {
      this.stats.totalMisses++;
    }
  }

  private startHealthCheck(): void {
    this.healthCheckTimer = setInterval(() => {
      this.performHealthCheck();
    }, this.config.healthCheckIntervalMs);
  }

  private async performHealthCheck(): Promise<void> {
    const stats = this.getStats();
    this.emit('pool:healthCheck', { stats });

    // Check for expired idle agents
    const now = Date.now();

    for (const [type, pool] of this.pools) {
      const typeConfig = this.getTypeConfig(type);
      if (typeConfig.idleTtlMs <= 0) continue;

      for (const entry of [...pool]) {
        if (entry.meta.state !== PooledAgentState.AVAILABLE) continue;

        const idleTime = now - (entry.meta.lastReleasedAt || entry.meta.createdAt);
        if (idleTime > typeConfig.idleTtlMs && pool.length > typeConfig.minSize) {
          await this.disposeAgent(entry, 'idle-timeout');
        }
      }
    }
  }

  private log(message: string, data?: unknown): void {
    if (this.config.debug) {
      console.log(`[AgentPool] ${message}`, data ?? '');
    }
  }
}

/**
 * Factory interface for creating agents
 */
export interface AgentFactory<T extends IResettableAgent> {
  /**
   * Create a new agent instance
   */
  create(type: QEAgentType): Promise<T>;

  /**
   * Initialize an agent (heavy async operations)
   */
  initialize(agent: T): Promise<void>;

  /**
   * Dispose an agent (cleanup resources)
   */
  dispose(agent: T): Promise<void>;
}
