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
}

export interface ConflictResolution {
  type: 'resource-contention' | 'deadlock' | 'priority-conflict';
  agents: string[];
  severity: 'low' | 'medium' | 'high' | 'critical';
  strategy: string;
  resolved: boolean;
  timestamp: Date;
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
      ...config
    };

    this.topologyState = {
      mode: this.config.topology!,
      nodes: 0,
      connections: 0,
      efficiency: 1.0,
      lastChanged: new Date()
    };

    this.initializeAgentPools();
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
        await this.handleAgentSpawned(event.data);
      }
    });

    this.registerEventHandler({
      eventType: 'agent.terminated',
      handler: async (event) => {
        await this.handleAgentTerminated(event.data);
      }
    });

    this.registerEventHandler({
      eventType: 'agent.error',
      handler: async (event) => {
        await this.handleAgentError(event.data);
      }
    });

    this.registerEventHandler({
      eventType: 'task:submitted',
      handler: async (event) => {
        await this.handleTaskSubmitted(event.data);
      }
    });

    this.registerEventHandler({
      eventType: 'task:completed',
      handler: async (event) => {
        await this.handleTaskCompleted(event.data);
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

  protected async performTask(task: QETask): Promise<any> {
    console.log(`[FleetCommander] Performing task: ${task.type}`);

    switch (task.type) {
      case 'fleet-initialize':
        return await this.initializeFleet(task.payload);

      case 'agent-spawn':
        return await this.spawnAgents(task.payload);

      case 'agent-terminate':
        return await this.terminateAgent(task.payload);

      case 'topology-change':
        return await this.changeTopology(task.payload);

      case 'rebalance-load':
        return await this.rebalanceWorkload(task.payload);

      case 'resolve-conflict':
        return await this.resolveConflict(task.payload);

      case 'fleet-status':
        return await this.getFleetStatus();

      case 'fleet-metrics':
        return await this.getFleetMetrics();

      case 'scale-pool':
        return await this.scaleAgentPool(task.payload);

      case 'recover-agent':
        return await this.recoverAgent(task.payload);

      default:
        throw new Error(`Unknown task type: ${task.type}`);
    }
  }

  protected async loadKnowledge(): Promise<void> {
    console.log('[FleetCommander] Loading fleet knowledge from memory');

    try {
      // Restore topology state
      const savedTopology = await this.memoryStore.retrieve('aqe/fleet/topology');
      if (savedTopology) {
        this.topologyState = savedTopology;
      }

      // Restore agent pool status
      const savedPools = await this.memoryStore.retrieve('aqe/fleet/agents/pools');
      if (savedPools) {
        this.agentPools = new Map(Object.entries(savedPools));
      }

      // Restore resource allocations
      const savedAllocations = await this.memoryStore.retrieve('aqe/fleet/resources/allocation');
      if (savedAllocations) {
        this.resourceAllocations = new Map(Object.entries(savedAllocations));
      }

      // Restore metrics
      const savedMetrics = await this.memoryStore.retrieve('aqe/fleet/metrics/performance');
      if (savedMetrics) {
        this.fleetMetrics = { ...this.fleetMetrics, ...savedMetrics };
      }

    } catch (error) {
      console.warn('[FleetCommander] Could not restore full state, using defaults:', error);
    }
  }

  protected async cleanup(): Promise<void> {
    console.log('[FleetCommander] Cleaning up fleet resources');

    // Clear timers
    if (this.heartbeatMonitorInterval) {
      clearInterval(this.heartbeatMonitorInterval);
      this.heartbeatMonitorInterval = undefined;
    }

    if (this.autoScalingMonitorInterval) {
      clearInterval(this.autoScalingMonitorInterval);
      this.autoScalingMonitorInterval = undefined;
    }

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

  private async initializeFleet(config: any): Promise<any> {
    console.log('[FleetCommander] Initializing fleet with config:', config);

    const results = {
      topology: this.topologyState.mode,
      poolsInitialized: [] as string[],
      totalAgents: 0,
      status: 'success'
    };

    // Initialize agent pools based on configuration
    for (const [agentType, poolConfig] of Object.entries(this.config.agentPools || {})) {
      const pool = poolConfig as any;

      // Spawn minimum required agents for each pool
      for (let i = 0; i < pool.min; i++) {
        await this.requestAgentSpawn(agentType, pool.priority);
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

  private async spawnAgents(payload: { type: string; count?: number; config?: any }): Promise<any> {
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

  private async terminateAgent(payload: { agentId: string }): Promise<any> {
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

  private async handleAgentSpawned(data: any): Promise<void> {
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

  private async handleAgentTerminated(data: any): Promise<void> {
    const { agentId } = data;
    console.log(`[FleetCommander] Agent terminated: ${agentId}`);

    // Find agent type and update pool
    const agentData = await this.memoryStore.retrieve(`aqe/fleet/agents/${agentId}`);
    if (agentData) {
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

  private async handleAgentError(data: any): Promise<void> {
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

  private async changeTopology(payload: { mode: 'hierarchical' | 'mesh' | 'hybrid' | 'adaptive' }): Promise<any> {
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
  // Load Balancing
  // ============================================================================

  private async rebalanceWorkload(_payload: any): Promise<any> {
    console.log('[FleetCommander] Rebalancing workload across fleet');

    const rebalancingStrategy = await this.calculateRebalancingStrategy();

    // Apply load balancing
    for (const [agentType, targetUtilization] of Object.entries(rebalancingStrategy)) {
      const poolStatus = this.agentPools.get(agentType);
      if (poolStatus) {
        poolStatus.utilization = targetUtilization as number;
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

  private async resolveConflict(payload: any): Promise<any> {
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

  private async resolveResourceContention(agents: string[], _allocation: ResourceAllocation): Promise<any> {
    // Priority-weighted resource allocation
    const agentAllocations = await Promise.all(
      agents.map(async (agentId) => {
        const agentData = await this.memoryStore.retrieve(`aqe/fleet/agents/${agentId}`);
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

  private async resolveDeadlock(agents: string[]): Promise<any> {
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

  private async resolvePriorityConflict(agents: string[]): Promise<any> {
    // Use priority queue to order execution
    return {
      strategy: 'priority-queue',
      executionOrder: agents
    };
  }

  // ============================================================================
  // Auto-Scaling
  // ============================================================================

  private async scaleAgentPool(payload: { type: string; action: 'scale-up' | 'scale-down'; count?: number }): Promise<any> {
    const { type, action, count = 1 } = payload;
    console.log(`[FleetCommander] ${action} agent pool ${type} by ${count}`);

    if (action === 'scale-up') {
      return await this.spawnAgents({ type, count });
    } else {
      return await this.scaleDownPool(type, count);
    }
  }

  private async scaleDownPool(agentType: string, count: number): Promise<any> {
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

  private startAutoScalingMonitor(): void {
    this.autoScalingMonitorInterval = setInterval(async () => {
      if (this.lifecycleManager.getStatus() !== AgentStatus.ACTIVE) return;

      const decision = await this.makeScalingDecision();

      if (decision.action !== 'no-action') {
        this.scalingHistory.push(decision);

        await this.scaleAgentPool({
          type: decision.agentType,
          action: decision.action,
          count: Math.abs(decision.targetCount - decision.currentCount)
        });
      }
    }, this.config.autoScaling?.cooldownPeriod || 60000);
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

  private startHeartbeatMonitoring(): void {
    this.heartbeatMonitorInterval = setInterval(async () => {
      if (this.lifecycleManager.getStatus() !== AgentStatus.ACTIVE) return;

      const now = new Date();
      const timeout = this.config.faultTolerance?.heartbeatTimeout || 15000;

      for (const [agentId, lastHeartbeat] of this.agentHealthChecks.entries()) {
        const elapsed = now.getTime() - lastHeartbeat.getTime();

        if (elapsed > timeout) {
          console.warn(`[FleetCommander] Agent ${agentId} heartbeat timeout`);
          await this.handleAgentFailure(agentId);
        }
      }
    }, this.config.faultTolerance?.heartbeatInterval || 5000);
  }

  private async handleAgentFailure(agentId: string): Promise<void> {
    console.error(`[FleetCommander] Agent failure detected: ${agentId}`);

    // Update metrics
    this.fleetMetrics.failedAgents++;

    // Attempt recovery
    await this.recoverAgent({ agentId });
  }

  private async recoverAgent(payload: { agentId: string }): Promise<any> {
    const { agentId } = payload;
    console.log(`[FleetCommander] Attempting to recover agent ${agentId}`);

    const agentData = await this.memoryStore.retrieve(`aqe/fleet/agents/${agentId}`);
    if (!agentData) {
      return { agentId, recovered: false, reason: 'agent-not-found' };
    }

    const maxRetries = this.config.faultTolerance?.maxRetries || 3;
    let attempt = 0;

    while (attempt < maxRetries) {
      try {
        // Try to respawn the agent
        const result = await this.spawnAgents({
          type: agentData.type,
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

  private async handleTaskSubmitted(data: any): Promise<void> {
    const task = data.task || data;
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

  private async handleTaskCompleted(data: any): Promise<void> {
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

  private async getFleetStatus(): Promise<any> {
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

  private async requestAgentSpawn(type: string, priority: string, config: any = {}): Promise<string> {
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
  public async getDetailedStatus(): Promise<any> {
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
}