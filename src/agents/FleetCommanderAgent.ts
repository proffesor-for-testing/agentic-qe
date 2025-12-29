/**
 * FleetCommanderAgent - Hierarchical fleet coordinator for 50+ agent orchestration
 *
 * Responsibilities:
 * - Agent lifecycle management (spawn, monitor, terminate)
 * - Resource optimization (CPU, memory, I/O allocation)
 * - Topology management (hierarchical, mesh, hybrid, adaptive)
 * - Conflict resolution (resource contention, deadlocks)
 * - Load balancing (sublinear scheduling algorithms)
 * - Fault tolerance (failure detection and recovery)
 * - Auto-scaling (demand-based agent pool management)
 * - Performance monitoring (fleet-wide metrics)
 */

import { BaseAgent, BaseAgentConfig } from './BaseAgent';
import { SecureRandom } from '../utils/SecureRandom.js';
import { AgentType as _AgentType, QEAgentType, QETask, AgentStatus } from '../types';
import {
  TopologyMinCutAnalyzer,
  FleetTopology,
  TopologyNode,
  TopologyEdge,
  ResilienceResult,
  SPOFResult,
} from '../fleet/topology/index.js';
import { PostTaskData, TaskErrorData, FlexibleTaskResult, PreTaskData } from '../types/hook.types';

// ============================================================================
// Event Data Interfaces
// ============================================================================

/**
 * Data for agent spawned events
 */
interface AgentSpawnedEventData {
  agentId: string;
  type: string;
  capabilities?: string[];
}

/**
 * Data for agent terminated events
 */
interface AgentTerminatedEventData {
  agentId: string;
  reason?: string;
}

/**
 * Data for agent error events
 */
interface AgentErrorEventData {
  agentId: string;
  error: Error | string;
  context?: Record<string, unknown>;
}

/**
 * Data for task submitted events
 */
interface TaskSubmittedEventData {
  taskId?: string;
  task?: QETask;
  type?: string;
  priority?: number;
}

/**
 * Data for task completed events
 */
interface TaskCompletedEventData {
  taskId: string;
  success: boolean;
  result?: unknown;
  duration?: number;
}

// ============================================================================
// Return Type Interfaces
// ============================================================================

/**
 * Result of fleet initialization
 */
interface FleetInitResult {
  topology: string;
  poolsInitialized: string[];
  totalAgents: number;
  status: string;
}

/**
 * Result of workload rebalancing
 */
interface RebalanceResult {
  strategy: Record<string, number>;
  fleetUtilization: number;
  timestamp: Date;
}

/**
 * Configuration for fleet initialization
 */
interface FleetInitConfig {
  topology?: 'hierarchical' | 'mesh' | 'hybrid' | 'adaptive';
  maxAgents?: number;
  agentPools?: Record<string, { min: number; max: number; priority: string }>;
}

/**
 * Payload for topology optimization results
 */
interface TopologyOptimizationResult {
  optimizations: unknown[];
  currentResilience?: number;
  currentGrade?: string;
  message?: string;
}

/**
 * Result of spawning agents
 */
interface SpawnAgentsResult {
  type: string;
  spawnedCount: number;
  agentIds: string[];
  poolStatus: AgentPoolStatus;
}

/**
 * Payload for spawning agents
 */
interface SpawnAgentsPayload {
  type: string;
  count?: number;
  config?: Record<string, unknown>;
}

/**
 * Result of terminating an agent
 */
interface TerminateAgentResult {
  agentId: string;
  terminated: boolean;
}

/**
 * Result of changing topology
 */
interface TopologyChangeResult {
  oldMode: string;
  newMode: string;
  nodes: number;
  connections: number;
  efficiency: number;
}

/**
 * Result of scaling an agent pool
 */
interface ScalePoolResult {
  type: string;
  spawnedCount?: number;
  agentIds?: string[];
  poolStatus?: AgentPoolStatus;
  terminatedCount?: number;
  reason?: string;
}

/**
 * Result of recovering an agent
 */
interface RecoverAgentResult {
  agentId: string;
  recovered: boolean;
  newAgentId?: string;
  attempts?: number;
  reason?: string;
}

/**
 * Fleet status response
 */
interface FleetStatusResult {
  fleetId: string;
  status: string;
  topology: string;
  totalAgents: number;
  activeAgents: number;
  agentPools: Record<string, {
    active: number;
    idle: number;
    busy: number;
    failed: number;
    utilization: string;
  }>;
  resourceUtilization: {
    cpu: string;
    memory: string;
  };
  workloadQueue: number;
  activeConflicts: number;
  timestamp: Date;
}

/**
 * Detailed status response
 */
interface DetailedStatusResult {
  fleetMetrics: FleetMetrics;
  topology: TopologyState;
  agentPools: Record<string, AgentPoolStatus>;
  resourceAllocations: Record<string, ResourceAllocation>;
  activeConflicts: Record<string, ConflictResolution>;
  workloadQueueSize: number;
  scalingHistory: ScalingDecision[];
}

/**
 * Result of conflict resolution
 */
interface ConflictResolutionResult {
  conflictId: string;
  type: ConflictResolution['type'];
  agents: string[];
  severity: ConflictResolution['severity'];
  strategy: string;
  resolved: boolean;
  timestamp: Date;
  resolution: unknown;
}

/**
 * Union type for all possible task results from performTask
 */
type FleetTaskResult =
  | FleetInitResult
  | SpawnResult
  | TerminateAgentResult
  | TopologyChangeResult
  | RebalanceResult
  | ConflictResolutionResult
  | FleetStatusResult
  | FleetMetrics
  | ScalePoolResult
  | RecoverAgentResult
  | ResilienceResult
  | SPOFResult[]
  | TopologyOptimizationResult
  | null;

export interface FleetCommanderConfig extends BaseAgentConfig {
  topology?: 'hierarchical' | 'mesh' | 'hybrid' | 'adaptive';
  maxAgents?: number;
  agentPools?: {
    [key: string]: {
      min: number;
      max: number;
      priority: 'low' | 'medium' | 'high' | 'critical';
    };
  };
  resourceLimits?: {
    cpuPerAgent: number;
    memoryPerAgent: string;
    maxConcurrent: number;
  };
  autoScaling?: {
    enabled: boolean;
    scaleUpThreshold: number;
    scaleDownThreshold: number;
    cooldownPeriod: number;
  };
  faultTolerance?: {
    heartbeatInterval: number;
    heartbeatTimeout: number;
    maxRetries: number;
  };
  /** Enable SPOF analysis using min-cut algorithms */
  spofAnalysis?: {
    enabled: boolean;
    /** Minimum resilience score threshold (0-1) */
    minResilienceScore?: number;
    /** Auto-warn on topology changes with critical SPOFs */
    autoWarn?: boolean;
  };
}

export interface AgentPoolStatus {
  type: string;
  active: number;
  idle: number;
  busy: number;
  failed: number;
  minSize: number;
  maxSize: number;
  priority: string;
  utilization: number;
}

export interface ResourceAllocation {
  agentId: string;
  cpu: number;
  memory: string;
  priority: string;
  allocated: boolean;
}

export interface TopologyState {
  mode: 'hierarchical' | 'mesh' | 'hybrid' | 'adaptive';
  nodes: number;
  connections: number;
  efficiency: number;
  lastChanged: Date;
  [key: string]: unknown;
}

