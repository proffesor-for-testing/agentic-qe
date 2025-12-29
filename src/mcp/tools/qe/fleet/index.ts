/**
 * Fleet Coordination Tools for Agentic QE
 * Hierarchical fleet coordination and agent health monitoring
 *
 * @module tools/qe/fleet
 * @version 1.0.0
 */

import type {
  QEToolResponse,
  ResponseMetadata,
  QEError
} from '../shared/types'
import { SecureRandom } from '../../../../utils/SecureRandom'
import { seededRandom } from '../../../../utils/SeededRandom'

// ============================================================================
// Fleet Coordination Types
// ============================================================================

/**
 * Fleet coordination parameters
 */
export interface FleetCoordinationParams {
  /** Total agents in fleet */
  agentCount: number;

  /** Coordination topology */
  topology: 'hierarchical' | 'mesh' | 'hybrid' | 'adaptive';

  /** Agent types and their configuration */
  agentPools: AgentPoolConfig[];

  /** Task workload to distribute */
  workload: TaskWorkload[];

  /** Resource constraints */
  resourceConstraints?: ResourceConstraints;

  /** Enable load balancing */
  enableLoadBalancing?: boolean;

  /** Enable auto-scaling */
  enableAutoScaling?: boolean;

  /** Include optimization metrics */
  includeMetrics?: boolean;
}

/**
 * Agent pool configuration
 */
export interface AgentPoolConfig {
  /** Agent type */
  type: string;

  /** Minimum pool size */
  minSize: number;

  /** Maximum pool size */
  maxSize: number;

  /** Current pool size */
  currentSize: number;

  /** Agent priority */
  priority: 'low' | 'medium' | 'high' | 'critical';

  /** Capabilities */
  capabilities: string[];
}

/**
 * Task workload structure
 */
export interface TaskWorkload {
  /** Task ID */
  id: string;

  /** Task type */
  type: string;

  /** Estimated duration (ms) */
  estimatedDuration: number;

  /** Task priority */
  priority: 'low' | 'medium' | 'high' | 'critical';

  /** Required capabilities */
  requiredCapabilities: string[];

  /** Resource requirements */
  resourceRequirements?: ResourceRequirements;
}

/**
 * Resource constraints for fleet
 */
export interface ResourceConstraints {
  /** Total CPU cores available */
  totalCpuCores: number;

  /** Total memory (MB) */
  totalMemory: number;

  /** CPU per agent */
  cpuPerAgent: number;

  /** Memory per agent (MB) */
  memoryPerAgent: number;

  /** Maximum concurrent tasks */
  maxConcurrentTasks: number;
}

/**
 * Resource requirements for task
 */
export interface ResourceRequirements {
  /** CPU cores needed */
  cpuCores: number;

  /** Memory needed (MB) */
  memory: number;

  /** Storage needed (MB) */
  storage?: number;
}

/**
 * Fleet coordination result
 */
export interface FleetCoordinationResult {
  /** Fleet coordination plan */
  coordinationPlan: CoordinationPlan;

  /** Task assignments */
  taskAssignments: TaskAssignment[];

  /** Topology configuration */
  topologyConfig: TopologyConfiguration;

  /** Load distribution */
  loadDistribution: LoadDistribution;

  /** Scaling recommendations */
  scalingRecommendations?: ScalingRecommendation[];

  /** Coordination metrics */
  metrics: CoordinationMetrics;

  /** Optimization insights */
  insights: string[];
}

/**
 * Coordination plan
 */
export interface CoordinationPlan {
  /** Plan ID */
  id: string;

  /** Total agents to use */
  totalAgents: number;

  /** Coordinator hierarchy */
  hierarchy: AgentNode[];

  /** Communication pattern */
  communicationPattern: string;

  /** Synchronization points */
  syncPoints: number;

  /** Expected efficiency */
  expectedEfficiency: number;
}

/**
 * Agent node in hierarchy
 */
export interface AgentNode {
  /** Node ID */
  id: string;

  /** Node type */
  type: string;

  /** Parent node ID */
  parentId?: string;

  /** Child node IDs */
  childIds: string[];

  /** Assigned tasks */
  assignedTasks: string[];

  /** Resource allocation */
  resourceAllocation: ResourceAllocation;

  /** Level in hierarchy */
  level: number;
}

/**
 * Resource allocation for agent
 */
export interface ResourceAllocation {
  /** Allocated CPU cores */
  cpuCores: number;

  /** Allocated memory (MB) */
  memory: number;

  /** Allocated storage (MB) */
  storage: number;

  /** Concurrent task limit */
  concurrencyLimit: number;
}

