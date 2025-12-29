/**
 * Agent Spawn Handler
 *
 * Handles spawning specialized QE agents with specific capabilities.
 * Coordinates with Claude Flow for agent lifecycle management.
 *
 * Phase 3 D1: Integrated with AgentPool for 16x spawn speedup
 *
 * @version 2.0.0
 * @author Agentic QE Team
 */

import { BaseHandler, HandlerResponse } from './base-handler.js';
import { AgentSpec } from '../tools.js';
import { AgentRegistry } from '../services/AgentRegistry.js';
import { HookExecutor } from '../services/HookExecutor.js';
import { SecureRandom } from '../../utils/SecureRandom.js';
import {
  AgentPool,
  PoolableAgent,
  QEAgentPoolFactory,
  createQEAgentPool,
  AcquireResult,
  PoolStats,
  AgentCreator,
} from '../../agents/pool/index.js';
import { QEAgentType } from '../../types/index.js';

export interface AgentSpawnArgs {
  spec: AgentSpec;
  fleetId?: string;
  /** Use pooled agent if available (default: true) */
  usePool?: boolean;
}

export interface AgentInstance {
  id: string;
  type: string;
  name: string;
  capabilities: string[];
  status: 'spawning' | 'active' | 'idle' | 'busy' | 'error' | 'terminated';
  resources: {
    memory: number;
    cpu: number;
    storage: number;
  };
  fleetId?: string;
  spawnedAt: string;
  lastActivity: string;
  metrics: {
    tasksCompleted: number;
    averageExecutionTime: number;
    successRate: number;
  };
  /** Pool metadata if spawned from pool */
  poolMeta?: {
    poolId: string;
    fromPool: boolean;
    acquisitionTimeMs: number;
  };
}

/**
 * Pool configuration for spawn handler
 */
export interface SpawnPoolConfig {
  /** Enable pool-based spawning (default: true) */
  enabled: boolean;
  /** Pre-warm pool on handler creation */
  warmupOnInit: boolean;
  /** Agent types to pre-warm */
  warmupTypes: QEAgentType[];
  /** Enable debug logging */
  debug: boolean;
}

const DEFAULT_SPAWN_POOL_CONFIG: SpawnPoolConfig = {
  enabled: true,
  warmupOnInit: false, // Will be enabled via fleet init
  warmupTypes: [
    QEAgentType.TEST_GENERATOR,
    QEAgentType.COVERAGE_ANALYZER,
    QEAgentType.QUALITY_GATE,
  ],
  debug: false,
};

export class AgentSpawnHandler extends BaseHandler {
  private activeAgents: Map<string, AgentInstance> = new Map();
  private agentTypeConfigs: Map<string, any> = new Map();
  private registry: AgentRegistry;
  private hookExecutor: HookExecutor;

  // Pool integration (Phase 3 D1)
  private pool: AgentPool<PoolableAgent> | null = null;
  private poolConfig: SpawnPoolConfig;
  private poolInitPromise: Promise<void> | null = null;
  private pooledAgentMap: Map<string, string> = new Map(); // agentId -> poolId

  // Spawn metrics for benchmarking
  private spawnMetrics = {
    pooledSpawns: 0,
    directSpawns: 0,
    totalPooledTimeMs: 0,
    totalDirectTimeMs: 0,
  };

  constructor(
    registry: AgentRegistry,
    hookExecutor: HookExecutor,
    poolConfig: Partial<SpawnPoolConfig> = {}
  ) {
    super();
    this.registry = registry;
    this.hookExecutor = hookExecutor;
    this.poolConfig = { ...DEFAULT_SPAWN_POOL_CONFIG, ...poolConfig };
    this.initializeAgentTypeConfigs();

    // Initialize pool if enabled
    if (this.poolConfig.enabled) {
      this.initializePool();
    }
  }