export interface ConflictResolution {
  type: 'resource-contention' | 'deadlock' | 'priority-conflict';
  agents: string[];
  severity: 'low' | 'medium' | 'high' | 'critical';
  strategy: string;
  resolved: boolean;
  timestamp: Date;
  [key: string]: unknown;
}

/**
 * Configuration for spawning new agents
 */
export interface SpawnConfig {
  /** CPU allocation for the agent */
  cpu?: number;
  /** Memory allocation (e.g., '512MB', '1GB') */
  memory?: string;
  /** Priority level for resource allocation */
  priority?: 'low' | 'medium' | 'high' | 'critical';
  /** Custom capabilities for the agent */
  capabilities?: string[];
  /** Initial context data for the agent */
  context?: Record<string, unknown>;
  /** Whether to enable fault tolerance for this agent */
  faultTolerant?: boolean;
  /** Maximum retry attempts for agent recovery */
  maxRetries?: number;
  /** Whether the resource is already allocated */
  allocated?: boolean;
}

/**
 * Payload for agent spawn requests
 */
export interface SpawnPayload {
  type: string;
  count?: number;
  config?: SpawnConfig;
}

/**
 * Result of agent spawn operation
 */
export interface SpawnResult {
  type: string;
  spawnedCount: number;
  agentIds: string[];
  poolStatus: AgentPoolStatus;
}

export interface ScalingDecision {
  action: 'scale-up' | 'scale-down' | 'no-action';
  agentType: string;
  currentCount: number;
  targetCount: number;
  reason: string;
  timestamp: Date;
}

export interface FleetMetrics {
  totalAgents: number;
  activeAgents: number;
  idleAgents: number;
  busyAgents: number;
  failedAgents: number;
  avgCpuUtilization: number;
  avgMemoryUtilization: number;
  totalTasksCompleted: number;
  avgTaskCompletionTime: number;
  failureRate: number;
  throughput: number;
  [key: string]: unknown;
}

export class FleetCommanderAgent extends BaseAgent {
  private config: FleetCommanderConfig;
  private agentPools: Map<string, AgentPoolStatus> = new Map();
  private resourceAllocations: Map<string, ResourceAllocation> = new Map();
  private topologyState: TopologyState;
  private activeConflicts: Map<string, ConflictResolution> = new Map();
  private scalingHistory: ScalingDecision[] = [];
  private agentHealthChecks: Map<string, Date> = new Map();
  private workloadQueue: QETask[] = [];
  private heartbeatMonitorInterval?: NodeJS.Timeout;
  private autoScalingMonitorInterval?: NodeJS.Timeout;
  /** Min-cut based topology analyzer for SPOF detection */
  private topologyAnalyzer?: TopologyMinCutAnalyzer;
  /** Last resilience analysis result */
  private lastResilienceResult?: ResilienceResult;
  private fleetMetrics: FleetMetrics = {
    totalAgents: 0,
    activeAgents: 0,
    idleAgents: 0,
    busyAgents: 0,
    failedAgents: 0,
    avgCpuUtilization: 0,
    avgMemoryUtilization: 0,
    totalTasksCompleted: 0,
    avgTaskCompletionTime: 0,
    failureRate: 0,
    throughput: 0
  };

  constructor(config: FleetCommanderConfig) {
    super({
      id: config.id || `fleet-commander-${Date.now()}`,
      type: QEAgentType.FLEET_COMMANDER,
      capabilities: [
        {
          name: 'agent-lifecycle-management',
          version: '2.0.0',
          description: 'Spawn, monitor, coordinate, and terminate QE agents'
        },
        {
          name: 'resource-allocation',
          version: '2.0.0',
          description: 'Optimize CPU, memory, and I/O resource distribution'
        },
        {
          name: 'topology-optimization',
          version: '2.0.0',
          description: 'Dynamically adjust coordination topologies'
        },
        {
          name: 'conflict-resolution',
          version: '2.0.0',
          description: 'Resolve resource conflicts and deadlocks'
        },
        {
          name: 'load-balancing',
          version: '2.0.0',
          description: 'Sublinear scheduling and workload distribution'
        },
        {
          name: 'fault-tolerance',
          version: '2.0.0',
          description: 'Failure detection and recovery'
        },
        {
          name: 'auto-scaling',
          version: '2.0.0',
          description: 'Demand-based agent pool scaling'
        },
        {
          name: 'performance-monitoring',
          version: '2.0.0',
          description: 'Fleet-wide metrics and optimization'
        }
      ],
      context: config.context,
      memoryStore: config.memoryStore,
      eventBus: config.eventBus
    });

    this.config = {
      topology: 'hierarchical',
      maxAgents: 50,
      agentPools: {
        [QEAgentType.TEST_GENERATOR]: { min: 2, max: 10, priority: 'high' },
        [QEAgentType.TEST_EXECUTOR]: { min: 3, max: 15, priority: 'critical' },
        [QEAgentType.COVERAGE_ANALYZER]: { min: 1, max: 5, priority: 'high' },
        [QEAgentType.QUALITY_GATE]: { min: 1, max: 3, priority: 'medium' },
        [QEAgentType.QUALITY_ANALYZER]: { min: 1, max: 5, priority: 'medium' },
        [QEAgentType.PERFORMANCE_TESTER]: { min: 1, max: 5, priority: 'medium' },
        [QEAgentType.SECURITY_SCANNER]: { min: 1, max: 3, priority: 'high' }
      },
      resourceLimits: {
        cpuPerAgent: 0.5,
        memoryPerAgent: '512MB',
        maxConcurrent: 20
      },
      autoScaling: {
        enabled: true,
        scaleUpThreshold: 0.85,
        scaleDownThreshold: 0.30,
        cooldownPeriod: 60000
      },
      faultTolerance: {
        heartbeatInterval: 5000,
        heartbeatTimeout: 15000,
        maxRetries: 3
      },
      spofAnalysis: {
        enabled: true,
        minResilienceScore: 0.6,
        autoWarn: true,
      },
      ...config
    };

    this.topologyState = {
      mode: this.config.topology!,
      nodes: 0,
      connections: 0,
      efficiency: 1.0,
      lastChanged: new Date()
    };

    // Initialize SPOF analyzer if enabled
    if (this.config.spofAnalysis?.enabled) {
      this.topologyAnalyzer = new TopologyMinCutAnalyzer({
        minResilienceScore: this.config.spofAnalysis.minResilienceScore,
        analyzeAllSpofs: true,
      });
    }

    this.initializeAgentPools();
  }

  // ============================================================================
  // Lifecycle Hooks for Fleet Coordination
  // ============================================================================

  /**
   * Pre-task hook - Load fleet coordination state before task execution
   */
  protected async onPreTask(data: PreTaskData): Promise<void> {
    // Call parent implementation first (includes AgentDB loading)
    await super.onPreTask(data);

    // Load fleet coordination state and resource allocations
    const fleetState = await this.memoryStore.retrieve(
      `aqe/${this.agentId.type}/fleet-state`
    ) as { activeAgents?: number } | null;

    if (fleetState) {
      console.log(`Loaded fleet state with ${fleetState.activeAgents || 0} active agents`);
    }

    console.log(`[${this.agentId.type}] Starting fleet coordination task`, {
      taskId: data.assignment.id,
      taskType: data.assignment.task.type
    });
  }