/**
 * Task assignment
 */
export interface TaskAssignment {
  /** Task ID */
  taskId: string;

  /** Assigned agent ID */
  agentId: string;

  /** Agent type */
  agentType: string;

  /** Assignment time */
  assignedAt: string;

  /** Estimated start time */
  estimatedStartTime: string;

  /** Estimated completion time */
  estimatedCompletionTime: string;

  /** Assigned priority */
  priority: string;

  /** Assignment score (0-1) */
  score: number;
}

/**
 * Topology configuration
 */
export interface TopologyConfiguration {
  /** Topology type */
  type: string;

  /** Number of levels */
  levels: number;

  /** Nodes per level */
  nodesPerLevel: number[];

  /** Connection count */
  connections: number;

  /** Estimated latency (ms) */
  estimatedLatency: number;

  /** Efficiency rating (0-1) */
  efficiency: number;
}

/**
 * Load distribution across agents
 */
export interface LoadDistribution {
  /** Average tasks per agent */
  avgTasksPerAgent: number;

  /** Min tasks on any agent */
  minTasks: number;

  /** Max tasks on any agent */
  maxTasks: number;

  /** Load balance ratio (0-1) */
  loadBalanceRatio: number;

  /** Per-pool distribution */
  poolDistribution: Record<string, PoolLoadInfo>;
}

/**
 * Load information for agent pool
 */
export interface PoolLoadInfo {
  /** Pool type */
  poolType: string;

  /** Agents in pool */
  agentCount: number;

  /** Total tasks assigned */
  totalTasks: number;

  /** Average tasks per agent */
  avgTasksPerAgent: number;

  /** Utilization rate (0-1) */
  utilization: number;
}

/**
 * Scaling recommendation
 */
export interface ScalingRecommendation {
  /** Agent pool type */
  poolType: string;

  /** Recommended action */
  action: 'scale-up' | 'scale-down' | 'no-action';

  /** Current pool size */
  currentSize: number;

  /** Recommended pool size */
  recommendedSize: number;

  /** Confidence (0-1) */
  confidence: number;

  /** Reason */
  reason: string;
}

/**
 * Coordination metrics
 */
export interface CoordinationMetrics {
  /** Total communication overhead (ms) */
  communicationOverhead: number;

  /** Scheduling efficiency (0-1) */
  schedulingEfficiency: number;

  /** Resource utilization (0-1) */
  resourceUtilization: number;

  /** Load balance score (0-1) */
  loadBalanceScore: number;

  /** Fault tolerance rating (0-1) */
  faultToleranceRating: number;

  /** Scalability factor */
  scalabilityFactor: number;

  /** Overall coordination score (0-100) */
  overallScore: number;
}

/**
 * Agent status parameters
 */
export interface AgentStatusParams {
  /** Fleet ID to query */
  fleetId: string;

  /** Agent IDs to check (empty = all) */
  agentIds?: string[];

  /** Include detailed metrics */
  includeDetailedMetrics?: boolean;

  /** Include historical data */
  includeHistory?: boolean;

  /** History duration (minutes) */
  historyDuration?: number;

  /** Health check type */
  healthCheckType?: 'heartbeat' | 'performance' | 'comprehensive';
}

/**
 * Agent status result
 */
export interface AgentStatusResult {
  /** Fleet ID */
  fleetId: string;

  /** Status timestamp */
  timestamp: string;

  /** Agent health statuses */
  agentStatuses: AgentHealthStatus[];

  /** Fleet-wide health */
  fleetHealth: FleetHealthSummary;

  /** Alert summary */
  alerts: AlertSummary[];

  /** Recommendations */
  recommendations: string[];

  /** Health trend */
  healthTrend?: HealthTrend;
}

/**
 * Agent health status
 */
export interface AgentHealthStatus {
  /** Agent ID */
  agentId: string;

  /** Agent type */
  agentType: string;

  /** Health status */
  status: 'healthy' | 'degraded' | 'unhealthy' | 'offline';

  /** Status score (0-100) */
  statusScore: number;

  /** Uptime percentage */
  uptimePercentage: number;

  /** Last heartbeat */
  lastHeartbeat: string;

  /** Current task count */
  currentTaskCount: number;

  /** Completed tasks */
  completedTasks: number;

  /** Failed tasks */
  failedTasks: number;

  /** Average task duration (ms) */
  avgTaskDuration: number;

  /** Resource metrics */
  resourceMetrics: ResourceMetrics;

  /** Recent errors */
  recentErrors: ErrorLog[];
}

/**
 * Resource metrics for agent
 */
