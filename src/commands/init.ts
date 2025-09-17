import * as fs from 'fs-extra';
import * as path from 'path';
import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import inquirer from 'inquirer';
import { QEFrameworkConfig, OperationResult } from '../types/agent';
import { logger } from '../utils/Logger';
import { agentLoader } from '../loaders/agent-loader';
import { claudeRegistrar } from '../registrars/claude-registrar';

export interface InitOptions {
  force?: boolean;
  template?: string;
  agents_path?: string;
  claude_agents_path?: string;
  claude_commands_path?: string;
  interactive?: boolean;
  swarm_topology?: 'mesh' | 'hierarchical' | 'ring' | 'star';
  max_agents?: number;
}

export class InitCommand {
  private defaultConfig: QEFrameworkConfig = {
    version: '1.0.0',
    agentsPath: 'agents',
    claudeAgentsPath: '.claude/agents/qe',
    claudeCommandsPath: '.claude/commands/qe',
    swarm: {
      topology: 'mesh',
      strategy: 'balanced',
      maxAgents: 10,
      coordination: {
        memory: true,
        hooks: true,
        neural: false,
      },
    },
    logging: {
      level: 'info',
      file: 'qe.log',
    },
    claude_flow: {
      enabled: false,  // Disabled by default to avoid timeout
      auto_spawn: true,
      coordination_hooks: true,
    },
  };

  async execute(options: InitOptions): Promise<OperationResult> {
    const spinner = ora('Checking prerequisites').start();

    try {
      // Check prerequisites first
      const prereqCheck = await this.checkPrerequisites();
      if (!prereqCheck.success) {
        spinner.fail('Prerequisites not met');
        console.log(chalk.yellow('\n📋 Prerequisites Check Failed:\n'));
        prereqCheck.errors?.forEach(error => console.log(chalk.red('  •'), error));
        console.log(chalk.cyan('\n💡 Installation Instructions:'));
        console.log(chalk.white('  1. Install Claude desktop app from https://claude.ai'));
        console.log(chalk.white('  2. Install Claude-Flow MCP:'));
        console.log(chalk.gray('     claude mcp add claude-flow npx claude-flow@alpha mcp start'));
        console.log(chalk.white('  3. Initialize Claude-Flow swarm:'));
        console.log(chalk.gray('     npx claude-flow@alpha swarm init --topology mesh'));
        return prereqCheck;
      }

      spinner.text = 'Initializing QE Framework';

      // Check if already initialized
      const configPath = path.resolve('qe.config.json');
      if (await fs.pathExists(configPath) && !options.force) {
        spinner.fail('QE Framework already initialized');

        if (!options.interactive) {
          return {
            success: false,
            message: 'QE Framework already initialized. Use --force to override.',
          };
        }

        const { override } = await inquirer.prompt([{
          type: 'confirm',
          name: 'override',
          message: 'QE Framework already exists. Override existing configuration?',
          default: false,
        }]);

        if (!override) {
          return {
            success: false,
            message: 'Initialization cancelled by user',
          };
        }
      }

      spinner.text = 'Creating configuration';

      // Create configuration
      const config = await this.createConfiguration(options);

      // Ensure directories exist
      await this.ensureDirectories(config);

      // Copy agent definitions and Claude integration files
      spinner.text = 'Copying agent definitions and Claude integration';
      await this.copyFrameworkFiles(config);

      // Initialize Claude-Flow if enabled
      if (config.claude_flow.enabled) {
        spinner.text = 'Initializing Claude-Flow coordination';
        await this.initializeClaudeFlow(config);
      }

      // Load and register agents
      spinner.text = 'Loading and registering agents';
      await this.loadAndRegisterAgents(config);

      // Save configuration
      await fs.writeJson(configPath, config, { spaces: 2 });

      // Create example files if needed
      if (options.template || options.interactive) {
        spinner.text = 'Creating example files';
        await this.createExampleFiles(config);
      }

      spinner.succeed('QE Framework initialized successfully');

      return {
        success: true,
        message: 'QE Framework initialized successfully',
        data: {
          config,
          agentsLoaded: await this.getAgentCount(config.agentsPath),
          claudeFlowEnabled: config.claude_flow.enabled,
        },
      };
    } catch (error) {
      spinner.fail('Failed to initialize QE Framework');
      logger.error('Initialization failed:', error);

      return {
        success: false,
        message: `Initialization failed: ${error instanceof Error ? error.message : String(error)}`,
        errors: [error instanceof Error ? error.message : String(error)],
      };
    }
  }

