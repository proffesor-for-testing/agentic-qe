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
import * as learnCommands from './commands/learn/index.js';
import * as patternsCommands from './commands/patterns/index.js';
import * as improveCommands from './commands/improve/index.js';
import { InitCommand } from './commands/init';

const program = new Command();
const logger = Logger.getInstance();

// Global fleet manager instance
let fleetManager: FleetManager | null = null;

program
  .name('agentic-qe')
  .description('Agentic Quality Engineering Fleet - Autonomous testing and quality assurance')
  .version('1.1.0');

/**
 * Initialize fleet using proper InitCommand
 */
program
  .command('init')
  .description('Initialize the AQE Fleet')
  .option('-c, --config <path>', 'Configuration file path')
  .option('-t, --topology <type>', 'Swarm topology', 'hierarchical')
  .option('-m, --max-agents <number>', 'Maximum agents', '10')
  .option('-f, --focus <areas>', 'Testing focus areas', 'unit,integration')
  .option('-e, --environments <envs>', 'Target environments', 'development')
  .option('--frameworks <frameworks>', 'Test frameworks', 'jest')
  .action(async (options) => {
    try {
      await InitCommand.execute(options as any);
    } catch (error) {
      console.error(chalk.red('❌ Failed to initialize:'), error);
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

/**
 * Learning commands (Phase 2 - Milestone 2.2)
 * Manage the LearningEngine and view learning status
 */
const learnCommand = program
  .command('learn')
  .description('Manage agent learning and performance improvement (Phase 2)');

learnCommand
  .command('status')
  .description('View learning status')
  .option('--agent <id>', 'Target specific agent')
  .option('--detailed', 'Show detailed information')
  .action(async (options) => {
    try {
      await learnCommands.learnStatus(options);
    } catch (error) {
      console.error(chalk.red('❌ Learning status failed:'), error);
      process.exit(1);
    }
  });

learnCommand
  .command('enable')
  .description('Enable learning for agent(s)')
  .option('--agent <id>', 'Target specific agent')
  .option('--all', 'Enable for all agents')
  .action(async (options) => {
    try {
      await learnCommands.learnEnable(options);
    } catch (error) {
      console.error(chalk.red('❌ Learning enable failed:'), error);
      process.exit(1);
    }
  });

learnCommand
  .command('disable')
  .description('Disable learning for agent')
  .option('--agent <id>', 'Target specific agent')
  .action(async (options) => {
    try {
      await learnCommands.learnDisable(options);
    } catch (error) {
      console.error(chalk.red('❌ Learning disable failed:'), error);
      process.exit(1);
    }
  });

learnCommand
  .command('history')
  .description('View learning history')
  .option('--agent <id>', 'Target specific agent')
  .option('--limit <number>', 'Limit number of results', parseInt, 20)
  .action(async (options) => {
    try {
      await learnCommands.learnHistory(options);
    } catch (error) {
      console.error(chalk.red('❌ Learning history failed:'), error);
      process.exit(1);
    }
  });

learnCommand
  .command('train')
  .description('Trigger manual training')
  .option('--agent <id>', 'Target specific agent', 'default')
  .option('--task <json>', 'Task JSON for training')
  .action(async (options) => {
    try {
      await learnCommands.learnTrain(options);
    } catch (error) {
      console.error(chalk.red('❌ Learning train failed:'), error);
      process.exit(1);
    }
  });

learnCommand
  .command('reset')
  .description('Reset learning state')
  .option('--agent <id>', 'Target specific agent')
  .option('--confirm', 'Confirm reset operation')
  .action(async (options) => {
    try {
      await learnCommands.learnReset(options);
    } catch (error) {
      console.error(chalk.red('❌ Learning reset failed:'), error);
      process.exit(1);
    }
  });

learnCommand
  .command('export')
  .description('Export learning data')
  .option('--agent <id>', 'Target specific agent')
  .option('--output <file>', 'Output file path')
  .action(async (options) => {
    try {
      await learnCommands.learnExport(options);
    } catch (error) {
      console.error(chalk.red('❌ Learning export failed:'), error);
      process.exit(1);
    }
  });

/**
 * Patterns commands (Phase 2)
 * Manage test patterns in the QEReasoningBank
 */
const patternsCommand = program
  .command('patterns')
  .description('Manage test patterns in the QEReasoningBank (Phase 2)');

patternsCommand
  .command('list')
  .description('List all patterns')
  .option('--framework <name>', 'Filter by framework (jest, mocha, vitest, playwright)')
  .option('--type <category>', 'Filter by type (unit, integration, e2e)')
  .option('--limit <number>', 'Limit number of results', parseInt, 20)
  .action(async (options) => {
    try {
      await patternsCommands.patternsCommand('list', [], options);
    } catch (error) {
      console.error(chalk.red('❌ Patterns list failed:'), error);
      process.exit(1);
    }
  });

patternsCommand
  .command('search')
  .description('Search patterns by keyword')
  .argument('<keyword>', 'Search keyword')
  .option('--min-confidence <n>', 'Minimum confidence (0-1)', parseFloat, 0.3)
  .option('--limit <number>', 'Limit number of results', parseInt, 10)
  .action(async (keyword, options) => {
    try {
      await patternsCommands.patternsCommand('search', [keyword], options);
    } catch (error) {
      console.error(chalk.red('❌ Patterns search failed:'), error);
      process.exit(1);
    }
  });

patternsCommand
  .command('show')
  .description('Show pattern details')
  .argument('<pattern-id>', 'Pattern ID')
  .action(async (patternId, options) => {
    try {
      await patternsCommands.patternsCommand('show', [patternId], options);
    } catch (error) {
      console.error(chalk.red('❌ Patterns show failed:'), error);
      process.exit(1);
    }
  });

patternsCommand
  .command('extract')
  .description('Extract patterns from test directory')
  .argument('<directory>', 'Test directory path')
  .option('--framework <name>', 'Test framework', 'jest')
  .action(async (directory, options) => {
    try {
      await patternsCommands.patternsCommand('extract', [directory], options);
    } catch (error) {
      console.error(chalk.red('❌ Patterns extract failed:'), error);
      process.exit(1);
    }
  });

patternsCommand
  .command('share')
  .description('Share pattern across projects')
  .argument('<pattern-id>', 'Pattern ID')
  .option('--projects <ids>', 'Comma-separated project IDs')
  .action(async (patternId, options) => {
    try {
      await patternsCommands.patternsCommand('share', [patternId], options);
    } catch (error) {
      console.error(chalk.red('❌ Patterns share failed:'), error);
      process.exit(1);
    }
  });

patternsCommand
  .command('delete')
  .description('Delete pattern')
  .argument('<pattern-id>', 'Pattern ID')
  .option('--confirm', 'Confirm deletion')
  .action(async (patternId, options) => {
    try {
      await patternsCommands.patternsCommand('delete', [patternId], options);
    } catch (error) {
      console.error(chalk.red('❌ Patterns delete failed:'), error);
      process.exit(1);
    }
  });

patternsCommand
  .command('export')
  .description('Export patterns to file')
  .option('--output <file>', 'Output file path')
  .option('--framework <name>', 'Filter by framework')
  .action(async (options) => {
    try {
      await patternsCommands.patternsCommand('export', [], options);
    } catch (error) {
      console.error(chalk.red('❌ Patterns export failed:'), error);
      process.exit(1);
    }
  });

patternsCommand
  .command('import')
  .description('Import patterns from file')
  .option('--input <file>', 'Input file path')
  .action(async (options) => {
    try {
      await patternsCommands.patternsCommand('import', [], options);
    } catch (error) {
      console.error(chalk.red('❌ Patterns import failed:'), error);
      process.exit(1);
    }
  });

patternsCommand
  .command('stats')
  .description('Show pattern statistics')
  .option('--framework <name>', 'Filter by framework')
  .action(async (options) => {
    try {
      await patternsCommands.patternsCommand('stats', [], options);
    } catch (error) {
      console.error(chalk.red('❌ Patterns stats failed:'), error);
      process.exit(1);
    }
  });

/**
 * Improvement commands (Phase 2)
 * Manage the continuous improvement loop
 */
const improveCommand = program
  .command('improve')
  .description('Manage continuous improvement loop (Phase 2)');

improveCommand
  .command('status')
  .description('View improvement status')
  .option('--agent <id>', 'Target specific agent')
  .action(async (options) => {
    try {
      await improveCommands.improveCommand('status', [], options);
    } catch (error) {
      console.error(chalk.red('❌ Improve status failed:'), error);
      process.exit(1);
    }
  });

improveCommand
  .command('start')
  .description('Start improvement loop')
  .option('--agent <id>', 'Target specific agent')
  .action(async (options) => {
    try {
      await improveCommands.improveCommand('start', [], options);
    } catch (error) {
      console.error(chalk.red('❌ Improve start failed:'), error);
      process.exit(1);
    }
  });

improveCommand
  .command('stop')
  .description('Stop improvement loop')
  .option('--agent <id>', 'Target specific agent')
  .action(async (options) => {
    try {
      await improveCommands.improveCommand('stop', [], options);
    } catch (error) {
      console.error(chalk.red('❌ Improve stop failed:'), error);
      process.exit(1);
    }
  });

improveCommand
  .command('history')
  .description('View improvement history')
  .option('--agent <id>', 'Target specific agent')
  .option('--days <number>', 'Time period in days', parseInt, 30)
  .action(async (options) => {
    try {
      await improveCommands.improveCommand('history', [], options);
    } catch (error) {
      console.error(chalk.red('❌ Improve history failed:'), error);
      process.exit(1);
    }
  });

improveCommand
  .command('ab-test')
  .description('Run A/B test')
  .option('--agent <id>', 'Target specific agent')
  .option('--strategy-a <name>', 'First strategy')
  .option('--strategy-b <name>', 'Second strategy')
  .action(async (options) => {
    try {
      await improveCommands.improveCommand('ab-test', [], options);
    } catch (error) {
      console.error(chalk.red('❌ A/B test failed:'), error);
      process.exit(1);
    }
  });

improveCommand
  .command('failures')
  .description('View failure patterns')
  .option('--agent <id>', 'Target specific agent')
  .option('--limit <number>', 'Limit number of results', parseInt, 10)
  .action(async (options) => {
    try {
      await improveCommands.improveCommand('failures', [], options);
    } catch (error) {
      console.error(chalk.red('❌ Failures analysis failed:'), error);
      process.exit(1);
    }
  });

improveCommand
  .command('apply')
  .description('Apply recommendation')
  .argument('<recommendation-id>', 'Recommendation ID')
  .option('--dry-run', 'Preview without applying', true)
  .action(async (recommendationId, options) => {
    try {
      await improveCommands.improveCommand('apply', [recommendationId], options);
    } catch (error) {
      console.error(chalk.red('❌ Apply recommendation failed:'), error);
      process.exit(1);
    }
  });

improveCommand
  .command('report')
  .description('Generate improvement report')
  .option('--agent <id>', 'Target specific agent')
  .option('--format <format>', 'Report format (html, json, text)', 'text')
  .option('--output <file>', 'Output file path')
  .action(async (options) => {
    try {
      await improveCommands.improveCommand('report', [], options);
    } catch (error) {
      console.error(chalk.red('❌ Report generation failed:'), error);
      process.exit(1);
    }
  });

// Parse command line arguments
program.parse();