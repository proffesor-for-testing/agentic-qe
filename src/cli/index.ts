#!/usr/bin/env node

/**
 * CLI - Command Line Interface for the Agentic QE Fleet
 *
 * Provides a comprehensive CLI for managing the fleet, agents, and tasks
 * with interactive commands and status monitoring.
 */

import { Command } from 'commander';
import chalk from 'chalk';
import inquirer from 'inquirer';
import { FleetManager } from '../core/FleetManager';
import { Task, TaskPriority } from '../core/Task';
import { Config } from '../utils/Config';
import { Logger } from '../utils/Logger';
import {
  listWorkflows,
  displayWorkflows,
  pauseWorkflow,
  displayPauseResult,
  cancelWorkflow,
  displayCancelResult
} from './commands/workflow/index.js';
import * as configCommands from './commands/config/index.js';
import * as debugCommands from './commands/debug/index.js';
import * as memoryCommands from './commands/memory/index.js';
import * as routingCommands from './commands/routing/index.js';

const program = new Command();
const logger = Logger.getInstance();

// Global fleet manager instance
let fleetManager: FleetManager | null = null;

program
  .name('agentic-qe')
  .description('Agentic Quality Engineering Fleet - Autonomous testing and quality assurance')
  .version('1.0.0');

/**
 * Initialize fleet
 */
program
  .command('init')
  .description('Initialize the AQE Fleet')
  .option('-c, --config <path>', 'Configuration file path')
  .action(async (options) => {
    try {
      console.log(chalk.blue('🚀 Initializing Agentic QE Fleet...'));

      const config = await Config.load(options.config);
      fleetManager = new FleetManager(config);

      await fleetManager.initialize();
      console.log(chalk.green('✅ Fleet initialized successfully'));

    } catch (error) {
      console.error(chalk.red('❌ Failed to initialize fleet:'), error);
      process.exit(1);
    }
  });

/**
 * Start fleet
 */
program
  .command('start')
  .description('Start the AQE Fleet')
  .option('-d, --daemon', 'Run as daemon')
  .action(async (options) => {
    try {
      if (!fleetManager) {
        console.log(chalk.yellow('Fleet not initialized. Initializing...'));
        const config = await Config.load();
        fleetManager = new FleetManager(config);
        await fleetManager.initialize();
      }

      console.log(chalk.blue('🚀 Starting AQE Fleet...'));
      await fleetManager.start();

      console.log(chalk.green('✅ Fleet started successfully'));

      if (!options.daemon) {
        // Interactive mode
        await runInteractiveMode();
      }

    } catch (error) {
      console.error(chalk.red('❌ Failed to start fleet:'), error);
      process.exit(1);
    }
  });

/**
 * Fleet status
 */
program
  .command('status')
  .description('Show fleet status')
  .option('-d, --detailed', 'Show detailed status')
  .action(async (options) => {
    try {
      if (!fleetManager) {
        console.log(chalk.yellow('Fleet not running'));
        return;
      }

      const status = fleetManager.getStatus();

      console.log(chalk.blue('\n📊 Fleet Status:'));
      console.log(`Fleet ID: ${status.id}`);
      console.log(`Status: ${getStatusColor(status.status)}`);
      console.log(`Active Agents: ${chalk.cyan(status.activeAgents)}/${chalk.cyan(status.totalAgents)}`);
      console.log(`Running Tasks: ${chalk.yellow(status.runningTasks)}`);
      console.log(`Completed Tasks: ${chalk.green(status.completedTasks)}`);
      console.log(`Failed Tasks: ${chalk.red(status.failedTasks)}`);
      console.log(`Uptime: ${chalk.magenta(formatUptime(status.uptime))}`);

    } catch (error) {
      console.error(chalk.red('❌ Failed to get status:'), error);
      process.exit(1);
    }
  });

/**
 * Interactive mode
 */
async function runInteractiveMode(): Promise<void> {
  console.log(chalk.green('\n🎮 Entering interactive mode. Press Ctrl+C to exit.\n'));

  while (true) {
    try {
      const { action } = await inquirer.prompt([
        {
          type: 'list',
          name: 'action',
          message: 'What would you like to do?',
          choices: [
            'Show fleet status',
            'List agents',
            'Submit task',
            'Spawn agent',
            'Exit'
          ]
        }
      ]);

      switch (action) {
        case 'Show fleet status':
          await showStatus();
          break;
        case 'Exit':
          console.log(chalk.blue('👋 Goodbye!'));
          await fleetManager?.stop();
          process.exit(0);
      }

    } catch (error) {
      console.error(chalk.red('Error in interactive mode:'), error);
      break;
    }
  }
}

