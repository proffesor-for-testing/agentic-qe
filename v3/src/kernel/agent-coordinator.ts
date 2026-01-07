/**
 * Agentic QE v3 - Agent Coordinator
 * Manages agent lifecycle with max 15 concurrent agents limit
 */

import { v4 as uuidv4 } from 'uuid';
import { AgentStatus, DomainName, Result, ok, err } from '../shared/types';
import {
  AgentCoordinator,
  AgentSpawnConfig,
  AgentFilter,
  AgentInfo,
} from './interfaces';

const MAX_CONCURRENT_AGENTS = 15;

interface ManagedAgent {
  id: string;
  name: string;
  domain: DomainName;
  type: string;
  status: AgentStatus;
  capabilities: string[];
  config: Record<string, unknown>;
  startedAt?: Date;
  completedAt?: Date;
}

export class DefaultAgentCoordinator implements AgentCoordinator {
  private agents: Map<string, ManagedAgent> = new Map();
  private maxAgents: number;

  constructor(maxAgents: number = MAX_CONCURRENT_AGENTS) {
    this.maxAgents = maxAgents;
  }

  async spawn(config: AgentSpawnConfig): Promise<Result<string, Error>> {
    // Check agent limit
    if (!this.canSpawn()) {
      return err(
        new Error(
          `Cannot spawn agent: maximum concurrent agents (${this.maxAgents}) reached. ` +
          `Active: ${this.getActiveCount()}`
        )
      );
    }

    const id = uuidv4();
    const agent: ManagedAgent = {
      id,
      name: config.name,
      domain: config.domain,
      type: config.type,
      status: 'running',
      capabilities: config.capabilities,
      config: config.config ?? {},
      startedAt: new Date(),
    };

    this.agents.set(id, agent);

    return ok(id);
  }

  getStatus(agentId: string): AgentStatus | undefined {
    return this.agents.get(agentId)?.status;
  }

  listAgents(filter?: AgentFilter): AgentInfo[] {
    let agents = Array.from(this.agents.values());

    if (filter) {
      if (filter.domain) {
        agents = agents.filter((a) => a.domain === filter.domain);
      }
      if (filter.status) {
        agents = agents.filter((a) => a.status === filter.status);
      }
      if (filter.type) {
        agents = agents.filter((a) => a.type === filter.type);
      }
    }

    return agents.map((a) => ({
      id: a.id,
      name: a.name,
      domain: a.domain,
      type: a.type,
      status: a.status,
      startedAt: a.startedAt,
    }));
  }

  async stop(agentId: string): Promise<Result<void, Error>> {
    const agent = this.agents.get(agentId);
    if (!agent) {
      return err(new Error(`Agent not found: ${agentId}`));
    }

    if (agent.status !== 'running') {
      return err(new Error(`Agent ${agentId} is not running (status: ${agent.status})`));
    }

    agent.status = 'completed';
    agent.completedAt = new Date();

    return ok(undefined);
  }

  getActiveCount(): number {
    return Array.from(this.agents.values()).filter(
      (a) => a.status === 'running' || a.status === 'queued'
    ).length;
  }

  canSpawn(): boolean {
    return this.getActiveCount() < this.maxAgents;
  }

  async dispose(): Promise<void> {
    // Stop all running agents
    const runningAgents = Array.from(this.agents.values()).filter(
      (a) => a.status === 'running'
    );

    await Promise.all(runningAgents.map((a) => this.stop(a.id)));
    this.agents.clear();
  }

  // Internal methods for agent status updates
  markCompleted(agentId: string): void {
    const agent = this.agents.get(agentId);
    if (agent && agent.status === 'running') {
      agent.status = 'completed';
      agent.completedAt = new Date();
    }
  }

  markFailed(agentId: string): void {
    const agent = this.agents.get(agentId);
    if (agent && agent.status === 'running') {
      agent.status = 'failed';
      agent.completedAt = new Date();
    }
  }

  // Cleanup completed/failed agents older than TTL
  cleanup(ttlMs: number = 3600000): number {
    const now = Date.now();
    let cleaned = 0;

    for (const [id, agent] of this.agents.entries()) {
      if (
        (agent.status === 'completed' || agent.status === 'failed') &&
        agent.completedAt &&
        now - agent.completedAt.getTime() > ttlMs
      ) {
        this.agents.delete(id);
        cleaned++;
      }
    }

    return cleaned;
  }
}
