import { exec } from 'child_process';
import { promisify } from 'util';
import * as uuid from 'uuid';
import * as fs from 'fs-extra';
import * as path from 'path';
import * as yaml from 'yaml';
import { format } from 'date-fns';
import { glob } from 'glob';
import { AgentRegistry } from './agent-registry';
import { AgentRegistryEntry, SpawnConfig, OperationResult, ClaudeAgentConfig, ClaudeCommandConfig } from '../types/agent';
import { Logger } from '../utils/Logger';
import { ClaudeCodeProvider } from '../providers/claude-code-provider';
import { AnthropicAPIProvider } from '../providers/anthropic-api-provider';
import { BaseAIProvider } from '../providers/base-provider';

const execAsync = promisify(exec);
const logger = new Logger('agent-spawner');

export interface SpawnOptions {
  agent?: string;
  task?: string;
  parallel?: boolean;
  coordination?: boolean;
  memory_namespace?: string;
  swarm_id?: string;
  interactive?: boolean;
  agents?: string[];
  no_hooks?: boolean;
  timeout?: number;
  priority?: 'low' | 'medium' | 'high' | 'critical';
  force_claude_task?: boolean;
  force_claude_flow?: boolean;
  force_direct?: boolean;
  dry_run?: boolean;
  auto_register?: boolean;
}

export interface SpawnResult {
  taskId: string;
  agentName: string;
  status: 'completed' | 'failed' | 'timeout';
  method: 'claude-task' | 'claude-flow' | 'direct' | 'registered-claude';
  result?: any;
  error?: string;
  timestamp: string;
  duration?: number;
  output?: string;
  reportPath?: string;
  logPath?: string;
}

export interface AgentExecutionStrategy {
  name: string;
  priority: number;
  canExecute: (agent: AgentRegistryEntry) => Promise<boolean>;
  execute: (agent: AgentRegistryEntry, task: string, config: SpawnConfig, options: SpawnOptions) => Promise<any>;
}

/**
 * Agent Spawner - Advanced agent execution and management system
 *
 * Provides multiple execution strategies:
 * 1. Claude Code Task tool execution
 * 2. Claude-Flow orchestration
 * 3. Direct agent execution
 * 4. Registered Claude agent execution
 */
export class AgentSpawner {
  private registry: AgentRegistry;
  private executionStrategies: AgentExecutionStrategy[] = [];
  private reportsDir = 'reports';
  private logsDir = 'logs';
  private claudeCodeProvider: ClaudeCodeProvider;
  private anthropicProvider: AnthropicAPIProvider;

  constructor(registry: AgentRegistry) {
    this.registry = registry;
    this.claudeCodeProvider = new ClaudeCodeProvider();
    this.anthropicProvider = new AnthropicAPIProvider();
    this.initializeExecutionStrategies();
  }

  /**
   * Initialize execution strategies in priority order
   */
  private initializeExecutionStrategies(): void {
    this.executionStrategies = [
      {
        name: 'anthropic-api',
        priority: 1, // Highest priority - direct API access
        canExecute: this.canExecuteAnthropicAPI.bind(this),
        execute: this.executeAnthropicAPI.bind(this),
      },
      {
        name: 'registered-claude',
        priority: 2,
        canExecute: this.canExecuteRegisteredClaude.bind(this),
        execute: this.executeRegisteredClaude.bind(this),
      },
      {
        name: 'claude-task',
        priority: 3,
        canExecute: this.canExecuteClaudeTask.bind(this),
        execute: this.executeClaudeTask.bind(this),
      },
      {
        name: 'claude-flow',
        priority: 4, // Lower priority since it doesn't actually execute AI
        canExecute: this.canExecuteClaudeFlow.bind(this),
        execute: this.executeClaudeFlow.bind(this),
      },
      {
        name: 'direct',
        priority: 5,
        canExecute: this.canExecuteDirect.bind(this),
        execute: this.executeDirect.bind(this),
      },
    ];

    // Sort by priority
    this.executionStrategies.sort((a, b) => a.priority - b.priority);
  }

