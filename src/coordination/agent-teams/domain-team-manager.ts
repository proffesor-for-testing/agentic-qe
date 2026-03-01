/**
 * Agentic QE v3 - Domain Team Manager
 * ADR-064 Phase 2A: Domain-scoped agent teams for the Queen Coordinator
 *
 * Manages multiple small Agent Teams (2-4 agents each) per domain.
 * Each domain team has a lead agent (domain coordinator) and teammates.
 * Supports auto-scaling, rebalancing, and health monitoring.
 */

import { AgentTeamsAdapter } from './adapter.js';
import { AgentMessageType, DomainTeamConfig } from './types.js';

/** Configuration for the DomainTeamManager */
export interface DomainTeamManagerConfig {
  /** Max teams that can be active simultaneously */
  readonly maxActiveTeams: number;
  /** Default team size per domain (includes lead + teammates) */
  readonly defaultTeamSize: number;
  /** Per-domain team size overrides */
  readonly domainTeamSizes?: Record<string, number>;
  /** Enable auto-scaling based on queue depth */
  readonly autoScaleEnabled: boolean;
  /** Queue depth threshold to spawn additional teammate */
  readonly scaleUpThreshold: number;
  /** Idle time (ms) before removing a teammate */
  readonly scaleDownIdleMs: number;
}

/** Default configuration for the DomainTeamManager */
export const DEFAULT_DOMAIN_TEAM_MANAGER_CONFIG: DomainTeamManagerConfig = {
  maxActiveTeams: 13,
  defaultTeamSize: 3,
  autoScaleEnabled: false,
  scaleUpThreshold: 10,
  scaleDownIdleMs: 60_000,
};

/** Represents a domain team with a lead agent and teammates */
export interface DomainTeam {
  /** Domain this team operates in */
  readonly domain: string;
  /** Agent ID of the team lead (domain coordinator) */
  readonly leadAgentId: string;
  /** Current teammate agent IDs (does not include the lead) */
  readonly teammateIds: string[];
  /** Epoch timestamp when the team was created */
  readonly createdAt: number;
  /** Total number of tasks assigned to this team */
  taskCount: number;
  /** Number of tasks completed by this team */
  completedCount: number;
}

/** Health report for a domain team */
export interface DomainTeamHealth {
  /** Domain this team operates in */
  readonly domain: string;
  /** Total team size (lead + teammates) */
  readonly teamSize: number;
  /** Number of agents that are registered and active */
  readonly activeAgents: number;
  /** Number of agents with no pending messages */
  readonly idleAgents: number;
  /** Total pending (unread) messages across all team members */
  readonly pendingMessages: number;
  /** Number of tasks still pending (assigned - completed) */
  readonly tasksPending: number;
  /** Number of tasks completed */
  readonly tasksCompleted: number;
  /** Whether the team is considered healthy */
  readonly healthy: boolean;
}

/** Result of a scale operation on a domain team */
export interface ScaleResult {
  /** Domain that was scaled */
  readonly domain: string;
  /** Team size before scaling */
  readonly previousSize: number;
  /** Team size after scaling */
  readonly newSize: number;
  /** Agent IDs that were added */
  readonly addedAgents: string[];
  /** Agent IDs that were removed */
  readonly removedAgents: string[];
}

/** Result of a rebalance operation across domain teams */
export interface RebalanceResult {
  /** List of agent moves between domains */
  readonly moves: Array<{
    readonly agentId: string;
    readonly fromDomain: string;
    readonly toDomain: string;
  }>;
  /** Number of teams affected by the rebalance */
  readonly teamsAffected: number;
}

/** Internal mutable representation of a domain team */
interface MutableDomainTeam {
  readonly domain: string;
  readonly leadAgentId: string;
  teammateIds: string[];
  readonly createdAt: number;
  taskCount: number;
  completedCount: number;
  lastActivity: Map<string, number>;
}

/**
 * Manages domain-scoped agent teams for the Queen Coordinator.
 *
 * Each domain can have a small team (2-4 agents) with a lead agent
 * acting as domain coordinator. The manager handles team lifecycle,
 * task assignment, health monitoring, scaling, and rebalancing.
 */
export class DomainTeamManager {
  private static readonly SYSTEM_AGENT_ID = '__dtm_system__';
  private static readonly SYSTEM_DOMAIN = '__system__';