async function showStatus(): Promise<void> {
  if (!fleetManager) return;

  const status = fleetManager.getStatus();
  console.log(chalk.blue('\n📊 Fleet Status:'));
  console.log(`Active Agents: ${chalk.cyan(status.activeAgents)}/${chalk.cyan(status.totalAgents)}`);
  console.log(`Tasks: ${chalk.yellow(status.runningTasks)} running, ${chalk.green(status.completedTasks)} completed`);
  console.log(`Uptime: ${chalk.magenta(formatUptime(status.uptime))}\n`);
}

function getStatusColor(status: string): string {
  const colors: Record<string, (text: string) => string> = {
    running: chalk.green,
    active: chalk.green,
    idle: chalk.yellow,
    busy: chalk.blue,
    completed: chalk.green,
    failed: chalk.red,
    error: chalk.red,
    stopped: chalk.gray
  };

  return (colors[status.toLowerCase()] || chalk.white)(status);
}

function formatUptime(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);

  if (hours > 0) return `${hours}h ${minutes % 60}m`;
  if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
  return `${seconds}s`;
}

/**
 * Workflow commands
 */
const workflowCommand = program
  .command('workflow')
  .description('Manage QE workflows');

workflowCommand
  .command('list')
  .description('List all workflows')
  .option('-s, --status <status>', 'Filter by status (running, paused, completed, failed, cancelled)')
  .option('-n, --name <pattern>', 'Filter by name pattern')
  .option('-l, --limit <number>', 'Limit number of results', parseInt)
  .option('--sort <field>', 'Sort by field (startTime, name, status)', 'startTime')
  .option('-f, --format <format>', 'Output format (json, table)', 'table')
  .option('-d, --detailed', 'Show detailed information')
  .action(async (options) => {
    try {
      console.log(chalk.blue('📋 Listing workflows...\n'));

      const result = await listWorkflows(options);
      displayWorkflows(result);

    } catch (error) {
      console.error(chalk.red('❌ Failed to list workflows:'), error);
      process.exit(1);
    }
  });

workflowCommand
  .command('pause')
  .description('Pause a running workflow')
  .argument('<workflow-id>', 'Workflow ID to pause')
  .option('-g, --graceful', 'Graceful pause (wait for current step)', true)
  .option('-i, --immediate', 'Immediate pause')
  .option('-r, --reason <reason>', 'Reason for pausing')
  .option('-t, --timeout <ms>', 'Timeout for graceful pause', parseInt, 30000)
  .action(async (workflowId, options) => {
    try {
      console.log(chalk.blue(`⏸️  Pausing workflow ${workflowId}...\n`));

      const result = await pauseWorkflow({
        workflowId,
        graceful: options.graceful && !options.immediate,
        immediate: options.immediate,
        reason: options.reason,
        timeout: options.timeout
      });

      displayPauseResult(result);

    } catch (error) {
      console.error(chalk.red('❌ Failed to pause workflow:'), error);
      process.exit(1);
    }
  });

workflowCommand
  .command('cancel')
  .description('Cancel a workflow')
  .argument('<workflow-id>', 'Workflow ID to cancel')
  .option('-g, --graceful', 'Graceful cancellation (wait for current step)', true)
  .option('-f, --force', 'Force immediate cancellation')
  .option('-c, --confirm', 'Confirm forced cancellation', false)
  .option('-r, --reason <reason>', 'Reason for cancellation')
  .option('--cleanup', 'Clean up workflow resources', true)
  .option('--preserve-results', 'Preserve partial results')
  .option('--clean-memory', 'Clean up workflow memory')
  .option('--retry', 'Retry on failure', false)
  .action(async (workflowId, options) => {
    try {
      // Confirmation prompt for force cancel
      if (options.force && !options.confirm) {
        const { confirmed } = await inquirer.prompt([
          {
            type: 'confirm',
            name: 'confirmed',
            message: chalk.yellow('⚠️  Force cancel will immediately stop all workflow operations. Continue?'),
            default: false
          }
        ]);

        if (!confirmed) {
          console.log(chalk.gray('Cancellation aborted.'));
          return;
        }

        options.confirm = true;
      }

      console.log(chalk.blue(`🛑 Cancelling workflow ${workflowId}...\n`));

      const result = await cancelWorkflow({
        workflowId,
        graceful: options.graceful && !options.force,
        force: options.force,
        confirm: options.confirm,
        reason: options.reason,
        cleanup: options.cleanup,
        preserveResults: options.preserveResults,
        cleanMemory: options.cleanMemory,
        retryOnFailure: options.retry
      });

      displayCancelResult(result);

    } catch (error) {
      console.error(chalk.red('❌ Failed to cancel workflow:'), error);
      process.exit(1);
    }
  });

