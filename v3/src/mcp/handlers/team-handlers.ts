/**
 * Agentic QE v3 - Team MCP Handlers
 * ADR-064: Agent Teams management via MCP tools
 *
 * Exposes DomainTeamManager and AgentTeamsAdapter functionality
 * through 6 new MCP tools: team_list, team_health, team_message,
 * team_broadcast, team_scale, team_rebalance.
 */

import { getFleetState, isFleetInitialized } from './core-handlers';
import {
  ToolResult,
  TeamListParams,
  TeamHealthParams,
  TeamMessageParams,
  TeamBroadcastParams,
  TeamScaleParams,
  TeamRebalanceParams,
} from '../types';
import type { AgentMessageType } from '../../coordination/agent-teams/types.js';
import type { DomainTeam, DomainTeamHealth, ScaleResult, RebalanceResult } from '../../coordination/agent-teams/domain-team-manager.js';
import { toErrorMessage } from '../../shared/error-utils.js';

const VALID_MESSAGE_TYPES: ReadonlySet<string> = new Set<AgentMessageType>([
  'task-assignment', 'finding', 'challenge', 'consensus',
  'alert', 'heartbeat', 'idle-notification', 'completion-report',
]);

function validateMessageType(type: string): type is AgentMessageType {
  return VALID_MESSAGE_TYPES.has(type);
}

// ============================================================================
// team_list — List all domain teams
// ============================================================================

interface TeamListResponse {
  domain: string;
  leadAgentId: string;
  teammateIds: string[];
  teamSize: number;
  taskCount: number;
  completedCount: number;
  createdAt: string;
}

export async function handleTeamList(
  params: TeamListParams
): Promise<ToolResult<TeamListResponse[]>> {
  if (!isFleetInitialized()) {
    return {
      success: false,
      error: 'Fleet not initialized. Call fleet_init first.',
    };
  }

  const { queen } = getFleetState();

  try {
    const manager = queen!.getDomainTeamManager();
    if (!manager) {
      return {
        success: false,
        error: 'Agent Teams not initialized. Teams are created automatically when agents are spawned.',
      };
    }

    let teams: DomainTeam[] = manager.listDomainTeams();

    // Filter by domain if specified
    if (params.domain) {
      teams = teams.filter(t => t.domain === params.domain);
    }

    const result: TeamListResponse[] = teams.map(t => ({
      domain: t.domain,
      leadAgentId: t.leadAgentId,
      teammateIds: t.teammateIds,
      teamSize: 1 + t.teammateIds.length,
      taskCount: t.taskCount,
      completedCount: t.completedCount,
      createdAt: new Date(t.createdAt).toISOString(),
    }));

    return {
      success: true,
      data: result,
    };
  } catch (error) {
    return {
      success: false,
      error: `Failed to list teams: ${toErrorMessage(error)}`,
    };
  }
}

// ============================================================================
// team_health — Get team health for a domain
// ============================================================================

export async function handleTeamHealth(
  params: TeamHealthParams
): Promise<ToolResult<DomainTeamHealth>> {
  if (!isFleetInitialized()) {
    return {
      success: false,
      error: 'Fleet not initialized. Call fleet_init first.',
    };
  }

  const { queen } = getFleetState();

  try {
    const manager = queen!.getDomainTeamManager();
    if (!manager) {
      return {
        success: false,
        error: 'Agent Teams not initialized.',
      };
    }

    const health = manager.getTeamHealth(params.domain);
    if (!health) {
      return {
        success: false,
        error: `No team found for domain: ${params.domain}`,
      };
    }

    return {
      success: true,
      data: health,
    };
  } catch (error) {
    return {
      success: false,
      error: `Failed to get team health: ${toErrorMessage(error)}`,
    };
  }
}

// ============================================================================
// team_message — Send message between agents
// ============================================================================

interface TeamMessageResponse {
  messageId: string;
  from: string;
  to: string;
  type: string;
  timestamp: string;
}