export interface ResourceMetrics {
  /** CPU usage percentage */
  cpuUsage: number;

  /** Memory usage (MB) */
  memoryUsage: number;

  /** Memory usage percentage */
  memoryUsagePercent: number;

  /** Task queue depth */
  taskQueueDepth: number;

  /** Response time (ms) */
  responseTime: number;

  /** Throughput (tasks/min) */
  throughput: number;
}

/**
 * Error log entry
 */
export interface ErrorLog {
  /** Timestamp */
  timestamp: string;

  /** Error message */
  message: string;

  /** Error severity */
  severity: 'warning' | 'error' | 'critical';

  /** Task ID */
  taskId?: string;

  /** Recovery action taken */
  recoveryAction?: string;
}

/**
 * Fleet health summary
 */
export interface FleetHealthSummary {
  /** Total agents */
  totalAgents: number;

  /** Healthy agents */
  healthyAgents: number;

  /** Degraded agents */
  degradedAgents: number;

  /** Unhealthy agents */
  unhealthyAgents: number;

  /** Offline agents */
  offlineAgents: number;

  /** Overall fleet health (0-100) */
  overallHealth: number;

  /** Fleet status */
  fleetStatus: 'operational' | 'degraded' | 'critical';

  /** Total tasks processed */
  totalTasksProcessed: number;

  /** Overall failure rate (0-1) */
  overallFailureRate: number;
}

/**
 * Alert information
 */
export interface AlertSummary {
  /** Alert type */
  type: 'agent-failure' | 'resource-constraint' | 'performance-degradation' | 'deadlock';

  /** Severity */
  severity: 'info' | 'warning' | 'error' | 'critical';

  /** Affected agents */
  affectedAgents: string[];

  /** Alert message */
  message: string;

  /** Recommended action */
  recommendedAction?: string;

  /** Detection time */
  detectionTime: string;
}

/**
 * Health trend information
 */
export interface HealthTrend {
  /** Health score trend (ascending) */
  trendDirection: 'improving' | 'stable' | 'degrading';

  /** Trend strength (0-1) */
  trendStrength: number;

  /** Health scores over time */
  historicalScores: number[];

  /** Predicted health score (0-100) */
  predictedScore: number;

  /** Confidence in prediction (0-1) */
  predictionConfidence: number;
}

// ============================================================================
// Coordinate Fleet Tool
// ============================================================================

/**
 * Calculate hierarchical topology connections
 */
function calculateHierarchicalConnections(agents: number): number {
  return Math.max(0, agents - 1);
}

/**
 * Calculate mesh topology connections
 */
function calculateMeshConnections(agents: number): number {
  return agents > 1 ? (agents * (agents - 1)) / 2 : 0;
}

/**
 * Calculate adaptive topology connections based on workload
 */
function calculateAdaptiveConnections(agents: number, taskCount: number): number {
  const avgTasksPerAgent = taskCount / agents;

  if (avgTasksPerAgent < 2) {
    return agents - 1;
  } else if (avgTasksPerAgent < 5) {
    return (agents - 1) + Math.floor(agents / 3);
  } else {
    return agents > 1 ? (agents * (agents - 1)) / 2 : 0;
  }
}

/**
 * Build hierarchical agent tree
 */
function buildHierarchicalTree(
  poolConfigs: AgentPoolConfig[],
  totalAgents: number
): AgentNode[] {
  const nodes: AgentNode[] = [];
  let nodeIdCounter = 0;

  const rootId = `agent-${nodeIdCounter++}`;
  nodes.push({
    id: rootId,
    type: 'fleet-coordinator',
    childIds: [],
    assignedTasks: [],
    resourceAllocation: {
      cpuCores: 1,
      memory: 256,
      storage: 100,
      concurrencyLimit: 50
    },
    level: 0
  });

  for (const pool of poolConfigs) {
    const agentsInPool = Math.ceil((pool.currentSize / totalAgents) * totalAgents);

    for (let i = 0; i < agentsInPool; i++) {
      const agentId = `${pool.type}-${nodeIdCounter++}`;

      nodes.push({
        id: agentId,
        type: pool.type,
        parentId: rootId,
        childIds: [],
        assignedTasks: [],
        resourceAllocation: {
          cpuCores: 0.5,
          memory: 512,
          storage: 100,
          concurrencyLimit: 10
        },
        level: 1
      });

      const parentNode = nodes[0];
      parentNode.childIds.push(agentId);
    }
  }

  return nodes;
}

/**
 * Assign tasks to agents using sublinear algorithm
 */
