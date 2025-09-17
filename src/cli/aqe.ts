#!/usr/bin/env node

import { Command } from 'commander';
import chalk from 'chalk';
import * as path from 'path';
import * as fs from 'fs-extra';
import { Logger, LogLevel } from '../utils/Logger';

const logger = new Logger('aqe-cli');
import { InitCommand } from '../commands/init';
import { SpawnCommand } from '../commands/spawn';
import { StatusCommand } from '../commands/status';
import { agentLoader } from '../loaders/agent-loader';
import { QEFrameworkConfig } from '../types/agent';

// ASCII Art Banner
const BANNER = `
 █████╗  ██████╗ ███████╗
██╔══██╗██╔═══██╗██╔════╝
███████║██║   ██║█████╗
██╔══██║██║▄▄ ██║██╔══╝
██║  ██║╚██████╔╝███████╗
╚═╝  ╚═╝ ╚══▀▀═╝ ╚══════╝

Agentic Quality Engineering Framework
AI-Powered Testing & Quality Assurance
`;

class AQECli {
  private program: Command;
  private config: QEFrameworkConfig | null = null;

  constructor() {
    this.program = new Command();
    this.setupProgram();
    this.registerCommands();
  }

  private setupProgram(): void {
    this.program
      .name('aqe')
      .description('Agentic Quality Engineering - AI-powered testing and QA automation')
      .version(this.getVersion(), '-v, --version', 'Display version information')
      .option('-c, --config <path>', 'Configuration file path', 'qe.config.json')
      .option('-d, --debug', 'Enable debug logging')
      .option('--no-banner', 'Disable banner display')
      .hook('preAction', async (thisCommand, actionCommand) => {
        // Load configuration
        await this.loadConfiguration(thisCommand.opts());

        // Setup logging
        if (thisCommand.opts().debug) {
          logger.setLevel(LogLevel.DEBUG);
        }

        // Display banner (unless disabled)
        if (!thisCommand.opts().noBanner && process.stdout.isTTY) {
          console.log(chalk.cyan(BANNER));
        }
      });
  }

  private registerCommands(): void {
    // Register core commands
    InitCommand.register(this.program);
    SpawnCommand.register(this.program);
    StatusCommand.register(this.program);

    // Additional commands
    this.registerListCommand();
    this.registerStatusCommand();
    this.registerLogsCommand();
    this.registerMetricsCommand();
    this.registerConfigCommand();
    this.registerValidateCommand();
    this.registerCleanupCommand();
  }

  private registerListCommand(): void {
    this.program
      .command('list')
      .description('List available agents')
      .option('-c, --category <category>', 'Filter by category')
      .option('-t, --tags <tags...>', 'Filter by tags')
      .option('-p, --pact-level <level>', 'Filter by PACT level', parseInt)
      .option('--capabilities <caps...>', 'Filter by capabilities')
      .option('-s, --stats', 'Show statistics')
      .option('-j, --json', 'Output as JSON')
      .action(async (options) => {
        try {
          await agentLoader.loadAllAgents();
          const agents = agentLoader.getLoadedAgents();

          let filtered = agents;

          if (options.category) {
            filtered = agentLoader.getAgentsByCategory(options.category);
          }

          if (options.tags) {
            filtered = agentLoader.getAgentsByTags(options.tags);
          }

          if (options.pactLevel) {
            filtered = agentLoader.getAgentsByPactLevel(options.pactLevel);
          }

          if (options.capabilities) {
            filtered = options.capabilities.reduce((acc: any[], cap: string) => {
              return acc.filter(entry =>
                agentLoader.getAgentsByCapability(cap).includes(entry)
              );
            }, filtered);
          }

          if (options.json) {
            console.log(JSON.stringify(filtered.map(e => e.agent), null, 2));
            return;
          }

          if (options.stats) {
            const stats = agentLoader.getStatistics();
            console.log(chalk.blue('📊 Agent Statistics:'));
            console.log(`  Total Agents: ${stats.total}`);
            console.log(`  Registered: ${stats.registered}`);
            console.log('  By Category:');
            Object.entries(stats.byCategory).forEach(([cat, count]) => {
              console.log(`    ${cat}: ${count}`);
            });
            console.log('  By PACT Level:');
            Object.entries(stats.byPactLevel).forEach(([level, count]) => {
              console.log(`    Level ${level}: ${count}`);
            });
            return;
          }

          console.log(chalk.blue(`📋 Available Agents (${filtered.length}):`));
          filtered.forEach(entry => {
            const { agent } = entry;
            const status = entry.isRegistered ? chalk.green('✓') : chalk.red('✗');
            console.log(`${status} ${chalk.bold(agent.name)} (${agent.category})`);
            console.log(`   ${agent.description}`);
            if (agent.capabilities && agent.capabilities.length > 0) {
              console.log(`   Capabilities: ${agent.capabilities.join(', ')}`);
            }
            console.log('');
          });

        } catch (error) {
          console.error(chalk.red('❌ Failed to list agents:'), error instanceof Error ? error.message : String(error));
          process.exit(1);
        }
      });
  }

