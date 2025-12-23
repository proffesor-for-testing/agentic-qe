/**
 * QE Agent Pool Factory
 * Phase 3 D1: Memory Pooling for 16x Agent Spawn Speedup
 *
 * Bridges the AgentPool with the existing QE agent creation system.
 * Provides a factory implementation that creates poolable agents.
 */

import { QEAgentType, AgentStatus } from '../../types';
import { BaseAgent } from '../BaseAgent';
import { AgentFactory, AgentPool } from './AgentPool';
import { IResettableAgent, AgentPoolConfig, AgentTypePoolConfig } from './types';

/**
 * Wrapper that makes BaseAgent poolable
 */
export class PoolableAgent implements IResettableAgent {
  private readonly agent: BaseAgent;
  private healthy = true;

  constructor(agent: BaseAgent) {
    this.agent = agent;
  }

  /**
   * Get the underlying BaseAgent
   */
  getBaseAgent(): BaseAgent {
    return this.agent;
  }

  /**
   * Reset agent state for reuse
   */
  async reset(): Promise<void> {
    try {
      // Clear current task using type assertion to access protected member
      (this.agent as any).currentTask = undefined;

      // Reset performance metrics (keep accumulated stats but clear current)
      if ((this.agent as any).performanceMetrics) {
        (this.agent as any).performanceMetrics.lastTaskDuration = 0;
      }

      // Clear any pending events
      this.agent.removeAllListeners();

      // Re-setup event handlers if available
      if (typeof (this.agent as any).setupEventHandlers === 'function') {
        (this.agent as any).setupEventHandlers();
      }

      this.healthy = true;
    } catch (error) {
      this.healthy = false;
      throw error;
    }
  }

  /**
   * Check if agent is healthy
   */
  isHealthy(): boolean {
    if (!this.healthy) return false;

    try {
      // Check lifecycle status - getStatus() returns an object with .status
      const statusObj = this.agent.getStatus();
      const status = statusObj.status;
      return status !== AgentStatus.ERROR && status !== AgentStatus.TERMINATED;
    } catch {
      return false;
    }
  }

  /**
   * Get agent ID
   */
  getId(): string {
    return this.agent.getAgentId().id;
  }

  /**
   * Get agent type
   */
  getType(): QEAgentType {
    return this.agent.getAgentId().type;
  }
}

/**
 * Configuration for the pool factory
 */
export interface PoolFactoryConfig {
  /** Enable learning for agents */
  enableLearning?: boolean;
  /** Enable debug logging */
  debug?: boolean;
}

/**
 * Agent creator function type
 * This allows the caller to provide their own agent creation logic
 */
export type AgentCreator = (type: QEAgentType) => Promise<BaseAgent>;

/**
 * Factory for creating poolable QE agents
 *
 * Uses a provided creator function to decouple from QEAgentFactory dependencies
 */
export class QEAgentPoolFactory implements AgentFactory<PoolableAgent> {
  private readonly creator: AgentCreator;
  private readonly config: PoolFactoryConfig;

  constructor(creator: AgentCreator, config: PoolFactoryConfig = {}) {
    this.creator = creator;
    this.config = config;
  }

  /**
   * Create a new poolable agent (constructor only, no initialization)
   */
  async create(type: QEAgentType): Promise<PoolableAgent> {
    const agent = await this.creator(type);
    return new PoolableAgent(agent);
  }

  /**
   * Initialize an agent (heavy async operations)
   */
  async initialize(agent: PoolableAgent): Promise<void> {
    await agent.getBaseAgent().initialize();
  }

  /**
   * Dispose an agent
   */
  async dispose(agent: PoolableAgent): Promise<void> {
    try {
      await agent.getBaseAgent().terminate();
    } catch (error) {
      if (this.config.debug) {
        console.warn(`Error disposing agent ${agent.getId()}:`, error);
      }
    }
  }
}

/**
 * Default pool configuration optimized for QE workloads
 */
