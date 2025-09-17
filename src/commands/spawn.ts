import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import inquirer from 'inquirer';
import { SpawnConfig, OperationResult } from '../types/agent';
import { logger } from '../utils/Logger';
import { agentRegistry } from '../agents/agent-registry';
import { createAgentSpawner } from '../agents/agent-spawner';
import * as uuid from 'uuid';

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
  list_agents?: boolean;
  reload_registry?: boolean;
}

export class SpawnCommand {
  private agentSpawner = createAgentSpawner(agentRegistry);

  async execute(options: SpawnOptions): Promise<OperationResult> {
    const spinner = ora('Preparing to spawn agents').start();

    try {
      // Handle registry reload if requested
      if (options.reload_registry) {
        spinner.text = 'Reloading agent registry...';
        await agentRegistry.scanAndLoadAgents();
      }

      // Handle list agents command
      if (options.list_agents) {
        spinner.stop();
        return this.listAgents();
      }

      // Initialize registry if needed
      if (agentRegistry.getAllAgents().length === 0) {
        spinner.text = 'Initializing agent registry...';
        await agentRegistry.initialize();
      }

      const availableAgents = agentRegistry.getAllAgents();

      if (availableAgents.length === 0) {
        spinner.fail('No agents available');
        return {
          success: false,
          message: 'No agents found. Check your agents directory or run with --reload-registry.',
        };
      }

      // Determine which agents to spawn
      let agentsToSpawn: string[] = [];

      if (options.interactive) {
        spinner.stop();
        agentsToSpawn = await this.interactiveAgentSelection(availableAgents.map(a => a.agent.name));
        spinner.start();
      } else if (options.agents && options.agents.length > 0) {
        agentsToSpawn = options.agents;
      } else if (options.agent) {
        agentsToSpawn = [options.agent];
      } else {
        spinner.fail('No agents specified');
        return {
          success: false,
          message: 'No agents specified. Use --agent, --agents, or --interactive.',
        };
      }

      // Validate agents exist using registry
      const invalidAgents = agentsToSpawn.filter(name => !agentRegistry.hasAgent(name));

      if (invalidAgents.length > 0) {
        spinner.fail('Invalid agents specified');

        // Suggest similar agents
        const suggestions = this.suggestSimilarAgents(invalidAgents, availableAgents.map(a => a.agent.name));

        return {
          success: false,
          message: `Unknown agents: ${invalidAgents.join(', ')}`,
          errors: invalidAgents.map(name => `Agent "${name}" not found`),
          warnings: suggestions.length > 0 ? [`Did you mean: ${suggestions.join(', ')}?`] : undefined,
        };
      }

      // Get task if not provided
      let task = options.task;
      if (!task && options.interactive) {
        spinner.stop();
        const { taskInput } = await inquirer.prompt([{
          type: 'input',
          name: 'taskInput',
          message: 'Enter task description:',
          validate: (input) => input.trim().length > 0 || 'Task description is required',
        }]);
        task = taskInput;
        spinner.start();
      }

      if (!task) {
        spinner.fail('No task specified');
        return {
          success: false,
          message: 'Task description is required. Use --task or --interactive.',
        };
      }

      // Create spawn configuration
      const spawnConfig: SpawnConfig = {
        agents: agentsToSpawn,
        parallel: options.parallel ?? true,
        coordination: options.coordination ?? true,
        memory_namespace: options.memory_namespace || 'qe-agents',
        swarm_id: options.swarm_id || `swarm-${uuid.v4().slice(0, 8)}`,
        hooks: {
          pre_task: !options.no_hooks,
          post_task: !options.no_hooks,
          session_restore: options.coordination ?? true,
        },
      };

      spinner.text = `Spawning ${agentsToSpawn.length} agents`;

      // Execute spawn using the new agent spawner
      const result = await this.agentSpawner.spawnAgents(task, spawnConfig, options);

      if (result.success) {
        spinner.succeed(`Successfully spawned ${agentsToSpawn.length} agents`);
      } else {
        spinner.fail('Agent spawning failed');
      }

      return result;
    } catch (error) {
      spinner.fail('Failed to spawn agents');
      logger.error('Spawn command failed:', error);

      return {
        success: false,
        message: `Spawn failed: ${error instanceof Error ? error.message : String(error)}`,
        errors: [error instanceof Error ? error.message : String(error)],
      };
    }
  }

  private async interactiveAgentSelection(availableAgents: string[]): Promise<string[]> {
    const agentChoices = availableAgents.map(name => {
      const agent = agentRegistry.getAgent(name);
      return {
        name: `${name} (${agent?.agent.category || 'unknown'}) - ${agent?.agent.description || 'No description'}`,
        value: name,
        short: name
      };
    });

    const { selectedAgents } = await inquirer.prompt([{
      type: 'checkbox',
      name: 'selectedAgents',
      message: 'Select agents to spawn:',
      choices: agentChoices,
      validate: (choices) => choices.length > 0 || 'Select at least one agent',
      pageSize: 15
    }]);

    return selectedAgents;
  }

  /**
   * List available agents with details
   */
  private listAgents(): OperationResult {
    const agents = agentRegistry.getAllAgents();
    const stats = agentRegistry.getStatistics();

    const agentList = agents.map(entry => ({
      name: entry.agent.name,
      category: entry.agent.category,
      description: entry.agent.description,
      capabilities: entry.agent.capabilities?.length || 0,
      pactLevel: entry.agent.pactLevel,
      registered: entry.isRegistered,
      lastModified: entry.lastModified.toISOString(),
    }));

    return {
      success: true,
      message: `Found ${agents.length} agents`,
      data: {
        agents: agentList,
        statistics: stats,
        categories: agentRegistry.getCategories(),
        capabilities: [],
        tags: [],
      },
    };
  }