  private registerStatusCommand(): void {
    this.program
      .command('status')
      .description('Show QE framework and swarm status')
      .option('-s, --swarm-id <id>', 'Specific swarm ID')
      .option('-j, --json', 'Output as JSON')
      .action(async (options) => {
        try {
          const status: any = {
            framework: {
              version: this.getVersion(),
              config: this.config ? 'loaded' : 'not found',
              timestamp: new Date().toISOString(),
            },
            agents: {
              loaded: agentLoader.getLoadedAgents().length,
              registered: agentLoader.getStatistics().registered,
            },
          };

          // Try to get Claude-Flow status
          try {
            const { exec } = require('child_process');
            const { promisify } = require('util');
            const execAsync = promisify(exec);

            const { stdout } = await execAsync('npx claude-flow@alpha swarm status --json');
            status.swarm = JSON.parse(stdout);
          } catch (error) {
            status.swarm = { status: 'unavailable', error: error instanceof Error ? error.message : String(error) };
          }

          if (options.json) {
            console.log(JSON.stringify(status, null, 2));
          } else {
            console.log(chalk.blue('📊 AQE Framework Status:'));
            console.log(`  Version: ${status.framework.version}`);
            console.log(`  Config: ${status.framework.config}`);
            console.log(`  Agents Loaded: ${status.agents.loaded}`);
            console.log(`  Agents Registered: ${status.agents.registered}`);

            if (status.swarm.status !== 'unavailable') {
              console.log(chalk.blue('🔗 Swarm Status:'));
              console.log(`  Active Swarms: ${status.swarm.active_swarms || 0}`);
              console.log(`  Total Agents: ${status.swarm.total_agents || 0}`);
            } else {
              console.log(chalk.yellow('⚠️ Claude-Flow not available'));
            }
          }
        } catch (error) {
          console.error(chalk.red('❌ Failed to get status:'), error instanceof Error ? error.message : String(error));
          process.exit(1);
        }
      });
  }

  private registerLogsCommand(): void {
    this.program
      .command('logs')
      .description('View QE framework logs')
      .option('-f, --follow', 'Follow log output')
      .option('-n, --lines <number>', 'Number of lines to show', parseInt, 50)
      .option('-l, --level <level>', 'Log level filter')
      .action(async (options) => {
        try {
          const logFile = this.config?.logging?.file || 'qe.log';

          if (!(await fs.pathExists(logFile))) {
            console.log(chalk.yellow('⚠️ No log file found'));
            return;
          }

          if (options.follow) {
            // Use tail -f equivalent
            console.log(chalk.blue(`📄 Following logs: ${logFile}`));
            const { spawn } = require('child_process');
            const tail = spawn('tail', ['-f', logFile], { stdio: 'inherit' });

            process.on('SIGINT', () => {
              tail.kill();
              process.exit(0);
            });
          } else {
            // Read last N lines
            const content = await fs.readFile(logFile, 'utf-8');
            const lines = content.split('\n').slice(-options.lines);

            console.log(chalk.blue(`📄 Last ${options.lines} log entries:`));
            lines.forEach(line => {
              if (line.trim()) {
                // Simple log formatting
                if (line.includes('ERROR')) {
                  console.log(chalk.red(line));
                } else if (line.includes('WARN')) {
                  console.log(chalk.yellow(line));
                } else if (line.includes('INFO')) {
                  console.log(chalk.blue(line));
                } else {
                  console.log(line);
                }
              }
            });
          }
        } catch (error) {
          console.error(chalk.red('❌ Failed to read logs:'), error instanceof Error ? error.message : String(error));
          process.exit(1);
        }
      });
  }