  /**
   * Post-task hook - Store coordination results and emit fleet events
   */
  protected async onPostTask(data: PostTaskData): Promise<void> {
    // Call parent implementation first (includes AgentDB storage, learning)
    await super.onPostTask(data);

    // Type-safe access to result properties
    const result = data.result as Record<string, unknown> | undefined;
    const success = result?.success !== false;
    const agentsCoordinated = (result?.agentsCoordinated as number) || 0;

    // Store fleet coordination results
    await this.memoryStore.store(
      `aqe/${this.agentId.type}/results/${data.assignment.id}`,
      {
        result: data.result,
        timestamp: new Date(),
        taskType: data.assignment.task.type,
        success,
        agentsCoordinated
      },
      86400 // 24 hours
    );

    // Emit fleet coordination event for other agents
    this.eventBus.emit(`${this.agentId.type}:completed`, {
      agentId: this.agentId,
      result: data.result,
      timestamp: new Date(),
      fleetMetrics: this.fleetMetrics
    });

    console.log(`[${this.agentId.type}] Fleet coordination task completed`, {
      taskId: data.assignment.id,
      agentsManaged: this.fleetMetrics.totalAgents
    });
  }

  /**
   * Task error hook - Handle fleet coordination failures
   */
  protected async onTaskError(data: TaskErrorData): Promise<void> {
    // Call parent implementation
    await super.onTaskError(data);

    // Store fleet coordination error for analysis
    await this.memoryStore.store(
      `aqe/${this.agentId.type}/errors/${Date.now()}`,
      {
        taskId: data.assignment.id,
        error: data.error.message,
        stack: data.error.stack,
        timestamp: new Date(),
        taskType: data.assignment.task.type,
        fleetState: {
          totalAgents: this.fleetMetrics.totalAgents,
          activeAgents: this.fleetMetrics.activeAgents
        }
      },
      604800 // 7 days
    );

    // Emit fleet error event
    this.eventBus.emit(`${this.agentId.type}:error`, {
      agentId: this.agentId,
      error: data.error,
      taskId: data.assignment.id,
      timestamp: new Date()
    });

    console.error(`[${this.agentId.type}] Fleet coordination task failed`, {
      taskId: data.assignment.id,
      error: data.error.message
    });
  }

  // ============================================================================
  // BaseAgent Abstract Methods Implementation
  // ============================================================================

  protected async initializeComponents(): Promise<void> {
    console.log(`[FleetCommander] Initializing fleet coordination for ${this.config.maxAgents} agents`);

    // Register event handlers for fleet coordination
    this.registerEventHandler({
      eventType: 'agent.spawned',
      handler: async (event) => {
        await this.handleAgentSpawned(event.data as AgentSpawnedEventData);
      }
    });

    this.registerEventHandler({
      eventType: 'agent.terminated',
      handler: async (event) => {
        await this.handleAgentTerminated(event.data as AgentTerminatedEventData);
      }
    });

    this.registerEventHandler({
      eventType: 'agent.error',
      handler: async (event) => {
        await this.handleAgentError(event.data as AgentErrorEventData);
      }
    });

    this.registerEventHandler({
      eventType: 'task:submitted',
      handler: async (event) => {
        await this.handleTaskSubmitted(event.data as TaskSubmittedEventData);
      }
    });

    this.registerEventHandler({
      eventType: 'task:completed',
      handler: async (event) => {
        await this.handleTaskCompleted(event.data as TaskCompletedEventData);
      }
    });

    // Start heartbeat monitoring (only in production, not in tests)
    if (this.config.faultTolerance?.heartbeatInterval && process.env.NODE_ENV !== 'test') {
      this.startHeartbeatMonitoring();
    }

    // Start auto-scaling monitor (only in production, not in tests)
    if (this.config.autoScaling?.enabled && process.env.NODE_ENV !== 'test') {
      this.startAutoScalingMonitor();
    }

    // Store initial topology
    await this.storeSharedMemory('topology', this.topologyState);
    await this.memoryStore.store('aqe/fleet/topology', this.topologyState);

    console.log('[FleetCommander] Initialization complete');
  }

  protected async performTask(task: QETask): Promise<FleetTaskResult> {
    console.log(`[FleetCommander] Performing task: ${task.type}`);
    const payload = task.payload as Record<string, unknown>;

    switch (task.type) {
      case 'fleet-initialize':
        return await this.initializeFleet(payload as FleetInitConfig);

      case 'agent-spawn':
        return await this.spawnAgents(payload as unknown as SpawnPayload);

      case 'agent-terminate':
        return await this.terminateAgent(payload as { agentId: string });

      case 'topology-change':
        return await this.changeTopology(payload as { mode: 'hierarchical' | 'mesh' | 'adaptive' | 'hybrid' });

      case 'rebalance-load':
        return await this.rebalanceWorkload(payload as Record<string, unknown>);

      case 'resolve-conflict':
        return await this.resolveConflict(payload as { type: ConflictResolution['type']; agents: string[]; severity?: ConflictResolution['severity']; allocation?: ResourceAllocation });

      case 'fleet-status':
        return await this.getFleetStatus();

      case 'fleet-metrics':
        return await this.getFleetMetrics();

      case 'scale-pool':
        return await this.scaleAgentPool(payload as { type: string; action: 'scale-up' | 'scale-down'; count?: number });

      case 'recover-agent':
        return await this.recoverAgent(payload as { agentId: string });

      case 'topology-analyze':
        return await this.analyzeTopologyResilience();

      case 'topology-spof-check':
        return await this.getTopologySpofs();

      case 'topology-optimize':
        return await this.getTopologyOptimizations();

      default:
        throw new Error(`Unknown task type: ${task.type}`);
    }
  }

  protected async loadKnowledge(): Promise<void> {
    console.log('[FleetCommander] Loading fleet knowledge from memory');

    try {
      // Restore topology state
      const savedTopology = await this.memoryStore.retrieve('aqe/fleet/topology') as TopologyState | null;
      if (savedTopology) {
        this.topologyState = savedTopology;
      }

      // Restore agent pool status
      const savedPools = await this.memoryStore.retrieve('aqe/fleet/agents/pools') as Record<string, AgentPoolStatus> | null;
      if (savedPools) {
        this.agentPools = new Map(Object.entries(savedPools));
      }

      // Restore resource allocations
      const savedAllocations = await this.memoryStore.retrieve('aqe/fleet/resources/allocation') as Record<string, ResourceAllocation> | null;
      if (savedAllocations) {
        this.resourceAllocations = new Map(Object.entries(savedAllocations));
      }

      // Restore metrics
      const savedMetrics = await this.memoryStore.retrieve('aqe/fleet/metrics/performance') as Partial<FleetMetrics> | null;
      if (savedMetrics) {
        this.fleetMetrics = { ...this.fleetMetrics, ...savedMetrics };
      }

    } catch (error) {
      console.warn('[FleetCommander] Could not restore full state, using defaults:', error);
    }
  }

  protected async cleanup(): Promise<void> {
    console.log('[FleetCommander] Cleaning up fleet resources');

    // REFACTORED: No longer need to clear intervals
    // Async loops will terminate when status !== ACTIVE
    // (Lifecycle-driven cleanup, no manual timer management)

    // Save current state
    await this.memoryStore.store('aqe/fleet/topology', this.topologyState);
    await this.memoryStore.store('aqe/fleet/agents/pools', Object.fromEntries(this.agentPools));
    await this.memoryStore.store('aqe/fleet/resources/allocation', Object.fromEntries(this.resourceAllocations));
    await this.memoryStore.store('aqe/fleet/metrics/performance', this.fleetMetrics);

    // Clear active conflicts
    this.activeConflicts.clear();
    this.agentHealthChecks.clear();
    this.workloadQueue = [];
  }