export async function handleTeamMessage(
  params: TeamMessageParams
): Promise<ToolResult<TeamMessageResponse>> {
  if (!isFleetInitialized()) {
    return {
      success: false,
      error: 'Fleet not initialized. Call fleet_init first.',
    };
  }

  const { queen } = getFleetState();

  try {
    if (!validateMessageType(params.type)) {
      return {
        success: false,
        error: `Invalid message type: '${params.type}'. Valid types: ${[...VALID_MESSAGE_TYPES].join(', ')}`,
      };
    }

    const adapter = queen!.getAgentTeamsAdapter();
    if (!adapter) {
      return {
        success: false,
        error: 'Agent Teams not initialized.',
      };
    }

    const message = adapter.sendMessage(
      params.from,
      params.to,
      params.type as AgentMessageType,
      params.payload,
      params.domain ? { domain: params.domain } : undefined
    );

    return {
      success: true,
      data: {
        messageId: message.id,
        from: message.from,
        to: message.to as string,
        type: message.type,
        timestamp: new Date(message.timestamp).toISOString(),
      },
    };
  } catch (error) {
    return {
      success: false,
      error: `Failed to send message: ${toErrorMessage(error)}`,
    };
  }
}

// ============================================================================
// team_broadcast — Broadcast to all agents in a domain
// ============================================================================

interface TeamBroadcastResponse {
  domain: string;
  type: string;
  recipientCount: number;
  timestamp: string;
}

export async function handleTeamBroadcast(
  params: TeamBroadcastParams
): Promise<ToolResult<TeamBroadcastResponse>> {
  if (!isFleetInitialized()) {
    return {
      success: false,
      error: 'Fleet not initialized. Call fleet_init first.',
    };
  }

  const { queen } = getFleetState();

  try {
    if (!validateMessageType(params.type)) {
      return {
        success: false,
        error: `Invalid message type: '${params.type}'. Valid types: ${[...VALID_MESSAGE_TYPES].join(', ')}`,
      };
    }

    const manager = queen!.getDomainTeamManager();
    if (!manager) {
      return {
        success: false,
        error: 'Agent Teams not initialized.',
      };
    }

    const team = manager.getDomainTeam(params.domain);
    if (!team) {
      return {
        success: false,
        error: `No team found for domain: ${params.domain}`,
      };
    }

    manager.broadcastToDomain(
      params.domain,
      params.type as AgentMessageType,
      params.payload
    );

    const recipientCount = 1 + team.teammateIds.length;

    return {
      success: true,
      data: {
        domain: params.domain,
        type: params.type,
        recipientCount,
        timestamp: new Date().toISOString(),
      },
    };
  } catch (error) {
    return {
      success: false,
      error: `Failed to broadcast: ${toErrorMessage(error)}`,
    };
  }
}

// ============================================================================
// team_scale — Scale a domain team up/down
// ============================================================================

export async function handleTeamScale(
  params: TeamScaleParams
): Promise<ToolResult<ScaleResult>> {
  if (!isFleetInitialized()) {
    return {
      success: false,
      error: 'Fleet not initialized. Call fleet_init first.',
    };
  }

  const { queen } = getFleetState();

  try {
    const manager = queen!.getDomainTeamManager();
    if (!manager) {
      return {
        success: false,
        error: 'Agent Teams not initialized.',
      };
    }

    const result = manager.scaleTeam(params.domain, params.targetSize);

    return {
      success: true,
      data: result,
    };
  } catch (error) {
    return {
      success: false,
      error: `Failed to scale team: ${toErrorMessage(error)}`,
    };
  }
}

// ============================================================================
// team_rebalance — Rebalance agents across teams
// ============================================================================

export async function handleTeamRebalance(
  _params: TeamRebalanceParams
): Promise<ToolResult<RebalanceResult>> {
  if (!isFleetInitialized()) {
    return {
      success: false,
      error: 'Fleet not initialized. Call fleet_init first.',
    };
  }

  const { queen } = getFleetState();

  try {
    const manager = queen!.getDomainTeamManager();
    if (!manager) {
      return {
        success: false,
        error: 'Agent Teams not initialized.',
      };
    }

    const result = manager.rebalance();

    return {
      success: true,
      data: result,
    };
  } catch (error) {
    return {
      success: false,
      error: `Failed to rebalance teams: ${toErrorMessage(error)}`,
    };
  }
}
