/**
 * Agent Inspect Command
 *
 * Provides detailed inspection of agent configuration, state, metrics,
 * and history. Supports multiple output formats and filtering options.
 *
 * @module cli/commands/agent/inspect
 */

import * as fs from 'fs-extra';
import * as path from 'path';
import { getAgentRegistry } from '../../../mcp/services/AgentRegistry';
import { Logger } from '../../../utils/Logger';

const logger = Logger.getInstance();

export interface InspectOptions {
  agentId: string;
  includeHistory?: boolean;
  includeMetrics?: boolean;
  includeLogs?: boolean;
  format?: 'json' | 'yaml' | 'table' | 'detailed';
  depth?: 'shallow' | 'deep';
}

export interface InspectResult {
  id: string;
  type: string;
  mcpType: string;
  status: string;
  configuration: {
    name?: string;
    description?: string;
    capabilities: string[];
    resources?: any;
  };
  lifecycle: {
    spawnedAt: Date;
    lastActivity: Date;
    uptime: number;
    restartCount?: number;
    lastRestart?: string;
  };
  metrics?: {
    tasksCompleted: number;
    tasksActive: number;
    tasksFailed: number;
    averageExecutionTime: number;
    totalExecutionTime: number;
    successRate: number;
  };
  history?: Array<{
    timestamp: Date;
    event: string;
    details: any;
  }>;
  logs?: string[];
  health: {
    status: 'healthy' | 'degraded' | 'unhealthy';
    issues: string[];
    lastCheck: Date;
  };
}

/**
 * Agent Inspect Command Implementation
 */
export class AgentInspectCommand {
  private static readonly AGENT_DIR = path.join(process.cwd(), '.aqe', 'agents');
  private static readonly LOGS_DIR = path.join(process.cwd(), '.aqe', 'logs');
  private static readonly HISTORY_DIR = path.join(process.cwd(), '.aqe', 'history');