/**
 * Config commands
 */
const configCommand = program
  .command('config')
  .description('Manage AQE configuration');

configCommand
  .command('init')
  .description('Initialize configuration file')
  .option('-o, --output <path>', 'Output file path', '.aqe/config.json')
  .action(async (options) => {
    try {
      await configCommands.configInit(options);
    } catch (error) {
      console.error(chalk.red('❌ Config init failed:'), error);
      process.exit(1);
    }
  });

configCommand
  .command('validate')
  .description('Validate configuration file')
  .option('-f, --file <path>', 'Config file path', '.aqe/config.json')
  .action(async (options) => {
    try {
      await configCommands.configValidate(options);
    } catch (error) {
      console.error(chalk.red('❌ Config validation failed:'), error);
      process.exit(1);
    }
  });

configCommand
  .command('get')
  .description('Get configuration value')
  .argument('<key>', 'Configuration key (dot notation supported)')
  .option('-f, --file <path>', 'Config file path', '.aqe/config.json')
  .option('--json', 'Output as JSON')
  .action(async (key, options) => {
    try {
      await configCommands.configGet({ key, config: options.file });
    } catch (error) {
      console.error(chalk.red('❌ Config get failed:'), error);
      process.exit(1);
    }
  });

configCommand
  .command('set')
  .description('Set configuration value')
  .argument('<key>', 'Configuration key (dot notation supported)')
  .argument('<value>', 'Value to set')
  .option('-f, --file <path>', 'Config file path', '.aqe/config.json')
  .action(async (key, value, options) => {
    try {
      await configCommands.configSet({ key, value, config: options.file });
    } catch (error) {
      console.error(chalk.red('❌ Config set failed:'), error);
      process.exit(1);
    }
  });

configCommand
  .command('list')
  .description('List all configuration values')
  .option('-f, --file <path>', 'Config file path', '.aqe/config.json')
  .option('--json', 'Output as JSON')
  .action(async (options) => {
    try {
      await configCommands.configList(options);
    } catch (error) {
      console.error(chalk.red('❌ Config list failed:'), error);
      process.exit(1);
    }
  });

configCommand
  .command('reset')
  .description('Reset configuration to defaults')
  .option('-f, --file <path>', 'Config file path', '.aqe/config.json')
  .option('--force', 'Skip confirmation prompt')
  .action(async (options) => {
    try {
      await configCommands.configReset(options);
    } catch (error) {
      console.error(chalk.red('❌ Config reset failed:'), error);
      process.exit(1);
    }
  });

/**
 * Debug commands
 */
const debugCommand = program
  .command('debug')
  .description('Debug and troubleshoot AQE fleet');

debugCommand
  .command('agent')
  .description('Debug specific agent')
  .argument('<agent-id>', 'Agent ID to debug')
  .option('-v, --verbose', 'Verbose output')
  .action(async (agentId, options) => {
    try {
      console.log(chalk.blue(`🐛 Debugging agent ${agentId}...`));
      // Implementation would be in debug/agent.ts
    } catch (error) {
      console.error(chalk.red('❌ Agent debug failed:'), error);
      process.exit(1);
    }
  });

debugCommand
  .command('diagnostics')
  .description('Run comprehensive diagnostics')
  .option('--full', 'Run full diagnostic suite')
  .action(async (options) => {
    try {
      console.log(chalk.blue('🔍 Running diagnostics...'));
      // Implementation would be in debug/diagnostics.ts
    } catch (error) {
      console.error(chalk.red('❌ Diagnostics failed:'), error);
      process.exit(1);
    }
  });