  // ============================================================================
  // Fleet Initialization
  // ============================================================================

  private async initializeFleet(_config: FleetInitConfig): Promise<FleetInitResult> {
    console.log('[FleetCommander] Initializing fleet with config:', _config);

    const results: FleetInitResult = {
      topology: this.topologyState.mode,
      poolsInitialized: [],
      totalAgents: 0,
      status: 'success'
    };

    // Initialize agent pools based on configuration
    for (const [agentType, poolConfig] of Object.entries(this.config.agentPools || {})) {
      // Spawn minimum required agents for each pool
      for (let i = 0; i < poolConfig.min; i++) {
        await this.requestAgentSpawn(agentType, poolConfig.priority);
        results.totalAgents++;
      }

      results.poolsInitialized.push(agentType);
    }

    // Store initialization results
    await this.memoryStore.store('aqe/fleet/initialization', {
      timestamp: new Date(),
      config: this.config,
      results
    });

    return results;
  }

  private initializeAgentPools(): void {
    for (const [agentType, poolConfig] of Object.entries(this.config.agentPools || {})) {
      this.agentPools.set(agentType, {
        type: agentType,
        active: 0,
        idle: 0,
        busy: 0,
        failed: 0,
        minSize: poolConfig.min,
        maxSize: poolConfig.max,
        priority: poolConfig.priority,
        utilization: 0
      });
    }
  }

  // ============================================================================
  // Agent Lifecycle Management
  // ============================================================================

  private async spawnAgents(payload: SpawnPayload): Promise<SpawnResult> {
    const { type, count = 1, config = {} } = payload;
    const spawnedAgents: string[] = [];

    console.log(`[FleetCommander] Spawning ${count} agent(s) of type ${type}`);

    const poolStatus = this.agentPools.get(type);
    if (!poolStatus) {
      throw new Error(`Unknown agent type: ${type}`);
    }

    // Check if we can spawn more agents
    const totalActive = poolStatus.active + poolStatus.busy;
    if (totalActive + count > poolStatus.maxSize) {
      throw new Error(`Cannot spawn ${count} agents: would exceed max pool size of ${poolStatus.maxSize}`);
    }

    // Check total fleet limit
    if (this.fleetMetrics.totalAgents + count > (this.config.maxAgents || 50)) {
      throw new Error(`Cannot spawn ${count} agents: would exceed fleet limit of ${this.config.maxAgents}`);
    }

    for (let i = 0; i < count; i++) {
      const agentId = await this.requestAgentSpawn(type, poolStatus.priority, config);
      spawnedAgents.push(agentId);
    }

    // Update pool status
    poolStatus.active += count;
    poolStatus.idle += count;
    this.agentPools.set(type, poolStatus);

    // Update fleet metrics
    this.fleetMetrics.totalAgents += count;
    this.fleetMetrics.activeAgents += count;
    this.fleetMetrics.idleAgents += count;

    return {
      type,
      spawnedCount: count,
      agentIds: spawnedAgents,
      poolStatus: { ...poolStatus }
    };
  }

  private async terminateAgent(payload: { agentId: string }): Promise<TerminateAgentResult> {
    const { agentId } = payload;
    console.log(`[FleetCommander] Terminating agent ${agentId}`);

    // Remove resource allocation
    const allocation = this.resourceAllocations.get(agentId);
    if (allocation) {
      this.resourceAllocations.delete(agentId);
    }

    // Remove health check
    this.agentHealthChecks.delete(agentId);

    // Emit termination event
    this.emitEvent('agent.terminate-request', { agentId }, 'high');

    return { agentId, terminated: true };
  }

  private async handleAgentSpawned(data: AgentSpawnedEventData): Promise<void> {
    const { agentId, type } = data;
    console.log(`[FleetCommander] Agent spawned: ${agentId} (${type})`);

    // Initialize health check
    this.agentHealthChecks.set(agentId, new Date());

    // Allocate resources
    const allocation = await this.allocateResources(agentId, type);
    this.resourceAllocations.set(agentId, allocation);

    // Update topology
    this.topologyState.nodes++;
    await this.updateTopologyConnections();

    // Store in memory
    await this.memoryStore.store(`aqe/fleet/agents/${agentId}`, {
      id: agentId,
      type,
      status: AgentStatus.ACTIVE,
      spawnedAt: new Date(),
      allocation
    });
  }

  private async handleAgentTerminated(data: AgentTerminatedEventData): Promise<void> {
    const { agentId } = data;
    console.log(`[FleetCommander] Agent terminated: ${agentId}`);

    // Find agent type and update pool
    const agentData = await this.memoryStore.retrieve(`aqe/fleet/agents/${agentId}`) as { type?: string } | null;
    if (agentData?.type) {
      const poolStatus = this.agentPools.get(agentData.type);
      if (poolStatus) {
        poolStatus.active = Math.max(0, poolStatus.active - 1);
        poolStatus.idle = Math.max(0, poolStatus.idle - 1);
        this.agentPools.set(agentData.type, poolStatus);
      }
    }

    // Update fleet metrics
    this.fleetMetrics.totalAgents = Math.max(0, this.fleetMetrics.totalAgents - 1);
    this.fleetMetrics.activeAgents = Math.max(0, this.fleetMetrics.activeAgents - 1);

    // Remove from memory
    await this.memoryStore.delete(`aqe/fleet/agents/${agentId}`);

    // Update topology
    this.topologyState.nodes = Math.max(0, this.topologyState.nodes - 1);
  }

  private async handleAgentError(data: AgentErrorEventData): Promise<void> {
    const { agentId, error } = data;
    console.error(`[FleetCommander] Agent error: ${agentId}`, error);

    // Update fleet metrics
    this.fleetMetrics.failedAgents++;

    // Attempt recovery
    await this.recoverAgent({ agentId });
  }

  // ============================================================================
  // Resource Allocation
  // ============================================================================

  private async allocateResources(agentId: string, agentType: string): Promise<ResourceAllocation> {
    const poolConfig = this.config.agentPools?.[agentType];
    const priority = poolConfig?.priority || 'medium';

    const allocation: ResourceAllocation = {
      agentId,
      cpu: this.config.resourceLimits?.cpuPerAgent || 0.5,
      memory: this.config.resourceLimits?.memoryPerAgent || '512MB',
      priority,
      allocated: true
    };

    // Check for resource conflicts
    const hasConflict = await this.detectResourceConflict(allocation);
    if (hasConflict) {
      await this.resolveConflict({
        type: 'resource-contention',
        agents: [agentId],
        allocation
      });
    }

    return allocation;
  }

  private async detectResourceConflict(allocation: ResourceAllocation): Promise<boolean> {
    // Calculate total resource usage
    let totalCpu = allocation.cpu;
    let totalMemory = this.parseMemory(allocation.memory);

    for (const alloc of this.resourceAllocations.values()) {
      totalCpu += alloc.cpu;
      totalMemory += this.parseMemory(alloc.memory);
    }

    // Check if we exceed limits
    const maxConcurrent = this.config.resourceLimits?.maxConcurrent || 20;
    const cpuLimit = maxConcurrent * (this.config.resourceLimits?.cpuPerAgent || 0.5);
    const memoryLimit = maxConcurrent * this.parseMemory(this.config.resourceLimits?.memoryPerAgent || '512MB');

    return totalCpu > cpuLimit || totalMemory > memoryLimit;
  }