  private readonly adapter: AgentTeamsAdapter;
  private readonly config: DomainTeamManagerConfig;
  private readonly teams = new Map<string, MutableDomainTeam>();
  private systemAgentRegistered = false;

  constructor(
    adapter: AgentTeamsAdapter,
    config?: Partial<DomainTeamManagerConfig>
  ) {
    this.adapter = adapter;
    this.config = { ...DEFAULT_DOMAIN_TEAM_MANAGER_CONFIG, ...config };
  }

  /**
   * Create a domain team with a lead agent and optional initial teammates.
   * Registers all agents in the adapter and creates the underlying team config.
   * @throws Error if a team already exists for the domain or max teams reached
   */
  createDomainTeam(
    domain: string,
    leadAgentId: string,
    teammateIds?: string[]
  ): DomainTeam {
    if (this.teams.has(domain)) {
      throw new Error(
        `Domain team already exists for '${domain}'. ` +
        `Use getDomainTeam() to inspect the existing team.`
      );
    }
    if (this.teams.size >= this.config.maxActiveTeams) {
      throw new Error(
        `Maximum active teams (${this.config.maxActiveTeams}) reached. ` +
        `Remove an existing team before creating a new one.`
      );
    }

    const resolvedTeammates = teammateIds ? [...teammateIds] : [];
    const maxSize = this.getMaxTeamSize(domain);
    if (resolvedTeammates.length + 1 > maxSize) {
      resolvedTeammates.length = maxSize - 1;
    }

    const now = Date.now();
    const team: MutableDomainTeam = {
      domain,
      leadAgentId,
      teammateIds: resolvedTeammates,
      createdAt: now,
      taskCount: 0,
      completedCount: 0,
      lastActivity: new Map<string, number>(),
    };
    team.lastActivity.set(leadAgentId, now);
    for (const id of resolvedTeammates) {
      team.lastActivity.set(id, now);
    }

    this.teams.set(domain, team);

    const adapterConfig: DomainTeamConfig = {
      domain,
      leadAgentId,
      maxTeammates: maxSize - 1,
      teammateIds: resolvedTeammates,
      autoAssignEnabled: false,
    };
    this.adapter.createTeam(adapterConfig);

    return this.toSnapshot(team);
  }

  /**
   * Remove a domain team, unregistering all its agents.
   * @returns True if a team was removed, false if none existed
   */
  removeDomainTeam(domain: string): boolean {
    const team = this.teams.get(domain);
    if (!team) return false;

    for (const agentId of [team.leadAgentId, ...team.teammateIds]) {
      this.adapter.unregisterAgent(agentId);
    }
    this.teams.delete(domain);
    return true;
  }

  /** Get a snapshot of a domain team, or undefined if none exists. */
  getDomainTeam(domain: string): DomainTeam | undefined {
    const team = this.teams.get(domain);
    return team ? this.toSnapshot(team) : undefined;
  }

  /**
   * Add a specific agent as a teammate to an existing domain team.
   * Unlike scaleTeam(), this uses the real agent ID rather than generating one.
   * @returns True if the agent was added, false if team doesn't exist or is full
   */
  addTeammate(domain: string, agentId: string): boolean {
    const team = this.teams.get(domain);
    if (!team) return false;

    // Guard against duplicate agent IDs
    if (agentId === team.leadAgentId || team.teammateIds.includes(agentId)) return false;

    const maxSize = this.getMaxTeamSize(domain);
    if (1 + team.teammateIds.length >= maxSize) return false;

    team.teammateIds.push(agentId);
    team.lastActivity.set(agentId, Date.now());
    this.adapter.registerAgent(agentId, domain);
    return true;
  }

  /** List all active domain teams. */
  listDomainTeams(): DomainTeam[] {
    return Array.from(this.teams.values(), t => this.toSnapshot(t));
  }

  /**
   * Assign a task to a domain team by sending a task-assignment message
   * to the team lead. The lead can then delegate to teammates via mailbox.
   * @returns True if the task was assigned, false if the team does not exist
   */
  assignTaskToTeam(domain: string, taskId: string, taskPayload: unknown): boolean {
    const team = this.teams.get(domain);
    if (!team) return false;

    this.ensureSystemAgent();
    this.adapter.sendMessage(
      DomainTeamManager.SYSTEM_AGENT_ID,
      team.leadAgentId,
      'task-assignment',
      { taskId, payload: taskPayload },
      { domain }
    );

    team.taskCount++;
    team.lastActivity.set(team.leadAgentId, Date.now());
    return true;
  }