  /**
   * Initialize the agent pool
   */
  private async initializePool(): Promise<void> {
    if (this.poolInitPromise) {
      return this.poolInitPromise;
    }

    this.poolInitPromise = (async () => {
      try {
        // Create agent creator that uses the registry
        const agentCreator: AgentCreator = async (type: QEAgentType) => {
          const { agent } = await this.registry.spawnAgent(type, {
            name: `pooled-${type}-${Date.now()}`,
            description: `Pooled ${type} agent`,
            capabilities: this.getDefaultCapabilities(type),
          } as any);
          return agent;
        };

        this.pool = await createQEAgentPool(
          agentCreator,
          { enableLearning: true, debug: this.poolConfig.debug },
          { debug: this.poolConfig.debug }
        );

        if (this.poolConfig.warmupOnInit) {
          await this.warmupPool();
        }

        this.log('info', 'Agent pool initialized', {
          enabled: true,
          warmupTypes: this.poolConfig.warmupTypes,
        });
      } catch (error) {
        this.log('error', 'Failed to initialize agent pool', {
          error: error instanceof Error ? error.message : String(error),
        });
        this.pool = null;
      }
    })();

    return this.poolInitPromise;
  }

  /**
   * Warm up the pool with pre-allocated agents
   * Called during fleet initialization for optimal performance
   */
  async warmupPool(types?: QEAgentType[]): Promise<void> {
    if (!this.pool) {
      await this.initializePool();
    }

    if (!this.pool) {
      this.log('warn', 'Cannot warmup pool - pool not available');
      return;
    }

    const typesToWarm = types || this.poolConfig.warmupTypes;
    this.log('info', 'Warming up agent pool', { types: typesToWarm });

    const startTime = Date.now();
    await this.pool.warmup(typesToWarm);
    const elapsed = Date.now() - startTime;

    this.log('info', 'Pool warmup complete', {
      elapsed: `${elapsed}ms`,
      stats: this.pool.getStats(),
    });
  }

  /**
   * Get pool statistics
   */
  getPoolStats(): PoolStats | null {
    return this.pool?.getStats() || null;
  }

  /**
   * Get spawn metrics for benchmarking
   */
  getSpawnMetrics() {
    const pooled = this.spawnMetrics.pooledSpawns;
    const direct = this.spawnMetrics.directSpawns;

    return {
      pooledSpawns: pooled,
      directSpawns: direct,
      avgPooledTimeMs: pooled > 0 ? this.spawnMetrics.totalPooledTimeMs / pooled : 0,
      avgDirectTimeMs: direct > 0 ? this.spawnMetrics.totalDirectTimeMs / direct : 0,
      speedupFactor:
        pooled > 0 && direct > 0
          ? (this.spawnMetrics.totalDirectTimeMs / direct) /
            (this.spawnMetrics.totalPooledTimeMs / pooled)
          : 0,
      poolStats: this.getPoolStats(),
    };
  }

  async handle(args: AgentSpawnArgs): Promise<HandlerResponse> {
    const requestId = this.generateRequestId();
    const usePool = args.usePool !== false && this.poolConfig.enabled;

    this.log('info', 'Spawning QE agent', {
      requestId,
      spec: args.spec,
      usePool,
    });

    try {
      // Validate required parameters
      this.validateRequired(args, ['spec']);
      this.validateAgentSpec(args.spec);

      const startTime = Date.now();
      let agentInstance: AgentInstance;

      // Try pooled spawn first if enabled
      if (usePool && this.pool) {
        agentInstance = await this.spawnFromPool(args.spec, args.fleetId, startTime);
      } else {
        agentInstance = await this.spawnDirect(args.spec, args.fleetId, startTime);
      }

      const executionTime = Date.now() - startTime;

      this.log('info', `Agent spawned successfully in ${executionTime.toFixed(2)}ms`, {
        agentId: agentInstance.id,
        type: agentInstance.type,
        fleetId: agentInstance.fleetId,
        fromPool: agentInstance.poolMeta?.fromPool ?? false,
      });

      return this.createSuccessResponse(agentInstance, requestId);
    } catch (error) {
      this.log('error', 'Agent spawn failed', {
        error: error instanceof Error ? error.message : String(error),
      });
      return this.createErrorResponse(
        error instanceof Error ? error.message : 'Agent spawn failed',
        requestId
      );
    }
  }