debugCommand
  .command('health-check')
  .description('Check system health')
  .option('--export-report', 'Export health report')
  .action(async (options) => {
    try {
      console.log(chalk.blue('💚 Running health check...'));
      // Implementation would be in debug/health-check.ts
    } catch (error) {
      console.error(chalk.red('❌ Health check failed:'), error);
      process.exit(1);
    }
  });

debugCommand
  .command('troubleshoot')
  .description('Troubleshoot specific issue')
  .argument('<issue>', 'Issue to troubleshoot')
  .action(async (issue, options) => {
    try {
      console.log(chalk.blue(`🔧 Troubleshooting ${issue}...`));
      // Implementation would be in debug/troubleshoot.ts
    } catch (error) {
      console.error(chalk.red('❌ Troubleshooting failed:'), error);
      process.exit(1);
    }
  });

/**
 * Memory commands
 */
const memoryCommand = program
  .command('memory')
  .description('Manage AQE memory and coordination state');

memoryCommand
  .command('stats')
  .description('Show memory statistics')
  .action(async (options) => {
    try {
      console.log(chalk.blue('📊 Memory Statistics...'));
      // Implementation would be in memory/stats.ts
    } catch (error) {
      console.error(chalk.red('❌ Memory stats failed:'), error);
      process.exit(1);
    }
  });

memoryCommand
  .command('compact')
  .description('Compact memory database')
  .option('--aggressive', 'Aggressive compaction')
  .action(async (options) => {
    try {
      console.log(chalk.blue('🗜️  Compacting memory...'));
      // Implementation would be in memory/compact.ts
    } catch (error) {
      console.error(chalk.red('❌ Memory compaction failed:'), error);
      process.exit(1);
    }
  });

/**
 * Routing commands (Phase 1 - v1.0.5)
 * Multi-Model Router management commands
 */
const routingCommand = program
  .command('routing')
  .description('Manage Multi-Model Router for cost optimization (v1.0.5)');

routingCommand
  .command('enable')
  .description('Enable Multi-Model Router (70-81% cost savings)')
  .option('-c, --config <path>', 'Config file path', '.agentic-qe/config/routing.json')
  .action(async (options) => {
    try {
      await routingCommands.routingEnable(options);
    } catch (error) {
      console.error(chalk.red('❌ Routing enable failed:'), error);
      process.exit(1);
    }
  });

routingCommand
  .command('disable')
  .description('Disable Multi-Model Router')
  .option('-c, --config <path>', 'Config file path', '.agentic-qe/config/routing.json')
  .action(async (options) => {
    try {
      await routingCommands.routingDisable(options);
    } catch (error) {
      console.error(chalk.red('❌ Routing disable failed:'), error);
      process.exit(1);
    }
  });

routingCommand
  .command('status')
  .description('Show routing configuration and status')
  .option('-c, --config <path>', 'Config file path', '.agentic-qe/config/routing.json')
  .option('-f, --format <format>', 'Output format (json|table)', 'table')
  .option('-v, --verbose', 'Verbose output')
  .action(async (options) => {
    try {
      await routingCommands.routingStatus(options);
    } catch (error) {
      console.error(chalk.red('❌ Routing status failed:'), error);
      process.exit(1);
    }
  });

routingCommand
  .command('dashboard')
  .description('Show cost dashboard with savings metrics')
  .action(async (options) => {
    try {
      await routingCommands.routingDashboard(options);
    } catch (error) {
      console.error(chalk.red('❌ Routing dashboard failed:'), error);
      process.exit(1);
    }
  });

routingCommand
  .command('report')
  .description('Generate detailed cost report')
  .option('-f, --format <format>', 'Output format (json|table)', 'table')
  .option('-e, --export <file>', 'Export report to file')
  .option('-t, --timeframe <timeframe>', 'Report timeframe', 'all-time')
  .action(async (options) => {
    try {
      await routingCommands.routingReport(options);
    } catch (error) {
      console.error(chalk.red('❌ Routing report failed:'), error);
      process.exit(1);
    }
  });

routingCommand
  .command('stats')
  .description('Show routing statistics and performance metrics')
  .action(async (options) => {
    try {
      await routingCommands.routingStats(options);
    } catch (error) {
      console.error(chalk.red('❌ Routing stats failed:'), error);
      process.exit(1);
    }
  });

// Parse command line arguments
program.parse();