  /**
   * Broadcast a message to all members of a domain team.
   * @throws Error if no team exists for the domain
   */
  broadcastToDomain(domain: string, type: AgentMessageType, payload: unknown): void {
    const team = this.teams.get(domain);
    if (!team) {
      throw new Error(
        `No domain team found for '${domain}'. ` +
        `Create a team first with createDomainTeam().`
      );
    }

    this.adapter.broadcast(domain, type, payload, { from: '__system__' });

    const now = Date.now();
    team.lastActivity.set(team.leadAgentId, now);
    for (const id of team.teammateIds) {
      team.lastActivity.set(id, now);
    }
  }

  /** Get health information for a domain team. */
  getTeamHealth(domain: string): DomainTeamHealth | undefined {
    const team = this.teams.get(domain);
    if (!team) return undefined;

    const allAgentIds = [team.leadAgentId, ...team.teammateIds];
    const teamSize = allAgentIds.length;
    let activeAgents = 0;
    let idleAgents = 0;
    let pendingMessages = 0;

    for (const agentId of allAgentIds) {
      if (this.adapter.isRegistered(agentId)) {
        activeAgents++;
        const unread = this.adapter.getUnreadCount(agentId);
        pendingMessages += unread;
        if (unread === 0) idleAgents++;
      }
    }

    const tasksPending = team.taskCount - team.completedCount;
    return {
      domain,
      teamSize,
      activeAgents,
      idleAgents,
      pendingMessages,
      tasksPending,
      tasksCompleted: team.completedCount,
      healthy: activeAgents > 0 && activeAgents === teamSize
        && tasksPending < this.config.scaleUpThreshold * 2,
    };
  }

  /**
   * Scale a domain team to a target size by adding or removing teammates.
   * The lead agent is never removed. Respects the max team size for the domain.
   * @throws Error if no team exists for the domain
   */
  scaleTeam(domain: string, targetSize: number): ScaleResult {
    const team = this.teams.get(domain);
    if (!team) {
      throw new Error(
        `No domain team found for '${domain}'. ` +
        `Create a team first with createDomainTeam().`
      );
    }

    // When user explicitly requests scaling, allow up to maxActiveTeams * reasonable per-team cap.
    // The defaultTeamSize is for initial creation only, not a hard cap on explicit scaling.
    const maxSize = Math.max(this.getMaxTeamSize(domain), targetSize, this.config.maxActiveTeams);
    const clampedTarget = Math.max(1, Math.min(targetSize, maxSize));
    const currentSize = 1 + team.teammateIds.length;
    const addedAgents: string[] = [];
    const removedAgents: string[] = [];

    if (clampedTarget > currentSize) {
      const toAdd = clampedTarget - currentSize;
      for (let i = 0; i < toAdd; i++) {
        const agentId = `${domain}-teammate-${Date.now()}-${i}`;
        team.teammateIds.push(agentId);
        team.lastActivity.set(agentId, Date.now());
        this.adapter.registerAgent(agentId, domain);
        addedAgents.push(agentId);
      }
    } else if (clampedTarget < currentSize) {
      const toRemove = currentSize - clampedTarget;
      for (let i = 0; i < toRemove; i++) {
        const agentId = team.teammateIds.pop();
        if (agentId) {
          team.lastActivity.delete(agentId);
          this.adapter.unregisterAgent(agentId);
          removedAgents.push(agentId);
        }
      }
    }

    return {
      domain,
      previousSize: currentSize,
      newSize: 1 + team.teammateIds.length,
      addedAgents,
      removedAgents,
    };
  }

  /**
   * Get agent IDs that have no pending messages.
   * @param domain - Optional domain filter; omit for all teams
   */
  getIdleTeammates(domain?: string): string[] {
    if (domain) {
      const team = this.teams.get(domain);
      return team ? this.getIdleAgentsForTeam(team) : [];
    }
    const idle: string[] = [];
    for (const team of this.teams.values()) {
      idle.push(...this.getIdleAgentsForTeam(team));
    }
    return idle;
  }