  private parseMemory(memStr: string): number {
    const match = memStr.match(/^(\d+)(MB|GB)$/);
    if (!match) return 512;

    const value = parseInt(match[1], 10);
    const unit = match[2];

    return unit === 'GB' ? value * 1024 : value;
  }

  // ============================================================================
  // Topology Management
  // ============================================================================

  private async changeTopology(payload: { mode: 'hierarchical' | 'mesh' | 'hybrid' | 'adaptive' }): Promise<TopologyChangeResult> {
    const { mode } = payload;
    console.log(`[FleetCommander] Changing topology from ${this.topologyState.mode} to ${mode}`);

    const oldMode = this.topologyState.mode;
    this.topologyState.mode = mode;
    this.topologyState.lastChanged = new Date();

    // Recalculate connections based on new topology
    await this.updateTopologyConnections();

    // Broadcast topology change
    this.emitEvent('fleet.topology-changed', {
      oldMode,
      newMode: mode,
      reason: 'manual-change',
      timestamp: new Date()
    }, 'high');

    // Store in memory
    await this.memoryStore.store('aqe/fleet/topology', this.topologyState);

    return {
      oldMode,
      newMode: mode,
      nodes: this.topologyState.nodes,
      connections: this.topologyState.connections,
      efficiency: this.topologyState.efficiency
    };
  }

  private async updateTopologyConnections(): Promise<void> {
    const n = this.topologyState.nodes;

    switch (this.topologyState.mode) {
      case 'hierarchical':
        // Tree structure: n-1 connections
        this.topologyState.connections = Math.max(0, n - 1);
        this.topologyState.efficiency = 1.0;
        break;

      case 'mesh':
        // Full mesh: n*(n-1)/2 connections
        this.topologyState.connections = n > 1 ? (n * (n - 1)) / 2 : 0;
        this.topologyState.efficiency = n > 1 ? 0.9 : 1.0;
        break;

      case 'hybrid':
        // Combination: hierarchical + some mesh connections
        this.topologyState.connections = Math.max(0, n - 1) + Math.floor(n / 2);
        this.topologyState.efficiency = 0.95;
        break;

      case 'adaptive':
        // Adaptive based on load
        this.topologyState.connections = this.calculateAdaptiveConnections(n);
        this.topologyState.efficiency = this.calculateTopologyEfficiency();
        break;
    }
  }

  private calculateAdaptiveConnections(nodes: number): number {
    const utilization = this.calculateFleetUtilization();

    if (utilization < 0.3) {
      // Low utilization: hierarchical
      return Math.max(0, nodes - 1);
    } else if (utilization < 0.7) {
      // Medium utilization: hybrid
      return Math.max(0, nodes - 1) + Math.floor(nodes / 2);
    } else {
      // High utilization: mesh
      return nodes > 1 ? (nodes * (nodes - 1)) / 2 : 0;
    }
  }

  private calculateTopologyEfficiency(): number {
    const utilization = this.calculateFleetUtilization();
    const mode = this.topologyState.mode;

    if (mode === 'adaptive') {
      // Efficiency varies with utilization
      return 1.0 - (utilization * 0.1);
    }

    return this.topologyState.efficiency;
  }

  // ============================================================================
  // Topology Resilience Analysis (Min-Cut SPOF Detection)
  // ============================================================================

  /**
   * Analyze current topology for resilience and SPOFs
   *
   * Uses min-cut algorithm to detect single points of failure
   * and calculate overall topology resilience score.
   */
  private async analyzeTopologyResilience(): Promise<ResilienceResult | null> {
    if (!this.topologyAnalyzer) {
      console.warn('[FleetCommander] SPOF analysis disabled');
      return null;
    }

    console.log('[FleetCommander] Analyzing topology resilience...');

    const fleetTopology = await this.buildFleetTopology();
    const result = await this.topologyAnalyzer.analyzeResilience(fleetTopology);

    // Store result for caching
    this.lastResilienceResult = result;

    // Store in memory for other agents
    await this.memoryStore.store('aqe/fleet/resilience', {
      result,
      timestamp: new Date(),
    });

    // Auto-warn if enabled and critical SPOFs detected
    if (this.config.spofAnalysis?.autoWarn && result.criticalSpofs.length > 0) {
      this.emitEvent('fleet.spof-warning', {
        criticalSpofs: result.criticalSpofs,
        resilienceScore: result.score,
        grade: result.grade,
        recommendations: result.recommendations,
      }, 'critical');

      console.warn(
        `[FleetCommander] WARNING: ${result.criticalSpofs.length} critical SPOF(s) detected. ` +
        `Resilience score: ${(result.score * 100).toFixed(1)}% (Grade: ${result.grade})`
      );
    }

    return result;
  }

  /**
   * Get detected SPOFs in current topology
   */
  private async getTopologySpofs(): Promise<SPOFResult[]> {
    if (!this.topologyAnalyzer) {
      return [];
    }

    const fleetTopology = await this.buildFleetTopology();
    return await this.topologyAnalyzer.detectSpofs(fleetTopology);
  }

  /**
   * Get topology optimization suggestions
   */
  private async getTopologyOptimizations(): Promise<TopologyOptimizationResult> {
    if (!this.topologyAnalyzer) {
      return { optimizations: [], message: 'SPOF analysis disabled' };
    }

    const fleetTopology = await this.buildFleetTopology();
    const optimizations = await this.topologyAnalyzer.suggestOptimizations(
      fleetTopology,
      this.lastResilienceResult
    );

    return {
      optimizations,
      currentResilience: this.lastResilienceResult?.score,
      currentGrade: this.lastResilienceResult?.grade,
    };
  }

