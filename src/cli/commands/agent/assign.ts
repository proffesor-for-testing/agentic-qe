/**
 * Agent Assign Command
 *
 * Assigns tasks to agents with intelligent load balancing, capability matching,
 * and resource optimization. Supports auto-assignment and manual assignment.
 *
 * @module cli/commands/agent/assign
 */

import * as fs from 'fs-extra';
import * as path from 'path';
import { getAgentRegistry } from '../../../mcp/services/AgentRegistry';
import { Logger } from '../../../utils/Logger';

const logger = Logger.getInstance();

/** Capability configuration */
interface AgentCapability {
  name: string;
  enabled?: boolean;
}

/** Agent configuration within registry */
interface AgentConfig {
  capabilities?: AgentCapability[];
  [key: string]: unknown;
}

/** Registered agent info */
interface RegisteredAgentInfo {
  id: string;
  status: 'idle' | 'busy' | 'error' | 'terminated';
  mcpType: string;
  tasksCompleted: number;
  totalExecutionTime: number;
  agent?: {
    config?: AgentConfig;
  };
}

/** Agent registry interface */
interface AgentRegistry {
  getRegisteredAgent(id: string): RegisteredAgentInfo | undefined;
  getAllAgents(): RegisteredAgentInfo[];
}

/** Task definition structure */
interface TaskDefinition {
  type: string;
  [key: string]: unknown;
}

/** Queue entry structure */
interface QueueEntry {
  taskId: string;
  task: TaskDefinition;
  priority: string;
  queuedAt: string;
}

/** Task queue structure */
interface TaskQueue {
  tasks: QueueEntry[];
}

export interface AssignOptions {
  agentId?: string;
  taskId: string;
  taskType?: string;
  requireCapability?: string;
  autoBalance?: boolean;
  priority?: 'low' | 'medium' | 'high' | 'critical';
  timeout?: number;
  retryOnFailure?: boolean;
}

export interface AssignResult {
  taskId: string;
  agentId: string;
  agentType: string;
  status: 'assigned' | 'queued' | 'failed';
  assignedAt: Date;
  estimatedCompletion?: Date;
  queuePosition?: number;
  capabilities: string[];
}

/**
 * Agent Assign Command Implementation
 */
export class AgentAssignCommand {
  private static readonly TASKS_DIR = path.join(process.cwd(), '.aqe', 'tasks');
  private static readonly AGENT_DIR = path.join(process.cwd(), '.aqe', 'agents');
  private static readonly QUEUE_DIR = path.join(process.cwd(), '.aqe', 'queue');