  /**
   * Spawn agent from pool (fast path)
   */
  private async spawnFromPool(
    spec: AgentSpec,
    fleetId: string | undefined,
    startTime: number
  ): Promise<AgentInstance> {
    const agentType = spec.type as QEAgentType;

    try {
      const result = await this.pool!.acquire(agentType, {
        timeoutMs: 5000,
        waitIfUnavailable: true,
      });

      const acquisitionTime = Date.now() - startTime;
      this.spawnMetrics.pooledSpawns++;
      this.spawnMetrics.totalPooledTimeMs += acquisitionTime;

      const agent = result.agent.getBaseAgent();
      const agentId = agent.getAgentId().id;

      // Track pool mapping for release
      this.pooledAgentMap.set(agentId, result.meta.poolId);

      // Execute hooks
      await this.hookExecutor.executePreTask({
        description: `Spawning ${spec.type} agent (pooled)`,
        agentType: spec.type,
      });

      // Register with fleet if specified
      if (fleetId) {
        await this.registerWithFleet(
          {
            id: agentId,
            type: spec.type,
            name: spec.name || `${spec.type}-${agentId.split('-').pop()}`,
            capabilities: this.mergeCapabilities(spec),
            status: 'active',
            resources: this.mergeResources(spec),
            fleetId,
            spawnedAt: new Date().toISOString(),
            lastActivity: new Date().toISOString(),
            metrics: { tasksCompleted: 0, averageExecutionTime: 0, successRate: 1.0 },
          },
          fleetId
        );
      }

      await this.hookExecutor.executePostTask({
        taskId: agentId,
        agentType: spec.type,
        results: { status: 'spawned', agentId, fromPool: true },
      });

      const agentInstance: AgentInstance = {
        id: agentId,
        type: spec.type,
        name: spec.name || `${spec.type}-${agentId.split('-').pop()}`,
        capabilities: this.mergeCapabilities(spec),
        status: 'active',
        resources: this.mergeResources(spec),
        fleetId,
        spawnedAt: new Date().toISOString(),
        lastActivity: new Date().toISOString(),
        metrics: { tasksCompleted: 0, averageExecutionTime: 0, successRate: 1.0 },
        poolMeta: {
          poolId: result.meta.poolId,
          fromPool: result.fromPool,
          acquisitionTimeMs: result.acquisitionTimeMs,
        },
      };

      this.activeAgents.set(agentId, agentInstance);
      return agentInstance;
    } catch (error) {
      // Fall back to direct spawn if pool fails
      this.log('warn', 'Pool acquisition failed, falling back to direct spawn', {
        error: error instanceof Error ? error.message : String(error),
      });
      return this.spawnDirect(spec, fleetId, startTime);
    }
  }