  /**
   * Rebalance agents across domain teams by moving idle teammates
   * from over-staffed teams to under-staffed ones. Never moves leads.
   */
  rebalance(): RebalanceResult {
    const moves: RebalanceResult['moves'] = [];
    const affectedDomains = new Set<string>();

    const stats = Array.from(this.teams.values(), team => {
      const targetSize = this.getTargetTeamSize(team.domain);
      const currentSize = 1 + team.teammateIds.length;
      const idleTeammates = this.getIdleAgentsForTeam(team)
        .filter(id => id !== team.leadAgentId);
      return { domain: team.domain, team, currentSize, targetSize, idleTeammates };
    });

    const donors = stats
      .filter(s => s.currentSize > s.targetSize && s.idleTeammates.length > 0)
      .sort((a, b) => (b.currentSize - b.targetSize) - (a.currentSize - a.targetSize));
    const receivers = stats
      .filter(s => s.currentSize < s.targetSize)
      .sort((a, b) => (a.currentSize - a.targetSize) - (b.currentSize - b.targetSize));

    for (const donor of donors) {
      for (const receiver of receivers) {
        if (receiver.currentSize >= receiver.targetSize) continue;
        if (donor.idleTeammates.length === 0) break;
        if (receiver.currentSize >= this.getMaxTeamSize(receiver.domain)) continue;

        const agentId = donor.idleTeammates.shift()!;
        const idx = donor.team.teammateIds.indexOf(agentId);
        if (idx >= 0) donor.team.teammateIds.splice(idx, 1);
        donor.team.lastActivity.delete(agentId);
        donor.currentSize--;

        this.adapter.unregisterAgent(agentId);
        this.adapter.registerAgent(agentId, receiver.domain);

        receiver.team.teammateIds.push(agentId);
        receiver.team.lastActivity.set(agentId, Date.now());
        receiver.currentSize++;

        moves.push({ agentId, fromDomain: donor.domain, toDomain: receiver.domain });
        affectedDomains.add(donor.domain);
        affectedDomains.add(receiver.domain);
      }
    }

    return { moves, teamsAffected: affectedDomains.size };
  }

  /** Dispose all domain teams and release resources. */
  dispose(): void {
    for (const team of this.teams.values()) {
      for (const agentId of [team.leadAgentId, ...team.teammateIds]) {
        this.adapter.unregisterAgent(agentId);
      }
    }
    this.teams.clear();
    if (this.systemAgentRegistered) {
      this.adapter.unregisterAgent(DomainTeamManager.SYSTEM_AGENT_ID);
      this.systemAgentRegistered = false;
    }
  }

  /**
   * Mark a task as completed for a domain team. Updates internal counters.
   * @returns True if the domain team exists and the count was updated
   */
  markTaskCompleted(domain: string): boolean {
    const team = this.teams.get(domain);
    if (!team) return false;
    if (team.completedCount < team.taskCount) {
      team.completedCount++;
    }
    return true;
  }

  // --- Private helpers ---

  private ensureSystemAgent(): void {
    if (this.systemAgentRegistered) return;
    this.adapter.registerAgent(
      DomainTeamManager.SYSTEM_AGENT_ID,
      DomainTeamManager.SYSTEM_DOMAIN
    );
    this.systemAgentRegistered = true;
  }

  private getMaxTeamSize(domain: string): number {
    if (this.config.domainTeamSizes && domain in this.config.domainTeamSizes) {
      return this.config.domainTeamSizes[domain];
    }
    return this.config.defaultTeamSize;
  }

  private getTargetTeamSize(domain: string): number {
    return this.getMaxTeamSize(domain);
  }

  private getIdleAgentsForTeam(team: MutableDomainTeam): string[] {
    const idle: string[] = [];
    for (const agentId of [team.leadAgentId, ...team.teammateIds]) {
      if (this.adapter.isRegistered(agentId) && this.adapter.getUnreadCount(agentId) === 0) {
        idle.push(agentId);
      }
    }
    return idle;
  }

  private toSnapshot(team: MutableDomainTeam): DomainTeam {
    return {
      domain: team.domain,
      leadAgentId: team.leadAgentId,
      teammateIds: [...team.teammateIds],
      createdAt: team.createdAt,
      taskCount: team.taskCount,
      completedCount: team.completedCount,
    };
  }
}

/**
 * Create a new DomainTeamManager with the given adapter and optional config.
 * @param adapter - The AgentTeamsAdapter for messaging and agent registration
 * @param config - Partial configuration (merged with defaults)
 */
export function createDomainTeamManager(
  adapter: AgentTeamsAdapter,
  config?: Partial<DomainTeamManagerConfig>
): DomainTeamManager {
  return new DomainTeamManager(adapter, config);
}