  /**
   * Execute task assignment
   *
   * @param options - Assignment options
   * @returns Assignment result
   */
  static async execute(options: AssignOptions): Promise<AssignResult> {
    const {
      agentId,
      taskId,
      taskType,
      requireCapability,
      autoBalance = false,
      priority = 'medium',
      timeout = 300000,
      retryOnFailure = true
    } = options;

    logger.info(`Assigning task: ${taskId}`, { agentId, autoBalance, priority });

    try {
      // Get agent registry
      const registry = getAgentRegistry() as unknown as AgentRegistry;

      // Read task definition
      const task = await this.readTask(taskId);

      // Determine target agent
      let targetAgentId: string;
      let targetAgent: RegisteredAgentInfo;

      if (agentId) {
        // Manual assignment
        const foundAgent = registry.getRegisteredAgent(agentId);
        if (!foundAgent) {
          throw new Error(`Agent not found: ${agentId}`);
        }
        targetAgent = foundAgent;
        targetAgentId = agentId;

        // Validate capability if required
        if (requireCapability) {
          this.validateCapability(targetAgent, requireCapability);
        }

      } else if (autoBalance) {
        // Auto-assignment with load balancing
        const selected = await this.selectBestAgent(
          registry,
          taskType || task.type,
          requireCapability
        );
        targetAgentId = selected.id;
        targetAgent = selected.agent;

      } else {
        throw new Error('Either agentId or autoBalance must be provided');
      }

      // Check agent availability
      const availability = await this.checkAgentAvailability(targetAgent);

      let result: AssignResult;

      if (availability.available) {
        // Assign immediately
        result = await this.assignToAgent(
          targetAgentId,
          targetAgent,
          taskId,
          task,
          priority,
          timeout
        );

      } else {
        // Queue for later execution
        result = await this.queueTask(
          targetAgentId,
          targetAgent,
          taskId,
          task,
          priority
        );
      }

      // Save assignment record
      await this.saveAssignment(result);

      logger.info(`Task assigned: ${taskId} -> ${targetAgentId}`, {
        status: result.status,
        queuePosition: result.queuePosition
      });

      return result;

    } catch (error) {
      logger.error(`Failed to assign task ${taskId}:`, error);
      throw new Error(`Task assignment failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Read task definition
   */
  private static async readTask(taskId: string): Promise<TaskDefinition> {
    const taskPath = path.join(this.TASKS_DIR, `${taskId}.json`);

    if (!await fs.pathExists(taskPath)) {
      throw new Error(`Task not found: ${taskId}`);
    }

    return await fs.readJson(taskPath) as TaskDefinition;
  }

  /**
   * Validate agent capability
   */
  private static validateCapability(agent: RegisteredAgentInfo, capability: string): void {
    const capabilities = agent.agent?.config?.capabilities?.map((c: AgentCapability) => c.name) || [];

    if (!capabilities.includes(capability)) {
      throw new Error(`Agent lacks required capability: ${capability}`);
    }
  }

  /**
   * Select best agent using load balancing algorithm
   */
  private static async selectBestAgent(
    registry: AgentRegistry,
    taskType: string,
    requireCapability?: string
  ): Promise<{ id: string; agent: RegisteredAgentInfo }> {
    const allAgents = registry.getAllAgents();

    if (allAgents.length === 0) {
      throw new Error('No agents available');
    }

    // Filter by capability if required
    let candidates = allAgents;
    if (requireCapability) {
      candidates = allAgents.filter((agent: RegisteredAgentInfo) => {
        const capabilities = agent.agent?.config?.capabilities?.map((c: AgentCapability) => c.name) || [];
        return capabilities.includes(requireCapability);
      });

      if (candidates.length === 0) {
        throw new Error(`No agents with required capability: ${requireCapability}`);
      }
    }

    // Score agents based on load, status, and performance
    const scores = candidates.map((agent: RegisteredAgentInfo) => {
      let score = 100;

      // Penalize by current load
      score -= agent.tasksCompleted * 0.1;

      // Penalize busy agents
      if (agent.status === 'busy') {
        score -= 50;
      }

      // Penalize error agents
      if (agent.status === 'error') {
        score -= 80;
      }

      // Bonus for idle agents
      if (agent.status === 'idle') {
        score += 20;
      }

      // Bonus for low execution time
      const avgTime = agent.tasksCompleted > 0
        ? agent.totalExecutionTime / agent.tasksCompleted
        : 0;
      score += Math.max(0, 20 - (avgTime / 1000));

      return { agent, score };
    });

    // Sort by score descending
    scores.sort((a, b) => b.score - a.score);

    const selected = scores[0].agent;

    logger.debug('Agent selected by load balancing:', {
      agentId: selected.id,
      score: scores[0].score,
      status: selected.status
    });

    return { id: selected.id, agent: selected };
  }

  /**
   * Check agent availability
   */
  private static async checkAgentAvailability(agent: RegisteredAgentInfo): Promise<{ available: boolean; reason?: string }> {
    if (agent.status === 'error') {
      return { available: false, reason: 'Agent in error state' };
    }

    if (agent.status === 'terminated') {
      return { available: false, reason: 'Agent terminated' };
    }

    if (agent.status === 'busy') {
      // Check queue size
      const queueSize = await this.getAgentQueueSize(agent.id);
      if (queueSize >= 10) {
        return { available: false, reason: 'Queue full' };
      }
    }

    return { available: true };
  }

  /**
   * Get agent queue size
   */
  private static async getAgentQueueSize(agentId: string): Promise<number> {
    const queuePath = path.join(this.QUEUE_DIR, `${agentId}.json`);

    if (!await fs.pathExists(queuePath)) {
      return 0;
    }

    const queue = await fs.readJson(queuePath);
    return queue.tasks?.length || 0;
  }

  /**
   * Assign task to agent immediately
   */
  private static async assignToAgent(
    agentId: string,
    agent: RegisteredAgentInfo,
    taskId: string,
    _task: TaskDefinition,
    _priority: string,
    _timeout: number
  ): Promise<AssignResult> {
    // Update agent config with assigned task
    const configPath = path.join(this.AGENT_DIR, `${agentId}.json`);
    const config = await fs.readJson(configPath) as { assignedTasks?: string[] };

    config.assignedTasks = config.assignedTasks || [];
    config.assignedTasks.push(taskId);

    await fs.writeJson(configPath, config, { spaces: 2 });

    // Estimate completion time
    const avgTime = agent.tasksCompleted > 0
      ? agent.totalExecutionTime / agent.tasksCompleted
      : 30000;
    const estimatedCompletion = new Date(Date.now() + avgTime);

    return {
      taskId,
      agentId,
      agentType: agent.mcpType,
      status: 'assigned',
      assignedAt: new Date(),
      estimatedCompletion,
      capabilities: agent.agent?.config?.capabilities?.map((c: AgentCapability) => c.name) || []
    };
  }

  /**
   * Queue task for later execution
   */
  private static async queueTask(
    agentId: string,
    agent: RegisteredAgentInfo,
    taskId: string,
    task: TaskDefinition,
    priority: string
  ): Promise<AssignResult> {
    const queuePath = path.join(this.QUEUE_DIR, `${agentId}.json`);

    await fs.ensureDir(this.QUEUE_DIR);

    let queue: TaskQueue = { tasks: [] };
    if (await fs.pathExists(queuePath)) {
      queue = await fs.readJson(queuePath) as TaskQueue;
    }

    // Add to queue with priority
    const queueEntry: QueueEntry = {
      taskId,
      task,
      priority,
      queuedAt: new Date().toISOString()
    };

    queue.tasks = queue.tasks || [];
    queue.tasks.push(queueEntry);

    // Sort by priority
    const priorityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
    queue.tasks.sort((a: QueueEntry, b: QueueEntry) =>
      priorityOrder[a.priority as keyof typeof priorityOrder] -
      priorityOrder[b.priority as keyof typeof priorityOrder]
    );

    await fs.writeJson(queuePath, queue, { spaces: 2 });

    const queuePosition = queue.tasks.findIndex((t: QueueEntry) => t.taskId === taskId);

    return {
      taskId,
      agentId,
      agentType: agent.mcpType,
      status: 'queued',
      assignedAt: new Date(),
      queuePosition,
      capabilities: agent.agent?.config?.capabilities?.map((c: AgentCapability) => c.name) || []
    };
  }

  /**
   * Save assignment record
   */
  private static async saveAssignment(result: AssignResult): Promise<void> {
    const assignmentPath = path.join(this.TASKS_DIR, `${result.taskId}.assignment.json`);
    await fs.writeJson(assignmentPath, result, { spaces: 2 });
  }
}