  /**
   * Spawn agent directly (legacy path)
   */
  private async spawnDirect(
    spec: AgentSpec,
    fleetId: string | undefined,
    startTime: number
  ): Promise<AgentInstance> {
    const agentId = `agent-${spec.type}-${Date.now()}-${SecureRandom.generateId(3)}`;
    const typeConfig = this.agentTypeConfigs.get(spec.type)!;

    const capabilities = this.mergeCapabilities(spec);
    const resources = this.mergeResources(spec);

    // Execute pre-task hook
    await this.hookExecutor.executePreTask({
      description: `Spawning ${spec.type} agent`,
      agentType: spec.type,
    });

    // Spawn agent via registry
    const { id, agent } = await this.registry.spawnAgent(spec.type, {
      name: spec.name || `${spec.type}-${agentId.split('-').pop()}`,
      description: `${spec.type} agent spawned via MCP`,
      capabilities,
      resources,
      fleetId,
    } as any);

    const spawnTime = Date.now() - startTime;
    this.spawnMetrics.directSpawns++;
    this.spawnMetrics.totalDirectTimeMs += spawnTime;

    // Register with Claude Flow if part of a fleet
    if (fleetId) {
      await this.registerWithFleet(
        {
          id,
          type: spec.type,
          name: spec.name || `${spec.type}-${id.split('-').pop()}`,
          capabilities,
          status: 'active',
          resources,
          fleetId,
          spawnedAt: new Date().toISOString(),
          lastActivity: new Date().toISOString(),
          metrics: { tasksCompleted: 0, averageExecutionTime: 0, successRate: 1.0 },
        },
        fleetId
      );
    }

    // Execute post-task hook
    await this.hookExecutor.executePostTask({
      taskId: id,
      agentType: spec.type,
      results: { status: 'spawned', agentId: id },
    });

    const agentStatus = agent.getStatus();
    const metrics = this.registry.getAgentMetrics(id);

    const instanceStatus: AgentInstance['status'] =
      agentStatus.status === 'active'
        ? 'active'
        : agentStatus.status === 'idle'
          ? 'idle'
          : agentStatus.status === 'busy'
            ? 'busy'
            : agentStatus.status === 'error'
              ? 'error'
              : 'active';

    const agentInstance: AgentInstance = {
      id,
      type: spec.type,
      name: spec.name || `${spec.type}-${id.split('-').pop()}`,
      capabilities,
      status: instanceStatus,
      resources,
      fleetId,
      spawnedAt: new Date().toISOString(),
      lastActivity: new Date().toISOString(),
      metrics: metrics
        ? {
            tasksCompleted: metrics.tasksCompleted,
            averageExecutionTime: metrics.averageExecutionTime,
            successRate: 1.0,
          }
        : {
            tasksCompleted: 0,
            averageExecutionTime: 0,
            successRate: 1.0,
          },
    };

    this.activeAgents.set(id, agentInstance);
    return agentInstance;
  }

  private mergeCapabilities(spec: AgentSpec): string[] {
    const typeConfig = this.agentTypeConfigs.get(spec.type)!;
    return [
      ...typeConfig.defaultCapabilities,
      ...spec.capabilities.filter(
        (cap: string) => !typeConfig.defaultCapabilities.includes(cap)
      ),
    ];
  }

  private mergeResources(spec: AgentSpec): { memory: number; cpu: number; storage: number } {
    const typeConfig = this.agentTypeConfigs.get(spec.type)!;
    return {
      ...typeConfig.defaultResources,
      ...spec.resources,
    };
  }

  private getDefaultCapabilities(type: QEAgentType): string[] {
    const typeConfig = this.agentTypeConfigs.get(type);
    return typeConfig?.defaultCapabilities || [];
  }

  private initializeAgentTypeConfigs(): void {
    this.agentTypeConfigs.set('test-generator', {
      defaultCapabilities: [
        'unit-test-generation',
        'integration-test-generation',
        'property-based-testing',
      ],
      defaultResources: { memory: 512, cpu: 1, storage: 256 },
      specializations: ['boundary-analysis', 'edge-case-detection', 'test-data-synthesis'],
    });

    this.agentTypeConfigs.set('coverage-analyzer', {
      defaultCapabilities: ['coverage-analysis', 'gap-identification', 'trend-analysis'],
      defaultResources: { memory: 256, cpu: 0.5, storage: 128 },
      specializations: ['critical-path-analysis', 'coverage-optimization', 'risk-assessment'],
    });

    this.agentTypeConfigs.set('quality-gate', {
      defaultCapabilities: ['quality-metrics', 'threshold-enforcement', 'decision-making'],
      defaultResources: { memory: 128, cpu: 0.5, storage: 64 },
      specializations: ['composite-metrics', 'trend-monitoring', 'automated-decisions'],
    });

    this.agentTypeConfigs.set('performance-tester', {
      defaultCapabilities: ['load-testing', 'stress-testing', 'bottleneck-detection'],
      defaultResources: { memory: 1024, cpu: 2, storage: 512 },
      specializations: ['resource-monitoring', 'baseline-comparison', 'regression-detection'],
    });

    this.agentTypeConfigs.set('security-scanner', {
      defaultCapabilities: ['vulnerability-scanning', 'compliance-checking', 'security-testing'],
      defaultResources: { memory: 512, cpu: 1, storage: 256 },
      specializations: ['owasp-scanning', 'penetration-testing', 'compliance-validation'],
    });

    this.agentTypeConfigs.set('chaos-engineer', {
      defaultCapabilities: ['failure-injection', 'resilience-testing', 'recovery-validation'],
      defaultResources: { memory: 256, cpu: 1, storage: 128 },
      specializations: ['controlled-chaos', 'blast-radius-control', 'disaster-recovery'],
    });

    this.agentTypeConfigs.set('visual-tester', {
      defaultCapabilities: [
        'visual-regression',
        'cross-browser-testing',
        'accessibility-testing',
      ],
      defaultResources: { memory: 1024, cpu: 1, storage: 1024 },
      specializations: ['screenshot-comparison', 'responsive-testing', 'wcag-compliance'],
    });

    this.agentTypeConfigs.set('product-factors-assessor', {
      defaultCapabilities: [
        'sfdipot-analysis',
        'test-idea-generation',
        'automation-fitness',
        'clarifying-questions',
        'multi-format-output',
      ],
      defaultResources: { memory: 512, cpu: 1, storage: 256 },
      specializations: ['htsm-framework', 'domain-detection', 'code-intelligence', 'learning-integration'],
    });
  }