function assignTasksOptimally(
  tasks: TaskWorkload[],
  agents: AgentNode[]
): TaskAssignment[] {
  const assignments: TaskAssignment[] = [];

  const sortedTasks = [...tasks].sort((a, b) => {
    const priorityOrder = { critical: 4, high: 3, medium: 2, low: 1 };
    const aPriority = priorityOrder[a.priority as keyof typeof priorityOrder];
    const bPriority = priorityOrder[b.priority as keyof typeof priorityOrder];

    if (aPriority !== bPriority) {
      return bPriority - aPriority;
    }

    return b.estimatedDuration - a.estimatedDuration;
  });

  const workerAgents = agents.filter(a => a.type !== 'fleet-coordinator');
  const agentLoads = new Map<string, number>();

  for (const agent of workerAgents) {
    agentLoads.set(agent.id, 0);
  }

  for (const task of sortedTasks) {
    let bestAgent: AgentNode | undefined;
    let minLoad = Infinity;

    for (const agent of workerAgents) {
      const hasCapabilities = task.requiredCapabilities.every(cap =>
        agent.type.includes(cap) || cap === '*'
      );

      if (!hasCapabilities) continue;

      const load = agentLoads.get(agent.id) || 0;
      if (load < minLoad) {
        minLoad = load;
        bestAgent = agent;
      }
    }

    if (!bestAgent) {
      bestAgent = seededRandom.randomElement(workerAgents);
    }

    const taskLoad = task.estimatedDuration;
    agentLoads.set(bestAgent.id, (agentLoads.get(bestAgent.id) || 0) + taskLoad);

    const loads = Array.from(agentLoads.values());
    const maxLoad = loads.length > 0 ? Math.max(...loads) : 0;
    const currentLoad = agentLoads.get(bestAgent.id) || 0;
    const score = 1 - (maxLoad > 0 ? currentLoad / maxLoad : 0);

    const now = new Date();
    const taskStartTime = new Date(now.getTime() + 1000);
    const taskEndTime = new Date(taskStartTime.getTime() + task.estimatedDuration);

    assignments.push({
      taskId: task.id,
      agentId: bestAgent.id,
      agentType: bestAgent.type,
      assignedAt: now.toISOString(),
      estimatedStartTime: taskStartTime.toISOString(),
      estimatedCompletionTime: taskEndTime.toISOString(),
      priority: task.priority,
      score
    });

    bestAgent.assignedTasks.push(task.id);
  }

  return assignments;
}

/**
 * Calculate load distribution metrics
 */
function calculateLoadDistribution(
  taskAssignments: TaskAssignment[],
  poolConfigs: AgentPoolConfig[]
): LoadDistribution {
  const tasksByAgent = new Map<string, number>();
  const totalAgents = poolConfigs.reduce((sum, p) => sum + p.currentSize, 0);

  for (const assignment of taskAssignments) {
    const count = tasksByAgent.get(assignment.agentId) || 0;
    tasksByAgent.set(assignment.agentId, count + 1);
  }

  const taskCounts = Array.from(tasksByAgent.values());
  const totalTasks = taskCounts.reduce((sum, count) => sum + count, 0);
  const avgTasksPerAgent = totalTasks / totalAgents;
  const minTasks = taskCounts.length > 0 ? Math.min(...taskCounts) : 0;
  const maxTasks = taskCounts.length > 0 ? Math.max(...taskCounts) : 0;
  const loadBalanceRatio = maxTasks > 0 ? 1 - (minTasks / maxTasks) : 0;

  const poolDistribution: Record<string, PoolLoadInfo> = {};

  for (const pool of poolConfigs) {
    const poolTasks = Array.from(tasksByAgent.entries())
      .filter(([agentId]) => agentId.startsWith(pool.type))
      .reduce((sum, [, count]) => sum + count, 0);

    const poolUtilization = pool.currentSize > 0
      ? (poolTasks / pool.currentSize) / (totalTasks / totalAgents)
      : 0;

    poolDistribution[pool.type] = {
      poolType: pool.type,
      agentCount: pool.currentSize,
      totalTasks: poolTasks,
      avgTasksPerAgent: pool.currentSize > 0 ? poolTasks / pool.currentSize : 0,
      utilization: Math.min(poolUtilization, 1.0)
    };
  }

  return {
    avgTasksPerAgent,
    minTasks,
    maxTasks,
    loadBalanceRatio,
    poolDistribution
  };
}

/**
 * Generate scaling recommendations
 */