  private async createConfiguration(options: InitOptions): Promise<QEFrameworkConfig> {
    const config = { ...this.defaultConfig };

    // Apply CLI options
    if (options.agents_path) {
      config.agentsPath = options.agents_path;
    }
    if (options.claude_agents_path) {
      config.claudeAgentsPath = options.claude_agents_path;
    }
    if (options.claude_commands_path) {
      config.claudeCommandsPath = options.claude_commands_path;
    }
    if (options.swarm_topology) {
      config.swarm.topology = options.swarm_topology;
    }
    if (options.max_agents) {
      config.swarm.maxAgents = options.max_agents;
    }

    // Interactive configuration
    if (options.interactive) {
      const answers = await inquirer.prompt([
        {
          type: 'input',
          name: 'agentsPath',
          message: 'Agents directory path:',
          default: config.agentsPath,
        },
        {
          type: 'list',
          name: 'swarmTopology',
          message: 'Swarm topology:',
          choices: ['mesh', 'hierarchical', 'ring', 'star'],
          default: config.swarm.topology,
        },
        {
          type: 'list',
          name: 'swarmStrategy',
          message: 'Swarm strategy:',
          choices: ['balanced', 'specialized', 'adaptive'],
          default: config.swarm.strategy,
        },
        {
          type: 'number',
          name: 'maxAgents',
          message: 'Maximum agents:',
          default: config.swarm.maxAgents,
          validate: (value) => value > 0 || 'Must be greater than 0',
        },
        {
          type: 'confirm',
          name: 'enableClaudeFlow',
          message: 'Enable Claude-Flow coordination?',
          default: config.claude_flow.enabled,
        },
        {
          type: 'confirm',
          name: 'enableNeuralFeatures',
          message: 'Enable neural learning features?',
          default: config.swarm.coordination.neural,
        },
        {
          type: 'list',
          name: 'loggingLevel',
          message: 'Logging level:',
          choices: ['error', 'warn', 'info', 'debug'],
          default: config.logging.level,
        },
      ]);

      // Apply interactive answers
      config.agentsPath = answers.agentsPath;
      config.swarm.topology = answers.swarmTopology;
      config.swarm.strategy = answers.swarmStrategy;
      config.swarm.maxAgents = answers.maxAgents;
      config.claude_flow.enabled = answers.enableClaudeFlow;
      config.swarm.coordination.neural = answers.enableNeuralFeatures;
      config.logging.level = answers.loggingLevel;
    }

    return config;
  }

  private async ensureDirectories(config: QEFrameworkConfig): Promise<void> {
    const directories = [
      config.agentsPath,
      config.claudeAgentsPath,
      config.claudeCommandsPath,
      path.dirname(config.logging.file || 'qe.log'),
    ];

    await Promise.all(directories.map(dir => fs.ensureDir(dir)));
    logger.debug('Created required directories');
  }

  private async initializeClaudeFlow(config: QEFrameworkConfig): Promise<void> {
    try {
      // Check if claude-flow is available
      const { exec } = require('child_process');
      const { promisify } = require('util');
      const execAsync = promisify(exec);

      // Initialize swarm with specified topology
      await execAsync(`npx claude-flow@alpha swarm init --topology ${config.swarm.topology} --max-agents ${config.swarm.maxAgents}`);

      logger.info('Claude-Flow initialized successfully');
    } catch (error) {
      logger.warn('Claude-Flow initialization failed:', error instanceof Error ? error.message : String(error));
      // Don't fail the entire init process if Claude-Flow fails
    }
  }

  private async loadAndRegisterAgents(config: QEFrameworkConfig): Promise<void> {
    try {
      // Check if agents directory exists
      if (!(await fs.pathExists(config.agentsPath))) {
        logger.info('No existing agents directory, skipping agent loading');
        return;
      }

      // Initialize loaders with config paths
      const loader = new (agentLoader as any)(config.agentsPath);
      const registrar = new (claudeRegistrar as any)(
        config.claudeAgentsPath,
        config.claudeCommandsPath
      );

      // Load agents
      const agents = await loader.loadAllAgents();

      if (agents.length === 0) {
        logger.warn('No agents found to register');
        return;
      }

      // Register with Claude Code
      await registrar.registerAllAgents(agents);

      logger.info(`Loaded and registered ${agents.length} agents`);
    } catch (error) {
      logger.warn('Failed to load and register agents:', error);
      // Don't fail init if agent loading fails
    }
  }