  /**
   * Build FleetTopology from current agent state
   */
  private async buildFleetTopology(): Promise<FleetTopology> {
    const nodes: TopologyNode[] = [];
    const edges: TopologyEdge[] = [];

    // Build nodes from agent pools and allocations
    for (const [agentId, allocation] of this.resourceAllocations.entries()) {
      const agentData = await this.memoryStore.retrieve(`aqe/fleet/agents/${agentId}`) as { type?: string; status?: string } | null;
      if (!agentData) continue;

      // Determine role based on agent type
      let role: TopologyNode['role'] = 'worker';
      if (agentData.type === QEAgentType.FLEET_COMMANDER) {
        role = 'coordinator';
      }

      nodes.push({
        id: agentId,
        type: agentData.type || 'unknown',
        role,
        status: (agentData.status || 'active') as TopologyNode['status'],
        priority: allocation.priority as TopologyNode['priority'],
      });
    }

    // Add self (FleetCommander) as coordinator if not already present
    const selfId = this.agentId.id;
    if (!nodes.find(n => n.id === selfId)) {
      nodes.push({
        id: selfId,
        type: QEAgentType.FLEET_COMMANDER,
        role: 'coordinator',
        status: 'active',
        priority: 'critical',
      });
    }

    // Build edges based on topology mode
    const nodeIds = nodes.map(n => n.id);
    switch (this.topologyState.mode) {
      case 'hierarchical':
        // Star topology: commander connects to all workers
        for (const nodeId of nodeIds) {
          if (nodeId !== selfId) {
            edges.push({
              id: `${selfId}-${nodeId}`,
              sourceId: selfId,
              targetId: nodeId,
              connectionType: 'command',
              weight: 1.0,
              bidirectional: true,
            });
          }
        }
        break;

      case 'mesh':
        // Full mesh: all nodes connected
        for (let i = 0; i < nodeIds.length; i++) {
          for (let j = i + 1; j < nodeIds.length; j++) {
            edges.push({
              id: `${nodeIds[i]}-${nodeIds[j]}`,
              sourceId: nodeIds[i],
              targetId: nodeIds[j],
              connectionType: 'coordination',
              weight: 1.0,
              bidirectional: true,
            });
          }
        }
        break;

      case 'hybrid':
        // Hierarchical + some cross-connections
        for (const nodeId of nodeIds) {
          if (nodeId !== selfId) {
            edges.push({
              id: `${selfId}-${nodeId}`,
              sourceId: selfId,
              targetId: nodeId,
              connectionType: 'command',
              weight: 1.0,
              bidirectional: true,
            });
          }
        }
        // Add some peer connections between workers
        const workers = nodeIds.filter(id => id !== selfId);
        for (let i = 0; i < workers.length - 1; i += 2) {
          if (workers[i + 1]) {
            edges.push({
              id: `${workers[i]}-${workers[i + 1]}`,
              sourceId: workers[i],
              targetId: workers[i + 1],
              connectionType: 'data',
              weight: 0.5,
              bidirectional: true,
            });
          }
        }
        break;

      case 'adaptive':
        // Dynamic based on utilization
        const utilization = this.calculateFleetUtilization();
        if (utilization < 0.5) {
          // Low load: hierarchical
          for (const nodeId of nodeIds) {
            if (nodeId !== selfId) {
              edges.push({
                id: `${selfId}-${nodeId}`,
                sourceId: selfId,
                targetId: nodeId,
                connectionType: 'command',
                weight: 1.0,
                bidirectional: true,
              });
            }
          }
        } else {
          // High load: mesh for better distribution
          for (let i = 0; i < nodeIds.length; i++) {
            for (let j = i + 1; j < nodeIds.length; j++) {
              edges.push({
                id: `${nodeIds[i]}-${nodeIds[j]}`,
                sourceId: nodeIds[i],
                targetId: nodeIds[j],
                connectionType: 'coordination',
                weight: 1.0,
                bidirectional: true,
              });
            }
          }
        }
        break;
    }

    return {
      nodes,
      edges,
      mode: this.topologyState.mode,
      lastUpdated: new Date(),
    };
  }

  /**
   * Get last resilience analysis result (cached)
   */
  public getLastResilienceResult(): ResilienceResult | undefined {
    return this.lastResilienceResult;
  }

  // ============================================================================
  // Load Balancing
  // ============================================================================

  private async rebalanceWorkload(_payload: Record<string, unknown>): Promise<RebalanceResult> {
    console.log('[FleetCommander] Rebalancing workload across fleet');

    const rebalancingStrategy = await this.calculateRebalancingStrategy();

    // Apply load balancing
    for (const [agentType, targetUtilization] of Object.entries(rebalancingStrategy)) {
      const poolStatus = this.agentPools.get(agentType);
      if (poolStatus) {
        poolStatus.utilization = targetUtilization;
        this.agentPools.set(agentType, poolStatus);
      }
    }

    // Store results
    await this.memoryStore.store('aqe/fleet/load-balancing', {
      timestamp: new Date(),
      strategy: rebalancingStrategy,
      fleetUtilization: this.calculateFleetUtilization()
    });

    return {
      strategy: rebalancingStrategy,
      fleetUtilization: this.calculateFleetUtilization(),
      timestamp: new Date()
    };
  }

  private async calculateRebalancingStrategy(): Promise<Record<string, number>> {
    const strategy: Record<string, number> = {};
    const targetUtilization = 0.75;

    for (const [agentType, poolStatus] of this.agentPools.entries()) {
      const currentUtilization = poolStatus.utilization || 0;

      // Use sublinear algorithm to calculate optimal utilization
      const optimalUtilization = this.optimizeUtilization(currentUtilization, targetUtilization);

      strategy[agentType] = optimalUtilization;
    }

    return strategy;
  }

  private optimizeUtilization(current: number, target: number): number {
    // Simple convergence to target (in real implementation, use sublinear algorithms)
    const delta = target - current;
    return current + (delta * 0.5);
  }

  private calculateFleetUtilization(): number {
    const totalAgents = this.fleetMetrics.totalAgents;
    const busyAgents = this.fleetMetrics.busyAgents;

    return totalAgents > 0 ? busyAgents / totalAgents : 0;
  }

  // ============================================================================
  // Conflict Resolution
  // ============================================================================

  private async resolveConflict(payload: {
    type: ConflictResolution['type'];
    agents: string[];
    severity?: ConflictResolution['severity'];
    allocation?: ResourceAllocation;
  }): Promise<ConflictResolutionResult> {
    const { type, agents, severity = 'medium', allocation } = payload;
    console.log(`[FleetCommander] Resolving ${type} conflict involving ${agents.length} agent(s)`);

    const conflictId = `conflict-${Date.now()}`;
    const conflict: ConflictResolution = {
      type,
      agents,
      severity,
      strategy: this.selectResolutionStrategy(type, severity),
      resolved: false,
      timestamp: new Date()
    };

    this.activeConflicts.set(conflictId, conflict);

    let resolution;
    switch (type) {
      case 'resource-contention':
        resolution = await this.resolveResourceContention(agents, allocation);
        break;

      case 'deadlock':
        resolution = await this.resolveDeadlock(agents);
        break;

      case 'priority-conflict':
        resolution = await this.resolvePriorityConflict(agents);
        break;

      default:
        throw new Error(`Unknown conflict type: ${type}`);
    }

    conflict.resolved = true;
    this.activeConflicts.set(conflictId, conflict);

    // Store resolution
    await this.memoryStore.store(`aqe/fleet/conflicts/${conflictId}`, conflict);

    return {
      conflictId,
      ...conflict,
      resolution
    };
  }

  private selectResolutionStrategy(type: string, severity: string): string {
    if (type === 'resource-contention') {
      return severity === 'critical' ? 'priority-weighted' : 'fair-share';
    } else if (type === 'deadlock') {
      return 'timeout-based';
    } else if (type === 'priority-conflict') {
      return 'priority-queue';
    }
    return 'default';
  }

  private async resolveResourceContention(agents: string[], _allocation?: ResourceAllocation): Promise<{
    strategy: string;
    allocation: string;
    deferred: string[];
  }> {
    // Priority-weighted resource allocation
    const agentAllocations = await Promise.all(
      agents.map(async (agentId) => {
        const agentData = await this.memoryStore.retrieve(`aqe/fleet/agents/${agentId}`) as { allocation?: { priority?: string } } | null;
        return {
          agentId,
          priority: agentData?.allocation?.priority || 'medium'
        };
      })
    );

    // Sort by priority
    const priorityOrder = { critical: 4, high: 3, medium: 2, low: 1 };
    agentAllocations.sort((a, b) =>
      priorityOrder[b.priority as keyof typeof priorityOrder] - priorityOrder[a.priority as keyof typeof priorityOrder]
    );

    return {
      strategy: 'priority-weighted',
      allocation: agentAllocations[0].agentId,
      deferred: agentAllocations.slice(1).map(a => a.agentId)
    };
  }