  private registerMetricsCommand(): void {
    this.program
      .command('metrics')
      .description('Show performance metrics')
      .option('-t, --timeframe <period>', 'Time period (1h, 24h, 7d)', '24h')
      .option('-j, --json', 'Output as JSON')
      .action(async (options) => {
        try {
          // Try to get Claude-Flow metrics
          const { exec } = require('child_process');
          const { promisify } = require('util');
          const execAsync = promisify(exec);

          try {
            const { stdout } = await execAsync(
              `npx claude-flow@alpha metrics collect --timeframe ${options.timeframe} --json`
            );
            const metrics = JSON.parse(stdout);

            if (options.json) {
              console.log(JSON.stringify(metrics, null, 2));
            } else {
              console.log(chalk.blue('📈 Performance Metrics:'));
              console.log(`  Timeframe: ${options.timeframe}`);

              if (metrics.agents) {
                console.log(`  Agents Spawned: ${metrics.agents.spawned || 0}`);
                console.log(`  Tasks Completed: ${metrics.agents.completed || 0}`);
                console.log(`  Average Response Time: ${metrics.agents.avg_response_time || 'N/A'}`);
              }

              if (metrics.swarm) {
                console.log(`  Swarm Efficiency: ${metrics.swarm.efficiency || 'N/A'}`);
                console.log(`  Coordination Events: ${metrics.swarm.coordination_events || 0}`);
              }
            }
          } catch (error) {
            console.log(chalk.yellow('⚠️ No metrics available (Claude-Flow not running)'));
          }
        } catch (error) {
          console.error(chalk.red('❌ Failed to get metrics:'), error instanceof Error ? error.message : String(error));
          process.exit(1);
        }
      });
  }

  private registerConfigCommand(): void {
    this.program
      .command('config')
      .description('Manage AQE configuration')
      .option('-s, --show', 'Show current configuration')
      .option('-e, --edit', 'Edit configuration')
      .option('--validate', 'Validate configuration')
      .action(async (options) => {
        try {
          if (options.show || (!options.edit && !options.validate)) {
            if (this.config) {
              console.log(chalk.blue('⚙️ Current Configuration:'));
              console.log(JSON.stringify(this.config, null, 2));
            } else {
              console.log(chalk.yellow('⚠️ No configuration found. Run "aqe init" first.'));
            }
          }

          if (options.validate) {
            // Validate configuration
            const errors: string[] = [];

            if (!this.config) {
              errors.push('Configuration file not found');
            } else {
              if (!await fs.pathExists(this.config.agentsPath)) {
                errors.push(`Agents path not found: ${this.config.agentsPath}`);
              }

              if (!this.config.swarm.topology) {
                errors.push('Swarm topology not specified');
              }
            }

            if (errors.length > 0) {
              console.log(chalk.red('❌ Configuration validation failed:'));
              errors.forEach(error => console.log(chalk.red(`  • ${error}`)));
              process.exit(1);
            } else {
              console.log(chalk.green('✅ Configuration is valid'));
            }
          }

          if (options.edit) {
            const editor = process.env.EDITOR || 'nano';
            const configPath = 'qe.config.json';

            const { spawn } = require('child_process');
            const edit = spawn(editor, [configPath], { stdio: 'inherit' });

            edit.on('exit', (code: number) => {
              if (code === 0) {
                console.log(chalk.green('✅ Configuration updated'));
              } else {
                console.log(chalk.red('❌ Edit cancelled'));
              }
            });
          }
        } catch (error) {
          console.error(chalk.red('❌ Configuration command failed:'), error instanceof Error ? error.message : String(error));
          process.exit(1);
        }
      });
  }