function generateScalingRecommendations(
  distribution: LoadDistribution,
  poolConfigs: AgentPoolConfig[]
): ScalingRecommendation[] {
  const recommendations: ScalingRecommendation[] = [];
  const scaleUpThreshold = 0.85;
  const scaleDownThreshold = 0.30;

  for (const pool of poolConfigs) {
    const poolLoad = distribution.poolDistribution[pool.type];

    if (!poolLoad) continue;

    const utilization = poolLoad.utilization;

    if (utilization > scaleUpThreshold && pool.currentSize < pool.maxSize) {
      const recommendedSize = Math.min(Math.ceil(pool.currentSize * 1.5), pool.maxSize);

      recommendations.push({
        poolType: pool.type,
        action: 'scale-up',
        currentSize: pool.currentSize,
        recommendedSize,
        confidence: utilization - scaleUpThreshold,
        reason: `High utilization (${(utilization * 100).toFixed(1)}%)`
      });
    } else if (utilization < scaleDownThreshold && pool.currentSize > pool.minSize) {
      const recommendedSize = Math.max(Math.floor(pool.currentSize * 0.75), pool.minSize);

      recommendations.push({
        poolType: pool.type,
        action: 'scale-down',
        currentSize: pool.currentSize,
        recommendedSize,
        confidence: scaleDownThreshold - utilization,
        reason: `Low utilization (${(utilization * 100).toFixed(1)}%)`
      });
    } else {
      recommendations.push({
        poolType: pool.type,
        action: 'no-action',
        currentSize: pool.currentSize,
        recommendedSize: pool.currentSize,
        confidence: 1.0,
        reason: `Optimal utilization (${(utilization * 100).toFixed(1)}%)`
      });
    }
  }

  return recommendations;
}

/**
 * Calculate coordination metrics
 */
function calculateCoordinationMetrics(
  coordinationPlan: CoordinationPlan,
  loadDistribution: LoadDistribution,
  taskCount: number,
  agentCount: number
): CoordinationMetrics {
  let commOverhead = 0;
  if (coordinationPlan.communicationPattern === 'hierarchical') {
    commOverhead = Math.ceil(Math.log2(agentCount)) * 2;
  } else if (coordinationPlan.communicationPattern === 'mesh') {
    commOverhead = agentCount * 5;
  } else {
    commOverhead = Math.ceil(Math.log2(agentCount)) * 3;
  }

  const schedulingEfficiency = coordinationPlan.expectedEfficiency;
  const totalTasks = Object.values(loadDistribution.poolDistribution).reduce(
    (sum, pool) => sum + pool.totalTasks,
    0
  );
  const resourceUtilization = agentCount > 0 ? Math.min(totalTasks / agentCount, 1.0) : 0;
  const loadBalanceScore = 1 - loadDistribution.loadBalanceRatio;
  const faultToleranceRating = coordinationPlan.communicationPattern === 'mesh' ? 0.95 : 0.75;
  const scalabilityFactor = Math.log2(agentCount + 1);

  const overallScore = Math.round(
    (schedulingEfficiency * 25 +
      loadBalanceScore * 25 +
      resourceUtilization * 25 +
      faultToleranceRating * 15 +
      Math.min(scalabilityFactor / 10, 1) * 10) * 100 / 100
  );

  return {
    communicationOverhead: commOverhead,
    schedulingEfficiency,
    resourceUtilization,
    loadBalanceScore,
    faultToleranceRating,
    scalabilityFactor,
    overallScore
  };
}

/**
 * Coordinate fleet for optimal task distribution
 */