  private async copyFrameworkFiles(config: QEFrameworkConfig): Promise<void> {
    try {
      // Get the source directory (where aqe is installed)
      // __dirname is dist/commands, so we go up to the package root
      const sourcePath = path.resolve(__dirname, '..', '..');

      // If running from source (development), adjust path
      const isRunningFromDist = __dirname.includes('dist');
      const actualSourcePath = isRunningFromDist ? sourcePath : path.resolve(__dirname, '..', '..');

      // Copy all agent definitions
      const sourceAgentsPath = path.join(actualSourcePath, 'agents');
      const targetAgentsPath = path.resolve(config.agentsPath);

      if (await fs.pathExists(sourceAgentsPath)) {
        logger.info(`Copying agents from ${sourceAgentsPath} to ${targetAgentsPath}`);
        await fs.copy(sourceAgentsPath, targetAgentsPath, {
          overwrite: false,
          errorOnExist: false,
        });
      }

      // Copy Claude integration files
      const sourceClaudePath = path.join(actualSourcePath, '.claude');
      const targetClaudePath = path.resolve('.claude');

      if (await fs.pathExists(sourceClaudePath)) {
        logger.info(`Copying Claude integration from ${sourceClaudePath} to ${targetClaudePath}`);
        await fs.copy(sourceClaudePath, targetClaudePath, {
          overwrite: false,
          errorOnExist: false,
        });
      }

      // Also copy the docs folder for reference
      const sourceDocsPath = path.join(actualSourcePath, 'docs');
      const targetDocsPath = path.resolve('docs');

      if (await fs.pathExists(sourceDocsPath)) {
        await fs.ensureDir(targetDocsPath);
        // Only copy specific documentation files
        const docFiles = [
          'INSTALLATION_GUIDE.md',
          'EVIDENCE_OF_AGENT_RUNS.md'
        ];

        for (const docFile of docFiles) {
          const sourceFile = path.join(sourceDocsPath, docFile);
          const targetFile = path.join(targetDocsPath, docFile);
          if (await fs.pathExists(sourceFile)) {
            await fs.copy(sourceFile, targetFile, {
              overwrite: false,
              errorOnExist: false,
            });
          }
        }
      }

      logger.info('Framework files copied successfully');
    } catch (error) {
      logger.error('Failed to copy framework files:', error);
      throw new Error(`Failed to copy framework files: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private async createExampleFiles(config: QEFrameworkConfig): Promise<void> {
    const exampleAgentPath = path.join(config.agentsPath, 'example-tester', 'agent.yaml');

    if (!(await fs.pathExists(exampleAgentPath))) {
      const exampleAgent = `name: example-tester
version: 1.0.0
description: Example Quality Engineering agent for demonstration
author: aqe-framework
category: testing
model: claude-sonnet-4
temperature: 0.2
max_tokens: 4096
pactLevel: 3

system_prompt: |
  You are an Example Tester agent specialized in demonstrating QE capabilities.

  PACT Classification: Collaborative (Level 3)
  - Proactive: Suggests test scenarios
  - Autonomous: Creates test cases independently
  - Collaborative: Works with other QE agents
  - Targeted: Focuses on testing excellence

capabilities:
  - test_case_generation
  - exploratory_testing
  - defect_identification
  - quality_assessment

tools:
  - name: generate_test_cases
    description: Generate test cases from requirements
    parameters:
      requirements:
        type: object
        description: Requirements or specification

permissions:
  - read
  - write
  - execute

tags:
  - testing
  - quality
  - example

example_prompts:
  - "Generate test cases for this API endpoint"
  - "Perform exploratory testing on this feature"
  - "What quality issues do you see in this code?"
`;

      await fs.ensureDir(path.dirname(exampleAgentPath));
      await fs.writeFile(exampleAgentPath, exampleAgent, 'utf-8');
      logger.info('Created example agent');
    }

    // Create example usage script
    const usageScript = `#!/bin/bash
# AQE Framework Usage Examples

echo "🚀 AQE Framework - Quality Engineering Agents"
echo "=============================================="

echo "📊 Agent Statistics:"
npx aqe list --stats

echo ""
echo "🔍 Available Agents:"
npx aqe list

echo ""
echo "🤖 Spawn Example Agent:"
npx aqe spawn example-tester --task "Generate test cases for user registration API"

echo ""
echo "📈 Swarm Status:"
npx aqe status

echo ""
echo "💡 Next Steps:"
echo "  1. Create your own agents in the agents/ directory"
echo "  2. Use 'npx aqe spawn <agent-name>' to execute agents"
echo "  3. Check logs with 'npx aqe logs'"
echo "  4. Monitor performance with 'npx aqe metrics'"
`;

    await fs.writeFile('examples.sh', usageScript, 'utf-8');
    await fs.chmod('examples.sh', '755');
    logger.info('Created usage examples');
  }

  private async getAgentCount(agentsPath: string): Promise<number> {
    try {
      const agentFiles = await fs.readdir(agentsPath);
      return agentFiles.length;
    } catch {
      return 0;
    }
  }

  private async checkPrerequisites(): Promise<OperationResult> {
    const errors: string[] = [];
    const info: string[] = [];

    // Check for Claude Code by looking for CLAUDE.md in project root
    const claudeMdPath = path.resolve('CLAUDE.md');
    const hasClaudeMd = await fs.pathExists(claudeMdPath);
    if (hasClaudeMd) {
      logger.info('Claude Code configuration detected (CLAUDE.md found)');
      info.push('✅ Claude Code is configured in this project');
    } else {
      logger.info('CLAUDE.md not found - Claude Code may not be configured');
      info.push('ℹ️  CLAUDE.md not found - consider adding Claude Code configuration');
    }

    // Check if AQE is already initialized
    const configPath = path.resolve('qe.config.json');
    const agentsPath = path.resolve('agents');
    const isInitialized = await fs.pathExists(configPath);
    const hasAgents = await fs.pathExists(agentsPath);

    if (isInitialized) {
      const config = await fs.readJson(configPath);
      info.push(`✅ AQE already initialized (version ${config.version})`);

      if (hasAgents) {
        const agentDirs = await fs.readdir(agentsPath);
        const agentCount = agentDirs.filter(dir => !dir.startsWith('.')).length;
        info.push(`✅ ${agentCount} agents found in project`);
      }
    }

    // Check for Claude-Flow
    try {
      const { exec } = require('child_process');
      const { promisify } = require('util');
      const execAsync = promisify(exec);

      // Check if claude-flow is installed
      await execAsync('npx claude-flow@alpha --version');
      logger.info('Claude-Flow is installed');
    } catch (error) {
      errors.push('Claude-Flow is not installed or not accessible');
      errors.push('Run: claude mcp add claude-flow npx claude-flow@alpha mcp start');
    }

    // Check Node.js version
    const nodeVersion = process.version;
    const majorVersion = parseInt(nodeVersion.slice(1).split('.')[0]);
    if (majorVersion < 18) {
      errors.push(`Node.js version ${nodeVersion} is too old. Requires v18.0.0 or higher`);
    }

    // Show info messages if any
    if (info.length > 0) {
      console.log(chalk.cyan('\n📋 Project Status:'));
      info.forEach(msg => console.log('  ' + msg));
      console.log();
    }

    return {
      success: errors.length === 0,
      message: errors.length === 0 ? 'All prerequisites met' : 'Prerequisites check failed',
      errors: errors.length > 0 ? errors : undefined,
      data: { hasClaudeMd, isInitialized, hasAgents }
    };
  }

  static register(program: Command): void {
    program
      .command('init')
      .description('Initialize the QE Framework')
      .option('-f, --force', 'Force initialization, overwriting existing config')
      .option('-t, --template <name>', 'Use initialization template')
      .option('--agents-path <path>', 'Custom agents directory path')
      .option('--claude-agents-path <path>', 'Custom Claude agents directory path')
      .option('--claude-commands-path <path>', 'Custom Claude commands directory path')
      .option('-i, --interactive', 'Interactive configuration')
      .option('--swarm-topology <topology>', 'Swarm topology (mesh|hierarchical|ring|star)')
      .option('--max-agents <number>', 'Maximum number of agents', parseInt)
      .action(async (options: InitOptions) => {
        const command = new InitCommand();
        const result = await command.execute(options);

        if (result.success) {
          console.log(chalk.green('✅'), result.message);
          if (result.data) {
            console.log(chalk.blue('📊 Summary:'));
            console.log(`  Agents loaded: ${result.data.agentsLoaded}`);
            console.log(`  Claude-Flow: ${result.data.claudeFlowEnabled ? 'Enabled' : 'Disabled'}`);
            console.log(`  Configuration: qe.config.json`);
          }
        } else {
          console.error(chalk.red('❌'), result.message);
          if (result.errors) {
            result.errors.forEach(error => console.error(chalk.red('  •'), error));
          }
          process.exit(1);
        }
      });
  }
}