  private async resolveDeadlock(agents: string[]): Promise<{
    strategy: string;
    victim: string;
    action: string;
  }> {
    // Select victim (lowest priority agent) and abort
    const victim = agents[0]; // Simplified: select first agent

    console.log(`[FleetCommander] Breaking deadlock by aborting agent ${victim}`);

    // Terminate victim agent
    await this.terminateAgent({ agentId: victim });

    return {
      strategy: 'timeout-based',
      victim,
      action: 'abort-and-retry'
    };
  }

  private async resolvePriorityConflict(agents: string[]): Promise<{
    strategy: string;
    executionOrder: string[];
  }> {
    // Use priority queue to order execution
    return {
      strategy: 'priority-queue',
      executionOrder: agents
    };
  }

  // ============================================================================
  // Auto-Scaling
  // ============================================================================

  private async scaleAgentPool(payload: { type: string; action: 'scale-up' | 'scale-down'; count?: number }): Promise<ScalePoolResult> {
    const { type, action, count = 1 } = payload;
    console.log(`[FleetCommander] ${action} agent pool ${type} by ${count}`);

    if (action === 'scale-up') {
      return await this.spawnAgents({ type, count });
    } else {
      return await this.scaleDownPool(type, count);
    }
  }

  private async scaleDownPool(agentType: string, count: number): Promise<ScalePoolResult> {
    const poolStatus = this.agentPools.get(agentType);
    if (!poolStatus) {
      throw new Error(`Unknown agent type: ${agentType}`);
    }

    // Ensure we don't go below minimum
    const currentActive = poolStatus.active + poolStatus.busy;
    const targetCount = Math.max(poolStatus.minSize, currentActive - count);
    const terminateCount = currentActive - targetCount;

    if (terminateCount <= 0) {
      return { type: agentType, terminatedCount: 0, reason: 'minimum-pool-size' };
    }

    // Find idle agents to terminate
    const terminatedAgents: string[] = [];
    // In real implementation, query for idle agents and terminate them

    return {
      type: agentType,
      terminatedCount: terminateCount,
      agentIds: terminatedAgents
    };
  }

  /**
   * Start auto-scaling monitor using async event loop
   *
   * REFACTORED: Event-driven async loop replaces setInterval
   * Old pattern: setInterval with status check inside
   * New pattern: while loop checks status before each iteration
   * Benefit: Clean shutdown, no orphaned intervals, deterministic behavior
   */
  private async startAutoScalingMonitor(): Promise<void> {
    const cooldownPeriod = this.config.autoScaling?.cooldownPeriod || 60000;

    while (this.lifecycleManager.getStatus() === AgentStatus.ACTIVE) {
      const decision = await this.makeScalingDecision();

      if (decision.action !== 'no-action') {
        this.scalingHistory.push(decision);

        await this.scaleAgentPool({
          type: decision.agentType,
          action: decision.action,
          count: Math.abs(decision.targetCount - decision.currentCount)
        });
      }

      // Wait for next check (event-driven: status change or timeout)
      await Promise.race([
        this.waitForEvent('fleet-pool-changed', cooldownPeriod),
        new Promise<void>(resolve => setTimeout(resolve, cooldownPeriod))
      ]);
    }
  }

  private async makeScalingDecision(): Promise<ScalingDecision> {
    const utilization = this.calculateFleetUtilization();
    const scaleUpThreshold = this.config.autoScaling?.scaleUpThreshold || 0.85;
    const scaleDownThreshold = this.config.autoScaling?.scaleDownThreshold || 0.30;

    // Determine which pool needs scaling
    let targetPool: string | null = null;
    let maxUtilization = 0;

    for (const [agentType, poolStatus] of this.agentPools.entries()) {
      if (poolStatus.utilization > maxUtilization) {
        maxUtilization = poolStatus.utilization;
        targetPool = agentType;
      }
    }

    if (!targetPool) {
      return {
        action: 'no-action',
        agentType: '',
        currentCount: 0,
        targetCount: 0,
        reason: 'no-pools-available',
        timestamp: new Date()
      };
    }

    const poolStatus = this.agentPools.get(targetPool)!;
    const currentCount = poolStatus.active + poolStatus.busy;

    if (utilization > scaleUpThreshold && currentCount < poolStatus.maxSize) {
      return {
        action: 'scale-up',
        agentType: targetPool,
        currentCount,
        targetCount: Math.min(currentCount + 2, poolStatus.maxSize),
        reason: `utilization-high:${utilization.toFixed(2)}`,
        timestamp: new Date()
      };
    } else if (utilization < scaleDownThreshold && currentCount > poolStatus.minSize) {
      return {
        action: 'scale-down',
        agentType: targetPool,
        currentCount,
        targetCount: Math.max(currentCount - 1, poolStatus.minSize),
        reason: `utilization-low:${utilization.toFixed(2)}`,
        timestamp: new Date()
      };
    }

    return {
      action: 'no-action',
      agentType: targetPool,
      currentCount,
      targetCount: currentCount,
      reason: `utilization-optimal:${utilization.toFixed(2)}`,
      timestamp: new Date()
    };
  }

  // ============================================================================
  // Fault Tolerance
  // ============================================================================

  /**
   * Start heartbeat monitoring using async event loop
   *
   * REFACTORED: Event-driven async loop replaces setInterval
   * Old pattern: setInterval with status check inside
   * New pattern: while loop checks status before each iteration
   * Benefit: Clean shutdown, no orphaned intervals, deterministic behavior
   */
  private async startHeartbeatMonitoring(): Promise<void> {
    const heartbeatInterval = this.config.faultTolerance?.heartbeatInterval || 5000;
    const timeout = this.config.faultTolerance?.heartbeatTimeout || 15000;

    while (this.lifecycleManager.getStatus() === AgentStatus.ACTIVE) {
      const now = new Date();

      for (const [agentId, lastHeartbeat] of this.agentHealthChecks.entries()) {
        const elapsed = now.getTime() - lastHeartbeat.getTime();

        if (elapsed > timeout) {
          console.warn(`[FleetCommander] Agent ${agentId} heartbeat timeout`);
          await this.handleAgentFailure(agentId);
        }
      }

      // Wait for next heartbeat check
      await new Promise<void>(resolve => setTimeout(resolve, heartbeatInterval));
    }
  }

  private async handleAgentFailure(agentId: string): Promise<void> {
    console.error(`[FleetCommander] Agent failure detected: ${agentId}`);

    // Update metrics
    this.fleetMetrics.failedAgents++;

    // Attempt recovery
    await this.recoverAgent({ agentId });
  }

  private async recoverAgent(payload: { agentId: string }): Promise<RecoverAgentResult> {
    const { agentId } = payload;
    console.log(`[FleetCommander] Attempting to recover agent ${agentId}`);

    const agentData = await this.memoryStore.retrieve(`aqe/fleet/agents/${agentId}`) as { type?: string; allocation?: SpawnConfig } | null;
    if (!agentData) {
      return { agentId, recovered: false, reason: 'agent-not-found' };
    }

    const maxRetries = this.config.faultTolerance?.maxRetries || 3;
    let attempt = 0;

    while (attempt < maxRetries) {
      try {
        // Try to respawn the agent
        const result = await this.spawnAgents({
          type: agentData.type || 'unknown',
          count: 1,
          config: agentData.allocation
        });

        return {
          agentId,
          recovered: true,
          newAgentId: result.agentIds[0],
          attempts: attempt + 1
        };
      } catch (error) {
        attempt++;
        console.error(`[FleetCommander] Recovery attempt ${attempt} failed:`, error);
      }
    }

    return {
      agentId,
      recovered: false,
      reason: 'max-retries-exceeded',
      attempts: maxRetries
    };
  }