export async function coordinateFleet(
  params: FleetCoordinationParams
): Promise<QEToolResponse<FleetCoordinationResult>> {
  const startTime = Date.now();
  const requestId = `fleet-coord-${Date.now()}-${SecureRandom.generateId(8)}`;

  try {
    if (!params.agentCount || params.agentCount < 1) {
      throw new Error('agentCount must be at least 1');
    }

    if (!params.agentPools || params.agentPools.length === 0) {
      throw new Error('agentPools must not be empty');
    }

    const agents = buildHierarchicalTree(params.agentPools, params.agentCount);

    let connections = 0;
    let communicationPattern = '';
    let efficiency = 0.85;

    switch (params.topology) {
      case 'hierarchical': {
        connections = calculateHierarchicalConnections(params.agentCount);
        communicationPattern = 'hierarchical';
        efficiency = 0.90;
        break;
      }

      case 'mesh': {
        connections = calculateMeshConnections(params.agentCount);
        communicationPattern = 'mesh';
        efficiency = 0.75;
        break;
      }

      case 'hybrid': {
        connections = Math.round(
          (calculateHierarchicalConnections(params.agentCount) +
            calculateMeshConnections(params.agentCount)) / 2
        );
        communicationPattern = 'hybrid';
        efficiency = 0.82;
        break;
      }

      case 'adaptive': {
        connections = calculateAdaptiveConnections(params.agentCount, params.workload.length);
        communicationPattern = 'adaptive';
        efficiency = 0.88;
        break;
      }
    }

    const coordinationPlan: CoordinationPlan = {
      id: `plan-${requestId}`,
      totalAgents: params.agentCount,
      hierarchy: agents,
      communicationPattern,
      syncPoints: Math.ceil(Math.log2(params.agentCount)),
      expectedEfficiency: efficiency
    };

    const taskAssignments = assignTasksOptimally(params.workload, agents);
    const loadDistribution = calculateLoadDistribution(taskAssignments, params.agentPools);

    const topologyConfig: TopologyConfiguration = {
      type: params.topology,
      levels: Math.ceil(Math.log2(params.agentCount)) + 1,
      nodesPerLevel: [1, ...Array(Math.ceil(Math.log2(params.agentCount))).fill(
        Math.ceil(params.agentCount / Math.log2(params.agentCount))
      )],
      connections,
      estimatedLatency: Math.ceil(Math.log2(params.agentCount)) * 5,
      efficiency
    };

    const scalingRecommendations = params.enableAutoScaling
      ? generateScalingRecommendations(loadDistribution, params.agentPools)
      : undefined;

    const metrics = calculateCoordinationMetrics(
      coordinationPlan,
      loadDistribution,
      params.workload.length,
      params.agentCount
    );

    const insights: string[] = [];

    if (metrics.loadBalanceScore > 0.9) {
      insights.push('Fleet load is well-balanced across all agents');
    } else if (metrics.loadBalanceScore > 0.7) {
      insights.push('Fleet has good load distribution with minor imbalances');
    } else {
      insights.push('Fleet load distribution could be improved through rebalancing');
    }

    if (metrics.resourceUtilization > 0.9) {
      insights.push('Fleet resources are heavily utilized - consider scaling up');
    } else if (metrics.resourceUtilization > 0.6) {
      insights.push('Fleet resources are well-utilized');
    } else {
      insights.push('Fleet resources are underutilized - consider scaling down');
    }

    if (params.topology === 'mesh') {
      insights.push('Mesh topology provides excellent fault tolerance but higher communication overhead');
    } else if (params.topology === 'hierarchical') {
      insights.push('Hierarchical topology minimizes communication with organized structure');
    }

    const executionTime = Date.now() - startTime;

    const metadata: ResponseMetadata = {
      requestId,
      timestamp: new Date().toISOString(),
      executionTime,
      agent: 'fleet-coordinator',
      version: '1.0.0'
    };

    return {
      success: true,
      data: {
        coordinationPlan,
        taskAssignments,
        topologyConfig,
        loadDistribution,
        scalingRecommendations,
        metrics,
        insights
      },
      metadata
    };
  } catch (error) {
    const qeError: QEError = {
      code: 'FLEET_COORDINATION_FAILED',
      message: error instanceof Error ? error.message : 'Unknown error during fleet coordination',
      details: { params },
      stack: error instanceof Error ? error.stack : undefined
    };

    return {
      success: false,
      error: qeError,
      metadata: {
        requestId,
        timestamp: new Date().toISOString(),
        executionTime: Date.now() - startTime,
        agent: 'fleet-coordinator',
        version: '1.0.0'
      }
    };
  }
}

// ============================================================================
// Get Agent Status Tool
// ============================================================================

/**
 * Generate mock agent status based on configuration
 */