export const DEFAULT_QE_POOL_CONFIG: Partial<AgentPoolConfig> = {
  debug: false,
  globalMaxAgents: 50,
  warmupStrategy: 'lazy',
  healthCheckIntervalMs: 60000,
  defaultConfig: {
    minSize: 1,
    maxSize: 5,
    warmupCount: 1,
    preInitialize: false,
    idleTtlMs: 300000, // 5 minutes
    growthIncrement: 1,
  },
};

/**
 * Type-specific pool configurations
 */
export const QE_TYPE_CONFIGS: Map<QEAgentType, AgentTypePoolConfig> = new Map([
  [
    QEAgentType.TEST_GENERATOR,
    {
      type: QEAgentType.TEST_GENERATOR,
      minSize: 2,
      maxSize: 8,
      warmupCount: 2,
      preInitialize: true, // Pre-init for fast response
      idleTtlMs: 600000, // 10 minutes (high demand)
      growthIncrement: 2,
    },
  ],
  [
    QEAgentType.COVERAGE_ANALYZER,
    {
      type: QEAgentType.COVERAGE_ANALYZER,
      minSize: 1,
      maxSize: 4,
      warmupCount: 1,
      preInitialize: true,
      idleTtlMs: 300000,
      growthIncrement: 1,
    },
  ],
  [
    QEAgentType.QUALITY_GATE,
    {
      type: QEAgentType.QUALITY_GATE,
      minSize: 1,
      maxSize: 3,
      warmupCount: 1,
      preInitialize: true, // Fast response needed for gates
      idleTtlMs: 180000, // 3 minutes
      growthIncrement: 1,
    },
  ],
  [
    QEAgentType.PERFORMANCE_TESTER,
    {
      type: QEAgentType.PERFORMANCE_TESTER,
      minSize: 1,
      maxSize: 4,
      warmupCount: 0, // Heavy resource, lazy create
      preInitialize: false,
      idleTtlMs: 120000, // 2 minutes (resource intensive)
      growthIncrement: 1,
    },
  ],
  [
    QEAgentType.SECURITY_SCANNER,
    {
      type: QEAgentType.SECURITY_SCANNER,
      minSize: 1,
      maxSize: 3,
      warmupCount: 1,
      preInitialize: false,
      idleTtlMs: 300000,
      growthIncrement: 1,
    },
  ],
]);

/**
 * Create a configured QE agent pool
 *
 * @param creator - Function to create agents
 * @param factoryConfig - Factory configuration
 * @param poolConfig - Pool configuration
 *
 * @example
 * ```typescript
 * import { QEAgentFactory } from '../index';
 *
 * // Setup factory with your dependencies
 * const qeFactory = new QEAgentFactory({ eventBus, memoryStore, context });
 *
 * // Create pool with custom creator
 * const pool = await createQEAgentPool(
 *   (type) => qeFactory.createAgent(type),
 *   { enableLearning: true },
 *   { debug: true }
 * );
 *
 * await pool.warmup();
 *
 * const { agent, meta } = await pool.acquire(QEAgentType.TEST_GENERATOR);
 * const baseAgent = agent.getBaseAgent();
 * // Use baseAgent...
 * await pool.release(meta.poolId);
 * ```
 */
export async function createQEAgentPool(
  creator: AgentCreator,
  factoryConfig: PoolFactoryConfig = {},
  poolConfig: Partial<AgentPoolConfig> = {}
): Promise<AgentPool<PoolableAgent>> {
  const factory = new QEAgentPoolFactory(creator, factoryConfig);

  const config: Partial<AgentPoolConfig> = {
    ...DEFAULT_QE_POOL_CONFIG,
    ...poolConfig,
    typeConfigs: new Map([
      ...QE_TYPE_CONFIGS,
      ...(poolConfig.typeConfigs || new Map()),
    ]),
  };

  const pool = new AgentPool<PoolableAgent>(factory, config);

  return pool;
}

/**
 * Get the BaseAgent from a pooled agent
 */
export function unwrapPooledAgent(poolable: PoolableAgent): BaseAgent {
  return poolable.getBaseAgent();
}