  // ============================================================================
  // Task Management
  // ============================================================================

  private async handleTaskSubmitted(data: TaskSubmittedEventData): Promise<void> {
    const task = data.task || (data as unknown as QETask);
    this.workloadQueue.push(task);

    // Analyze workload and potentially trigger scaling
    if (this.workloadQueue.length > 10) {
      const decision = await this.makeScalingDecision();
      if (decision.action === 'scale-up') {
        await this.scaleAgentPool({
          type: decision.agentType,
          action: 'scale-up'
        });
      }
    }
  }

  private async handleTaskCompleted(data: TaskCompletedEventData): Promise<void> {
    // Update metrics
    this.fleetMetrics.totalTasksCompleted++;

    // Remove from queue
    const index = this.workloadQueue.findIndex(t => t.id === data.taskId);
    if (index !== -1) {
      this.workloadQueue.splice(index, 1);
    }
  }

  // ============================================================================
  // Status & Metrics
  // ============================================================================

  private async getFleetStatus(): Promise<FleetStatusResult> {
    return {
      fleetId: this.agentId.id,
      status: 'operational',
      topology: this.topologyState.mode,
      totalAgents: this.fleetMetrics.totalAgents,
      activeAgents: this.fleetMetrics.activeAgents,
      agentPools: Object.fromEntries(
        Array.from(this.agentPools.entries()).map(([type, status]) => [
          type,
          {
            active: status.active,
            idle: status.idle,
            busy: status.busy,
            failed: status.failed,
            utilization: `${(status.utilization * 100).toFixed(1)}%`
          }
        ])
      ),
      resourceUtilization: {
        cpu: `${(this.fleetMetrics.avgCpuUtilization * 100).toFixed(1)}%`,
        memory: `${(this.fleetMetrics.avgMemoryUtilization * 100).toFixed(1)}%`
      },
      workloadQueue: this.workloadQueue.length,
      activeConflicts: this.activeConflicts.size,
      timestamp: new Date()
    };
  }

  private async getFleetMetrics(): Promise<FleetMetrics> {
    // Calculate real-time metrics
    this.fleetMetrics.avgCpuUtilization = this.calculateFleetUtilization();
    this.fleetMetrics.avgMemoryUtilization = this.calculateFleetUtilization() * 0.8; // Approximation

    if (this.fleetMetrics.totalTasksCompleted > 0) {
      this.fleetMetrics.throughput = this.fleetMetrics.totalTasksCompleted /
        ((Date.now() - this.agentId.created.getTime()) / 3600000); // tasks per hour
    }

    if (this.fleetMetrics.totalTasksCompleted > 0) {
      this.fleetMetrics.failureRate = this.fleetMetrics.failedAgents /
        this.fleetMetrics.totalTasksCompleted;
    }

    // Store metrics
    await this.memoryStore.store('aqe/fleet/metrics/performance', this.fleetMetrics);

    return { ...this.fleetMetrics };
  }

  // ============================================================================
  // Helper Methods
  // ============================================================================

  private async requestAgentSpawn(type: string, priority: string, config: SpawnConfig = {}): Promise<string> {
    const agentId = `${type}-${Date.now()}-${SecureRandom.randomFloat().toString(36).substring(7)}`;

    // Emit spawn request event
    this.emitEvent('agent.spawn-request', {
      agentId,
      type,
      priority,
      config
    }, 'high');

    return agentId;
  }

  /**
   * Get current fleet commander status with detailed metrics
   */
  public async getDetailedStatus(): Promise<Record<string, unknown> & DetailedStatusResult> {
    return {
      ...this.getStatus(),
      fleetMetrics: await this.getFleetMetrics(),
      topology: this.topologyState,
      agentPools: Object.fromEntries(this.agentPools),
      resourceAllocations: Object.fromEntries(this.resourceAllocations),
      activeConflicts: Object.fromEntries(this.activeConflicts),
      workloadQueueSize: this.workloadQueue.length,
      scalingHistory: this.scalingHistory.slice(-10) // Last 10 scaling decisions
    };
  }

  /**
   * Extract domain-specific metrics for Nightly-Learner
   * Provides rich fleet coordination metrics for pattern learning
   */
  protected extractTaskMetrics(result: FlexibleTaskResult): Record<string, number> {
    const metrics: Record<string, number> = {};

    if (result && typeof result === 'object') {
      // Type-safe access to result object
      const resultObj = result as Record<string, unknown>;

      // Fleet size and composition
      metrics.total_agents = (resultObj.totalAgents as number) || (resultObj.agentCount as number) || 0;
      metrics.active_agents = (resultObj.activeAgents as number) || 0;
      metrics.idle_agents = (resultObj.idleAgents as number) || 0;

      // Task orchestration
      const orchestration = resultObj.orchestration as Record<string, unknown> | undefined;
      if (orchestration) {
        metrics.tasks_distributed = (orchestration.tasksDistributed as number) || 0;
        metrics.tasks_completed = (orchestration.tasksCompleted as number) || 0;
        metrics.tasks_failed = (orchestration.tasksFailed as number) || 0;
        metrics.distribution_efficiency = (orchestration.efficiency as number) || 0;
      }

      // Resource utilization
      const resources = resultObj.resources as Record<string, unknown> | undefined;
      if (resources) {
        metrics.cpu_utilization = (resources.cpuUtilization as number) || 0;
        metrics.memory_utilization = (resources.memoryUtilization as number) || 0;
        metrics.resource_efficiency = (resources.efficiency as number) || 0;
      }

      // Scaling metrics
      const scaling = resultObj.scaling as Record<string, unknown> | undefined;
      if (scaling) {
        metrics.scale_up_events = (scaling.scaleUpEvents as number) || 0;
        metrics.scale_down_events = (scaling.scaleDownEvents as number) || 0;
        metrics.auto_scaling_decisions = (scaling.autoDecisions as number) || 0;
      }

      // Conflict resolution
      const conflicts = resultObj.conflicts as Record<string, unknown> | undefined;
      if (conflicts) {
        metrics.conflicts_detected = (conflicts.detected as number) || 0;
        metrics.conflicts_resolved = (conflicts.resolved as number) || 0;
        metrics.resolution_time_avg = (conflicts.avgResolutionTime as number) || 0;
      }

      // Topology metrics
      const topology = resultObj.topology as Record<string, unknown> | undefined;
      if (topology) {
        metrics.topology_changes = (topology.changes as number) || 0;
        metrics.topology_stability = (topology.stability as number) || 0;
      }

      // Workload queue
      metrics.queue_size = (resultObj.queueSize as number) || (resultObj.workloadQueueSize as number) || 0;
      metrics.queue_wait_time_avg = (resultObj.avgQueueWaitTime as number) || 0;

      // Overall fleet health
      if (typeof resultObj.fleetHealth === 'number') {
        metrics.fleet_health = resultObj.fleetHealth;
      }
    }

    return metrics;
  }
}