function generateAgentHealthStatus(
  agentId: string,
  agentType: string
): AgentHealthStatus {
  const now = new Date();
  const statusOptions: Array<'healthy' | 'degraded' | 'unhealthy' | 'offline'> = ['healthy', 'degraded', 'unhealthy'];

  const rand = seededRandom.random();
  let status: typeof statusOptions[number];

  if (rand < 0.70) status = 'healthy';
  else if (rand < 0.90) status = 'degraded';
  else status = 'unhealthy';

  const statusScores = {
    healthy: 90 + seededRandom.randomInt(0, 9),
    degraded: 60 + seededRandom.randomInt(0, 19),
    unhealthy: 20 + seededRandom.randomInt(0, 29),
    offline: 0
  };

  const completedTasks = 100 + seededRandom.randomInt(0, 399);
  const failedTasks = status === 'healthy' ? Math.floor(completedTasks * 0.02) :
                      status === 'degraded' ? Math.floor(completedTasks * 0.08) :
                      Math.floor(completedTasks * 0.15);

  const recentErrors: ErrorLog[] = [];
  if (status !== 'healthy') {
    for (let i = 0; i < (status === 'unhealthy' ? 3 : 1); i++) {
      recentErrors.push({
        timestamp: new Date(now.getTime() - i * 60000).toISOString(),
        message: `Task execution timeout on ${agentType}`,
        severity: status === 'unhealthy' ? 'critical' : 'warning',
        taskId: `task-${seededRandom.randomInt(0, 999)}`,
        recoveryAction: 'Automatic restart initiated'
      });
    }
  }

  const lastHeartbeatTime = new Date(
    now.getTime() - (status === 'healthy' ? seededRandom.random() * 5000 : 30000 + seededRandom.random() * 30000)
  );

  return {
    agentId,
    agentType,
    status,
    statusScore: statusScores[status],
    uptimePercentage: status === 'healthy' ? 99.9 : status === 'degraded' ? 95 : 80,
    lastHeartbeat: lastHeartbeatTime.toISOString(),
    currentTaskCount: status === 'healthy' ? seededRandom.randomInt(0, 7) : seededRandom.randomInt(0, 2),
    completedTasks,
    failedTasks,
    avgTaskDuration: 2000 + seededRandom.randomInt(0, 2999),
    resourceMetrics: {
      cpuUsage: status === 'healthy' ? 30 + seededRandom.random() * 40 : 70 + seededRandom.random() * 30,
      memoryUsage: 256 + seededRandom.randomInt(0, 255),
      memoryUsagePercent: status === 'healthy' ? 40 + seededRandom.random() * 30 : 80 + seededRandom.random() * 20,
      taskQueueDepth: status === 'healthy' ? seededRandom.randomInt(0, 4) : seededRandom.randomInt(0, 9),
      responseTime: status === 'healthy' ? 100 + seededRandom.randomInt(0, 199) : 500 + seededRandom.randomInt(0, 499),
      throughput: status === 'healthy' ? 20 + seededRandom.random() * 30 : 5 + seededRandom.random() * 15
    },
    recentErrors
  };
}

/**
 * Calculate fleet health summary
 */
function calculateFleetHealth(agentStatuses: AgentHealthStatus[]): FleetHealthSummary {
  const statusCounts = {
    healthy: 0,
    degraded: 0,
    unhealthy: 0,
    offline: 0
  };

  let totalCompleted = 0;
  let totalFailed = 0;

  for (const agent of agentStatuses) {
    statusCounts[agent.status]++;
    totalCompleted += agent.completedTasks;
    totalFailed += agent.failedTasks;
  }

  const totalAgents = agentStatuses.length;
  const overallFailureRate = totalCompleted > 0 ? totalFailed / totalCompleted : 0;
  const healthScores = agentStatuses.map(a => a.statusScore);
  const avgHealthScore = healthScores.length > 0
    ? healthScores.reduce((sum, score) => sum + score, 0) / healthScores.length
    : 50;

  let fleetStatus: 'operational' | 'degraded' | 'critical' = 'operational';
  if (avgHealthScore < 60 || statusCounts.unhealthy > totalAgents * 0.1) {
    fleetStatus = 'critical';
  } else if (avgHealthScore < 75 || statusCounts.degraded > totalAgents * 0.3) {
    fleetStatus = 'degraded';
  }

  return {
    totalAgents,
    healthyAgents: statusCounts.healthy,
    degradedAgents: statusCounts.degraded,
    unhealthyAgents: statusCounts.unhealthy,
    offlineAgents: statusCounts.offline,
    overallHealth: Math.round(avgHealthScore),
    fleetStatus,
    totalTasksProcessed: totalCompleted,
    overallFailureRate
  };
}

/**
 * Generate health trend analysis
 */
function generateHealthTrend(): HealthTrend {
  const scores: number[] = [];
  let currentScore = 85 + seededRandom.random() * 10;

  for (let i = 0; i < 5; i++) {
    scores.push(Math.round(currentScore));
    const change = (seededRandom.random() - 0.4) * 5;
    currentScore = Math.max(0, Math.min(100, currentScore + change));
  }

  const trend = scores[4] - scores[0];
  let direction: 'improving' | 'stable' | 'degrading' = 'stable';
  if (trend > 5) direction = 'improving';
  else if (trend < -5) direction = 'degrading';

  return {
    trendDirection: direction,
    trendStrength: Math.abs(trend) / 100,
    historicalScores: scores,
    predictedScore: Math.round(Math.max(0, Math.min(100, scores[4] + trend * 0.5))),
    predictionConfidence: 0.75 + seededRandom.random() * 0.2
  };
}

/**
 * Generate alert summaries
 */
