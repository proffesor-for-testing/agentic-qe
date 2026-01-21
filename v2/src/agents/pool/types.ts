/**
 * Agent Pool Types
 * Phase 3 D1: Memory Pooling for 16x Agent Spawn Speedup
 *
 * Target: Reduce spawn time from ~50-100ms to ~3-6ms
 */

import { QEAgentType } from '../../types';

/**
 * Pool configuration for a specific agent type
 */
export interface AgentTypePoolConfig {
  /** Agent type identifier */
  type: QEAgentType;

  /** Minimum number of agents to keep warm in pool */
  minSize: number;

  /** Maximum pool size (prevents memory bloat) */
  maxSize: number;

  /** Number of agents to pre-warm during startup */
  warmupCount: number;

  /** Whether to pre-initialize agents (run initialize() during warmup) */
  preInitialize: boolean;

  /** Time-to-live for idle agents in ms (0 = no expiration) */
  idleTtlMs: number;

  /** Growth increment when pool is exhausted */
  growthIncrement: number;
}

/**
 * Overall pool configuration
 */
export interface AgentPoolConfig {
  /** Per-type pool configurations */
  typeConfigs: Map<QEAgentType, AgentTypePoolConfig>;

  /** Default config for types without specific configuration */
  defaultConfig: Omit<AgentTypePoolConfig, 'type'>;

  /** Enable debug logging */
  debug: boolean;

  /** Maximum total agents across all pools */
  globalMaxAgents: number;

  /** Warmup strategy: 'eager' (all at once) or 'lazy' (on first request) */
  warmupStrategy: 'eager' | 'lazy';

  /** Health check interval in ms (0 = disabled) */
  healthCheckIntervalMs: number;
}

/**
 * State of a pooled agent
 */
export enum PooledAgentState {
  /** Agent is available for acquisition */
  AVAILABLE = 'available',

  /** Agent is currently in use */
  IN_USE = 'in_use',

  /** Agent is being initialized */
  INITIALIZING = 'initializing',

  /** Agent is being reset for reuse */
  RESETTING = 'resetting',

  /** Agent has an error and needs recovery */
  ERROR = 'error',

  /** Agent is marked for removal */
  DISPOSING = 'disposing',
}

/**
 * Metadata for a pooled agent
 */
export interface PooledAgentMeta {
  /** Unique pool-assigned ID */
  poolId: string;

  /** Agent type */
  type: QEAgentType;

  /** Current state in pool */
  state: PooledAgentState;

  /** When the agent was created */
  createdAt: number;

  /** When the agent was last acquired */
  lastAcquiredAt: number | null;

  /** When the agent was last released */
  lastReleasedAt: number | null;

  /** Number of times this agent has been reused */
  reuseCount: number;

  /** Total time spent in use (ms) */
  totalUseTimeMs: number;

  /** Whether agent has been initialized */
  isInitialized: boolean;

  /** Last error if any */
  lastError: Error | null;
}

/**
 * Pool statistics for monitoring
 */
export interface PoolStats {
  /** Total agents across all types */
  totalAgents: number;

  /** Available agents ready for use */
  availableAgents: number;

  /** Agents currently in use */
  inUseAgents: number;

  /** Agents being initialized */
  initializingAgents: number;

  /** Per-type breakdown */
  byType: Map<QEAgentType, TypePoolStats>;

  /** Average acquisition time (ms) */
  avgAcquisitionTimeMs: number;

  /** Cache hit rate (acquisitions from pool vs new creates) */
  hitRate: number;

  /** Total acquisitions since startup */
  totalAcquisitions: number;

  /** Total pool misses (had to create new) */
  totalMisses: number;
}

/**
 * Per-type pool statistics
 */
export interface TypePoolStats {
  type: QEAgentType;
  total: number;
  available: number;
  inUse: number;
  minSize: number;
  maxSize: number;
  avgReuseCount: number;
}

/**
 * Options for acquiring an agent from the pool
 */
export interface AcquireOptions {
  /** Timeout for acquisition in ms (default: 5000) */
  timeoutMs?: number;

  /** Whether to wait for an agent if none available (default: true) */
  waitIfUnavailable?: boolean;

  /** Priority level for acquisition (higher = first in queue) */
  priority?: number;

  /** Custom capabilities required (filters available agents) */
  requiredCapabilities?: string[];
}

/**
 * Options for releasing an agent back to the pool
 */
export interface ReleaseOptions {
  /** Whether to reset agent state (default: true) */
  reset?: boolean;

  /** Mark agent as having an error (will be recovered or disposed) */
  hasError?: boolean;

  /** Force disposal instead of returning to pool */
  dispose?: boolean;
}

/**
 * Pool expansion policy
 */
export type ExpansionPolicy = 'none' | 'linear' | 'exponential' | 'adaptive';

/**
 * Result of an acquire operation
 */
export interface AcquireResult<T> {
  /** The acquired agent */
  agent: T;

  /** Pool metadata for this agent */
  meta: PooledAgentMeta;

  /** Whether this was a cache hit (from pool) or miss (newly created) */
  fromPool: boolean;

  /** Time taken to acquire in ms */
  acquisitionTimeMs: number;
}

/**
 * Events emitted by the pool
 */
export interface PoolEvents {
  'agent:acquired': { poolId: string; type: QEAgentType; fromPool: boolean };
  'agent:released': { poolId: string; type: QEAgentType };
  'agent:created': { poolId: string; type: QEAgentType };
  'agent:disposed': { poolId: string; type: QEAgentType; reason: string };
  'agent:error': { poolId: string; type: QEAgentType; error: Error };
  'pool:exhausted': { type: QEAgentType; waitingCount: number };
  'pool:expanded': { type: QEAgentType; newSize: number };
  'pool:warmed': { type: QEAgentType; count: number };
  'pool:healthCheck': { stats: PoolStats };
}

/**
 * Interface for resettable agents (agents that can be reused)
 */
export interface IResettableAgent {
  /**
   * Reset agent state for reuse
   * Called when agent is returned to pool
   */
  reset(): Promise<void>;

  /**
   * Check if agent is healthy and can be reused
   */
  isHealthy(): boolean;

  /**
   * Get agent's unique identifier
   */
  getId(): string;

  /**
   * Get agent type
   */
  getType(): QEAgentType;
}
