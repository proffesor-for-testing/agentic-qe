/**
 * Agentic QE v3 - Agent MCP Handlers
 * Agent listing, spawning, and management handlers
 */

import { getFleetState, isFleetInitialized } from './core-handlers';
import {
  ToolResult,
  AgentListParams,
  AgentSpawnParams,
  AgentMetricsParams,
} from '../types';
import { DomainName } from '../../shared/types';
import { MetricsCollector } from '../metrics';

// ============================================================================
// Agent List Handler
// ============================================================================

interface AgentInfoResponse {
  id: string;
  domain: DomainName;
  type: string;
  status: string;
  name?: string;
  startedAt?: string;
}

export async function handleAgentList(
  params: AgentListParams
): Promise<ToolResult<AgentInfoResponse[]>> {
  if (!isFleetInitialized()) {
    return {
      success: false,
      error: 'Fleet not initialized. Call fleet_init first.',
    };
  }

  const { queen } = getFleetState();

  try {
    let agents = params.domain
      ? queen!.getAgentsByDomain(params.domain)
      : queen!.listAllAgents();

    // Filter by status if specified
    if (params.status) {
      agents = agents.filter((a) => a.status === params.status);
    }

    // Apply limit if specified
    if (params.limit) {
      agents = agents.slice(0, params.limit);
    }

    const result: AgentInfoResponse[] = agents.map((agent) => ({
      id: agent.id,
      domain: agent.domain,
      type: agent.type,
      status: agent.status,
      name: agent.name,
      startedAt: agent.startedAt?.toISOString(),
    }));

    return {
      success: true,
      data: result,
    };
  } catch (error) {
    return {
      success: false,
      error: `Failed to list agents: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

// ============================================================================
// Agent Spawn Handler
// ============================================================================

interface AgentSpawnResult {
  agentId: string;
  domain: DomainName;
  type: string;
  status: 'spawned' | 'queued';
  capabilities: string[];
}

export async function handleAgentSpawn(
  params: AgentSpawnParams
): Promise<ToolResult<AgentSpawnResult>> {
  if (!isFleetInitialized()) {
    return {
      success: false,
      error: 'Fleet not initialized. Call fleet_init first.',
    };
  }

  const { queen } = getFleetState();

  try {
    const result = await queen!.requestAgentSpawn(
      params.domain,
      params.type || 'worker',
      params.capabilities || ['general']
    );

    if (!result.success) {
      return {
        success: false,
        error: result.error.message,
      };
    }

    return {
      success: true,
      data: {
        agentId: result.value,
        domain: params.domain,
        type: params.type || 'worker',
        status: 'spawned',
        capabilities: params.capabilities || ['general'],
      },
    };
  } catch (error) {
    return {
      success: false,
      error: `Failed to spawn agent: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

// ============================================================================
// Agent Metrics Handler
// ============================================================================

interface AgentMetrics {
  agentId?: string;
  totalAgents: number;
  activeAgents: number;
  idleAgents: number;
  failedAgents: number;
  utilization: number;
  taskStats?: {
    completed: number;
    failed: number;
    averageDuration: number;
  };
  resourceStats?: {
    cpu: number;
    memory: number;
  };
}

export async function handleAgentMetrics(
  params: AgentMetricsParams
): Promise<ToolResult<AgentMetrics>> {
  if (!isFleetInitialized()) {
    return {
      success: false,
      error: 'Fleet not initialized. Call fleet_init first.',
    };
  }

  const { queen } = getFleetState();

  try {
    const health = queen!.getHealth();
    const metrics = queen!.getMetrics();

    const result: AgentMetrics = {
      agentId: params.agentId,
      totalAgents: health.totalAgents,
      activeAgents: health.activeAgents,
      idleAgents: health.totalAgents - health.activeAgents,
      failedAgents: 0, // Would need to track this
      utilization: metrics.agentUtilization,
    };

    // Add task stats if requested
    if (!params.metric || params.metric === 'all' || params.metric === 'tasks') {
      result.taskStats = {
        completed: metrics.tasksCompleted,
        failed: metrics.tasksFailed,
        averageDuration: metrics.averageTaskDuration,
      };
    }

    // Add resource stats if requested (using real metrics)
    if (!params.metric || params.metric === 'all' || params.metric === 'cpu' || params.metric === 'memory') {
      const resourceStats = MetricsCollector.getResourceStats(params.agentId);
      result.resourceStats = {
        cpu: resourceStats.cpu,
        memory: resourceStats.memory,
      };
    }

    return {
      success: true,
      data: result,
    };
  } catch (error) {
    return {
      success: false,
      error: `Failed to get agent metrics: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

// ============================================================================
// Agent Status Handler (for specific agent)
// ============================================================================

interface AgentStatusParams {
  agentId: string;
}

interface AgentStatusResult {
  agentId: string;
  domain: DomainName;
  type: string;
  status: string;
  currentTask?: string;
  startedAt?: string;
  lastActivity?: string;
  capabilities: string[];
  performance?: {
    tasksCompleted: number;
    averageTime: number;
    successRate: number;
  };
}

export async function handleAgentStatus(
  params: AgentStatusParams
): Promise<ToolResult<AgentStatusResult>> {
  if (!isFleetInitialized()) {
    return {
      success: false,
      error: 'Fleet not initialized. Call fleet_init first.',
    };
  }

  const { queen } = getFleetState();

  try {
    // Find the agent across all domains
    const allAgents = queen!.listAllAgents();
    const agent = allAgents.find((a) => a.id === params.agentId);

    if (!agent) {
      return {
        success: false,
        error: `Agent not found: ${params.agentId}`,
      };
    }

    // Get real performance metrics for this agent
    const taskStats = MetricsCollector.getAgentTaskStats(agent.id);

    const result: AgentStatusResult = {
      agentId: agent.id,
      domain: agent.domain,
      type: agent.type,
      status: agent.status,
      startedAt: agent.startedAt?.toISOString(),
      capabilities: [], // Would need to track in agent info
      performance: {
        tasksCompleted: taskStats.tasksCompleted,
        averageTime: taskStats.averageTime,
        successRate: taskStats.successRate,
      },
    };

    return {
      success: true,
      data: result,
    };
  } catch (error) {
    return {
      success: false,
      error: `Failed to get agent status: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}