  /**
   * Spawn agents based on configuration
   */
  async spawnAgents(task: string, config: SpawnConfig, options: SpawnOptions): Promise<OperationResult> {
    logger.info(`Spawning ${config.agents.length} agents: ${config.agents.join(', ')}`);

    try {
      // Ensure output directories exist
      await this.ensureOutputDirectories();
      const results: SpawnResult[] = [];
      const errors: string[] = [];

      // Initialize Claude-Flow coordination if enabled
      if (config.coordination && !options.dry_run) {
        await this.initializeCoordination(config);
      }

      // Auto-register agents if requested
      if (options.auto_register) {
        await this.autoRegisterAgents(config.agents);
      }

      // Validate agents exist
      const validationResult = this.validateAgents(config.agents);
      if (!validationResult.success) {
        return validationResult;
      }

      if (config.parallel) {
        // Spawn agents in parallel
        const spawnPromises = config.agents.map(async (agentName) => {
          try {
            const result = await this.spawnSingleAgent(agentName, task, config, options);
            results.push(result);
            return result;
          } catch (error) {
            const errorMsg = `Failed to spawn ${agentName}: ${error instanceof Error ? error.message : String(error)}`;
            errors.push(errorMsg);
            logger.error(errorMsg);

            const failedResult: SpawnResult = {
              taskId: `task-${agentName}-${Date.now()}`,
              agentName,
              status: 'failed',
              method: 'direct',
              error: errorMsg,
              timestamp: new Date().toISOString(),
            };
            results.push(failedResult);
            return failedResult;
          }
        });

        await Promise.all(spawnPromises);
      } else {
        // Spawn agents sequentially
        for (const agentName of config.agents) {
          try {
            const result = await this.spawnSingleAgent(agentName, task, config, options);
            results.push(result);
          } catch (error) {
            const errorMsg = `Failed to spawn ${agentName}: ${error instanceof Error ? error.message : String(error)}`;
            errors.push(errorMsg);
            logger.error(errorMsg);

            const failedResult: SpawnResult = {
              taskId: `task-${agentName}-${Date.now()}`,
              agentName,
              status: 'failed',
              method: 'direct',
              error: errorMsg,
              timestamp: new Date().toISOString(),
            };
            results.push(failedResult);
          }
        }
      }

      // Finalize coordination
      if (config.coordination && !options.dry_run) {
        await this.finalizeCoordination(config);
      }

      const successCount = results.filter(r => r.status === 'completed').length;
      const success = successCount > 0;

      return {
        success,
        message: success
          ? `Spawned ${successCount}/${config.agents.length} agents successfully`
          : 'All agent spawns failed',
        data: {
          swarm_id: config.swarm_id,
          spawned: successCount,
          total: config.agents.length,
          results,
          parallel: config.parallel,
          coordination: config.coordination,
          execution_summary: this.generateExecutionSummary(results),
        },
        errors: errors.length > 0 ? errors : undefined,
      };
    } catch (error) {
      logger.error('Agent spawning failed:', error);
      return {
        success: false,
        message: `Spawning failed: ${error instanceof Error ? error.message : String(error)}`,
        errors: [error instanceof Error ? error.message : String(error)],
      };
    }
  }