  /**
   * Suggest similar agent names using basic string similarity
   */
  private suggestSimilarAgents(invalidAgents: string[], availableAgents: string[]): string[] {
    const suggestions: string[] = [];

    invalidAgents.forEach(invalid => {
      const similar = availableAgents.filter(available => {
        // Simple similarity: check if one contains the other or similar length
        const invalidLower = invalid.toLowerCase();
        const availableLower = available.toLowerCase();
        return (
          availableLower.includes(invalidLower) ||
          invalidLower.includes(availableLower) ||
          this.levenshteinDistance(invalidLower, availableLower) <= 2
        );
      });

      suggestions.push(...similar.slice(0, 3)); // Limit suggestions
    });

    return [...new Set(suggestions)]; // Remove duplicates
  }

  /**
   * Calculate Levenshtein distance for string similarity
   */
  private levenshteinDistance(str1: string, str2: string): number {
    const matrix = [];

    if (str2.length === 0) return str1.length;
    if (str1.length === 0) return str2.length;

    for (let i = 0; i <= str2.length; i++) {
      matrix[i] = [i];
    }

    for (let j = 0; j <= str1.length; j++) {
      matrix[0][j] = j;
    }

    for (let i = 1; i <= str2.length; i++) {
      for (let j = 1; j <= str1.length; j++) {
        if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
          matrix[i][j] = matrix[i - 1][j - 1];
        } else {
          matrix[i][j] = Math.min(
            matrix[i - 1][j - 1] + 1,
            matrix[i][j - 1] + 1,
            matrix[i - 1][j] + 1
          );
        }
      }
    }

    return matrix[str2.length][str1.length];
  }

  static register(program: Command): void {
    program
      .command('spawn')
      .description('Spawn QE agents to execute tasks')
      .option('-a, --agent <name>', 'Single agent to spawn')
      .option('--agents <names...>', 'Multiple agents to spawn')
      .option('-t, --task <description>', 'Task description')
      .option('-p, --parallel', 'Execute agents in parallel', true)
      .option('--no-parallel', 'Execute agents sequentially')
      .option('-c, --coordination', 'Enable Claude-Flow coordination', true)
      .option('--no-coordination', 'Disable coordination')
      .option('--memory-namespace <namespace>', 'Memory namespace for coordination')
      .option('--swarm-id <id>', 'Custom swarm identifier')
      .option('-i, --interactive', 'Interactive agent and task selection')
      .option('--no-hooks', 'Disable coordination hooks')
      .option('--timeout <seconds>', 'Agent execution timeout', parseInt)
      .option('--priority <level>', 'Task priority (low|medium|high|critical)')
      .option('--force-claude-task', 'Force Claude Code task execution')
      .option('--force-claude-flow', 'Force Claude-Flow orchestration')
      .option('--force-direct', 'Force direct agent execution')
      .option('--dry-run', 'Show what would be done without executing')
      .option('--auto-register', 'Auto-register agents for Claude execution')
      .option('--list-agents', 'List all available agents')
      .option('--reload-registry', 'Reload agent registry from files')
      .action(async (options: SpawnOptions) => {
        const command = new SpawnCommand();
        const result = await command.execute(options);

        if (result.success) {
          console.log(chalk.green('✅'), result.message);

          if (options.list_agents && result.data) {
            // Display agents in a table format
            console.log(chalk.blue('\n📋 Available Agents:'));
            console.table(result.data.agents);

            console.log(chalk.blue('\n📊 Statistics:'));
            console.log(`  Total: ${result.data.statistics.total}`);
            console.log(`  Registered: ${result.data.statistics.registered}`);
            console.log(`  Categories: ${Object.keys(result.data.statistics.byCategory).join(', ')}`);
            console.log(`  Last Scan: ${result.data.statistics.lastScanTime || 'Never'}`);
          } else if (result.data) {
            console.log(chalk.blue('📊 Spawn Results:'));
            console.log(`  Project: ${chalk.cyan(process.cwd())}`);
            console.log(`  Swarm ID: ${result.data.swarm_id}`);
            console.log(`  Agents: ${result.data.spawned}/${result.data.total}`);
            console.log(`  Mode: ${result.data.parallel ? 'Parallel' : 'Sequential'}`);
            console.log(`  Coordination: ${result.data.coordination ? 'Enabled' : 'Disabled'}`);

            if (result.data.execution_summary) {
              console.log(chalk.blue('\n⚡ Execution Summary:'));
              console.log(`  Success Rate: ${(result.data.execution_summary.successRate * 100).toFixed(1)}%`);
              console.log(`  Average Duration: ${result.data.execution_summary.averageDuration.toFixed(0)}ms`);
              console.log(`  Methods Used: ${Object.keys(result.data.execution_summary.methodCounts).join(', ')}`);
            }

            // Show where reports are saved
            if (result.data.results && result.data.results.length > 0) {
              console.log(chalk.blue('\n📁 Reports Saved:'));
              result.data.results.forEach((r: any) => {
                if (r.reportPath) {
                  console.log(`  ${r.agentName}: ${chalk.cyan(r.reportPath)}`);
                }
              });
              console.log(chalk.yellow('\n👁  View reports in the reports/agents/ directory'));
            }
          }
        } else {
          console.error(chalk.red('❌'), result.message);
          if (result.errors) {
            result.errors.forEach(error => console.error(chalk.red('  •'), error));
          }
          if (result.warnings) {
            result.warnings.forEach(warning => console.warn(chalk.yellow('  ⚠'), warning));
          }
          process.exit(1);
        }
      });
  }
}