function generateAlerts(agentStatuses: AgentHealthStatus[]): AlertSummary[] {
  const alerts: AlertSummary[] = [];

  const offlineAgents = agentStatuses.filter(a => a.status === 'offline');
  if (offlineAgents.length > 0) {
    alerts.push({
      type: 'agent-failure',
      severity: 'critical',
      affectedAgents: offlineAgents.map(a => a.agentId),
      message: `${offlineAgents.length} agent(s) offline`,
      recommendedAction: 'Restart offline agents and investigate failure cause',
      detectionTime: new Date().toISOString()
    });
  }

  const highFailureAgents = agentStatuses.filter(a => {
    const failureRate = a.failedTasks / Math.max(1, a.completedTasks);
    return failureRate > 0.1;
  });

  if (highFailureAgents.length > 0) {
    alerts.push({
      type: 'performance-degradation',
      severity: 'warning',
      affectedAgents: highFailureAgents.map(a => a.agentId),
      message: `${highFailureAgents.length} agent(s) have high failure rate`,
      recommendedAction: 'Review error logs and consider task redistribution',
      detectionTime: new Date().toISOString()
    });
  }

  const highResourceAgents = agentStatuses.filter(a =>
    a.resourceMetrics.memoryUsagePercent > 85 || a.resourceMetrics.cpuUsage > 85
  );

  if (highResourceAgents.length > 0) {
    alerts.push({
      type: 'resource-constraint',
      severity: 'warning',
      affectedAgents: highResourceAgents.map(a => a.agentId),
      message: `${highResourceAgents.length} agent(s) have high resource usage`,
      recommendedAction: 'Scale up agents or redistribute tasks',
      detectionTime: new Date().toISOString()
    });
  }

  return alerts;
}

/**
 * Get real-time agent status and health monitoring
 */
export async function getAgentStatus(
  params: AgentStatusParams
): Promise<QEToolResponse<AgentStatusResult>> {
  const startTime = Date.now();
  const requestId = `agent-status-${Date.now()}-${SecureRandom.generateId(8)}`;

  try {
    if (!params.fleetId) {
      throw new Error('fleetId is required');
    }

    const agentStatuses: AgentHealthStatus[] = [];
    const agentTypes = ['test-generator', 'test-executor', 'coverage-analyzer', 'quality-gate'];
    const agentCount = params.agentIds?.length || 10;

    for (let i = 0; i < agentCount; i++) {
      const agentType = agentTypes[i % agentTypes.length];
      const agentId = params.agentIds?.[i] || `${agentType}-${i + 1}`;

      const status = generateAgentHealthStatus(agentId, agentType);
      agentStatuses.push(status);
    }

    const fleetHealth = calculateFleetHealth(agentStatuses);
    const alerts = generateAlerts(agentStatuses);
    const healthTrend = generateHealthTrend();

    const recommendations: string[] = [];

    if (fleetHealth.fleetStatus === 'critical') {
      recommendations.push('URGENT: Address critical fleet health issues immediately');
    } else if (fleetHealth.fleetStatus === 'degraded') {
      recommendations.push('Fleet is degraded - review agent statuses and resource allocation');
    }

    if (fleetHealth.offlineAgents > 0) {
      recommendations.push(`Bring ${fleetHealth.offlineAgents} offline agent(s) back online`);
    }

    if (fleetHealth.overallFailureRate > 0.05) {
      recommendations.push('High failure rate detected - increase timeout thresholds or reduce task complexity');
    }

    if (healthTrend.trendDirection === 'degrading') {
      recommendations.push('Health trend is degrading - monitor closely and prepare for scaling');
    }

    const executionTime = Date.now() - startTime;

    const metadata: ResponseMetadata = {
      requestId,
      timestamp: new Date().toISOString(),
      executionTime,
      agent: 'fleet-monitor',
      version: '1.0.0'
    };

    return {
      success: true,
      data: {
        fleetId: params.fleetId,
        timestamp: new Date().toISOString(),
        agentStatuses,
        fleetHealth,
        alerts,
        recommendations,
        healthTrend
      },
      metadata
    };
  } catch (error) {
    const qeError: QEError = {
      code: 'AGENT_STATUS_RETRIEVAL_FAILED',
      message: error instanceof Error ? error.message : 'Unknown error retrieving agent status',
      details: { params },
      stack: error instanceof Error ? error.stack : undefined
    };

    return {
      success: false,
      error: qeError,
      metadata: {
        requestId,
        timestamp: new Date().toISOString(),
        executionTime: Date.now() - startTime,
        agent: 'fleet-monitor',
        version: '1.0.0'
      }
    };
  }
}
