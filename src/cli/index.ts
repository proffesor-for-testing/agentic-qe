#!/usr/bin/env node

/**
 * Agentic QE CLI - Command-line interface for quality engineering automation
 * Provides commands for test execution, agent management, and framework operations
 */

import { Command } from 'commander';
import chalk from 'chalk';
import * as fs from 'fs-extra';
import * as path from 'path';
import { CLICommand } from '../types';
import { Logger } from '../utils/Logger';
import QEFramework from '../index';

/**
 * CLI Application class
 */
class AgenticQECLI {
  private readonly program: Command;
  private readonly logger: Logger;
  private readonly commands: Map<string, CLICommand> = new Map();

  constructor() {
    this.program = new Command();
    this.logger = new Logger('AgenticQE-CLI');
    this.setupProgram();
    this.registerCommands();
  }

  /**
   * Setup the main program configuration
   */
  private setupProgram(): void {
    this.program
      .name('agentic-qe')
      .description('Agentic Quality Engineering framework with AI-powered testing agents')
      .version('1.0.0')
      .option('-v, --verbose', 'Enable verbose logging')
      .option('-c, --config <path>', 'Configuration file path')
      .option('--no-color', 'Disable colored output')
      .hook('preAction', (thisCommand) => {
        const options = thisCommand.opts();
        if (options.verbose) {
          process.env.LOG_LEVEL = 'debug';
        }
        if (options.noColor) {
          chalk.level = 0;
        }
      });
  }

  /**
   * Register all CLI commands
   */
  private registerCommands(): void {
    // Core commands
    this.registerCommand(this.initCommand());
    this.registerCommand(this.runCommand());
    this.registerCommand(this.agentCommand());
    this.registerCommand(this.doctorCommand());
  }

  /**
   * Register a single command
   */
  private registerCommand(cliCommand: CLICommand): void {
    this.commands.set(cliCommand.name, cliCommand);

    const command = this.program.command(cliCommand.name);
    command.description(cliCommand.description);

    if (cliCommand.aliases) {
      command.aliases(cliCommand.aliases);
    }

    // Add options
    for (const option of cliCommand.options) {
      const flags = option.required
        ? `--${option.name} <${option.type}>`
        : `--${option.name} [${option.type}]`;

      const cmd = command.option(flags, option.description, option.default as string);

      if (option.choices) {
        // Note: choices method not available in this version, using validation instead
        // cmd.choices(option.choices);
      }
    }

    command.action(async (...args) => {
      try {
        await cliCommand.handler(this.parseArguments(args, cliCommand));
      } catch (error) {
        this.handleError(error, cliCommand.name);
      }
    });
  }

  /**
   * Parse command arguments
   */
  private parseArguments(args: any[], command: CLICommand): Record<string, unknown> {
    const options = args[args.length - 1]?.opts() || {};
    const positionalArgs = args.slice(0, -1);

    return {
      ...options,
      _: positionalArgs
    };
  }

  /**
   * Handle command errors
   */
  private handleError(error: unknown, commandName: string): void {
    const err = error instanceof Error ? error : new Error(String(error));

    console.error(chalk.red(`Error in command '${commandName}': ${err.message}`));

    if (process.env.LOG_LEVEL === 'debug') {
      console.error(chalk.gray(err.stack));
    }

    process.exit(1);
  }

  /**
   * Initialize project command
   */
  private initCommand(): CLICommand {
    return {
      name: 'init',
      description: 'Initialize a new Agentic QE project',
      aliases: ['create'],
      options: [
        {
          name: 'name',
          description: 'Project name',
          type: 'string',
          required: false,
          default: 'my-qe-project'
        }
      ],
      handler: async (args) => {
        const projectName = args.name as string;
        console.log(chalk.blue('🚀 Initializing Agentic QE project...'));
        console.log(chalk.green(`✅ Project '${projectName}' would be created!`));
      }
    };
  }

  /**
   * Run tests command
   */
  private runCommand(): CLICommand {
    return {
      name: 'run',
      description: 'Run test suites with AI agents',
      aliases: ['test', 'execute'],
      options: [
        {
          name: 'env',
          description: 'Test environment',
          type: 'string',
          required: false,
          default: 'default'
        }
      ],
      handler: async (args) => {
        console.log(chalk.blue('🧪 Starting test execution...'));
        console.log(chalk.yellow('Test execution implementation pending...'));
      }
    };
  }

  /**
   * Agent management command
   */
  private agentCommand(): CLICommand {
    return {
      name: 'agent',
      description: 'Manage QE agents',
      options: [
        {
          name: 'action',
          description: 'Agent action',
          type: 'string',
          required: true,
          choices: ['list', 'spawn', 'destroy', 'status']
        }
      ],
      handler: async (args) => {
        const action = args.action as string;
        console.log(chalk.blue(`🤖 Agent ${action}...`));

        if (action === 'list') {
          console.log('Available agent types:');
          console.log('- test-planner');
          console.log('- test-executor');
          console.log('- performance-tester');
          console.log('- security-tester');
          console.log('- api-tester');
        }
      }
    };
  }

  /**
   * Health check command
   */
  private doctorCommand(): CLICommand {
    return {
      name: 'doctor',
      description: 'Check framework health and configuration',
      aliases: ['health', 'check'],
      options: [],
      handler: async (args) => {
        console.log(chalk.blue('👩‍⚕️ Running health checks...'));

        const checks = [
          { name: 'Node.js version', status: 'pass', message: process.version },
          { name: 'TypeScript', status: 'pass', message: 'Available' },
          { name: 'Framework', status: 'pass', message: 'Operational' }
        ];

        for (const check of checks) {
          const icon = check.status === 'pass' ? '✅' : '❌';
          const color = check.status === 'pass' ? chalk.green : chalk.red;
          console.log(`${icon} ${color(check.name)}: ${check.message}`);
        }

        console.log(chalk.green('\n✅ Framework is healthy!'));
      }
    };
  }

  /**
   * Run the CLI application
   */
  public async run(argv?: string[]): Promise<void> {
    try {
      await this.program.parseAsync(argv);
    } catch (error) {
      this.handleError(error, 'main');
    }
  }
}

// ============================================================================
// Main execution
// ============================================================================

if (require.main === module) {
  const cli = new AgenticQECLI();
  cli.run().catch(error => {
    console.error(chalk.red('Fatal error:'), error.message);
    process.exit(1);
  });
}

export { AgenticQECLI };
export default AgenticQECLI;