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

// Parse command line arguments
program.parse();