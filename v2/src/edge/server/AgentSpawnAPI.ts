/**
 * Agent Spawn API
 *
 * REST API endpoints for spawning and managing QE agents from the dashboard.
 * Integrates with the agentic-qe CLI to spawn agents in the background.
 *
 * @module edge/server/AgentSpawnAPI
 * @version 1.0.0
 */

import { spawn, ChildProcess } from 'child_process';
import { EventEmitter } from 'events';

// ============================================
// Types
// ============================================

export interface SpawnAgentRequest {
  agentType: string;
  task: string;
  projectPath?: string;
  options?: {
    priority?: 'low' | 'medium' | 'high' | 'critical';
    timeout?: number;
    dryRun?: boolean;
  };
}

export interface AgentInstance {
  id: string;
  agentType: string;
  task: string;
  status: 'pending' | 'running' | 'completed' | 'error' | 'cancelled';
  startedAt: number;
  completedAt?: number;
  output: string[];
  error?: string;
  exitCode?: number;
  process?: ChildProcess;
}

export interface AgentSpawnResult {
  success: boolean;
  agentId?: string;
  error?: string;
}

export interface AgentStatus {
  id: string;
  agentType: string;
  status: AgentInstance['status'];
  task: string;
  startedAt: number;
  duration?: number;
  outputLines: number;
  lastOutput?: string;
}

// ============================================
// Agent Type Mappings
// ============================================

const AGENT_TYPE_MAP: Record<string, string> = {
  'qe-test-generator': 'test-generator',
  'qe-coverage-analyzer': 'coverage-analyzer',
  'qe-test-writer': 'test-writer',
  'qe-test-implementer': 'test-implementer',
  'qe-test-refactorer': 'test-refactorer',
  'qe-security-scanner': 'security-scanner',
  'qe-performance-tester': 'performance-tester',
  'qe-flaky-investigator': 'flaky-investigator',
  'qe-code-reviewer': 'code-reviewer',
  'qe-api-validator': 'api-contract-validator',
};

// ============================================
// Agent Spawn Service
// ============================================

export class AgentSpawnService extends EventEmitter {
  private agents: Map<string, AgentInstance> = new Map();
  private maxAgents: number;
  private projectPath: string;

  constructor(options: { maxAgents?: number; projectPath?: string } = {}) {
    super();
    this.maxAgents = options.maxAgents || 10;
    this.projectPath = options.projectPath || process.cwd();
  }

