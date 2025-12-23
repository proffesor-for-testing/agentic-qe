/**
 * Agent Pool Module
 * Phase 3 D1: Memory Pooling for 16x Agent Spawn Speedup
 *
 * Provides pre-allocated agent pooling for fast acquisition.
 *
 * @example
 * ```typescript
 * import { AgentPool, createQEAgentFactory } from './pool';
 *
 * const factory = createQEAgentFactory(memoryStore, config);
 * const pool = new AgentPool(factory, {
 *   typeConfigs: new Map([
 *     ['test-generator', { minSize: 3, maxSize: 10, warmupCount: 3 }],
 *   ]),
 * });
 *
 * // Warmup during startup
 * await pool.warmup();
 *
 * // Fast acquisition (<6ms target)
 * const { agent, meta } = await pool.acquire('test-generator');
 *
 * // Use agent
 * await agent.executeTask(task);
 *
 * // Return to pool
 * await pool.release(meta.poolId);
 * ```
 */

export { AgentPool, AgentFactory } from './AgentPool';

export {
  // Configuration types
  AgentPoolConfig,
  AgentTypePoolConfig,

  // State and metadata
  PooledAgentState,
  PooledAgentMeta,

  // Statistics
  PoolStats,
  TypePoolStats,

  // Options
  AcquireOptions,
  ReleaseOptions,
  AcquireResult,

  // Events
  PoolEvents,

  // Interfaces
  IResettableAgent,
  ExpansionPolicy,
} from './types';

export {
  QEAgentPoolFactory,
  createQEAgentPool,
  unwrapPooledAgent,
  PoolableAgent,
  PoolFactoryConfig,
  AgentCreator,
} from './QEAgentPoolFactory';