  /**
   * Spawn a single agent using the best available strategy
   */
  async spawnSingleAgent(
    agentName: string,
    task: string,
    config: SpawnConfig,
    options: SpawnOptions
  ): Promise<SpawnResult> {
    const startTime = Date.now();
    const taskId = `task-${agentName}-${startTime}`;

    logger.info(`Spawning agent: ${agentName} with task: ${task.substring(0, 100)}...`);

    try {
      const agent = this.registry.getAgent(agentName);
      if (!agent) {
        throw new Error(`Agent ${agentName} not found in registry`);
      }

      // Pre-task hook
      if (config.hooks.pre_task && !options.dry_run) {
        await this.executeHook('pre-task', {
          taskId,
          agentName,
          task,
          memoryNamespace: config.memory_namespace,
        });
      }

      let result: any;
      let method: string;

      if (options.dry_run) {
        result = {
          message: `Dry run: would spawn ${agentName}`,
          task: task,
          timestamp: new Date().toISOString(),
        };
        method = 'dry-run';
      } else {
        // Find and execute using best strategy
        const strategy = await this.selectExecutionStrategy(agent, options);
        method = strategy.name;
        result = await strategy.execute(agent, task, config, options);
      }

      // Post-task hook
      if (config.hooks.post_task && !options.dry_run) {
        await this.executeHook('post-task', {
          taskId,
          agentName,
          result,
          memoryNamespace: config.memory_namespace,
        });
      }

      const duration = Date.now() - startTime;

      // Capture and save output
      const { reportPath, logPath } = await this.captureAgentOutput(
        agent, taskId, task, result, null, duration, method
      );

      logger.info(`Agent ${agentName} completed successfully in ${duration}ms using ${method}`);

      return {
        taskId,
        agentName,
        status: 'completed',
        method: method as any,
        result,
        timestamp: new Date().toISOString(),
        duration,
        reportPath,
        logPath,
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      const errorMsg = error instanceof Error ? error.message : String(error);
      logger.error(`Agent ${agentName} failed after ${duration}ms:`, error);

      // Error hook
      if (config.hooks.post_task && !options.dry_run) {
        await this.executeHook('post-task', {
          taskId,
          agentName,
          error: errorMsg,
          memoryNamespace: config.memory_namespace,
        });
      }

      // Capture error output
      const { reportPath, logPath } = await this.captureAgentOutput(
        this.registry.getAgent(agentName)!, taskId, task, null, errorMsg, duration, 'direct'
      );

      return {
        taskId,
        agentName,
        status: 'failed',
        method: 'direct',
        error: errorMsg,
        timestamp: new Date().toISOString(),
        duration,
        reportPath,
        logPath,
      };
    }
  }

  /**
   * Select the best execution strategy for an agent
   */
  private async selectExecutionStrategy(agent: AgentRegistryEntry, options: SpawnOptions): Promise<AgentExecutionStrategy> {
    // Force specific strategy if requested
    if (options.force_claude_task) {
      return this.executionStrategies.find(s => s.name === 'claude-task')!;
    }
    if (options.force_claude_flow) {
      return this.executionStrategies.find(s => s.name === 'claude-flow')!;
    }
    if (options.force_direct) {
      return this.executionStrategies.find(s => s.name === 'direct')!;
    }

    // Find first strategy that can execute this agent
    for (const strategy of this.executionStrategies) {
      if (await strategy.canExecute(agent)) {
        logger.debug(`Selected execution strategy: ${strategy.name} for agent: ${agent.agent.name}`);
        return strategy;
      }
    }

    // No valid execution strategy found - fail with clear error
    const errorMsg = `No execution strategy available for agent ${agent.agent.name}. ` +
      `Available providers: Anthropic API, Claude Code, Claude-Flow, Registered Claude. ` +
      `Please ensure at least one AI provider is installed and configured. ` +
      `For Anthropic API, set the ANTHROPIC_API_KEY environment variable.`;

    logger.error(errorMsg);
    throw new Error(errorMsg);
  }

  /**
   * Execution Strategy: Anthropic API
   */
  private async canExecuteAnthropicAPI(agent: AgentRegistryEntry): Promise<boolean> {
    return await this.anthropicProvider.checkAvailability();
  }

  private async executeAnthropicAPI(
    agent: AgentRegistryEntry,
    task: string,
    config: SpawnConfig,
    options: SpawnOptions
  ): Promise<any> {
    logger.info(`Executing agent ${agent.agent.name} via Anthropic API`);

    try {
      const result = await this.anthropicProvider.execute(agent, task, {
        timeout: options.timeout ? options.timeout * 1000 : 120000,
        workingDirectory: process.cwd(),
        temperature: agent.agent.temperature,
        maxTokens: agent.agent.max_tokens,
        verbose: true,
      });

      if (!result.success) {
        throw new Error(result.error || 'Anthropic API execution failed');
      }

      return {
        method: 'anthropic-api',
        output: result.output,
        agent: agent.agent.name,
        task: task,
        model: agent.agent.model || 'claude-3-sonnet-20240229',
        metadata: result.metadata,
      };
    } catch (error) {
      logger.error(`Anthropic API execution failed for ${agent.agent.name}:`, error);
      throw error;
    }
  }

  /**
   * Execution Strategy: Registered Claude Agent
   */
  private async canExecuteRegisteredClaude(agent: AgentRegistryEntry): Promise<boolean> {
    return !!(agent.claudeAgentPath && await fs.pathExists(agent.claudeAgentPath));
  }

  private async executeRegisteredClaude(
    agent: AgentRegistryEntry,
    task: string,
    config: SpawnConfig,
    options: SpawnOptions
  ): Promise<any> {
    logger.info(`Executing registered Claude agent: ${agent.agent.name}`);

    try {
      const { stdout, stderr } = await execAsync(
        `claude agent run ${agent.agent.name} "${task}"`,
        {
          timeout: (options.timeout || 300) * 1000,
          encoding: 'utf8'
        }
      );

      if (stderr) {
        logger.warn(`Claude agent ${agent.agent.name} stderr:`, stderr);
      }

      return {
        method: 'registered-claude',
        output: stdout,
        stderr: stderr || undefined,
      };
    } catch (error) {
      logger.error(`Registered Claude agent execution failed for ${agent.agent.name}:`, error);
      throw error;
    }
  }

  /**
   * Execution Strategy: Claude Code Task Tool
   */
  private async canExecuteClaudeTask(agent: AgentRegistryEntry): Promise<boolean> {
    try {
      // Check if Claude CLI is available and working
      const { stdout } = await execAsync('claude --help', { timeout: 5000 });
      // Verify it's the real Claude CLI
      const isClaudeCLI = stdout.includes('Claude Code') || stdout.includes('[prompt]');
      if (!isClaudeCLI) {
        logger.debug('Claude command found but not the expected Claude CLI');
        return false;
      }

      // Try a simple test to see if it's working without config issues
      try {
        await execAsync('echo "test" | claude --print "Say test" 2>&1', { timeout: 5000 });
        return true;
      } catch (testError) {
        // CLI exists but has configuration issues
        logger.warn('Claude CLI found but has configuration issues:', testError);
        return false;
      }
    } catch {
      return false;
    }
  }

  private async executeClaudeTask(
    agent: AgentRegistryEntry,
    task: string,
    config: SpawnConfig,
    options: SpawnOptions
  ): Promise<any> {
    logger.info(`Executing Claude task for agent: ${agent.agent.name}`);

    try {
      // Use the Claude Code provider for real AI execution
      const result = await this.claudeCodeProvider.execute(agent, task, {
        timeout: options.timeout ? options.timeout * 1000 : 120000,
        workingDirectory: process.cwd(),
        enableTools: true,
        tools: ['Read', 'Grep', 'Glob', 'Bash'],
        verbose: true,
      });

      if (!result.success) {
        // Report the failure clearly - don't hide it
        const errorMsg = result.error || 'Unknown error';
        logger.error(`Claude Code execution failed: ${errorMsg}`);
        throw new Error(`Claude Code execution failed: ${errorMsg}`);
      }

      return {
        method: 'claude-task',
        output: result.output,
        agent: agent.agent.name,
        task: task,
        model: agent.agent.model,
        metadata: result.metadata,
      };
    } catch (error) {
      logger.error(`Claude task execution failed for ${agent.agent.name}:`, error);
      throw error;
    }
  }

  /**
   * Execution Strategy: Claude-Flow Orchestration
   */
  private async canExecuteClaudeFlow(agent: AgentRegistryEntry): Promise<boolean> {
    try {
      // Check if Claude-Flow is available
      const { stdout } = await execAsync('npx claude-flow@alpha --help', { timeout: 10000 });
      return stdout.includes('task');
    } catch {
      return false;
    }
  }

  private async executeClaudeFlow(
    agent: AgentRegistryEntry,
    task: string,
    config: SpawnConfig,
    options: SpawnOptions
  ): Promise<any> {
    logger.info(`Attempting Claude-Flow orchestration for agent: ${agent.agent.name}`);

    // Claude-flow doesn't actually execute AI agents - it's just a coordination tool
    // This is kept for backwards compatibility but will not provide real AI analysis
    const errorMsg = `Claude-Flow cannot execute AI agents directly. ` +
      `To get real AI analysis, please use one of these options:\n` +
      `1. Run agents from within Claude Code using the Task tool\n` +
      `2. Configure the MCP server (mcp-qe-agents) in Claude Code\n` +
      `3. Use a different AI provider like OpenAI or Gemini`;

    logger.info(errorMsg);
    throw new Error(errorMsg);
  }

  /**
   * Execution Strategy: Direct Agent Execution
   */
  private async canExecuteDirect(agent: AgentRegistryEntry): Promise<boolean> {
    // Direct execution is no longer a valid fallback
    // We must have a real AI provider available
    return false;
  }

  private async executeDirect(
    agent: AgentRegistryEntry,
    task: string,
    config: SpawnConfig,
    options: SpawnOptions
  ): Promise<any> {
    // Direct execution should fail with a clear error
    // We don't want to hide the fact that no AI provider is available
    const errorMsg = `No AI execution provider available for agent ${agent.agent.name}. ` +
      `Please ensure Claude Code, Claude-Flow, or another AI provider is properly installed and configured.`;

    logger.error(errorMsg);
    throw new Error(errorMsg);
  }

  /**
   * Auto-register agents to make them available for Claude execution
   */
  private async autoRegisterAgents(agentNames: string[]): Promise<void> {
    logger.info(`Auto-registering ${agentNames.length} agents`);

    for (const agentName of agentNames) {
      try {
        await this.registerAgentForClaude(agentName);
      } catch (error) {
        logger.warn(`Failed to auto-register agent ${agentName}:`, error);
      }
    }
  }

  /**
   * Register an agent for Claude Code execution
   */
  async registerAgentForClaude(agentName: string): Promise<void> {
    const agent = this.registry.getAgent(agentName);
    if (!agent) {
      throw new Error(`Agent ${agentName} not found in registry`);
    }

    // Create Claude agent configuration
    const claudeAgentConfig: ClaudeAgentConfig = {
      name: agent.agent.name,
      description: agent.agent.description,
      instructions: agent.agent.system_prompt || `You are ${agent.agent.name}, ${agent.agent.description}`,
      model: agent.agent.model,
      temperature: agent.agent.temperature,
      maxTokens: agent.agent.max_tokens,
      capabilities: agent.agent.capabilities,
    };

    // Create Claude command configuration
    const claudeCommandConfig: ClaudeCommandConfig = {
      name: `qe-${agent.agent.name}`,
      description: `Execute ${agent.agent.name} for quality engineering tasks`,
      usage: `qe-${agent.agent.name} "<task-description>"`,
      handler: agent.agent.name,
    };

    // Ensure directories exist
    await fs.ensureDir(path.dirname(agent.claudeAgentPath || ''));
    await fs.ensureDir(path.dirname(agent.claudeCommandPath || ''));

    // Write Claude agent file
    const agentPath = agent.claudeAgentPath || path.join(this.registry['claudeAgentsPath'], `${agent.agent.name}.yaml`);
    await fs.writeFile(agentPath, yaml.stringify(claudeAgentConfig), 'utf-8');
    agent.claudeAgentPath = agentPath;

    // Write Claude command file
    const commandPath = agent.claudeCommandPath || path.join(this.registry['claudeCommandsPath'], `${agent.agent.name}.yaml`);
    await fs.writeFile(commandPath, yaml.stringify(claudeCommandConfig), 'utf-8');
    agent.claudeCommandPath = commandPath;

    // Mark as registered
    this.registry.registerAgent(agentName);

    logger.info(`Registered agent ${agentName} for Claude execution`);
  }

  /**
   * Validate that all agents exist in the registry
   */
  private validateAgents(agentNames: string[]): OperationResult {
    const invalidAgents = agentNames.filter(name => !this.registry.hasAgent(name));

    if (invalidAgents.length > 0) {
      return {
        success: false,
        message: `Unknown agents: ${invalidAgents.join(', ')}`,
        errors: invalidAgents.map(name => `Agent "${name}" not found in registry`),
      };
    }

    return { success: true, message: 'All agents validated' };
  }

  /**
   * Initialize Claude-Flow coordination
   */
  private async initializeCoordination(config: SpawnConfig): Promise<void> {
    try {
      logger.info(`Initializing coordination for swarm ${config.swarm_id}`);

      // Initialize swarm if needed
      await execAsync(
        `npx claude-flow@alpha swarm init --topology mesh --max-agents ${config.agents.length} --id "${config.swarm_id}"`,
        { timeout: 30000 }
      );

      // Spawn coordination agents
      for (const agentName of config.agents) {
        await execAsync(
          `npx claude-flow@alpha agent spawn --type "${agentName}" --swarm-id "${config.swarm_id}"`,
          { timeout: 15000 }
        );
      }

      logger.info(`Initialized coordination for swarm ${config.swarm_id}`);
    } catch (error) {
      logger.warn('Coordination initialization failed:', error);
      // Don't fail the entire spawn if coordination fails
    }
  }

  /**
   * Finalize Claude-Flow coordination
   */
  private async finalizeCoordination(config: SpawnConfig): Promise<void> {
    try {
      // Session management
      if (config.hooks.session_restore) {
        await execAsync(
          `npx claude-flow@alpha hooks session-end --swarm-id "${config.swarm_id}" --export-metrics true`,
          { timeout: 15000 }
        );
      }

      logger.info(`Finalized coordination for swarm ${config.swarm_id}`);
    } catch (error) {
      logger.warn('Coordination finalization failed:', error);
    }
  }

  /**
   * Execute coordination hooks
   */
  private async executeHook(hookType: string, data: any): Promise<void> {
    try {
      const hookCommand = `npx claude-flow@alpha hooks ${hookType}`;
      const params = Object.entries(data)
        .map(([key, value]) => `--${key} "${value}"`)
        .join(' ');

      await execAsync(`${hookCommand} ${params}`, { timeout: 10000 });
      logger.debug(`Executed ${hookType} hook`);
    } catch (error) {
      logger.warn(`Hook ${hookType} failed:`, error);
      // Don't fail the task if hooks fail
    }
  }

  /**
   * Generate execution summary
   */
  private generateExecutionSummary(results: SpawnResult[]): any {
    const methodCounts: Record<string, number> = {};
    const statusCounts: Record<string, number> = {};
    const totalDuration = results.reduce((sum, r) => sum + (r.duration || 0), 0);

    results.forEach(result => {
      methodCounts[result.method] = (methodCounts[result.method] || 0) + 1;
      statusCounts[result.status] = (statusCounts[result.status] || 0) + 1;
    });

    return {
      methodCounts,
      statusCounts,
      totalDuration,
      averageDuration: totalDuration / results.length,
      successRate: (statusCounts.completed || 0) / results.length,
    };
  }

  /**
   * Ensure output directories exist
   */
  private async ensureOutputDirectories(): Promise<void> {
    await fs.ensureDir(this.reportsDir);
    await fs.ensureDir(this.logsDir);
    await fs.ensureDir(path.join(this.reportsDir, 'agents'));
    await fs.ensureDir(path.join(this.logsDir, 'executions'));
  }

  /**
   * Capture and save agent output
   */
  private async captureAgentOutput(
    agent: AgentRegistryEntry,
    taskId: string,
    task: string,
    result: any,
    error: string | null,
    duration: number,
    method: string
  ): Promise<{ reportPath: string; logPath: string }> {
    const timestamp = format(new Date(), 'yyyy-MM-dd-HHmmss');
    const agentName = agent.agent.name;
    const agentReportDir = path.join(this.reportsDir, 'agents', agentName);
    await fs.ensureDir(agentReportDir);

    // Use the actual result from the agent execution
    // Don't override with memory results that might be stale
    const finalOutput = result;

    // Create comprehensive report with project context
    const report = {
      taskId,
      agent: agentName,
      timestamp: new Date().toISOString(),
      duration: `${duration}ms`,
      task,
      status: error ? 'failed' : 'completed',
      method,
      output: finalOutput,
      error,
      project: {
        path: process.cwd(),
        name: path.basename(process.cwd()),
        absolutePath: path.resolve(process.cwd()),
      },
      metadata: {
        category: agent.agent.category,
        capabilities: agent.agent.capabilities,
        pactLevel: agent.agent.pactLevel,
        model: agent.agent.model,
      },
    };

    // Save report as JSON
    const jsonPath = path.join(agentReportDir, `${timestamp}-report.json`);
    await fs.writeJson(jsonPath, report, { spaces: 2 });

    // Save report as Markdown
    const markdownPath = path.join(agentReportDir, `${timestamp}-report.md`);
    await fs.writeFile(markdownPath, this.generateMarkdownReport(report));

    // Save execution log
    const logPath = path.join(this.logsDir, 'executions', `${timestamp}-${agentName}.log`);
    const logContent = this.formatLogContent(report, result);
    await fs.writeFile(logPath, logContent);

    // Display summary in console
    this.displayReportSummary(report, jsonPath);

    return { reportPath: jsonPath, logPath };
  }

  /**
   * Retrieve agent results from Claude-Flow memory
   */
  private async retrieveAgentResults(taskId: string, agentName: string): Promise<any> {
    try {
      // Try multiple memory keys
      const memoryKeys = [
        `swarm/${agentName}/results`,
        `qe-agents/${agentName}/output`,
        `task/${taskId}/result`,
      ];

      for (const key of memoryKeys) {
        try {
          const { stdout } = await execAsync(
            `npx claude-flow@alpha memory get --key "${key}"`,
            { timeout: 5000 }
          );

          if (stdout && stdout.trim()) {
            try {
              return JSON.parse(stdout);
            } catch {
              return stdout.trim();
            }
          }
        } catch {
          // Try next key
        }
      }
    } catch (error) {
      logger.debug(`Could not retrieve results from memory: ${error}`);
    }

    return null;
  }

  /**
   * Generate markdown report
   */
  private generateMarkdownReport(report: any): string {
    let markdown = `# Agent Execution Report\n\n`;
    markdown += `## Summary\n\n`;
    markdown += `- **Agent:** ${report.agent}\n`;
    markdown += `- **Task ID:** ${report.taskId}\n`;
    markdown += `- **Status:** ${report.status === 'completed' ? '✅ Completed' : '❌ Failed'}\n`;
    markdown += `- **Method:** ${report.method}\n`;
    markdown += `- **Duration:** ${report.duration}\n`;
    markdown += `- **Timestamp:** ${report.timestamp}\n\n`;

    markdown += `## Task\n\n`;
    markdown += `\`\`\`\n${report.task}\n\`\`\`\n\n`;

    markdown += `## Agent Details\n\n`;
    markdown += `- **Category:** ${report.metadata.category}\n`;
    markdown += `- **Model:** ${report.metadata.model || 'Default'}\n`;
    markdown += `- **PACT Level:** ${report.metadata.pactLevel || 'N/A'}\n`;
    if (report.metadata.capabilities && report.metadata.capabilities.length > 0) {
      markdown += `- **Capabilities:**\n`;
      report.metadata.capabilities.forEach((cap: string) => {
        markdown += `  - ${cap}\n`;
      });
    }
    markdown += `\n`;

    if (report.output) {
      markdown += `## Output\n\n`;
      if (typeof report.output === 'string') {
        markdown += `\`\`\`\n${report.output}\n\`\`\`\n\n`;
      } else if (report.output.output) {
        markdown += `\`\`\`\n${report.output.output}\n\`\`\`\n\n`;
      } else {
        markdown += `\`\`\`json\n${JSON.stringify(report.output, null, 2)}\n\`\`\`\n\n`;
      }
    }

    if (report.error) {
      markdown += `## Error\n\n`;
      markdown += `\`\`\`\n${report.error}\n\`\`\`\n\n`;
    }

    markdown += `---\n\n`;
    markdown += `*Generated by Agentic QE Framework v1.0.0*\n`;

    return markdown;
  }

  /**
   * Format log content
   */
  private formatLogContent(report: any, rawResult: any): string {
    let log = `=== Agent Execution Log ===\n`;
    log += `Timestamp: ${report.timestamp}\n`;
    log += `Agent: ${report.agent}\n`;
    log += `Task ID: ${report.taskId}\n`;
    log += `Status: ${report.status}\n`;
    log += `Method: ${report.method}\n`;
    log += `Duration: ${report.duration}\n`;
    log += `\n=== Task ===\n`;
    log += `${report.task}\n`;
    log += `\n=== Raw Output ===\n`;

    if (rawResult) {
      if (typeof rawResult === 'string') {
        log += rawResult;
      } else if (rawResult.output) {
        log += rawResult.output;
        if (rawResult.stderr) {
          log += `\n\n=== Stderr ===\n${rawResult.stderr}`;
        }
      } else {
        log += JSON.stringify(rawResult, null, 2);
      }
    }

    if (report.error) {
      log += `\n\n=== Error ===\n${report.error}`;
    }

    return log;
  }

  /**
   * Display report summary in console
   */
  private displayReportSummary(report: any, reportPath: string): void {
    console.log('');
    console.log('📊 Agent Report Summary');
    console.log('─'.repeat(60));
    console.log(`Agent: ${report.agent}`);
    console.log(`Status: ${report.status === 'completed' ? '✅ Completed' : '❌ Failed'}`);
    console.log(`Duration: ${report.duration}`);
    console.log(`Method: ${report.method}`);
    console.log(`Report: ${reportPath}`);

    if (report.output && typeof report.output === 'string') {
      const preview = report.output.substring(0, 150);
      console.log(`\nOutput Preview:`);
      console.log(preview + (report.output.length > 150 ? '...' : ''));
    }

    console.log('─'.repeat(60));
  }

  /**
   * Generate comprehensive prompt for Claude Code execution
   */
  private generateAgentPrompt(agent: AgentRegistryEntry, task: string): string {
    const systemPrompt = agent.agent.system_prompt || `You are ${agent.agent.name}, ${agent.agent.description}`;

    let prompt = `# ${agent.agent.name}\n\n`;
    prompt += `${systemPrompt}\n\n`;

    if (agent.agent.capabilities && agent.agent.capabilities.length > 0) {
      prompt += `## Capabilities\n`;
      agent.agent.capabilities.forEach(cap => {
        prompt += `- ${cap}\n`;
      });
      prompt += `\n`;
    }

    prompt += `## Task\n\n${task}\n\n`;

    prompt += `## Instructions\n\n`;
    prompt += `Please analyze the task and provide comprehensive insights based on your role as ${agent.agent.name}. `;
    prompt += `Focus on ${agent.agent.category} aspects and utilize your capabilities: ${(agent.agent.capabilities || []).join(', ')}. `;
    prompt += `Provide actionable recommendations, detailed analysis, and specific findings.\n\n`;

    prompt += `## Output Format\n\n`;
    prompt += `Please structure your response with:\n`;
    prompt += `- Executive Summary\n`;
    prompt += `- Detailed Analysis\n`;
    prompt += `- Findings and Observations\n`;
    prompt += `- Recommendations\n`;
    prompt += `- Next Steps\n\n`;

    return prompt;
  }

}

// Export singleton factory
export function createAgentSpawner(registry: AgentRegistry): AgentSpawner {
  return new AgentSpawner(registry);
}