  private validateAgentSpec(spec: AgentSpec): void {
    const validTypes = Array.from(this.agentTypeConfigs.keys());
    if (!validTypes.includes(spec.type)) {
      throw new Error(
        `Invalid agent type: ${spec.type}. Must be one of: ${validTypes.join(', ')}`
      );
    }

    if (!spec.capabilities || spec.capabilities.length === 0) {
      throw new Error('Agent must have at least one capability');
    }
  }

  private async registerWithFleet(agent: AgentInstance, fleetId: string): Promise<void> {
    this.log('info', 'Registering agent with fleet', {
      agentId: agent.id,
      fleetId,
    });

    // This would integrate with Claude Flow fleet coordination
    // For now, we simulate the registration
    await new Promise((resolve) => setTimeout(resolve, 50));

    this.log('info', 'Agent registered with fleet', {
      agentId: agent.id,
      fleetId,
    });
  }

  /**
   * Get agent by ID
   */
  getAgent(agentId: string): AgentInstance | undefined {
    return this.activeAgents.get(agentId);
  }

  /**
   * List agents by fleet
   */
  listAgentsByFleet(fleetId: string): AgentInstance[] {
    return Array.from(this.activeAgents.values()).filter(
      (agent) => agent.fleetId === fleetId
    );
  }

  /**
   * List all active agents
   */
  listAgents(): AgentInstance[] {
    return Array.from(this.activeAgents.values());
  }

  /**
   * Update agent status
   */
  updateAgentStatus(agentId: string, status: AgentInstance['status']): boolean {
    const agent = this.activeAgents.get(agentId);
    if (!agent) {
      return false;
    }

    agent.status = status;
    agent.lastActivity = new Date().toISOString();
    return true;
  }

  /**
   * Terminate an agent
   */
  async terminateAgent(agentId: string): Promise<boolean> {
    const agent = this.activeAgents.get(agentId);
    if (!agent) {
      return false;
    }

    this.log('info', 'Terminating agent', { agentId, type: agent.type });

    // Return to pool if pooled
    const poolId = this.pooledAgentMap.get(agentId);
    if (poolId && this.pool) {
      try {
        await this.pool.release(poolId);
        this.pooledAgentMap.delete(agentId);
        this.log('info', 'Agent returned to pool', { agentId, poolId });
      } catch (error) {
        this.log('warn', 'Failed to return agent to pool', {
          agentId,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    // Update status
    agent.status = 'terminated';

    this.activeAgents.delete(agentId);
    return true;
  }

  /**
   * Shutdown the handler and pool
   */
  async shutdown(): Promise<void> {
    this.log('info', 'Shutting down agent spawn handler');

    if (this.pool) {
      await this.pool.shutdown();
      this.pool = null;
    }

    this.activeAgents.clear();
    this.pooledAgentMap.clear();
  }
}