  private registerValidateCommand(): void {
    this.program
      .command('validate')
      .description('Validate agent definitions')
      .option('-a, --agent <name>', 'Validate specific agent')
      .option('--fix', 'Attempt to fix validation issues')
      .action(async (options) => {
        try {
          await agentLoader.loadAllAgents();
          const agents = options.agent
            ? [agentLoader.getAgent(options.agent)].filter(Boolean)
            : agentLoader.getLoadedAgents();

          if (agents.length === 0) {
            console.log(chalk.yellow('⚠️ No agents to validate'));
            return;
          }

          let totalErrors = 0;

          for (const entry of agents) {
            if (!entry) continue;

            const validation = agentLoader.validateAgent(entry.agent);

            if (validation.valid) {
              console.log(chalk.green(`✅ ${entry.agent.name}: Valid`));
            } else {
              console.log(chalk.red(`❌ ${entry.agent.name}: Invalid`));
              validation.errors.forEach(error => {
                console.log(chalk.red(`  • ${error}`));
                totalErrors++;
              });
            }
          }

          if (totalErrors > 0) {
            console.log(chalk.red(`\n❌ Found ${totalErrors} validation errors`));
            process.exit(1);
          } else {
            console.log(chalk.green('\n✅ All agents are valid'));
          }
        } catch (error) {
          console.error(chalk.red('❌ Validation failed:'), error instanceof Error ? error.message : String(error));
          process.exit(1);
        }
      });
  }

  private registerCleanupCommand(): void {
    this.program
      .command('cleanup')
      .description('Clean up orphaned registrations and temporary files')
      .option('--dry-run', 'Show what would be cleaned without doing it')
      .action(async (options) => {
        try {
          await agentLoader.loadAllAgents();
          const validAgents = agentLoader.getLoadedAgents().map(e => e.agent.name);

          if (options.dryRun) {
            console.log(chalk.blue('🧹 Cleanup (dry run):'));
            console.log(`  Valid agents: ${validAgents.length}`);
            console.log('  Would check for orphaned registrations...');
          } else {
            console.log(chalk.blue('🧹 Cleaning up...'));

            const { claudeRegistrar } = require('../registrars/claude-registrar');
            await claudeRegistrar.cleanup(validAgents);

            console.log(chalk.green('✅ Cleanup completed'));
          }
        } catch (error) {
          console.error(chalk.red('❌ Cleanup failed:'), error instanceof Error ? error.message : String(error));
          process.exit(1);
        }
      });
  }

  private async loadConfiguration(options: any): Promise<void> {
    const configPath = path.resolve(options.config);

    try {
      if (await fs.pathExists(configPath)) {
        this.config = await fs.readJson(configPath);
        logger.debug(`Loaded configuration from ${configPath}`);
      }
    } catch (error) {
      logger.warn(`Failed to load configuration from ${configPath}:`, error instanceof Error ? error.message : String(error));
    }
  }

  private getVersion(): string {
    try {
      const packageJson = require('../../package.json');
      return packageJson.version;
    } catch {
      return '1.0.0';
    }
  }

  async run(): Promise<void> {
    try {
      await this.program.parseAsync(process.argv);
    } catch (error) {
      console.error(chalk.red('❌ Command failed:'), error instanceof Error ? error.message : String(error));
      process.exit(1);
    }
  }
}

// Export for use as module
export { AQECli };

// Run CLI if this file is executed directly
if (require.main === module) {
  const cli = new AQECli();
  cli.run().catch((error) => {
    console.error(chalk.red('❌ CLI failed:'), error);
    process.exit(1);
  });
}