  /**
   * Execute agent inspection
   *
   * @param options - Inspect options
   * @returns Detailed agent information
   */
  static async execute(options: InspectOptions): Promise<InspectResult> {
    const {
      agentId,
      includeHistory = false,
      includeMetrics = true,
      includeLogs = false,
      format = 'json',
      depth = 'deep'
    } = options;

    logger.info(`Inspecting agent: ${agentId}`, { includeHistory, includeMetrics, includeLogs });

    try {
      // Get agent registry
      const registry = getAgentRegistry();

      // Get registered agent
      const registeredAgent = registry.getRegisteredAgent(agentId);
      if (!registeredAgent) {
        throw new Error(`Agent not found: ${agentId}`);
      }

      // Read agent configuration
      const configPath = path.join(this.AGENT_DIR, `${agentId}.json`);
      const config = await this.readAgentConfig(configPath);

      // Build base result
      const result: InspectResult = {
        id: registeredAgent.id,
        type: registeredAgent.type,
        mcpType: registeredAgent.mcpType,
        status: registeredAgent.status,
        configuration: {
          name: config.name,
          description: config.description,
          capabilities: config.capabilities || [],
          resources: config.resources
        },
        lifecycle: {
          spawnedAt: registeredAgent.spawnedAt,
          lastActivity: registeredAgent.lastActivity,
          uptime: Date.now() - registeredAgent.spawnedAt.getTime(),
          restartCount: config.restartCount,
          lastRestart: config.lastRestart
        },
        health: await this.checkHealth(registeredAgent)
      };

      // Add metrics if requested
      if (includeMetrics) {
        result.metrics = await this.getMetrics(agentId, registeredAgent);
      }

      // Add history if requested
      if (includeHistory) {
        result.history = await this.getHistory(agentId);
      }

      // Add logs if requested
      if (includeLogs) {
        result.logs = await this.getLogs(agentId, 50);
      }

      // Format output
      return this.formatOutput(result, format);

    } catch (error) {
      logger.error(`Failed to inspect agent ${agentId}:`, error);
      throw new Error(`Agent inspection failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Read agent configuration
   */
  private static async readAgentConfig(configPath: string): Promise<any> {
    if (!await fs.pathExists(configPath)) {
      return {};
    }
    return await fs.readJson(configPath);
  }

  /**
   * Get agent metrics
   */
  private static async getMetrics(agentId: string, agent: any): Promise<any> {
    const registry = getAgentRegistry();
    const registryMetrics = registry.getAgentMetrics(agentId);

    // Calculate additional metrics
    const tasksFailed = await this.countFailedTasks(agentId);
    const tasksActive = agent.status === 'busy' ? 1 : 0;
    const tasksCompleted = agent.tasksCompleted;
    const successRate = tasksCompleted > 0
      ? (tasksCompleted - tasksFailed) / tasksCompleted
      : 1.0;

    return {
      tasksCompleted,
      tasksActive,
      tasksFailed,
      averageExecutionTime: registryMetrics?.averageExecutionTime || 0,
      totalExecutionTime: agent.totalExecutionTime,
      successRate
    };
  }

  /**
   * Count failed tasks
   */
  private static async countFailedTasks(agentId: string): Promise<number> {
    const historyPath = path.join(this.HISTORY_DIR, `${agentId}.json`);

    if (!await fs.pathExists(historyPath)) {
      return 0;
    }

    const history = await fs.readJson(historyPath);
    return history.events?.filter((e: any) => e.event === 'task_failed').length || 0;
  }

  /**
   * Get agent history
   */
  private static async getHistory(agentId: string): Promise<Array<any>> {
    const historyPath = path.join(this.HISTORY_DIR, `${agentId}.json`);

    if (!await fs.pathExists(historyPath)) {
      return [];
    }

    const history = await fs.readJson(historyPath);
    return (history.events || []).map((event: any) => ({
      timestamp: new Date(event.timestamp),
      event: event.event,
      details: event.details
    }));
  }

  /**
   * Get agent logs
   */
  private static async getLogs(agentId: string, lines: number): Promise<string[]> {
    const logPath = path.join(this.LOGS_DIR, `${agentId}.log`);

    if (!await fs.pathExists(logPath)) {
      return [];
    }

    const logContent = await fs.readFile(logPath, 'utf-8');
    const allLines = logContent.split('\n').filter(line => line.trim());

    // Return last N lines
    return allLines.slice(-lines);
  }

  /**
   * Check agent health
   */
  private static async checkHealth(agent: any): Promise<any> {
    const issues: string[] = [];
    let status: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';

    // Check agent status
    if (agent.status === 'error') {
      issues.push('Agent in error state');
      status = 'unhealthy';
    }

    // Check last activity
    const inactiveDuration = Date.now() - new Date(agent.lastActivity).getTime();
    if (inactiveDuration > 3600000) { // 1 hour
      issues.push('No activity for over 1 hour');
      status = status === 'healthy' ? 'degraded' : status;
    }

    // Check task completion rate
    if (agent.tasksCompleted === 0 && Date.now() - new Date(agent.spawnedAt).getTime() > 600000) {
      issues.push('No tasks completed after 10 minutes');
      status = status === 'healthy' ? 'degraded' : status;
    }

    return {
      status,
      issues,
      lastCheck: new Date()
    };
  }

  /**
   * Format output
   */
  private static formatOutput(result: InspectResult, format: string): any {
    switch (format) {
      case 'json':
        return result;

      case 'table':
        // Return formatted table string
        return this.formatAsTable(result);

      case 'yaml':
        // Return YAML formatted string
        return this.formatAsYAML(result);

      case 'detailed':
        // Return detailed formatted string
        return this.formatDetailed(result);

      default:
        return result;
    }
  }

  /**
   * Format as table
   */
  private static formatAsTable(result: InspectResult): string {
    const lines: string[] = [];

    lines.push('╔══════════════════════════════════════════════════════════════╗');
    lines.push(`║ Agent: ${result.id.padEnd(54)} ║`);
    lines.push('╠══════════════════════════════════════════════════════════════╣');
    lines.push(`║ Type: ${result.mcpType.padEnd(55)} ║`);
    lines.push(`║ Status: ${result.status.padEnd(53)} ║`);
    lines.push(`║ Health: ${result.health.status.padEnd(53)} ║`);

    if (result.metrics) {
      lines.push('╠══════════════════════════════════════════════════════════════╣');
      lines.push(`║ Tasks Completed: ${String(result.metrics.tasksCompleted).padEnd(44)} ║`);
      lines.push(`║ Success Rate: ${(result.metrics.successRate * 100).toFixed(2)}%`.padEnd(63) + '║');
    }

    lines.push('╚══════════════════════════════════════════════════════════════╝');

    return lines.join('\n');
  }

  /**
   * Format as YAML
   */
  private static formatAsYAML(result: InspectResult): string {
    // Simple YAML formatting
    const yaml: string[] = [];
    yaml.push(`id: ${result.id}`);
    yaml.push(`type: ${result.type}`);
    yaml.push(`mcpType: ${result.mcpType}`);
    yaml.push(`status: ${result.status}`);
    yaml.push('configuration:');
    yaml.push(`  capabilities: [${result.configuration.capabilities.join(', ')}]`);

    if (result.metrics) {
      yaml.push('metrics:');
      yaml.push(`  tasksCompleted: ${result.metrics.tasksCompleted}`);
      yaml.push(`  successRate: ${result.metrics.successRate}`);
    }

    return yaml.join('\n');
  }

  /**
   * Format detailed
   */
  private static formatDetailed(result: InspectResult): string {
    return JSON.stringify(result, null, 2);
  }
}