  /**
   * Spawn a new QE agent
   */
  public async spawn(request: SpawnAgentRequest): Promise<AgentSpawnResult> {
    // Check agent limit
    const runningAgents = Array.from(this.agents.values()).filter(
      (a) => a.status === 'running' || a.status === 'pending'
    );

    if (runningAgents.length >= this.maxAgents) {
      return {
        success: false,
        error: `Maximum concurrent agents reached (${this.maxAgents})`,
      };
    }

    // Generate agent ID
    const agentId = `agent-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    // Map agent type
    const cliAgentType = AGENT_TYPE_MAP[request.agentType] || request.agentType;

    // Create agent instance
    const agent: AgentInstance = {
      id: agentId,
      agentType: request.agentType,
      task: request.task,
      status: 'pending',
      startedAt: Date.now(),
      output: [],
    };

    this.agents.set(agentId, agent);
    this.emit('agent:created', { agentId, agentType: request.agentType });

    // Build command
    const projectPath = request.projectPath || this.projectPath;
    const args = [
      'spawn',
      cliAgentType,
      '--task', request.task,
      '--project', projectPath,
    ];

    if (request.options?.priority) {
      args.push('--priority', request.options.priority);
    }

    if (request.options?.dryRun) {
      args.push('--dry-run');
    }

    // Start agent process
    try {
      if (request.options?.dryRun) {
        // Dry run - just simulate
        agent.status = 'completed';
        agent.completedAt = Date.now();
        agent.output.push(`[DRY RUN] Would spawn ${cliAgentType} with task: ${request.task}`);
        this.emit('agent:completed', { agentId, exitCode: 0 });
      } else {
        await this.startAgentProcess(agentId, args);
      }

      return { success: true, agentId };
    } catch (error) {
      agent.status = 'error';
      agent.error = error instanceof Error ? error.message : String(error);
      this.emit('agent:error', { agentId, error: agent.error });
      return { success: false, error: agent.error };
    }
  }

  /**
   * Start the agent process
   */
  private startAgentProcess(agentId: string, args: string[]): Promise<void> {
    return new Promise((resolve, reject) => {
      const agent = this.agents.get(agentId);
      if (!agent) {
        reject(new Error('Agent not found'));
        return;
      }

      try {
        // Use npx to run aqe CLI
        const proc = spawn('npx', ['aqe', ...args], {
          cwd: this.projectPath,
          stdio: ['ignore', 'pipe', 'pipe'],
          env: { ...process.env, FORCE_COLOR: '0' },
        });

        agent.process = proc;
        agent.status = 'running';
        this.emit('agent:started', { agentId });

        proc.stdout?.on('data', (data: Buffer) => {
          const lines = data.toString().split('\n').filter(Boolean);
          agent.output.push(...lines);
          this.emit('agent:output', { agentId, data: lines });
        });

        proc.stderr?.on('data', (data: Buffer) => {
          const lines = data.toString().split('\n').filter(Boolean);
          agent.output.push(...lines.map((l) => `[stderr] ${l}`));
          this.emit('agent:output', { agentId, data: lines, isError: true });
        });

        proc.on('close', (code) => {
          agent.status = code === 0 ? 'completed' : 'error';
          agent.completedAt = Date.now();
          agent.exitCode = code ?? undefined;
          agent.process = undefined;

          if (code !== 0) {
            agent.error = `Process exited with code ${code}`;
          }

          this.emit('agent:completed', { agentId, exitCode: code });
        });

        proc.on('error', (error) => {
          agent.status = 'error';
          agent.error = error.message;
          agent.completedAt = Date.now();
          agent.process = undefined;
          this.emit('agent:error', { agentId, error: error.message });
          reject(error);
        });

        resolve();
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * Cancel a running agent
   */
  public cancel(agentId: string): boolean {
    const agent = this.agents.get(agentId);
    if (!agent) return false;

    if (agent.status !== 'running' && agent.status !== 'pending') {
      return false;
    }

    if (agent.process) {
      agent.process.kill('SIGTERM');
    }

    agent.status = 'cancelled';
    agent.completedAt = Date.now();
    agent.process = undefined;
    this.emit('agent:cancelled', { agentId });

    return true;
  }

  /**
   * Get agent status
   */
  public getStatus(agentId: string): AgentStatus | null {
    const agent = this.agents.get(agentId);
    if (!agent) return null;

    return {
      id: agent.id,
      agentType: agent.agentType,
      status: agent.status,
      task: agent.task,
      startedAt: agent.startedAt,
      duration: agent.completedAt
        ? agent.completedAt - agent.startedAt
        : Date.now() - agent.startedAt,
      outputLines: agent.output.length,
      lastOutput: agent.output[agent.output.length - 1],
    };
  }

  /**
   * Get agent output
   */
  public getOutput(agentId: string, lastN?: number): string[] | null {
    const agent = this.agents.get(agentId);
    if (!agent) return null;

    if (lastN && lastN > 0) {
      return agent.output.slice(-lastN);
    }

    return [...agent.output];
  }

  /**
   * List all agents
   */
  public list(filter?: {
    status?: AgentInstance['status'];
    agentType?: string;
  }): AgentStatus[] {
    const agents = Array.from(this.agents.values());

    let filtered = agents;

    if (filter?.status) {
      filtered = filtered.filter((a) => a.status === filter.status);
    }

    if (filter?.agentType) {
      filtered = filtered.filter((a) => a.agentType === filter.agentType);
    }

    return filtered.map((agent) => ({
      id: agent.id,
      agentType: agent.agentType,
      status: agent.status,
      task: agent.task,
      startedAt: agent.startedAt,
      duration: agent.completedAt
        ? agent.completedAt - agent.startedAt
        : Date.now() - agent.startedAt,
      outputLines: agent.output.length,
      lastOutput: agent.output[agent.output.length - 1],
    }));
  }

  /**
   * Clean up completed/failed agents older than maxAge
   */
  public cleanup(maxAgeMs: number = 3600000): number {
    const now = Date.now();
    let cleaned = 0;

    const agentEntries = Array.from(this.agents.entries());
    for (const [agentId, agent] of agentEntries) {
      if (
        agent.status !== 'running' &&
        agent.status !== 'pending' &&
        agent.completedAt &&
        now - agent.completedAt > maxAgeMs
      ) {
        this.agents.delete(agentId);
        cleaned++;
      }
    }

    return cleaned;
  }

  /**
   * Get available agent types
   */
  public getAvailableTypes(): Array<{ id: string; name: string; cliType: string }> {
    return Object.entries(AGENT_TYPE_MAP).map(([id, cliType]) => ({
      id,
      name: id.replace('qe-', '').replace(/-/g, ' '),
      cliType,
    }));
  }
}

export default AgentSpawnService;
